import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize, resolve, sep } from 'node:path';
import QRCode from 'qrcode';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ServerMessage } from '../../../shared/protocol.ts';
import { LobbyManager, type ManagerOptions, type Peer } from './lobbies.ts';
import { RateLimiter } from './rateLimit.ts';
import { parseClientMessage } from './validate.ts';

export interface ServerOptions extends ManagerOptions {
  port: number;
  publicUrl: string;
  /** Built client (Vite output). Missing directory is fine during development. */
  staticDir?: string;
  trustProxy?: boolean;
  heartbeatMs?: number;
}

export interface RunningServer {
  port: number;
  manager: LobbyManager;
  close(): Promise<void>;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

/** Max client messages per second per connection (drafts are debounced client-side). */
const MESSAGES_PER_SECOND = 20;

export async function startServer(options: ServerOptions): Promise<RunningServer> {
  const manager = new LobbyManager(options);
  const staticDir = options.staticDir ? resolve(options.staticDir) : null;
  const log = options.log ?? console.log;

  const http = createServer((req, res) => {
    handleHttp(req, res).catch((err: unknown) => {
      log(`http error: ${String(err)}`);
      if (!res.headersSent) res.writeHead(500).end();
    });
  });

  async function handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://x');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end(`ok ${manager.lobbies.size}`);
      return;
    }
    const qr = /^\/qr\/([A-Za-z]{4})\.svg$/.exec(url.pathname);
    if (qr) {
      const code = qr[1]!.toUpperCase();
      if (!manager.lobbies.has(code)) {
        res.writeHead(404).end();
        return;
      }
      const svg = await QRCode.toString(inviteUrl(options.publicUrl, code), {
        type: 'svg',
        margin: 1,
        errorCorrectionLevel: 'M',
      });
      res.writeHead(200, { 'content-type': MIME['.svg']!, 'cache-control': 'private, max-age=3600' }).end(svg);
      return;
    }
    serveStatic(staticDir, url.pathname, res);
  }

  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  http.on('upgrade', (req, socket, head) => {
    if (new URL(req.url ?? '/', 'http://x').pathname !== '/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, req));
  });

  const alive = new WeakSet<WebSocket>();

  function onConnection(ws: WebSocket, req: IncomingMessage): void {
    const peer: Peer = {
      ip: clientIp(req, options.trustProxy ?? false),
      send(msg: ServerMessage) {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
      },
    };
    const limiter = new RateLimiter(MESSAGES_PER_SECOND, 1000);
    alive.add(ws);
    ws.on('pong', () => alive.add(ws));
    ws.on('message', (data, isBinary) => {
      if (isBinary || !limiter.hit('m')) return;
      const msg = parseClientMessage(data.toString());
      if (!msg) {
        peer.send({ t: 'error', code: 'bad_message' });
        return;
      }
      manager.handle(peer, msg);
    });
    ws.on('close', () => manager.disconnect(peer));
    ws.on('error', () => ws.terminate());
  }

  // Phones drop connections silently (screen lock, network switch) – detect them via ping/pong.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.has(ws)) {
        ws.terminate();
        continue;
      }
      alive.delete(ws);
      ws.ping();
    }
  }, options.heartbeatMs ?? 25_000);

  const sweeper = setInterval(() => manager.sweep(), 60_000);

  await new Promise<void>((done) => http.listen(options.port, done));
  const port = (http.address() as AddressInfo).port;

  return {
    port,
    manager,
    async close() {
      clearInterval(heartbeat);
      clearInterval(sweeper);
      manager.close();
      for (const ws of wss.clients) ws.terminate();
      wss.close();
      await new Promise<void>((done) => http.close(() => done()));
    },
  };
}

export function inviteUrl(publicUrl: string, code: string): string {
  return `${publicUrl}/?c=${code}`;
}

function clientIp(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

function serveStatic(root: string | null, pathname: string, res: ServerResponse): void {
  if (!root || !existsSync(root)) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('client not built');
    return;
  }
  let file = resolve(join(root, normalize(decodeURIComponent(pathname))));
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403).end();
    return;
  }
  // SPA: unknown paths without extension fall back to index.html
  if (!existsSync(file) || statSync(file).isDirectory()) {
    if (extname(pathname)) {
      res.writeHead(404).end();
      return;
    }
    file = join(root, 'index.html');
  }
  const hashed = file.includes(`${sep}assets${sep}`);
  res.writeHead(200, {
    'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(file).pipe(res);
}
