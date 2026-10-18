import { vitePlusConfig } from '@kirill.konshin/lint/vite-plus';
import { defineConfig } from 'vite-plus';

export default defineConfig(
    vitePlusConfig({
        lint: {
            // carried over from .eslintrc.json
            rules: {
                'typescript/ban-ts-comment': 'off',
                'typescript/explicit-module-boundary-types': 'off',
                'typescript/no-empty-function': 'off',
                'typescript/no-explicit-any': 'off',
            },
            overrides: [
                {
                    // the Tailwind Play CDN has to style the page before first paint
                    files: ['demo/src/app/layout.tsx'],
                    rules: { 'nextjs/no-sync-scripts': 'off' },
                },
            ],
        },
        fmt: {
            // carried over from .prettierignore; the root README is a symlink to lib/README.md
            ignorePatterns: ['public', 'stats', '/README.md', '/demo/README.md'],
        },
        test: {
            projects: ['lib'],
        },
    }),
);
