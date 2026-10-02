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
  /** Open WebSockets per IP – a party shares one IP, so keep it generous. */
  maxConnectionsPerIp?: number;
  maxConnections?: number;
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

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  // inline styles stay allowed for per-element rotation in the scribbly design
  'content-security-policy':
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; " +
    "frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};

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
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    if (url.pathname === '/healthz') {
      const health = { ok: true, lobbies: manager.lobbies.size, activeGames: manager.activeGames(), connections: wss.clients.size };
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(health));
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
  const perIp = new Map<string, number>();
  const maxPerIp = options.maxConnectionsPerIp ?? 60;
  const maxTotal = options.maxConnections ?? 2000;

  http.on('upgrade', (req, socket, head) => {
    const ip = clientIp(req, options.trustProxy ?? false);
    const pathOk = (req.url ?? '').split('?')[0] === '/ws';
    if (!pathOk || wss.clients.size >= maxTotal || (perIp.get(ip) ?? 0) >= maxPerIp) {
      socket.end(pathOk ? 'HTTP/1.1 503 Service Unavailable\r\n\r\n' : 'HTTP/1.1 404 Not Found\r\n\r\n');
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, ip));
  });

  const alive = new WeakSet<WebSocket>();

  function onConnection(ws: WebSocket, ip: string): void {
    perIp.set(ip, (perIp.get(ip) ?? 0) + 1);
    ws.once('close', () => {
      const n = (perIp.get(ip) ?? 1) - 1;
      if (n > 0) perIp.set(ip, n);
      else perIp.delete(ip);
    });
    const peer: Peer = {
      ip,
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
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  let file = resolve(join(root, normalize(decoded)));
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
