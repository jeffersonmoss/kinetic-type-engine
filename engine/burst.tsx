// Burst: paper triangles and dots thrown radially with gravity. One <path> per colour, seeded, pure.
import React from 'react';
import {scoped} from './scope';
import {PALETTE} from './config';
import type {Pt} from './types';
import {dotsPath, rand, rot} from './util';

export interface BurstOpts {
  /** Seed so two bursts differ. */
  seed: string | number;
  count?: number;
  origin: Pt;
  /** Seconds since the burst started (negative: nothing). */
  dt: number;
  colours?: string[];
  /** px/s range. */
  speed?: [number, number];
  /** px/s^2 along `down`. */
  gravity?: number;
  down?: Pt;
  /** Seconds before pieces fade out. */
  life?: number;
  /** Piece size multiplier. */
  size?: number;
}

/** Pure particle maths: returns one SVG path string per colour. */
export const burstPaths = (o: BurstOpts): {colour: string; d: string}[] => {
  const {seed, count = 60, origin, dt, colours = [PALETTE.highlight], speed = [350, 950], gravity = 1500, down = {x: 0, y: 1}, life = 1.3, size = 1} = o;
  if (dt < 0) return [];
  const buckets = colours.map(() => [] as string[]);
  const dots = colours.map(() => [] as {x: number; y: number; r: number}[]);
  for (let k = 0; k < count; k++) {
    const r1 = rand(seed, k, 'a'), r2 = rand(seed, k, 'b'), r3 = rand(seed, k, 'c'), r4 = rand(seed, k, 'd');
    const a = r1 * Math.PI * 2;
    const v = speed[0] + (speed[1] - speed[0]) * r2;
    const vel = {x: Math.cos(a) * v, y: Math.sin(a) * v - 250};
    const lifeK = life * (0.7 + 0.5 * r4);
    const fade = Math.max(0, 1 - Math.max(0, dt - lifeK * 0.6) / (lifeK * 0.4));
    if (fade <= 0) continue;
    const g = 0.5 * gravity * dt * dt;
    const p = {x: origin.x + vel.x * dt + down.x * g, y: origin.y + vel.y * dt + down.y * g};
    const ci = k % colours.length;
    const sz = (6 + 12 * r3) * size * fade;
    if (k % 3 === 0) { dots[ci].push({x: p.x, y: p.y, r: sz * 0.4}); continue; }
    const spin = (r4 - 0.5) * 1440 * dt;
    const tri = [0, 120, 240].map((ang) => rot({x: sz * 0.6, y: 0}, ang + spin + r1 * 360));
    buckets[ci].push(`M${(p.x + tri[0].x).toFixed(1)} ${(p.y + tri[0].y).toFixed(1)}L${(p.x + tri[1].x).toFixed(1)} ${(p.y + tri[1].y).toFixed(1)}L${(p.x + tri[2].x).toFixed(1)} ${(p.y + tri[2].y).toFixed(1)}Z`);
  }
  return colours.map((colour, ci) => ({colour, d: buckets[ci].join('') + dotsPath(dots[ci])})).filter((x) => x.d);
};

/** SVG group of a burst in the parent's coordinate space. */
export const Burst: React.FC<BurstOpts> = scoped((props) => (
  <g>{burstPaths(props).map((p, k) => <path key={k} d={p.d} fill={p.colour} />)}</g>
));
