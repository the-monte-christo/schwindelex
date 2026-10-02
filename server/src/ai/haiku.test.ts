import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import type { JudgeRequest } from '../game/types.ts';
import { createHaikuJudge, groupVerdicts, HAIKU_MODEL, type MessagesClient } from './haiku.ts';

const req: JudgeRequest = {
  type: 'judge',
  round: 1,
  word: 'Mumpitz',
  definition: 'Quatsch, Blödsinn',
  answers: [
    { playerId: 'p-anna', text: 'Unsinn' },
    { playerId: 'p-bob', text: 'ein Vogel' },
    { playerId: 'p-cleo', text: 'eine Vogelart' },
  ],
};

const reply = (answers: { id: string; correct: boolean; same_as: string | null }[]) => JSON.stringify({ answers });

function fakeClient(response: Partial<Anthropic.Message> & { text?: string }) {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const client: MessagesClient = {
    messages: {
      async create(body) {
        calls.push(body);
        return {
          stop_reason: 'end_turn',
          usage: { input_tokens: 500, output_tokens: 40 },
          content: response.text === undefined ? [] : [{ type: 'text', text: response.text }],
          ...response,
        } as Anthropic.Message;
      },
    },
  };
  return { client, calls };
}

describe('createHaikuJudge', () => {
  it('sends short ids instead of player ids and maps verdicts back to stacks', async () => {
    const { client, calls } = fakeClient({
      text: reply([
        { id: 'a1', correct: true, same_as: null },
        { id: 'a2', correct: false, same_as: null },
        { id: 'a3', correct: false, same_as: 'a2' },
      ]),
    });
    const judgement = await createHaikuJudge({ client })(req);
    expect(judgement).toEqual({ correct: ['p-anna'], groups: [['p-bob', 'p-cleo']] });

    const body = calls[0]!;
    expect(body.model).toBe(HAIKU_MODEL);
    expect(body.output_config?.format?.type).toBe('json_schema');
    const sent = JSON.stringify(body.messages);
    expect(sent).not.toContain('p-anna');
    expect(sent).toContain('Quatsch, Blödsinn');
  });

  it('throws on refusal, truncation or garbage so the game can fall back', async () => {
    const judge = (r: Partial<Anthropic.Message> & { text?: string }) =>
      createHaikuJudge({ client: fakeClient(r).client })(req);
    await expect(judge({ stop_reason: 'refusal', text: '' })).rejects.toThrow('refusal');
    await expect(judge({ stop_reason: 'max_tokens', text: '{"ans' })).rejects.toThrow('max_tokens');
    await expect(judge({ text: 'kein json' })).rejects.toThrow();
    await expect(judge({})).rejects.toThrow('no text');
  });
});

describe('groupVerdicts', () => {
  const ids = ['a1', 'a2', 'a3', 'a4'];

  it('follows same_as chains and keeps the earliest answer first', () => {
    const r = groupVerdicts(ids, [
      { id: 'a1', correct: false, same_as: null },
      { id: 'a2', correct: false, same_as: null },
      { id: 'a3', correct: false, same_as: 'a2' },
      { id: 'a4', correct: false, same_as: 'a3' },
    ]);
    expect(r.wrong).toEqual([['a1'], ['a2', 'a3', 'a4']]);
  });

  it('never links correct answers into wrong stacks', () => {
    const r = groupVerdicts(ids, [
      { id: 'a1', correct: true, same_as: null },
      { id: 'a2', correct: false, same_as: 'a1' },
      { id: 'a3', correct: true, same_as: 'a2' },
    ]);
    expect(r.correct).toEqual(['a1', 'a3']);
    expect(r.wrong).toEqual([['a2'], ['a4']]); // a4 missing → unique wrong answer
  });

  it('ignores unknown ids, self references and later duplicates of a verdict', () => {
    const r = groupVerdicts(ids, [
      { id: 'a1', correct: false, same_as: 'a1' },
      { id: 'a2', correct: false, same_as: 'zz' },
      { id: 'zz', correct: true, same_as: null },
      { id: 'a3', correct: false, same_as: null },
      { id: 'a3', correct: true, same_as: null },
    ]);
    expect(r.correct).toEqual([]);
    expect(r.wrong).toEqual([['a1'], ['a2'], ['a3'], ['a4']]);
  });

  it('handles cycles without looping', () => {
    const r = groupVerdicts(['a1', 'a2'], [
      { id: 'a1', correct: false, same_as: 'a2' },
      { id: 'a2', correct: false, same_as: 'a1' },
    ]);
    expect(r.wrong).toEqual([['a1', 'a2']]);
  });
});
