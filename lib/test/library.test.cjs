const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { getApp, isRequestForOrigin, resolveStandaloneDir } = require('../build/index.js');
const { createNodeRequest, createProtocolResponse, syncResponseCookies } = require('../build/protocol-adapter.js');

test('origin matching rejects prefix and malformed URL attacks', () => {
  assert.equal(isRequestForOrigin('http://localhost:3000/dashboard', 'http://localhost:3000'), true);
  assert.equal(isRequestForOrigin('http://localhost:3000.evil.test/', 'http://localhost:3000'), false);
  assert.equal(isRequestForOrigin('https://localhost:3000/', 'http://localhost:3000'), false);
  assert.equal(isRequestForOrigin('not a url', 'http://localhost:3000'), false);
});

test('resolveStandaloneDir handles root, named, and monorepo output', (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'next-electron-rsc-'));
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));

  const appDir = path.join(temporaryRoot, '.next', 'standalone', 'apps', 'desktop');
  fs.mkdirSync(appDir, { recursive: true });
  fs.writeFileSync(path.join(appDir, 'server.js'), '');
  assert.equal(resolveStandaloneDir(temporaryRoot), appDir);

  const namedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'next-electron-rsc-'));
  t.after(() => fs.rmSync(namedRoot, { recursive: true, force: true }));
  const namedDir = path.join(namedRoot, '.next', 'standalone', 'desktop-app');
  fs.mkdirSync(namedDir, { recursive: true });
  fs.writeFileSync(path.join(namedDir, 'server.js'), '');
  assert.equal(resolveStandaloneDir(namedRoot, 'desktop-app'), namedDir);
});

test('getApp fails explicitly outside Electron', () => {
  assert.throws(() => getApp(), /Electron app not available/);
});

test('request and response adapter preserves method, body, headers, and streaming', async () => {
  const session = {
    cookies: {
      get: async () => [
        { name: 'session', value: 'abc%2Fdef%3D' },
        { name: 'invalid', value: 'line\r\nbreak' },
      ],
    },
  };
  const request = new Request('http://localhost:3000/api/items?q=1', {
    method: 'POST',
    headers: { 'content-type': 'text/plain', 'x-test': 'yes' },
    body: 'payload',
  });
  const adapted = await createNodeRequest({ request, session });
  assert.equal(adapted.request.url, '/api/items?q=1');
  assert.equal(adapted.request.method, 'POST');
  assert.equal(adapted.request.headers.cookie, 'session=abc%2Fdef%3D');

  const body = [];
  for await (const chunk of adapted.request) body.push(chunk);
  assert.equal(Buffer.concat(body).toString(), 'payload');

  const response = createProtocolResponse(adapted.request);
  response.statusCode = 201;
  response.setHeader('content-type', 'text/plain');
  response.write('hello ');
  response.end('world');

  const webResponse = await response.response();
  assert.equal(webResponse.status, 201);
  assert.equal(webResponse.headers.get('content-type'), 'text/plain');
  assert.equal(await webResponse.text(), 'hello world');
});

test('cookie expiry is converted to Electron seconds and deletion is honored', async () => {
  const calls = [];
  const session = {
    cookies: {
      remove: async (...args) => calls.push(['remove', ...args]),
      set: async (details) => calls.push(['set', details]),
    },
  };
  const response = new Response(null, {
    headers: [
      ['set-cookie', 'token=abc; Max-Age=60; HttpOnly; SameSite=Lax; Path=/'],
      ['set-cookie', 'old=; Max-Age=0; Path=/'],
    ],
  });

  await syncResponseCookies({
    request: new Request('http://localhost:3000/'),
    response,
    session,
  });

  const setCall = calls.find(([kind]) => kind === 'set');
  assert.equal(setCall[1].sameSite, 'lax');
  assert.ok(setCall[1].expirationDate > Date.now() / 1_000);
  assert.ok(setCall[1].expirationDate < Date.now() / 1_000 + 61);
  assert.deepEqual(calls.find(([kind]) => kind === 'remove').slice(1), ['http://localhost:3000/', 'old']);
});
