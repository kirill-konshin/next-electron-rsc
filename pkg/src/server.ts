const NextServer = require('next/dist/server/next-server').default;
const express = require('express');

const { config: conf, nextPath: dir, staticPath } = global as any;

const hostname = 'localhost';
const port = process.env.PORT || 3000;

const nextServer = new NextServer({
    dir,
    dev: false,
    customServer: false,
    conf,
    hostname,
    port,
});

const handler = nextServer.getRequestHandler();

const app = express();

app.use('/_next/static', express.static(staticPath));

app.get('*', handler);

app.listen(port);
