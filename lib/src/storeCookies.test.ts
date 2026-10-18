import { describe, expect, test } from 'vite-plus/test';

import { type CookieDetails, createSession, type SessionFixture } from './electron.fixture.ts';
import { storeCookies } from './storeCookies.ts';

const url = 'http://localhost:3000/';

async function store(setCookie: string[], jar: CookieDetails[] = []): Promise<SessionFixture> {
    const fixture = createSession(jar);
    const headers = new Headers();
    for (const value of setCookie) headers.append('set-cookie', value);
    await storeCookies(fixture.session, url, new Response(null, { headers }));
    return fixture;
}

describe('expiry', () => {
    test('converts Max-Age to Electron seconds', async () => {
        const nowSeconds = Date.now() / 1000;

        const { jar } = await store(['a=1; Max-Age=60']);

        expect(jar[0].expirationDate).toBeCloseTo(nowSeconds + 60, -1);
    });

    test('converts Expires to Electron seconds', async () => {
        const expires = new Date(Date.now() + 60_000);

        const { jar } = await store([`a=1; Expires=${expires.toUTCString()}`]);

        expect(jar[0].expirationDate).toBe(Math.floor(expires.getTime() / 1000));
    });

    test('lets Max-Age win over Expires', async () => {
        const past = new Date(Date.now() - 60_000).toUTCString();
        const nowSeconds = Date.now() / 1000;

        const { jar } = await store([`a=1; Max-Age=60; Expires=${past}`]);

        expect(jar[0].expirationDate).toBeCloseTo(nowSeconds + 60, -1);
    });

    test('keeps a cookie without expiry as a session cookie', async () => {
        const { jar } = await store(['a=1']);

        expect(jar[0]).toMatchObject({ name: 'a', value: '1', expirationDate: undefined });
        expect(jar[0]).not.toHaveProperty('maxAge');
    });

    test.each(['old=; Max-Age=0', `old=; Expires=${new Date(0).toUTCString()}`])('deletes with %s', async (cookie) => {
        const { jar, mock } = await store([cookie], [{ name: 'old', value: 'x' }]);

        expect(jar).toEqual([]);
        expect(mock.cookies.remove).toHaveBeenCalledWith(url, 'old');
    });
});

describe('attributes', () => {
    test('stores the value as sent, without decoding it', async () => {
        const { jar } = await store(['signed=abc%2Fdef%3D']);

        expect(jar[0].value).toBe('abc%2Fdef%3D');
    });

    test('passes path, domain, secure and httpOnly for the response URL', async () => {
        const { mock } = await store(['a=1; Path=/app; Domain=localhost; Secure; HttpOnly']);

        expect(mock.cookies.set).toHaveBeenCalledWith(
            expect.objectContaining({ url, path: '/app', domain: 'localhost', secure: true, httpOnly: true }),
        );
    });

    test.each([
        ['None', 'no_restriction'],
        ['Lax', 'lax'],
        ['strict', 'strict'],
        ['Unknown', undefined],
    ])('maps SameSite=%s to %s', async (sameSite, expected) => {
        const { jar } = await store([`a=1; SameSite=${sameSite}`]);

        expect(jar[0].sameSite).toBe(expected);
    });
});

test('splits cookies a fetch implementation joined into one header', async () => {
    const { jar } = await store(['a=1; Expires=Wed, 21 Oct 2099 07:28:00 GMT, b=2']);

    expect(jar.map(({ name }) => name)).toEqual(['a', 'b']);
});

test('reports a jar failure', async () => {
    const { session, mock } = createSession();
    mock.cookies.set.mockRejectedValueOnce(new Error('jar broken'));

    await expect(storeCookies(session, url, new Response(null, { headers: { 'set-cookie': 'a=1' } }))).rejects.toThrow(
        'Failed to set cookies',
    );
});
