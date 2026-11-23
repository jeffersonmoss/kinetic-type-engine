// Word roles (engine fix brief 7, 22 November 2026): one keyword classifier shared by the grey rule (Type rule 3:
// keywords are never grey), the drop rule (Type rule 2: keywords are never dropped except by necessity) and keyword
// mode; per-word overrides from the song input; and the name, score and colour passes on the joined scene.
// Generic; no song names.
//
// Keyword (Jefferson): a subject, main verb, object, name, or a word stressed on the beat. There is no parser here, so
// the classifier works by word class, and its choices are reported:
//   1. Names, numbers, song pins and `keep` words, player names, team names: keywords.
//   2. Personal pronouns and pronoun contractions (YOU, HE, IT'S, THAT'S): keywords (they are the subjects and objects).
//   3. Articles, possessive determiners, prepositions, conjunctions, auxiliaries, interjections and filler adverbs:
//      fillers, except a preposition or particle that ends its clause (YOU UP, WE CIRCLE IN), which is the predicate.
//   4. The rhyme word at a line end, a word the map marks stressed (`accent`) and a word the map writes in capitals: keywords.
//   5. Everything else (nouns, main verbs, adjectives, NOT): keywords.
// Song input `word_overrides` { "<song map word index>": { keyword?: bool, name?: bool, score?: bool } } wins.
import fs from 'node:fs';
import { wordBox } from './compose_plaques.mjs';
import { JERSEY_FONTS, TEXT_COLOURS } from './style.mjs';

const set = s => new Set(s.split(/\s+/).filter(Boolean));
export const FILLERS = {
  article: set('a an the'),
  determiner: set("my your his her its our their this these those every each some any"),
  preposition: set("to of in on at for with from by into onto off out up down over under about like through after before around inside outside 'bout of_the"),
  conjunction: set("and but or so if than as because when where while though nor yet 'cause cuz"),
  auxiliary: set("is are was were be been being am do does did have has had can will would could should may might must shall 's"),
  interjection: set('oh yeah well hey uh um ooh ah whoa'),
  adverb: set('just now then there here also too very really always again'),
};
const PRONOUNS = set("i you he she we they it me him us them i'm you're he's she's we're they're it's that's i'll you'll he'll she'll we'll they'll i've you've we've they've i'd you'd he'd she'd we'd they'd who what");
const norm = t => String(t).toLowerCase().replace(/[‘’]/g, "'").replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, '').replace(/^'+|'+$/g, '').replace(/\s+/g, '_');
const fillerClass = t => Object.entries(FILLERS).find(([, s]) => s.has(t))?.[0] ?? null;

// words: song map words [{text, start_s, line, accent?}] in sung order. names: name or number texts. overrides: the
// song input's word_overrides. Returns per index { keyword, why, filler } (filler: the class name when not a keyword).
export function keywordFlags(words, { names = [], keep = [], overrides = {} } = {}) {
  const nameSet = new Set([...names, ...keep].map(norm));
  return words.map((w, i) => {
    const o = overrides[String(i)] ?? {};
    if (o.keyword != null) return { keyword: !!o.keyword, why: 'song input override' };
    if (o.name === true || o.score === true) return { keyword: true, why: o.name ? 'name (override)' : 'score' };
    const raw = String(w.text), t = norm(raw);
    const lineEnd = i === words.length - 1 || words[i + 1].line !== w.line;
    const clauseEnd = lineEnd || /[,.;:!?]['")]*$/.test(raw);
    if (o.name !== false && (nameSet.has(t) || /\d/.test(t) || /^(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(-\w+)?$/.test(t))) return { keyword: true, why: 'name or number' };
    if (PRONOUNS.has(t)) return { keyword: true, why: 'pronoun (subject or object)' };
    const cls = fillerClass(t);
    if (cls === 'preposition' && clauseEnd) return { keyword: true, why: 'particle ending its clause (predicate)' };
    if (lineEnd) return { keyword: true, why: 'rhyme word at the line end' };
    if (w.accent) return { keyword: true, why: 'stressed' };
    if (/^[A-Z][A-Z']+$/.test(raw.replace(/[^A-Za-z']/g, ''))) return { keyword: true, why: 'stressed (written in capitals in the map)' };
    if (cls) return { keyword: false, why: cls, filler: cls };
    if (t === 'that') return { keyword: false, why: 'conjunction', filler: 'conjunction' };
    return { keyword: true, why: 'content word' };
  });
}

// Index of the song map word a scene word was cut from (time and text), or -1.
const T = t => String(t).toUpperCase().replace(/[^A-Z0-9']/g, '');
export function mapIndexOf(w, mapWords, display = x => x) {
  return mapWords.findIndex(m => Math.abs(m.start_s - w.t) < 0.05 && (T(display(m.text)) === T(w.text) || T(m.text) === T(w.text)));
}

const GREYS = new Set(['grey', 'grey-75', 'grey-50']);
const isGreyHex = c => typeof c === 'string' && [TEXT_COLOURS['grey-75'], TEXT_COLOURS['grey-50']].includes(c.toUpperCase());
export const isGrey = w => GREYS.has(w.style) || isGreyHex(w.colours?.text);
export const ungrey = w => { const was = w.style; w.style = 'cream'; if (w.colours?.text) w.colours.text = TEXT_COLOURS.cream; return was; };

// Joined-scene pass: marks w.keyword (and w.keyword_why), applies name and score overrides, makes keywords and player
// names never grey, gives player names the jersey font and takes it from a name match that the song input says is not
// a name (for example a pun). A font change re-measures the word box about its centre.
export function applyWordRoles(scene, { mapWords, display, song, names = [], metricsPath }) {
  const overrides = song.word_overrides ?? {};
  const flags = keywordFlags(mapWords, { names, keep: song.fast_words?.keep ?? [], overrides });
  const playerKey = new Set((song.player_names ?? []).map(T));
  const metrics = metricsPath ? JSON.parse(fs.readFileSync(metricsPath, 'utf8')) : null;
  const log = { greyKeywords: [], greyNames: [], fontChanges: [], scores: [], unmatched: [] };
  // Same cap height, so the height stays; the width is the new font's (with the jersey bold width when jersey).
  const reFont = (w, font) => {
    if (!metrics || w.font === font || !metrics.fonts[font]) return false;
    const b = wordBox(w.text, font, w.cap, (w.pad ?? 0) > 0.2 * w.cap ? 'block' : 'word', metrics);
    w.font = font; w.fontPx = b.fontPx; w.w = b.w; return true;
  };
  const jersey = JERSEY_FONTS[0];
  for (const w of scene.words) {
    if (w.t == null) continue;
    const i = mapIndexOf(w, mapWords, display);
    if (i < 0) { if (!w.echo && !w.reveal_copy_of && !w.wordmark) log.unmatched.push(`${w.id} ${w.text}`); continue; }
    const o = overrides[String(i)] ?? {};
    w.map_index = i;
    w.keyword = flags[i].keyword; w.keyword_why = flags[i].why;
    if (o.score) {
      // Bulb digits (viewer scoreTexture): each digit is 4 bulb steps wide, 2.4 between digits, 1.6 for the end bulbs,
      // 8 steps to the cap height; the box is made that wide.
      const n = [...String(w.text)].filter(ch => /\d/.test(ch)).length, pad = w.pad ?? 0.08 * w.cap;
      if (n) w.w = (n * 4 + (n - 1) * 2.4 + 1.6) / 8 * w.cap + 2 * pad;
      w.score = true; log.scores.push(`${w.id} ${w.text} (map word ${i}) at ${w.t.toFixed(2)} s: scoreboard bulb digits`);
    }
    const isName = o.name ?? playerKey.has(T(w.text).replace(/'S$/, ''));
    if (o.name === false && JERSEY_FONTS.includes(w.font) && metrics) {
      // The layout was made for the jersey box, so the new font must fit that width: the nearest neighbour's font if it
      // fits, else the narrowest that fits, else the narrowest scaled down to the old width.
      const line = scene.words.filter(x => x !== w && x.t != null && Math.abs(x.t - w.t) < 4 && !JERSEY_FONTS.includes(x.font) && !x.wordmark);
      const near = line.sort((a, b) => Math.abs(a.t - w.t) - Math.abs(b.t - w.t))[0]?.font;
      const kind = (w.pad ?? 0) > 0.2 * w.cap ? 'block' : 'word';
      const opts = [...new Set([near, 'anton', 'gothic', 'wide'].filter(f => f && metrics.fonts[f]))].map(f => ({ f, b: wordBox(w.text, f, w.cap, kind, metrics) }));
      const fit = opts.find(x => x.b.w <= w.w * 1.02) ?? opts.sort((a, b) => a.b.w - b.b.w)[0];
      if (fit) {
        const was = w.font, k = Math.min(1, w.w / fit.b.w);
        w.font = fit.f; w.fontPx = fit.b.fontPx * k; if (k < 1) { w.cap *= k; w.pad = (w.pad ?? 0) * k; w.h *= k; }
        w.w = fit.b.w * k;
        log.fontChanges.push(`${w.id} ${w.text} at ${w.t.toFixed(2)} s: ${was} (jersey) -> ${fit.f}${k < 1 ? `, scaled x${k.toFixed(2)} to keep its width` : ''} (song input: not a name)`);
      }
    }
    if (isName && !w.wordmark && !w.score) {
      if (!JERSEY_FONTS.includes(w.font) && reFont(w, jersey)) log.fontChanges.push(`${w.id} ${w.text} at ${w.t.toFixed(2)} s: -> jersey font (player name)`);
      if (isGrey(w)) log.greyNames.push(`${w.id} ${w.text} at ${w.t.toFixed(2)} s: ${ungrey(w)} -> cream (player name)`);
    }
    if (w.keyword && isGrey(w)) log.greyKeywords.push(`${w.id} ${w.text} at ${w.t.toFixed(2)} s: ${ungrey(w)} -> cream (keyword: ${w.keyword_why})`);
  }
  // Reveal copies follow their source word's colour.
  const byId = new Map(scene.words.map(x => [x.id, x]));
  for (const w of scene.words) {
    const src = byId.get(w.reveal_copy_of ?? null);
    if (src && isGrey(w) && !isGrey(src)) ungrey(w);
  }
  return { flags, log };
}
