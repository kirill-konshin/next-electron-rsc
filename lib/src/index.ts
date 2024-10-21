import { Protocol, ProtocolRequest, ProtocolResponse } from 'electron';
import type { NextConfig } from 'next';

import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import resolve from 'resolve';
import { parse } from 'url';
import path from 'path';
import fs from 'fs';

const staticPrefx = '/_next/static';

class ReadableServerResponse extends ServerResponse {
    private chunks: Buffer[] = [];
    private promiseResolvers = Promise.withResolvers<Buffer>();

    constructor(socket: IncomingMessage) {
        super(socket);
    }

    private appendChunk(chunk: string | Buffer) {
        if (!chunk) return;
        this.chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }

    write(chunk: any, ...args: any[]) {
        this.appendChunk(chunk);
        return super.write(chunk, ...args);
    }

    end(chunk: any, ...args: any[]) {
        this.appendChunk(chunk);
        this.promiseResolvers.resolve(Buffer.concat(this.chunks));
        return super.end(chunk, ...args);
    }

    get data() {
        return this.promiseResolvers.promise;
    }
}

function createRequest({ socket, origReq }: { socket: Socket; origReq: ProtocolRequest }): IncomingMessage {
    const req = new IncomingMessage(socket);

    const url = parse(origReq.url, false);

    req.url = url.pathname + url.search;
    req.method = origReq.method;
    req.headers = origReq.headers;

    origReq.uploadData?.forEach((item) => {
        if (!item.bytes) return;
        req.push(item.bytes);
    });

    req.push(null);

    return req;
}

/**
 * @param standaloneDir
 * @param staticDir
 * @param localhostUrl
 * @param protocol
 */
export function createHandler({
    standaloneDir,
    staticDir,
    localhostUrl = 'http://localhost:3000',
    protocol,
    debug = false,
}: {
    standaloneDir: string;
    staticDir: string;
    localhostUrl: string;
    protocol: Protocol;
    debug?: boolean;
}) {
    const NextServer = require(resolve.sync('next/dist/server/next-server', { basedir: standaloneDir })).default;

    const config = require(path.join(standaloneDir, '.next', 'required-server-files.json')).config as NextConfig;

    const app = new NextServer({
        dir: standaloneDir,
        conf: config,
        minimalMode: true,
    });

    const handler = app.getRequestHandler();

    const preparePromise = app.prepare();

    const socket = new Socket();

    //TODO Return function to close socket
    process.on('SIGTERM', () => socket.end());
    process.on('SIGINT', () => socket.end());

    async function handleRequest(origReq: ProtocolRequest): Promise<ProtocolResponse> {
        try {
            await preparePromise;

            const req = createRequest({ socket, origReq });
            const res = new ReadableServerResponse(req);
            const url = parse(origReq.url, true);

            handler(req, res, url);

            // Wait for the response to be fully written to read headers
            const data = await res.data;

            return {
                statusCode: res.statusCode,
                mimeType: res.getHeader('Content-Type') as any, // .toString().split(';')[0]
                headers: res.getHeaders() as any,
                data,
            };
        } catch (e) {
            return e;
        }
    }

    function handleStatic(request: ProtocolRequest): ProtocolResponse | Buffer {
        if (!request.url.startsWith(localhostUrl + staticPrefx)) throw new Error('Invalid URL');

        const filePath = path.join(
            staticDir,
            decodeURIComponent(parse(request.url, false).pathname).replace(staticPrefx, ''),
        );

        if (!fs.existsSync(filePath)) throw new Error('File not found');

        // return {path: filePath}; //FIXME This is not working in interceptBufferProtocol
        return fs.readFileSync(filePath);
    }

    function createInterceptor(): boolean {
        return protocol.interceptBufferProtocol('http', async (request, callback) => {
            if (!request.url.includes(localhostUrl)) return;

            if (request.url.includes(staticPrefx)) {
                const response = handleStatic(request);
                if (debug) console.log('[NEXT] Static', request.url);
                return callback(response);
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
    }

    return { createInterceptor };
}
