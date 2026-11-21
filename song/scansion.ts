import type {Scansion, SongMap, SongToken, Stress, Syllable, TimedSyllable, TokenScansion} from './types';

export type Pronunciations = ReadonlyMap<string, readonly Stress[]>;
export const effectiveStress = (syllable: Syllable) => syllable.sungStress ?? syllable.stress;
const beatTolerance = 0.04; // seconds, measured against the estimated onset

export function parseCmuDictionary(source: string): Pronunciations {
  const entries = new Map<string, Stress[]>();
  for (const line of source.split(/\r?\n/u)) {
    const [word, ...phones] = line.split('#', 1)[0].trim().split(/\s+/u);
    if (!/^[a-z']/iu.test(word) || /\(\d+\)$/u.test(word)) continue;
    const stress = phones.flatMap(phone => /^[A-Z]+[012]$/u.test(phone) ? [Number(phone.at(-1)) as Stress] : []);
    if (stress.length && !entries.has(word.toLowerCase())) entries.set(word.toLowerCase(), stress);
  }
  return entries;
}

const vowel = /[aeiouy]/i;
const weakWords = new Set('a an and as at but for his in of on or the to'.split(' '));
const nameStress: Record<string, Stress[]> = {embiid: [0, 1], lebron: [0, 1], tyrese: [0, 1]};
const ascii = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').replace(/’/gu, "'");

/** Estimate spelling cuts between nuclei. A dictionary supplies count and stress, not letter boundaries. */
function spellingCuts(word: string, count?: number): number[] {
  const letters = [...word];
  const normalized = letters.map(ascii);
  let nuclei = normalized.flatMap((letter, i) => vowel.test(letter) && !(i === 0 && /^y$/i.test(letter)) &&
    (i === 0 || !vowel.test(normalized[i - 1])) ? [i] : []);
  const spelling = normalized.join('').toLowerCase();
  if (nuclei.length > (count ?? 1) && /e(?:s|d)?$/u.test(spelling) && !/[^aeiouy]le$/u.test(spelling) && !/[td]ed$/u.test(spelling)) {
    const silent = letters.length - (spelling.endsWith('e') ? 1 : 2);
    nuclei = nuclei.filter(i => i !== silent);
  }
  if (count && nuclei.length < count) {
    // A known pronunciation can distinguish consecutive written vowels (e.g. re-act).
    for (let i = 1; i < letters.length && nuclei.length < count; i++) {
      if (vowel.test(normalized[i]) && vowel.test(normalized[i - 1]) && !nuclei.includes(i)) nuclei.push(i);
    }
    nuclei.sort((a, b) => a - b);
  }
  const cuts = nuclei.slice(1).map((start, i) => {
    let cut = start;
    while (cut > nuclei[i] + 1 && /[^aeiouy\W_]/i.test(normalized[cut - 1])) cut--;
    if (spelling.slice(start) === 'ing' || cut === start) return start;
    const pair = normalized.slice(start - 2, start).join('');
    const onset = /^(?:ch|sh|th|ph|wh|[bcfgkps]l|[bcdfgkpt]r)$/i.test(pair) ? 2 : 1;
    return Math.max(cut, start - onset);
  });
  if (count && cuts.length !== count - 1) {
    // Reconcile phonetic spellings, initialisms and display substitutions.
    return Array.from({length: count - 1}, (_, i) => Math.round((i + 1) * letters.length / count));
  }
  return cuts;
}

function parts(text: string, cuts: number[]): string[] {
  const letters = [...text];
  return [0, ...cuts].map((from, i) => letters.slice(from, cuts[i] ?? letters.length).join(''));
}

function estimate(token: SongToken, dictionary: Pronunciations): TokenScansion {
  const spoken = ascii(token.rawText).match(/[\p{L}\p{N}]+(?:'[\p{L}]+)*/gu) ?? [];
  let fromDictionary = spoken.length > 0;
  const explicitEmphasis = spoken.some(word => /[a-z]/u.test(word)) && spoken.length > 1;
  const pronunciation = spoken.map((word, i): readonly Stress[] => {
    const lower = word.toLowerCase();
    const known = dictionary.get(lower);
    if (known) return known;
    fromDictionary = false;
    if (Object.hasOwn(nameStress, lower)) return nameStress[lower];
    const count = spellingCuts(word).length + 1;
    const first = explicitEmphasis ? (/^[A-Z]+$/u.test(word) ? 1 : 0)
      : weakWords.has(lower) ? 0 : i === 0 ? 1 : 2;
    return [first, ...Array<Stress>(count - 1).fill(0)];
  });
  const stress = pronunciation.flat();
  const displayWords = [...token.text.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu)];
  let cuts: number[];
  if (displayWords.length > 1 && displayWords.length === spoken.length) {
    cuts = displayWords.flatMap(([word], i) => {
      const offset = [...token.text.slice(0, displayWords[i].index)].length;
      const next = displayWords[i + 1];
      return [...spellingCuts(word, pronunciation[i].length).map(cut => offset + cut),
        ...(next ? [[...token.text.slice(0, next.index)].length] : [])];
    });
  } else {
    // Cut the lexical display span so punctuation cannot take an initialism's syllable slot.
    const first = displayWords[0]?.index ?? 0;
    const last = displayWords.at(-1);
    const core = token.text.slice(first, last && last.index + last[0].length);
    cuts = spellingCuts(core, Math.max(1, stress.length)).map(cut => cut + [...token.text.slice(0, first)].length);
  }
  return {source: fromDictionary ? 'cmudict' : 'heuristic', verified: false,
    syllables: parts(token.text, cuts).map((text, i) => ({text, stress: stress[i] ?? 0, sungStress: null}))};
}

export function estimateScansion(map: SongMap, dictionary: Pronunciations = new Map()): Scansion {
  return Object.fromEntries(map.tokens.map(token => [token.id, estimate(token, dictionary)]));
}

export function seedScansion(map: SongMap, estimates: Scansion, lines: readonly (readonly Stress[])[]): Scansion {
  if (lines.length !== map.lines.length) throw new Error(`Scansion template needs ${map.lines.length} lines; got ${lines.length}`);
  return Object.fromEntries(map.lines.flatMap((line, i) => {
    const pattern = lines[i];
    const count = line.tokenIds.reduce((sum, id) => sum + estimates[id].syllables.length, 0);
    if (pattern.length !== count) {
      throw new Error(`Scansion template ${line.id}: needs ${count} syllables; got ${pattern.length}`);
    }
    let j = 0;
    return line.tokenIds.map(id => [id, {source: 'template', verified: false,
      syllables: estimates[id].syllables.map(syllable => ({...syllable, sungStress: pattern[j++]}))}]);
  }));
}

export function timeScansion(map: SongMap, scansion: Scansion): SongMap {
  const uncertain = new Set<string>();
  const tokens = map.tokens.map(token => {
    const entry = Object.hasOwn(scansion, token.id) ? scansion[token.id] : undefined;
    if (!entry) return token;
    const letters = (s: string) => s.normalize('NFKC').toUpperCase().replace(/[^\p{L}\p{N}]/gu, '');
    if (letters(entry.syllables.map(s => s.text).join('')) !== letters(token.text)) {
      throw new Error(`scansion.json: syllables for ${token.id} must spell "${token.text}"`);
    }
    const {start_s: start, end_s: end} = token;
    const boundary = (i: number) => i === 0 ? start : i === entry.syllables.length ? end :
      start + (end - start) * (i / entry.syllables.length);
    const syllables = entry.syllables.map((syllable, i): TimedSyllable => {
      const start_s = boundary(i);
      const nearby = map.analysis.beats.filter(({t}) => Math.abs(t - start_s) <= beatTolerance + 1e-9);
      const beat = nearby.length > 0;
      if (map.analysis.beats.length && beat !== (syllable.stress !== 0)) uncertain.add(token.lineId);
      return {...syllable, start_s, end_s: boundary(i + 1), beat, downbeat: nearby.some(b => b.beat_in_bar === 1)};
    });
    return {...token, syllables};
  });
  return {...map, tokens, lines: map.lines.map(line => ({...line, uncertain: uncertain.has(line.id)}))};
}
