// Post-pass on a built whole-song scene (generic part of Room for One's apply_jefferson_notes.mjs, 22 November 2026).
// Order, as in Room for One:
//   1. reveal copies are set aside;
//   2. the song's own colour and accent rules run (optional "song notes.mjs" in the song's engine input folder:
//      export function applySongNotes(scene, log) { ... }), for example team colours by meaning or chant pulses;
//   3. flip rotate-in for scenes built without attached word transitions;
//   4. reveal copies take their originals' text, style and colours;
//   5. re-sung word pulses and instrumental beat pulses (sung_pulses.mjs) from the sung events file.
// Usage: node apply_notes.mjs <scene in> <scene out> [<sung words json>] [--song-notes <module.mjs>]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { addSungPulses, addBeatPulses } from './sung_pulses.mjs';

const argv = process.argv.slice(2);
const ni = argv.indexOf('--song-notes');
const songNotes = ni >= 0 ? argv[ni + 1] : null;
const [inp, out, sungPath] = argv.filter((a, i) => i !== ni && i !== ni + 1 || ni < 0);
const s = JSON.parse(fs.readFileSync(inp, 'utf8'));
const log = [];
const copies = s.words.filter(w => w.reveal_copy_of);
s.words = s.words.filter(w => !w.reveal_copy_of);
if (songNotes) {
  const mod = await import(pathToFileURL(path.resolve(songNotes)).href);
  if (typeof mod.applySongNotes !== 'function') throw Error(`${songNotes} must export applySongNotes(scene, log)`);
  mod.applySongNotes(s, log);
}
// Flip rotate-in: on a flip the second phrase is already on the back of the turn, so it rotates into view in the same
// direction. Scenes built with attached word transitions (meta.joints_version) already carry it.
for (const c of s.cams.filter(c => c.fold === 'flip' && !s.meta.joints_version)) {
  const pl = s.plaques.find(p => p.on != null && p.on >= c.f0 && p.on <= c.f1);
  if (!pl) continue;
  pl.on = c.f0;
  for (const w of s.words.filter(w => w.plaque === pl.id && w.on <= c.f1 + 3)) { log.push(`${w.id} ${w.text}: on ${w.on} -> ${c.f0} (rotates in)`); w.on = c.f0; w.stamp = false; }
}
{ const byId = new Map(s.words.map(w => [w.id, w]));
  for (const c of copies) { const o = byId.get(c.reveal_copy_of); if (o) for (const k of ['text', 'style', 'colours', 'stripes', 'jersey']) { if (o[k] === undefined) delete c[k]; else c[k] = structuredClone(o[k]); } }
  s.words.push(...copies); }
if (sungPath) {
  const sungFile = JSON.parse(fs.readFileSync(sungPath, 'utf8'));
  const r = addSungPulses(s, sungFile.events);
  if (sungFile.beats) r.beat = addBeatPulses(s, sungFile.events, sungFile.beats, { until: s.meta.whole_song?.revealF0 ?? Infinity });
  s.meta.sung_pulses = r;
  log.push(`re-sung pulses: ${r.added.length} added, ${r.skipped.length} dropped; instrumental beat pulses: ${r.beat?.length ?? 0}`);
}
s.meta.song_notes = songNotes ? path.basename(songNotes) : null;
s.meta.song_notes_log = log;
fs.writeFileSync(out, JSON.stringify(s));
console.log(out, '|', log.join('; '));
