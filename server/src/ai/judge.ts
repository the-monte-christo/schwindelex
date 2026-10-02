import { fallbackJudge } from '../game/rules.ts';
import type { JudgeRequest, Judgement } from '../game/types.ts';

/** Decides which answers are correct and groups very similar wrong ones. */
export type Judge = (req: JudgeRequest) => Promise<Judgement>;

/** No AI: only literally identical answers match. Used offline, in tests and as fallback. */
export const exactJudge: Judge = async (req) => fallbackJudge(req.definition, req.answers);
