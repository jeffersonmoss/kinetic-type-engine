import type {ReactNode} from 'react';
import {EngineScope, createEngineContext, withEngine} from '../../context';
import {cameraAt, toScreen} from '../../engine/camera';
import {FPS, PALETTE, WIDTH} from '../../engine/config';
import {SHORT_916, WIDE} from '../../engine/format';
import {layoutBoard} from '../../engine/layout';
import {SmearStage, smearSamplesAt} from '../../engine/smear';
import {TypeStage} from '../../engine/TypeStage';
import type {Board} from '../../engine/types';
import {validateBoard} from '../../engine/validate';
import {wordStateAt} from '../../engine/wordState';
import {pureTypeBoard, pureTypeConfig} from './pure-type';

type FormatName = 'wide' | 'portrait';
const frames = [12, 23, 34, 44];

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

// Step 7 supplies compileScore. Until then, use its planned frame-core path on independent, frozen board data.
function prepare(format: FormatName) {
  const portrait = format === 'portrait';
  const face = portrait ? 'serif' : 'anton';
  const family = portrait ? 'DM Serif Display' : 'Anton';
  const palette = portrait
    ? {...pureTypeConfig.palette, ground: '#372C18', paper: '#F0C687', accent: '#7DDADD', shadow: '#2C180B'}
    : {...pureTypeConfig.palette};
  const ctx = createEngineContext({
    ...pureTypeConfig, format: portrait ? SHORT_916 : WIDE, fps: portrait ? 24 : 30,
    beats: [{t: 0}, {t: 0.5}, {t: 1}],
    look: {palette},
    fonts: {[face]: {family, upper: true, style: portrait ? 'italic' : 'normal'}},
    defaultFont: face, fontMetrics: pureTypeConfig.metrics,
  });
  const data = structuredClone(pureTypeBoard);
  const board: Board = deepFreeze({
    ...data, bg: ctx.look.palette.ground,
    rigStart: {frame: {block: 0}, fill: 0.65},
    rig: [{t: 0.6, kind: 'step', frames: 10, to: {frame: {point: {x: 435, y: 380}}, zoom: 0.85}}],
    rules: [{id: 'scope rule', job: 'shelf', from: {x: 95, y: 220}, length: 300, angle: 0, t0: 0, until: 2}],
    panels: [{id: 'scope panel', kind: 'calendar', x: 90, y: 160, w: 130, h: 75}],
  });
  const layout = withEngine(ctx, () => {
    const target = {x: 435, y: 380};
    const center = toScreen(cameraAt(board, 44), target);
    const {x, y, width, height} = ctx.safeBox;
    if (Math.hypot(center.x - (x + width / 2), center.y - (y + height / 2)) > 1e-8) {
      throw new Error(`rig did not center its target inside the ${format} safe box`);
    }
    return layoutBoard(board);
  });
  return {ctx, board, layout};
}

type Fixture = ReturnType<typeof prepare>;
function stateAt({ctx, board, layout}: Fixture, frame: number) {
  return withEngine(ctx, () => ({
    frame, size: [ctx.format.width, ctx.format.height], beatFrames: ctx.beatFrames,
    cam: cameraAt(board, frame), lens: toScreen(cameraAt(board, frame), {x: 435, y: 380}),
    words: layout.order.map((i) => {
      const {font, size, w, h, x, y, text} = layout.words.get(i)!;
      return {font, size, w, h, x, y, text, state: wordStateAt(board, i, frame)};
    }),
  }));
}

export function soloContext(format: FormatName) {
  const fixture = prepare(format);
  return frames.map((frame) => stateAt(fixture, frame));
}

export function interleavedContexts() {
  const reports = [prepare('wide'), prepare('portrait'), prepare('wide')];
  if (reports[0].board === reports[2].board || reports[0].board.blocks[0] === reports[1].board.blocks[0]) {
    throw new Error('format builds shared a board or block object');
  }
  const samples = reports.map(() => [] as ReturnType<typeof stateAt>[]);
  for (const frame of frames) reports.forEach((fixture, i) => samples[i].push(stateAt(fixture, frame)));
  return samples;
}

export function checkScopes(renderToStaticMarkup: (node: ReactNode) => string) {
  const wide = prepare('wide');
  const portrait = prepare('portrait');
  const initial = {fps: FPS, width: WIDTH, palette: PALETTE};
  const stage = ({ctx, board}: Fixture, id: string) => (
    <EngineScope ctx={ctx}>
      <TypeStage boards={[board]} t={0.9} uid={id} />
      <SmearStage boards={[board]} t={0.73} uid={id + '-smear'} />
    </EngineScope>
  );
  const a = stage(wide, 'wide'), b = stage(portrait, 'portrait');
  const wideOnly = renderToStaticMarkup(a), portraitOnly = renderToStaticMarkup(b);
  if (renderToStaticMarkup(<>{a}{b}</>) !== wideOnly + portraitOnly) throw new Error('combined SSR differs from solo SSR');
  if (!wideOnly.includes('font-family="Anton"') || !portraitOnly.includes('font-family="DM Serif Display"')
    || !wideOnly.includes('fill="#F6EBCB"') || !portraitOnly.includes('fill="#F0C687"')
    || !wideOnly.includes('width="1280" height="720"') || !portraitOnly.includes('width="720" height="1280"')) {
    throw new Error('SSR fixtures did not exercise both fonts, palettes, and formats');
  }
  for (const {ctx, board} of [wide, portrait]) {
    if (withEngine(ctx, () => smearSamplesAt([board], 0.73 * ctx.fps)) <= 1) {
      throw new Error('SSR fixture missed the layered smear path');
    }
    if (!Object.isFrozen(ctx) || !Object.isFrozen(ctx.format.safeInsets) || !Object.isFrozen(ctx.look.palette)
      || !Object.isFrozen(ctx.fonts[Object.keys(ctx.fonts)[0]]) || !Object.isFrozen(ctx.fontMetrics.fonts)
      || !Object.isFrozen(ctx.limits.capTiers)) throw new Error('context data is mutable');
  }
  const marker = new Error('scope throw probe');
  withEngine(portrait.ctx, () => {
    try { withEngine(wide.ctx, () => { throw marker; }); } catch (error) { if (error !== marker) throw error; }
    if (Number(WIDTH) !== 720 || Number(FPS) !== 24) throw new Error('nested scope did not restore portrait');
  });
  let rejected = false;
  try { withEngine(portrait.ctx, () => Promise.resolve(1)); }
  catch (error) { rejected = error instanceof Error && error.message.includes('synchronous'); }
  if (!rejected || FPS !== initial.fps || WIDTH !== initial.width || PALETTE !== initial.palette) {
    throw new Error('scope did not reject async work or restore the legacy configuration');
  }
  console.log('127(a) combined TypeStage and SmearStage markup exactly matched solo formats; nested and async restoration passed.');
}

export function checkPortraitGiant() {
  const text = ['AXES', 'END'];
  const words = text.map((word, line) => ({text: word, start_s: 0.65 + 2 * line, end_s: 1.5 + 2 * line, line}));
  const ctx = createEngineContext({
    ...pureTypeConfig, format: SHORT_916, look: {palette: pureTypeConfig.palette}, fontMetrics: pureTypeConfig.metrics,
    words, lines: words.map((word, i) => ({...word, id: i, words: [i]})),
  });
  const {x, y, width, height} = ctx.safeBox;
  const board: Board = {
    id: 'portrait giant word', start: 0, end: 4, bg: ctx.look.palette.ground, exit: 'none',
    rigStart: {x: x + width / 2, y: y + height / 2, zoom: 1},
    blocks: words.map((_, i) => ({
      words: [i, i], attach: 'FREE', cap: i === 0 ? 220 : 105, rows: [1],
      anchor: {to: {point: {x: x + (i ? 70 : 20), y: y + 125 + 415 * i}}, align: 'tl', angle: i ? 12 : 0},
      emerge: {move: 'type', from: {point: {x: x + (i ? 70 : 20), y: y + 125 + 415 * i}}, params: {by: 'word'}},
    })),
  };
  withEngine(ctx, () => {
    const report = validateBoard(board);
    const giant = layoutBoard(board).words.get(0)!;
    const errors = report.violations.filter((v) => v.severity === 'error');
    if (errors.length || !report.lines[0]?.plan?.some((note) => note.includes('rests at the giant level'))) {
      throw new Error(`portrait giant failed: ${JSON.stringify({span: giant.w, errors, plans: report.lines.map((l) => l.plan)})}`);
    }
    const smaller = {...board, blocks: [{...board.blocks[0], cap: 195}, board.blocks[1]]};
    if (!validateBoard(smaller).violations.some((v) => v.rule === 'two-scales' && v.severity === 'error')) {
      throw new Error('the portrait giant rule accepted a sub-threshold cap');
    }
    console.log(`127(c) portrait giant passed at ${giant.h.toFixed(1)} px cap and ${giant.w.toFixed(1)} px wide (0 validator errors).`);
  });
}
