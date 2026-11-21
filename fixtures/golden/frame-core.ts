import {configureEngine, FPS} from '../../engine/config';
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
}
