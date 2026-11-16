// The ant (the first video's company mark), copied from its kit's stand-ins as a fixture-local prop.
import React from 'react';
import {beatIndexAt} from '../../engine';
import {PAPER} from './palette';

export interface AntMarkProps {
  x: number; y: number;
  /** Body length in px. */
  size: number;
  colour?: string;
  /** Song time; legs alternate on each beat when walking. */
  t?: number;
  walk?: boolean;
  /** Degrees; 0 faces right. */
  angle?: number;
  /** Leg spread multiplier (1 normal; 1.6 "legs open" on HUG). */
  open?: number;
}
/** Three circles (head, thorax, big abdomen), six legs, two antennae. (x, y) = feet line centre. */
export const AntMark: React.FC<AntMarkProps> = ({x, y, size, colour = PAPER, t = 0, walk = false, angle = 0, open = 1}) => {
  const u = size / 10;
  const phase = walk ? beatIndexAt(t) % 2 : 0;
  const bodyY = -3.2 * u;
  const legs = [-1.2, 0, 1.2].map((lx, k) => {
    const sw = ((k + phase) % 2 ? 1 : -1) * 0.7 * u * open;
    return `M${lx * u} ${bodyY}L${lx * u + sw} ${-1.5 * u}L${lx * u + sw * 1.5} 0`;
  }).join('');
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`}>
      <path d={legs} stroke={colour} strokeWidth={Math.max(3, u * 0.6)} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d={`M${3.6 * u} ${bodyY - 0.6 * u}L${4.6 * u} ${bodyY - 2.6 * u}M${3.9 * u} ${bodyY - 0.6 * u}L${5.4 * u} ${bodyY - 2.0 * u}`} stroke={colour} strokeWidth={Math.max(3, u * 0.4)} strokeLinecap="round" />
      <circle cx={-3.2 * u} cy={bodyY} r={2.1 * u} fill={colour} />
      <circle cx={0} cy={bodyY} r={1.1 * u} fill={colour} />
      <circle cx={2.6 * u} cy={bodyY - 0.2 * u} r={1.4 * u} fill={colour} />
    </g>
  );
};
