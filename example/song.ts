// The example's song set-up: a made-up five-line lyric with hand-set word times (no audio), a beat every half second, a
// palette of its own and the three fonts measured in fonts/anton-dmserif-barlow.metrics.json. Imported first by
// boards.ts, so the engine is configured before any board is laid out.
import {configureEngine, type FontMetricsFile, type SongLine, type SongWord} from '../engine';
import metrics from '../fonts/anton-dmserif-barlow.metrics.json';

export const FPS = 30;
export const DURATION_S = 49;

/** Colours of the example (night blue ground, warm paper type, a red and a yellow). */
export const NIGHT = '#101A2C';
export const SLATE = '#25324A';
export const CREAM = '#F5EBD7';
export const RED = '#E04A35';
export const LEAF = '#3FB27F';
export const YELLOW = '#F2C14E';

/** The lyric: [word, start second] per line; a word ends when the next one starts, a line's last word 0.6 s after its start. */
const LYRIC: [string, number][][] = [
  [['Lights', 0.7], ['come', 1.2], ['on', 1.6]],
  [['the', 2.8], ['whole', 3.15], ['street', 3.55], ['turns', 4.0]],
  [['stack', 5.2], ['every', 5.65], ['crate', 6.1]],
  [['sign', 7.6], ['the', 8.05], ['page', 8.4]],
  [['set', 10.2], ['the', 10.6], ['stage', 11.0]],
  // phase 2, group 1 (second and third boards): FAN, DRAWER, the slideUp carry
  [['turn', 14.6], ['the', 15.0], ['corner', 15.3]],
  [['and', 16.4], ['fan', 16.7], ['out', 17.1]],
  [['out', 18.2], ['of', 18.55], ['the', 18.75], ['drawer', 19.0]],
  [['slide', 21.7], ['up', 22.1]],
  // group 1, second part: BEHIND, RUN, QUARTER, the quarterCW carry
  [['hide', 23.5], ['behind', 23.85], ['it', 24.3]],
  [['run', 25.9], ['along', 26.25], ['the', 26.6], ['whole', 26.85], ['row', 27.25]],
  [['turn', 28.4], ['right', 28.8]],
  [['all', 31.5], ['the', 31.8], ['way', 32.0], ['round', 32.3]],
  // group 2 (fifth board, sheetRules): slideFrom, rise, carry-out, a keep-clear prop
  [['slide', 35.0], ['in', 35.4], ['from', 35.7], ['the', 35.95], ['right', 36.2]],
  [['rise', 38.2], ['and', 38.6], ['shine', 38.9]],
  // group 3 (sixth board): cameraFollow (a CRANE), grow, station(), tumble, turnBack, sinkBehind, slideAlong
  [['follow', 41.6], ['the', 42.0], ['long', 42.3], ['line', 42.7], ['home', 43.1]],
  [['tumble', 44.6], ['turn', 45.0], ['sink', 45.4], ['slide', 45.8]],
];

const words: SongWord[] = [];
const lines: SongLine[] = [];
LYRIC.forEach((ws, line) => {
  const ix = ws.map(([text, t], k) => words.push({text, start_s: t, end_s: k + 1 < ws.length ? ws[k + 1][1] : t + 0.6, line}) - 1);
  lines.push({id: line, text: ws.map(([x]) => x).join(' '), start_s: ws[0][1], end_s: words[ix[ix.length - 1]].end_s, words: ix});
});

configureEngine({
  fps: FPS, width: 1280, height: 720,
  words, lines,
  beats: Array.from({length: DURATION_S * 2}, (_, k) => ({t: k * 0.5})),
  palette: {ground: NIGHT, shadow: SLATE, paper: CREAM, accent: RED, accent2: LEAF, highlight: YELLOW},
  fonts: {
    anton: {family: 'Anton, Impact, sans-serif', style: 'normal', weight: 400, upper: true, connectives: 'barlow'},
    serif: {family: '"DM Serif Display", Georgia, serif', style: 'italic', weight: 400},
    barlow: {family: '"Barlow Condensed", "Arial Narrow", sans-serif', style: 'normal', weight: 700, upper: true},
  },
  defaultFont: 'anton',
  metrics: metrics as unknown as FontMetricsFile,
});
