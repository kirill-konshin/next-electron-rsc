import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite-plus';

const standaloneDir = path.join(import.meta.dirname, '.next', 'standalone');

/** Every file of the Next.js standalone build, keyed by its path inside the build. */
function standaloneAssets(): Record<string, string> {
    if (!fs.existsSync(standaloneDir)) throw new Error(`${standaloneDir} is missing, run "yarn build:next" first`);
    return Object.fromEntries(
        fs
            .readdirSync(standaloneDir, { recursive: true, withFileTypes: true })
            .filter((entry) => entry.isFile())
            .map((entry) => {
                const file = path.join(entry.parentPath, entry.name);
                return [path.relative(standaloneDir, file), file];
            }),
    );
}

export default defineConfig({
    /*
     * `vp pack --exe`-style build: `seaServer.ts` becomes the main script of a Node.js single executable application,
     * with the standalone build as its assets (`node --build-sea`, signed ad hoc on macOS by tsdown).
     */
    pack: {
        entry: ['seaServer.ts'],
        outDir: 'build',
        format: 'cjs',
        platform: 'node',
        fixedExtension: false,
        dts: false,
        exe: {
            outDir: 'out',
            fileName: 'next-sea',
            seaConfig: { assets: standaloneAssets() },
        },
    },
});
