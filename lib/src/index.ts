import type { Protocol, Session } from 'electron';
import type { NextConfig, default as createServerNext } from 'next';
// import type { NextServer, NextServerOptions } from 'next/dist/server/next';

// type NextConfig = any;
type NextServer = ReturnType<typeof createServerNext>;
type NextServerOptions = Parameters<typeof createServerNext>[0];

import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { parse } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert';
// import { createServer } from 'node:http';

import resolve from 'resolve';
import { parse as parseCookie, splitCookiesString } from 'set-cookie-parser';
import { serialize as serializeCookie } from 'cookie';

async function createRequest({
    socket,
    request,
    session,
}: {
    socket: Socket;
    request: Request;
    session?: Session;
}): Promise<IncomingMessage> {
    const req = new IncomingMessage(socket);

    const url = new URL(request.url);

    // Normal Next.js URL does not contain schema and host/port, otherwise endless loops due to butchering of schema by normalizeRepeatedSlashes in resolve-routes
    req.url = url.pathname + (url.search || '');
    req.method = request.method;

    request.headers.forEach((value, key) => {
        req.headers[key] = value;
    });

    // Renderer requests leave cookies in the Electron session's jar; in-process fetches (no session) already carry
    // the cookie header the caller forwarded, like any HTTP client.
    if (session) {
        try {
            // @see https://github.com/electron/electron/issues/39525#issue-1852825052
            const cookies = await session.cookies.get({
                url: request.url,
                // domain: url.hostname,
                // path: url.pathname,
                // `secure: true` Cookies should not be sent via http
                // secure: url.protocol === 'http:' ? false : undefined,
                // theoretically not possible to implement sameSite because we don't know the url
                // of the website that is requesting the resource
            });

            if (cookies.length) {
                const cookiesHeader = [];

                for (const cookie of cookies) {
                    const { name, value, ...options } = cookie;
                    cookiesHeader.push(serializeCookie(name, value)); // ...(options as any)?
                }

                req.headers.cookie = cookiesHeader.join('; ');
            }
        } catch (e) {
            throw new Error('Failed to parse cookies', { cause: e });
        }
    }

    if (request.body) {
        req.push(Buffer.from(await request.arrayBuffer()));
    }

    req.push(null);
    req.complete = true;

    return req;
}

class ReadableServerResponse extends ServerResponse {
    private responsePromise: Promise<Response>;

    constructor(req: IncomingMessage) {
        super(req);

        this.responsePromise = new Promise<Response>((resolve, reject) => {
            // Closed by `end()`, or by the consumer cancelling (navigation, aborted fetch) like a dropped connection.
            let isClosed = false;

            const readableStream = new ReadableStream({
                start: (controller) => {
                    // `Response` bodies accept only bytes: `end()` often comes without a chunk (or with a callback),
                    // and Node allows string chunks with an encoding.
                    const onData = (chunk: unknown, encoding?: BufferEncoding) => {
                        if (isClosed) return;
                        const bytes =
                            typeof chunk === 'string'
                                ? Buffer.from(chunk, encoding)
                                : chunk instanceof Uint8Array
                                  ? chunk
                                  : undefined;
                        if (bytes?.length) controller.enqueue(bytes);
                    };

                    this.on('data', onData);

                    this.once('end', (chunk: unknown, encoding?: BufferEncoding) => {
                        onData(chunk, encoding);
                        this.off('data', onData);
                        if (isClosed) return;
                        isClosed = true;
                        controller.close();
                    });
                },
                pull: (controller) => {
                    this.emit('drain');
                },
                cancel: () => {
                    isClosed = true;
                },
            });

            this.once('writeHead', (statusCode) => {
                resolve(
                    new Response(readableStream, {
                        status: statusCode,
                        statusText: this.statusMessage,
                        headers: this.getHeaders() as any,
                    }),
                );
            });
        });
    }

    write(chunk: any, ...args): boolean {
        // A write after `end()` has nowhere to go; Node reports it through `super.write` as usual.
        if (!this.writableEnded) this.emit('data', chunk, typeof args[0] === 'string' ? args[0] : undefined);
        return super.write(chunk, ...args);
    }

    end(chunk?: any, ...args): this {
        if (!this.writableEnded) this.emit('end', chunk, typeof args[0] === 'string' ? args[0] : undefined);
        return super.end(chunk, ...args);
    }

    writeHead(statusCode: number, ...args: any): this {
        this.emit('writeHead', statusCode);
        return super.writeHead(statusCode, ...args);
    }

    getResponse() {
        return this.responsePromise;
    }
}

/** Mirrors a browser cookie jar: `Set-Cookie` from a response goes into the Electron session. */
async function storeCookies(session: Session, url: string, response: Response): Promise<void> {
    try {
        // @see https://github.com/electron/electron/issues/30717
        // @see https://github.com/electron/electron/issues/39525
        const cookies = parseCookie(
            response.headers.getSetCookie().reduce((r, c) => {
                // @see https://github.com/nfriedly/set-cookie-parser?tab=readme-ov-file#usage-in-react-native-and-with-some-other-fetch-implementations
                return [...r, ...splitCookiesString(c)];
            }, []),
        );

        for (const cookie of cookies) {
            const { name, value, path, domain, secure, httpOnly, expires, maxAge } = cookie;

            // Max-Age wins over Expires (RFC 6265 5.3), and `Max-Age=0` deletes, so 0 is not "absent".
            const expiresAtMs = maxAge !== undefined ? Date.now() + maxAge * 1000 : expires?.getTime();

            if (expiresAtMs !== undefined && expiresAtMs <= Date.now()) {
                await session.cookies.remove(url, cookie.name);
                continue;
            }

            await session.cookies.set({
                url,
                // Electron takes seconds since the UNIX epoch; undefined keeps it a session cookie.
                expirationDate: expiresAtMs === undefined ? undefined : expiresAtMs / 1000,
                name,
                value,
                path,
                domain,
                secure,
                httpOnly,
                maxAge,
            } as any);
        }
    } catch (e) {
        throw new Error('Failed to set cookies', { cause: e });
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

    const localhostUrl = `http://${hostname}:${port}`;

    const serverOptions: Omit<NextServerOptions, 'conf'> & { isDev: boolean } = {
        ...nextOptions,
        dir,
        dev,
        hostname,
        port,
        isDev: dev,
    };

    if (dev) {
        // `next dev` forks `start-server` with this flag (next/dist/cli/next-dev.js); in-process nothing sets it, and
        // since Next.js 16 route modules read it at construction (next/dist/server/route-modules/route-module.js) to
        // tell development from a build, otherwise they load `required-server-files.json` from the dev dist dir.
        process.env.__NEXT_DEV_SERVER = '1';
        //FIXME Closes window when restarting server
        const server = require(resolve.sync('next/dist/server/lib/start-server', { basedir: dir }));
        const preparePromise = server.startServer(serverOptions);

        //FIXME Not reloading by Next.js automatically, try Nodemon https://github.com/vercel/next.js/tree/canary/examples/custom-server
        // app.prepare().then(() => {
        //     createServer((req, res) => {
        //         try {
        //             const parsedUrl = parse(req.url!, true);
        //             handler(req, res, parsedUrl);
        //         } catch (err) {
        //             console.error('Error occurred handling', req.url, err);
        //             res.statusCode = 500;
        //             res.end('internal server error');
        //         }
        //     })
        //         .once('error', (err) => {
        //             console.error(err);
        //             rej(err);
        //         })
        //         .listen(port, () => {
        //             res();
        //             console.log(`> Server listening at ${localhostUrl}`);
        //         });
        // }).then(() => waitOn({resources: [localhostUrl]}).then(res);

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
    let serveOwnOrigin: ((request: Request) => Promise<Response>) | undefined;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : String(input);
        if (!serveOwnOrigin || !url.startsWith(`${localhostUrl}/`)) return originalFetch(input, init);
        if (debug) console.log('[NEXT] In-process fetch', url);
        return serveOwnOrigin(new Request(input, init));
    }) as typeof fetch;

    const next = require(resolve.sync('next', { basedir: dir }));

    // @see https://github.com/vercel/next.js/issues/64031#issuecomment-2078708340
    const config = require(path.join(dir, '.next', 'required-server-files.json')).config as NextConfig;
    process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify({ ...config, ...nextOptions?.conf });

    const app = next(serverOptions) as NextServer;

    const handler = app.getRequestHandler();

    const preparePromise = app.prepare().catch((err: Error) => {
        console.error('Cannot prepare Next.js server', err.stack);
        throw err;
    });

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

    async function createInterceptor({ session }: { session: Session }) {
        assert(session, 'Session is required');
        assert(fs.existsSync(dir), 'dir does not exist');

        if (debug) console.log(`Server Intercept Enabled, ${localhostUrl} will be intercepted by ${dir}`);

        const socket = new Socket();

        const closeSocket = () => socket.end();

        process.on('SIGTERM', closeSocket);
        process.on('SIGINT', closeSocket);

        await preparePromise;

        const serve = async (request: Request, session?: Session): Promise<Response> => {
            const req = await createRequest({ socket, request, session });
            const res = new ReadableServerResponse(req);

            handler(req, res, parse(req.url, true)); //TODO Try/catch?

            const response = await res.getResponse();
            if (session) await storeCookies(session, request.url, response);
            return response;
        };

        serveOwnOrigin = (request) => serve(request);

        protocol.handle('http', async (request) => {
            try {
                assert(request.url.startsWith(localhostUrl), 'External HTTP not supported, use HTTPS');

                const response = await serve(request, session);

                if (debug) console.log('[NEXT] Handler', request.url, response.status);
                return response;
            } catch (e) {
                if (debug) console.log('[NEXT] Error', e);
                return new Response(e.message, { status: 500 });
            }
        });

        return function stopIntercept() {
            serveOwnOrigin = undefined;
            protocol.unhandle('http');
            process.off('SIGTERM', closeSocket);
            process.off('SIGINT', closeSocket);
            closeSocket();
        };
    }

    return { createInterceptor, localhostUrl };
}
