import {cascade, defineEffect, fade, matchCut, nest, stamp, type as typeOn, type Env, type Unit} from '../../effects';
import {edge, film, free, glyph, line, motif, opening, row, scene, stay, word, type Film} from '../../score';
import type {SongLine, SongMap, SongToken} from '../../song';

const testInk = defineEffect<{lag?: number}>({
  name: 'film:test-ink', kind: 'enter', source: 'none', duration: () => 8,
  params: {lag: {accepts: Number.isInteger, expected: 'an integer frame offset'}},
  pose: (_u, _unit, p, env) => ({opacity: Number(env.frame! >= env.start! + 8 + (p.lag ?? 0))}),
  ink: (_u: number, unit: Unit) => unit.box,
});
const earlyDim = defineEffect<{}>({
  name: 'film:early-dim', kind: 'accent', source: 'none', params: {}, duration: () => 18,
  pose: (_u: number, _unit: Unit, _p: object, env: Env) => ({opacity: env.frame! >= env.start! + 14 ? 0.45 : 1}),
  ink: (_u: number, unit: Unit) => unit.box,
});
const edgeCrossing = defineEffect<{}>({
  name: 'film:edge-crossing', kind: 'enter', source: 'edge', params: {}, duration: () => 12,
  pose(u, _unit, _params, env) {
    const distance = env.source!.y - env.blockCentre!.y;
    const move = Math.max(0, u - 0.18) / 0.82;
    return {dy: distance * (1 - move) ** 3, opacity: Math.min(1, 0.5 + u)};
  },
  ink: (_u, unit) => unit.box,
});
const cropCamera = defineEffect<{}>({
  name: 'film:crop-at-rest', kind: 'camera', source: 'none', params: {}, duration: () => 6,
  keys: (line, _params, {ctx}) => [{t: (line.start + 10) / ctx.fps, kind: 'dive', frames: 8,
    to: {frame: {block: line.block}, zoom: 1, screen: {x: ctx.safeBox.x + ctx.safeBox.width / 2,
      y: ctx.safeBox.y + ctx.safeBox.height - 5}}}],
});

type VocalSpec = readonly [text: string, onset: number, end: number, role?: 'lead' | 'adlib'];
export function fixtureSong(lines: readonly (readonly [id: string, tokens: readonly VocalSpec[]])[]): SongMap {
  const tokens: SongToken[] = [];
  const records: SongLine[] = [];
  for (const [lineId, specs] of lines) {
    const local = specs.map(([text, onset, end, role = 'lead'], i): SongToken => {
      const raw = {start_s: onset / 30, end_s: end / 30};
      const id = `${lineId}.token-${i + 1}`;
      return {...raw, raw, id, text, rawText: text, lineId, role, voice: role, source: [], memberIds: [id],
        repairs: [], reviewIds: [], reviewStatus: null};
    });
    tokens.push(...local);
    const text = local.map((token) => token.text).join(' ');
    records.push({id: lineId, sectionId: 'section-1', tokenIds: local.map((token) => token.id), text, rawText: text,
      start_s: local[0].start_s, end_s: Math.max(...local.map((token) => token.end_s)), start_beat: null});
  }
  return {schema: 2, song: 'Step 7 fixture', suno_id: null, audio: 'audio/Fixture.mp3', lines: records, tokens, sections: [],
    analysis: {status: 'unavailable', reason: 'controlled timing fixture', beats: [], duration_s: null, tempo_bpm: null, downbeat_phase: null}};
}

export const edgeMap = fixtureSong([['edge.1', [['ENTER', 50, 61]]]]);
export const edgeEdits = [{start: 0, end: 62 / 30}];
export const edgeScore = (clipped: boolean): Film => film({scenes: [scene('edge', {lines: [
  line('edge.1', {from: edge('B'), enter: edgeCrossing(), camera: clipped ? cropCamera() : undefined}),
]})]});

export const heldMap = fixtureSong([['line-1', [['CALL', 40, 48], ['REPLY', 49, 56, 'adlib']]]]);
export const heldScore = (lag = 1, dim = false) => film({scenes: [scene('line', {lines: [
  line('line-1', {enter: testInk({lag}), accents: dim ? [earlyDim()] : [],
    reply: {from: row('line-1', 1), enter: testInk()}}),
]})]});

export const nestMap = fixtureSong([['h1.1', [['FOUR', 40, 50], ['ROOM', 57, 61, 'adlib'], ['FOR', 64, 68, 'adlib'], ['ONE', 71, 81, 'adlib']]]]);
export const nestScore = film({scenes: [scene('hook', {lines: [
  line('h1.1', {rows: [{text: 'FOUR', size: 'hero'}], enter: stamp({frames: 12}),
    reply: {rows: ['ROOM FOR ONE'], from: glyph('h1.1', 'FOUR', 'O', {part: 'counter'}), place: 'inside', enter: nest()}}),
]})]});

export const crossMap = fixtureSong([
  ['h1.1', [['TWO', 23, 33], ['ONE', 37, 47, 'adlib'], ['ONE', 51, 60, 'adlib']]],
  ['v1.1', [['FORTY-ONE', 76, 89]]],
]);
export const crossScore = (nth?: number) => {
  const m = motif('h', {lines: {1: line('h.1', {from: opening(), enter: cascade(typeOn({gap: 1}), {by: 'word', clock: 'sung'}),
    reply: {from: row('h.1', 1), enter: cascade(testInk(), {by: 'word', clock: 'sung'})}, portrait: {reply: {from: word('h.1', 'TWO'), enter: cascade(testInk(), {by: 'word', clock: 'sung'})}}})}}, {occurrences: {}});
  return film({scenes: [
    scene('h1', {lines: m.occurrence(1), exit: fade()}),
    scene('v1', {lines: [line('v1.1', {from: word('h1.1.reply', 'ONE', {nth}), enter: matchCut({keep: 'ONE', pin: 'screen', frames: 10}),
      place: 'left', size: 'second', portrait: {rows: ['FORTY-', 'ONE']}})]}),
  ]});
};

export const badSourceMap = fixtureSong([
  ['first', [['CALL', 25, 36]]], ['second', [['EARLY', 44, 51]]],
]);
export const badSourceScore = film({scenes: [scene('test', {lines: [
  line('first', {from: free({x: 0, y: 0}, 'stationary opening for test'), enter: testInk(), accents: [earlyDim()]}),
  line('second', {from: word('first', 'CALL'), enter: stamp({frames: 12}), old: stay()}),
]})]});
