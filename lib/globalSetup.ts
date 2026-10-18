import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const fixtureDir = path.join(import.meta.dirname, 'fixture');
const require = createRequire(import.meta.url);

function newestSourceMtime(dir: string): number {
    return Math.max(
        ...fs.readdirSync(dir, { withFileTypes: true }).map((entry) => {
            if (entry.name === '.next') return 0;
            const entryPath = path.join(dir, entry.name);
            return entry.isDirectory() ? newestSourceMtime(entryPath) : fs.statSync(entryPath).mtimeMs;
        }),
    );
}

/** Builds the fixture app only when its sources changed since the last build. */
export function setup(): void {
    const buildId = path.join(fixtureDir, '.next', 'BUILD_ID');
    if (fs.existsSync(buildId) && fs.statSync(buildId).mtimeMs > newestSourceMtime(fixtureDir)) return;

    execFileSync(process.execPath, [require.resolve('next/dist/bin/next'), 'build', fixtureDir], {
        stdio: 'inherit',
        env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' },
    });
}
