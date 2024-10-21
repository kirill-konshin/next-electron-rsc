# Next Electron React Server Components

With the emergence of [React Server Components](https://react.dev/reference/rsc/server-components) and [Server Actions](https://react.dev/reference/rsc/server-actions) writing Web apps became easier than ever. The simplicity when developer has all server APIs right inside the Web app, natively, with types and full support from Next.js framework for example (and other RSC frameworks too, of course) is astonishing.

At the same time, Electron is a de-facto standard for modern desktop apps written using web technologies, especially when application must have filesystem and other system API access, while being written in JS ([Tauri](https://tauri.app) receives an honorable mention here if you know Rust or if you only need a simple WebView2 shell).

# Installation & Usage

Install depencencies:

```bash
$ npm install next-electron-rsc next electron electron-builder
```

Add following to your `main.js` in Electron:

```js
import { app, protocol } from 'electron';
import { createHandler } from 'next-electron-rsc';

const appPath = app.getAppPath();
const isDev = process.env.NODE_ENV === 'development';
const localhostUrl = 'http://localhost:3000'; // must match Next.js dev server

const { createInterceptor } = createHandler({
  standaloneDir,
  staticDir,
  localhostUrl,
  protocol,
});

if (!isDev) createInterceptor();
```

Configure your Next.js build in `next.config.js`:

```js
module.exports = {
  output: 'standalone',
};
```

I suggest to use Electron Builder to bundle the Electron app. Just add some configuration to `electron-builder.yml`:

```yaml
files:
  - '**/*'
  - '!.next'
  - '!next.config.js'
  - '!src*'
  - '!tsconfig*'

extraResources:
  - from: .next/static
    to: app/.next/static
  - from: .next/standalone/%YOUR_PACKAGE_NAME_IN_PACKAGE.JSON%
    to: app/.next/standalone/%YOUR_PACKAGE_NAME_IN_PACKAGE.JSON%
```

Replace `%YOUR_PACKAGE_NAME_IN_PACKAGE.JSON%` with what you have in `name` property in `package.json`.

For convenience, you can add following scripts to `package.json`:

```json
{
  "scripts": {
    "build": "yarn build:next && yarn build:electron",
    "build:next": "next build",
    "build:electron": "electron-builder --config electron-builder.yml",
    "start:next": "next dev",
    "start:electron": "electron ."
  }
}
```

The demo separates `src` of Next.js and `src-electron` of Electron, this ensures Next.js does not try to compile Electron.
