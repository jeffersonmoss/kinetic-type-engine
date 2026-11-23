import { songAppearance } from './song_appearance.mjs';
import { scanOverlap, repairShownAndOverlap } from './overlap_gate.mjs';
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
//          [--N 200] [--skip-build] [--sections 4,5] [--reveal-coverage 0.2]
// Exit code 1 when a whole-song check fails (the report says which); the scene is still written.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import './interp.js';
import { checkSync, checkHolds } from './whole_song_checks.mjs';
import { assemble, hideWhenGone, buildReveal, checkReveal, endOnWord, checkStillEnding } from './assemble_sections.mjs';
import { tightenLone, hideEdgeClutter, hideUnreadable, fillEmptyFrames } from './composition.mjs';
import { keywordPlan, fastWordsOn } from './keywords.mjs';
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
// --all-words: build with keyword mode off whatever the song settings say (for comparisons).
if (args.includes('--all-words')) song.fast_words = { ...(song.fast_words ?? {}), mode: 'all_words' };
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

// ---- Song map with the timing corrections applied, and the section words (from the prototype's section words.mjs) ----
const rawMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
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
// Keyword mode for fast words (keywords.mjs; on by default, "fast_words": {"mode": "all_words"} turns it off): in
// stretches sung too fast to read, only the important words are shown. Only words of built sections are dropped (an
// approved opening scene is used as is). Dropped words are left out of the scene, the sync check and the pulses.
const palettePins = Object.keys(JSON.parse(fs.readFileSync(palettePath, 'utf8')).pins ?? {});
const builtLines = new Set(song.sections.flatMap(sec => map.lines.filter(l => l.id >= sec.lines[0] && l.id <= sec.lines[1]).map(l => l.id)));
const keywords = keywordPlan(map.words, song.fast_words ?? {}, { names: [...Object.keys(song.team_wordmarks ?? {}), ...Object.values(song.display_numbers ?? {}), ...palettePins] });
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
    words.push({ t: w.start_s, end: w.end_s, text: display(w.text), line: l.id, id: `w${String(words.length + 1).padStart(2, '0')}` });
  }
  return { section: sec.n, name: sec.name, start_s: lines[0].start_s, song_end_of_hook: lines.at(-1).end_s, lines: outLines, words };
}

const SONG_END = map.duration_s; // the reveal runs to the end of the track
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
for (const sec of song.sections) {
  const w = sectionWords(sec);
  const label = `Section ${sec.n} - ${sec.name}`;
  const dir = path.join(OUT, label);
  const wordsFile = path.join(OUT, 'sections', `${label} - words.json`);
  fs.writeFileSync(wordsFile, JSON.stringify(w, null, 1));
  const isFirst = !parts.length, isLast = sec === song.sections.at(-1);
  const clipEnd = isLast ? SONG_END : w.song_end_of_hook + READ_TAIL_S;
  const t0 = Date.now();
  if (!skipBuild && (!onlySections || onlySections.includes(sec.n))) {
    // The first section built (no opening given) starts its clip at 0 s so the intro is covered.
    const out = execFileSync('node', ['build_best.mjs', '--words', wordsFile, '--window', `${isFirst ? 0 : w.start_s},${w.song_end_of_hook},${clipEnd}`, '--N', String(N), '--out', dir, '--map', mapPath, '--palette', palettePath, '--title', song.title], { cwd: engine, encoding: 'utf8', maxBuffer: 1 << 26 });
    process.stdout.write(out.split('\n').filter(l => l.includes('survivors=')).join('\n') + '\n');
  }
  const scene = JSON.parse(fs.readFileSync(path.join(dir, 'scene.json'), 'utf8'));
  const log = JSON.parse(fs.readFileSync(path.join(dir, 'build log.json'), 'utf8'));
  const fails = Object.fromEntries(Object.entries(log.checkFailures ?? {}).map(([k, v]) => [k, v]));
  rows.push({ checkFrequency: log.checkFrequency, label, built: N, survivors: log.survivorsOfN, chosen: `#${log.buildIndex}${log.passed ? '' : ' (severity fallback)'}`, severity: severity(log), pops: log.pops, worst: worstReadingLoss(log), gate: (log.checkFailures?.[SHOWN_GATE] ?? []).length, shownRepair: log.shownRepair, failures: fails, flags: (log.rulingFlags ?? []).length, seconds: ((Date.now() - t0) / 1000).toFixed(1) });
  for (const [k, v] of Object.entries(fails)) for (const m of v) flagged.push(`${label}: ${k}: ${m}`);
  parts.push({ number: sec.n, label, scene, startFrame: isFirst ? 0 : Math.round(w.start_s * FPS), ...(sec.seam ? { seam: sec.seam } : {}) });
}

const frames = Math.round(SONG_END * FPS);
const { scene, seams, partReveal } = assemble(parts, { fps: FPS, frames, end: SONG_END, gapFrac: song.seam_gap ?? 0.3 });
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
  ...map.words.filter((w, i) => !keywords.dropped.has(i)).map(w => ({ text: (t => NUMBER_WORDS[t] ?? t)(String(w.text).toUpperCase().replace(/[^A-Z0-9']/g, '')), t: w.start_s, line: w.line, source: 'lyric map' })),
  ...repeatsFile.events,
];
const repeatEvents = sung.filter(e => e.source !== 'lyric map');
const clickPath = path.join(OUT, 'Whole song - repeats and ad-libs click track.m4a');
const clicks = repeatEvents.length ? writeClickTrack({ events: repeatEvents, songPath: audio, outPath: clickPath, stemPath: inp(song.vocal_stem) ?? undefined }) : [];
const sungPath = path.join(OUT, 'Whole song - sung words.json');
fs.writeFileSync(sungPath, JSON.stringify({ events: sung, beats: map.beats }, null, 1));
execFileSync('node', ['apply_notes.mjs', raw, notes, sungPath, ...(song.song_notes ? ['--song-notes', inp(song.song_notes)] : [])], { cwd: engine, encoding: 'utf8' });
let el = 'No picture elements (song settings has no "picture_elements").';
if (song.picture_elements) el = execFileSync('node', ['run_elements.mjs', inp(song.picture_elements), notes, finalScene], { cwd: engine, encoding: 'utf8' });
else fs.copyFileSync(notes, finalScene);
const finalObj = JSON.parse(fs.readFileSync(finalScene, 'utf8'));
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
// Brief 4: text upside down, mirrored or seen from behind is hidden outside its focus window; then no frame between the
// intro and the end may be empty (outgoing words stay on through the gap where that adds no overlap).
const unreadable = hideUnreadable(finalObj, onsetOf, { until: revealF0 });
const introEndF = Math.round(Math.min(...map.words.map(w => w.start_s)) * FPS);
const fill = fillEmptyFrames(finalObj, { from: introEndF, until: frames, onsetOf });
// No section pick, fallback or song setting waives this (Jefferson, 22 November 2026: dead screen is the kiss of death).
if (fill.remaining.length) { process.exitCode = 1; console.error(`EMPTY FRAMES FAIL (not waivable): ${fill.remaining.map(r => `${r.start}-${r.end}`).join(', ')}`); }
const stillEnding = checkStillEnding(finalObj, { minHoldFrames: MIN_END_HOLD });
if (!stillEnding.pass) process.exitCode = 1;
const overlapRepair = { retired: joint.overlapLog };
const overlapFinal = { overlaps: joint.overlaps };
if (overlapFinal.overlaps.length) process.exitCode = 1;
const appearance = songAppearance(finalObj, song, inp, Math.min(...map.words.map(w => w.start_s)));
if (!appearance.pass) process.exitCode = 1;
fs.writeFileSync(finalScene, JSON.stringify(finalObj, null, 1));
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
  `Opening blank: ${appearance.blank} frames (limit ${FPS} frames / 1 s): ${appearance.pass ? 'PASS' : 'FAIL'}.`,
  ...appearance.wordmarks.map(x => `- ${x}`), '',
  `Wordmark use: ${['image', 'font', 'neither'].map(k => `${k}: ${appearance.wordmarkUse.filter(x => x.used === k).map(x => x.name).join(', ') || 'none'}`).join('; ')}.`);
md.push('', '## Projected overlap', '', `${overlapFinal.overlaps.length} remaining intervals (${overlapFinal.overlaps.length ? 'FAIL' : 'PASS'}).`, '',
  ...overlapRepair.retired.map(x => `- Repair: ${x}`), ...overlapFinal.overlaps.map(x => `- ${x}`));
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
  `Edge clutter hidden (non-focus words with letters cut by the frame edge during a hold): ${clutter.log.length}.`, ...clutter.log.map(x => `- ${x}`), '',
  `Unreadable text hidden (upside down, mirrored or from behind, outside its focus window): ${unreadable.log.length}.${unreadable.focused.length ? ` Focus words shown that way (not hidden): ${unreadable.focused.join(', ')}.` : ''}`, ...unreadable.log.map(x => `- ${x}`), '',
  `Empty frames between the intro and the end: ${fill.remaining.length ? `FAIL, ${fill.remaining.length} runs: ${fill.remaining.map(r => `${r.start}-${r.end} (${(r.start / FPS).toFixed(2)} s)`).join(', ')}` : 'PASS, none'}. Filled: ${fill.log.length}.`, ...fill.log.map(x => `- ${x}`), '');
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
md.push('## Render (outside any agent sandbox: it runs headless Chrome)', '', '```', `node "${path.join(engine, 'capture.mjs')}" "${finalScene}" "${path.join(OUT, `${song.title} - whole song.mp4`)}" ${FPS} 0 ${SONG_END} --blur on`, '```', '');
fs.writeFileSync(path.join(OUT, 'Whole song - provenance and flags.md'), md.join('\n'));
console.log(rows.map(r => `${r.label}: ${r.survivors}/${r.built} chosen ${r.chosen} severity ${r.severity}`).join('\n'));
console.log('seams', JSON.stringify(seams));
console.log('sung pulses', JSON.stringify(sp.added.map(a => `${a.text}@${a.t}`)), 'skipped', sp.skipped.length);
console.log('sync', JSON.stringify({ late: syncCheck.late.length, dropped: syncCheck.dropped.length }), 'idle', JSON.stringify(holdCheck.holds));
console.log('shown whole', JSON.stringify({ sweepBefore: shownSweep.before, sweepAfter: shownSweep.after, finalPartial: partialFinal.length, finalDropped: droppedFinal.length }), 'echoes', finalObj.words.filter(w => w.echo).length);
console.log('entrances', JSON.stringify(counts['Whole song']), 'pop reasons', JSON.stringify(popWhy));
console.log('reveal check', JSON.stringify(revealCheck), 'still ending', JSON.stringify(stillEnding));
console.log('size', JSON.stringify({ small: smallFinal.length, sparse: sparseFinal.length, lone: lone.log.length, clutter: clutter.log.length, unreadable: unreadable.log.length, unreadableFocus: unreadable.focused.length, filled: fill.log.length, emptyRuns: fill.remaining.map(r => `${r.start}-${r.end}`) }));
console.log('reveal', JSON.stringify(reveal), 'revealF0', revealF0, 'hidden', hideLog.filter(l => l.includes('hidden')).length);
console.log(el.split('\n').filter(l => /CHECKS|FAIL|^  /.test(l)).join('\n'));
console.log('wordmarks', JSON.stringify(appearance.wordmarkUse.map(({ name, used, words }) => ({ name, used, words }))), 'opening blank', appearance.blank);
console.log('keywords', JSON.stringify({ on: fastWordsOn(song.fast_words), stretches: keywords.stretches.map(st => `${st.start.toFixed(2)}-${st.end.toFixed(2)}@${st.peak.toFixed(1)}`), dropped: keywords.dropped.size }));
console.log('scene to render:', finalScene);
