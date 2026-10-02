import { describe, expect, it } from 'vitest';
import { WebSocket as WsClient } from 'ws';
import type { Judge } from '../ai/judge.ts';
import { exactJudge } from '../ai/judge.ts';
import type { Word } from '../game/types.ts';
import { startServer } from './server.ts';
import { simulateGames } from './simulate.ts';

const words: Word[] = Array.from({ length: 30 }, (_, i) => ({
  id: `w${i}`,
  word: `Wort${i}`,
  pos: 'noun',
  definition: `Bedeutung ${i}`,
}));

/** Like the AI: answers after a short delay. */
const slowJudge: Judge = (req) => new Promise((resolve) => setTimeout(() => resolve(exactJudge(req)), 50));

describe('load', () => {
  it('runs 10 lobbies × 8 players × 3 rounds in parallel and cleans up afterwards', async () => {
    const server = await startServer({
      port: 0,
      publicUrl: 'http://localhost',
      hostPin: 'pin',
      words,
      judge: slowJudge,
      createLimit: 100,
      maxConnectionsPerIp: 1000, // all bots come from localhost
      log: () => {},
    });
    try {
      await simulateGames({ port: server.port, pin: 'pin', lobbies: 10, players: 8, rounds: 3 });
      expect(server.manager.lobbies.size).toBe(0);
      expect(server.manager.activeGames()).toBe(0);
    } finally {
      await server.close();
    }
  }, 30_000);

  it('behind the proxy counts X-Real-IP and ignores a forged X-Forwarded-For', async () => {
    const server = await startServer({
      port: 0,
      publicUrl: 'http://localhost',
      hostPin: 'pin',
      words,
      judge: exactJudge,
      trustProxy: true,
      maxConnectionsPerIp: 1,
      log: () => {},
    });
    const open = (headers: Record<string, string>): Promise<WsClient | null> =>
      new Promise((resolve) => {
        const ws = new WsClient(`ws://127.0.0.1:${server.port}/ws`, { headers });
        ws.on('open', () => resolve(ws));
        ws.on('error', () => resolve(null));
      });
    try {
      const a = await open({ 'x-real-ip': '10.0.0.1', 'x-forwarded-for': '1.1.1.1' });
      const b = await open({ 'x-real-ip': '10.0.0.2', 'x-forwarded-for': '1.1.1.1' });
      const c = await open({ 'x-real-ip': '10.0.0.1', 'x-forwarded-for': '2.2.2.2' });
      expect(a).not.toBeNull();
      expect(b).not.toBeNull(); // same forged XFF, different real IP → allowed
      expect(c).toBeNull(); // forged XFF does not help, real IP is at its limit
      a?.close();
      b?.close();
    } finally {
      await server.close();
    }
  });

  it('refuses WebSockets beyond the per-IP limit', async () => {
    const server = await startServer({
      port: 0,
      publicUrl: 'http://localhost',
      hostPin: 'pin',
      words,
      judge: exactJudge,
      maxConnectionsPerIp: 3,
      log: () => {},
    });
    const open = (): Promise<WebSocket | null> =>
      new Promise((resolve) => {
        const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
        ws.onopen = () => resolve(ws);
        ws.onerror = () => resolve(null);
      });
    try {
      const sockets = [await open(), await open(), await open()];
      expect(sockets.every(Boolean)).toBe(true);
      expect(await open()).toBeNull();
      sockets[0]!.close();
      await new Promise((r) => setTimeout(r, 100));
      const again = await open();
      expect(again).not.toBeNull();
      for (const ws of [...sockets, again]) ws?.close();
    } finally {
      await server.close();
    }
  });
});
