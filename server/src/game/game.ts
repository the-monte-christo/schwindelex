import {
  JUDGING_TIMEOUT_SECONDS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  WRITING_SECONDS,
  buildStacks,
  cleanAnswer,
  cleanName,
  fallbackJudge,
  normalize,
  sanitizeJudgement,
  scoreRound,
  shuffle,
  votingSeconds,
  type Rng,
} from './rules.ts';
import {
  GameError,
  type Decision,
  type Effect,
  type Judgement,
  type Phase,
  type Player,
  type PlayerId,
  type Round,
  type Word,
} from './types.ts';

export interface GameDeps {
  now: () => number;
  rng: Rng;
  words: readonly Word[];
}

/**
 * Authoritative game state of one lobby. No I/O: time and randomness are injected,
 * AI judging is requested via effects (see takeEffects) and answered with applyJudgement.
 * The owner must call tick() at nextDeadline().
 */
export class Game {
  phase: Phase = 'lobby';
  players: Player[] = [];
  hostId: PlayerId | null = null;
  round: Round | null = null;

  private deps: GameDeps;
  private deck: Word[];
  private deckPos = 0;
  private effects: Effect[] = [];

  constructor(deps: GameDeps) {
    if (deps.words.length === 0) throw new Error('word list is empty');
    this.deps = deps;
    this.deck = shuffle(deps.words, deps.rng);
  }

  // ---------- queries ----------

  player(id: PlayerId): Player | undefined {
    return this.players.find((p) => p.id === id);
  }

  /** Players taking part in the current round. */
  participants(): Player[] {
    return this.players.filter((p) => p.inRound);
  }

  nextDeadline(): number | null {
    if (this.phase === 'writing' || this.phase === 'judging' || this.phase === 'voting') {
      return this.round!.deadline;
    }
    return null;
  }

  takeEffects(): Effect[] {
    const out = this.effects;
    this.effects = [];
    return out;
  }

  // ---------- lobby / membership ----------

  addPlayer(id: PlayerId, rawName: string): Player {
    if (this.phase === 'finished') throw new GameError('game_finished');
    if (this.players.length >= MAX_PLAYERS) throw new GameError('lobby_full');
    const name = cleanName(rawName);
    if (!name) throw new GameError('name_invalid');
    if (this.players.some((p) => normalize(p.name) === normalize(name))) {
      throw new GameError('name_taken');
    }
    if (this.player(id)) throw new GameError('duplicate_id');
    const inGame = this.phase !== 'lobby';
    const player: Player = {
      id,
      name,
      score: 0,
      connected: true,
      ready: false,
      inRound: false,
      pending: inGame,
      decision: null,
    };
    this.players.push(player);
    this.hostId ??= id;
    return player;
  }

  /** Explicit leave. Before the game the seat is freed, afterwards it behaves like a disconnect. */
  leave(id: PlayerId): void {
    const player = this.requirePlayer(id);
    if (this.phase !== 'lobby') {
      this.setConnected(id, false);
      return;
    }
    this.players = this.players.filter((p) => p !== player);
    if (this.hostId === id) this.hostId = this.players[0]?.id ?? null;
  }

  setConnected(id: PlayerId, connected: boolean): void {
    const player = this.requirePlayer(id);
    player.connected = connected;
    this.checkProgress();
  }

  setReady(id: PlayerId, ready: boolean): void {
    this.requirePhase('lobby');
    this.requirePlayer(id).ready = ready;
  }

  start(byId: PlayerId): void {
    this.requirePhase('lobby');
    if (byId !== this.hostId) throw new GameError('not_host');
    if (this.players.length < MIN_PLAYERS) throw new GameError('not_enough_players');
    if (this.players.some((p) => p.connected && !p.ready)) throw new GameError('not_all_ready');
    this.startRound(this.players);
  }

  // ---------- writing ----------

  /** Live draft; counts if the timer runs out. Editing withdraws an earlier OK. */
  setDraft(id: PlayerId, text: string): void {
    const answer = this.requireAnswer(id);
    answer.text = cleanAnswer(text);
    answer.submitted = false;
  }

  submit(id: PlayerId, text: string): void {
    const answer = this.requireAnswer(id);
    answer.text = cleanAnswer(text);
    answer.submitted = true;
    this.checkProgress();
  }

  clearAnswer(id: PlayerId): void {
    const answer = this.requireAnswer(id);
    answer.text = '';
    answer.submitted = false;
  }

  // ---------- judging ----------

  applyJudgement(roundNumber: number, judgement: Judgement): void {
    if (this.phase !== 'judging' || this.round?.number !== roundNumber) return;
    const round = this.round;
    const texts: Record<PlayerId, string> = {};
    for (const [pid, answer] of Object.entries(round.answers)) {
      if (answer.text) texts[pid] = answer.text;
    }
    const clean = sanitizeJudgement(judgement, Object.keys(texts));
    round.stacks = buildStacks(round.word, texts, clean, this.deps.rng);
    this.phase = 'voting';
    round.deadline = this.deps.now() + votingSeconds(this.participants().length) * 1000;
  }

  // ---------- voting ----------

  vote(id: PlayerId, stackId: string): void {
    this.requirePhase('voting');
    const player = this.requirePlayer(id);
    if (!player.inRound) throw new GameError('not_in_round');
    const round = this.round!;
    if (!round.stacks.some((s) => s.id === stackId)) throw new GameError('unknown_stack');
    round.votes[id] = stackId;
    this.checkProgress();
  }

  // ---------- reveal / next round ----------

  decide(id: PlayerId, decision: Decision): void {
    this.requirePhase('reveal');
    const player = this.requirePlayer(id);
    if (player.pending) throw new GameError('pending_player');
    player.decision = decision;
    this.checkProgress();
  }

  // ---------- time ----------

  tick(): void {
    const deadline = this.nextDeadline();
    if (deadline === null || this.deps.now() < deadline) return;
    if (this.phase === 'writing') this.endWriting();
    else if (this.phase === 'judging') this.applyFallbackJudgement();
    else if (this.phase === 'voting') this.endVoting();
  }

  // ---------- internals ----------

  private checkProgress(): void {
    const active = this.participants().filter((p) => p.connected);
    const round = this.round;
    if (this.phase === 'writing' && active.length > 0 && active.every((p) => round!.answers[p.id]?.submitted)) {
      this.endWriting();
    } else if (this.phase === 'voting' && active.length > 0 && active.every((p) => round!.votes[p.id])) {
      this.endVoting();
    } else if (this.phase === 'reveal') {
      const deciders = this.players.filter((p) => p.connected && !p.pending);
      if (deciders.every((p) => p.decision !== null)) this.resolveDecisions();
    }
  }

  private startRound(participants: readonly Player[]): void {
    const ids = new Set(participants.map((p) => p.id));
    const answers: Round['answers'] = {};
    for (const p of this.players) {
      p.inRound = ids.has(p.id);
      if (p.inRound) {
        p.pending = false;
        answers[p.id] = { text: '', submitted: false };
      }
      p.decision = null;
      p.ready = false;
    }
    this.round = {
      number: (this.round?.number ?? 0) + 1,
      word: this.drawWord(),
      answers,
      deadline: this.deps.now() + WRITING_SECONDS * 1000,
      stacks: [],
      votes: {},
      scores: {},
    };
    this.phase = 'writing';
  }

  private endWriting(): void {
    const round = this.round!;
    this.phase = 'judging';
    round.deadline = this.deps.now() + JUDGING_TIMEOUT_SECONDS * 1000;
    const answers = Object.entries(round.answers)
      .filter(([, a]) => a.text)
      .map(([playerId, a]) => ({ playerId, text: a.text }));
    if (answers.length === 0) {
      this.applyJudgement(round.number, { correct: [], groups: [] });
      return;
    }
    this.effects.push({
      type: 'judge',
      round: round.number,
      word: round.word.word,
      definition: round.word.definition,
      answers,
    });
  }

  private applyFallbackJudgement(): void {
    const round = this.round!;
    const answers = Object.entries(round.answers)
      .filter(([, a]) => a.text)
      .map(([playerId, a]) => ({ playerId, text: a.text }));
    this.applyJudgement(round.number, fallbackJudge(round.word.definition, answers));
  }

  private endVoting(): void {
    const round = this.round!;
    round.scores = scoreRound(round.stacks, round.votes, this.participants().map((p) => p.id));
    for (const [id, line] of Object.entries(round.scores)) {
      this.player(id)!.score += line.total;
    }
    for (const p of this.players) p.decision = null;
    this.phase = 'reveal';
    this.checkProgress();
  }

  private resolveDecisions(): void {
    const next = this.players.filter((p) => p.connected && (p.pending || p.decision === 'continue'));
    if (next.length <= 1) {
      this.phase = 'finished';
      this.effects.push({ type: 'finished' });
      return;
    }
    this.startRound(next);
  }

  private drawWord(): Word {
    if (this.deckPos >= this.deck.length) {
      this.deck = shuffle(this.deps.words, this.deps.rng);
      this.deckPos = 0;
    }
    return this.deck[this.deckPos++]!;
  }

  private requirePlayer(id: PlayerId): Player {
    const player = this.player(id);
    if (!player) throw new GameError('unknown_player');
    return player;
  }

  private requirePhase(phase: Phase): void {
    if (this.phase !== phase) throw new GameError('wrong_phase');
  }

  private requireAnswer(id: PlayerId) {
    this.requirePhase('writing');
    const answer = this.round!.answers[id];
    if (!answer) throw new GameError('not_in_round');
    return answer;
  }
}
