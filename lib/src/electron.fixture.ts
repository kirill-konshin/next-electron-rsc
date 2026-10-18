import type { Protocol, Session } from 'electron';
import { type Mock, vi } from 'vite-plus/test';

export type CookieDetails = { name: string; value: string; [key: string]: unknown };

type Handler = (request: Request) => Promise<Response>;

export type SessionFixture = {
    session: Session;
    mock: {
        protocol: { handle: Mock<(scheme: string, handler: Handler) => void>; unhandle: Mock<() => void> };
        cookies: {
            get: Mock<(filter: { url: string }) => Promise<CookieDetails[]>>;
            set: Mock<(details: CookieDetails) => Promise<void>>;
            remove: Mock<(url: string, name: string) => Promise<void>>;
        };
    };
    jar: CookieDetails[];
    isHandled: () => boolean;
    request: (input: string, init?: RequestInit) => Promise<Response>;
};

/** The parts of an Electron session the library uses: its own protocol and an in-memory cookie jar. */
export function createSession(jar: CookieDetails[] = []): SessionFixture {
    let handler: Handler | undefined;

    const mock: SessionFixture['mock'] = {
        protocol: {
            handle: vi.fn((scheme, fn) => {
                handler = fn;
            }),
            unhandle: vi.fn(() => {
                handler = undefined;
            }),
        },
        cookies: {
            get: vi.fn(async () => jar),
            set: vi.fn(async (details) => {
                const index = jar.findIndex(({ name }) => name === details.name);
                if (index === -1) jar.push(details);
                else jar[index] = details;
            }),
            remove: vi.fn(async (url, name) => {
                const index = jar.findIndex((cookie) => cookie.name === name);
                if (index !== -1) jar.splice(index, 1);
            }),
        },
    };

    return {
        session: mock as unknown as Session,
        mock,
        jar,
        isHandled: () => !!handler,
        request: (input, init) => {
            if (!handler) throw new Error('http is not handled');
            return handler(new Request(input, init));
        },
    };
}

export type ProtocolFixture = {
    protocol: Protocol;
    mock: { registerSchemesAsPrivileged: Mock; handle: Mock; unhandle: Mock };
};

/** The global Electron `protocol`: only `registerSchemesAsPrivileged` may be used, handlers go on the session. */
export function createProtocol(): ProtocolFixture {
    const mock = { registerSchemesAsPrivileged: vi.fn(), handle: vi.fn(), unhandle: vi.fn() };
    return { protocol: mock as unknown as Protocol, mock };
}
