import assert from 'node:assert';
import fs from 'node:fs';
import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { parse } from 'node:url';

import type { Protocol, Session } from 'electron';
import type createNextServer from 'next';
import resolve from 'resolve';

import { createNodeRequest, createProtocolResponse, isRequestForOrigin, syncResponseCookies } from './protocol-adapter';
import { ELECTRON_APP_KEY, ELECTRON_MODULE_KEY } from './app';

export { getApp, getElectron, ELECTRON_APP_KEY, ELECTRON_MODULE_KEY } from './app';
export { isRequestForOrigin } from './protocol-adapter';

type NextServer = ReturnType<typeof createNextServer>;
type NextServerOptions = Parameters<typeof createNextServer>[0];

export type CreateHandlerOptions = Omit<NextServerOptions, 'conf' | 'dev' | 'dir' | 'hostname' | 'port'> & {
    /**
     * Kept for backward compatibility. Production interception is registered on
     * the supplied Session, so separate Electron partitions stay isolated.
     */
    protocol: Protocol;
    /** Directory containing the production standalone Next.js app. */
    dir: string;
    /** Next.js project directory in development. Defaults to process.cwd(). */
    devDir?: string;
    conf?: NextServerOptions['conf'];
    debug?: boolean;
    dev?: boolean;
    hostname?: string;
    port?: number;
    /** Enables Turbopack for the in-process development server. */
    turbo?: boolean;
};

export type HandlerController = {
    appUrl: string;
    /** @deprecated Use appUrl. */
    localhostUrl: string;
    ready: Promise<void>;
    createInterceptor: (options: { session: Session }) => Promise<() => void>;
    stopDevServer: () => Promise<void>;
};

type ActiveInterceptor = {
    references: number;
    stop: () => void;
};

function logError(debug: boolean, message: string, error: unknown): void {
    if (!debug) return;
    console.error(`[next-electron-rsc] ${message}`, error);
}

function loadNext(projectDir: string): typeof createNextServer {
    return require(resolve.sync('next', { basedir: projectDir }));
}

function closeServer(server: Server | undefined): Promise<void> {
    if (!server?.listening) return Promise.resolve();

    return new Promise((resolveClose, rejectClose) => {
        server.close((error) => {
            if (error) rejectClose(error);
            else resolveClose();
        });
        server.closeAllConnections?.();
    });
}

function findServerDirectories(baseDir: string, depth = 0): string[] {
    if (depth > 5 || !fs.existsSync(baseDir)) return [];
    if (fs.existsSync(path.join(baseDir, 'server.js'))) return [baseDir];

    return fs
        .readdirSync(baseDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.'))
        .flatMap((entry) => findServerDirectories(path.join(baseDir, entry.name), depth + 1));
}

/**
 * Resolve the app directory produced by `output: "standalone"` across both
 * single-package and monorepo tracing layouts.
 */
export function resolveStandaloneDir(rootDir: string, packageName?: string): string {
    const standaloneRoot = path.resolve(rootDir, '.next', 'standalone');
    const preferred = packageName ? path.join(standaloneRoot, packageName) : undefined;

    if (preferred && fs.existsSync(path.join(preferred, 'server.js'))) return preferred;
    if (fs.existsSync(path.join(standaloneRoot, 'server.js'))) return standaloneRoot;

    const matches = findServerDirectories(standaloneRoot);
    if (matches.length === 1) return matches[0];
    if (matches.length === 0) {
        throw new Error(
            `Next.js standalone server not found under ${standaloneRoot}. Run "next build" with output: "standalone".`,
        );
    }

    throw new Error(
        `Multiple Next.js standalone servers found under ${standaloneRoot}: ${matches.join(', ')}. Pass a packageName.`,
    );
}

function exposeElectronGlobals(): void {
    try {
        const electron = require('electron');
        (globalThis as Record<string, unknown>)[ELECTRON_APP_KEY] = electron.app;
        (globalThis as Record<string, unknown>)[ELECTRON_MODULE_KEY] = electron;
    } catch {
        // Expected in unit tests and other non-Electron processes.
    }
}

/**
 * Run Next.js in the Electron main process.
 *
 * Development uses Next's documented custom-server API and a loopback-only
 * listener for HMR. Production has no listener: the Electron Session protocol
 * forwards only this app's virtual HTTP origin directly to Next's handler.
 */
export function createHandler({
    protocol,
    debug = false,
    dev = process.env.NODE_ENV === 'development',
    hostname = 'localhost',
    port = 3000,
    dir,
    devDir = process.cwd(),
    turbo = true,
    ...nextOptions
}: CreateHandlerOptions): HandlerController {
    assert(protocol, 'protocol is required');
    assert(dir, 'dir is required');
    assert(hostname, 'hostname is required');
    assert(Number.isInteger(port) && port > 0 && port <= 65_535, 'port must be between 1 and 65535');

    exposeElectronGlobals();

    const appUrl = new URL(`http://${hostname}:${port}`).origin;
    const activeInterceptors = new Map<Session, ActiveInterceptor>();
    let devServer: Server | undefined;
    let nextApp: NextServer;
    let requestHandler: ReturnType<NextServer['getRequestHandler']>;

    if (debug) {
        console.log('[next-electron-rsc] createHandler', {
            appUrl,
            dev,
            dir: dev ? devDir : dir,
            turbo,
        });
    }

    let ready: Promise<void>;

    if (dev) {
        if (turbo) process.env.TURBOPACK = '1';
        // Next 16.2+ uses this marker to avoid loading production server files
        // when its development server runs inside another process.
        process.env.__NEXT_DEV_SERVER = '1';

        const next = loadNext(devDir);
        nextApp = next({
            ...nextOptions,
            dev: true,
            dir: devDir,
            hostname,
            port,
        });
        requestHandler = nextApp.getRequestHandler();

        ready = nextApp.prepare().then(
            () =>
                new Promise<void>((resolveReady, rejectReady) => {
                    devServer = createServer((request, response) => {
                        Promise.resolve(requestHandler(request, response, parse(request.url ?? '/', true))).catch(
                            (error: unknown) => {
                                logError(debug, 'development request failed', error);
                                if (!response.headersSent) response.statusCode = 500;
                                response.end('Internal Server Error');
                            },
                        );
                    });
                    devServer.once('error', rejectReady);
                    devServer.listen(port, hostname, () => {
                        devServer?.off('error', rejectReady);
                        resolveReady();
                    });
                }),
        );
    } else {
        assert(fs.existsSync(dir), `standalone directory does not exist: ${dir}`);
        const requiredServerFiles = path.join(dir, '.next', 'required-server-files.json');
        assert(fs.existsSync(requiredServerFiles), `required-server-files.json does not exist: ${requiredServerFiles}`);

        const requiredConfig = JSON.parse(fs.readFileSync(requiredServerFiles, 'utf8')) as {
            config?: NextServerOptions['conf'];
        };
        process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify({
            ...requiredConfig.config,
            ...nextOptions.conf,
        });

        const next = loadNext(dir);
        nextApp = next({
            ...nextOptions,
            dev: false,
            dir,
            hostname,
            port,
        });
        requestHandler = nextApp.getRequestHandler();
        ready = nextApp.prepare();
    }

    async function createInterceptor({ session }: { session: Session }): Promise<() => void> {
        assert(session, 'session is required');
        await ready;

        if (dev) return () => {};

        const existing = activeInterceptors.get(session);
        if (existing) {
            existing.references += 1;
            let stopped = false;
            return () => {
                if (stopped) return;
                stopped = true;
                existing.references -= 1;
                if (existing.references === 0) existing.stop();
            };
        }

        const sessionProtocol = session.protocol;
        if (await sessionProtocol.isProtocolHandled('http')) {
            throw new Error('The supplied Electron session already has an HTTP protocol handler.');
        }

        const handleRequest = async (request: Request): Promise<Response> => {
            if (!isRequestForOrigin(request.url, appUrl)) {
                return new Response('Blocked external HTTP request', {
                    status: 403,
                    headers: { 'content-type': 'text/plain; charset=utf-8' },
                });
            }

            try {
                const { request: nodeRequest, socket } = await createNodeRequest({ request, session });
                const nodeResponse = createProtocolResponse(nodeRequest);
                nodeResponse.once('finish', () => socket.destroy());

                Promise.resolve(requestHandler(nodeRequest, nodeResponse, parse(nodeRequest.url ?? '/', true))).catch(
                    (error: unknown) => nodeResponse.fail(error),
                );

                const response = await nodeResponse.response();
                await syncResponseCookies({ request, response, session }).catch((error: unknown) => {
                    logError(debug, 'failed to persist response cookies', error);
                });

                if (debug) console.log('[next-electron-rsc]', request.method, request.url, response.status);
                return response;
            } catch (error) {
                logError(debug, `request failed: ${request.url}`, error);
                return new Response(debug && error instanceof Error ? error.message : 'Internal Server Error', {
                    status: 500,
                    headers: { 'content-type': 'text/plain; charset=utf-8' },
                });
            }
        };

        await sessionProtocol.handle('http', handleRequest);

        const active: ActiveInterceptor = {
            references: 1,
            stop: () => {
                if (activeInterceptors.get(session) !== active) return;
                activeInterceptors.delete(session);
                sessionProtocol.unhandle('http');
            },
        };
        activeInterceptors.set(session, active);

        let stopped = false;
        return () => {
            if (stopped) return;
            stopped = true;
            active.references -= 1;
            if (active.references === 0) active.stop();
        };
    }

    return {
        appUrl,
        localhostUrl: appUrl,
        ready,
        createInterceptor,
        stopDevServer: async () => {
            for (const interceptor of [...activeInterceptors.values()]) interceptor.stop();
            await closeServer(devServer);
            await nextApp?.close?.();
        },
    };
}
