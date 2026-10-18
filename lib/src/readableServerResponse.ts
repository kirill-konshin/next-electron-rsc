import { type IncomingMessage, type OutgoingHttpHeader, type OutgoingHttpHeaders, ServerResponse } from 'node:http';

/** Node keeps multiple values (e.g. `Set-Cookie`) as an array; a plain object init would join them with commas. */
function toHeaders(outgoing: OutgoingHttpHeaders): Headers {
    const headers = new Headers();
    for (const [name, value] of Object.entries(outgoing)) {
        if (value === undefined) continue;
        for (const item of Array.isArray(value) ? value : [value]) headers.append(name, String(item));
    }
    return headers;
}

export class ReadableServerResponse extends ServerResponse {
    private responsePromise: Promise<Response>;
    private controller!: ReadableStreamDefaultController<Uint8Array>;
    readonly fail: (error: unknown) => void;

    constructor(req: IncomingMessage) {
        super(req);

        let rejectResponse!: (error: unknown) => void;

        // Closed by `end()`, or by the consumer cancelling (navigation, aborted fetch) like a dropped connection.
        let isClosed = false;

        // The handler failed: before the headers there is no response yet, after them the body breaks off.
        this.fail = (error) => {
            if (!this.headersSent) return rejectResponse(error);
            if (isClosed) return;
            isClosed = true;
            this.controller.error(error);
        };

        this.responsePromise = new Promise<Response>((resolve, reject) => {
            rejectResponse = reject;

            const readableStream = new ReadableStream<Uint8Array>({
                start: (controller) => {
                    this.controller = controller;

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

            this.once('writeHead', (statusCode: number) => {
                // `Response` rejects a body for these statuses; HEAD has none either
                const hasBody = req.method !== 'HEAD' && ![204, 205, 304].includes(statusCode);
                resolve(
                    new Response(hasBody ? readableStream : null, {
                        status: statusCode,
                        statusText: this.statusMessage,
                        headers: toHeaders(this.getHeaders()),
                    }),
                );
            });
        });
    }

    // The body goes only to the stream above. Node gets empty chunks to keep its state (headers, ended), otherwise
    // it buffers the whole body a second time: there is no socket to flush it to.

    write(chunk: any, ...args: any[]): boolean {
        // A write after `end()` has nowhere to go; Node reports it through `super.write` as usual.
        if (!this.writableEnded) this.emit('data', chunk, typeof args[0] === 'string' ? args[0] : undefined);
        super.write('', ...args);
        // Backpressure: `pull` emits `drain` once the consumer wants more.
        return (this.controller.desiredSize ?? 1) > 0;
    }

    end(chunk?: any, ...args: any[]): this {
        if (!this.writableEnded) this.emit('end', chunk, typeof args[0] === 'string' ? args[0] : undefined);
        return super.end(typeof chunk === 'function' ? chunk : undefined, ...args);
    }

    writeHead(statusCode: number, ...args: any[]): this {
        // Headers passed here reach `getHeaders()` (which the `Response` is built from) only through `setHeader`
        const reason = typeof args[0] === 'string' ? [args.shift()] : [];
        const headers = args[0];
        if (headers && !Array.isArray(headers)) {
            for (const [name, value] of Object.entries(headers)) {
                if (value !== undefined) this.setHeader(name, value as OutgoingHttpHeader);
            }
            super.writeHead(statusCode, ...reason);
        } else {
            super.writeHead(statusCode, ...reason, ...args);
        }
        this.emit('writeHead', statusCode);
        return this;
    }

    getResponse(): Promise<Response> {
        return this.responsePromise;
    }
}
