/*
 * Family Hub start script (used by the Docker image instead of `node server.js`).
 *
 * Next.js does not tell route handlers the real TCP peer address, and it keeps
 * any X-Forwarded-For a client sends. So before Next sees a request we stamp it
 * with the socket address (x-fh-peer) and whether the socket itself is TLS
 * (x-fh-tls), overwriting anything the client tried to send in those headers.
 * src/lib/network.ts then decides whether to believe X-Forwarded-* based on the
 * trusted proxy list.
 */
'use strict';
const http = require('node:http');
const https = require('node:https');

function stamp(req) {
  const s = req.socket || {};
  req.headers['x-fh-peer'] = String(s.remoteAddress || '');
  req.headers['x-fh-tls'] = s.encrypted ? '1' : '0';
}

for (const mod of [http, https]) {
  const original = mod.createServer;
  mod.createServer = function patchedCreateServer(...args) {
    const server = original.apply(this, args);
    server.prependListener('request', stamp);
    return server;
  };
}

require('./server.js');
