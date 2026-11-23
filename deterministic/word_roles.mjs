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
import { JERSEY_FONTS, TEXT_COLOURS, contrast, teamStyleIds } from './style.mjs';
import { scanOverlap } from './overlap_gate.mjs';
import * as G from './shown_gate.mjs';

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
const PARTICLES = set('up down out off over back away around on in'), OBJECTS = set('me you him her us them it');
const norm = t => String(t).toLowerCase().replace(/[‘’]/g, "'").replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, '').replace(/^'+|'+$/g, '').replace(/\s+/g, '_');
const fillerClass = t => Object.entries(FILLERS).find(([, s]) => s.has(t))?.[0] ?? null;

// words: song map words [{text, start_s, line, accent?}] in sung order. names: name or number texts. overrides: the
// song input's word_overrides. Returns per index { keyword, why, filler } (filler: the class name when not a keyword).
export function keywordFlags(words, { names = [], keep = [], overrides = {} } = {}) {
  const nameSet = new Set([...names, ...keep].map(norm));
  return words.map((w, i) => {
    const o = overrides[String(i)] ?? {};
    if (o.keyword != null) return { keyword: !!o.keyword, why: o.keyword_why ? `marked (song input): ${o.keyword_why}` : 'song input override' };
    if (o.name === true || o.score === true) return { keyword: true, why: o.name ? 'name (override)' : 'score' };
    const raw = String(w.text), t = norm(raw);
    const lineEnd = i === words.length - 1 || words[i + 1].line !== w.line;
    const clauseEnd = lineEnd || /[,.;:!?]['")]*$/.test(raw);
    if (o.name !== false && (nameSet.has(t) || /\d/.test(t) || /^(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(-\w+)?$/.test(t))) return { keyword: true, why: 'name or number' };
    if (PRONOUNS.has(t)) return { keyword: true, why: 'pronoun (subject or object)' };
    const cls = fillerClass(t);
    if (cls === 'preposition' && clauseEnd) return { keyword: true, why: 'particle ending its clause (predicate)' };
    // A particle right after an object pronoun belongs to the verb (shut you DOWN, pick him UP): brief 10 item 48.
    const prevT = i > 0 && words[i - 1].line === w.line ? norm(words[i - 1].text) : null;
    if (cls === 'preposition' && PARTICLES.has(t) && OBJECTS.has(prevT)) return { keyword: true, why: 'particle after its object (phrasal verb)' };
    if (lineEnd) return { keyword: true, why: 'rhyme word at the line end' };
    if (w.accent) return { keyword: true, why: 'stressed' };
    if (/^[A-Z][A-Z']+$/.test(raw.replace(/[^A-Za-z']/g, ''))) return { keyword: true, why: 'stressed (written in capitals in the map)' };
    if (cls) return { keyword: false, why: cls, filler: cls };
    if (t === 'that') return { keyword: false, why: 'conjunction', filler: 'conjunction' };
    return { keyword: true, why: 'content word' };
  });
}

// Numerals (brief 10 items 40 and 41; Type rule 3: every numeral is judged as a score or a jersey number). A word drawn
// as digits is a jersey number when its context says so: "number", "no.", "#", "wearing" or "jersey" next to it, or a
// player name right before or after it. Otherwise it is a score or a stat (points, "43 on Denver", "34" after
// "talkin'"), which is the common case in a game song; the reason is reported. Song input word_overrides wins:
// { numeral: "score" | "jersey" } or the older { score: true }.
const JERSEY_BEFORE = set("number no no. num # wearing wears wore rocking rocks repping jersey"), JERSEY_AFTER = set("jersey on_his_back");
const SCORE_AFTER = set("points point pts on against off out to in from and-one");
const SCORE_BEFORE = set("dropped drop drops dropping scored scores score put puts hung hangs talkin talking for with by gave gives");
export function numeralKind(words, i, { players = [] } = {}) {
  const w = words[i], t = norm(w.text), prev = i > 0 && words[i - 1].line === w.line ? norm(words[i - 1].text) : null;
  const next = i + 1 < words.length && words[i + 1].line === w.line ? norm(words[i + 1].text) : null;
  const P = new Set(players.map(norm)), raw = String(w.text);
  if (/^#/.test(raw.trim()) || JERSEY_BEFORE.has(prev)) return { kind: 'jersey', why: `"${prev ?? '#'}" before it` };
  if (JERSEY_AFTER.has(next)) return { kind: 'jersey', why: `"${next}" after it` };
  if (P.has(prev) || P.has(next)) return { kind: 'jersey', why: `next to the player name ${(P.has(prev) ? prev : next).toUpperCase()}` };
  if (SCORE_AFTER.has(next)) return { kind: 'score', why: `"${next}" after it` };
  if (SCORE_BEFORE.has(prev)) return { kind: 'score', why: `"${prev}" before it` };
  return { kind: 'score', why: 'no jersey cue (a number in a game song is read as a score or stat)' };
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
  const jersey = JERSEY_FONTS[0];
  const log = { greyKeywords: [], greyNames: [], fontChanges: [], scores: [], numerals: [], displays: [], unmatched: [] };
  // Same cap height, so the height stays; the width is the new font's (with the jersey bold width when jersey).
  const reFont = (w, font) => {
    if (!metrics || w.font === font || !metrics.fonts[font]) return false;
    const b = wordBox(w.text, font, w.cap, (w.pad ?? 0) > 0.2 * w.cap ? 'block' : 'word', metrics);
    w.font = font; w.fontPx = b.fontPx; w.w = b.w; return true;
  };
  for (const w of scene.words) {
    if (w.t == null) continue;
    const i = mapIndexOf(w, mapWords, display);
    if (i < 0) { if (!w.echo && !w.reveal_copy_of && !w.wordmark) log.unmatched.push(`${w.id} ${w.text}`); continue; }
    const o = overrides[String(i)] ?? {};
    w.map_index = i;
    w.keyword = flags[i].keyword; w.keyword_why = flags[i].why;
    if (PRONOUNS.has(norm(mapWords[i].text))) w.pronoun = true; // for hold-hide partners, whatever marked the keyword
    // Brief 10 item 42: a display-text override (for example TREY -> TR3Y) changes the letters only; the box, font and
    // size stay exactly as built.
    if (typeof o.display === 'string' && o.display !== w.text) { log.displays.push(`${w.id} ${w.text} (map word ${i}) at ${w.t.toFixed(2)} s: shown as ${o.display} (song input display override)`); w.text = o.display; }
    // Brief 10 items 40 and 41: a word drawn as digits goes to bulb digits (score) or the jersey font (jersey number).
    let numeral = null;
    if (/\d/.test(w.text) && !o.display) {
      const k = o.numeral ?? (o.score === true ? 'score' : o.score === false ? 'jersey' : null);
      numeral = k ? { kind: k, why: 'song input override' } : numeralKind(mapWords, i, { players: song.player_names ?? [] });
      log.numerals.push(`${w.id} ${w.text} (map word ${i}) at ${w.t.toFixed(2)} s: ${numeral.kind === 'score' ? 'score, bulb digits' : 'jersey number, jersey font'} (${numeral.why})`);
    }
    if (numeral?.kind === 'score') {
      // Bulb digits (viewer scoreTexture): each digit is 4 bulb steps wide, 2.4 between digits, 1.6 for the end bulbs,
      // 8 steps to the cap height; the box is made that wide.
      const n = [...String(w.text)].filter(ch => /\d/.test(ch)).length, pad = w.pad ?? 0.08 * w.cap;
      if (n) w.w = (n * 4 + (n - 1) * 2.4 + 1.6) / 8 * w.cap + 2 * pad;
      w.score = true; log.scores.push(`${w.id} ${w.text} (map word ${i}) at ${w.t.toFixed(2)} s: scoreboard bulb digits`);
    }
    if (numeral?.kind === 'jersey') {
      w.score = false; w.jersey_number = true;
      if (!JERSEY_FONTS.includes(w.font) && reFont(w, jersey)) log.fontChanges.push(`${w.id} ${w.text} at ${w.t.toFixed(2)} s: -> jersey font (jersey number)`);
      if (isGrey(w)) ungrey(w);
    }
    const isName = o.name ?? playerKey.has(T(w.text).replace(/'S$/, ''));
    if (isName && !w.wordmark && !w.score) w.player_name = true;
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

// Team colours for player names and jersey numbers (brief 10 items 46 and 47, Jefferson 23 November 2026). Song setting
// `jersey_colours`: "block" (default) draws white jersey letters on a block of the darker team colour (letter colour:
// `team_colours.block_text`, per player or team `player_teams` { NAME: { block_text } or "TEAM", TEAM: { ... } }, brief 11); "letters" draws
// the letters in the team colour that reads best on the ground, no block; "off" leaves them as built (for videos made
// before this rule). The team is the song's own: the palette's team styles, or song setting `team_colours`
// { dark, light } (per player: `player_teams` { NAME: { dark, light } }). A block grows the word's box about its centre
// (block padding at the same letter height); if that would overlap a word or cut the word at an edge where it was
// whole, the block is drawn inside the word's own box (tighter padding, no layout change), and the report says so.
const lum = hex => contrast(hex, '#000000');
export function songTeamColours(palette, song) {
  const blockText = song.team_colours?.block_text ?? TEXT_COLOURS.white;
  if (song.team_colours?.dark) return { ...song.team_colours, block_text: blockText };
  const team = teamStyleIds(palette), ground = palette.ground ?? '#0b0b0d';
  const cols = [...new Set(palette.styles.filter(s => team.has(s.id)).flatMap(s => [s.colours?.background, s.colours?.text]).filter(c => c && !/^#(f{6}|f3ebdd)$/i.test(c)))];
  if (!cols.length) return null;
  const dark = cols.sort((a, b) => lum(a) - lum(b))[0];
  const light = [...cols].sort((a, b) => contrast(b, ground) - contrast(a, ground))[0];
  return { dark, light: contrast(light, ground) >= 3 ? light : TEXT_COLOURS.white, block_text: blockText };
}
export function teamColourNames(scene, { song, palette, metricsPath, until = scene.meta.frames, onsetOf }) {
  const mode = song.jersey_colours ?? 'block', log = [];
  if (mode === 'off') return { mode, log: ['off (song setting jersey_colours)'] };
  const base = songTeamColours(palette, song);
  if (!base) return { mode, log: ['no team colours in the palette or song settings'] };
  const metrics = metricsPath ? JSON.parse(fs.readFileSync(metricsPath, 'utf8')) : null;
  const I = globalThis.KT_INTERP, vfov = scene.meta.vfov ?? 40;
  const mine = (w, a, b) => scanOverlap(scene, { from: a, until: b }).overlaps.filter(x => x.includes(`${w.id} `)).length;
  const wholeFrames = w => { const o = onsetOf(w), A = Math.max(w.on, G.appearanceFrame(w)), out = [];
    if (o == null) return out; for (let f = A, e = Math.max(A + G.SHOWN_FRAMES - 1, o); f <= e && f < until; f++) if (G.fullyShown(w, f, I.poseAt(scene.cams, f), vfov)) out.push(f); return out; };
  for (const w of scene.words) {
    if (!(w.player_name || w.jersey_number) || w.reveal_copy_of || w.echo || w.wordmark || w.score) continue;
    // Brief 11: a player entry may set only block_text, or name a team entry in player_teams ("TREY": "BLAZERS").
    let pt = song.player_teams?.[T(w.text).replace(/'S$/, '')] ?? {};
    if (typeof pt === 'string') pt = song.player_teams?.[pt] ?? {};
    const team = { ...base, ...pt };
    const keep = JSON.stringify({ w: w.w, h: w.h, pad: w.pad ?? null, colours: w.colours ?? null });
    const back = () => { const k = JSON.parse(keep); w.w = k.w; w.h = k.h; if (k.pad == null) delete w.pad; else w.pad = k.pad; if (k.colours) w.colours = k.colours; else delete w.colours; };
    let how = 'letters';
    if (mode === 'block' && metrics) {
      const a = Math.max(0, w.on), b = Math.min(until, w.off ?? until), before = mine(w, a, b), whole = wholeFrames(w);
      const blockPad = 0.28 * w.cap, pad0 = w.pad ?? 0.08 * w.cap;
      if (pad0 < blockPad) { const dw = 2 * (blockPad - pad0); w.w += dw; w.h += dw; w.pad = blockPad; }
      w.colours = { ...(w.colours ?? {}), text: team.block_text, background: team.dark };
      const now = wholeFrames(w);
      if (mine(w, a, b) > before || now.length < whole.length) {
        // Brief 10 item 47.1: the block is the default, so a word with no room for block padding keeps its own box and
        // gets the block inside it (tighter padding), rather than switching to letters.
        back(); w.colours = { ...(w.colours ?? {}), text: team.block_text, background: team.dark }; how = 'tight block';
      } else how = 'block';
    }
    if (how === 'letters') { const c = { ...(w.colours ?? {}), text: team.light }; delete c.background; w.colours = c; w.style = 'cream'; if ((w.pad ?? 0) > 0.2 * w.cap) { const d = 2 * (w.pad - 0.08 * w.cap); w.w -= d; w.h -= d; w.pad = 0.08 * w.cap; } }
    log.push(`${w.id} ${w.text} at ${(w.t ?? 0).toFixed(2)} s: ${how === 'block' ? `${team.block_text} on a ${team.dark} block` : how === 'tight block' ? `${team.block_text} on a ${team.dark} block inside its own box (block padding would overlap a word or cut it at an edge)` : `letters in ${team.light}`}`);
  }
  // Reveal copies and echoes follow their source word.
  const byId = new Map(scene.words.map(x => [x.id, x]));
  for (const c of scene.words) { const src = byId.get(c.reveal_copy_of ?? c.echo_of ?? null); if (src && (src.player_name || src.jersey_number) && src.colours) { c.colours = { ...src.colours }; } }
  return { mode, team: base, log };
}
