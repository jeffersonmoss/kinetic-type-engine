import {existsSync, readFileSync, statSync} from 'node:fs';
import {join, resolve} from 'node:path';
import type {CompiledFilm, CompileOptions} from '../compile';
import type {checkFilm} from '../check';
import type {Edit, Format} from '../score';
import {timeScansion, type SongMap} from '../song';
import {readConfig, readEarChecks, readScansion} from './inputs';
import {bundleSource, evaluate, type Runtime} from './runtime';

export interface Manifest {
  engine: 'dev'; title: string; sunoClip?: string | null; audio: string;
  formats: Format[]; edits: Edit[]; allowShadow?: boolean;
  sections?: Record<string, {songSection: string; score: string}>;
}
export const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
export function readJson<T>(path: string): T {
  try {return JSON.parse(readFileSync(path, 'utf8')) as T;}
  catch (error) {throw new Error(`${path}: ${(error as Error).message}`);}
}
export const formats: readonly Format[] = ['wide', 'portrait'];

export function readFilm(folder: string, format?: string) {
  const path = resolve(folder);
  const manifest = readJson<Manifest>(join(path, 'film.json'));
  if (manifest.engine !== 'dev') throw new Error(`Step 7 requires engine pin dev, found "${manifest.engine}"`);
  if (!Array.isArray(manifest.formats) || !manifest.formats.length || manifest.formats.some((id) => !formats.includes(id))) {
    throw new Error('film.json formats must include wide or portrait');
  }
  if (new Set(manifest.formats).size !== manifest.formats.length) throw new Error('film.json formats contain duplicates');
  if (format && !manifest.formats.includes(format as Format)) throw new Error(`Film does not enable format "${format}"`);
  if (!Array.isArray(manifest.edits) || !manifest.edits.length) throw new Error('film.json needs a nonempty edit list');
  if (typeof manifest.audio !== 'string') throw new Error('film.json needs an audio path');
  const audio = resolve(path, manifest.audio);
  const score = join(path, 'score', 'index.ts');
  if (!statSync(score, {throwIfNoEntry: false})?.isFile()) throw new Error(`The score is missing: ${score}`);
  const mapPath = join(path, 'analysis', 'song-map.json');
  const scansionPath = join(path, 'analysis', 'scansion.json');
  const imported = readJson<SongMap>(mapPath);
  const map = existsSync(scansionPath) ? timeScansion(imported, readScansion(readJson(scansionPath))) : imported;
  const earPath = join(path, 'analysis', 'ear-check.json');
  const earChecks = existsSync(earPath) ? readEarChecks(readJson(earPath)) : [];
  const config = readConfig(readJson(join(path, 'song.json')));
  const options: CompileOptions = {draft: true, edits: manifest.edits, allowShadow: manifest.allowShadow, display: config.display};
  return {path, score, manifest, map, audio, options, formats: format ? [format as Format] : manifest.formats, earChecks};
}

export type FilmFolder = ReturnType<typeof readFilm>;
export const prelude = (folder: FilmFolder) => `
import score from ${JSON.stringify(folder.score)};
const map = ${JSON.stringify(folder.map)};
const formats = ${JSON.stringify(folder.formats)};
const options = ${JSON.stringify(folder.options)};
`;
export async function compileFolder(runtime: Runtime, folder: FilmFolder, check = false) {
  const source = `${prelude(folder)}
import {compileScore, scoreContext} from 'kte/compile';
${check ? "import {checkFilm} from 'kte/check';" : ''}
export const films = formats.map(format => {
  const film = compileScore(scoreContext(format, score.look), score, map, options);
  return {film${check ? `, result: checkFilm(film, map, ${JSON.stringify(folder.earChecks)})` : ''}};
});
`;
  const bundle = await bundleSource(source, runtime.root);
  return evaluate<{films: {film: CompiledFilm; result?: ReturnType<typeof checkFilm>}[]}>(bundle!, runtime.root, 'Film check.cjs').films;
}
