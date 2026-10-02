import type { Judgement, PlayerId, ScoreLine, Stack, Word } from './types.ts';

export const MAX_PLAYERS = 20;
export const MIN_PLAYERS = 2;
export const MAX_ANSWER_LENGTH = 100;
export const MAX_NAME_LENGTH = 20;
export const WRITING_SECONDS = 180;
/** Safety net if the AI never answers. */
export const JUDGING_TIMEOUT_SECONDS = 20;

export type Rng = () => number;

/** 30 s up to 5 players, +5 s for every player beyond 5. */
export function votingSeconds(players: number): number {
  return 30 + 5 * Math.max(0, players - 5);
}

export function cleanAnswer(text: string): string {
  return text
    .replace(/[\p{Cc}\p{Cf}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_ANSWER_LENGTH);
}

export function cleanName(name: string): string {
  return name
    .replace(/[\p{Cc}\p{Cf}]+/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH);
}

/** Lowercase, punctuation stripped, whitespace collapsed – for "same text" comparisons. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Used when the AI fails: only literally identical answers count as correct or get grouped. */
export function fallbackJudge(definition: string, answers: { playerId: PlayerId; text: string }[]): Judgement {
  const target = normalize(definition);
  const correct: PlayerId[] = [];
  const groups = new Map<string, PlayerId[]>();
  for (const { playerId, text } of answers) {
    const key = normalize(text);
    if (key === target) {
      correct.push(playerId);
      continue;
    }
    const group = groups.get(key);
    if (group) group.push(playerId);
    else groups.set(key, [playerId]);
  }
  return { correct, groups: [...groups.values()] };
}

/**
 * Makes an untrusted judgement consistent: every answer appears exactly once,
 * unknown ids are dropped, "correct" wins over group membership.
 */
export function sanitizeJudgement(judgement: Judgement, answerIds: readonly PlayerId[]): Judgement {
  const known = new Set(answerIds);
  const seen = new Set<PlayerId>();
  const take = (id: PlayerId) => {
    if (!known.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  };
  const correct = judgement.correct.filter(take);
  const groups = judgement.groups.map((g) => g.filter(take)).filter((g) => g.length > 0);
  for (const id of answerIds) if (!seen.has(id)) groups.push([id]);
  return { correct, groups };
}

/** Turns a judgement into shuffled stacks. The true stack shows a player's text if anyone was right. */
export function buildStacks(
  word: Word,
  answerText: Record<PlayerId, string>,
  judgement: Judgement,
  rng: Rng,
): Stack[] {
  const first = judgement.correct[0];
  const unordered: Omit<Stack, 'id'>[] = [
    {
      text: first !== undefined ? answerText[first]! : word.definition,
      authors: [...judgement.correct],
      isTrue: true,
    },
    ...judgement.groups.map((group) => ({
      text: answerText[group[0]!]!,
      authors: [...group],
      isTrue: false,
    })),
  ];
  return shuffle(unordered, rng).map((stack, i) => ({ id: `s${i + 1}`, ...stack }));
}

export function emptyScore(): ScoreLine {
  return { correctAnswer: 0, correctVote: 0, bluff: 0, total: 0 };
}

/**
 * +1 for writing a correct answer, +1 for voting the true stack,
 * +1 for each other player who votes your wrong stack (every co-author gets it).
 * Voting your own wrong stack earns nothing and gives no bluff points.
 */
export function scoreRound(
  stacks: readonly Stack[],
  votes: Record<PlayerId, string>,
  participants: readonly PlayerId[],
): Record<PlayerId, ScoreLine> {
  const scores: Record<PlayerId, ScoreLine> = {};
  for (const id of participants) scores[id] = emptyScore();
  const byId = new Map(stacks.map((s) => [s.id, s]));

  const trueStack = stacks.find((s) => s.isTrue);
  for (const author of trueStack?.authors ?? []) {
    if (scores[author]) scores[author].correctAnswer += 1;
  }

  for (const [voter, stackId] of Object.entries(votes)) {
    const stack = byId.get(stackId);
    if (!stack || !scores[voter]) continue;
    if (stack.isTrue) {
      scores[voter].correctVote += 1;
    } else if (!stack.authors.includes(voter)) {
      for (const author of stack.authors) {
        if (scores[author]) scores[author].bluff += 1;
      }
    }
  }

  for (const line of Object.values(scores)) {
    line.total = line.correctAnswer + line.correctVote + line.bluff;
  }
  return scores;
}
