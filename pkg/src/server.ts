const NextServer = require('next/dist/server/next-server').default;
const express = require('express');

const { config: conf, standalonePath: dir, staticPath } = global as any;

const nextServer = new NextServer({
    dir,
    dev: false,
    customServer: false,
    conf,
});

const handler = nextServer.getRequestHandler();

const app = express();

app.use('/_next/static', express.static(staticPath));

app.get('*', handler);

app.listen(process.env.PORT || 3000);
