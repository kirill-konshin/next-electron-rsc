import type { ProtocolRequest, ProtocolResponse } from 'electron';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import resolve from 'resolve';
import { parse } from 'url';

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

export function createHandler({ config: conf, nextPath: dir }) {
    const NextServer = require(resolve.sync('next/dist/server/next-server', { basedir: dir })).default;

    const app = new NextServer({ dir, conf });

    const handler = app.getRequestHandler();

    const preparePromise = app.prepare();

    return async (origReq: ProtocolRequest): Promise<ProtocolResponse> => {
        let socket: Socket;

        try {
            await preparePromise;

            const url = parse(origReq.url, true);

            socket = new Socket();

            const req = new IncomingMessage(socket);

            req.url = url.pathname + url.search;
            req.method = origReq.method;
            req.headers = origReq.headers;

            origReq.uploadData?.forEach((item) => {
                if (!item.bytes) return;
                req.push(item.bytes);
            });

            req.push(null);

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
    };
}
