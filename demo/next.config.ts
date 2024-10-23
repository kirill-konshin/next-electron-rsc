import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    output: 'standalone',
    outputFileTracingIncludes: {
        '*': ['public/**/*', '.next/static/**/*'],
    },
};

export default nextConfig;
