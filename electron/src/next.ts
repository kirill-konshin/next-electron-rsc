import type { ProtocolRequest, ProtocolResponse } from 'electron';
import path from 'path';
import resolve from 'resolve';
import fs from 'fs';
import vm from 'vm';

const nextPath = path.dirname(resolve.sync('next-pkg-web')); //FIXME custom resolve follows symlinks ../.. due to standalone/web
const configPath = path.join(nextPath, '.next', 'required-server-files.json');
const staticPath = path.join(nextPath, '.next', 'static');

console.log('Next.js Paths', [nextPath, nextPath, configPath, staticPath], Headers);

const requireCwd = (name) => require(resolve.sync(name, { basedir: nextPath })); // custom resolve follows symlinks

const { config } = require(configPath);

const sandbox = {
    require: requireCwd,
    __dirname,
    process,
    console,
    URL,
    exports: {},
    global: { config, nextPath, staticPath },
};

export const startServer = () => {
    const data = fs.readFileSync(require.resolve('./server.js')); // note that we use compiled script, not ts
    vm.runInNewContext(data.toString(), sandbox);
};

export const processRequest = async (request: ProtocolRequest): Promise<ProtocolResponse> =>
    await sandbox.exports['handleRequest'](request);

export const processStatic = (request: ProtocolRequest) =>
    fs.readFileSync(path.join(staticPath, request.url.split('/_next/static').pop()));
