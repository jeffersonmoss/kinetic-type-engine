import { songAppearance, compileStageLayers } from './song_appearance.mjs';
import { scanOverlap, repairShownAndOverlap, tamePulses, checkPropWordOverlap } from './overlap_gate.mjs';
import { frameClearOfProps, resolvePropOverlaps } from './keep_clear.mjs';
// Build a whole song with the deterministic engine (song-agnostic driver, 22 November 2026; generalised from the Room for
// One prototype's "videos/Room for One - whole song.mjs", W2 commit 4e2d2b0). See KIT.md.
//   1. An optional approved opening scene is used as is (Room for One: build #144).
//   2. Every section in "song settings.json" is built with build_best.mjs (N candidates each, the shown-whole repair,
//      the severity fallback when nothing passes).
//   3. assemble_sections.mjs joins them, hides plaques once they are out of frame, and builds one reveal at the end.
//   4. The joined scene is swept again for the shown-whole gate; then apply_notes.mjs (the song's colour rules, sung and
//      beat pulses) and run_elements.mjs (the song's picture elements, if any) run over the whole scene.
//   5. Whole-song checks, a click track of the repeats and ad-libs, and "Whole song - provenance and flags.md".
// Usage: node build_song.mjs "<song workspace>/engine input" [--out "<song workspace>/engine output/<run name>"]
//          [--N 200] [--jobs 6] [--skip-build] [--sections 4,5] [--reveal-coverage 0.2]
// Exit code 1 when a whole-song check fails (the report says which); the scene is still written.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, execFile } from 'node:child_process';
import { acquireBuildLock, trackChild, defaultSignalsForSyncWork } from './build_lock.mjs';
import { fileURLToPath } from 'node:url';
import './interp.js';
import { checkSync, checkHolds } from './whole_song_checks.mjs';
import { assemble, hideWhenGone, buildReveal, checkReveal, endOnWord, checkStillEnding } from './assemble_sections.mjs';
import { tightenLone, hideEdgeClutter, hideUnreadable, hideFlythrough, SIDE_FILL, placeInRoom, phraseGaps, repairPhraseGaps, growWordmarks, loneHolds, LONE_HOLD, swellRelease, largestGreyToCream, fillEmptyFrames, swellSmallWords, floorZoomEntrances, pairHoldHides, emptyFrames, enforceMinSize, sizeShortfalls, MUST_SHOW_FLOOR_RATIO, noOutlines, undoSizeForEmpty, hideStaticPartials, staticPartials, STATIC_RATE, STATIC_FRAMES } from './composition.mjs';
import { JERSEY_BOLD, normalizePalette, checkPalette } from './style.mjs';
import { keywordPlan, fastWordsOn, wordRanks } from './keywords.mjs';
import { applyWordRoles, teamColourNames, numeralKind, checkJerseyFonts } from './word_roles.mjs';
import { severity, worstReadingLoss, SHOWN_GATE } from './build_best.mjs';
import { repairShown, gateFailures } from './shown_gate.mjs';
import { entranceCounts } from './entrance_counts.mjs';
import { writeClickTrack } from './click_track.mjs';

const engine = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const inputDir = path.resolve(args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && args[i - 1] !== '--skip-build')) ?? '');
if (!fs.existsSync(path.join(inputDir, 'song settings.json'))) { console.error(`usage: node build_song.mjs "<song workspace>/engine input" [--out <folder>]\nno "song settings.json" in ${inputDir}`); process.exit(2); }
const inp = f => (f == null ? null : path.resolve(inputDir, f));
const song = JSON.parse(fs.readFileSync(path.join(inputDir, 'song settings.json'), 'utf8'));
const nameKey = t => String(t).toUpperCase().replace(/[’]/g, "'").replace(/^[^A-Z0-9]+|[^A-Z0-9']+$/g, '').replace(/'S$/, '');
const PLAYER_NAMES = new Set((song.player_names ?? []).map(nameKey));
const TEAM_NAMES = new Set(Object.keys(song.team_wordmarks ?? {}).map(nameKey));
const JERSEY_BOLD_SONG = song.jersey_bold ?? JERSEY_BOLD; // brief 5: outward stroke on jersey fonts, x cap
// --all-words: build with keyword mode off whatever the song settings say (for comparisons).
if (args.includes('--all-words')) song.fast_words = { ...(song.fast_words ?? {}), mode: 'all_words' };
// Brief 24: --intro-rotation <from,to[,ease] | JSON | off> overrides song.intro_rotation for a variant join (e.g. vertical).
const introRotArg = opt('--intro-rotation', null);
if (introRotArg != null) {
  if (/^(off|false|none)$/i.test(introRotArg)) {
    delete song.intro_rotation;
  } else if (introRotArg.trim().startsWith('{')) {
    song.intro_rotation = JSON.parse(introRotArg);
  } else {
    const [fromS, toS, easeS] = introRotArg.split(',');
    song.intro_rotation = { from_deg: Number(fromS), to_deg: Number(toS), ...(easeS ? { ease: easeS } : {}) };
  }
}
const OUT = path.resolve(opt('--out', path.join(inputDir, '../engine output/Whole song')));
const N = Number(opt('--N', 200));
const skipBuild = args.includes('--skip-build');
// --sections 4,5 rebuilds only those sections and re-joins the rest as built (an input change local to them).
const onlySections = opt('--sections', null)?.split(',').map(Number) ?? null;
// Least share of the last frame the reveal layout aims to cover (buildReveal). Lower it (for example 0.05) to reveal the
// whole conflict-free tail; the reveal check still asks for 20% and then reports FAIL (Room for One's accepted exception).
const REVEAL_MIN_COVERAGE = Number(opt('--reveal-coverage', 0.2));
const FPS = song.fps ?? 30;
const READ_TAIL_S = song.read_tail_s ?? 0.5;     // each section's clip runs past its last line, so its last word is judged
const REVEAL_PULL_S = song.reveal_pull_s ?? 4;   // shortest pull-back; it stretches so the still hold is at most REVEAL_HOLD_S
const REVEAL_HOLD_S = song.reveal_hold_s ?? 3;
const audio = inp(song.audio);
if (!audio || !fs.existsSync(audio)) throw Error(`song audio not found: ${audio}`);
const mapPath = inp(song.map);
const palettePath = inp(song.palette);
// One build at a time on this machine (build_lock.mjs); a second build queues until this one exits.
await acquireBuildLock(song.title ?? path.basename(path.dirname(inputDir)));

// ---- Song map with the timing corrections applied, and the section words (from the prototype's section words.mjs) ----
const rawMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
// Brief 26 (Jefferson, 27 November 2026): "When two elements are parts of a single word, they need to be shown in line as
// a single word." A contraction split by the aligner ("They" + "'re") must be merged in the map (build_song_map.py does it).
{
  const SUFFIX = /^(?:['\u2019](?:re|s|ll|ve|d|m|t)|n['\u2019]t)[.,!?;:]*$/i;
  const split = rawMap.words.map((w, i) => (i && SUFFIX.test(w.text) && w.line === rawMap.words[i - 1].line) ? `${i} ${rawMap.words[i - 1].text}+${w.text}` : null).filter(Boolean);
  if (split.length) throw Error(`song map has contractions split into two words (merge each into one word; build_song_map.py does this): ${split.join(', ')}`);
}
const CORR = song.timing_corrections ? JSON.parse(fs.readFileSync(inp(song.timing_corrections), 'utf8')) : { words: [], lines: [] };
function correctedMap(m, corr) {
  const out = structuredClone(m);
  for (const c of corr.words ?? []) {
    const w = out.words[c.index];
    if (!w || w.text !== c.text) throw Error(`timing correction ${c.index}: expected "${c.text}", map has "${w?.text}"`);
    w.start_s = c.start_s; w.end_s = c.end_s;
  }
  for (const c of corr.lines ?? []) { const l = out.lines.find(x => x.id === c.id); if (c.start_s != null) l.start_s = c.start_s; if (c.end_s != null) l.end_s = c.end_s; }
  return out;
}
const map = correctedMap(rawMap, CORR);
// Numbers sung as words are shown as digits (song settings "display_numbers", e.g. { "twenty-four": "24" }).
const NUMBERS = Object.fromEntries(Object.entries(song.display_numbers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
const display = t => t.replace(/^(\(?)([a-z]+-[a-z]+)/i, (m, p, w) => p + (NUMBERS[w.toLowerCase()] ?? w));
// Brief 20: read an existing Keyword drop review.json beside the output when present; any map index its reviewer
// rejected has the same must_show effect as word_overrides.<map index>.must_show: true.
const existingDropReview = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(OUT, 'Keyword drop review.json'), 'utf8')).reviews ?? {}; }
  catch { return {}; }
})();
const rejectedReviewIndices = Object.entries(existingDropReview).filter(([, r]) => r && r.verdict === 'reject').map(([k]) => k);
const effectiveWordOverrides = rejectedReviewIndices.length
  ? {
      ...(song.word_overrides ?? {}),
      ...Object.fromEntries(rejectedReviewIndices.map(k => [k, { ...(song.word_overrides?.[k] ?? {}), must_show: true }])),
    }
  : (song.word_overrides ?? {});
// Keyword mode for fast words (keywords.mjs; on by default, "fast_words": {"mode": "all_words"} turns it off): in
// stretches sung too fast to read, only the important words are shown. Only words of built sections are dropped (an
// approved opening scene is used as is). Dropped words are left out of the scene, the sync check and the pulses.
const palettePins = Object.keys(JSON.parse(fs.readFileSync(palettePath, 'utf8')).pins ?? {});
const builtLines = new Set(song.sections.flatMap(sec => map.lines.filter(l => l.id >= sec.lines[0] && l.id <= sec.lines[1]).map(l => l.id)));
const keywords = keywordPlan(map.words, song.fast_words ?? {}, { names: [...Object.keys(song.team_wordmarks ?? {}), ...Object.values(song.display_numbers ?? {}), ...palettePins, ...(song.player_names ?? [])], overrides: effectiveWordOverrides });
for (const i of [...keywords.dropped]) if (!builtLines.has(map.words[i].line)) keywords.dropped.delete(i);
keywords.log = keywords.log.filter(x => keywords.dropped.has(x.i));
function sectionWords(sec) {
  const lines = map.lines.filter(l => l.id >= sec.lines[0] && l.id <= sec.lines[1]);
  if (!lines.length) throw Error(`section ${sec.n} "${sec.name}": no map lines ${sec.lines[0]} to ${sec.lines[1]}`);
  const words = [];
  const outLines = lines.map(l => ({ id: l.id, text: l.text, words: [] }));
  for (const l of lines) for (const gi of l.words) {
    if (keywords.dropped.has(gi)) continue;
    const w = map.words[gi];
    outLines.find(x => x.id === l.id).words.push(words.length);
    // Brief 21: jersey font is reserved exclusively for player names and jersey numbers; scores keep bulb digits and
    // ad-lib / accent words take the non-jersey accent face.
    const ov = effectiveWordOverrides[String(gi)] ?? {};
    const dispText = display(w.text);
    const key = nameKey(w.text);
    const isPlayer = !TEAM_NAMES.has(key) && (ov.name === true || (ov.name !== false && PLAYER_NAMES.has(key)));
    let isJerseyNum = false, isScoreNum = false;
    if (/\d/.test(dispText) && !ov.display) {
      const k = ov.numeral ?? (ov.score === true ? 'score' : ov.score === false ? 'jersey' : null);
      const kind = k ?? numeralKind(map.words, gi, { players: song.player_names ?? [] }).kind;
      if (kind === 'jersey') isJerseyNum = true;
      else isScoreNum = true;
    }
    const jerseyWord = isPlayer || isJerseyNum;
    words.push({
      t: w.start_s, end: w.end_s, text: dispText, line: l.id, id: `w${String(words.length + 1).padStart(2, '0')}`,
      ...(jerseyWord ? { jerseyWord: true } : {}),
      ...(isScoreNum ? { scoreWord: true } : {}),
    });
  }
  return { section: sec.n, name: sec.name, start_s: lines[0].start_s, song_end_of_hook: lines.at(-1).end_s, lines: outLines, words };
}

// Brief 16 item 4: optional song setting `end_s` trims the timeline cleanly in the scene (meta.frames, ending, reveal,
// sung events, beats and every gate all operate inside it).
const SONG_END = song.end_s != null ? Math.min(song.end_s, map.duration_s) : map.duration_s;
fs.mkdirSync(path.join(OUT, 'sections'), { recursive: true });
// Map audit: words held over 3 s in the map are listed loudly before planning (a long held word can hide a gap).
const mapAudit = map.words.filter(w => w.end_s - w.start_s > 3).map(w => `map word "${w.text}" at ${w.start_s.toFixed(2)} s lasts ${(w.end_s - w.start_s).toFixed(1)} s (over 3 s)`);
for (const m of mapAudit) console.warn('MAP AUDIT:', m);
const rows = [], flagged = [], parts = [];
const opening = song.opening ? { ...song.opening, wordsT: new Map(JSON.parse(fs.readFileSync(inp(song.opening.words), 'utf8')).words.map(w => [w.id, w.t])) } : null;
if (opening) {
  parts.push({ number: 1, label: opening.label, scene: JSON.parse(fs.readFileSync(inp(opening.scene), 'utf8')), startFrame: 0 });
  rows.push({ label: opening.label, built: 'approved, not rebuilt', survivors: '-', chosen: opening.chosen ?? 'given', severity: 0, failures: {}, flags: 0 });
}
// Section builds run as a pool of child processes (--jobs, default 6; --jobs 1 is serial). Each build_best reads
// only its own words file and window and writes only its own folder, so the order they finish in cannot change the
// result; they are joined in section order below exactly as before.
const JOBS = Math.max(1, Number(opt('--jobs', 6)));
// Brief 18: if the song has keep-clear props, write lightweight stage geometry for section builds so layout and camera
// planning can target the clear band's aspect ratio and keep focused words clear. No-props songs skip this completely.
let sectionStageFile = null;
if (song.props?.length) {
  const stageShell = { meta: { fps: FPS, frames: Math.round(SONG_END * FPS) } };
  compileStageLayers(stageShell, song, inp, { embedImages: false });
  if (globalThis.KT_INTERP.hasKeepClearProps?.(stageShell)) {
    sectionStageFile = path.join(OUT, 'sections', 'stage-keep-clear.json');
    fs.writeFileSync(sectionStageFile, JSON.stringify({ backdrops: stageShell.backdrops ?? [], props: stageShell.props ?? [] }));
  }
}
const jobs = song.sections.map((sec, k) => {
  const w = sectionWords(sec);
  const label = `Section ${sec.n} - ${sec.name}`;
  const dir = path.join(OUT, label);
  const wordsFile = path.join(OUT, 'sections', `${label} - words.json`);
  fs.writeFileSync(wordsFile, JSON.stringify(w, null, 1));
  const isFirst = !opening && k === 0, isLast = k === song.sections.length - 1;
  const clipEnd = isLast ? SONG_END : w.song_end_of_hook + READ_TAIL_S;
  const build = !skipBuild && (!onlySections || onlySections.includes(sec.n));
  const argv = ['build_best.mjs', '--words', wordsFile, '--window', `${isFirst ? 0 : w.start_s},${w.song_end_of_hook},${clipEnd}`, '--N', String(N), '--out', dir, '--map', mapPath, '--palette', palettePath, '--title', song.title, ...(sectionStageFile ? ['--stage', sectionStageFile] : [])];
  return { sec, w, label, dir, isFirst, build, argv, seconds: 0, out: '' };
});
{
  const queue = jobs.filter(j => j.build), errors = [];
  const runOne = j => new Promise(resolve => {
    const t0 = Date.now();
    trackChild(execFile('node', j.argv, { cwd: engine, encoding: 'utf8', maxBuffer: 1 << 26, env: { ...process.env, KTE_JERSEY_BOLD: String(JERSEY_BOLD_SONG), ...(song.jersey_font ? { KTE_JERSEY_FONT: String(song.jersey_font) } : {}) } }, (err, stdout, stderr) => {
      j.seconds = (Date.now() - t0) / 1000; j.out = stdout ?? '';
      if (err) errors.push(`${j.label}: ${err.message}\n${stderr ?? ''}`);
      else console.log(`${j.label}: built in ${j.seconds.toFixed(1)} s`);
      resolve();
    }));
  });
  const tPool = Date.now();
  await Promise.all(Array.from({ length: Math.min(JOBS, queue.length) }, async () => { while (queue.length && !errors.length) await runOne(queue.shift()); }));
  defaultSignalsForSyncWork();
  if (errors.length) { console.error(`SECTION BUILD FAILED:\n${errors.join('\n')}`); process.exit(1); }
  if (jobs.some(j => j.build)) console.log(`section builds: ${jobs.filter(j => j.build).length} in ${((Date.now() - tPool) / 1000).toFixed(1)} s with ${JOBS} at a time`);
}
for (const { sec, w, label, dir, isFirst, out, seconds } of jobs) {
  if (out) process.stdout.write(out.split('\n').filter(l => l.includes('survivors=')).join('\n') + '\n');
  const scene = JSON.parse(fs.readFileSync(path.join(dir, 'scene.json'), 'utf8'));
  const log = JSON.parse(fs.readFileSync(path.join(dir, 'build log.json'), 'utf8'));
  const fails = Object.fromEntries(Object.entries(log.checkFailures ?? {}).map(([k, v]) => [k, v]));
  rows.push({ checkFrequency: log.checkFrequency, label, built: N, survivors: log.survivorsOfN, chosen: `#${log.buildIndex}${log.passed ? '' : ' (severity fallback)'}`, severity: severity(log), pops: log.pops, worst: worstReadingLoss(log), gate: (log.checkFailures?.[SHOWN_GATE] ?? []).length, shownRepair: log.shownRepair, failures: fails, flags: (log.rulingFlags ?? []).length, seconds: seconds.toFixed(1) });
  for (const [k, v] of Object.entries(fails)) for (const m of v) flagged.push(`${label}: ${k}: ${m}`);
  parts.push({ number: sec.n, label, scene, startFrame: isFirst ? 0 : Math.round(w.start_s * FPS), ...(sec.seam ? { seam: sec.seam } : {}) });
}

const frames = Math.round(SONG_END * FPS);
const { scene, seams, partReveal } = assemble(parts, { fps: FPS, frames, end: SONG_END, gapFrac: song.seam_gap ?? 0.3 });
// Refresh the joined scene's palette and style-derived word colours from the current palette.json so --skip-build
// picks up palette colour passes without rebuilding sections (brief 14).
{
  const freshPalette = JSON.parse(fs.readFileSync(palettePath, 'utf8'));
  normalizePalette(freshPalette);
  checkPalette(freshPalette);
  scene.meta.palette = { ground: freshPalette.ground, panel: freshPalette.panel, panel_side: freshPalette.panel_side, styles: freshPalette.styles };
  const styleById = new Map(freshPalette.styles.map(s => [s.id, s]));
  const plaqueById = new Map(scene.plaques.map(p => [p.id, p]));
  for (const w of scene.words) {
    const st = styleById.get(w.style);
    if (!st) continue;
    const surface = plaqueById.get(w.plaque)?.surface;
    const cols = { ...st.colours };
    if (surface === 'panel' && st.on_panel) cols.text = st.on_panel;
    if (st.kind === 'outline') cols.stroke = cols.text;
    if (st.edge) cols.outline = st.edge;
    w.colours = cols;
  }
}
// Reveal timing: the last section's own reveal frame (on its beat); viewing direction from that key's end pose.
// Ending (engine fix brief 3, item 1): song settings "ending" {reveal: false, hold: "<word>" | "last"} ends on that word
// held still to the last frame; otherwise the reveal pulls back, starting early enough to land and hold still for at
// least ending.min_hold_s (0.5 s) before the end. The song never ends mid-move (checkStillEnding).
const REVEAL_ON = song.ending?.reveal ?? true;
const MIN_END_HOLD = Math.round((song.ending?.min_hold_s ?? 0.5) * FPS), MIN_PULL = FPS;
const plannedRevealF0 = partReveal?.f0 ?? Math.max(...scene.words.map(w => w.on)) + 30;
const revealF0 = REVEAL_ON ? Math.min(plannedRevealF0, frames - MIN_END_HOLD - MIN_PULL) : frames;
const hideLog = hideWhenGone(scene, { until: revealF0 });
const reveal = REVEAL_ON
  ? buildReveal(scene, { f0: revealF0, pullFrames: REVEAL_PULL_S * FPS, endFrame: frames, maxHoldFrames: REVEAL_HOLD_S * FPS, minHoldFrames: MIN_END_HOLD, minCoverage: REVEAL_MIN_COVERAGE })
  : { off: true, ...endOnWord(scene, { hold: song.ending?.hold ?? 'last', endFrame: frames, fps: FPS, minHoldFrames: MIN_END_HOLD }) };
// The focused word is shown whole (Jefferson, rough cut 4): sections were repaired one by one in build_best; the joined
// scene is swept again (the opening and the seams were never repaired) before any post-pass. The opening's words take
// their sung times from its words file.
if (opening) for (const w of scene.words) if (w.t == null && opening.wordsT.has(w.id)) w.t = opening.wordsT.get(w.id);
const onsetOf = w => (w.t != null ? Math.round(w.t * FPS) : null);
const shownSweep = repairShown(scene, onsetOf, { until: revealF0 });
scene.meta.clip = 'Whole song';
scene.meta.frames = frames;
scene.meta.whole_song = { seams, reveal, hidden: hideLog.length, revealF0 };
scene.meta.audio = audio; // capture.mjs muxes this file
scene.meta.song_title = song.title;
const raw = path.join(OUT, 'Whole song - scene.json');
fs.writeFileSync(raw, JSON.stringify(scene));

const notes = path.join(OUT, 'Whole song - notes - scene.json');
const finalScene = path.join(OUT, 'Whole song - final - scene.json');
// Sung events for the re-sung word pulses: every word in the lyric map plus the repeats and ad-libs it lacks.
const NUMBER_WORDS = Object.fromEntries(Object.entries(NUMBERS).map(([k, v]) => [k.toUpperCase().replace(/[^A-Z0-9']/g, ''), v]));
const repeatsFile = song.sung_repeats ? JSON.parse(fs.readFileSync(inp(song.sung_repeats), 'utf8')) : { events: [] };
const sung = [
  ...map.words.filter((w, i) => !keywords.dropped.has(i) && w.start_s <= SONG_END).map(w => ({ text: (t => NUMBER_WORDS[t] ?? t)(String(w.text).toUpperCase().replace(/[^A-Z0-9']/g, '')), t: w.start_s, line: w.line, source: 'lyric map' })),
  ...repeatsFile.events.filter(e => e.t <= SONG_END),
];
const repeatEvents = sung.filter(e => e.source !== 'lyric map');
const clickPath = path.join(OUT, 'Whole song - repeats and ad-libs click track.m4a');
const clicks = repeatEvents.length ? writeClickTrack({ events: repeatEvents, songPath: audio, outPath: clickPath, stemPath: inp(song.vocal_stem) ?? undefined }) : [];
const sungPath = path.join(OUT, 'Whole song - sung words.json');
fs.writeFileSync(sungPath, JSON.stringify({ events: sung, beats: (map.beats ?? []).filter(b => b <= SONG_END) }, null, 1));
execFileSync('node', ['apply_notes.mjs', raw, notes, sungPath, ...(song.song_notes ? ['--song-notes', inp(song.song_notes)] : [])], { cwd: engine, encoding: 'utf8' });
let el = 'No picture elements (song settings has no "picture_elements").';
// The join works on its own file; the final scene name is written only when every gate passes (brief 7 item 10).
const workScene = path.join(OUT, 'Whole song - join in progress - scene.json');
const failedScene = path.join(OUT, 'Whole song - FAILED GATES - not for render - scene.json');
if (song.picture_elements) el = execFileSync('node', ['run_elements.mjs', inp(song.picture_elements), notes, workScene], { cwd: engine, encoding: 'utf8' });
else fs.copyFileSync(notes, workScene);
const finalObj = JSON.parse(fs.readFileSync(workScene, 'utf8'));
fs.rmSync(workScene, { force: true });
// Brief 18: when the song has backdrops/props, compile stage layers before the whole-song framing/composition passes
// so camera framing, shown-whole repair, size growth, wordmark growth, static-partial slides and room placement all
// respect active keep-clear zones. Songs without backdrops or props skip this completely (byte-identical).
const stageEarly = (song.backdrops?.length || song.props?.length)
  ? compileStageLayers(finalObj, song, inp, { embedImages: true })
  : null;
const keepClearFrame = globalThis.KT_INTERP.hasKeepClearProps?.(finalObj)
  ? frameClearOfProps(finalObj, onsetOf, {
    until: revealF0,
    settings: {
      ...(song.min_word_h != null ? { minH: song.min_word_h } : {}),
      ...(song.room_factor != null ? { roomFactor: song.room_factor } : {}),
      ...(song.crowded_words != null ? { crowdedWords: song.crowded_words } : {}),
      ...(song.crowded_area != null ? { crowdedArea: song.crowded_area } : {}),
    },
    minEndHold: MIN_END_HOLD,
  })
  : { log: [], holdsReframed: 0, holdsSplit: 0 };
// The final joined scene is repaired for both rules together (shown whole and projected overlap), alternating until
// neither repair changes anything; the checks below then judge the scene exactly as it is written.
let joint = repairShownAndOverlap(finalObj, onsetOf, { until: revealF0, retireOccluded: true });
// Composition (engine fix brief 3, items 17 and 18): lone focus words come closer (each change kept only when the gates
// are no worse), the two repairs settle again, then edge clutter is hidden hold by hold.
const lone = tightenLone(finalObj, onsetOf, { until: revealF0 });
if (lone.log.length) {
  const again = repairShownAndOverlap(finalObj, onsetOf, { until: revealF0, retireOccluded: true });
  joint = { ...again, shownLog: [...joint.shownLog, ...again.shownLog], overlapLog: [...joint.overlapLog, ...again.overlapLog] };
}
const clutter = hideEdgeClutter(finalObj, onsetOf, { until: revealF0 });
// Brief 4: text upside down, mirrored or seen from behind is hidden outside its focus window.
const unreadable = hideUnreadable(finalObj, onsetOf, { until: revealF0 });
// Size runs after the clutter and unreadable hides (they thin the frames it judges as crowded or not), and those two run
// again after it, since a grown word may now be cut by an edge in a later hold.
// Size (engine fix brief 5, Type rules 1 and 2): every word big enough to be seen or not shown; song settings min_word_h
// (letters as a share of the frame height, default 0.09, change 5: the larger HE at 40.6 s in rough cut 5), room_factor (1.5),
// crowded_words (3) and crowded_area (0.30).
// Type rule 2: importance by keyword mode's ranking (names, numbers and player names 3, line-end rhyme word 2, rest 1).
const keyNames = [...Object.keys(song.team_wordmarks ?? {}), ...Object.values(song.display_numbers ?? {}), ...palettePins, ...(song.player_names ?? [])];
const ranks = wordRanks(map.words, song.fast_words ?? {}, { names: keyNames });
// Brief 7: one keyword classifier (word_roles.mjs) for the grey rule and the drop rule. Names, numbers and scores are
// `important` (never dropped; kept small when they cannot grow); other keywords are dropped only by necessity.
// Brief 20: pass existingDropReview so rejected drops get must_show and approved drops get drop_approved.
const roles = applyWordRoles(finalObj, { mapWords: map.words, display, song, names: keyNames, metricsPath: process.env.KTE_METRICS ?? path.join(engine, '../fonts/room-for-one-variety.metrics.json'), dropReview: existingDropReview });
for (const w of finalObj.words) {
  if (w.t == null || w.reveal_copy_of || w.map_index == null) continue;
  if (ranks[w.map_index] >= 3 || w.score) w.important = true;
}
// Brief 10 items 46 and 47: player names and jersey numbers in team colours (song setting jersey_colours).
const teamNames = teamColourNames(finalObj, { song, palette: finalObj.meta.palette ?? JSON.parse(fs.readFileSync(palettePath, 'utf8')), metricsPath: process.env.KTE_METRICS ?? path.join(engine, '../fonts/room-for-one-variety.metrics.json'), until: revealF0, onsetOf });
// Repeated until it settles (at most 4 passes): a drop thins the frame, which can make its neighbours' frames uncrowded and
// raise their minimum to room_factor x min_word_h.
// The empty-screen rule counts a frame whose words are all under the size minimum as empty (brief 7 item 3).
finalObj.meta.size_rule = { ...(song.min_word_h != null ? { minH: song.min_word_h } : {}), ...(song.room_factor != null ? { roomFactor: song.room_factor } : {}),
  ...(song.crowded_words != null ? { crowdedWords: song.crowded_words } : {}), ...(song.crowded_area != null ? { crowdedArea: song.crowded_area } : {}) };
const size = { log: [], mustShowLog: [], counts: { grown: 0, dropped: 0, hidden: 0, keptSmall: 0, importantSmall: 0 }, passes: 0 };
for (let pass = 0; pass < 4; pass++) {
  const r = enforceMinSize(finalObj, onsetOf, { until: revealF0, minEndHold: MIN_END_HOLD, settings: {
  ...(song.min_word_h != null ? { minH: song.min_word_h } : {}), ...(song.room_factor != null ? { roomFactor: song.room_factor } : {}),
  ...(song.crowded_words != null ? { crowdedWords: song.crowded_words } : {}), ...(song.crowded_area != null ? { crowdedArea: song.crowded_area } : {}) } });
  size.settings = r.settings; size.passes++;
  size.log.push(...r.log.map(x => pass ? `(pass ${pass + 1}) ${x}` : x));
  size.mustShowLog.push(...(r.mustShowLog ?? []).map(x => pass ? `(pass ${pass + 1}) ${x}` : x));
  for (const k of Object.keys(size.counts)) size.counts[k] += r.counts[k] ?? 0;
  if (!r.counts.grown && !r.counts.dropped && !r.counts.hidden && !r.counts.mustShowChanged) break;
}
{ const c2 = hideEdgeClutter(finalObj, onsetOf, { until: revealF0 }), u2 = hideUnreadable(finalObj, onsetOf, { until: revealF0 });
  clutter.log.push(...c2.log.map(x => `(after size) ${x}`)); unreadable.log.push(...u2.log.map(x => `(after size) ${x}`)); }
// Brief 8 item 56: a word the camera flies through is hidden on those frames.
const flythrough = hideFlythrough(finalObj, onsetOf, { until: revealF0, maxFrames: Math.floor((song.empty_gap_max_s ?? 0.25) * FPS + 1e-9) });
// No outlines (brief 5, change 2): every word solid. Runs again after the song appearance pass, which adds the wordmarks.
const palStyles = finalObj.meta.palette?.styles ?? [];
const flatOf = id => palStyles.find(x => x.outline_twin === id)?.id ?? null;
const outlines = noOutlines(finalObj, { flatOf });
finalObj.meta.jersey_bold = JERSEY_BOLD_SONG;
const stillEnding = checkStillEnding(finalObj, { minHoldFrames: MIN_END_HOLD });
if (!stillEnding.pass) process.exitCode = 1;
const overlapRepair = { retired: joint.overlapLog };

// Song fonts (23 November 2026): song setting custom_fonts { "<font key>": { "family": "...", "file": "<path in engine
// input>" } } ships a font file with the song (for example the Timberwolves classic pointy jersey font as jersey_font).
// The key must be measured into the kit metrics file (tools/measure-fonts) so layout and render agree.
{ const MIME = { '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2' };
  const cf = {};
  for (const [key, f] of Object.entries(song.custom_fonts ?? {})) {
    const file = inp(f.file), type = MIME[path.extname(file).toLowerCase()];
    if (!type) throw Error(`custom_fonts.${key}: unsupported font file ${file}`);
    cf[key] = { family: f.family, src: `data:${type};base64,${fs.readFileSync(file).toString('base64')}` };
  }
  if (Object.keys(cf).length) finalObj.customFonts = cf; }
const appearance = songAppearance(finalObj, song, inp, Math.min(...map.words.map(w => w.start_s)), { stageCompiled: stageEarly });
if (!appearance.pass) process.exitCode = 1;
outlines.log.push(...noOutlines(finalObj, { flatOf }).log);
// Brief 8 item 55: image wordmarks are sized by their letters (set by the song appearance pass), grown if small.
// Brief 12: wordmarks cut to even margins grow back toward their earlier size (or the song's median wordmark).
const wordmarkGrowth = growWordmarks(finalObj, onsetOf, { until: revealF0 });
{ const r = enforceMinSize(finalObj, onsetOf, { until: revealF0, settings: finalObj.meta.size_rule ?? {}, wordmarks: true });
  size.log.push(...r.log.map(x => `(wordmarks) ${x}`)); size.counts.grown += r.counts.grown; size.counts.keptSmall += r.counts.keptSmall; size.wordmarks = r.log; }
// Brief 7 item 4: zoom entrances start at no less than half the size minimum.
const zoomFloor = floorZoomEntrances(finalObj, { until: frames, settings: finalObj.meta.size_rule ?? {} });
// After the song appearance pass, which adds the intro overlays (badge, title card) that count as on screen.
// Something on screen (Jefferson, 22 November 2026): no empty stretch longer than song setting empty_gap_max_s (default
// 0.25 s: 7 frames at 30 fps, so 8 or more empty frames in a row fail), and the first and last frames are never empty.
const EMPTY_MAX_S = song.empty_gap_max_s ?? 0.25, emptyMaxF = Math.floor(EMPTY_MAX_S * FPS + 1e-9);
// The empty-screen rule outranks the size rule: the fills are tried on a copy first, and any size drop or hide inside a
// stretch the fills cannot clear is undone on the real scene before the real fills (so no fill is built around a word
// that then comes back).
// No word static and partly on screen (brief 6 item 5): such fragments are hidden for their whole partly-on-screen span
// before the fills, and again after them (a fill may keep one on).
const staticHide = hideStaticPartials(finalObj, onsetOf, { until: frames });
// Brief 10 item 37 & brief 16 item 3: any dropped word (keyword or non-keyword) goes back where there is room. It runs
// after the static-partial hides, so a word put back never takes the spot a static partial's slide needed.
const roomLog = placeInRoom(finalObj, onsetOf, { until: revealF0, settings: finalObj.meta.size_rule ?? {} });
{ const c3 = hideEdgeClutter(finalObj, onsetOf, { until: revealF0 }), u3 = hideUnreadable(finalObj, onsetOf, { until: revealF0 });
  clutter.log.push(...c3.log.map(x => `(after room) ${x}`)); unreadable.log.push(...u3.log.map(x => `(after room) ${x}`)); }
const sizeUndone = [];
for (let round = 0; round < 12; round++) {
  const trial = JSON.parse(JSON.stringify(finalObj));
  const left = fillEmptyFrames(trial, { from: 0, until: frames, onsetOf, maxFrames: emptyMaxF }).remaining;
  const undone = undoSizeForEmpty(finalObj, left);
  sizeUndone.push(...undone);
  if (!undone.length) break;
}
const fill = fillEmptyFrames(finalObj, { from: 0, until: frames, onsetOf, maxFrames: emptyMaxF });
if (fill.remaining.length) { // brief 7 item 3: stretches holding only undersized words are swelled to the minimum
  const sw = swellSmallWords(finalObj, { from: 0, until: frames, onsetOf, maxFrames: emptyMaxF });
  fill.log.push(...sw.log.map(x => `swell: ${x}`)); fill.remaining = sw.remaining; fill.short = sw.short;
}
// Brief 8 item 51: a big swell does not drop straight back to a speck.
const swellReleases = swellRelease(finalObj, onsetOf, { until: frames, maxFrames: emptyMaxF });
// Brief 16b: close phrase gaps in later views before pairHoldHides (so sibling words that fit together at crowded size
// are unhidden before pairHoldHides hides their neighbour) and again after pairHoldHides (to close any gap a partner
// hide left behind).
const gapRepairs = repairPhraseGaps(finalObj, onsetOf, { until: revealF0, settings: finalObj.meta.size_rule ?? {}, maxFrames: emptyMaxF });
const partnerHides = pairHoldHides(finalObj, onsetOf, { until: frames, maxFrames: emptyMaxF });
const gapRepairs2 = repairPhraseGaps(finalObj, onsetOf, { until: revealF0, settings: finalObj.meta.size_rule ?? {}, maxFrames: emptyMaxF });
gapRepairs.log.push(...gapRepairs2.log);
if (partnerHides.length || gapRepairs.log.length) { const all = emptyFrames(finalObj, { from: 0, until: frames }); fill.remaining = all.filter(r => r.end - r.start + 1 > emptyMaxF); fill.short = all.filter(r => r.end - r.start + 1 <= emptyMaxF); }
for (const w of finalObj.words) { delete w.size_restore; delete w.size_hides; delete w.size_kept_holds; }
// Brief 10 item 9: the fills may change the camera (a held or skipped move), so fly-through is judged again on the final
// camera; the report then marks any earlier hide a fill undid.
{ const late = hideFlythrough(finalObj, onsetOf, { until: revealF0, maxFrames: emptyMaxF });
  flythrough.log.push(...late.log.map(x => `(after the fills) ${x}`)); flythrough.visible += late.visible; flythrough.focused = [...new Set([...flythrough.focused, ...late.focused])];
  if (late.log.some(x => / hidden \d/.test(x))) { const all = emptyFrames(finalObj, { from: 0, until: frames }); fill.remaining = all.filter(r => r.end - r.start + 1 > emptyMaxF); fill.short = all.filter(r => r.end - r.start + 1 <= emptyMaxF); } }
{ const again = hideStaticPartials(finalObj, onsetOf, { until: frames });
  staticHide.log.push(...again.log.map(x => `(after the fills) ${x}`)); staticHide.focused = [...new Set([...staticHide.focused, ...again.focused])];
  if (again.log.length) fill.remaining = emptyFrames(finalObj, { from: 0, until: frames }).filter(r => r.end - r.start + 1 > emptyMaxF); }
// Brief 18: final targeted pass to clear any remaining focus-window overlap against keep-clear props (camera move
// transitions, entrance sweeps, pulses/stamps, or post-fill words), preferring framing over scaling down.
const keepClearResolve = globalThis.KT_INTERP.hasKeepClearProps?.(finalObj)
  ? resolvePropOverlaps(finalObj, onsetOf, { until: frames, settings: finalObj.meta.size_rule ?? {}, minEndHold: MIN_END_HOLD })
  : { log: [], belowMin: [], unresolved: [] };
// If keepClearResolve moved a camera key or word and opened room for a previously dropped word, put it back before the
// room gate runs (placeInRoom already enforces prop keep-clear margin).
if (keepClearResolve.log.length) {
  const roomAfter = placeInRoom(finalObj, onsetOf, { until: revealF0, settings: finalObj.meta.size_rule ?? {} });
  roomLog.push(...roomAfter);
  if (roomAfter.some(r => r.room)) {
    const c4 = hideEdgeClutter(finalObj, onsetOf, { until: revealF0 }), u4 = hideUnreadable(finalObj, onsetOf, { until: revealF0 });
    clutter.log.push(...c4.log.map(x => `(after keep-clear room) ${x}`)); unreadable.log.push(...u4.log.map(x => `(after keep-clear room) ${x}`));
    const g4 = repairPhraseGaps(finalObj, onsetOf, { until: revealF0, settings: finalObj.meta.size_rule ?? {}, maxFrames: emptyMaxF });
    gapRepairs.log.push(...g4.log.map(x => `(after keep-clear room) ${x}`));
  }
}
// Brief 8 item 54: the largest word on screen is never grey.
const greyLargest = largestGreyToCream(finalObj, { until: revealF0 });
// Brief 8 item 49: a single word holding alone over a second, with the drops sung inside that stretch (reported).
const lone1 = loneHolds(finalObj, { until: revealF0, onsetOf });
// Brief 9 item 27: stretches over the empty limit whose only word is a sideways one under 1.5 x the minimum (reported).
const nearEmpty = emptyFrames(finalObj, { from: 0, until: revealF0, sideFill: SIDE_FILL }).filter(r => r.end - r.start + 1 > Math.floor((song.empty_gap_max_s ?? 0.25) * FPS + 1e-9));
// Room gate (brief 10 item 37, brief 16 item 3, brief 16b): no dropped word may stay dropped while there is room for it,
// and no later view of a phrase may show words on both sides of a gap when there is room for the missing words (or a
// non-focused side can be hidden to close the gap).
const roomLeft = (() => { const copy = JSON.parse(JSON.stringify(finalObj)); return placeInRoom(copy, onsetOf, { until: revealF0, settings: finalObj.meta.size_rule ?? {} }).filter(r => r.room); })();
const gapsLeft = phraseGaps(finalObj, onsetOf, { until: revealF0, settings: finalObj.meta.size_rule ?? {}, maxFrames: emptyMaxF }).filter(g => g.canShowAll || g.hideSide);
// Brief 20: evaluate final status of every must-show word for provenance and verify none were dropped.
const mustShowWords = finalObj.words.filter(w => w.must_show && !w.reveal_copy_of && !w.echo);
const mustShowDropped = mustShowWords.filter(w => w.dropped);
const mustShowReport = (() => {
  if (!mustShowWords.length) return [];
  const sf = sizeShortfalls(finalObj, onsetOf, { until: revealF0, settings: finalObj.meta.size_rule ?? {} });
  return mustShowWords.map(w => {
    const ownSf = sf.filter(x => x.w === w && x.focused);
    const worst = ownSf.sort((a, b) => a.size / a.min - b.size / b.min)[0];
    const source = w.must_show_source ?? 'must_show';
    const action = w.must_show_action ?? (w.dropped ? `DROPPED (${w.dropped})` : 'already met minimum size');
    let status;
    if (w.dropped) status = `DROPPED (${w.dropped}) — FAIL`;
    else if (!worst) status = 'shown at/above full minimum';
    else {
      const floor = Math.max(0.04, worst.min * MUST_SHOW_FLOOR_RATIO);
      const pct = (100 * worst.size).toFixed(1), minPct = (100 * worst.min).toFixed(1), flPct = (100 * floor).toFixed(1);
      status = worst.size >= floor - 1e-9
        ? `shown below minimum, above ${Math.round(100 * MUST_SHOW_FLOOR_RATIO)}% readable hard floor (letters ${pct}% vs min ${minPct}%, floor ${flPct}%)`
        : `shown BELOW ${Math.round(100 * MUST_SHOW_FLOOR_RATIO)}% readable hard floor (letters ${pct}% vs min ${minPct}%, floor ${flPct}%)`;
    }
    return { id: w.id, text: w.text, map_index: w.map_index, time_s: +(w.t ?? 0).toFixed(2), source, status, action };
  });
})();
for (const w of finalObj.words) { delete w.dropped_for; delete w.drop_approved; delete w.must_show_source; delete w.must_show_action; }
if (mustShowDropped.length) { process.exitCode = 1; console.error(`MUST-SHOW WORD DROPPED FAIL: ${mustShowDropped.map(w => `${w.id} ${w.text} (map ${w.map_index}, ${w.dropped})`).join(', ')}`); }
if (roomLeft.length) { process.exitCode = 1; console.error(`ROOM FOR A DROPPED WORD FAIL: ${roomLeft.map(r => `${r.w.id} ${r.w.text}`).join(', ')}`); }
if (gapsLeft.length) { process.exitCode = 1; console.error(`ROOM FOR A PHRASE GAP FAIL: ${gapsLeft.map(g => `${g.left.id} ${g.left.text} .. [${g.fitting.map(w => `${w.id} ${w.text}`).join(', ')}] .. ${g.right.id} ${g.right.text} (${g.h.start}-${g.h.end})`).join('; ')}`); }
// Drop review gate (brief 10 item 44): every keyword still dropped after the room gate is listed beside the final scene
// with its recorded reason and a frame to still. A reviewer (an Opus agent, run by the supervisor) approves or rejects
// each in "Keyword drop review.json" ({ reviews: { "<map index>": { verdict: "approve" | "reject", reviewer, note } } });
// a rejected drop, or a drop with no review entry, fails the join. Run the join once for the list, then again with the
// review in place.
const dropReasons = [...size.log, ...staticHide.log.map(String)];
const dropsForReview = finalObj.words.filter(w => w.keyword && w.dropped && !w.reveal_copy_of && !w.echo).map(w => ({
  word: w.text, id: w.id, index: w.map_index ?? null, time_s: +(w.t ?? 0).toFixed(2), frame_to_still: onsetOf(w), dropped: w.dropped,
  reason: dropReasons.filter(x => x.includes(`${w.id} ${w.text}`)).at(-1) ?? `dropped (${w.dropped})` }));
fs.writeFileSync(path.join(OUT, 'Keyword drops for review.json'), JSON.stringify({ about: 'Keywords still dropped by necessity after the room gate (brief 10 item 44). Review each in "Keyword drop review.json" beside this file: { "reviews": { "<map index>": { "verdict": "approve" | "reject", "reviewer": "...", "note": "..." } } }, then re-join with --skip-build.', drops: dropsForReview }, null, 1));
const dropReview = (() => { try { return JSON.parse(fs.readFileSync(path.join(OUT, 'Keyword drop review.json'), 'utf8')).reviews ?? {}; } catch { return {}; } })();
const dropFails = dropsForReview.map(d => ({ d, r: dropReview[String(d.index)] })).filter(({ r }) => !r || r.verdict !== 'approve');
if (dropFails.length) { process.exitCode = 1; console.error(`KEYWORD DROP REVIEW FAIL: ${dropFails.map(({ d, r }) => `${d.id} ${d.word} (${r ? `rejected by ${r.reviewer ?? 'reviewer'}` : 'not reviewed'})`).join(', ')}`); }
const staticFinal = staticPartials(finalObj, { until: frames });
if (staticFinal.length) { process.exitCode = 1; console.error(`STATIC PARTLY ON SCREEN FAIL: ${staticFinal.map(x => `${x.w.id} ${x.w.text} ${x.start}-${x.end}`).join(', ')}`); }
const emptyEnds = [0, frames - 1].filter(f => emptyFrames(finalObj, { from: f, until: f + 1 }).length);
if (emptyEnds.length) { process.exitCode = 1; console.error(`EMPTY ${emptyEnds.map(f => f ? 'LAST' : 'FIRST').join(' AND ')} FRAME FAIL (not waivable)`); }
// No section pick, fallback or song setting waives this (Jefferson, 22 November 2026: dead screen is the kiss of death).
if (fill.remaining.length) { process.exitCode = 1; console.error(`EMPTY STRETCH OVER ${EMPTY_MAX_S} s FAIL (not waivable): ${fill.remaining.map(r => `${r.start}-${r.end}`).join(', ')}`); }
// The overlap gate judges the scene as written, after the size, outline and fill passes (brief 5).
// Sung pulses are checked at their peak (brief 7 item 7); one that would overlap is lowered or dropped.
const pulseLog = tamePulses(finalObj, { until: revealF0, onsetOf });
const overlapFinal = { overlaps: scanOverlap(finalObj, { until: revealF0 }).overlaps };
if (overlapFinal.overlaps.length) process.exitCode = 1;
// Brief 17 item 10 & brief 18: a keep-clear prop must never cover any part of a sung word during its focus window.
const propOverlap = checkPropWordOverlap(finalObj, onsetOf, { until: frames });
const propMargin = globalThis.KT_INTERP.hasKeepClearProps?.(finalObj)
  ? checkPropWordOverlap(finalObj, onsetOf, { until: frames, useMargin: true })
  : { violations: [], pass: true };
if (!propOverlap.pass) {
  process.exitCode = 1;
  console.error(`PROP COVERS SUNG WORD FAIL: ${propOverlap.violations.length} intervals: ${propOverlap.violations.slice(0, 8).map(v => v.summary).join('; ')}`);
}
// Brief 21: hard check — jersey fonts (JERSEY_FONTS plus song.jersey_font) only on player names, jersey numbers, and their reveal copies.
const jerseyCheck = checkJerseyFonts(finalObj, { song, until: frames });
if (!jerseyCheck.pass) {
  process.exitCode = 1;
  console.error(`JERSEY FONT ON NON-PLAYER WORD FAIL: ${jerseyCheck.violations.length}: ${jerseyCheck.violations.slice(0, 8).map(v => v.summary).join('; ')}`);
}
const syncCheck = checkSync(finalObj, sung), holdCheck = checkHolds(finalObj, sung, { until: revealF0 });
const shownFinal = gateFailures(finalObj, onsetOf, { until: revealF0 });
const partialFinal = shownFinal.filter(x => x.kind === 'partial'), droppedFinal = shownFinal.filter(x => x.kind === 'unshown');
const smallFinal = shownFinal.filter(x => x.kind === 'small'), sparseFinal = shownFinal.filter(x => x.kind === 'sparse');
const counts = entranceCounts(finalObj);
if (!syncCheck.pass || !holdCheck.pass || partialFinal.length) process.exitCode = 1;
const revealCheck = REVEAL_ON ? checkReveal(finalObj, { frame: frames - 1 }) : { pass: true, off: true, frame: frames - 1, coverage: null };
if (!revealCheck.pass) process.exitCode = 1;
// Reveal safety: a dropped chain fails the build, and no moved plaque's original may be in frame on the frame before
// the switch to the moved copies (it would teleport).
const droppedChains = REVEAL_ON ? reveal.compaction?.dropped ?? [] : [];
if (droppedChains.length) process.exitCode = 1;
const teleports = [];
if (REVEAL_ON) {
  const I = globalThis.KT_INTERP, pose = I.poseAt(finalObj.cams, revealF0 - 1);
  for (const c of finalObj.words.filter(w => w.reveal_copy_of)) {
    const o = finalObj.words.find(w => w.id === c.reveal_copy_of);
    if (!o || Math.hypot(...o.C.map((x, i) => x - c.C[i])) < 1 || !(o.on <= revealF0 - 1) || (o.off != null && o.off <= revealF0 - 1)) continue;
    const q = I.project(o.C, pose, finalObj.meta.vfov ?? 40);
    if (q && Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1) teleports.push(`${o.id} ${o.text}`);
  }
}
if (teleports.length) process.exitCode = 1;
// A failing gate stops the join: the scene goes to a name no render step uses, and an earlier final scene in this
// folder is renamed so it cannot be taken for this join's output.
const gatesFailed = !!process.exitCode;
if (gatesFailed) {
  if (fs.existsSync(finalScene)) fs.renameSync(finalScene, path.join(OUT, 'Whole song - earlier final, before a failed join - scene.json'));
  fs.writeFileSync(failedScene, JSON.stringify(finalObj, null, 1));
} else {
  fs.writeFileSync(finalScene, JSON.stringify(finalObj, null, 1));
  fs.rmSync(failedScene, { force: true });
}

// ---- Provenance and the flagged list ----
const md = [];
md.push(`# ${song.title}, whole song: provenance and flags`, '', `Built ${new Date().toISOString().slice(0, 10)} by the Kinetic Type Engine's deterministic/build_song.mjs from "${inputDir}", ${N} candidates per section. Song end ${SONG_END} s, ${frames} frames at ${FPS} fps. Scene to render: "${path.basename(finalScene)}".`, '');
md.push('## Sections', '', 'Fallback candidates are ranked: passing first, then fewest partly shown focused words, then the smallest worst single reading loss (named), then severity, then score.', '', '| Section | Candidates | Passing | Chosen | Partly shown words | Worst reading loss | Severity | Failures left | Ruling flags | Shown-whole repairs |', '|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) md.push(`| ${r.label} | ${r.built} | ${r.survivors} | ${r.chosen} | ${r.gate ?? '-'} | ${r.worst ? `${r.worst.loss} frames${r.worst.word ? ` (${r.worst.word})` : ''}` : '-'} | ${r.severity} | ${Object.entries(r.failures).map(([k, v]) => `${k} x${v.length}`).join(', ') || 'none'} | ${r.flags} | ${r.shownRepair ? `${r.shownRepair.before} to ${r.shownRepair.after} partly shown, ${r.shownRepair.log.length} repairs` : '-'} |`);
md.push('', '## Seams', '', '| Into | Frame | Join | Frames | Previous last word | Reading frames before the join |', '|---|---|---|---|---|---|');
for (const s of seams) md.push(`| ${s.section} | ${s.frame} | ${s.verb} | ${s.frames} | ${s.previousLastWord} | ${s.readingFramesBeforeSeam} |`);
md.push('', '## Candidate check frequency', '', ...rows.filter(r => r.checkFrequency).map(r =>
  `- ${r.label}: ${Object.entries(r.checkFrequency).sort((a,b) => b[1]-a[1]).map(([name,n]) => `${name} ${n}/${N}`).join(', ')}`));
md.push('', '## Opening and team wordmarks', '', appearance.intro,
  `Opening blank: ${appearance.blank} frames (limit ${FPS} frames / 1 s): ${appearance.pass ? 'PASS' : 'FAIL'}.`, '', `Wordmark blocks (brief 12): centred with an even margin of 0.25 x the ink height on all four sides; growth back toward the song's wordmark size: ${wordmarkGrowth.length}.`, ...wordmarkGrowth.map(x => `- ${x}`), '',
  ...appearance.wordmarks.map(x => `- ${x}`), '',
  `Wordmark use: ${['image', 'font', 'neither'].map(k => `${k}: ${appearance.wordmarkUse.filter(x => x.used === k).map(x => x.name).join(', ') || 'none'}`).join('; ')}.`);
{ const L = roles.log, kw = finalObj.words.filter(w => w.keyword && !w.reveal_copy_of), kwDropped = kw.filter(w => w.dropped);
  md.push('', '## Word roles (keywords, names, scores)', '', `Keywords (one classifier for the grey rule, the size pass and keyword mode): ${kw.length} of ${finalObj.words.filter(w => w.map_index != null && !w.reveal_copy_of).length} matched words. Keywords dropped: ${kwDropped.length}${kwDropped.length ? ` (${kwDropped.map(w => `${w.id} ${w.text}, ${w.dropped}`).join('; ')})` : ''}.`,
    `Grey keywords made cream: ${L.greyKeywords.length}. Grey player names made cream: ${L.greyNames.length}. Font changes: ${L.fontChanges.length}. Scores: ${L.scores.length}. Jersey font gate (brief 21, player names/jersey numbers/reveal copies only): ${jerseyCheck.violations.length} violations (${jerseyCheck.pass ? 'PASS' : 'FAIL'}). Scene words not matched to the song map: ${L.unmatched.length}.`, '',
    ...(jerseyCheck.violations.length ? [...jerseyCheck.violations.map(v => `- FAIL: ${v.summary}`), ''] : []),
    ...[...L.greyKeywords, ...L.greyNames, ...L.fontChanges, ...L.scores].map(x => `- ${x}`), '', `Numerals (brief 10 items 40 and 41): ${L.numerals.length}.`, ...L.numerals.map(x => `- ${x}`), '', `Display overrides (brief 10 item 42): ${L.displays.length}.`, ...L.displays.map(x => `- ${x}`), '',
    ...(mustShowReport.length ? [
      `Must-show words (brief 20; readable hard floor ${Math.round(100 * MUST_SHOW_FLOOR_RATIO)}% of hold minimum: ${(100 * (size.settings.minH ?? 0.09) * MUST_SHOW_FLOOR_RATIO).toFixed(1)}% crowded, ${(100 * (size.settings.minH ?? 0.09) * (size.settings.roomFactor ?? 1.5) * MUST_SHOW_FLOOR_RATIO).toFixed(2)}% with room): ${mustShowReport.length} configured, ${mustShowDropped.length} dropped (${mustShowDropped.length ? 'FAIL' : 'PASS'}).`,
      ...mustShowReport.map(m => `- ${m.id} ${m.text} (map ${m.map_index}) at ${m.time_s} s [${m.source}]: ${m.status}; action: ${m.action}`),
      '',
    ] : []),
    `Player names and jersey numbers in team colours (brief 10 items 46 and 47, jersey_colours ${teamNames.mode}${teamNames.team ? `, dark ${teamNames.team.dark}, light ${teamNames.team.light}` : ''}): ${teamNames.log.length}.`, ...teamNames.log.map(x => `- ${x}`), '', `Keyword drops for review (brief 10 item 44): ${dropsForReview.length}${dropsForReview.length ? `; ${dropFails.length} without an approving review (FAIL)` : ''}.`, ...dropsForReview.map(d => `- ${d.id} ${d.word} at ${d.time_s} s (still frame ${d.frame_to_still}): ${d.reason}; review: ${dropReview[String(d.index)]?.verdict ?? 'none'}`), ...(L.unmatched.length ? [`- Unmatched: ${L.unmatched.join(', ')}`] : [])); }
md.push('', '## Hold-hide partners', '', `${partnerHides.length} changes.`, '', ...partnerHides.map(x => `- ${x}`));
{ const opAt = (w, f) => { let v = 1; for (const [k, x] of w.opacity ?? []) if (k <= f) v = x; return v; };
  const byId = new Map(finalObj.words.map(w => [w.id, w]));
  flythrough.log = flythrough.log.map(x => { const m = x.match(/(w\d+[a-z0-9]*) [^:]*: hidden (\d+)-(\d+)/); if (!m) return x; const w = byId.get(m[1]);
    let undone = 0; for (let f = +m[2]; f < +m[3]; f++) if (w && opAt(w, f) > 0.05) undone++;
    if (undone === +m[3] - +m[2] && !/no visible change/.test(x)) flythrough.visible--;
    return undone ? `${x}; UNDONE later on ${undone} of its frames (a fill kept the word on)` : x; }); }
{ const latest = new Map(); for (const r of roomLog) latest.set(r.w.id, r);
  md.push('', '## Dropped words: room check (brief 10 item 37, brief 16 item 3)', '',
    'Room: a placement on the word\'s own plaque plane, same orientation, at least its minimum letter size in the hold where it is sung, centre within 3 of its widths or heights of its planned spot, whole in frame from its appearance through its onset, clear of every other word over its life, and not static and partly on screen.', '',
    ...[...latest.values()].map(r => `- ${r.w.id} ${r.w.text} at ${(r.w.t ?? 0).toFixed(2)} s (${r.w.keyword ? 'keyword' : 'filler'}): ${r.room ? `had room, put back (${r.how})${r.w.dropped ? `; LATER DROPPED again (${r.w.dropped})` : ''}` : `no room (${r.how}); ${r.w.dropped ? 'still dropped' : 'shown small after all: dropping it left an empty stretch (see the size undo list)'}`}`),
    ...(gapRepairs.log.length ? ['', `Phrase gaps closed in later views (brief 16b): ${gapRepairs.log.length}.`, ...gapRepairs.log.map(x => `- ${x}`)] : []),
    ...(roomLeft.length ? ['', `GATE FAIL: room left for ${roomLeft.map(r => `${r.w.id} ${r.w.text}`).join(', ')}`] : []),
    ...(gapsLeft.length ? ['', `GATE FAIL: phrase gap with room left: ${gapsLeft.map(g => `${g.left.id} ${g.left.text} .. [${g.fitting.map(w => `${w.id} ${w.text}`).join(', ')}] .. ${g.right.id} ${g.right.text} (${g.h.start}-${g.h.end})`).join('; ')}`] : [])); }
md.push('', '## Fly-through, swell release, largest word, lone holds (brief 8)', '',
  `Fly-through hides: ${flythrough.log.length}, of which ${flythrough.visible} change visible pixels${flythrough.focused.length ? `; words the camera flies through while they must be shown whole (not hidden): ${flythrough.focused.join(', ')}` : ''}.`, '', ...flythrough.log.map(x => `- ${x}`),
  '', `Swell releases: ${swellReleases.length}.`, '', ...swellReleases.map(x => `- ${x}`),
  '', `Grey words made cream as the largest word on screen: ${greyLargest.length}.`, '', ...greyLargest.map(x => `- ${x}`),
  '', `One word alone on screen for over ${LONE_HOLD} frames: ${lone1.length} stretches, ${lone1.filter(r => r.drops.length).length} with a dropped word sung inside.`, '',
  ...nearEmpty.length ? ['', `Near-empty stretches (only a small sideways word on screen; reported, not failed): ${nearEmpty.map(r => `${(r.start / FPS).toFixed(2)}-${((r.end + 1) / FPS).toFixed(2)} s`).join(', ')}.`, ''] : [],
  ...lone1.map(r => `- ${r.w.id} ${r.w.text} alone ${(r.start / FPS).toFixed(2)}-${((r.end + 1) / FPS).toFixed(2)} s${r.drops.length ? `; FLAG: dropped inside it: ${r.drops.map(x => `${x.id} ${x.text} (${x.dropped})`).join(', ')}` : ''}`));
md.push('', '## Zoom entrances (size floor)', '', `${zoomFloor.length} zoom entrances start larger, at no less than half the size minimum with room.`, '', ...zoomFloor.map(x => `- ${x}`));
md.push('', '## Projected overlap', '', `${overlapFinal.overlaps.length} remaining intervals (${overlapFinal.overlaps.length ? 'FAIL' : 'PASS'}), scanned with each sung pulse at its peak. Pulses lowered or dropped: ${pulseLog.length}.`, '', ...pulseLog.map(x => `- Pulse: ${x}`),
  ...overlapRepair.retired.map(x => `- Repair: ${x}`), ...overlapFinal.overlaps.map(x => `- ${x}`));
if (appearance.backdrops.length || appearance.props.length) {
  md.push('', '## Backdrops and props (brief 17 & 18)', '',
    `Backdrops: ${appearance.backdrops.length}. Props: ${appearance.props.length}.`, '',
    ...appearance.backdrops.map(x => `- Backdrop: ${x}`),
    ...appearance.props.map(x => `- Prop: ${x}`), '',
    `Keep-clear framing (brief 18): ${keepClearFrame.holdsReframed} holds reframed, ${keepClearFrame.holdsSplit} holds split; ${keepClearResolve.log.length} targeted prop-clearance repairs; ${keepClearResolve.belowMin.length} words scaled below legibility minimum; ${keepClearResolve.unresolved.length} unresolved.`,
    ...keepClearFrame.log.map(x => `- Frame: ${x}`),
    ...keepClearResolve.log.map(x => `- Resolve: ${x}`),
    ...keepClearResolve.belowMin.map(x => `- BELOW MIN: ${x}`),
    ...keepClearResolve.unresolved.map(x => `- UNRESOLVED: ${x}`), '',
    `Prop covers sung word during focus window (hard gate, raw hitBox): ${propOverlap.violations.length} intervals (${propOverlap.pass ? 'PASS' : 'FAIL'}).`,
    `Keep-clear margin check (hitBox + keep_clear_margin_px, reported): ${propMargin.violations.length} intervals.`,
    ...propOverlap.violations.map(v => `- FAIL: ${v.summary}`));
}
md.push('', '## Ending', '', `Still ending (camera still for the last ${MIN_END_HOLD} frames, no word moving on the last frame): ${stillEnding.pass ? 'PASS' : `FAIL: ${stillEnding.problems.join('; ')}`}.`, '');
if (!REVEAL_ON) md.push(`Reveal off (song settings ending). The song ends on ${reveal.word}, at rest from frame ${reveal.restFrame} (${(reveal.restFrame / FPS).toFixed(2)} s) and held still to the last frame.${reveal.sungAfter.length ? ` Words sung after it (${reveal.sungAfter.join(', ')}) play first; the camera cuts back at frame ${reveal.cutBack}.` : ''}`, '');
else md.push('## Reveal', '', `${revealF0 < plannedRevealF0 ? `Moved earlier from frame ${plannedRevealF0} so the pull-back lands and holds still before the end. ` : ''}${reveal.stoppedAt ? `The pull-back stops at the ${(REVEAL_MIN_COVERAGE * 100).toFixed(0)}% coverage floor, centred (distance ${reveal.stoppedAt.from.toFixed(0)} -> ${reveal.stoppedAt.to.toFixed(0)}; the whole layout would cover ${(reveal.stoppedAt.coverageWhole * 100).toFixed(1)}%). ` : ''}Starts at frame ${revealF0} (${(revealF0 / FPS).toFixed(2)} s), pulls back until frame ${reveal.f1} (${(reveal.f1 / FPS).toFixed(2)} s), then holds still for ${((frames - reveal.f1) / FPS).toFixed(2)} s to the end. Compacted layout (assemble_sections.mjs compactLayout): ${reveal.compaction?.chains} chains; gaps between chains in the true layout ${JSON.stringify(reveal.compaction?.gapsBefore)} units; largest gap between consecutive plaques after compaction ${reveal.compaction?.largestGapAfter} units; dropped ${reveal.compaction?.dropped.length ?? 0}. The reveal shows ${reveal.tail} of ${reveal.of} plaques. Reveal check on frame ${revealCheck.frame} (needs 20%; the reveal was laid out for ${(REVEAL_MIN_COVERAGE * 100).toFixed(0)}%): ${(revealCheck.coverage * 100).toFixed(1)}% of the frame covered, ${revealCheck.plaquesInFrame} of ${revealCheck.plaquesShown} shown plaques in frame, ${revealCheck.pass ? 'PASS' : 'FAIL'}.`, '', ...(reveal.compaction?.log ?? []).map(l => `- ${l}`), '');
if (REVEAL_ON) md.push(`Reveal safety: ${droppedChains.length} dropped plaques (${droppedChains.length ? 'FAIL' : 'PASS'}); ${teleports.length} moved plaques in frame on the frame before the switch (${teleports.length ? `FAIL: ${teleports.join(', ')}` : 'PASS'}).`, '');
md.push('## Keyword mode (fast words)', '', fastWordsOn(song.fast_words) ? `On (song settings "fast_words": ${JSON.stringify(song.fast_words ?? {})}). ${keywords.stretches.length} stretches; ${keywords.dropped.size} words dropped.` : 'Off (song settings "fast_words" mode "all_words" or enabled false): every word is shown.', '',
  ...keywords.stretches.map((st, k) => `${k + 1}. ${st.start.toFixed(2)}-${st.end.toFixed(2)} s, peak ${st.peak.toFixed(1)} words per second: dropped ${keywords.log.filter(x => x.i >= st.from && x.i <= st.to).map(x => `${x.text} (${x.t.toFixed(2)} s, ${x.why})`).join(', ') || 'none'}.`), '');
md.push('## Readable size and composition', '',
  `Words sung while still small (letters under 10% of the frame height at onset + 3 frames; reported, not gated): ${smallFinal.length}.`, ...smallFinal.map(x => `- ${x.id} ${x.text} at ${(x.onsetF / FPS).toFixed(2)} s: ${x.why}`), '',
  `Sparse frames (two small consecutive words far apart, no anchor word in view): ${sparseFinal.length}.`, ...sparseFinal.map(x => `- ${x.id} ${x.text} at ${(x.onsetF / FPS).toFixed(2)} s: ${x.why}`), '',
  `Lone focus words brought closer: ${lone.log.length}.`, ...lone.log.map(x => `- ${x}`), '',
  `Size (brief 5, big enough or not shown; minimum ${size.settings.minH} of the frame height when crowded, ${size.settings.roomFactor} x that with room): ${size.counts.grown} grown, ${size.counts.dropped} dropped, ${size.counts.hidden} hidden for a later hold, ${size.counts.keptSmall} kept small to avoid an empty screen; ${size.counts.importantSmall} important words kept under size (Type rule 2 forbids dropping them); ${sizeUndone.length} drops or hides undone because they left a stretch over ${EMPTY_MAX_S} s empty that the fills could not clear.`, ...size.log.map(x => `- ${x}`), ...sizeUndone.map(x => `- undone: ${x}`), '',
  `No word static and partly on screen (brief 6 item 5; static: visible share changing under ${STATIC_RATE} per frame for ${STATIC_FRAMES} frames or more): ${staticHide.log.length} fragments hidden; ${staticHide.focused.length} focused words left as they are; final scene ${staticFinal.length} (${staticFinal.length ? 'FAIL' : 'PASS'}).`, ...staticHide.log.map(x => `- ${x}`), ...staticHide.focused.map(x => `- focused, not hidden: ${x}`), ...staticFinal.map(x => `- FAIL: ${x.w.id} ${x.w.text} frames ${x.start}-${x.end} (${(x.start / FPS).toFixed(2)} s), ${Math.round(100 * x.share)}% on screen`), '',
  `No outlines (brief 5, change 2: every word solid): ${outlines.log.length} changed.`, ...outlines.log.map(x => `- ${x}`), '',
  `Edge clutter hidden (non-focus words with letters cut by the frame edge during a hold): ${clutter.log.length}.`, ...clutter.log.map(x => `- ${x}`), '',
  `Unreadable text hidden (upside down, mirrored or from behind, outside its focus window): ${unreadable.log.length}.${unreadable.focused.length ? ` Focus words shown that way (not hidden): ${unreadable.focused.join(', ')}.` : ''}`, ...unreadable.log.map(x => `- ${x}`), '',
  `First and last frames: ${emptyEnds.length ? `FAIL, empty frame ${emptyEnds.join(' and ')}` : 'PASS, something on screen'}. Empty stretches over ${EMPTY_MAX_S} s (${emptyMaxF} frames), whole song: ${fill.short.length} shorter gaps allowed (longest ${Math.max(0, ...fill.short.map(r => r.end - r.start + 1))} frames). ${fill.remaining.length ? `FAIL, ${fill.remaining.length} runs: ${fill.remaining.map(r => `${r.start}-${r.end} (${(r.start / FPS).toFixed(2)} s)`).join(', ')}` : 'PASS, none'}. Filled: ${fill.log.length}.`, ...fill.log.map(x => `- ${x}`), '');
md.push('## Flagged for Jefferson', '', ...(flagged.length ? flagged.map((f, i) => `${i + 1}. ${f}`) : ['None.']), '');
const sp = finalObj.meta.sung_pulses ?? { added: [], skipped: [] };
const popWhy = {};
for (const r of rows) for (const p of r.pops ?? []) popWhy[p.why] = (popWhy[p.why] ?? 0) + 1;
md.push('## Shown whole (focused word)', '', `Joined scene before its sweep: ${shownSweep.before} partly shown, ${shownSweep.beforeUnshown} wholly out of frame. After the sweep: ${shownSweep.after} partly shown, ${shownSweep.afterUnshown} out. Final scene (after echoes and picture elements): ${partialFinal.length} partly shown (${partialFinal.length ? 'FAIL' : 'PASS'}), ${droppedFinal.length} dropped.`, '', 'Sweep repairs:', '', ...shownSweep.log.map(x => `- ${x}`), '', 'Final-scene repairs (shown whole and overlap together):', '', ...(joint.shownLog.length ? joint.shownLog.map(x => `- ${x}`) : ['- none']), '', 'Partly shown (failures):', '', ...(partialFinal.length ? partialFinal.map(x => `- ${x.id} ${x.text} (onset frame ${x.onsetF}): ${x.why}`) : ['- none']), '', 'Dropped (wholly out of frame around their onset):', '', ...(droppedFinal.length ? droppedFinal.map(x => `- ${x.id} ${x.text} (onset frame ${x.onsetF}): ${x.why}`) : ['- none']), '');
md.push('## Entrances', '', '| Section | Entrances | Pops (echoes included) | Share | By primitive |', '|---|---|---|---|---|', ...Object.entries(counts).map(([k, r]) => `| ${k} | ${r.total} | ${r.pop} | ${(r.share * 100).toFixed(1)}% | ${r.byPrim ? Object.entries(r.byPrim).map(([p, n]) => `${p} ${n}`).join(', ') : ''} |`), '', `Pop reasons in the built sections: ${Object.entries(popWhy).map(([k, n]) => `${k} ${n}`).join(', ')}.`, '');
md.push('## Whole-song checks', '', `Sync: ${syncCheck.late.length} late (${syncCheck.pass ? 'PASS' : 'FAIL'}); ${syncCheck.dropped.length} lyric words dropped.`, ...syncCheck.late.map(x => `- late: ${x}`), ...syncCheck.dropped.map(x => `- dropped: ${x}`), '', `Idle stretches (sung events more than 2 s after any visible activity that uses them): ${holdCheck.holds.length}${holdCheck.longest ? `; longest ${holdCheck.longest.seconds} s` : ''} (${holdCheck.pass ? 'PASS' : 'FAIL'}).`, ...holdCheck.holds.map(h => `- from frame ${h.from} to ${h.to}: ${h.seconds} s, ${h.sungInside} sung events (${h.words.join(' ')})`), '');
md.push('## Sung repeats and ad-libs', '', ...sp.added.map((a, i) => `${i + 1}. ${a.text} (${a.id}) at ${a.t} s, frame ${a.frame} (${a.source}, ${a.treatment ?? 'pulse'})`), '', 'Dropped:', '', ...(sp.skipped.length ? sp.skipped.map(x => `- ${x}`) : ['- none']), '', `Instrumental beat pulses: ${(sp.beat ?? []).length} (${(sp.beat ?? []).map(b => `${b.text}@${b.t}`).join(', ')}).`, '');
md.push('## Map audit', '', ...(mapAudit.length ? mapAudit.map(m => `- ${m}`) : ['- none']), '');
md.push('## Click track', '', clicks.length ? `"${path.basename(clickPath)}": the song with a click on each of the ${clicks.length} repeat and ad-lib events. ${clicks.filter(c => c.status.startsWith('snapped')).length} snapped to a vocal-stem onset; ${clicks.filter(c => !c.status.startsWith('snapped')).length} unconfirmed.` : 'No repeat or ad-lib events, so no click track.', '', ...clicks.map((c, i) => `${i + 1}. ${c.text} at ${c.t} s: ${c.status}`), '');
md.push('## Picture elements', '', '```', el.trim(), '```', '');
if (gatesFailed) md.push('## GATES FAILED: not for render', '', `The join exited 1; no final scene was written. Inspection copy: ${path.basename(failedScene)}.`, '');
else md.push('## Render (outside any agent sandbox: it runs headless Chrome)', '', '```', `node "${path.join(engine, 'capture.mjs')}" "${finalScene}" "${path.join(OUT, `${song.title} - whole song.mp4`)}" ${FPS} 0 ${SONG_END} --blur on`, '```', '');
fs.writeFileSync(path.join(OUT, 'Whole song - provenance and flags.md'), md.join('\n'));
console.log(rows.map(r => `${r.label}: ${r.survivors}/${r.built} chosen ${r.chosen} severity ${r.severity}`).join('\n'));
console.log('seams', JSON.stringify(seams));
console.log('sung pulses', JSON.stringify(sp.added.map(a => `${a.text}@${a.t}`)), 'skipped', sp.skipped.length);
console.log('sync', JSON.stringify({ late: syncCheck.late.length, dropped: syncCheck.dropped.length }), 'idle', JSON.stringify(holdCheck.holds));
console.log('shown whole', JSON.stringify({ sweepBefore: shownSweep.before, sweepAfter: shownSweep.after, finalPartial: partialFinal.length, finalDropped: droppedFinal.length }), 'echoes', finalObj.words.filter(w => w.echo).length);
console.log('entrances', JSON.stringify(counts['Whole song']), 'pop reasons', JSON.stringify(popWhy));
console.log('reveal check', JSON.stringify(revealCheck), 'still ending', JSON.stringify(stillEnding));
if (overlapFinal.overlaps.length) console.error(`OVERLAP FAIL: ${overlapFinal.overlaps.length} intervals: ${overlapFinal.overlaps.slice(0, 8).join('; ')}`);
console.log('roles', JSON.stringify({ greyKeywords: roles.log.greyKeywords.length, greyNames: roles.log.greyNames.length, fontChanges: roles.log.fontChanges.length, scores: roles.log.scores.length, jerseyViolations: jerseyCheck.violations.length, keywordsDropped: finalObj.words.filter(w => w.keyword && w.dropped && !w.reveal_copy_of).length }));
if (mustShowReport.length) console.log('must-show', JSON.stringify({ total: mustShowReport.length, dropped: mustShowDropped.length, details: mustShowReport.map(m => `${m.id} ${m.text} (map ${m.map_index}): ${m.status}`) }));
console.log('pulses tamed', pulseLog.length, 'zoom floors', zoomFloor.length, 'hold partners', partnerHides.length, 'fly-through hides', flythrough.log.length, 'visible', flythrough.visible, 'swell releases', swellReleases.length, 'largest grey', greyLargest.length, 'near-empty sideways', nearEmpty.length, 'put back', roomLog.filter(r => r.room).length);
for (const r of lone1.filter(r => r.drops.length)) console.log(`LONE HOLD after a drop: ${r.w.id} ${r.w.text} ${(r.start / FPS).toFixed(2)}-${((r.end + 1) / FPS).toFixed(2)} s (${r.drops.map(x => `${x.id} ${x.text}`).join(', ')} dropped)`);
console.log('size', JSON.stringify({ staticHidden: staticHide.log.length, staticFinal: staticFinal.length, grown: size.counts.grown, dropped: size.counts.dropped, hiddenSmall: size.counts.hidden, keptSmall: size.counts.keptSmall, importantSmall: size.counts.importantSmall, sizeUndone: sizeUndone.length, outlinesFlat: outlines.log.length, small: smallFinal.length, sparse: sparseFinal.length, lone: lone.log.length, clutter: clutter.log.length, unreadable: unreadable.log.length, unreadableFocus: unreadable.focused.length, emptyEnds, filled: fill.log.length, shortGaps: fill.short.length, longestShortGap: Math.max(0, ...fill.short.map(r => r.end - r.start + 1)), emptyRuns: fill.remaining.map(r => `${r.start}-${r.end}`) }));
console.log('reveal', JSON.stringify(reveal), 'revealF0', revealF0, 'hidden', hideLog.filter(l => l.includes('hidden')).length);
console.log(el.split('\n').filter(l => /CHECKS|FAIL|^  /.test(l)).join('\n'));
console.log('wordmarks', JSON.stringify(appearance.wordmarkUse.map(({ name, used, words }) => ({ name, used, words }))), 'opening blank', appearance.blank);
if (appearance.backdrops.length || appearance.props.length) console.log('stage layers', JSON.stringify({ backdrops: appearance.backdrops.length, props: appearance.props.length, propOverlapViolations: propOverlap.violations.length }));
console.log('keywords', JSON.stringify({ on: fastWordsOn(song.fast_words), stretches: keywords.stretches.map(st => `${st.start.toFixed(2)}-${st.end.toFixed(2)}@${st.peak.toFixed(1)}`), dropped: keywords.dropped.size }));
if (gatesFailed) console.error(`GATES FAILED: no final scene written. Inspection copy: ${failedScene}`); else console.log('scene to render:', finalScene);
