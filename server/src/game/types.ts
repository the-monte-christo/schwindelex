import type { Decision, Phase, ScoreLine } from '../../../shared/protocol.ts';

export type { Decision, Phase, ScoreLine };

export type PlayerId = string;

export interface Word {
  id: string;
  word: string;
  pos: 'noun' | 'verb' | 'adj';
  definition: string;
  tags?: string[];
  domain?: string;
}

export interface Player {
  id: PlayerId;
  name: string;
  score: number;
  connected: boolean;
  /** Ready flag in the pre-game lobby. */
  ready: boolean;
  /** Takes part in the current round (false = passed or joined mid-round). */
  inRound: boolean;
  /** Joined after game start and waits for the next round. */
  pending: boolean;
  /** Choice for the next round, only during reveal. */
  decision: Decision | null;
}

export interface Answer {
  text: string;
  submitted: boolean;
}

export interface Stack {
  id: string;
  text: string;
  /** Players whose answers are in this stack. Empty for the official definition. */
  authors: PlayerId[];
  isTrue: boolean;
}

/** Result of judging the answers of one round (from Haiku or the fallback). */
export interface Judgement {
  /** Authors of answers that match the real definition, best representative first. */
  correct: PlayerId[];
  /** Groups of very similar wrong answers, representative first. */
  groups: PlayerId[][];
}

export interface Round {
  number: number;
  word: Word;
  answers: Record<PlayerId, Answer>;
  /** Absolute ms timestamp when the current timed phase ends. */
  deadline: number;
  stacks: Stack[];
  votes: Record<PlayerId, string>;
  scores: Record<PlayerId, ScoreLine>;
}

export interface JudgeRequest {
  type: 'judge';
  round: number;
  word: string;
  definition: string;
  answers: { playerId: PlayerId; text: string }[];
}

export type Effect = JudgeRequest | { type: 'finished' };

export class GameError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}
