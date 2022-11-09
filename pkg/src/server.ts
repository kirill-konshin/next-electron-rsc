const NextServer = require('next/dist/server/next-server').default;
const path = require('path');
const fs = require('fs');
const http = require('http');
// const express = require('express');

process.env.NODE_ENV = 'production';
// process.chdir(__dirname)

// Make sure commands gracefully respect termination signals (e.g. from Docker)
// Allow the graceful termination to be manually configurable
if (!process.env.NEXT_MANUAL_SIG_HANDLE) {
    process.on('SIGTERM', () => process.exit(0));
    process.on('SIGINT', () => process.exit(0));
}

const nextPath = path.join(__dirname, '.next');

const port = parseInt(process.env.PORT, 10) || 3000;
const { config: conf } = JSON.parse(fs.readFileSync(path.join(nextPath, 'required-server-files.json')).toString());

const nextServer = new NextServer({
    hostname: 'localhost',
    port,
    dir: path.join(nextPath, 'standalone'),
    dev: false,
    customServer: false,
    conf,
});

const handler = nextServer.getRequestHandler();

// const app = express();
//
// app.use('/_next/static', express.static(path.join(nextPath, 'static')));
//
// app.get('*', async (req, res) => {
//     console.log('APP HANDLER', req.url);
//     try {
//         await handler(req, res);
//     } catch (err) {
//         console.error('APP ERROR', err);
//         res.statusCode = 500;
//         res.end('internal server error');
//     }
// });
//
// app.listen(port);

const server = http.createServer(async (req, res) => {
    if (req.url.includes('/_next/')) {
        const file = req.url.replace('/_next/static', path.join(nextPath, 'static'));

        fs.readFile(file, function (err, data) {
            if (err) {
                console.error('File not found', err);
                res.writeHead(404, 'File not found');
                res.end();
                return;
            }
            res.writeHead(200);
            res.end(data);
        });

        return;
    }
    try {
        await handler(req, res);
    } catch (err) {
        console.error(err);
        res.writeHead(500, 'Internal Server Error');
        res.end();
    }
});

server.listen(port, (err) => {
    if (err) {
        console.error('Failed to start server', err);
        process.exit(1);
    }
    console.log('Listening on port', port, 'url: http://localhost:' + port);
});
