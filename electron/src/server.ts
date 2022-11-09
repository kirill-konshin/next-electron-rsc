const NextServer = require('next/dist/server/next-server').default;
const http = require('http');
const path = require('path');
const fs = require('fs');
const nodeStatic = require('node-static');

// process.env.NODE_ENV = 'production';
// process.chdir(__dirname)

// Make sure commands gracefully respect termination signals (e.g. from Docker)
// Allow the graceful termination to be manually configurable
if (!process.env.NEXT_MANUAL_SIG_HANDLE) {
    process.on('SIGTERM', () => process.exit(0));
    process.on('SIGINT', () => process.exit(0));
}

let handler;

const currentPort = parseInt(process.env.PORT, 10) || 3000;
const staticServer = new nodeStatic.Server(path.join(__dirname, '..', 'static'));
const { config } = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'required-server-files.json')).toString());

const server = http.createServer(async (req, res) => {
    if (req.url.includes('/_next/')) {
        req.url = req.url.replace('/_next/static', '');
        staticServer.serve(req, res);
        return;
    }
    try {
        if (!handler) throw new Error('Handler not defined');
        await handler(req, res);
    } catch (err) {
        console.error(err);
        res.statusCode = 500;
        res.end('internal server error');
    }
});

server.listen(currentPort, (err) => {
    if (err) {
        console.error('Failed to start server', err);
        process.exit(1);
    }
    const nextServer = new NextServer({
        hostname: 'localhost',
        port: currentPort,
        dir: __dirname,
        dev: false,
        customServer: false,
        conf: config,
    });
    handler = nextServer.getRequestHandler();

    console.log('Listening on port', currentPort, 'url: http://localhost:' + currentPort);
});
