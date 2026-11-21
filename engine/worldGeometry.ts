import {FONT_INFO} from './config';
import type {WordGeom} from './types';

export function worldWordBox(g: WordGeom) {
  const info = FONT_INFO[g.font];
  const top = Math.max(0, info.asc - info.cap) * g.size;
  return {x: g.x, y: g.y - top, width: g.w, height: g.boxH + top};
}
