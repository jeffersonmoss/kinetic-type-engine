import {createEngineContext, type EngineContext, type EngineContextOptions} from '../context';
import {WIDE, SHORT_916} from '../engine/format';
import type {Film, Format} from '../score';
import metrics from '../fonts/anton-dmserif-barlow.metrics.json';

export const defaultPalette = {
  ground: '#151519', shadow: '#050507', paper: '#FFF7E7', accent: '#FA9B5D',
  accent2: '#D0A7FF', highlight: '#FBE589',
};
export const defaultFonts = {
  anton: {family: 'Anton', upper: true, connectives: 'barlow'},
  barlow: {family: 'Barlow Condensed', upper: true, weight: 700},
  accent: {family: 'DM Serif Display', style: 'italic' as const},
};
export const defaultLook = {palette: defaultPalette, shadow: false};
export const formatFor = (format: Format) => format === 'wide' ? WIDE : {...SHORT_916, id: 'portrait'};
export function scoreContext(format: Format, look?: Film['look']): EngineContext {
  return createEngineContext({
    words: [], lines: [], format: formatFor(format), fps: 30, defaultFont: 'anton',
    fonts: defaultFonts, fontMetrics: {...metrics, fonts: {...metrics.fonts, accent: metrics.fonts.serif},
      anchors: {...metrics.anchors, accent: metrics.anchors.serif}},
    look: {palette: {...defaultPalette, ...look?.palette}, shadow: look?.shadow ?? false},
  });
}

export function boundContext(ctx: EngineContext, fields: Pick<EngineContextOptions, 'words' | 'lines' | 'beats' | 'guard'>) {
  const format = {...ctx.format};
  return createEngineContext({...fields, format, fps: ctx.fps, look: ctx.look,
    fonts: ctx.fonts, fontMetrics: ctx.fontMetrics, defaultFont: 'anton'});
}
