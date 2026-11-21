import {configureEngine, FPS} from '../../engine/config';
import {validateBoard} from '../../engine/validate';
import {extendVerb, getVerb, registerVerb} from '../../engine/verbRegistry';
import {wordStateAt} from '../../engine/wordState';
import type {Board} from '../../engine/types';
import {pureTypeBoard, pureTypeConfig} from './pure-type';

export function checkFrameCore() {
  configureEngine(pureTypeConfig);
  for (const run of [0, 60]) {
    const board: Board = {
      ...pureTypeBoard,
      blocks: [{
        ...pureTypeBoard.blocks[0],
        emerge: {move: 'stack', from: {point: {x: 100, y: 260}}, params: {dir: 'left', run}},
      }],
    };
    const landing = pureTypeConfig.words[0].start_s * FPS;
    const early = wordStateAt(board, 0, landing - 4);
    const later = wordStateAt(board, 0, landing - 2);
    if (!(early.dx > later.dx && later.dx > 0 && early.dy === 0 && later.dy === 0)) {
      throw new Error(`stack (run=${run}): expected leftward motion, got ${JSON.stringify({early, later})}`);
    }
    console.log(`126.1 stack (run=${run}): dx ${early.dx.toFixed(2)} to ${later.dx.toFixed(2)} px, dy 0 px.`);
  }

  const seam = getVerb('seam');
  if (!seam) throw new Error('seam was not registered by the engine');
  let duplicate: unknown;
  try { registerVerb('seam', {}); } catch (error) { duplicate = error; }
  if (!(duplicate instanceof Error && duplicate.message.includes('seam')) || getVerb('seam') !== seam) {
    throw new Error('duplicate seam registration did not fail without replacing the existing definition');
  }
  registerVerb('frame-core-test', {early: true});
  extendVerb('frame-core-test', {gradual: true});
  const extended = getVerb('frame-core-test');
  if (!extended?.early || !extended.gradual) throw new Error('extendVerb did not merge existing and new hooks');
  console.log('126.2 duplicate seam rejected; extendVerb retained existing hooks.');

  const badHandoff = validateBoard({...pureTypeBoard, handoff: {start: 'constructor', end: 'missing'},
    waive: [{rule: 'handoff-unknown', why: 'test whether unknown IDs fail'}]});
  const unknown = badHandoff.violations.filter((v) => v.rule === 'handoff-unknown' && v.severity === 'error');
  if (unknown.length !== 2 || !unknown.some((v) => v.detail.includes('constructor')) || !unknown.some((v) => v.detail.includes('missing'))) {
    throw new Error('unknown start and end handoff IDs must fail validation');
  }
  if (validateBoard({...pureTypeBoard, handoff: {end: 'open'}}).violations.some((v) => v.rule === 'handoff-unknown')) {
    throw new Error('the reserved open end handoff should pass');
  }
  console.log('126.4 unknown start and end handoffs rejected; open end accepted.');
}
