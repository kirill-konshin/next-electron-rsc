import path from 'node:path';
import { defineConfig } from 'vite-plus';

const isWatch = process.argv.includes('--watch');

// Not imported by the main process, so not in its module graph; absolute, since Rolldown's `addWatchFile` takes them as is
const restartOn = ['next.config.ts', '../lib/build/index.js'].map((file) => path.resolve(import.meta.dirname, file));

export default defineConfig({
    /*
     * Electron main process: `src-electron` → ESM `build/index.js`, dependencies stay external. `vp pack --watch` is the
     * dev runner: after every build it restarts Electron (tsdown kills the previous `onSuccess` process), also when
     * `next.config.ts` or the linked library changes, since Next.js cannot apply a config change in-process.
     */
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
            // the `watch` option cannot list them: the `--watch` flag overrides it with `true`
            plugins: [
                {
                    name: 'restart-on',
                    buildStart() {
                        for (const file of restartOn) this.addWatchFile(file);
                    },
                },
            ],
            onSuccess: 'cross-env NODE_ENV=development electron .',
        }),
    },
});
