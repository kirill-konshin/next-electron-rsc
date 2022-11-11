import path from 'path';
import resolve from 'resolve';
import fs from 'fs';
import vm from 'vm';

const nextPath = path.resolve(path.dirname(resolve.sync('next-pkg-web')), '..'); // custom resolve follows symlinks
const standalonePath = path.join(nextPath, 'standalone');
const configPath = path.join(nextPath, 'required-server-files.json');
const staticPath = path.join(nextPath, 'static');

console.log('Next.js Paths', [nextPath, standalonePath, configPath, staticPath]);

const requireCwd = (name) => require(resolve.sync(name, { basedir: standalonePath })); // custom resolve follows symlinks

const { config } = JSON.parse(fs.readFileSync(configPath).toString());

const sandbox = {
    require: requireCwd,
    __dirname,
    process,
    console,
    URL,
    exports: {},
    global: { config, standalonePath, staticPath },
};

export const startServer = () => {
    const data = fs.readFileSync(require.resolve('./server.js')); // note that we use compiled script, not ts
    vm.runInNewContext(data.toString(), sandbox);
};
