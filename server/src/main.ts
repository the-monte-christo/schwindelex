import { existsSync } from 'node:fs';
import { createHaikuJudge } from './ai/haiku.ts';
import { exactJudge } from './ai/judge.ts';
import { loadConfig } from './config.ts';
import { startServer } from './net/server.ts';
import { loadWords } from './words.ts';

// E2E tests set SKIP_ENV_FILE so the real API key and PIN never leak into test runs.
if (process.env.SKIP_ENV_FILE !== '1' && existsSync('.env')) process.loadEnvFile('.env');

const config = loadConfig();
const words = loadWords(config.wordsFile);

const judge = config.anthropicApiKey
  ? createHaikuJudge({ apiKey: config.anthropicApiKey, log: (msg) => console.log(msg) })
  : exactJudge;
if (!config.anthropicApiKey) console.warn('ANTHROPIC_API_KEY fehlt – nur exakter Textvergleich, keine KI');

const server = await startServer({
  port: config.port,
  publicUrl: config.publicUrl,
  hostPin: config.hostPin,
  words,
  judge,
  staticDir: 'client/dist',
  trustProxy: config.trustProxy,
});

console.log(`Schwindelex läuft auf Port ${server.port} (${words.length} Wörter aus ${config.wordsFile})`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`${signal} – fahre herunter`);
    void server.close().then(() => process.exit(0));
  });
}
