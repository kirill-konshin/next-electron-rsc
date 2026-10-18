import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    // Oxlint (`vp check`) lints the workspace; Next.js has no ESLint config to run
    eslint: { ignoreDuringBuilds: true },
    output: 'standalone',
    outputFileTracingIncludes: {
        '*': ['public/**/*', '.next/static/**/*'],
    },
};

export default nextConfig;
