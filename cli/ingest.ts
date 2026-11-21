import {spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, relative, resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {formatEarCheckList, importSong} from '../song/index';
import type {BeatAnalysis, EarCheck} from '../song/index';
import {readAlignment, readConfig, readEarChecks} from './inputs';

export const ingestUsage = 'Usage: kte ingest [film-folder] [--song path] [--alignment path] [--audio path] [--out analysis-folder]';

function readInput<T>(path: string, parse: (value: unknown) => T) {
  try {
    return parse(JSON.parse(readFileSync(path, 'utf8')));
  } catch (error) {
    throw new Error(`${path}: ${error instanceof Error ? error.message : error}`);
  }
}

function optionalFile(path: string) {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

function audioAnalysis(worker: string, audio: string, bpm: number, scratch: string): BeatAnalysis {
  const python = process.env.KTE_PYTHON || 'python3';
  const result = spawnSync(python, [worker, audio, String(bpm)], {
    encoding: 'utf8', timeout: 180_000, maxBuffer: 4 * 1024 * 1024,
    env: {...process.env, PYTHONDONTWRITEBYTECODE: '1', NUMBA_CACHE_DIR: join(scratch, 'Numba cache')},
  });
  if ((result.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT' || result.status === 78) {
    const detail = result.error?.message ?? result.stderr.trim();
    const reason = `librosa beat analysis unavailable with ${python}: ${detail}. Re-run with KTE_PYTHON set to a Python with librosa.`;
    console.warn(reason);
    return {status: 'unavailable', reason, beats: [], duration_s: null, tempo_bpm: null, downbeat_phase: null};
  }
  if (result.error || result.status !== 0) {
    throw new Error(`Beat analysis failed: ${result.error?.message || result.stderr.trim() || result.signal || result.status}`);
  }
  return JSON.parse(result.stdout) as BeatAnalysis;
}

const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';

export function ingest(args: string[], beatWorker: string) {
  const {values, positionals} = parseArgs({
    args, allowPositionals: true,
    options: {
      song: {type: 'string'}, alignment: {type: 'string'}, audio: {type: 'string'},
      out: {type: 'string'}, help: {type: 'boolean', short: 'h'},
    },
  });
  if (values.help) {
    console.log(ingestUsage);
    return;
  }
  if (positionals.length > 1) throw new Error(ingestUsage);

  const film = resolve(positionals[0] ?? '.');
  const songPath = values.song ? resolve(values.song) : join(film, 'song.json');
  const config = readInput(songPath, readConfig);
  const alignmentPath = values.alignment ? resolve(values.alignment) : join(film, 'analysis', 'Suno lyric alignment.json');
  const alignment = readInput(alignmentPath, readAlignment);
  const audio = values.audio ? resolve(values.audio) : config.audio && resolve(dirname(songPath), config.audio);
  if (!audio || !statSync(audio).isFile()) throw new Error('Specify an audio file in song.json or via --audio');
  const out = values.out ? resolve(values.out) : join(film, 'analysis');

  const scratch = mkdtempSync(join(tmpdir(), 'kte-build-ingest-'));
  try {
    writeFileSync(join(scratch, 'TEMP_README.md'),
      `owner: kte ingest\nshared: no\npurpose: stage song map and cache beat analysis\ncreated by: kte ingest on ${process.platform}\ndate: ${new Date().toISOString()}\nneeded until: this ingest exits\nexpensive to recreate: no\n`);
    const analysis = audioAnalysis(beatWorker, audio, config.start_bpm ?? 100, scratch);
    const earPath = join(out, 'ear-check.json');
    // Read the author-owned file after the slow analysis, immediately before publishing.
    const current = optionalFile(earPath);
    let saved: EarCheck[] = [];
    if (current !== undefined) {
      try {
        saved = readEarChecks(JSON.parse(current));
      } catch (error) {
        throw new Error(`${earPath}: ${error instanceof Error ? error.message : error}`);
      }
    }
    const {map, earChecks} = importSong({alignment, config, audio: relative(film, audio), analysis, earChecks: saved});
    const writes = [
      {name: 'song-map.json', contents: json(map)},
      {name: 'Ear check list.md', contents: formatEarCheckList(map, earChecks)},
    ];
    if (current === undefined || earChecks.length !== saved.length) {
      writes.unshift({name: 'ear-check.json', contents: json(earChecks)});
    }

    for (const {name, contents} of writes) writeFileSync(join(scratch, name), contents);
    mkdirSync(out, {recursive: true});
    if (statSync(out).dev !== statSync(scratch).dev) {
      throw new Error('Use --out on the same filesystem as the system temporary directory for atomic writes.');
    }
    if (optionalFile(earPath) !== current) throw new Error('ear-check.json changed during ingest. Re-run to use the latest edits.');
    for (const {name} of writes) renameSync(join(scratch, name), join(out, name));
    const open = earChecks.filter(entry => entry.status === 'open').length;
    console.log(`${map.lines.length} lines, ${map.tokens.length} tokens, ${analysis.beats.length} beats, ${open} open ear checks`);
    console.log(out);
  } finally {
    rmSync(scratch, {recursive: true, force: true});
  }
}
