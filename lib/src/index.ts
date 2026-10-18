import type { Protocol, Session } from 'electron';
import type { NextConfig, default as createServerNext } from 'next';
// import type { NextServer, NextServerOptions } from 'next/dist/server/next';

// type NextConfig = any;
type NextServer = ReturnType<typeof createServerNext>;
type NextServerOptions = Parameters<typeof createServerNext>[0];

import assert from 'node:assert';
import fs from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { parse } from 'node:url';
import resolve from 'resolve';

import { createRequest } from './createRequest.ts';
import { ReadableServerResponse } from './readableServerResponse.ts';
import { storeCookies } from './storeCookies.ts';

/** Exact origin match: a prefix match would also accept a longer port, e.g. `http://localhost:30001` for `:3000`. */
function isSameOrigin(url: string, origin: string): boolean {
    try {
        return new URL(url).origin === origin;
    } catch {
        return false;
    }
}

/**
 * https://nextjs.org/docs/pages/building-your-application/configuring/custom-server
 * https://github.com/vercel/next.js/pull/68167/files#diff-d0d8b7158bcb066cdbbeb548a29909fe8dc4e98f682a6d88654b1684e523edac
 * https://github.com/vercel/next.js/blob/canary/examples/custom-server/server.ts
 */
export function createHandler({
    protocol,
    debug = false,
    dev = process.env.NODE_ENV === 'development',
    hostname = 'localhost',
    port = 3000,
    dir,
    ...nextOptions
}: Omit<NextServerOptions, 'conf'> & {
    conf?: NextServerOptions['conf'];
    protocol: Protocol;
    debug?: boolean;
}): {
    localhostUrl: string;
    createInterceptor: ({ session }: { session: Session }) => Promise<() => void>;
} {
    assert(dir, 'dir is required');
    assert(protocol, 'protocol is required');
    assert(hostname, 'hostname is required');
    assert(port, 'port is required');

    dir = dev ? process.cwd() : dir;

    if (debug) {
        console.log('Next.js handler', { dev, dir, hostname, port, debug });
    }

    // Normalized the same way as `new URL(...).origin` of incoming requests
    const localhostUrl = new URL(`http://${hostname}:${port}`).origin;

    const serverOptions: Omit<NextServerOptions, 'conf'> = {
        ...nextOptions,
        dir,
        dev,
        hostname,
        port,
    };

    if (dev) {
        // `next dev` forks `start-server` with this flag (next/dist/cli/next-dev.js); in-process nothing sets it, and
        // since Next.js 16 route modules read it at construction (next/dist/server/route-modules/route-module.js) to
        // tell development from a build, otherwise they load `required-server-files.json` from the dev dist dir.
        process.env.__NEXT_DEV_SERVER = '1';

        // The public custom-server API, not `next/dist/server/lib/start-server` (why, and how to go back: AGENTS.md):
        // HMR works, `turbo` is honored, and a `next.config.*` change no longer exits Electron, the dev runner
        // restarts it instead.
        const next = require(resolve.sync('next', { basedir: dir }));
        const app = next(serverOptions) as NextServer;
        const handler = app.getRequestHandler();

        const preparePromise = (async () => {
            await app.prepare();
            await new Promise<void>((resolveListen, rejectListen) => {
                createServer((req, res) => {
                    void handler(req, res, parse(req.url!, true));
                })
                    .once('error', rejectListen)
                    .listen(port, hostname, () => resolveListen());
            });
        })();

        // Early exit before rest of prod stuff
        return {
            localhostUrl,
            createInterceptor: async ({ session }: { session: Session }) => {
                assert(session, 'Session is required');
                await preparePromise;
                if (debug) console.log(`Server Intercept Disabled, ${localhostUrl} is served by Next.js`);
                return () => {};
            },
        };
    }

    // Next.js fetches its own origin from the server, e.g. the page a Server Action redirects to. Over HTTP that
    // reaches the same server; here there is no TCP port, so requests to `localhostUrl` are served in-process once
    // the interceptor runs, and everything else passes through. Installed before `next()`, so Next.js layers its
    // own fetch patch (cache, dedupe) over this one exactly as it would over the native fetch.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : String(input);
        if (!interceptors.size || !isSameOrigin(url, localhostUrl)) return originalFetch(input, init);
        if (debug) console.log('[NEXT] In-process fetch', url);
        return serve(new Request(input, init));
    }) as typeof fetch;

    const next = require(resolve.sync('next', { basedir: dir }));

    // @see https://github.com/vercel/next.js/issues/64031#issuecomment-2078708340
    const config = require(path.join(dir, '.next', 'required-server-files.json')).config as NextConfig;
    process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify({ ...config, ...nextOptions?.conf });

    const app = next(serverOptions) as NextServer;

    const handler = app.getRequestHandler();

    const preparePromise = (async () => {
        try {
            await app.prepare();
        } catch (err) {
            console.error('Cannot prepare Next.js server', (err as Error).stack);
            throw err;
        }
    })();

    protocol.registerSchemesAsPrivileged([
        {
            scheme: 'http',
            privileges: {
                standard: true,
                secure: true,
                supportFetchAPI: true,
            },
        },
    ]);

    async function serve(request: Request, session?: Session): Promise<Response> {
        const req = await createRequest({ request, session });
        const res = new ReadableServerResponse(req);

        // Not awaited: the response starts with the headers, while Next.js may still be writing the body
        void (async () => {
            try {
                await handler(req, res, parse(req.url!, true));
            } catch (e) {
                res.fail(e);
            }
        })();

        const response = await res.getResponse();
        if (session) await storeCookies(session, request.url, response);
        return response;
    }

    // Several windows may share a session: it is intercepted once, and released when the last of them stops.
    const interceptors = new Map<Session, { count: number }>();

    async function createInterceptor({ session }: { session: Session }): Promise<() => void> {
        assert(session, 'Session is required');
        assert(dir && fs.existsSync(dir), 'dir does not exist');

        await preparePromise;

        if (!interceptors.has(session)) {
            if (debug) console.log(`Server Intercept Enabled, ${localhostUrl} will be intercepted by ${dir}`);

            // The session's own protocol: the global `protocol` only covers the default session.
            session.protocol.handle('http', async (request) => {
                if (!isSameOrigin(request.url, localhostUrl)) {
                    return new Response(
                        'External HTTP is not supported: use HTTPS, or fetch it from the Next.js server',
                        {
                            status: 403,
                            headers: { 'content-type': 'text/plain; charset=utf-8' },
                        },
                    );
                }

                try {
                    const response = await serve(request, session);

                    if (debug) console.log('[NEXT] Handler', request.url, response.status);
                    return response;
                } catch (e) {
                    if (debug) console.log('[NEXT] Error', e);
                    // Internals stay out of the page unless debugging
                    const message = debug && e instanceof Error ? e.message : 'Internal Server Error';
                    return new Response(message, { status: 500 });
                }
            });

            interceptors.set(session, { count: 0 });
        }

        const interceptor = interceptors.get(session)!;
        interceptor.count++;

        let isStopped = false;

        return function stopIntercept() {
            if (isStopped) return;
            isStopped = true;
            if (--interceptor.count) return;
            interceptors.delete(session);
            session.protocol.unhandle('http');
        };
    }

    return { createInterceptor, localhostUrl };
}
