import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    output: 'standalone',
    outputFileTracingIncludes: {
        '*': ['public/**/*', '.next/static/**/*'],
    },
    serverExternalPackages: ['electron'],
    images: {
        remotePatterns: [new URL('https://picsum.photos/**')],
    },
};

if (process.env.NODE_ENV === 'development') delete nextConfig.output; // for HMR

export default nextConfig;
