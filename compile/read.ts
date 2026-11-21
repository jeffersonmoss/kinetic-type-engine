import type {EngineContext} from '../context';
import {layoutBoard} from '../engine/layout';
import {crossesFrame, insideSafe, readingSampler} from '../engine/reading';
import {boardActive} from '../engine/wordState';
import type {Board} from '../engine/types';
import type {Format} from '../score';
import {isPair, isUnit, type Diagnostic, type Run} from './bind';
import type {BlockWork} from './entrance';
import type {InspectionFrame, TokenReading, Transition} from './types';

export function readBoard(ctx: EngineContext, board: Board, blocks: readonly BlockWork[]) {
  const sampler = readingSampler(board, ctx.limits.sungMinCap);
  const readings: TokenReading[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const work of blocks) {
    const groups = new Map<string, Run[]>();
    for (const run of work.item.runs) {
      const id = run.vocal?.token.id;
      if (!id) continue;
      const group = groups.get(id) ?? [];
      group.push(run);
      groups.set(id, group);
    }
    for (const [token, runs] of groups) {
      const {onset, end: vocalEnd, preset, token: {text}} = runs[0].vocal!;
      const words = runs.map(({i}) => i);
      const landing = Math.max(...words.map((i) => work.landingByWord.get(i) ?? work.landing));
      const start = Math.max(0, Math.ceil(board.start * ctx.fps - 1e-6), Math.min(work.start, onset - 6));
      const end = Math.max(onset + 3, landing, vocalEnd);
      const issue = (f: number) => words.map((word) => sampler.issue(word, f)).find(Boolean);
      let first: number | undefined;
      for (let frame = start; frame <= end; frame++) {
        if (!issue(frame)) {first = frame; break;}
      }
      const S = preset && first !== undefined && first <= onset - 6 ? onset - 6 : first;
      const interval = S === undefined ? undefined : {start: S, end: Math.max(vocalEnd, S + 14)};
      readings.push({token, line: work.item.id, text, board: board.id!, words, onset, vocalEnd, preset, landing, interval});
      const report = (code: string, frame: number, message: string) => diagnostics.push({
        severity: 'error', code, line: work.item.id, token, frame, message: `"${text}" ${message}`,
      });
      if (S === undefined || S < onset - 6 || S > onset + 2) {
        const problem = issue(onset + 2);
        report(problem?.rule ?? 'first-readable', S ?? onset + 2, S === undefined
          ? `missed reading deadline at frame ${onset + 2}${problem ? `: ${problem.detail}` : ''}`
          : `start of protected reading ${S} is outside [${onset - 6}, ${onset + 2}]${problem ? `: ${problem.detail}` : ''}`);
      }
      if (landing > onset + 8) report('landing', landing, `lands after the deadline at frame ${onset + 8}`);
      if (interval) {
        for (let f = interval.start; f <= interval.end; f++) {
          const result = issue(f);
          if (result) {report(result.rule, f, result.detail); break;}
        }
      }
    }
  }
  return {readings, diagnostics, sampler};
}

export function checkSource(ctx: EngineContext, work: BlockWork, board: Board, diagnostics: Diagnostic[]) {
  const {source, item} = work;
  if (!source.origin || !source.runs?.length) return;
  const call = item.card.enter;
  if (isUnit(call) && call.def.source !== 'landmark') return;
  const cross = source.origin.board !== work.board;
  const sampler = readingSampler(board, ctx.limits.sungMinCap);
  const anchor = source.anchor;
  const refs = isPair(call) && work.kept?.length ? work.kept
    : 'word' in anchor && typeof anchor.letter === 'number' ? [{word: anchor.word, index: anchor.letter}] : undefined;
  const last = isPair(call) ? work.release - 1 : work.release;
  const first = cross ? last : Math.max(work.start, Math.ceil(board.start * ctx.fps - 1e-6));
  const words = refs ? [...new Set(refs.map(({word}) => word))] : source.runs.map(({i}) => i);
  for (let frame = first; frame <= last; frame++) {
    const checks = words.map((word) => sampler.glyphs(word, frame)
      .filter(({index}) => !refs || refs.some((ref) => ref.word === word && ref.index === index))
      .every((part) => part.opacity >= 0.5 - 1e-9 && insideSafe(part)));
    const visible = boardActive(board, frame) && (item.card.from.kind === 'row' && !refs ? checks.some(Boolean) : checks.every(Boolean));
    if (visible) continue;
    const carrier = source.runs.find((run) => run.vocal && words.includes(run.i))?.vocal?.token;
    diagnostics.push({severity: 'error', code: 'source-visibility', line: item.id, token: carrier?.id, frame,
      message: `source ${source.origin.item.id}${carrier ? ` "${carrier.text}"` : ''} loses visibility before release at frame ${work.release}`});
    break;
  }
}

export function inspect(ctx: EngineContext, format: Format, duration: number, boards: Map<string, Board>,
  blocks: readonly BlockWork[], readings: readonly TokenReading[], transitions: readonly Transition[], diagnostics: readonly Diagnostic[]) {
  const reasons = new Map<number, Set<string>>();
  const mark = (frame: number, reason: string) => {
    if (frame < 0 || frame >= duration) return;
    if (!reasons.has(frame)) reasons.set(frame, new Set());
    reasons.get(frame)!.add(reason);
  };
  for (const reading of readings) {
    const label = `${reading.line} ${reading.text}`;
    if (reading.interval) mark(reading.interval.start, `${label} · start of protected reading`);
    else mark(reading.onset + 2, `${label} · missed reading deadline`);
    mark(reading.landing, `${label} · landing`);
  }
  for (const transition of transitions) {
    const {line, board, start, landing, release, cut, handoff, edge} = transition;
    if (cut) {
      for (const offset of [-1, 0, 1]) mark(start + offset, `${board} · ${handoff ? 'screen handoff' : 'scene cut'} ${offset === -1 ? 'before' : offset === 1 ? 'after' : 'at'}`);
      continue;
    }
    mark(Math.floor((start + landing) / 2), `${line} · transition midpoint`);
    if (handoff) for (const offset of [-1, 0, 1]) mark(release + offset, `${line} · kept glyph transfer`);
    if (!edge) continue;
    const work = blocks.find((work) => work.item.id === line)!;
    const picture = boards.get(board)!;
    const runs = work.item.runs.map(({i}) => i);
    const first = Math.min(...readings.filter((reading) => reading.line === line).map((reading) => reading.interval?.start ?? reading.onset + 2));
    const sampler = readingSampler(picture, ctx.limits.sungMinCap);
    const pre = Math.min(first - 1, landing - 1);
    let sample: number | undefined;
    for (let f = Math.max(0, start); f <= pre; f++) {
      if (runs.some((word) => sampler.glyphs(word, f).some((glyph) => glyph.opacity > 0.05 && crossesFrame(glyph)))) sample = f;
    }
    if (sample !== undefined) mark(sample, `${line} · pre-S frame-edge crossing`);
    else if (pre >= start) mark(pre, `${line} · pre-S edge entrance`);
  }
  for (const diagnostic of diagnostics) {
    if (diagnostic.severity === 'error' && diagnostic.frame !== undefined && diagnostic.token) {
      mark(diagnostic.frame, `${diagnostic.line ?? diagnostic.token} · ${diagnostic.code} inspection`);
    }
  }
  return [...reasons.entries()].sort(([a], [b]) => a - b)
    .map(([frame, entries]): InspectionFrame => ({format, frame, reason: [...entries].join('; ')}));
}
