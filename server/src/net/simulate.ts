import type { PlayerView } from '../../../shared/protocol.ts';
import { TestClient } from './testClient.ts';

export interface SimulationOptions {
  port: number;
  pin: string;
  lobbies: number;
  players: number;
  rounds: number;
}

/** Plays complete games with bots in parallel lobbies until every podium is reached. */
export async function simulateGames(opts: SimulationOptions): Promise<void> {
  await Promise.all(Array.from({ length: opts.lobbies }, (_, i) => playOne(opts, i)));
}

async function playOne(opts: SimulationOptions, index: number): Promise<void> {
  const clients: TestClient[] = [];
  try {
    const host = await TestClient.connect(opts.port);
    clients.push(host);
    host.send({ t: 'create', pin: opts.pin, name: `Host${index}` });
    await host.next((m) => m.t === 'welcome', 'welcome');
    for (let p = 1; p < opts.players; p++) {
      const c = await TestClient.connect(opts.port);
      clients.push(c);
      c.send({ t: 'join', code: host.code, name: `Bot${p}` });
      await c.next((m) => m.t === 'welcome', 'welcome');
    }
    await waitAll(clients, (v) => v.players.length === opts.players);
    for (const c of clients) c.send({ t: 'ready', ready: true });
    await host.state((v) => v.players.every((p) => p.ready), 'all ready');
    host.send({ t: 'start' });

    for (let round = 1; round <= opts.rounds; round++) {
      await waitAll(clients, (v) => v.phase === 'writing' && v.round?.number === round);
      // a few identical answers so grouping is exercised too
      clients.forEach((c, i) => c.send({ t: 'submit', text: `Antwort ${i % 4} in Runde ${round}` }));
      const views = await waitAll(clients, (v) => v.phase === 'voting' && v.round?.number === round);
      clients.forEach((c, i) => {
        const stacks = views[i]!.round!.stacks!;
        c.send({ t: 'vote', stack: stacks[(i + round) % stacks.length]!.id });
      });
      await waitAll(clients, (v) => v.phase === 'reveal' && v.round?.number === round);
      const last = round === opts.rounds;
      clients.forEach((c, i) => c.send({ t: 'decide', decision: last && i > 0 ? 'pass' : 'continue' }));
    }
    await waitAll(clients, (v) => v.phase === 'finished');
  } finally {
    await Promise.all(clients.map((c) => c.close()));
  }
}

function waitAll(clients: TestClient[], pred: (v: PlayerView) => boolean): Promise<PlayerView[]> {
  return Promise.all(clients.map((c) => c.state(pred)));
}
