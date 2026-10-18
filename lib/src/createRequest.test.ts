import type { IncomingMessage } from 'node:http';
import { describe, expect, test } from 'vite-plus/test';

import { createRequest } from './createRequest.ts';
import { createSession } from './electron.fixture.ts';

async function readBody(req: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    return Buffer.concat(chunks).toString();
}

test('passes path with query, method, headers and body', async () => {
    const req = await createRequest({
        request: new Request('http://localhost:3000/items?q=1', {
            method: 'PUT',
            headers: { 'x-test': 'yes' },
            body: 'payload',
        }),
    });

    expect(req.url).toBe('/items?q=1');
    expect(req.method).toBe('PUT');
    expect(req.headers['x-test']).toBe('yes');
    expect(await readBody(req)).toBe('payload');
});

test('ends a request without a body', async () => {
    const req = await createRequest({ request: new Request('http://localhost:3000/') });

    expect(req.complete).toBe(true);
    expect(await readBody(req)).toBe('');
});

test('gives each request its own socket', async () => {
    const request = () => createRequest({ request: new Request('http://localhost:3000/') });

    const [first, second] = await Promise.all([request(), request()]);

    expect(first.socket).not.toBe(second.socket);
});

describe('cookies', () => {
    test('sends the jar values as stored, without encoding them again', async () => {
        const { session, mock } = createSession([
            { name: 'signed', value: 'abc%2Fdef%3D' },
            { name: 'plain', value: 'x' },
        ]);

        const req = await createRequest({ request: new Request('http://localhost:3000/page'), session });

        expect(req.headers.cookie).toBe('signed=abc%2Fdef%3D; plain=x');
        expect(mock.cookies.get).toHaveBeenCalledWith({ url: 'http://localhost:3000/page' });
    });

    test('keeps the forwarded cookie header when there is no session', async () => {
        const req = await createRequest({
            request: new Request('http://localhost:3000/', { headers: { cookie: 'a=1' } }),
        });

        expect(req.headers.cookie).toBe('a=1');
    });

    test('reports a jar failure', async () => {
        const { session, mock } = createSession();
        mock.cookies.get.mockRejectedValueOnce(new Error('jar broken'));

        await expect(createRequest({ request: new Request('http://localhost:3000/'), session })).rejects.toThrow(
            'Failed to parse cookies',
        );
    });
});
