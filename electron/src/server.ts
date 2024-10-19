import type { ProtocolRequest, ProtocolResponse } from 'electron';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { Buffer } from 'node:buffer';
import resolve from 'resolve';
import { parse } from 'url';

class ReadableResponse extends ServerResponse {
    private chunks = [];
    promiseResolvers = (Promise as any).withResolvers();

    constructor(socket: IncomingMessage) {
        super(socket);
    }

    private appendChunk(chunk: string | Buffer) {
        if (chunk) this.chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }

    write(chunk: any, ...args: any[]) {
        this.appendChunk(chunk);
        return super.write(chunk, ...args);
    }

    end(chunk: any, ...args: any[]) {
        this.appendChunk(chunk);
        this.promiseResolvers.resolve();
        return super.end(chunk, ...args);
    }

    get body() {
        return Buffer.concat(this.chunks);
    }
}

export function createHandler({ config: conf, nextPath: dir }) {
    const NextServer = require(resolve.sync('next/dist/server/next-server', { basedir: dir })).default;

    const app = new NextServer({
        dir,
        dev: false,
        customServer: false,
        conf,
    });

    const handler = app.getRequestHandler();

    const preparePromise = app.prepare();

    return async (origReq: ProtocolRequest): Promise<ProtocolResponse> => {
        let socket;
        try {
            await preparePromise;

            const url = new URL(origReq.url);

            socket = new Socket({ readable: true, writable: true });

            const req = new IncomingMessage(socket);

            req.url = url.pathname + url.search;
            req.method = origReq.method;
            req.headers = origReq.headers;

            origReq.uploadData?.forEach((item) => {
                if (!item.bytes) return;
                req.push(item.bytes);
            });

            req.push(null);

            const res = new ReadableResponse(req);

            handler(req, res, parse(req.url, true));

            await res.promiseResolvers.promise;

            return {
                statusCode: res.statusCode,
                mimeType: res.getHeader('content-type').toString().split(';')[0] as any,
                data: res.body,
                headers: res.getHeaders() as any,
            };
        } catch (e) {
            return e;
        } finally {
            socket?.end();
        }
    };
}
