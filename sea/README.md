# How to package Next.js application into a single executable using Node SEA

The same app as [`../pkg`](../pkg), built as a Node.js [single executable application](https://nodejs.org/api/single-executable-applications.html) (SEA) with [Vite+](https://viteplus.dev) `vp pack` (tsdown's `exe` option, Node.js 25.7+). No patched Node.js and no patched `server.js`.

A SEA embeds one main script; it has no virtual file system for the two thousand files the Next.js standalone server loads at run time. So the standalone build ships as SEA assets, and [`seaServer.ts`](seaServer.ts) extracts them on the first start into a cache folder per build (`~/Library/Caches/next-sea/<BUILD_ID>` on macOS), then starts Next.js's own `server.js` from there.

- [`vite.config.ts`](vite.config.ts) — `pack` block: `seaServer.ts` is the main script, every file of `.next/standalone` is an asset
- [`next.config.ts`](next.config.ts) — `output: 'standalone'`, with `public` and `.next/static` traced in

# Demo

Run `yarn build:all`, then `yarn open` (`PORT` and `HOSTNAME` as for Next.js's `server.js`).

The executable is built for the platform it is built on; tsdown's `exe.targets` builds for others.
