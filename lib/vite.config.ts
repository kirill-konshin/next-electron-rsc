import { defineConfig } from 'vite-plus';

export default defineConfig({
    /*
     * `vp pack` (tsdown): CommonJS into `build/` as before (`main`, `types`), one output file per source module, every
     * bare import external, declarations from `isolatedDeclarations` (tsconfig.json).
     */
    pack: {
        entry: ['src/index.ts'],
        outDir: 'build',
        format: 'cjs',
        platform: 'node',
        unbundle: true,
        fixedExtension: false,
        dts: true,
        deps: { neverBundle: true },
    },
    test: {
        include: ['src/**/*.{test,spec}.ts'],
        // builds the Next.js app in `fixture/` for `index.spec.ts`
        globalSetup: ['globalSetup.ts'],
        testTimeout: 30_000,
    },
});
