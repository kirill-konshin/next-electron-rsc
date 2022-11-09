const NextServer = require('next/dist/server/next-server').default;
const path = require('path');
const fs = require('fs');
const express = require('express');
const request = require('supertest');

const nextPath = path.join(__dirname, '..', 'out');
const { config: conf } = JSON.parse(fs.readFileSync(path.join(nextPath, 'required-server-files.json')).toString());

const nextServer = new NextServer({
    dir: path.join(nextPath, 'standalone'),
    dev: false,
    customServer: false,
    conf,
});

const handler = nextServer.getRequestHandler();

const app = express();
const token = Math.random().toString();

const wrapRoute = (fn) => async (req, res, next) => {
    try {
        await fn(req, res, next);
    } catch (e) {
        next(e);
    }
};

app.get(
    '*',
    wrapRoute(async (req, res) => {
        console.log('APP HANDLER', req.url);
        if (req.headers.authorization !== token) {
            throw new Error('Unauthorized');
        }
        await handler(req, res);
    })
);

app.use(function errorHandler(err, req, res, next) {
    if (res.headersSent) {
        return next(err);
    }
    console.error('SERVER ERROR', err);
    res.writeHead(500, 'Internal Server Error');
    res.end();
});

module.exports.handleRequest = async (req) =>
    new Promise((resolve, reject) => {
        const url = new URL(req.url);
        request(app) // this opens a port
            .get(url.pathname + url.search)
            .set('Authorization', token)
            .end((err, res) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(res.text);
            });
    });
