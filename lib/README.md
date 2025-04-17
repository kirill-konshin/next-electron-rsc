# Next Electron React Server Components

With the emergence of [React Server Components](https://react.dev/reference/rsc/server-components) and [Server Actions](https://react.dev/reference/rsc/server-actions) writing Web apps became easier than ever. The simplicity when developer has all server APIs right inside the Web app, natively, with types and full support from Next.js framework for example (and other RSC frameworks too, of course) is astonishing.

At the same time, Electron is a de-facto standard for modern desktop apps written using web technologies, especially when application must have filesystem and other system API access, while being written in JS ([Tauri](https://tauri.app) receives an honorable mention here if you know Rust or if you only need a simple WebView2 shell).

Please read the full article if you're interested in the topic and the mechanics how this library works: https://medium.com/@kirill.konshin/the-ultimate-electron-app-with-next-js-and-react-server-components-a5c0cabda72b.

## Capabilities

- ✅ No open ports in production mode
- ✅ React Server Components
- ✅ Full support of Next.js features (Pages and App routers, images)
- ✅ Full support of Electron features in Next.js pages & route handlers
- ✅ Next.js Dev Server & HMR

## Installation & Usage

Install depencencies:

```bash
$ npm install next-electron-rsc next electron electron-builder
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

You can now call Electron APIs directly from Next.js server side pages & route handlers: `app/page.tsx`, `app/api/route.ts` and so on.

Write your pages same way as usual, with only difference is that now everything "server" is running on target user machine with access to system APIs like file system, notifications, etc.

```tsx
// app/page.tsx
import electron, { app } from 'electron';

export const dynamic = 'force-dynamic'; // ⚠️⚠️⚠️ THIS IS REQUIRED TO ENSURE PAGE IS DYNAMIC, NOT PRE-BUILT

export default async function Page() {
  electron.shell?.beep();
  return <div>{app.getVersion()}</div>;
}
```

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

```yaml
includeSubNodeModules: true

files:
  - build
  - from: '.next/standalone/demo/'
    to: '.next/standalone/demo/'
```

Replace `%YOUR_PACKAGE_NAME_IN_PACKAGE.JSON%` with what you have in `name` property in `package.json`.

## Convenience scripts

For convenience, you can add following scripts to `package.json`:

```json5
{
  scripts: {
    build: 'yarn build:next && yarn build:electron',
    'build:next': 'next build',
    'build:electron': 'electron-builder --config electron-builder.yml',
    start: 'electron .',
  },
}
```

## Demo

The demo separates `src` of Next.js and `src-electron` of Electron, this ensures Next.js does not try to compile Electron. Electron itself is built using TypeScript.

To quickly run the demo, clone this repo and run:

```bash
yarn
yarn build
cd demo
yarn start:electron
```
