// TYPE (rule 67) and NEST (rule 56). TYPE: small DM Serif Display italic letters appear one at a time, 2 frames apart,
// each a 3-frame fade so nothing blinks, at the flank or inside the counter of a giant letter. By default the last letter
// is fully in on the word's sung frame (align 'end'); align 'start' starts typing on it. NEST is TYPE inside the counter
// of a named letter of a giant word, no wider than 80 percent of the counter (the validator checks the width), and is
// almost always followed by a rig DIVE into the counter (rigDiveInto in authoring.ts).
// params: gap (2 frames between letters), fade (3), align 'end' | 'start', words 'together' (type the whole block in
// one run, ending on the first sung word) or 'each' (default: each word typed to its own sung frame).
import {FPS, LINES, WORDS} from '../config';
import type {BoardLayout, VerbCue} from '../types';
import {clamp} from '../util';
import {letterIdentity, registerVerb} from '../verbRegistry';
import {PC, wordsOfCue} from './common';

const letterCount = (L: BoardLayout, i: number) => L.words.get(i)!.adv.length;
/** Frame the first letter of word i starts fading in. */
export const typeStart = (cue: VerbCue, L: BoardLayout, i: number): number => {
  const gap = PC(cue, 'gap', 2), fade = PC(cue, 'fade', 3);
  const words = wordsOfCue(cue, L);
  if (PC(cue, 'words', 'each') === 'together') {
    const total = words.reduce((a, j) => a + letterCount(L, j), 0);
    const first = Math.min(...words.map((j) => L.words.get(j)!.sf));
    const s0 = cue.at !== undefined ? cue.at * FPS : cue.params?.showFrom !== undefined ? (cue.params.showFrom as number) * FPS : first - (total - 1) * gap - fade;
    const before = words.slice(0, words.indexOf(i)).reduce((a, j) => a + letterCount(L, j), 0);
    return s0 + before * gap;
  }
  const g = L.words.get(i)!;
  if (cue.at !== undefined && i === words[0]) return cue.at * FPS;
  if (PC(cue, 'align', 'end') === 'start') return g.sf;
  return eachSchedule(cue, L).get(i) ?? g.sf;
};
/** 'each': letters are typed strictly left to right across the words (ruling 194.12), each word's last letter fully in
 *  by its sung frame. Scheduled backward from the last letter: every letter starts `gap` frames before the next one,
 *  or earlier when its word must be done by its own sung frame. Returns each word's first-letter start frame. */
const schedMemo = new WeakMap<VerbCue, Map<number, number>>();
const eachSchedule = (cue: VerbCue, L: BoardLayout): Map<number, number> => {
  const hit = schedMemo.get(cue);
  if (hit) return hit;
  const gap = PC(cue, 'gap', 2), fade = PC(cue, 'fade', 3);
  const words = wordsOfCue(cue, L);
  const out = new Map<number, number>();
  let next = Infinity; // start frame of the letter after the current one
  for (let k = words.length - 1; k >= 0; k--) {
    const g = L.words.get(words[k])!;
    const n = letterCount(L, words[k]);
    let t = Math.min(next - gap, g.sf - fade); // this word's last letter
    t -= (n - 1) * gap; // its first letter
    out.set(words[k], t);
    next = t;
  }
  schedMemo.set(cue, out);
  return out;
};
const typeDef = {
  early: true, replacesEnter: true, gradual: true,
  affects: (cue: VerbCue, L: BoardLayout) => wordsOfCue(cue, L),
  defaultAt: (cue: VerbCue, L: BoardLayout) => Math.min(...wordsOfCue(cue, L).map((i) => typeStart(cue, L, i))) / FPS,
  modify: (c: Parameters<NonNullable<import('../verbRegistry').VerbDef['modify']>>[0]) => {
    const gap = PC(c.cue, 'gap', 2), fade = PC(c.cue, 'fade', 3);
    const s = typeStart(c.cue, c.L, c.i);
    const n = c.geom.adv.length;
    if (c.f >= s + (n - 1) * gap + fade) return null;
    if (c.f < s) return {hidden: true, opacity: 0};
    return {letters: c.geom.adv.map((_, k) => ({...letterIdentity(), opacity: clamp((c.f - s - k * gap) / fade)}))};
  },
};
registerVerb('type', typeDef);
// NEST sits inside the counter, so inside the host word's box: the nest words and the host word may overlap (the
// validator still checks the nest's width against the counter).
registerVerb('nest', {...typeDef,
  // the host word is held bright while type is nested in it (rule 56, ruling 194.1): until the nested words retire
  holds: (cue: VerbCue, L: BoardLayout) => {
    const a = cue.params?.from as {word?: number} | undefined;
    if (a?.word === undefined || !L.words.has(a.word)) return [];
    const until = Math.max(...wordsOfCue(cue, L).map((i) => { const g = L.words.get(i)!; const l = LINES[g.line]; return Math.max(g.sf + 20, (l ? WORDS[l.words[l.words.length - 1]].end_s * FPS : 0) + 6); }));
    return [{word: a.word, until}];
  },
  overlapExempt: (cue: VerbCue, L: BoardLayout) => {
  const a = cue.params?.from as {word?: number} | undefined;
  return a?.word !== undefined ? wordsOfCue(cue, L).map((n): [number, number] => [a.word!, n]) : [];
}});
