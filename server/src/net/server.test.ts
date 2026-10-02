import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Judge } from '../ai/judge.ts';
import { exactJudge } from '../ai/judge.ts';
import type { Word } from '../game/types.ts';
import { startServer, type RunningServer, type ServerOptions } from './server.ts';
import { TestClient } from './testClient.ts';

const PIN = '4711';
const words: Word[] = [
  { id: 'w1', word: 'Mumpitz', pos: 'noun', definition: 'Quatsch, Blödsinn' },
  { id: 'w2', word: 'Firlefanz', pos: 'noun', definition: 'unnützes Zeug' },
];

let server: RunningServer;
const clients: TestClient[] = [];

async function boot(extra: Partial<ServerOptions> = {}) {
  server = await startServer({
    port: 0,
    publicUrl: 'http://localhost:9999',
    hostPin: PIN,
    words,
    judge: exactJudge,
    log: () => {},
    ...extra,
  });
}

async function client(): Promise<TestClient> {
  const c = await TestClient.connect(server.port);
  clients.push(c);
  return c;
}

/** Host + guests in one lobby, all welcomed. */
async function lobbyWith(names: string[]): Promise<TestClient[]> {
  const [hostName, ...guestNames] = names;
  const host = await client();
  host.send({ t: 'create', pin: PIN, name: hostName! });
  await host.next((m) => m.t === 'welcome');
  const guests: TestClient[] = [];
  for (const name of guestNames) {
    const g = await client();
    g.send({ t: 'join', code: host.code.toLowerCase(), name });
    await g.next((m) => m.t === 'welcome');
    guests.push(g);
  }
  const all = [host, ...guests];
  await Promise.all(all.map((c) => c.state((v) => v.players.length === names.length)));
  return all;
}

async function startGame(all: TestClient[]) {
  for (const c of all) c.send({ t: 'ready', ready: true });
  await all[0]!.state((v) => v.players.every((p) => p.ready));
  all[0]!.send({ t: 'start' });
  await Promise.all(all.map((c) => c.state((v) => v.phase === 'writing')));
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
  await server?.close();
});

describe('lobby over WebSocket', () => {
  it('rejects a wrong PIN and creates a lobby with the right one', async () => {
    await boot();
    const host = await client();
    host.send({ t: 'create', pin: 'falsch', name: 'Anna' });
    expect(await host.error()).toBe('bad_pin');
    host.send({ t: 'create', pin: PIN, name: 'Anna' });
    await host.next((m) => m.t === 'welcome');
    const view = await host.state((v) => v.phase === 'lobby');
    expect(view.code).toMatch(/^[A-Z]{4}$/);
    expect(view.hostId).toBe(host.playerId);
    expect(server.manager.lobbies.size).toBe(1);
  });

  it('rate-limits lobby creation per IP', async () => {
    await boot();
    const c = await client();
    for (let i = 0; i < 10; i++) c.send({ t: 'create', pin: 'x', name: 'A' });
    for (let i = 0; i < 10; i++) expect(await c.error()).toBe('bad_pin');
    c.send({ t: 'create', pin: PIN, name: 'A' });
    expect(await c.error()).toBe('rate_limited');
  });

  it('reports unknown codes, malformed messages and actions before joining', async () => {
    await boot();
    const c = await client();
    c.send({ t: 'join', code: 'ZZZZ', name: 'Bob' });
    expect(await c.error()).toBe('lobby_not_found');
    c.sendRaw('{"t":"vote"}');
    expect(await c.error()).toBe('bad_message');
    c.sendRaw('kein json');
    expect(await c.error()).toBe('bad_message');
    c.send({ t: 'start' });
    expect(await c.error()).toBe('not_joined');
  });

  it('blocks code guessing but not many successful joins from one IP', async () => {
    await boot();
    const [host] = await lobbyWith(['Anna', ...Array.from({ length: 15 }, (_, i) => `G${i}`)]);
    const guesser = await client();
    for (let i = 0; i < 20; i++) guesser.send({ t: 'join', code: 'ZZZZ', name: 'X' });
    for (let i = 0; i < 20; i++) expect(await guesser.error()).toBe('lobby_not_found');
    const sameIp = await client();
    sameIp.send({ t: 'join', code: host!.code, name: 'X' });
    expect(await sameIp.error()).toBe('rate_limited');
  });

  it('rejects duplicate names', async () => {
    await boot();
    const [host] = await lobbyWith(['Anna']);
    const c = await client();
    c.send({ t: 'join', code: host!.code, name: 'ANNA' });
    expect(await c.error()).toBe('name_taken');
  });

  it('serves the invite QR code while the lobby exists', async () => {
    await boot();
    const [host] = await lobbyWith(['Anna']);
    const res = await fetch(`http://127.0.0.1:${server.port}/qr/${host!.code.toLowerCase()}.svg`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('svg');
    expect(await res.text()).toContain('<svg');
    expect((await fetch(`http://127.0.0.1:${server.port}/qr/QQQQ.svg`)).status).toBe(404);
  });

  it('a player who disconnects in the lobby loses the seat after the grace period, host moves on', async () => {
    await boot({ lobbyGraceMs: 100 });
    const [host, bob] = await lobbyWith(['Anna', 'Bob']);
    await host!.close();
    const view = await bob!.state((v) => v.players.length === 1, 'host removed');
    expect(view.hostId).toBe(bob!.playerId);
  });

  it('the last player leaving deletes the lobby', async () => {
    await boot();
    const [host] = await lobbyWith(['Anna']);
    host!.send({ t: 'leave' });
    await host!.next((m) => m.t === 'closed');
    expect(server.manager.lobbies.size).toBe(0);
  });
});

describe('a full game over WebSocket', () => {
  it('plays a round end to end without leaking secrets', async () => {
    await boot();
    const all = await lobbyWith(['Anna', 'Bob', 'Cleo']);
    const [anna, bob, cleo] = all as [TestClient, TestClient, TestClient];
    await startGame(all);

    // Writing: nobody sees other answers
    anna.send({ t: 'submit', text: 'ein geheimer Hut' });
    bob.send({ t: 'draft', text: 'eine Vogelart' });
    await cleo.state((v) => v.players.find((p) => p.id === anna.playerId)!.done);
    expect(JSON.stringify(cleo.view)).not.toContain('geheimer Hut');
    expect(JSON.stringify(cleo.view)).not.toContain('Vogelart');
    expect(cleo.view!.round!.myAnswer).toEqual({ text: '', submitted: false });
    expect(JSON.stringify(cleo.view)).not.toContain(words[0]!.definition);
    expect(JSON.stringify(cleo.view)).not.toContain(words[1]!.definition);

    bob.send({ t: 'submit', text: 'eine Vogelart' });
    cleo.send({ t: 'submit', text: 'Quatsch, Blödsinn' }); // literally correct if the word is Mumpitz

    // Voting: no authors, no truth flag
    const voting = await anna.state((v) => v.phase === 'voting');
    const json = JSON.stringify(voting);
    expect(json).not.toContain('isTrue');
    expect(json).not.toContain('authors');
    expect(voting.round!.deadline! - voting.serverNow).toBeLessThanOrEqual(30_000);
    expect(voting.round!.myStack).toBeTruthy();

    // Everyone votes Anna's stack
    const annaStack = voting.round!.myStack!;
    for (const c of all) c.send({ t: 'vote', stack: annaStack });

    const reveal = await anna.state((v) => v.phase === 'reveal');
    const revealed = reveal.round!.reveal!;
    expect(revealed.stacks.find((s) => s.id === annaStack)!.authors).toEqual([anna.playerId]);
    expect(revealed.scores[anna.playerId]!.bluff).toBe(2);
    expect(revealed.definition).toBe(
      words.find((w) => w.word === reveal.round!.word)!.definition,
    );

    // Two pass → game over, lobby is deleted after the final snapshot
    anna.send({ t: 'decide', decision: 'continue' });
    bob.send({ t: 'decide', decision: 'pass' });
    cleo.send({ t: 'decide', decision: 'pass' });
    const final = await bob.state((v) => v.phase === 'finished');
    expect(final.players.find((p) => p.id === anna.playerId)!.score).toBeGreaterThanOrEqual(2);
    expect(server.manager.lobbies.size).toBe(0);
  });

  it('a reconnecting player gets the same seat back, a second tab replaces the first', async () => {
    await boot();
    const all = await lobbyWith(['Anna', 'Bob']);
    const [anna, bob] = all as [TestClient, TestClient];
    await startGame(all);
    anna.send({ t: 'draft', text: 'halb fertig' });
    await anna.state((v) => v.round!.myAnswer!.text === 'halb fertig');

    await anna.close();
    await bob.state((v) => !v.players.find((p) => p.id === anna.playerId)!.connected);

    const again = await client();
    again.send({ t: 'resume', code: anna.code, token: anna.token });
    await again.next((m) => m.t === 'welcome');
    expect(again.playerId).toBe(anna.playerId);
    const view = await again.state((v) => v.phase === 'writing');
    expect(view.round!.myAnswer!.text).toBe('halb fertig');
    await bob.state((v) => v.players.find((p) => p.id === anna.playerId)!.connected);

    const tab2 = await client();
    tab2.send({ t: 'resume', code: anna.code, token: anna.token });
    await tab2.next((m) => m.t === 'welcome');
    const closed = await again.next((m) => m.t === 'closed');
    expect(closed).toEqual({ t: 'closed', reason: 'replaced' });
  });

  it('handles a full lobby of 20 players over two rounds', async () => {
    await boot();
    const names = Array.from({ length: 20 }, (_, i) => `Spieler${i + 1}`);
    const all = await lobbyWith(names);
    const extra = await client();
    extra.send({ t: 'join', code: all[0]!.code, name: 'Nummer21' });
    expect(await extra.error()).toBe('lobby_full');
    await startGame(all);

    for (let round = 1; round <= 2; round++) {
      all.forEach((c, i) => c.send({ t: 'submit', text: `Antwort ${round}-${i % 7}` }));
      const voting = await Promise.all(all.map((c) => c.state((v) => v.phase === 'voting')));
      expect(voting[0]!.round!.stacks).toHaveLength(8); // 7 groups + truth
      expect(voting[0]!.round!.deadline! - voting[0]!.serverNow).toBeLessThanOrEqual(105_000);
      all.forEach((c, i) => c.send({ t: 'vote', stack: voting[i]!.round!.stacks![0]!.id }));
      await Promise.all(all.map((c) => c.state((v) => v.phase === 'reveal')));
      all.forEach((c) => c.send({ t: 'decide', decision: 'continue' }));
      await Promise.all(all.map((c) => c.state((v) => v.round!.number === round + 1)));
    }
  });

  it('resume with an unknown token says the lobby is gone', async () => {
    await boot();
    const c = await client();
    c.send({ t: 'resume', code: 'ABCD', token: 'nope' });
    expect(await c.next((m) => m.t === 'closed')).toEqual({ t: 'closed', reason: 'not_found' });
  });

  it('late joiners wait for the next round', async () => {
    await boot();
    const all = await lobbyWith(['Anna', 'Bob']);
    await startGame(all);
    const late = await client();
    late.send({ t: 'join', code: all[0]!.code, name: 'Dora' });
    await late.next((m) => m.t === 'welcome');
    const view = await late.state((v) => v.players.length === 3);
    expect(view.players.find((p) => p.id === late.playerId)).toMatchObject({ pending: true, inRound: false });
    expect(view.round!.myAnswer).toBeUndefined();
  });

  it('falls back when the AI judge fails', async () => {
    const failing: Judge = async () => {
      throw new Error('API down');
    };
    await boot({ judge: failing });
    const all = await lobbyWith(['Anna', 'Bob']);
    await startGame(all);
    all[0]!.send({ t: 'submit', text: 'Hut' });
    all[1]!.send({ t: 'submit', text: 'hut' });
    const v = await all[0]!.state((x) => x.phase === 'voting');
    expect(v.round!.stacks).toHaveLength(2); // truth + grouped "hut"
  });
});

describe('static files', () => {
  it('serves the client with SPA fallback and blocks path traversal', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'schwindelex-'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Schwindelex</title>');
    await boot({ staticDir: dir });
    const base = `http://127.0.0.1:${server.port}`;
    expect(await (await fetch(`${base}/`)).text()).toContain('Schwindelex');
    expect(await (await fetch(`${base}/lobby/ABCD`)).text()).toContain('Schwindelex');
    expect((await fetch(`${base}/fehlt.js`)).status).toBe(404);
    expect((await fetch(`${base}/..%2f..%2fpackage.json`)).status).not.toBe(200);
    expect(await (await fetch(`${base}/healthz`)).json()).toMatchObject({ ok: true, lobbies: 0 });
    const page = await fetch(`${base}/`);
    expect(page.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(page.headers.get('x-content-type-options')).toBe('nosniff');
    expect((await fetch(`${base}/%E0%A4%A`)).status).toBe(400);
  });
});
