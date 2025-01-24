# Next Electron React Server Components

With the emergence of [React Server Components](https://react.dev/reference/rsc/server-components) and [Server Actions](https://react.dev/reference/rsc/server-actions) writing Web apps became easier than ever. The simplicity when developer has all server APIs right inside the Web app, natively, with types and full support from Next.js framework for example (and other RSC frameworks too, of course) is astonishing.

At the same time, Electron is a de-facto standard for modern desktop apps written using web technologies, especially when application must have filesystem and other system API access, while being written in JS ([Tauri](https://tauri.app) receives an honorable mention here if you know Rust or if you only need a simple WebView2 shell).

Please read the full article if you're interested in the topic and the mechanics how this library works: https://medium.com/@kirill.konshin/the-ultimate-electron-app-with-next-js-and-react-server-components-a5c0cabda72b.

# Installation & Usage

Install depencencies:

```bash
$ npm install next-electron-rsc next electron electron-builder
```

Add following to your `main.js` in Electron before you create a window:

```js
import { app, protocol } from 'electron';
import { createHandler } from 'next-electron-rsc';

const appPath = app.getAppPath();
const isDev = process.env.NODE_ENV === 'development';
const localhostUrl = 'http://localhost:3000'; // must match Next.js dev server

// change to your path, make sure it's added to Electron Builder files
const standaloneDir = path.join(appPath, '.next', 'standalone', 'demo');

const { createInterceptor } = createHandler({
  standaloneDir,
  staticDir,
  localhostUrl,
  protocol,
});
```

Then add this when `mainWindow` is created:

```js
if (!isDev) createInterceptor({ session: mainWindow.webContents.session });
```

Configure your Next.js build in `next.config.js`:

```js
module.exports = {
  output: 'standalone',
  experimental: {
    outputFileTracingIncludes: {
      '*': ['public/**/*', '.next/static/**/*'],
    },
  },
};
```

I suggest to use Electron Builder to bundle the Electron app. Just add some configuration to `electron-builder.yml`:

```yaml
includeSubNodeModules: true

files:
  - build
  - from: '.next/standalone/demo/'
    to: '.next/standalone/demo/'
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

To quickly run the demo, clone this repo and run:

```bash
yarn
yarn build
cd demo
yarn start:electron
```
