import type {Alignment, EarCheck, Scansion, SongConfig, Stress, TokenScansion} from '../song/index';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object');
  return value as Record<string, unknown>;
}

const text = (value: unknown): value is string => typeof value === 'string';
const nonempty = (value: unknown): value is string => text(value) && value.trim().length > 0;
const seconds = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const nullableText = (value: unknown) => value === null || text(value);
const tuples = (value: unknown, size: number) =>
  Array.isArray(value) && value.every(row => Array.isArray(row) && row.length === size && row.every(text));

export function readAlignment(value: unknown): Alignment {
  const alignment = record(value);
  if (alignment.audio_id !== undefined && !nonempty(alignment.audio_id)) throw new Error('Invalid audio_id');
  if (!Array.isArray(alignment.words)) throw new Error('Expected a Suno words array');
  for (const [index, value] of alignment.words.entries()) {
    const {word, start_s, end_s, success} = record(value);
    if (!text(word) || !seconds(start_s) || !seconds(end_s) || end_s < start_s ||
        (success !== undefined && typeof success !== 'boolean')) {
      throw new Error(`Invalid word or timing at words[${index}]`);
    }
  }
  return value as Alignment;
}

export function readConfig(value: unknown): SongConfig {
  const config = record(value);
  if (!nonempty(config.song)) throw new Error('Expected a song title');
  if (config.audio !== undefined && !nonempty(config.audio)) throw new Error('Invalid audio path');
  if (config.start_bpm !== undefined && (!seconds(config.start_bpm) || config.start_bpm === 0)) {
    throw new Error('start_bpm must be positive');
  }
  if (config.display !== undefined && !tuples(config.display, 2)) throw new Error('Invalid display rules');
  if (config.merge !== undefined && !tuples(config.merge, 3)) throw new Error('Invalid merge rules');
  if (config.fix !== undefined) {
    for (const [line, words] of Object.entries(record(config.fix))) {
      for (const [word, time] of Object.entries(record(words))) {
        if (!/^\d+$/.test(line) || !/^\d+$/.test(word) || !seconds(time)) {
          throw new Error(`Invalid legacy fix at line ${line}, word ${word}`);
        }
      }
    }
  }
  return value as SongConfig;
}

export function readEarChecks(value: unknown): EarCheck[] {
  if (!Array.isArray(value)) throw new Error('Expected an array of ear-check entries');
  const ids = new Set<string>();
  return value.map((raw: unknown, index) => {
    const entry = record(raw);
    const {id, tokenId, issue, status, start, end, by, date, evidence} = entry;
    if (!nonempty(id) || !nonempty(tokenId) || !nonempty(issue) ||
        (status !== 'open' && status !== 'verified' && status !== 'corrected') ||
        !seconds(start) || !seconds(end) || end < start ||
        !nullableText(by) || !nullableText(date) || !text(evidence)) {
      throw new Error(`Invalid ear-check entry at index ${index}`);
    }
    if (ids.has(id)) throw new Error(`Duplicate ear-check ID ${id}`);
    ids.add(id);
    return raw as EarCheck;
  });
}

const stress = (value: unknown): value is Stress => value === 0 || value === 1 || value === 2;

export function readScansion(value: unknown): Scansion {
  return Object.fromEntries(Object.entries(record(value)).map(([id, raw]) => {
    const entry = record(raw);
    if (!nonempty(id) || typeof entry.verified !== 'boolean' ||
        !['cmudict', 'heuristic', 'template', 'author'].some(source => source === entry.source) ||
        !Array.isArray(entry.syllables) || !entry.syllables.length) {
      throw new Error(`Invalid scansion for ${id}: expected syllables, source and verified`);
    }
    for (const [i, raw] of entry.syllables.entries()) {
      const syllable = record(raw);
      if (!text(syllable.text) || !stress(syllable.stress) ||
          (syllable.sungStress !== null && !stress(syllable.sungStress))) {
        throw new Error(`Invalid scansion for ${id}, syllable ${i + 1}: expected text and stress 0, 1 or 2`);
      }
    }
    return [id, raw as TokenScansion];
  }));
}

export function readScansionTemplate(value: unknown): Scansion | Stress[][] {
  const template = record(value);
  if (!Object.hasOwn(template, 'lines')) return readScansion(template);
  if (!Array.isArray(template.lines) || !template.lines.every(line => Array.isArray(line) && line.length && line.every(stress))) {
    throw new Error('Expected lines containing arrays of syllable stress values (0, 1 or 2)');
  }
  return template.lines as Stress[][];
}
