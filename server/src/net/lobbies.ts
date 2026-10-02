import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { ClientMessage, ErrorCode, ServerMessage } from '../../../shared/protocol.ts';
import type { Judge } from '../ai/judge.ts';
import { Game } from '../game/game.ts';
import { fallbackJudge, type Rng } from '../game/rules.ts';
import { GameError, type JudgeRequest, type Word } from '../game/types.ts';
import { RateLimiter } from './rateLimit.ts';
import { viewFor } from './view.ts';

/** One client connection, independent of the transport (WebSocket in production, fakes in tests). */
export interface Peer {
  ip: string;
  send(msg: ServerMessage): void;
}

interface Session {
  token: string;
  playerId: string;
  peer: Peer | null;
  /** Last snapshot sent (without serverNow) to skip unchanged updates. */
  lastKey: string;
  graceTimer: NodeJS.Timeout | null;
}

export interface Lobby {
  code: string;
  game: Game;
  sessions: Map<string, Session>;
  timer: NodeJS.Timeout | null;
  createdAt: number;
  lastActivity: number;
}

export interface ManagerOptions {
  hostPin: string;
  words: readonly Word[];
  judge: Judge;
  now?: () => number;
  rng?: Rng;
  /** How long a disconnected player keeps the seat before the game starts. */
  lobbyGraceMs?: number;
  /** Lobbies without connected players are removed after this time. */
  idleMs?: number;
  maxAgeMs?: number;
  maxLobbies?: number;
  log?: (msg: string) => void;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LENGTH = 4;

const ERROR_CODES = new Set<string>([
  'lobby_not_found', 'game_finished', 'lobby_full', 'name_taken', 'name_invalid', 'not_host',
  'not_enough_players', 'not_all_ready', 'wrong_phase', 'not_in_round', 'unknown_stack',
  'pending_player', 'bad_pin', 'rate_limited', 'server_full', 'not_joined', 'already_joined',
] satisfies ErrorCode[]);

export class LobbyManager {
  readonly lobbies = new Map<string, Lobby>();
  private bindings = new Map<Peer, { lobby: Lobby; session: Session }>();
  private opts: Required<ManagerOptions>;
  private createLimiter: RateLimiter;
  /** Only failed join/resume attempts count – a whole party shares one IP. */
  private joinFailures: RateLimiter;

  constructor(options: ManagerOptions) {
    this.opts = {
      now: Date.now,
      rng: Math.random,
      lobbyGraceMs: 60_000,
      idleMs: 30 * 60_000,
      maxAgeMs: 12 * 60 * 60_000,
      maxLobbies: 200,
      log: (msg) => console.log(msg),
      ...options,
    };
    this.createLimiter = new RateLimiter(10, 10 * 60_000, this.opts.now);
    this.joinFailures = new RateLimiter(20, 60_000, this.opts.now);
  }

  handle(peer: Peer, msg: ClientMessage): void {
    try {
      this.dispatch(peer, msg);
    } catch (err) {
      if (err instanceof GameError && ERROR_CODES.has(err.code)) {
        peer.send({ t: 'error', code: err.code as ErrorCode });
      } else {
        this.opts.log(`error handling ${msg.t}: ${err instanceof Error ? err.stack : String(err)}`);
        peer.send({ t: 'error', code: 'internal' });
      }
    }
  }

  disconnect(peer: Peer): void {
    const bound = this.bindings.get(peer);
    if (!bound) return;
    this.bindings.delete(peer);
    const { lobby, session } = bound;
    if (session.peer !== peer) return;
    session.peer = null;
    session.lastKey = '';
    if (!this.lobbies.has(lobby.code)) return;
    lobby.game.setConnected(session.playerId, false);
    if (lobby.game.phase === 'lobby') {
      session.graceTimer = setTimeout(() => this.dropFromLobby(lobby, session), this.opts.lobbyGraceMs);
    }
    this.afterChange(lobby);
  }

  /** Removes idle and expired lobbies; call periodically. */
  sweep(): void {
    const now = this.opts.now();
    for (const lobby of this.lobbies.values()) {
      const anyoneConnected = [...lobby.sessions.values()].some((s) => s.peer);
      const idle = !anyoneConnected && now - lobby.lastActivity > this.opts.idleMs;
      const expired = now - lobby.createdAt > this.opts.maxAgeMs;
      if (idle || expired) {
        this.opts.log(`lobby ${lobby.code} removed (${idle ? 'idle' : 'expired'})`);
        this.deleteLobby(lobby, true);
      }
    }
    this.createLimiter.sweep();
    this.joinFailures.sweep();
  }

  close(): void {
    for (const lobby of [...this.lobbies.values()]) this.deleteLobby(lobby, false);
  }

  // ---------- message handling ----------

  private dispatch(peer: Peer, msg: ClientMessage): void {
    const bound = this.bindings.get(peer);
    if (msg.t === 'create' || msg.t === 'join' || msg.t === 'resume') {
      if (bound) throw new GameError('already_joined');
      if (msg.t === 'create') this.create(peer, msg.pin, msg.name);
      else if (msg.t === 'join') this.join(peer, msg.code, msg.name);
      else this.resume(peer, msg.code, msg.token);
      return;
    }
    if (!bound) throw new GameError('not_joined');
    const { lobby, session } = bound;
    const { game } = lobby;
    const id = session.playerId;
    lobby.lastActivity = this.opts.now();
    switch (msg.t) {
      case 'leave':
        this.leave(peer, lobby, session);
        return;
      case 'ready':
        game.setReady(id, msg.ready);
        break;
      case 'start':
        game.start(id);
        break;
      case 'draft':
        game.setDraft(id, msg.text);
        break;
      case 'submit':
        game.submit(id, msg.text);
        break;
      case 'clear':
        game.clearAnswer(id);
        break;
      case 'vote':
        game.vote(id, msg.stack);
        break;
      case 'decide':
        game.decide(id, msg.decision);
        break;
    }
    this.afterChange(lobby);
  }

  private create(peer: Peer, pin: string, name: string): void {
    if (!this.createLimiter.hit(peer.ip)) throw new GameError('rate_limited');
    if (!safeEqual(pin.trim(), this.opts.hostPin)) throw new GameError('bad_pin');
    if (this.lobbies.size >= this.opts.maxLobbies) throw new GameError('server_full');
    const now = this.opts.now();
    const lobby: Lobby = {
      code: this.newCode(),
      game: new Game({ now: this.opts.now, rng: this.opts.rng, words: this.opts.words }),
      sessions: new Map(),
      timer: null,
      createdAt: now,
      lastActivity: now,
    };
    this.addSession(peer, lobby, name); // throws on invalid name before the lobby is registered
    this.lobbies.set(lobby.code, lobby);
    this.opts.log(`lobby ${lobby.code} created (${this.lobbies.size} open)`);
    this.afterChange(lobby);
  }

  private join(peer: Peer, rawCode: string, name: string): void {
    if (this.joinFailures.exhausted(peer.ip)) throw new GameError('rate_limited');
    const lobby = this.lobbies.get(normalizeCode(rawCode));
    if (!lobby) {
      this.joinFailures.hit(peer.ip);
      throw new GameError('lobby_not_found');
    }
    this.addSession(peer, lobby, name);
    lobby.lastActivity = this.opts.now();
    this.afterChange(lobby);
  }

  private resume(peer: Peer, rawCode: string, token: string): void {
    if (this.joinFailures.exhausted(peer.ip)) throw new GameError('rate_limited');
    const lobby = this.lobbies.get(normalizeCode(rawCode));
    const session = lobby?.sessions.get(token);
    if (!lobby || !session) {
      this.joinFailures.hit(peer.ip);
      peer.send({ t: 'closed', reason: 'not_found' });
      return;
    }
    if (session.peer) {
      session.peer.send({ t: 'closed', reason: 'replaced' });
      this.bindings.delete(session.peer);
    }
    if (session.graceTimer) clearTimeout(session.graceTimer);
    session.graceTimer = null;
    session.peer = peer;
    session.lastKey = '';
    this.bindings.set(peer, { lobby, session });
    lobby.game.setConnected(session.playerId, true);
    lobby.lastActivity = this.opts.now();
    peer.send({ t: 'welcome', code: lobby.code, token: session.token, playerId: session.playerId });
    this.afterChange(lobby);
  }

  private leave(peer: Peer, lobby: Lobby, session: Session): void {
    this.bindings.delete(peer);
    session.peer = null;
    peer.send({ t: 'closed', reason: 'removed' });
    const inLobby = lobby.game.phase === 'lobby';
    lobby.game.leave(session.playerId);
    if (inLobby) lobby.sessions.delete(session.token);
    if (lobby.game.players.length === 0) this.deleteLobby(lobby, false);
    else this.afterChange(lobby);
  }

  private addSession(peer: Peer, lobby: Lobby, name: string): void {
    const playerId = randomBytes(6).toString('base64url');
    lobby.game.addPlayer(playerId, name);
    const session: Session = {
      token: randomBytes(18).toString('base64url'),
      playerId,
      peer,
      lastKey: '',
      graceTimer: null,
    };
    lobby.sessions.set(session.token, session);
    this.bindings.set(peer, { lobby, session });
    peer.send({ t: 'welcome', code: lobby.code, token: session.token, playerId });
  }

  /** A player who disconnected before the game started and did not come back loses the seat. */
  private dropFromLobby(lobby: Lobby, session: Session): void {
    session.graceTimer = null;
    if (!this.lobbies.has(lobby.code) || session.peer || lobby.game.phase !== 'lobby') return;
    lobby.game.leave(session.playerId);
    lobby.sessions.delete(session.token);
    if (lobby.game.players.length === 0) this.deleteLobby(lobby, false);
    else this.afterChange(lobby);
  }

  // ---------- effects, timers, broadcasting ----------

  private afterChange(lobby: Lobby): void {
    if (!this.lobbies.has(lobby.code)) return;
    let finished = false;
    for (const effect of lobby.game.takeEffects()) {
      if (effect.type === 'judge') this.runJudge(lobby, effect);
      else if (effect.type === 'finished') finished = true;
    }
    this.schedule(lobby);
    this.broadcast(lobby);
    if (finished) {
      this.opts.log(`lobby ${lobby.code} finished after ${lobby.game.round?.number ?? 0} rounds`);
      this.deleteLobby(lobby, false);
    }
  }

  private runJudge(lobby: Lobby, req: JudgeRequest): void {
    this.opts
      .judge(req)
      .catch((err: unknown) => {
        this.opts.log(`judge failed in ${lobby.code}, using fallback: ${String(err)}`);
        return fallbackJudge(req.definition, req.answers);
      })
      .then((judgement) => {
        if (!this.lobbies.has(lobby.code)) return;
        lobby.game.applyJudgement(req.round, judgement);
        this.afterChange(lobby);
      })
      .catch((err: unknown) => this.opts.log(`applying judgement failed: ${String(err)}`));
  }

  private schedule(lobby: Lobby): void {
    if (lobby.timer) clearTimeout(lobby.timer);
    lobby.timer = null;
    const deadline = lobby.game.nextDeadline();
    if (deadline === null) return;
    const delay = Math.max(0, deadline - this.opts.now()) + 10;
    lobby.timer = setTimeout(() => {
      lobby.timer = null;
      lobby.game.tick();
      this.afterChange(lobby);
    }, delay);
  }

  private broadcast(lobby: Lobby): void {
    const now = this.opts.now();
    for (const session of lobby.sessions.values()) {
      if (!session.peer) continue;
      const view = viewFor(lobby.game, lobby.code, session.playerId, now);
      const key = JSON.stringify({ ...view, serverNow: 0 });
      if (key === session.lastKey) continue;
      session.lastKey = key;
      session.peer.send({ t: 'state', view });
    }
  }

  private deleteLobby(lobby: Lobby, notify: boolean): void {
    if (lobby.timer) clearTimeout(lobby.timer);
    for (const session of lobby.sessions.values()) {
      if (session.graceTimer) clearTimeout(session.graceTimer);
      if (session.peer) {
        if (notify) session.peer.send({ t: 'closed', reason: 'not_found' });
        this.bindings.delete(session.peer);
      }
    }
    this.lobbies.delete(lobby.code);
  }

  private newCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      if (!this.lobbies.has(code)) return code;
    }
  }
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
