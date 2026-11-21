import {effectiveStress, type Stress} from '../song';
import {key, type Run} from './bind';

export interface SyllableTarget {
  glyphs: number[];
  sungFrame?: number;
  stress?: Stress;
  text: string;
  index: number;
}

/** Project one token's partition onto its display runs, including hyphenated portrait splits. */
export function syllableTargets(run: Run, runs: readonly Run[], parts: readonly {
  text: string; frame?: number; stress?: Stress;
}[]): SyllableTarget[] {
  const segments = parts.map(({text, frame, stress}, index): SyllableTarget =>
    ({text, sungFrame: frame, stress, index, glyphs: []}));
  if (parts.map(part => key(part.text)).join('') !== key(run.vocal!.token.text)) {
    throw new Error(`${run.vocal!.token.id}: syllables must spell "${run.vocal!.token.text}"`);
  }
  let offset = 0;
  const ends = parts.map(({text}) => offset += key(text).length);
  let position = 0;
  for (const part of runs) {
    if (part === run) break;
    if (part.vocal?.token.id === run.vocal?.token.id) position += key(part.text).length;
  }
  [...run.text].forEach((glyph, index) => {
    const width = key(glyph).length;
    const at = segments.findIndex((_, i) => ends[i] > (width ? position : Math.max(0, position - 1)));
    segments[at < 0 ? segments.length - 1 : at].glyphs.push(index);
    position += width;
  });
  return segments.filter(({glyphs}) => glyphs.length);
}

export function inferredTargets(run: Run, runs: readonly Run[]) {
  const syllables = run.vocal?.syllables;
  return syllables?.length ? syllableTargets(run, runs, syllables.map(syllable =>
    ({text: syllable.text, frame: syllable.frame, stress: effectiveStress(syllable)}))) : undefined;
}
