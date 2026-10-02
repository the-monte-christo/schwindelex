// Runs the eval cases against the real Haiku API: npm run eval:judge
// Costs a few cents. Needs ANTHROPIC_API_KEY in .env.
import { existsSync } from 'node:fs';
import { sanitizeJudgement } from '../../game/rules.ts';
import { createHaikuJudge } from '../haiku.ts';
import { CASES, type JudgeCase } from './cases.ts';

if (existsSync('.env')) process.loadEnvFile('.env');
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) throw new Error('ANTHROPIC_API_KEY fehlt in .env');

let inputTokens = 0;
let outputTokens = 0;
const latencies: number[] = [];
const judge = createHaikuJudge({
  apiKey,
  log: (msg) => {
    const m = /(\d+) ms, in=(\d+) out=(\d+)/.exec(msg);
    if (!m) return;
    latencies.push(Number(m[1]));
    inputTokens += Number(m[2]);
    outputTokens += Number(m[3]);
  },
});

async function run(c: JudgeCase): Promise<string[]> {
  const ids = c.answers.map((_, i) => String(i));
  const raw = await judge({
    type: 'judge',
    round: 1,
    word: c.word,
    definition: c.definition,
    answers: c.answers.map((text, i) => ({ playerId: String(i), text })),
  });
  const j = sanitizeJudgement(raw, ids);
  const problems: string[] = [];
  const correct = new Set(j.correct.map(Number));
  const expected = new Set(c.correct);
  for (const i of expected) if (!correct.has(i)) problems.push(`nicht als richtig erkannt: "${c.answers[i]}"`);
  for (const i of correct) if (!expected.has(i)) problems.push(`fälschlich richtig: "${c.answers[i]}"`);

  const stackOf = (i: number) => (correct.has(i) ? -1 : j.groups.findIndex((g) => g.includes(String(i))));
  for (const set of c.together ?? []) {
    if (new Set(set.map(stackOf)).size > 1) problems.push(`sollten zusammen: ${set.map((i) => `"${c.answers[i]}"`).join(' + ')}`);
  }
  for (const [a, b] of c.apart ?? []) {
    if (stackOf(a!) === stackOf(b!)) problems.push(`sollten getrennt: "${c.answers[a!]}" / "${c.answers[b!]}"`);
  }
  return problems;
}

const results: { c: JudgeCase; problems: string[] }[] = [];
const queue = [...CASES];
await Promise.all(
  Array.from({ length: 4 }, async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      try {
        results.push({ c, problems: await run(c) });
      } catch (err) {
        results.push({ c, problems: [`Fehler: ${String(err)}`] });
      }
    }
  }),
);

results.sort((a, b) => CASES.indexOf(a.c) - CASES.indexOf(b.c));
for (const { c, problems } of results) {
  console.log(`${problems.length ? '✗' : '✓'} ${c.name} (${c.word})`);
  for (const p of problems) console.log(`    ${p}`);
}
const passed = results.filter((r) => r.problems.length === 0).length;
latencies.sort((a, b) => a - b);
const cost = (inputTokens * 1 + outputTokens * 5) / 1_000_000;
console.log(`\n${passed}/${results.length} bestanden`);
console.log(
  `Latenz median ${latencies[Math.floor(latencies.length / 2)]} ms, max ${latencies.at(-1)} ms · ` +
    `Tokens in ${inputTokens} / out ${outputTokens} · Kosten ca. $${cost.toFixed(4)}`,
);
process.exitCode = passed === results.length ? 0 : 1;
