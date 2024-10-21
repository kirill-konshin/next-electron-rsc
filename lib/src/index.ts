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

export function createHandler({
    config,
    nextPath,
    staticPath,
    localhostUrl = 'http://localhost:3000',
    protocol,
}: {
    config: NextConfig;
    nextPath: string;
    staticPath: string;
    localhostUrl: string;
    protocol: Protocol;
}) {
    const NextServer = require(resolve.sync('next/dist/server/next-server', { basedir: nextPath })).default;

    const app = new NextServer({ dir: nextPath, conf: config });

    const handler = app.getRequestHandler();

    const preparePromise = app.prepare();

    async function handleRequest(origReq: ProtocolRequest): Promise<ProtocolResponse> {
        let socket: Socket;

        try {
            await preparePromise;

            const url = parse(origReq.url, true);

            socket = new Socket();

            const req = createRequest({ socket, origReq });

            const res = new ReadableServerResponse(req);

            handler(req, res, url);

            // Wait for the response to be fully written to read headers
            const data = await res.data;

            return {
                statusCode: res.statusCode,
                mimeType: res.getHeader('Content-Type').toString().split(';')[0] as any,
                data,
                headers: res.getHeaders() as any,
            };
        } catch (e) {
            return e;
        } finally {
            socket?.end();
        }
    }

    function handleStatic(request: ProtocolRequest): ProtocolResponse | Buffer {
        if (!request.url.startsWith(localhostUrl + staticPrefx)) throw new Error('Invalid URL');

        const filePath = path.join(
            staticPath,
            decodeURIComponent(parse(request.url, false).pathname).replace(staticPrefx, ''),
        );

        if (!fs.existsSync(filePath)) throw new Error('File not found');

        // return {path: filePath}; //FIXME: This is not working
        return fs.readFileSync(filePath);
    }

    function createInterceptor(): boolean {
        return protocol.interceptBufferProtocol('http', async (request, callback) => {
            if (!request.url.includes(localhostUrl)) return;

            if (request.url.includes(staticPrefx)) {
                const response = handleStatic(request);
                console.log('[NEXT] Static', response);
                return callback(response);
            }

            try {
                const response = await handleRequest(request);
                console.log('[NEXT] Handler', request.url, response.statusCode, response.mimeType);
                callback(response);
            } catch (e) {
                console.log('[NEXT] Error', e);
                callback(e);
            }
        });
    }

    return { handleRequest, handleStatic, createInterceptor };
}
