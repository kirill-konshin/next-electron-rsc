import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import sea from 'node:sea';

// `getAssetKeys` (Node 24.8+) is newer than the installed @types/node
const assets = sea as typeof sea & { getAssetKeys: () => string[] };

function cacheRoot(): string {
    if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Caches');
    if (process.platform === 'win32') return process.env.LOCALAPPDATA ?? os.tmpdir();
    return process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), '.cache');
}

/**
 * Next.js loads its server from about two thousand files at run time, which a SEA cannot provide in memory: the
 * standalone build ships as assets and runs from a cache folder, one per build.
 */
function extract(keys: string[], appDir: string): string {
    const root = path.join(cacheRoot(), 'next-sea', assets.getAsset(path.join(appDir, '.next', 'BUILD_ID'), 'utf8'));
    if (fs.existsSync(root)) return root;

    // complete or absent: a crash leaves only the temporary folder, and parallel first runs do not see half a build
    const temporary = `${root}.${process.pid}`;
    for (const key of keys) {
        const file = path.join(temporary, key);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, new Uint8Array(assets.getRawAsset(key)));
    }
    try {
        fs.renameSync(temporary, root);
    } catch (error) {
        fs.rmSync(temporary, { recursive: true, force: true });
        if (!fs.existsSync(root)) throw error;
    }

    // earlier builds; temporary folders of other running first starts carry a `.` and stay
    for (const name of fs.readdirSync(path.dirname(root))) {
        if (name !== path.basename(root) && !name.includes('.')) {
            fs.rmSync(path.join(path.dirname(root), name), { recursive: true, force: true });
        }
    }
    return root;
}

const keys = assets.getAssetKeys();
// `server.js` is at the root of the standalone build, or in the app folder of a monorepo
const serverKey = keys.find((key) => path.basename(key) === 'server.js' && path.dirname(path.dirname(key)) === '.');
if (!serverKey) throw new Error('Next.js standalone server.js is not among the SEA assets');

const server = path.join(extract(keys, path.dirname(serverKey)), serverKey);
createRequire(server)(server);
