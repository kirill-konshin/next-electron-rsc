import type { Protocol, Session } from 'electron';
import type { NextConfig } from 'next';
import type NextNodeServer from 'next/dist/server/next-server';

import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import resolve from 'resolve';
import { parse } from 'url';
import path from 'path';
import fs from 'fs';
import { parse as parseCookie, splitCookiesString } from 'set-cookie-parser';
import { serialize as serializeCookie } from 'cookie';
import assert = require('node:assert');

async function createRequest({
    socket,
    origReq,
    session,
}: {
    socket: Socket;
    origReq: Request;
    session: Session;
}): Promise<IncomingMessage> {
    const req = new IncomingMessage(socket);

    const url = new URL(origReq.url);

    // Normal Next.js URL does not contain schema and host/port, otherwise endless loops due to butchering of schema by normalizeRepeatedSlashes in resolve-routes
    req.url = url.pathname + (url.search || '');
    req.method = origReq.method;

    origReq.headers.forEach((value, key) => {
        req.headers[key] = value;
    });

    // @see https://github.com/electron/electron/issues/39525#issue-1852825052
    const cookies = await session.cookies.get({
        url: origReq.url,
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

    if (origReq.body) {
        req.push(Buffer.from(await origReq.arrayBuffer()));
    }

    req.push(null);
    req.complete = true;

    return req;
}

class ReadableServerResponse extends ServerResponse {
    write(chunk: any, ...args): boolean {
        this.emit('data', chunk);
        return super.write(chunk, ...args);
    }

    end(chunk: any, ...args): this {
        this.emit('end', chunk);
        return super.end(chunk, ...args);
    }

    writeHead(statusCode: number, ...args: any): this {
        this.emit('writeHead', statusCode);
        return super.writeHead(statusCode, ...args);
    }

    getResponse() {
        return new Promise<Response>((resolve, reject) => {
            const readableStream = new ReadableStream({
                start: (controller) => {
                    let onData;

                    this.on(
                        'data',
                        (onData = (chunk) => {
                            controller.enqueue(chunk);
                        }),
                    );

                    this.once('end', (chunk) => {
                        controller.enqueue(chunk);
                        controller.close();
                        this.off('data', onData);
                    });
                },
                pull: (controller) => {
                    this.emit('drain');
                },
                cancel: () => {},
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
}

/**
 * https://nextjs.org/docs/pages/building-your-application/configuring/custom-server
 * https://github.com/vercel/next.js/pull/68167/files#diff-d0d8b7158bcb066cdbbeb548a29909fe8dc4e98f682a6d88654b1684e523edac
 * https://github.com/vercel/next.js/blob/canary/examples/custom-server/server.ts
 *
 * @param {string} standaloneDir
 * @param {string} localhostUrl
 * @param {import('electron').Protocol} protocol
 * @param {boolean} debug
 */
export function createHandler({
    standaloneDir,
    localhostUrl = 'http://localhost:3000',
    protocol,
    debug = false,
}: {
    standaloneDir: string;
    localhostUrl: string;
    protocol: Protocol;
    debug?: boolean;
}) {
    assert(standaloneDir, 'standaloneDir is required');
    assert(protocol, 'protocol is required');

    assert(fs.existsSync(standaloneDir), 'standaloneDir does not exist');

    const next = require(resolve.sync('next', { basedir: standaloneDir }));

    // @see https://github.com/vercel/next.js/issues/64031#issuecomment-2078708340
    const config = require(path.join(standaloneDir, '.next', 'required-server-files.json')).config as NextConfig;
    process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(config);

    const app = next({
        dev: false,
        dir: standaloneDir,
    }) as NextNodeServer;

    const handler = app.getRequestHandler();

    const preparePromise = app.prepare();

    let socket;

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

    //TODO Return function to close socket
    process.on('SIGTERM', () => socket.end());
    process.on('SIGINT', () => socket.end());

    /**
     * @param {import('electron').Session} session
     * @returns {() => void}
     */
    function createInterceptor({ session }: { session: Session }) {
        assert(session, 'Session is required');

        socket = new Socket();

        protocol.handle('http', async (request) => {
            try {
                if (!request.url.startsWith(localhostUrl)) {
                    if (debug) console.log('[NEXT] External HTTP not supported', request.url);
                    throw new Error('External HTTP not supported, use HTTPS');
                }

                if (!socket) throw new Error('Socket is not initialized, check if createInterceptor was called');

                await preparePromise;

                const req = await createRequest({ socket, origReq: request, session });
                const res = new ReadableServerResponse(req);
                const url = parse(req.url, true);

                handler(req, res, url);

                const response = await res.getResponse();

                // @see https://github.com/electron/electron/issues/30717
                // @see https://github.com/electron/electron/issues/39525
                const cookies = parseCookie(
                    response.headers.getSetCookie().reduce((r, c) => {
                        // @see https://github.com/nfriedly/set-cookie-parser?tab=readme-ov-file#usage-in-react-native-and-with-some-other-fetch-implementations
                        return [...r, ...splitCookiesString(c)];
                    }, []),
                );

                for (const cookie of cookies) {
                    const expires = cookie.expires
                        ? cookie.expires.getTime()
                        : cookie.maxAge
                          ? Date.now() + cookie.maxAge * 1000
                          : undefined;

                    if (expires < Date.now()) {
                        await session.cookies.remove(request.url, cookie.name);
                        continue;
                    }

                    await session.cookies.set({
                        name: cookie.name,
                        value: cookie.value,
                        path: cookie.path,
                        domain: cookie.domain,
                        secure: cookie.secure,
                        httpOnly: cookie.httpOnly,
                        url: request.url,
                        expirationDate: expires,
                    } as any);
                }

                if (debug) console.log('[NEXT] Handler', request.url, response.status);
                return response;
            } catch (e) {
                if (debug) console.log('[NEXT] Error', e);
                return new Response(e.message, { status: 500 });
            }
        });

        return () => {
            protocol.unhandle('http');
            socket.end();
        };
    }

    return { createInterceptor };
}
