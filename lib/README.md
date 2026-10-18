# Next Electron React Server Components

With the emergence of [React Server Components](https://react.dev/reference/rsc/server-components) and [Server Actions](https://react.dev/reference/rsc/server-actions) writing Web apps became easier than ever. The simplicity when developer has all server APIs right inside the Web app, natively, with types and full support from Next.js framework for example (and other RSC frameworks too, of course) is astonishing.

At the same time, Electron is a de-facto standard for modern desktop apps written using web technologies, especially when application must have filesystem and other system API access, while being written in JS ([Tauri](https://tauri.app) receives an honorable mention here if you know Rust or if you only need a simple WebView2 shell).

Please read the full article if you're interested in the topic and the mechanics how this library works: https://medium.com/@kirill.konshin/the-ultimate-electron-app-with-next-js-and-react-server-components-a5c0cabda72b.

This library makes it straightforward to use combination of Next.js running in Electron, the best way to develop desktop apps.

![Next Electron React Server Components](public/image.png 'Next Electron React Server Components')

## Capabilities

- ✅ No open ports in production mode
- ✅ React Server Components
- ✅ Full support of Next.js features (Pages and App routers, images)
- ✅ Full support of Electron features in Next.js pages & route handlers
- ✅ Next.js Dev Server & HMR

## Installation & Usage

Install depencencies:

```bash
$ npm install next-electron-rsc next
$ npm install electron electron-builder --save-dev
# or
$ yarn add next-electron-rsc next
$ yarn add electron electron-builder --dev
```

:warning: **Next.js need to be installed as `dependency`, not as `devDependency`. This is because Electron needs to run Next.js in same context in production mode. Electron Builder and similar libraries will not copy `devDependencies` into final app bundle.**

In some cases Electron may not install itself correctly, so you may need to run:

```bash
$ node node_modules/electron/install.js
```

You can also add this to `prepare` script in `package.json`. See [comment](https://github.com/kirill-konshin/next-electron-rsc/issues/10#issuecomment-2812207039).

```json
{
    "scripts": {
        "prepare": "node node_modules/electron/install.js"
    }
}
```

## Add following to your `main.js` or `main.ts` in Electron

```js
import path from 'path';
import { app, BrowserWindow, Menu, protocol, session, shell } from 'electron';
import { createHandler } from 'next-electron-rsc';

let mainWindow;

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));

// ⬇ Next.js handler ⬇

// change to your path, make sure it's added to Electron Builder files
const appPath = app.getAppPath();
const dev = process.env.NODE_ENV === 'development';
const dir = path.join(appPath, '.next', 'standalone', 'demo');

const { createInterceptor, localhostUrl } = createHandler({
    dev,
    dir,
    protocol,
    debug: true,
    // ... and other Nex.js server options https://nextjs.org/docs/pages/building-your-application/configuring/custom-server
    turbo: true, // optional
});

let stopIntercept;

// ⬆ Next.js handler ⬆

const createWindow = async () => {
    mainWindow = new BrowserWindow({
        width: 1600,
        height: 800,
        webPreferences: {
            contextIsolation: true, // protect against prototype pollution
            devTools: true,
        },
    });

    // ⬇ Next.js handler ⬇

    stopIntercept = await createInterceptor({ session: mainWindow.webContents.session });

    // ⬆ Next.js handler ⬆

    mainWindow.once('ready-to-show', () => mainWindow.webContents.openDevTools());

    mainWindow.on('closed', () => {
        mainWindow = null;
        stopIntercept?.();
    });

    // Should be last, after all listeners and menu

    await app.whenReady();

    await mainWindow.loadURL(localhostUrl + '/');

    console.log('[APP] Loaded', localhostUrl);
};

app.on('ready', createWindow);

app.on('window-all-closed', () => app.quit()); // if (process.platform !== 'darwin')

app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && !mainWindow && createWindow());
```

## Ensure Next.js pages are dynamic

With the library you can call Electron APIs directly from Next.js server side pages & route handlers: `app/page.tsx`, `app/api/route.ts` and so on.

Write your pages same way as usual, with only difference is that now everything "server" is running on target user machine with access to system APIs like file system, notifications, etc.

### Pages

```tsx
// app/page.tsx
import electron, { app } from 'electron';

export const dynamic = 'force-dynamic'; // ⚠️⚠️⚠️ THIS IS REQUIRED TO ENSURE PAGE IS DYNAMIC, NOT PRE-BUILT

export default async function Page() {
    electron.shell?.beep();
    return <div>{app.getVersion()}</div>;
}
```

### Route Handlers

```ts
// app/api/route.ts
import { NextRequest, NextResponse } from 'next/server';
import electron from 'electron';

export const dynamic = 'force-dynamic'; // ⚠️⚠️⚠️ THIS IS REQUIRED TO ENSURE PAGE IS DYNAMIC, NOT PRE-BUILT

export async function POST(req: NextRequest) {
    return NextResponse.json({
        message: 'Hello from Next.js! in response to ' + (await req.text()),
        electron: electron.app.getVersion(),
    });
}
```

## Configure your Next.js in `next.config.ts`

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    output: 'standalone',
    outputFileTracingIncludes: {
        '*': ['public/**/*', '.next/static/**/*'],
    },
    serverExternalPackages: ['electron'], // to prevent bundling Electron
};

if (process.env.NODE_ENV === 'development') delete nextConfig.output; // for HMR

export default nextConfig;
```

## Set up build

I suggest to use Electron Builder to bundle the Electron app. Just add some configuration to `electron-builder.yml`:

Replace `%PACKAGENAME%` with what you have in `name` property in `package.json`.

### Electron Builder v26+

```yaml
asar: false

files:
    - build
    - '.next/standalone/%PACKAGENAME%/**/*'
    - '!.next/standalone/%PACKAGENAME%/node_modules/electron'
    # monorepo with hoisted dependencies: Next.js traces them next to the app folder
    - '.next/standalone/node_modules/**/*'
    - '!.next/standalone/node_modules/electron'
```

### Electron Builder v25 and below

```yaml
asar: false
includeSubNodeModules: true

files:
    - build
    - from: '.next/standalone/%PACKAGENAME%/'
      to: '.next/standalone/%PACKAGENAME%/'
```

## Convenience scripts

For convenience, you can add following scripts to `package.json`:

```json
{
    "scripts": {
        "build": "yarn build:next && yarn build:electron",
        "build:next": "next build",
        "build:electron": "electron-builder --config electron-builder.yml",
        "start": "electron ."
    }
}
```

## Typescript In Electron

Keep the Electron entrypoint in `src-electron`, apart from the Next.js code in `src`, and build it with [Vite+](https://viteplus.dev) `vp pack`. In development `vp pack --watch` is also the runner: it restarts Electron after every build of the entrypoint and when `next.config.ts` changes, since Next.js applies a config change only on a restart (as `next dev` does).

`tsconfig-electron.json`:

```json
{
    "compilerOptions": {
        "esModuleInterop": true,
        "skipLibCheck": true,
        "target": "es2022",
        "module": "esnext",
        "moduleResolution": "bundler",
        "types": ["node"]
    },
    "include": ["src-electron/**/*.ts"]
}
```

`vite.config.ts`:

```ts
import path from 'node:path';

import { defineConfig } from 'vite-plus';

const isWatch = process.argv.includes('--watch');

// not in the main process module graph; the `watch` option cannot list them, `--watch` overrides it with `true`
const restartOn = ['next.config.ts'].map((file) => path.resolve(import.meta.dirname, file));

export default defineConfig({
    pack: {
        entry: ['src-electron/index.ts'],
        outDir: 'build',
        format: 'esm',
        platform: 'node',
        fixedExtension: false,
        dts: false,
        deps: { neverBundle: true },
        tsconfig: 'tsconfig-electron.json',
        ...(isWatch && {
            plugins: [
                {
                    name: 'restart-on',
                    buildStart() {
                        for (const file of restartOn) this.addWatchFile(file);
                    },
                },
            ],
            // tsdown stops the previous process before each run
            onSuccess: 'cross-env NODE_ENV=development electron .',
        }),
    },
});
```

Then add this to your `package.json` (`"type": "module"`, `"main": "build/index.js"`):

```json
{
    "scripts": {
        "build": "yarn clean && yarn build:next && yarn build:main && yarn build:electron",
        "build:next": "next build",
        "build:main": "vp pack",
        "build:electron": "electron-builder --config electron-builder.yml",
        "start": "vp pack --watch"
    }
}
```

## Technical Details

1. Electron entrypoint in `src-electron/index.ts` imports the library `import { createHandler } from 'next-electron-rsc';`
2. Library imports Next.js:
    1. As types
    2. `require(resolve.sync('next', { basedir: dir }))` in prod mode
    3. The same `next()` with an HTTP server on `localhostUrl` in dev mode, for HMR; a `next.config.*` change needs an Electron restart (see the dev runner above)

This ensures **both Electron and Next.js are running in the same context**, so Next.js has direct access to Electron APIs.

In production `createInterceptor` handles `http` only for the session it is given, and only for `localhostUrl`. Other `http://` requests from the browser get `403`: fetch external HTTP from the Next.js server.

## Demo

The demo separates `src` of Next.js and `src-electron` of Electron, this ensures Next.js does not try to compile Electron. Electron itself is built using TypeScript.

To quickly run the demo, clone this repo and run:

```bash
yarn
yarn build
cd demo
yarn start
```

You should hear the OS beep, that's Electron shell API in action, called from Next.js server page.

Demo source: https://github.com/kirill-konshin/next-electron-rsc/tree/main/demo
