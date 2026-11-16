// WaveLine: a sine line from x0 to x1 about y, one path, in world px (no anchor transform). Ported from the DOGEfather
// kit (K14, item 25). `phase` px moves the crests toward +x.
import React from 'react';
import type {DecorGraphic, Pt} from '../engine';
import {type PropGraphicOpts, f1, propColours, propGraphic} from './common';

export interface WaveLineProps {
  x0: number; x1: number; y: number;
  amplitude?: number;
  wavelength?: number;
  phase?: number;
  /** Line colour (default the accent2 role). */
  colour?: string;
  strokeWidth?: number;
  opacity?: number;
}
export const WaveLine: React.FC<WaveLineProps> = ({x0, x1, y, amplitude = 10, wavelength = 90, phase = 0, colour, strokeWidth = 6, opacity = 1}) => {
  const n = Math.max(2, Math.ceil((x1 - x0) / 4));
  let d = '';
  for (let k = 0; k <= n; k++) {
    const x = x0 + ((x1 - x0) * k) / n;
    d += `${k ? 'L' : 'M'}${f1(x)} ${f1(y + amplitude * Math.sin((2 * Math.PI * (x - phase)) / wavelength))}`;
  }
  return <path d={d} fill="none" stroke={colour ?? propColours().accent2} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" opacity={opacity} />;
};
/** Height of a WaveLine at x (so a board can float the Ship on it). */
export const waveY = (w: WaveLineProps, x: number) => w.y + (w.amplitude ?? 10) * Math.sin((2 * Math.PI * (x - (w.phase ?? 0))) / (w.wavelength ?? 90));
export const waveLineQuad = ({x0, x1, y, amplitude = 10, strokeWidth = 6}: WaveLineProps): Pt[] => {
  const h = amplitude + strokeWidth / 2;
  return [{x: x0 - strokeWidth / 2, y: y - h}, {x: x1 + strokeWidth / 2, y: y - h}, {x: x1 + strokeWidth / 2, y: y + h}, {x: x0 - strokeWidth / 2, y: y + h}];
};
/** A WaveLine as a board graphic (a line words may stand on: pass `ground: true` if they do). */
export const waveLineGraphic = (o: PropGraphicOpts<WaveLineProps>): DecorGraphic => propGraphic(o, WaveLine, waveLineQuad);
