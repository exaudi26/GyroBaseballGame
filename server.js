'use strict';

/**
 * Bridge between the phone app and the browser game.
 *
 *   phone --UDP:5005--> this server --SSE /events--> browser (http://localhost:3000)
 *
 * Usage: node server.js   (no dependencies besides ./logger)
 */

const dgram = require('dgram');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const logger = require('./logger');

const UDP_PORT = 5005;
const PHONE_REPLY_PORT = 5006;
const HTTP_PORT = 3000;
const HEARTBEAT_INTERVAL_MS = 15000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/** Open SSE responses. */
const clients = new Set();

function broadcast(message) {
  for (const client of clients) {
    client.write(`data: ${message}\n\n`);
  }
}

function localIpv4Addresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((iface) => iface.family === 'IPv4' && !iface.internal)
    .map((iface) => iface.address);
}

// UDP: telemetry from the phone

const udp = dgram.createSocket('udp4');

udp.on('message', (buffer, remote) => {
  const message = buffer.toString().trim();

  // Latency probe from the app: echo the payload back.
  if (message.startsWith('PING:')) {
    udp.send(`PONG:${message.slice('PING:'.length)}`, PHONE_REPLY_PORT, remote.address);
    return;
  }

  // "pitch,roll,yaw,isSwing,peak" or "CALIBRATE"
  logger.record(message);
  broadcast(message);
});

udp.on('error', (error) => {
  console.error(`UDP error: ${error.message}`);
});

udp.bind(UDP_PORT, () => {
  console.log(`UDP listening on :${UDP_PORT}`);
  console.log(`Enter one of these addresses in the phone app: ${localIpv4Addresses().join(', ')}`);
});

// HTTP: static files and the event stream

function handleEventStream(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(': connected\n\n');

  clients.add(res);
  req.on('close', () => clients.delete(res));
}

function sendStatus(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

function serveStaticFile(req, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    sendStatus(res, 400, 'Bad request');
    return;
  }

  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.join(PUBLIC_DIR, relativePath);

  // Reject anything that resolves outside the public directory.
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    sendStatus(res, 403, 'Forbidden');
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendStatus(res, 404, 'Not found');
      return;
    }

    res.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(filePath)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');

  if (pathname === '/events') {
    handleEventStream(req, res);
  } else {
    serveStaticFile(req, res);
  }
});

server.listen(HTTP_PORT, () => {
  console.log(`Game: http://localhost:${HTTP_PORT}`);
});

// Keep idle SSE connections from being closed by proxies or the browser.
setInterval(() => {
  for (const client of clients) {
    client.write(': ping\n\n');
  }
}, HEARTBEAT_INTERVAL_MS).unref();
