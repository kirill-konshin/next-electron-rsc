import type { Protocol, ProtocolRequest, ProtocolResponse } from 'electron';
import type { NextConfig } from 'next';
import type NextNodeServer from 'next/dist/server/next-server';

import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import http from 'node:http';
import https from 'node:https';
import resolve from 'resolve';
import { parse } from 'url';
import path from 'path';
import { PassThrough } from 'node:stream';

function createRequest({ socket, origReq }: { socket: Socket; origReq: ProtocolRequest }): IncomingMessage {
    const req = new IncomingMessage(socket);

    const url = parse(origReq.url, false);

    // Normal Next.js URL does not contain schema and host/port, otherwise endless loops due to butchering of schema by normalizeRepeatedSlashes in resolve-routes
    req.url = url.pathname + (url.search || '');
    req.method = origReq.method;
    req.headers = origReq.headers;

    origReq.uploadData?.forEach((item) => {
        if (!item.bytes) return;
        req.push(item.bytes);
    });

    req.push(null);
    req.complete = true;

    return req;
}

class ReadableServerResponse extends ServerResponse {
    private passThrough = new PassThrough();
    private promiseResolvers = Promise.withResolvers<ProtocolResponse>(); // there is no event for writeHead

    constructor(req: IncomingMessage) {
        super(req);
        this.write = this.passThrough.write.bind(this.passThrough);
        this.end = this.passThrough.end.bind(this.passThrough);
        this.passThrough.on('drain', () => this.emit('drain'));
    }

    writeHead(statusCode: number, ...args: any): this {
        super.writeHead(statusCode, ...args);

        this.promiseResolvers.resolve({
            statusCode: this.statusCode,
            mimeType: this.getHeader('Content-Type') as any,
            headers: this.getHeaders() as any,
            data: this.passThrough as any,
        });

        return this;
    }

    async createProtocolResponse() {
        return this.promiseResolvers.promise;
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

    //TODO Return function to close socket
    process.on('SIGTERM', () => socket.end());
    process.on('SIGINT', () => socket.end());

    async function handleRequest(origReq: ProtocolRequest): Promise<ProtocolResponse> {
        try {
            if (!socket) throw new Error('Socket is not initialized, check if createInterceptor was called');

            await preparePromise;

            const req = createRequest({ socket, origReq });
            const res = new ReadableServerResponse(req);
            const url = parse(req.url, true);

            handler(req, res, url);

            return await res.createProtocolResponse();
        } catch (e) {
            return e;
        }
    }

    function createInterceptor() {
        socket = new Socket();

        protocol.interceptStreamProtocol('http', async (request, callback) => {
            if (!request.url.startsWith(localhostUrl)) {
                const protocol = (request.url.startsWith('https') ? https : http) as any;

                const req = protocol.request(
                    {
                        method: request.method,
                        headers: request.headers,
                        url: request.url,
                    },
                    callback,
                );

                request.uploadData?.forEach((item) => {
                    if (!item.bytes) return;
                    req.write(item.bytes);
                });

                req.end();

                return;
            }

            try {
                const response = await handleRequest(request);
                if (debug) console.log('[NEXT] Handler', request.url, response.statusCode, response.mimeType);
                callback(response);
            } catch (e) {
                if (debug) console.log('[NEXT] Error', e);
                callback(e);
            }
        });

        return () => {
            protocol.uninterceptProtocol('http');
            socket.end();
        };
    }

    return { createInterceptor };
}
