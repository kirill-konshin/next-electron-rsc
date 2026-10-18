import { once } from 'node:events';
import { IncomingMessage } from 'node:http';
import { Socket } from 'node:net';
import { describe, expect, test } from 'vite-plus/test';

import { ReadableServerResponse } from './readableServerResponse.ts';

function createResponse(method = 'GET'): ReadableServerResponse {
    const req = new IncomingMessage(new Socket());
    req.method = method;
    return new ReadableServerResponse(req);
}

describe('headers', () => {
    test('keeps headers passed to writeHead, the reason and multiple values of a header', async () => {
        const res = createResponse();
        res.setHeader('set-cookie', ['a=1', 'b=2']);
        res.writeHead(201, 'Made', { 'content-type': 'text/plain', 'x-list': ['x', 'y'] });
        res.end();

        const response = await res.getResponse();

        expect(response.status).toBe(201);
        expect(response.statusText).toBe('Made');
        expect(response.headers.get('content-type')).toBe('text/plain');
        expect(response.headers.get('x-list')).toBe('x, y');
        expect(response.headers.getSetCookie()).toEqual(['a=1', 'b=2']);
    });

    test('starts the response on the first write with the status set before', async () => {
        const res = createResponse();
        res.statusCode = 202;
        res.setHeader('x-test', 'yes');
        res.end('ok');

        const response = await res.getResponse();

        expect(response.status).toBe(202);
        expect(response.headers.get('x-test')).toBe('yes');
        expect(await response.text()).toBe('ok');
    });
});

describe('body', () => {
    test('decodes string chunks with their encoding and ignores an empty end', async () => {
        const res = createResponse();
        res.write('aGk=', 'base64');
        res.write(Buffer.from(' there'));
        res.end();

        expect(await (await res.getResponse()).text()).toBe('hi there');
    });

    test.each([
        ['GET', 204],
        ['GET', 205],
        ['GET', 304],
        ['HEAD', 200],
    ])('has none for %s with %i', async (method, status) => {
        const res = createResponse(method);
        res.statusCode = status;
        res.end();

        const response = await res.getResponse();

        expect(response.status).toBe(status);
        expect(response.body).toBeNull();
    });

    test('is not buffered a second time by Node', async () => {
        const res = createResponse();
        res.write(Buffer.alloc(100_000));
        res.end(Buffer.alloc(100_000));

        expect((await (await res.getResponse()).arrayBuffer()).byteLength).toBe(200_000);
        expect(res.writableLength).toBeLessThan(1_000);
    });

    test('applies backpressure until the consumer reads', async () => {
        const res = createResponse();
        const first = res.write('a');
        const text = (await res.getResponse()).text();

        await once(res, 'drain');
        res.write('b');
        res.end();

        expect(first).toBe(false);
        expect(await text).toBe('ab');
    });

    test('ignores writes after the consumer cancelled', async () => {
        const res = createResponse();
        res.write('a');
        await (await res.getResponse()).body!.cancel();

        expect(() => {
            res.write('b');
            res.end('c');
        }).not.toThrow();
    });
});

describe('fail', () => {
    test('rejects the response before the headers', async () => {
        const res = createResponse();
        res.fail(new Error('before headers'));

        await expect(res.getResponse()).rejects.toThrow('before headers');
    });

    test('breaks the body off after the headers', async () => {
        const res = createResponse();
        res.write('partial');
        const response = await res.getResponse();

        res.fail(new Error('mid-stream'));

        expect(response.status).toBe(200);
        await expect(response.text()).rejects.toThrow('mid-stream');
    });
});
