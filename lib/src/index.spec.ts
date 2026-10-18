import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vite-plus/test';

import { createProtocol, createSession } from './electron.fixture.ts';
import { createHandler } from './index.ts';

// Requests go through a real Next.js build (see globalSetup.ts); nothing listens on this port.
const origin = 'http://localhost:39123';

describe('real Next.js app', () => {
    const { protocol } = createProtocol();
    const { createInterceptor } = createHandler({
        dev: false,
        dir: path.join(__dirname, '..', 'fixture'),
        protocol,
        port: 39123,
    });
    const { session, jar, request } = createSession();
    let stop: () => void;

    beforeAll(async () => {
        stop = await createInterceptor({ session });
    });

    afterAll(() => stop());

    test('renders a page', async () => {
        const response = await request(`${origin}/`);
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toContain('text/html');
        expect(await response.text()).toContain('Fixture page');
    });

    test('passes method, body, headers and raw cookies to a route handler', async () => {
        jar.splice(0, jar.length, { name: 'signed', value: 'abc%2Fdef%3D' });

        const response = await request(`${origin}/api/echo`, {
            method: 'POST',
            headers: { 'x-test': 'yes' },
            body: 'payload',
        });

        expect(await response.json()).toEqual({
            method: 'POST',
            body: 'payload',
            test: 'yes',
            cookie: 'signed=abc%2Fdef%3D',
        });
    });

    test('streams the response body', async () => {
        const response = await request(`${origin}/api/stream`);
        const chunks: string[] = [];
        const decoder = new TextDecoder();
        for await (const chunk of response.body!) chunks.push(decoder.decode(chunk));
        expect(chunks.join('')).toBe('abc');
        expect(chunks.length).toBeGreaterThan(1);
    });

    test('stores Set-Cookie in the session jar', async () => {
        jar.splice(0, jar.length, { name: 'gone', value: 'old' });
        const nowSeconds = Date.now() / 1000;

        const response = await request(`${origin}/api/cookies`);
        expect(response.status).toBe(200);

        const byName = Object.fromEntries(jar.map((cookie) => [cookie.name, cookie]));
        expect(Object.keys(byName).sort()).toEqual(['age', 'expires', 'signed']);
        expect(byName.age).toMatchObject({ value: '1', httpOnly: true, sameSite: 'lax' });
        expect(byName.age.expirationDate).toBeCloseTo(nowSeconds + 60, -1);
        expect(byName.expires.expirationDate).toBeCloseTo(nowSeconds + 60, -1);
        expect(byName.signed).toMatchObject({ value: 'abc%2Fdef%3D', sameSite: 'strict', expirationDate: undefined });
    });

    test('serves fetches of its own origin in-process', async () => {
        const response = await request(`${origin}/api/self`);
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ method: 'GET', test: 'self' });
    });

    test('returns 404 for unknown routes', async () => {
        expect((await request(`${origin}/missing`)).status).toBe(404);
    });

    test('blocks other origins', async () => {
        expect((await request('http://example.test/')).status).toBe(403);
    });
});
