import {existsSync, mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import type {InspectionFrame} from '../compile';
import type {Format} from '../score';
import {compileFolder, json, readFilm, readJson} from './film';
import type {Runtime} from './runtime';

export interface Verdict extends InspectionFrame {verdict: 'open' | 'pass' | 'fail'; note: string}
export const inspectionPath = (folder: string, format: Format) => join(folder, 'reviews', format, 'Frames to inspect.json');
export function priorVerdicts(folder: string): Verdict[] {
  const path = join(folder, 'reviews', 'Inspection.json');
  if (!existsSync(path)) return [];
  const entries = readJson<Verdict[]>(path);
  if (!Array.isArray(entries) || entries.some((row) => !['wide', 'portrait'].includes(row.format) || !Number.isSafeInteger(row.frame) ||
    typeof row.reason !== 'string' || typeof row.note !== 'string' || !['open', 'pass', 'fail'].includes(row.verdict))) {
    throw new Error(`Invalid inspection verdicts: ${path}`);
  }
  return entries;
}

export function updateVerdicts(folder: string, format: Format, samples: readonly InspectionFrame[]) {
  const current = priorVerdicts(folder);
  const byFrame = new Map(current.filter((row) => row.format === format).map((row) => [row.frame, row]));
  const next = samples.map((sample): Verdict => {
    const found = byFrame.get(sample.frame);
    return found?.reason === sample.reason ? found : {...sample, verdict: 'open', note: ''};
  });
  writeFileSync(join(folder, 'reviews', 'Inspection.json'), json([...current.filter((row) => row.format !== format), ...next]));
}

export async function checkCommand(folder: string, format: string | undefined, runtime: Runtime) {
  const input = readFilm(folder, format);
  const previous = priorVerdicts(input.path);
  const entries = await compileFolder(runtime, input, true);
  for (const {film, result} of entries) {
    const report = result!;
    for (const {frame, reason} of previous.filter((row) => row.format === film.format && row.verdict === 'fail')) {
      report.diagnostics.push({severity: 'error', code: 'inspection-fail', frame, message: reason});
    }
    const output = join(input.path, 'reviews', film.format);
    mkdirSync(output, {recursive: true});
    writeFileSync(inspectionPath(input.path, film.format), json(film.inspection));
    writeFileSync(join(output, 'Check.json'), json({format: film.format, ...report, emphasisWords: film.emphasisWords,
      rawBoards: film.rawBoards, boards: film.boards.length}));
    for (const entry of report.diagnostics) {
      const where = [entry.line, entry.token, entry.frame === undefined ? undefined : `frame ${entry.frame}`].filter(Boolean).join(' / ');
      console.log(`${entry.severity} [${entry.code}]${where ? ` ${where}:` : ''} ${entry.message}`);
    }
    const errors = report.diagnostics.filter(({severity}) => severity === 'error').length;
    const warnings = report.diagnostics.filter(({severity}) => severity === 'warn').length;
    console.log(`${film.format}: ${film.readings.length} sung tokens, ${film.emphasisWords} emphasis-font words, ${film.rawBoards}/${film.boards.length} raw boards; ${errors} errors, ${warnings} warnings, ${report.openEarChecks} open ear checks`);
    console.log(`${film.inspection.length} frames to inspect in ${output}`);
    if (errors) process.exitCode = 1;
  }
}
