import { readFileSync } from 'node:fs';
import type { Word } from './game/types.ts';

const POS = new Set(['noun', 'verb', 'adj']);

export function loadWords(file: string): Word[] {
  const data = JSON.parse(readFileSync(file, 'utf8')) as { words?: unknown };
  if (!Array.isArray(data.words)) throw new Error(`${file}: "words" fehlt`);
  const words = data.words.filter(isWord);
  if (words.length !== data.words.length) {
    throw new Error(`${file}: ${data.words.length - words.length} ungültige Einträge`);
  }
  if (words.length === 0) throw new Error(`${file}: keine Wörter`);
  return words;
}

function isWord(w: unknown): w is Word {
  if (typeof w !== 'object' || w === null) return false;
  const o = w as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.word === 'string' &&
    o.word.length > 0 &&
    typeof o.definition === 'string' &&
    o.definition.length > 0 &&
    typeof o.pos === 'string' &&
    POS.has(o.pos)
  );
}
