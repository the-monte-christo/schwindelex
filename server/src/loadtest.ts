// Bigger load and leak test: npm run loadtest
// Plays several batches of parallel games and compares the heap after each batch.
import type { Judge } from './ai/judge.ts';
import { exactJudge } from './ai/judge.ts';
import type { Word } from './game/types.ts';
import { startServer } from './net/server.ts';
import { simulateGames } from './net/simulate.ts';

const LOBBIES = Number(process.env.LOBBIES ?? 20);
const PLAYERS = Number(process.env.PLAYERS ?? 10);
const ROUNDS = Number(process.env.ROUNDS ?? 3);
const BATCHES = Number(process.env.BATCHES ?? 5);

const gc = (globalThis as { gc?: () => void }).gc;
if (!gc) throw new Error('mit --expose-gc starten (npm run loadtest)');

const words: Word[] = Array.from({ length: 50 }, (_, i) => ({ id: `w${i}`, word: `Wort${i}`, pos: 'noun', definition: `Bedeutung ${i}` }));
// Haiku takes about a second per round
const judge: Judge = (req) => new Promise((resolve) => setTimeout(() => resolve(exactJudge(req)), 1000));

const server = await startServer({
  port: 0,
  publicUrl: 'http://localhost',
  hostPin: 'pin',
  words,
  judge,
  createLimit: 100_000,
  maxConnectionsPerIp: 100_000,
  log: () => {},
});

const heapMb = () => {
  gc();
  return process.memoryUsage().heapUsed / 1024 / 1024;
};

console.log(`${BATCHES} Durchgänge × ${LOBBIES} Lobbys × ${PLAYERS} Spieler × ${ROUNDS} Runden`);
const baseline = heapMb();
const heaps: number[] = [];
for (let b = 1; b <= BATCHES; b++) {
  const started = performance.now();
  const cpu = process.cpuUsage();
  await simulateGames({ port: server.port, pin: 'pin', lobbies: LOBBIES, players: PLAYERS, rounds: ROUNDS });
  const ms = performance.now() - started;
  const cpuMs = (process.cpuUsage(cpu).user + process.cpuUsage(cpu).system) / 1000;
  const heap = heapMb();
  heaps.push(heap);
  console.log(
    `#${b}: ${(ms / 1000).toFixed(1)} s, CPU ${(cpuMs / 1000).toFixed(1)} s (Server + Bots), ` +
      `Heap ${heap.toFixed(1)} MB, offene Lobbys ${server.manager.lobbies.size}`,
  );
}
await server.close();

const growth = heaps.at(-1)! - heaps[0]!;
console.log(`Heap: Start ${baseline.toFixed(1)} MB, nach Durchgang 1 ${heaps[0]!.toFixed(1)} MB, am Ende ${heaps.at(-1)!.toFixed(1)} MB`);
console.log(growth > 5 ? `⚠ Heap wächst um ${growth.toFixed(1)} MB – Leck verdächtig` : '✓ kein Wachstum nach dem ersten Durchgang');
process.exitCode = growth > 5 || server.manager.lobbies.size > 0 ? 1 : 0;
