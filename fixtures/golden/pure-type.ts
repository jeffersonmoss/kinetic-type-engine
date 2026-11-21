import type {EngineConfig} from '../../engine/config';
import type {Board} from '../../engine/types';
import metrics from '../../fonts/anton-dmserif-barlow.metrics.json';

export const pureTypeConfig: EngineConfig = {
  words: [
    {text: 'TYPE', start_s: 0.2, end_s: 0.8, line: 0},
    {text: 'MOVES', start_s: 0.8, end_s: 1.5, line: 0},
  ],
  lines: [{id: 0, text: 'TYPE MOVES', start_s: 0.2, end_s: 1.5, words: [0, 1]}],
  palette: {ground: '#182132', paper: '#F6EBCB', shadow: '#303A50', accent: '#D45C4A', accent2: '#70AE99', highlight: '#F4BC48'},
  fonts: {anton: {family: 'Anton, Impact, sans-serif', upper: true}},
  metrics: metrics as EngineConfig['metrics'],
};

export const pureTypeBoard: Board = {
  id: 'pure type', start: 0, end: 2, bg: pureTypeConfig.palette.ground, exit: 'none',
  blocks: [{
    words: [0, 1], attach: 'FREE', cap: 130, rows: [2],
    anchor: {to: {point: {x: 100, y: 260}}, align: 'tl'},
    style: {0: {plate: {fill: '#394B64'}}},
  }],
};
