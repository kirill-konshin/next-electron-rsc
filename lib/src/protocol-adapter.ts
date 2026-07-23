import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';

import type { Session } from 'electron';
import { parse as parseSetCookie } from 'set-cookie-parser';

type ResponseCallback = (error?: Error | null) => void;
const cookieNamePattern = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const cookieValuePattern = /^[\x21-\x3A\x3C-\x7E]*$/;

function cookiePair(name: string, value: string): string | undefined {
    if (!cookieNamePattern.test(name) || !cookieValuePattern.test(value)) return undefined;
    return `${name}=${value}`;
}

function toBuffer(chunk: unknown, encoding?: BufferEncoding): Buffer {
    if (Buffer.isBuffer(chunk)) return chunk;
    if (chunk instanceof Uint8Array) return Buffer.from(chunk);
    return Buffer.from(String(chunk), encoding);
}

function responseHeaders(response: ServerResponse): Headers {
    const headers = new Headers();

    for (const [name, value] of Object.entries(response.getHeaders())) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
            for (const item of value) headers.append(name, String(item));
        } else {
            headers.set(name, String(value));
        }
    }

    return headers;
}

function canHaveBody(method: string | undefined, status: number): boolean {
    return method !== 'HEAD' && status !== 204 && status !== 205 && status !== 304;
}

export class ProtocolServerResponse extends ServerResponse {
    readonly #body: ReadableStream<Uint8Array>;
    readonly #responsePromise: Promise<Response>;
    #controller: ReadableStreamDefaultController<Uint8Array> | undefined;
    #resolveResponse: ((response: Response) => void) | undefined;
    #rejectResponse: ((error: unknown) => void) | undefined;
    #closed = false;

    constructor(request: IncomingMessage) {
        super(request);

        this.#body = new ReadableStream<Uint8Array>({
            start: (controller) => {
                this.#controller = controller;
            },
            pull: () => {
                this.emit('drain');
            },
            cancel: () => {
                this.#closed = true;
            },
        });

        this.#responsePromise = new Promise<Response>((resolve, reject) => {
            this.#resolveResponse = resolve;
            this.#rejectResponse = reject;
        });
    }

    #startResponse(): void {
        if (!this.#resolveResponse) return;
        const resolve = this.#resolveResponse;
        this.#resolveResponse = undefined;
        resolve(
            new Response(canHaveBody(this.req.method, this.statusCode) ? this.#body : null, {
                status: this.statusCode,
                statusText: this.statusMessage,
                headers: responseHeaders(this),
            }),
        );
    }

    override writeHead(statusCode: number, ...args: unknown[]): this {
        super.writeHead(
            statusCode,
            ...(args as Parameters<ServerResponse['writeHead']> extends [number, ...infer R] ? R : never),
        );
        this.#startResponse();
        return this;
    }

    override write(
        chunk: unknown,
        encodingOrCallback?: BufferEncoding | ResponseCallback,
        callback?: ResponseCallback,
    ): boolean {
        if (!this.headersSent) this.writeHead(this.statusCode);

        const encoding = typeof encodingOrCallback === 'string' ? encodingOrCallback : undefined;
        const done = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;

        if (!this.#closed) this.#controller?.enqueue(toBuffer(chunk, encoding));
        queueMicrotask(() => done?.(null));
        return (this.#controller?.desiredSize ?? 1) > 0;
    }

    override end(
        chunkOrCallback?: unknown | ResponseCallback,
        encodingOrCallback?: BufferEncoding | ResponseCallback,
        callback?: ResponseCallback,
    ): this {
        const chunk = typeof chunkOrCallback === 'function' ? undefined : chunkOrCallback;
        const encoding = typeof encodingOrCallback === 'string' ? encodingOrCallback : undefined;
        const done =
            (typeof chunkOrCallback === 'function' ? chunkOrCallback : undefined) ??
            (typeof encodingOrCallback === 'function' ? encodingOrCallback : callback);

        if (chunk !== undefined && chunk !== null) this.write(chunk, encoding);
        if (!this.headersSent) this.writeHead(this.statusCode);

        if (!this.#closed) {
            this.#closed = true;
            this.#controller?.close();
        }

        // Update Node's writable state without buffering the response body a
        // second time. There is no real socket in production.
        super.end();
        queueMicrotask(() => {
            this.emit('finish');
            done?.(null);
        });
        return this;
    }

    response(): Promise<Response> {
        return this.#responsePromise;
    }

    fail(error: unknown): void {
        if (this.headersSent) {
            if (!this.#closed) {
                this.#closed = true;
                this.#controller?.error(error);
            }
            return;
        }

        if (this.#rejectResponse) {
            const reject = this.#rejectResponse;
            this.#rejectResponse = undefined;
            reject(error);
        }
    }
}

export function isRequestForOrigin(requestUrl: string, expectedOrigin: string): boolean {
    try {
        return new URL(requestUrl).origin === new URL(expectedOrigin).origin;
    } catch {
        return false;
    }
}

export async function createNodeRequest({
    request,
    session,
}: {
    request: Request;
    session: Pick<Session, 'cookies'>;
}): Promise<{ request: IncomingMessage; socket: Socket }> {
    const socket = new Socket();
    const nodeRequest = new IncomingMessage(socket);
    const url = new URL(request.url);

    nodeRequest.url = `${url.pathname}${url.search}`;
    nodeRequest.method = request.method;

    request.headers.forEach((value, name) => {
        nodeRequest.headers[name] = value;
        nodeRequest.rawHeaders.push(name, value);
    });
    if (!nodeRequest.headers.host) {
        nodeRequest.headers.host = url.host;
        nodeRequest.rawHeaders.push('host', url.host);
    }

    const sessionCookies = await session.cookies.get({ url: request.url });
    if (sessionCookies.length > 0) {
        // Electron returns the value exactly as Chromium stored it. Encoding it
        // again changes signed values such as `%2F` into `%252F`.
        const serialized = sessionCookies
            .map(({ name, value }) => cookiePair(name, value))
            .filter((value): value is string => Boolean(value))
            .join('; ');
        const existing = nodeRequest.headers.cookie;
        if (serialized) nodeRequest.headers.cookie = existing ? `${existing}; ${serialized}` : serialized;
    }

    if (request.body && request.method !== 'GET' && request.method !== 'HEAD') {
        nodeRequest.push(Buffer.from(await request.arrayBuffer()));
    }
    nodeRequest.push(null);
    nodeRequest.complete = true;

    request.signal.addEventListener('abort', () => nodeRequest.destroy(), { once: true });
    return { request: nodeRequest, socket };
}

export function createProtocolResponse(request: IncomingMessage): ProtocolServerResponse {
    return new ProtocolServerResponse(request);
}

function electronSameSite(value: string | undefined): 'no_restriction' | 'lax' | 'strict' | undefined {
    const normalized = value?.toLowerCase();
    if (normalized === 'none') return 'no_restriction';
    if (normalized === 'lax' || normalized === 'strict') return normalized;
    return undefined;
}

export async function syncResponseCookies({
    request,
    response,
    session,
}: {
    request: Request;
    response: Response;
    session: Pick<Session, 'cookies'>;
}): Promise<void> {
    const values = response.headers.getSetCookie();
    if (values.length === 0) return;

    const cookies = parseSetCookie(values, { decodeValues: false, map: false });
    const nowSeconds = Date.now() / 1_000;

    for (const cookie of cookies) {
        const expirationDate = cookie.expires
            ? cookie.expires.getTime() / 1_000
            : cookie.maxAge !== undefined
              ? nowSeconds + cookie.maxAge
              : undefined;

        if ((cookie.maxAge !== undefined && cookie.maxAge <= 0) || (expirationDate && expirationDate <= nowSeconds)) {
            await session.cookies.remove(request.url, cookie.name);
            continue;
        }

        await session.cookies.set({
            url: request.url,
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path,
            secure: cookie.secure,
            httpOnly: cookie.httpOnly,
            expirationDate,
            sameSite: electronSameSite(cookie.sameSite),
        });
    }
}
