export interface Config {
  port: number;
  /** Base URL for invite links and QR codes, without trailing slash. */
  publicUrl: string;
  hostPin: string;
  wordsFile: string;
  anthropicApiKey: string | null;
  /** Behind nginx: take the client IP from X-Real-IP (set by nginx). */
  trustProxy: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const hostPin = env.HOST_PIN?.trim() ?? '';
  if (!hostPin) throw new Error('HOST_PIN fehlt (siehe .env.example)');
  return {
    port: Number(env.PORT ?? 3000),
    publicUrl: (env.PUBLIC_URL ?? `http://localhost:${env.PORT ?? 3000}`).replace(/\/+$/, ''),
    hostPin,
    wordsFile: env.WORDS_FILE ?? 'data/words.test.json',
    anthropicApiKey: env.ANTHROPIC_API_KEY?.trim() || null,
    trustProxy: env.TRUST_PROXY === '1',
  };
}
