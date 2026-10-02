import { describe, expect, it } from 'vitest';
import {
  buildStacks,
  cleanAnswer,
  cleanName,
  fallbackJudge,
  normalize,
  sanitizeJudgement,
  scoreRound,
  shuffle,
  votingSeconds,
} from './rules.ts';
import type { Stack, Word } from './types.ts';

const word: Word = { id: 'x', word: 'Mumpitz', pos: 'noun', definition: 'Quatsch, Blödsinn' };
const identityRng = () => 0.999999; // Fisher-Yates with this keeps the order

describe('votingSeconds', () => {
  it('is 30 s up to 5 players and +5 s per extra player', () => {
    expect(votingSeconds(2)).toBe(30);
    expect(votingSeconds(5)).toBe(30);
    expect(votingSeconds(6)).toBe(35);
    expect(votingSeconds(20)).toBe(105);
  });
});

describe('text cleanup', () => {
  it('cuts answers at 100 chars and strips control characters', () => {
    expect(cleanAnswer('a'.repeat(150))).toHaveLength(100);
    expect(cleanAnswer('  ein\n\tZettel\u0000  ')).toBe('ein Zettel');
    expect(cleanAnswer('a​b')).toBe('a b');
  });
  it('limits names to 20 chars', () => {
    expect(cleanName('  Tante   Erna  ')).toBe('Tante Erna');
    expect(cleanName('x'.repeat(30))).toHaveLength(20);
  });
  it('normalizes case, punctuation and spacing', () => {
    expect(normalize('  Quatsch,  BLÖDSINN! ')).toBe('quatsch blödsinn');
  });
});

describe('shuffle', () => {
  it('returns a permutation without touching the input', () => {
    const input = [1, 2, 3, 4, 5];
    const out = shuffle(input, Math.random);
    expect([...out].sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('fallbackJudge', () => {
  it('groups only identical texts and marks the literal definition correct', () => {
    const j = fallbackJudge(word.definition, [
      { playerId: 'a', text: 'Ein Hut' },
      { playerId: 'b', text: 'ein hut!' },
      { playerId: 'c', text: 'quatsch blödsinn' },
      { playerId: 'd', text: 'Ein Vogel' },
    ]);
    expect(j.correct).toEqual(['c']);
    expect(j.groups).toEqual([['a', 'b'], ['d']]);
  });
});

describe('sanitizeJudgement', () => {
  it('drops unknown ids, dedupes, prefers correct and adds forgotten answers', () => {
    const j = sanitizeJudgement(
      { correct: ['a', 'zz'], groups: [['a', 'b'], ['b', 'c'], []] },
      ['a', 'b', 'c', 'd'],
    );
    expect(j).toEqual({ correct: ['a'], groups: [['b'], ['c'], ['d']] });
  });
});

describe('buildStacks', () => {
  const texts = { a: 'Quatsch', b: 'ein Hut', c: 'ein Hut, groß' };

  it('shows the official definition when nobody was right', () => {
    const stacks = buildStacks(word, texts, { correct: [], groups: [['b', 'c'], ['a']] }, identityRng);
    const truth = stacks.find((s) => s.isTrue)!;
    expect(truth.text).toBe(word.definition);
    expect(truth.authors).toEqual([]);
    expect(stacks).toHaveLength(3);
    expect(stacks.find((s) => s.authors.includes('b'))!.text).toBe('ein Hut');
  });

  it('shows the first correct player text instead of the official definition', () => {
    const stacks = buildStacks(word, texts, { correct: ['a'], groups: [['b', 'c']] }, identityRng);
    const truth = stacks.find((s) => s.isTrue)!;
    expect(truth.text).toBe('Quatsch');
    expect(truth.authors).toEqual(['a']);
    expect(stacks).toHaveLength(2);
  });

  it('assigns ids after shuffling so ids reveal nothing', () => {
    const stacks = buildStacks(word, texts, { correct: [], groups: [['a'], ['b'], ['c']] }, Math.random);
    expect(stacks.map((s) => s.id)).toEqual(['s1', 's2', 's3', 's4']);
  });
});

describe('scoreRound', () => {
  const stacks: Stack[] = [
    { id: 't', text: 'wahr', authors: ['a'], isTrue: true },
    { id: 'f1', text: 'bluff', authors: ['b', 'c'], isTrue: false },
    { id: 'f2', text: 'bluff2', authors: ['d'], isTrue: false },
  ];
  const all = ['a', 'b', 'c', 'd', 'e'];

  it('gives +1 for a correct answer and +1 for voting the truth, even the own stack', () => {
    const s = scoreRound(stacks, { a: 't' }, all);
    expect(s.a).toEqual({ correctAnswer: 1, correctVote: 1, bluff: 0, total: 2 });
  });

  it('gives every co-author +1 per fooled player', () => {
    const s = scoreRound(stacks, { d: 'f1', e: 'f1' }, all);
    expect(s.b!.bluff).toBe(2);
    expect(s.c!.bluff).toBe(2);
  });

  it('gives nothing for voting the own wrong stack', () => {
    const s = scoreRound(stacks, { b: 'f1', d: 'f2' }, all);
    expect(s.b!.total).toBe(0);
    expect(s.c!.total).toBe(0);
    expect(s.d!.total).toBe(0);
  });

  it('a co-author voting their stack gives the other author nothing', () => {
    const s = scoreRound(stacks, { c: 'f1' }, all);
    expect(s.b!.bluff).toBe(0);
  });

  it('ignores votes of non-participants and unknown stacks', () => {
    const s = scoreRound(stacks, { zz: 'f2', e: 'nope' }, all);
    expect(s.d!.bluff).toBe(0);
    expect(s.zz).toBeUndefined();
  });

  it('true stack authors get no bluff points', () => {
    const s = scoreRound(stacks, { b: 't', c: 't', d: 't', e: 't' }, all);
    expect(s.a).toEqual({ correctAnswer: 1, correctVote: 0, bluff: 0, total: 1 });
  });
});
