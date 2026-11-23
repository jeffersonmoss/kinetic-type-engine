// Model-chosen keywords (engine fix brief 10 item 43, Jefferson approved 23 November 2026). Once per song, a model reads
// the lyrics and marks every sung word keyword or filler by the KIT definition; the marks go into the song input's
// word_overrides as `keyword` flags, and the word-class classifier (word_roles.mjs) stays only as the fallback.
//
//   node keyword_marks.mjs prompt "<song>/engine input" [--out <prompt.md>]
//       Writes the prompt for the marking agent (an Opus agent, run by the supervisor): the definition, the output
//       format and every song-map word with its index, line by line. Default output: "<engine input>/Keyword marks -
//       prompt.md".
//   node keyword_marks.mjs merge "<song>/engine input" "<marks file>.json"
//       Merges the marks ({ marks: { "<map index>": { keyword: bool, why } } }) into song settings.json word_overrides,
//       keeping every existing key (score, name, display, numeral, notes) and replacing only `keyword`. Prints the
//       counts and every word whose flag differs from the classifier.
import fs from 'node:fs';
import path from 'node:path';
import { keywordFlags } from './word_roles.mjs';

const [mode, dir, file] = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--out');
const opt = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
if (!['prompt', 'merge'].includes(mode) || !dir) { console.error('usage: node keyword_marks.mjs prompt|merge "<song>/engine input" [marks.json] [--out prompt.md]'); process.exit(2); }
const settingsPath = path.join(dir, 'song settings.json');
const song = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
const map = JSON.parse(fs.readFileSync(path.join(dir, song.map ?? 'Song map.json'), 'utf8'));

if (mode === 'prompt') {
  const lines = new Map();
  map.words.forEach((w, i) => { if (!lines.has(w.line)) lines.set(w.line, []); lines.get(w.line).push(`${i}:${w.text}`); });
  const out = opt('--out', path.join(dir, 'Keyword marks - prompt.md'));
  fs.writeFileSync(out, [
    `# Keyword marks for ${song.title ?? 'this song'}`, '',
    'Mark every sung word below as a keyword or a filler. A keyword is a subject, main verb, object, name, or a word stressed on the beat. Names, team names and numbers are keywords. Personal pronouns that are the subject or object are keywords; a dummy "it" or a resumptive pronoun is not. Everything else is a filler. Judge by sense, line by line; the word timing in the song map is a guide to stress.', '',
    'Reply with JSON only, in this shape, with one entry for every index below:', '',
    '```json', '{ "about": "...", "made_by": "<model>, <date>", "marks": { "0": { "text": "Five", "keyword": true, "why": "number, subject" } } }', '```', '',
    'Words (index:text), one sung line per row:', '',
    ...[...lines.values()].map(l => `- ${l.join(' ')}`), ''].join('\n'));
  console.log('prompt written:', out, `(${map.words.length} words)`);
} else {
  if (!file) { console.error('merge needs the marks file'); process.exit(2); }
  const marks = JSON.parse(fs.readFileSync(file, 'utf8')).marks ?? {};
  const fallback = keywordFlags(map.words, { names: [...Object.keys(song.team_wordmarks ?? {}), ...(song.player_names ?? [])], keep: song.fast_words?.keep ?? [], overrides: {} });
  const ov = song.word_overrides ?? {}, changed = [], missing = [];
  map.words.forEach((w, i) => {
    const m = marks[String(i)];
    if (!m || typeof m.keyword !== 'boolean') { missing.push(`${i} ${w.text}`); return; }
    if (m.text && String(m.text).toLowerCase() !== String(w.text).toLowerCase()) throw Error(`marks file word ${i} is "${m.text}", song map says "${w.text}": wrong map?`);
    ov[String(i)] = { ...(ov[String(i)] ?? {}), keyword: m.keyword, ...(m.why ? { keyword_why: m.why } : {}) };
    if (m.keyword !== fallback[i].keyword) changed.push(`${i} ${w.text}: ${m.keyword ? 'keyword' : 'filler'} (classifier: ${fallback[i].why})`);
  });
  song.word_overrides = ov;
  song.keyword_marks = path.basename(file);
  fs.writeFileSync(settingsPath, JSON.stringify(song, null, 1) + '\n');
  console.log(`merged ${map.words.length - missing.length} of ${map.words.length} marks into word_overrides; ${changed.length} differ from the classifier; ${missing.length} not marked (classifier fallback)`);
  for (const c of changed) console.log('  ' + c);
  if (missing.length) console.log('  not marked:', missing.join(', '));
}
