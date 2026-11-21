import {spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {homedir, tmpdir} from 'node:os';
import {dirname, join, relative, resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {formatEarCheckList, importSong, parseCmuDictionary} from '../song/index';
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

function experimentPythons(experiments: string) {
  try {
    return readdirSync(experiments, {withFileTypes: true}).filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .map(({name}) => join(experiments, name, '.venv', 'bin', 'python'))
      .filter((path) => statSync(path, {throwIfNoEntry: false})?.isFile())
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

// Locate data from the selected interpreter without importing packages that might fetch corpora.
const pythonProbe = `
import importlib.util, json, pathlib, sys
import librosa
spec = importlib.util.find_spec("cmudict")
data = pathlib.Path(spec.origin).parent / "data" / "cmudict.dict" if spec and spec.origin else None
print(json.dumps({"executable": sys.executable, "dictionary": str(data) if data and data.is_file() else None}))
`;

function pronunciations(worker: string, pythonDictionary?: string | null) {
  const root = dirname(dirname(worker));
  const paths = ['song/cmudict.dict', 'song/cmudict-0.7b', 'cmudict.dict', 'cmudict-0.7b',
    'node_modules/cmudict/lib/cmudict.0.7a'].map(path => join(root, path));
  if (pythonDictionary) paths.push(pythonDictionary);
  for (const path of paths) {
    const source = optionalFile(path);
    if (source === undefined) continue;
    const dictionary = parseCmuDictionary(source);
    if (dictionary.size) return dictionary;
  }
  return undefined;
}

function audioAnalysis(worker: string, audio: string, bpm: number, scratch: string): {
  analysis: BeatAnalysis; dictionary?: string | null;
} {
  const experiments = join(homedir(), 'Experiments');
  const candidates = [...new Set([process.env.KTE_PYTHON, 'python3', ...experimentPythons(experiments)].filter((item): item is string => !!item))];
  const env = {...process.env, PYTHONDONTWRITEBYTECODE: '1', NUMBA_CACHE_DIR: join(scratch, 'Numba cache')};
  let python: string | undefined;
  let probeData: {executable: string; dictionary: string | null} | undefined;
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['-c', pythonProbe],
      {encoding: 'utf8', timeout: 15_000, env});
    if (!probe.error && probe.status === 0) {
      python = candidate;
      probeData = JSON.parse(probe.stdout.trim().split('\n').at(-1)!);
      break;
    }
  }
  if (!python) {
    const reason = `librosa beat analysis unavailable. Tried ${candidates.join(', ')}.`;
    console.warn(reason);
    return {analysis: {status: 'unavailable', reason, beats: [], duration_s: null, tempo_bpm: null, downbeat_phase: null}};
  }
  console.log(`librosa Python: ${probeData?.executable || python}`);
  const result = spawnSync(python, [worker, audio, String(bpm)], {
    encoding: 'utf8', timeout: 180_000, maxBuffer: 4 * 1024 * 1024, env,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`Beat analysis failed: ${result.error?.message || result.stderr.trim() || result.signal || result.status}`);
  }
  return {analysis: JSON.parse(result.stdout) as BeatAnalysis, dictionary: probeData?.dictionary};
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
    const {analysis, dictionary} = audioAnalysis(beatWorker, audio, config.start_bpm ?? 100, scratch);
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
    const {map, earChecks} = importSong({alignment, config, audio: relative(film, audio), analysis, earChecks: saved,
      pronunciations: pronunciations(beatWorker, dictionary)});
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
