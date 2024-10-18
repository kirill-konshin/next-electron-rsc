import type { ProtocolRequest, ProtocolResponse } from 'electron';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { Buffer } from 'node:buffer';
import { parse } from 'url';

const NextServer = require('next/dist/server/next-server').default;

const { config: conf, standalonePath: dir } = global as any;

const nextServer = new NextServer({
    dir,
    dev: false,
    customServer: false,
    conf,
});

const handler = nextServer.getRequestHandler();

class ReadableResponse extends ServerResponse {
    _chunks = [];

    constructor(socket: IncomingMessage) {
        super(socket);
    }

    _appendChunk(chunk: string | Buffer) {
        if (chunk) this._chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }

    write(chunk: any, ...args: any[]) {
        this._appendChunk(chunk);
        return super.write(chunk, ...args);
    }

    end(chunk: any, ...args: any[]) {
        this._appendChunk(chunk);
        return super.end(chunk, ...args);
    }

    get body() {
        return Buffer.concat(this._chunks);
    }
}

exports.handleRequest = async (origReq: ProtocolRequest): Promise<ProtocolResponse> => {
    const url = new URL(origReq.url);

    const prefix = `[NEXT] Request [${url.pathname}]`;

    console.log(prefix);

    const socket = new Socket({ readable: true, writable: true });

    try {
        const socket = new Socket({ readable: true, writable: true });

        const req = new IncomingMessage(socket);

        req.url = url.pathname + url.search;
        req.method = origReq.method;
        req.headers = origReq.headers;

        if (origReq.uploadData) {
            origReq.uploadData.forEach((item) => {
                if (!item.bytes) return;
                req.push(item.bytes);
            });
            req.push(null); // Indicate end of stream
        }

        const res = new ReadableResponse(req);

        const parsedUrl = parse('http://localhost:3000' + req.url, true);

        console.log(prefix, 'HANDLER CALL', parsedUrl);

        await handler(req, res, parsedUrl);

        console.log(prefix, 'BODY', res.body, res.getHeader('content-type'));

        return {
            statusCode: res.statusCode,
            mimeType: res.getHeader('content-type').toString().split(';')[0] as any,
            data: res.body,
        };
    } catch (e) {
        return e;
    } finally {
        socket.end();
    }
};
