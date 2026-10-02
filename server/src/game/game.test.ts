import { beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { MAX_PLAYERS, WRITING_SECONDS } from './rules.ts';
import type { JudgeRequest, Word } from './types.ts';

const words: Word[] = Array.from({ length: 5 }, (_, i) => ({
  id: `w${i}`,
  word: `Wort${i}`,
  pos: 'noun',
  definition: `Bedeutung ${i}`,
}));

let clock = 0;
const advance = (seconds: number, game: Game) => {
  clock += seconds * 1000;
  game.tick();
};

function newGame(names: string[] = []): Game {
  clock = 1_000_000;
  const game = new Game({ now: () => clock, rng: Math.random, words });
  names.forEach((n) => game.addPlayer(n, n));
  return game;
}

function started(names = ['a', 'b', 'c']): Game {
  const game = newGame(names);
  names.forEach((n) => game.setReady(n, true));
  game.start(names[0]!);
  return game;
}

function judgeRequest(game: Game): JudgeRequest {
  const effects = game.takeEffects();
  const req = effects.find((e) => e.type === 'judge');
  if (!req || req.type !== 'judge') throw new Error('no judge request');
  return req;
}

/** Writing → voting with given answers; nobody correct, every answer its own stack. */
function toVoting(game: Game, answers: Record<string, string>) {
  for (const [id, text] of Object.entries(answers)) game.submit(id, text);
  const req = judgeRequest(game);
  game.applyJudgement(req.round, { correct: [], groups: req.answers.map((a) => [a.playerId]) });
  expect(game.phase).toBe('voting');
}

const stackOf = (game: Game, author: string) => game.round!.stacks.find((s) => s.authors.includes(author))!.id;
const trueStack = (game: Game) => game.round!.stacks.find((s) => s.isTrue)!.id;

describe('lobby', () => {
  it('makes the first player host and rejects duplicate names case-insensitively', () => {
    const game = newGame(['Anna']);
    expect(game.hostId).toBe('Anna');
    expect(() => game.addPlayer('x', ' anna ')).toThrow('name_taken');
    expect(() => game.addPlayer('y', '   ')).toThrow('name_invalid');
  });

  it(`allows at most ${MAX_PLAYERS} players`, () => {
    const game = newGame(Array.from({ length: MAX_PLAYERS }, (_, i) => `p${i}`));
    expect(() => game.addPlayer('extra', 'extra')).toThrow('lobby_full');
  });

  it('passes the host role on when the host leaves the lobby', () => {
    const game = newGame(['a', 'b']);
    game.leave('a');
    expect(game.hostId).toBe('b');
    expect(game.players.map((p) => p.id)).toEqual(['b']);
  });

  it('only the host can start, with at least 2 players, all ready', () => {
    const game = newGame(['a']);
    game.setReady('a', true);
    expect(() => game.start('a')).toThrow('not_enough_players');
    game.addPlayer('b', 'b');
    expect(() => game.start('a')).toThrow('not_all_ready');
    game.setReady('b', true);
    expect(() => game.start('b')).toThrow('not_host');
    game.start('a');
    expect(game.phase).toBe('writing');
    expect(game.round!.number).toBe(1);
  });

  it('disconnected unready players do not block the start', () => {
    const game = newGame(['a', 'b', 'c']);
    game.setReady('a', true);
    game.setReady('b', true);
    game.setConnected('c', false);
    game.start('a');
    expect(game.participants()).toHaveLength(3);
  });
});

describe('writing', () => {
  let game: Game;
  beforeEach(() => {
    game = started();
  });

  it('ends as soon as all connected players pressed OK', () => {
    game.submit('a', 'eins');
    game.submit('b', 'zwei');
    expect(game.phase).toBe('writing');
    game.submit('c', 'drei');
    expect(game.phase).toBe('judging');
  });

  it('a disconnected player does not block, their draft still counts', () => {
    game.setDraft('c', 'halb fertig');
    game.setConnected('c', false);
    game.submit('a', 'eins');
    game.submit('b', 'zwei');
    expect(judgeRequest(game).answers.map((a) => a.text)).toEqual(['eins', 'zwei', 'halb fertig']);
  });

  it('gives 180 s for writing', () => {
    expect(game.round!.deadline - clock).toBe(180_000);
  });

  it('takes the drafts when the writing time runs out', () => {
    game.setDraft('a', 'entwurf');
    game.submit('b', 'fertig');
    advance(WRITING_SECONDS - 1, game);
    expect(game.phase).toBe('writing');
    advance(1, game);
    expect(judgeRequest(game).answers).toEqual([
      { playerId: 'a', text: 'entwurf' },
      { playerId: 'b', text: 'fertig' },
    ]);
  });

  it('editing withdraws OK, clearing empties the answer', () => {
    game.submit('a', 'eins');
    game.setDraft('a', 'doch anders');
    expect(game.round!.answers.a!.submitted).toBe(false);
    game.clearAnswer('a');
    expect(game.round!.answers.a).toEqual({ text: '', submitted: false });
  });

  it('cuts answers to 100 characters', () => {
    game.submit('a', 'x'.repeat(130));
    expect(game.round!.answers.a!.text).toHaveLength(100);
  });

  it('rejects answers from players outside the round', () => {
    game.addPlayer('late', 'late');
    expect(() => game.submit('late', 'hallo')).toThrow('not_in_round');
  });
});

describe('judging', () => {
  it('only sends non-empty answers to the AI', () => {
    const game = started();
    game.submit('a', 'eins');
    game.submit('b', '   ');
    game.submit('c', 'drei');
    const req = judgeRequest(game);
    expect(req.answers.map((a) => a.playerId)).toEqual(['a', 'c']);
    expect(req.definition).toBe(game.round!.word.definition);
  });

  it('skips the AI when nobody wrote anything – only the truth is on the table', () => {
    const game = started();
    ['a', 'b', 'c'].forEach((id) => game.submit(id, ''));
    expect(game.takeEffects()).toEqual([]);
    expect(game.phase).toBe('voting');
    expect(game.round!.stacks).toHaveLength(1);
    expect(game.round!.stacks[0]!.text).toBe(game.round!.word.definition);
  });

  it('groups similar answers and puts correct players under the true stack', () => {
    const game = started(['a', 'b', 'c', 'd']);
    game.submit('a', 'richtig');
    game.submit('b', 'ein Hut');
    game.submit('c', 'Hut');
    game.submit('d', 'ein Vogel');
    const req = judgeRequest(game);
    game.applyJudgement(req.round, { correct: ['a'], groups: [['b', 'c'], ['d']] });
    const stacks = game.round!.stacks;
    expect(stacks).toHaveLength(3);
    expect(stacks.find((s) => s.isTrue)).toMatchObject({ text: 'richtig', authors: ['a'] });
  });

  it('ignores judgements for an old round', () => {
    const game = started();
    ['a', 'b', 'c'].forEach((id) => game.submit(id, id));
    game.applyJudgement(99, { correct: ['a'], groups: [] });
    expect(game.phase).toBe('judging');
  });

  it('falls back to exact matching when the AI does not answer in time', () => {
    const game = started();
    game.submit('a', 'Hut');
    game.submit('b', 'hut!');
    game.submit('c', 'Vogel');
    advance(20, game);
    expect(game.phase).toBe('voting');
    expect(game.round!.stacks).toHaveLength(3); // truth + "hut" + "vogel"
  });
});

describe('voting', () => {
  it('lasts 30 s for 3 players and ends on timeout', () => {
    const game = started();
    toVoting(game, { a: '1', b: '2', c: '3' });
    expect(game.round!.deadline - clock).toBe(30_000);
    advance(30, game);
    expect(game.phase).toBe('reveal');
  });

  it('lasts 35 s for 6 players', () => {
    const game = started(['a', 'b', 'c', 'd', 'e', 'f']);
    toVoting(game, { a: '1', b: '2', c: '3', d: '4', e: '5', f: '6' });
    expect(game.round!.deadline - clock).toBe(35_000);
  });

  it('allows voting the own stack and changing the vote, ends when everyone voted', () => {
    const game = started();
    toVoting(game, { a: '1', b: '2', c: '3' });
    game.vote('a', stackOf(game, 'a'));
    game.vote('a', trueStack(game));
    game.vote('b', trueStack(game));
    expect(game.phase).toBe('voting');
    game.vote('c', stackOf(game, 'a'));
    expect(game.phase).toBe('reveal');
    expect(game.round!.votes.a).toBe(trueStack(game));
  });

  it('rejects unknown stacks and players outside the round', () => {
    const game = started();
    toVoting(game, { a: '1', b: '2', c: '3' });
    expect(() => game.vote('a', 'nope')).toThrow('unknown_stack');
    game.addPlayer('late', 'late');
    expect(() => game.vote('late', trueStack(game))).toThrow('not_in_round');
  });
});

describe('reveal and next round', () => {
  function toReveal(game: Game) {
    toVoting(game, { a: '1', b: '2', c: '3' });
    game.vote('a', trueStack(game));
    game.vote('b', stackOf(game, 'a'));
    game.vote('c', stackOf(game, 'a'));
    expect(game.phase).toBe('reveal');
  }

  it('adds round scores to the players', () => {
    const game = started();
    toReveal(game);
    const score = (id: string) => game.player(id)!.score;
    expect([score('a'), score('b'), score('c')]).toEqual([3, 0, 0]);
    expect(game.round!.scores.a).toEqual({ correctAnswer: 0, correctVote: 1, bluff: 2, total: 3 });
  });

  it('starts the next round with a new word when everyone continues', () => {
    const game = started();
    toReveal(game);
    const firstWord = game.round!.word.id;
    game.decide('a', 'continue');
    game.decide('b', 'continue');
    expect(game.phase).toBe('reveal');
    game.decide('c', 'continue');
    expect(game.phase).toBe('writing');
    expect(game.round!.number).toBe(2);
    expect(game.round!.word.id).not.toBe(firstWord);
  });

  it('passing players sit out the next round and may come back later', () => {
    const game = started();
    toReveal(game);
    game.decide('a', 'continue');
    game.decide('b', 'continue');
    game.decide('c', 'pass');
    expect(game.participants().map((p) => p.id)).toEqual(['a', 'b']);
    expect(() => game.submit('c', 'x')).toThrow('not_in_round');
    game.submit('a', '1');
    game.submit('b', '2');
    const req = judgeRequest(game);
    game.applyJudgement(req.round, { correct: [], groups: [['a'], ['b']] });
    game.vote('a', trueStack(game));
    game.vote('b', trueStack(game));
    expect(game.round!.scores.c).toBeUndefined();
    ['a', 'b', 'c'].forEach((id) => game.decide(id, 'continue'));
    expect(game.participants()).toHaveLength(3);
  });

  it('ends the game when all but one pass', () => {
    const game = started();
    toReveal(game);
    game.takeEffects();
    game.decide('a', 'continue');
    game.decide('b', 'pass');
    game.decide('c', 'pass');
    expect(game.phase).toBe('finished');
    expect(game.takeEffects()).toEqual([{ type: 'finished' }]);
    expect(() => game.addPlayer('late', 'late')).toThrow('game_finished');
  });

  it('a disconnected player counts as passing', () => {
    const game = started();
    toReveal(game);
    game.decide('a', 'continue');
    game.decide('b', 'continue');
    game.setConnected('c', false);
    expect(game.phase).toBe('writing');
    expect(game.participants().map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('late joiners wait, then enter the next round with 0 points and count as continuing', () => {
    const game = started(['a', 'b']);
    game.addPlayer('late', 'Spät');
    expect(game.player('late')).toMatchObject({ pending: true, inRound: false, score: 0 });
    game.submit('a', '1');
    game.submit('b', '2');
    const req = judgeRequest(game);
    game.applyJudgement(req.round, { correct: [], groups: [['a'], ['b']] });
    game.vote('a', trueStack(game));
    game.vote('b', trueStack(game));
    expect(() => game.decide('late', 'continue')).toThrow('pending_player');
    game.decide('a', 'continue');
    game.decide('b', 'pass');
    // a + late = 2 players → the game goes on
    expect(game.phase).toBe('writing');
    expect(game.participants().map((p) => p.id)).toEqual(['a', 'late']);
    expect(game.player('late')!.pending).toBe(false);
    expect(game.player('a')!.score).toBe(1);
  });
});

describe('word deck', () => {
  it('never repeats a word before the list is exhausted', () => {
    const game = started(['a', 'b']);
    const seen: string[] = [];
    for (let i = 0; i < words.length; i++) {
      seen.push(game.round!.word.id);
      game.submit('a', '');
      game.submit('b', '');
      game.vote('a', trueStack(game));
      game.vote('b', trueStack(game));
      game.decide('a', 'continue');
      game.decide('b', 'continue');
    }
    expect(new Set(seen).size).toBe(words.length);
    expect(game.round!.number).toBe(words.length + 1); // reshuffled, still running
  });
});
