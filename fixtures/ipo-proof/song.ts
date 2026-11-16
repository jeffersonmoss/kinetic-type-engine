// The fixture's song set-up: the first video's alignment (songmap.json), palette, fonts, font metrics, word rules and
// the one handoff its proof starts on. Imported first by boards.ts, so the engine is configured before any board.
import {configureEngine, type FontMetricsFile} from '../../engine';
import metrics from '../../fonts/anton-dmserif-barlow.metrics.json';
import map from './songmap.json';
import {GOLD, INK, INK2, MINT, PAPER, TEAL, VERMILION} from './palette';

export const FPS = 30;
export const DURATION_FRAMES = Math.ceil(map.duration_s * FPS);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
// The first video's emphasis rules: names and number words are E2, every "baby" is "Baby", DM Serif italic, Paper, E2.
const NAMES = new Set(['goldman', 'sam', 'altman', 'elon', 'trump', 'hegseth', 'pete', 'amazon', 'google', 'india', 'dc', 'ant', 'opus', 'dario']);
const NUMBERS = /^(\d.*|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|trillion|ninety-some|fifty-one|trillion-dollar)$/;

configureEngine({
  fps: FPS, width: 1280, height: 720,
  words: map.words, lines: map.lines, beats: map.beats, energy: map.energy_10hz,
  palette: {ground: INK, shadow: INK2, paper: PAPER, accent: VERMILION, accent2: MINT, highlight: GOLD, light: [PAPER, GOLD, TEAL, VERMILION]},
  fonts: {
    anton: {family: 'Anton, Impact, sans-serif', style: 'normal', weight: 400, upper: true, connectives: 'barlow'},
    serif: {family: '"DM Serif Display", Georgia, serif', style: 'italic', weight: 400},
    barlow: {family: '"Barlow Condensed", "Arial Narrow", sans-serif', style: 'normal', weight: 700},
  },
  defaultFont: 'anton',
  metrics: metrics as unknown as FontMetricsFile,
  wordRules: {
    emphasis: (i) => { const t = map.words[i].text; return NAMES.has(norm(t)) || NUMBERS.test(t.toLowerCase().replace(/[^a-z0-9-]/g, '')); },
    rule: (i) => norm(map.words[i].text) === 'baby'
      ? {tier: 2, opts: {font: 'serif', colour: PAPER, text: map.words[i].text.replace(/["“”]/g, '').replace(/baby/i, 'Baby')}}
      : undefined,
  },
  handoffs: {H1: {id: 'H1', t: 29.77, bg: INK, elements: [{kind: 'mark', label: 'Mint Line vertical at x 320', path: 'mint'}]}},
});
