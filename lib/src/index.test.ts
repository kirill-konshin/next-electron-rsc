import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, onTestFinished, test, vi } from 'vite-plus/test';

import { createProtocol, createSession } from './electron.fixture.ts';
import { createHandler } from './index.ts';

type NextHandler = (req: IncomingMessage, res: ServerResponse) => unknown;

/** A stand-in for the `next` package, so each test decides how the request handler behaves. */
function createStubApp(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'next-electron-rsc-'));
    const nextDir = path.join(dir, 'node_modules', 'next');
    fs.mkdirSync(nextDir, { recursive: true });
    fs.writeFileSync(path.join(nextDir, 'package.json'), JSON.stringify({ name: 'next', main: 'index.js' }));
    fs.writeFileSync(
        path.join(nextDir, 'index.js'),
        'module.exports = () => ({ prepare: async () => {}, getRequestHandler: () => (req, res) => globalThis.__stubNextHandler(req, res) });',
    );
    fs.mkdirSync(path.join(dir, '.next'));
    fs.writeFileSync(path.join(dir, '.next', 'required-server-files.json'), JSON.stringify({ config: {} }));
    return dir;
}

const dir = createStubApp();
let nextHandler: NextHandler;
(globalThis as any).__stubNextHandler = (req: IncomingMessage, res: ServerResponse) => nextHandler(req, res);

// The handler patches `fetch`; whatever it falls back to is this stub, so no test reaches the network.
const nativeFetch = globalThis.fetch;
const networkFetch = vi.fn(async (_input: RequestInfo | URL) => new Response('network'));
globalThis.fetch = networkFetch as typeof fetch;

const origin = 'http://localhost:3912';
const { protocol, mock: protocolMock } = createProtocol();
const { createInterceptor, localhostUrl } = createHandler({ dev: false, dir, protocol, port: 3912 });
// Vitest clears mock calls before each test
const registeredSchemes = protocolMock.registerSchemesAsPrivileged.mock.calls.map(([schemes]) => schemes);

const debugOrigin = 'http://localhost:3913';
const { createInterceptor: createDebugInterceptor } = createHandler({
    dev: false,
    dir,
    protocol,
    port: 3913,
    debug: true,
});

afterAll(() => {
    globalThis.fetch = nativeFetch;
    fs.rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
    nextHandler = (req, res) => res.end('ok');
});

test('registers the http scheme as privileged and normalizes the origin', () => {
    expect(localhostUrl).toBe(origin);
    expect(registeredSchemes).toEqual([[expect.objectContaining({ scheme: 'http' })]]);
});

describe('protocol handler', () => {
    test.each([
        // a prefix match would accept a longer port
        'http://localhost:39120/',
        'http://example.test/',
        'https://localhost:3912/',
    ])('blocks %s with 403', async (url) => {
        const { session, request } = createSession();
        onTestFinished(await createInterceptor({ session }));
        nextHandler = vi.fn();

        const response = await request(url);

        expect(response.status).toBe(403);
        expect(await response.text()).toContain('fetch it from the Next.js server');
        expect(nextHandler).not.toHaveBeenCalled();
    });

    test('serves Next.js with the session cookies and stores the ones it sets', async () => {
        const { session, jar, request } = createSession([{ name: 'in', value: 'abc%2F' }]);
        onTestFinished(await createInterceptor({ session }));
        nextHandler = (req, res) => {
            res.setHeader('set-cookie', 'out=1; Max-Age=60');
            res.end(`${req.method} ${req.url} ${req.headers.cookie}`);
        };

        const response = await request(`${origin}/items?q=1`, { method: 'POST', body: 'x' });

        expect(await response.text()).toBe('POST /items?q=1 in=abc%2F');
        expect(jar.map(({ name }) => name)).toEqual(['in', 'out']);
    });

    test('returns a generic 500 when Next.js fails before the headers', async () => {
        const { session, request } = createSession();
        onTestFinished(await createInterceptor({ session }));
        nextHandler = async () => {
            throw new Error('secret details');
        };

        const response = await request(`${origin}/`);

        expect(response.status).toBe(500);
        expect(await response.text()).toBe('Internal Server Error');
    });

    test('returns a generic 500 when the jar fails', async () => {
        const { session, mock, request } = createSession();
        mock.cookies.get.mockRejectedValueOnce(new Error('jar broken'));
        onTestFinished(await createInterceptor({ session }));

        const response = await request(`${origin}/`);

        expect(response.status).toBe(500);
        expect(await response.text()).toBe('Internal Server Error');
    });

    test('shows the error message with debug', async () => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        onTestFinished(() => {
            vi.restoreAllMocks();
        });
        const { session, request } = createSession();
        onTestFinished(await createDebugInterceptor({ session }));
        nextHandler = async () => {
            throw new Error('details for debugging');
        };

        const response = await request(`${debugOrigin}/`);

        expect(response.status).toBe(500);
        expect(await response.text()).toBe('details for debugging');
    });
});

describe('interceptors', () => {
    test('handle the given session, not the default one', async () => {
        const first = createSession();
        const second = createSession();

        const stopFirst = await createInterceptor({ session: first.session });
        const stopSecond = await createInterceptor({ session: second.session });
        onTestFinished(() => (stopFirst(), stopSecond()));

        expect(first.isHandled()).toBe(true);
        expect(second.isHandled()).toBe(true);
        expect(protocolMock.handle).not.toHaveBeenCalled();

        stopFirst();
        expect(first.isHandled()).toBe(false);
        expect(second.isHandled()).toBe(true);
    });

    test('share one handler per session until the last one stops', async () => {
        const { session, mock, isHandled } = createSession();

        const stopFirst = await createInterceptor({ session });
        const stopSecond = await createInterceptor({ session });
        onTestFinished(() => (stopFirst(), stopSecond()));
        expect(mock.protocol.handle).toHaveBeenCalledTimes(1);

        stopFirst();
        stopFirst();
        expect(isHandled()).toBe(true);

        stopSecond();
        expect(isHandled()).toBe(false);
        expect(mock.protocol.unhandle).toHaveBeenCalledTimes(1);
    });
});

test('serves fetches of its own origin in-process while an interceptor is active', async () => {
    nextHandler = (req, res) => res.end(`next ${req.url}`);

    await fetch(`${origin}/before`);
    expect(networkFetch).toHaveBeenCalledTimes(1);

    const { session } = createSession();
    const stop = await createInterceptor({ session });
    onTestFinished(stop);

    expect(await (await fetch(`${origin}/inside`)).text()).toBe('next /inside');
    expect(await (await fetch(origin)).text()).toBe('next /');
    expect(await (await fetch('http://example.test/')).text()).toBe('network');
    expect(await (await fetch('http://localhost:39120/')).text()).toBe('network');

    stop();

    await fetch(`${origin}/after`);
    expect(networkFetch).toHaveBeenCalledTimes(4);
});
