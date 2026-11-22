// Make the first draft of a song's engine input folder from its song map (22 November 2026). See KIT.md, "New song".
// Needs, in the song workspace (the kinetic-type-video skill makes both):
//   song.json              the skill's song file ("song", "audio" relative to the workspace)
//   analysis/Song map.json  from the skill's scripts/build_song_map.py over the Suno lyric alignment
// Writes "<workspace>/engine input/" (refuses if "song settings.json" is already there):
//   song settings.json      title, audio, map, palette, fps, number words shown as digits, and PROPOSED sections
//   Song map.json           a copy of the analysis map (edit the copy, not the analysis file, for engine-only fixes)
//   timing corrections.json empty: add word-time fixes heard by ear
//   sung repeats.json       empty: add repeats and ad-libs the lyric map lacks
//   palette.json            a copy of palettes/starter - two team colours.json (edit the colours)
// Usage: node new_song_input.mjs "<song workspace>" [--title "Short title"] [--section-seconds 16]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const engine = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const ws = path.resolve(args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--'))) ?? '');
const skillSong = JSON.parse(fs.readFileSync(path.join(ws, 'song.json'), 'utf8'));
const mapFile = path.join(ws, 'analysis/Song map.json');
const map = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
const dir = path.join(ws, 'engine input');
fs.mkdirSync(dir, { recursive: true });
const settingsPath = path.join(dir, 'song settings.json');
if (fs.existsSync(settingsPath)) { console.error(`${settingsPath} already exists; not overwriting.`); process.exit(1); }
const write = (f, obj) => fs.writeFileSync(path.join(dir, f), typeof obj === 'string' ? obj : JSON.stringify(obj, null, 1), { flag: 'wx' });

// Title: the song name without the leading "!" and the parenthetical ("!Big Toothy Grins (Timberwolves Anthem)" gives
// "Big Toothy Grins"). It seeds every random choice, so changing it changes every build.
const title = opt('--title', String(skillSong.song ?? path.basename(ws)).replace(/^!+/, '').replace(/\s*\(.*\)\s*$/, '').trim());
const audioAbs = path.resolve(ws, skillSong.audio);
if (!fs.existsSync(audioAbs)) console.warn(`WARNING: audio not found at ${audioAbs}`);

// Hyphenated number words the map spells out (twenty-four, thirty-FOUR) are shown as digits.
const UNITS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const displayNumbers = {};
for (const w of map.words) {
  const m = /^\(?([a-z]+)-([a-z]+)/i.exec(w.text);
  if (m && TENS[m[1].toLowerCase()] && UNITS[m[2].toLowerCase()]) displayNumbers[`${m[1]}-${m[2]}`.toLowerCase()] = String(TENS[m[1].toLowerCase()] + UNITS[m[2].toLowerCase()]);
}

// Proposed sections: consecutive lines, cut after a line once the section spans at least --section-seconds (Room for
// One's built sections ran 17 to 32 s); a short tail joins the section before it. Rename and re-cut them by ear at the
// song's own phrase boundaries (verse quatrains, hooks, count-ins, outro), as Room for One did.
const target = Number(opt('--section-seconds', 16));
const lines = map.lines;
const sections = [];
let cur = null;
for (const l of lines) {
  if (!cur) cur = { first: l.id, last: l.id, start: l.start_s, end: l.end_s };
  else { cur.last = l.id; cur.end = l.end_s; }
  if (cur.end - cur.start >= target) { sections.push(cur); cur = null; }
}
if (cur) { if (sections.length && cur.end - cur.start < target / 2) { sections.at(-1).last = cur.last; sections.at(-1).end = cur.end; } else sections.push(cur); }
const firstWords = id => lines.find(l => l.id === id).text.replace(/[^A-Za-z' ]/g, '').split(/\s+/).slice(0, 4).join(' ');
const settings = {
  about: `${title}: input for the shared deterministic engine (Kinetic Type Engine/deterministic, see KIT.md there). Drafted by new_song_input.mjs on ${new Date().toISOString().slice(0, 10)}. The sections are a PROPOSAL cut by length; re-cut and rename them at the song's phrase boundaries before building. Paths are relative to this folder.`,
  title,
  audio: path.relative(dir, audioAbs),
  map: 'Song map.json',
  timing_corrections: 'timing corrections.json',
  sung_repeats: 'sung repeats.json',
  palette: 'palette.json',
  fps: 30,
  display_numbers: displayNumbers,
  sections: sections.map((s, i) => ({ n: i + 1, name: `Lines ${s.first} to ${s.last} - ${firstWords(s.first)}`, lines: [s.first, s.last], seconds: Number((s.end - s.start).toFixed(1)) })),
  seam_gap: 0.3,
};
write('song settings.json', settings);
fs.copyFileSync(mapFile, path.join(dir, 'Song map.json'), fs.constants.COPYFILE_EXCL);
write('timing corrections.json', { about: 'Corrections to the song map word times, heard by ear or by Whisper. words: [{ index (into Song map words), text (must match), start_s, end_s }]; lines: [{ id, start_s?, end_s? }].', words: [], lines: [] });
write('sung repeats.json', { about: "Sung repeats and ad-libs the lyric map lacks (chants, echoes). events: [{ text (upper case, as shown), t (s), line (map line id), source (how the time was found), display? }]. The build writes a click track of these for an ear check.", events: [] });
fs.copyFileSync(path.join(engine, 'palettes/starter - two team colours.json'), path.join(dir, 'palette.json'), fs.constants.COPYFILE_EXCL);
console.log(`wrote ${dir}`);
console.log(`title "${title}", ${map.lines.length} lines, ${map.words.length} words, ${map.duration_s} s; numbers shown as digits: ${JSON.stringify(displayNumbers)}`);
for (const s of settings.sections) console.log(`  section ${s.n}: lines ${s.lines[0]} to ${s.lines[1]}, ${s.seconds} s, ${s.name}`);
