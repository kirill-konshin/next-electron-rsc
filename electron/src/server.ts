import type { ProtocolRequest } from 'electron';

const NextServer = require('next/dist/server/next-server').default;
const express = require('express');
const request = require('supertest');

const { config: conf, standalonePath: dir } = global as any;

const nextServer = new NextServer({
    dir,
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
        console.log('[SERVER] Handler', req.url);
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
    console.error('[SERVER] Error', err);
    res.writeHead(500, 'Internal Server Error');
    res.end();
});

exports.handleRequest = async (req: ProtocolRequest) =>
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
