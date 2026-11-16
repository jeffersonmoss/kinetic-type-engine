// Word lookup and the default emphasis tier of a sung word. The song's words and lines and its word rules come from
// configureEngine (config.ts).
import {CONNECTIVE_SET, EMPHASIS, LINES, WORD_RULE, WORDS} from './config';
import type {Tier} from './types';

/** Lower-case letters and digits only: the key used to match a text to a sung word. */
export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Global index of the n-th word in line `lineId` whose text matches `text` (case and punctuation ignored). */
export const wordIx = (lineId: number, text: string, nth = 0): number => {
  const key = norm(text);
  const line = LINES[lineId];
  if (!line) throw new Error(`wordIx: no line ${lineId}`);
  let seen = 0;
  for (const i of line.words) if (norm(WORDS[i].text) === key) { if (seen === nth) return i; seen++; }
  throw new Error(`wordIx: "${text}" (#${nth}) not found in line ${lineId}: ${line.text}`);
};
/** Inclusive range of global indices [first, last] for words matching two texts in a line. */
export const wordRange = (lineId: number, first: string, last: string): [number, number] => [wordIx(lineId, first), wordIx(lineId, last)];

/** Is word i the last word of its lyric line? */
export const isLineFinal = (i: number) => { const l = LINES[WORDS[i].line]; return l.words[l.words.length - 1] === i; };

/** Is word i a connective (E0, half size)? */
export const isConnective = (i: number) => CONNECTIVE_SET.has(norm(WORDS[i]?.text ?? ''));

/** Default tier of a word given the block's hero and e2 lists: the song's word rule first, then hero (3), then
 *  e2, line-final and emphasis words (2), connectives (0), everything else (1). */
export const defaultTier = (i: number, hero?: number[], e2?: number[]): Tier => {
  const r = WORD_RULE(i)?.tier;
  if (r !== undefined) return r;
  if (hero?.includes(i)) return 3;
  if (e2?.includes(i) || isLineFinal(i) || EMPHASIS(i)) return 2;
  if (isConnective(i)) return 0;
  return 1;
};
