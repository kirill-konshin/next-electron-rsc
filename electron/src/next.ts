import type { ProtocolRequest, ProtocolResponse } from 'electron';
import path from 'path';
import resolve from 'resolve';
import fs from 'fs';

import { createHandler } from './server';

const packagePath = path.dirname(resolve.sync('next-pkg-web'));

const nextPath = path.join(packagePath, '.next', 'standalone', 'web');
const configPath = path.join(nextPath, '.next', 'required-server-files.json');
const staticPath = path.join(packagePath, '.next', 'static');

console.log('Next.js Paths', [nextPath, configPath, staticPath]);

const { config } = require(configPath);

const handleRequest = createHandler({ config, nextPath });

export const processRequest = async (request: ProtocolRequest): Promise<ProtocolResponse> => handleRequest(request);

export const processStatic = (request: ProtocolRequest) =>
    fs.readFileSync(path.join(staticPath, request.url.split('/_next/static').pop()));
