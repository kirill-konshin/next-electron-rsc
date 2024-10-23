/**
 * @type {import('next').NextConfig}
 */
export default {
    output: 'standalone',
    outputFileTracingIncludes: {
        '*': ['public/**/*', '.next/static/**/*'],
    },
};
