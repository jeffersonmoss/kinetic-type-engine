// The song set-up of the Sweet Distillation features fixture (KIT.md section 20): a made-up lyric with hand-set word
// times (no audio), a beat every 0.5 s, and the three fonts measured in fonts/anton-dmserif-barlow.metrics.json. The
// film's own faces (Alfa Slab One, Shrikhand, Barlow Condensed, Space Mono) have no metrics file yet, so this fixture
// proves the features in Anton, DM Serif Display italic (mixed case, standing in for Shrikhand) and Barlow Condensed
// (upper case). DM Serif Display has a kern between n and the full stop (0.006 em), which `hang` moves onto the stop
// in STATION. and SELF-EDUCATION., the hardest case for the pinned suffix.
import {configureEngine, type FontMetricsFile, type SongLine, type SongWord} from '../../engine';
import metrics from '../../fonts/anton-dmserif-barlow.metrics.json';

export const FPS = 30;
export const DURATION_S = 44;
export const DUSK = '#4A1D96';
export const INK = '#1E0F3F';
export const SUN = '#FFC72C';
export const CREAM = '#FFF3D9';
export const BRICK = '#B92B12';
export const POOL = '#007A78';

/** The lyric: [word, start second] per line; a word ends when the next one starts, a line's last word 0.6 s after. */
const LYRIC: [string, number][][] = [
  // the hub (K7): each word is the morph of the one before, the "ation" pinned
  [['Distillation!', 1.0]],
  [['nation', 2.5]],
  [['vacation', 4.0]],
  [['distillation', 5.5]],
  [['station.', 7.0]],
  [['self-education.', 8.5]],
  [['distillation', 10.0]],
  [['imitation', 11.5]],
  // the critic (K1): a Paren Pair round his line
  [['(is', 14.0], ['it', 14.35], ['different?)', 14.7]],
  // the picture word (K2)
  [['big', 18.0], ['top', 18.35], ['rocka', 18.7], ['book', 19.2]],
  // the clearing disc (K4): KEEP stays, the rest is retired by the disc's edge
  [['clear', 22.0], ['the', 22.35], ['ground', 22.6]],
  [['keep', 23.4], ['this', 23.8]],
  // the last scene (K1 slide off, re-enter, carry)
  [['(not', 27.0], ['the', 27.35], ['same)', 27.6]],
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
  palette: {ground: INK, shadow: INK, paper: CREAM, accent: BRICK, accent2: POOL, highlight: SUN, light: [SUN, CREAM]},
  fonts: {
    anton: {family: 'Anton, Impact, sans-serif', style: 'normal', weight: 400, upper: true, connectives: 'barlow'},
    serif: {family: '"DM Serif Display", Georgia, serif', style: 'italic', weight: 400},
    barlow: {family: '"Barlow Condensed", "Arial Narrow", sans-serif', style: 'normal', weight: 700, upper: true},
  },
  defaultFont: 'anton',
  metrics: metrics as unknown as FontMetricsFile,
  figureLook: 'pictogram',
});
