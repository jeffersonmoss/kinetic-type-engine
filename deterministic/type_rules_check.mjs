// Type rules check (engine fix brief 5, changes 3 to 5; Jefferson approved the rules in KIT.md "Type rules").
// Read-only: judges a built final scene against Type rules 1 to 4 and lists the failures by section, with the time
// ranges to render. It never changes the scene.
//   node type_rules_check.mjs "<song>/engine input" "<final scene.json>" [--out <report.md>] [--player-names A,B] [--team-names A,B]
// Player names come from song settings player_names, else --player-names; team names from team_wordmarks keys plus
// --team-names. Importance (rule 2) is keyword mode's ranking over the song map.
import fs from 'node:fs';
import path from 'node:path';
import './interp.js';
import { sizeShortfalls, hasBlock } from './composition.mjs';
import { wordRanks } from './keywords.mjs';
import { fullyShown } from './shown_gate.mjs';
import { TEXT_COLOURS, teamStyleIds, isJerseyFont } from './style.mjs';

const args = process.argv.slice(2), opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const [inputDir, scenePath] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const song = JSON.parse(fs.readFileSync(path.join(inputDir, 'song settings.json'), 'utf8'));
const map = JSON.parse(fs.readFileSync(path.join(inputDir, song.map), 'utf8'));
const scene = JSON.parse(fs.readFileSync(scenePath, 'utf8'));
const FPS = scene.meta.fps ?? 30, I = globalThis.KT_INTERP, vfov = scene.meta.vfov ?? 40;
const until = scene.meta.whole_song?.revealF0 ?? scene.meta.frames;
const onsetOf = w => (w.t != null ? Math.round(w.t * FPS) : null);
const N = t => String(t).toUpperCase().replace(/[’]/g, "'").replace(/^[^A-Z0-9]+|[^A-Z0-9']+$/g, '').replace(/'S$/, '');
const players = new Set([...(song.player_names ?? []), ...(opt('--player-names', '') ? opt('--player-names').split(',') : [])].map(N));
const teams = new Set([...Object.keys(song.team_wordmarks ?? {}), ...(opt('--team-names', '') ? opt('--team-names').split(',') : [])].map(N));
const NUMBERS = Object.values(song.display_numbers ?? {});
const disp = t => String(t).replace(/([a-z]+-[a-z]+)/i, m => song.display_numbers?.[m.toLowerCase()] ?? m);
const settings = {
  ...(song.min_word_h != null ? { minH: song.min_word_h } : {}), ...(song.room_factor != null ? { roomFactor: song.room_factor } : {}),
  ...(song.crowded_words != null ? { crowdedWords: song.crowded_words } : {}), ...(song.crowded_area != null ? { crowdedArea: song.crowded_area } : {}) };
const sections = (scene.meta.sections ?? [{ label: 'Whole song', from: 0 }]).map((s, i, a) => ({ ...s, to: a[i + 1]?.from ?? scene.meta.frames }));
const sectionOf = f => sections.find(s => f >= s.from && f < s.to)?.label ?? '?';
const sec = f => `${(f / FPS).toFixed(2)} s`;
const fails = [];
const opacityAt = (w, f) => { let v = 1; for (const [k, x] of w.opacity ?? []) if (k <= f) v = x; return v; };

// Rule 1: letters at least min_word_h (9%) crowded, 1.5 x (13.5%) with room, in every hold the word is shown in.
for (const x of sizeShortfalls(scene, onsetOf, { until, settings }))
  fails.push({ rule: 1, f: x.start, to: x.end, word: `${x.w.id} ${x.w.text}`, what: `letters ${(100 * x.size).toFixed(1)}% at ${sec(x.f)}, minimum ${(100 * x.min).toFixed(1)}% (${x.crowded ? 'crowded' : 'with room'}${x.focused ? ', its focus hold' : ', a later hold'})`,
    rebuild: x.focused ? 'grow it (it is checked for overlap and staying whole) or, if it is not important, drop it' : 'hide it for that hold or grow it' });

// Rule 2: only non-important words dropped. Important = keyword mode rank 2 or 3 (names, numbers, line-end rhyme word).
const names = [...teams, ...NUMBERS, ...players, ...Object.keys(JSON.parse(fs.readFileSync(path.join(inputDir, song.palette), 'utf8')).pins ?? {})];
const ranks = wordRanks(map.words, song.fast_words ?? {}, { names });
const lyric = scene.words.filter(w => !w.reveal_copy_of && !w.echo && w.t != null);
map.words.forEach((m, i) => {
  if (ranks[i] < 2) return;
  const f = Math.round(m.start_s * FPS);
  if (f >= until) return;
  const w = lyric.find(x => Math.abs(x.t - m.start_s) < 0.05 && (N(x.text) === N(disp(m.text)) || N(x.text).replace(/[^A-Z0-9]/g, '') === N(disp(m.text)).replace(/[^A-Z0-9]/g, '')));
  let shown = false;
  if (w && !w.dropped) for (let g = f - 2; g <= f + 8 && !shown; g++) shown = opacityAt(w, g) > 0.05 && w.on <= g && (w.off == null || g < w.off) && fullyShown(w, g, I.poseAt(scene.cams, g), vfov);
  if (!shown) fails.push({ rule: 2, f, to: f + 15, word: `${w?.id ?? '(not placed)'} ${m.text}`, what: `important word (${ranks[i] === 3 ? 'name or number' : 'line-end rhyme word'}) ${!w ? 'not placed' : w.dropped ? `dropped (${w.dropped})` : 'not wholly shown around its onset'}`,
    rebuild: 'keep it on screen at size (the engine no longer drops important words)' });
});

// Rule 3: one solid colour, no outlines; cream, white, flat grey 75% or 50%, or a team colour.
const palStyles = scene.meta.palette?.styles ?? [], team = teamStyleIds({ styles: palStyles });
const allowed = new Set(Object.values(TEXT_COLOURS).map(c => c.toLowerCase()));
for (const w of scene.words) {
  if (w.reveal_copy_of || w.dropped || w.on >= until) continue;
  const f = w.on;
  const st = palStyles.find(s => s.id === w.style);
  const text = (w.colours?.text ?? st?.colours?.text ?? '').toLowerCase();
  const why = [];
  if (w.colours?.stroke || w.kind === 'outline' || w.colours?.outline || st?.kind === 'outline') why.push('outlined');
  // Before brief 5 the viewer drew the grey style with a white outline whatever the scene said (Raise the Flagg rough
  // cut 2: COOPER at 4.9 s, TONIGHT at 95 s). A scene built before brief 5 has no meta.jersey_bold.
  else if (w.style === 'grey' && scene.meta.jersey_bold == null && !w.wordmark) why.push('outlined: grey drawn with a white outline by the viewer this scene was built for (before brief 5)');
  if (w.wordmark?.colours?.stroke || w.wordmark?.colours?.accent) why.push('wordmark with stroke or accent rings');
  if (!w.wordmark && !w.stripes && text && !allowed.has(text) && !team.has(w.style)) why.push(`text colour ${text} is not cream, white, flat grey or a team colour`);
  if (why.length) fails.push({ rule: 3, f, to: f + 30, word: `${w.id} ${w.text}`, what: why.join('; '), rebuild: 'draw it solid in an allowed colour' });
}

// Rule 4: player names and jersey numbers in a bold jersey font; team names as the team's wordmark.
for (const w of scene.words) {
  if (w.reveal_copy_of || w.dropped || w.on >= until) continue;
  const t = N(w.text), isNum = /^\d+$/.test(t);
  if ((players.has(t) || isNum) && !(isJerseyFont(w.font) || w.jersey))
    fails.push({ rule: 4, f: w.on, to: w.on + 30, word: `${w.id} ${w.text}`, what: `${isNum ? 'number' : 'player name'} in ${w.font}, not the jersey font`, rebuild: 'set it in the bold jersey font (needs the section re-planned: the box width changes)' });
  if (teams.has(t) && !(w.wordmark && (w.wordmark.image || w.wordmark.family)))
    fails.push({ rule: 4, f: w.on, to: w.on + 30, word: `${w.id} ${w.text}`, what: 'team name not drawn as the team wordmark (no wordmark image or font supplied)', rebuild: 'supply the wordmark image in song settings team_wordmarks; a re-join is enough' });
}

// Report by section.
fails.sort((a, b) => a.f - b.f);
const md = [`# Type rules check: ${song.title}`, '', `Scene: \`${scenePath}\``, '', `Settings: minimum ${(100 * (settings.minH ?? 0.09)).toFixed(1)}% crowded, ${(100 * (settings.minH ?? 0.09) * (settings.roomFactor ?? 1.5)).toFixed(1)}% with room. Player names: ${[...players].join(', ') || 'none given'}. Team names: ${[...teams].join(', ') || 'none given'}.`, '',
  `Failures: ${fails.length} (rule 1: ${fails.filter(x => x.rule === 1).length}, rule 2: ${fails.filter(x => x.rule === 2).length}, rule 3: ${fails.filter(x => x.rule === 3).length}, rule 4: ${fails.filter(x => x.rule === 4).length}).`, ''];
let n = 0;
for (const s of sections) {
  const fs_ = fails.filter(x => sectionOf(x.f) === s.label);
  if (!fs_.length) continue;
  md.push(`## ${s.label} (${sec(s.from)} to ${sec(s.to)}): ${fs_.length}`, '');
  for (const x of fs_) md.push(`${++n}. ${sec(x.f)} to ${sec(x.to)}, rule ${x.rule}, ${x.word}: ${x.what}. A rebuild would ${x.rebuild}.`);
  md.push('');
}
const out = opt('--out');
if (out) fs.writeFileSync(out, md.join('\n'));
console.log(JSON.stringify({ total: fails.length, byRule: [1, 2, 3, 4].map(r => fails.filter(x => x.rule === r).length), sections: sections.map(s => [s.label, fails.filter(x => sectionOf(x.f) === s.label).length]).filter(x => x[1]) }));
