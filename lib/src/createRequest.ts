import { IncomingMessage } from 'node:http';
import { Socket } from 'node:net';
import type { Session } from 'electron';

export async function createRequest({
    request,
    session,
}: {
    request: Request;
    session?: Session;
}): Promise<IncomingMessage> {
    // Each request gets its own socket, like a real connection; it is never connected, so there is nothing to close.
    const req = new IncomingMessage(new Socket());

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
                // Values go back exactly as the server set them: encoding them again turns `%2F` into `%252F` and
                // breaks signed cookies.
                req.headers.cookie = cookies.map(({ name, value }) => `${name}=${value}`).join('; ');
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
