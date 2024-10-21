/**
 * @type {import('next').NextConfig}
 */
module.exports = {
    swcMinify: true,
    output: 'standalone',
    experimental: {
        outputFileTracingIncludes: {
            '*': ['public/**/*', '.next/static/**/*'],
        },
    },
};
