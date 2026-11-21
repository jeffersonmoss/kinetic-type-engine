import {withEngine} from '../context';
import {validateBoards, type BoardReport} from '../engine/validate';
import type {CompiledFilm, Diagnostic} from '../compile';
import type {EarCheck, SongMap} from '../song';

export function checkFilm(film: CompiledFilm, map: SongMap, earChecks: readonly EarCheck[] = []) {
  const board = withEngine(film.ctx, () => validateBoards([...film.boards]));
  const identities = new Map(film.readings.flatMap((reading) => reading.words.map((word) => [word, reading] as const)));
  const diagnostics: Diagnostic[] = [...film.diagnostics];
  for (const report of board as BoardReport[]) {
    for (const problem of report.violations) {
      const reading = problem.word === undefined ? undefined : identities.get(problem.word);
      diagnostics.push({severity: problem.severity, code: problem.rule, line: reading?.line,
        token: reading?.token, frame: problem.from, message: `${report.board}: ${problem.detail}`});
    }
  }
  const tokens = new Map(map.tokens.map((token) => [token.id, token]));
  const open = new Set(earChecks.filter(({status}) => status === 'open').map(({id}) => id));
  const sync = film.readings.map(({token, text, line, onset, vocalEnd, interval, landing, preset}) => {
    const fromMap = tokens.get(token);
    const openEarChecks = fromMap?.reviewIds.filter((id) => open.has(id) || (!earChecks.length && fromMap.reviewStatus === 'open')) ?? [];
    return {token, text, line, onset, vocalEnd, startOfProtectedReading: interval?.start, endOfProtectedReading: interval?.end,
      landing, preset, openEarChecks};
  });
  return {diagnostics, sync, openEarChecks: new Set(sync.flatMap(({openEarChecks}) => openEarChecks)).size};
}
