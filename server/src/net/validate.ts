import type { ClientMessage } from '../../../shared/protocol.ts';

/** Generous raw limits – the game cleans and cuts further. */
const LIMITS = { name: 60, text: 400, pin: 64, code: 8, token: 64, stack: 8 };

const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;

/** Parses and validates an untrusted client message. Returns null if malformed. */
export function parseClientMessage(raw: string): ClientMessage | null {
  let m: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    m = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  switch (m.t) {
    case 'create':
      return str(m.pin, LIMITS.pin) && str(m.name, LIMITS.name) ? { t: 'create', pin: m.pin, name: m.name } : null;
    case 'join':
      return str(m.code, LIMITS.code) && str(m.name, LIMITS.name) ? { t: 'join', code: m.code, name: m.name } : null;
    case 'resume':
      return str(m.code, LIMITS.code) && str(m.token, LIMITS.token)
        ? { t: 'resume', code: m.code, token: m.token }
        : null;
    case 'ready':
      return typeof m.ready === 'boolean' ? { t: 'ready', ready: m.ready } : null;
    case 'draft':
    case 'submit':
      return str(m.text, LIMITS.text) ? { t: m.t, text: m.text } : null;
    case 'vote':
      return str(m.stack, LIMITS.stack) ? { t: 'vote', stack: m.stack } : null;
    case 'decide':
      return m.decision === 'continue' || m.decision === 'pass' ? { t: 'decide', decision: m.decision } : null;
    case 'leave':
    case 'start':
    case 'clear':
      return { t: m.t };
    default:
      return null;
  }
}
