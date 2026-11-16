// Rules (rules 52 and 173): Paper hairlines with a job (seam, hinge, shelf, panel edge). A rule grows from
// its start (EXTRUDE: out of a letter's stroke) at no more than the 32 px per frame cap, can be moved rigidly (the
// wiper of L02), and fades over 10 frames at `until`. Pure; the renderer and the validator share ruleAt().
import {FPS, PALETTE} from './config';
import {cameraAt} from './camera';
import {layoutBoard} from './layout';
import {swellOffsetAt, swellPushOf} from './emergence/swell';
import {findRule, ruleBase} from './letters';
import {boardCues} from './wordState';
import {SPEED_CAP, rectQuad} from './motion';
import type {TrackedElement} from './motionCheck';
import type {Board, Pt, RuleDef} from './types';
import {clamp, rot} from './util';
import {ownersRetire, ruleOwners} from './lines';

export interface RuleState {id: string; job: RuleDef['job']; a: Pt; b: Pt; angle: number; len: number; full: number; opacity: number; width: number; colour: string}
export const RULE_OPACITY = 0.7;
export const RULE_WIDTH = 3;

/** Frames a rule takes to grow to full length (at least 6; within the cap at the zoom of its start). */
export const ruleGrowFrames = (board: Board, def: RuleDef): number => {
  if (def.t0 === undefined) return 0;
  const speed = def.speed ?? SPEED_CAP / Math.max(0.05, cameraAt(board, def.t0 * FPS).zoom);
  return Math.max(6, Math.ceil(def.length / Math.max(1e-6, speed)));
};

const ownerMemo = new WeakMap<RuleDef, number | null>();
const inProgress = new Set<RuleDef>();
/** Ruling 198: a rule with an owner and no `until` fades when the last of its owner words retires (song seconds). */
export const ownerUntil = (board: Board, def: RuleDef): number | undefined => {
  if (!def.owner) return undefined;
  const hit = ownerMemo.get(def);
  if (hit !== undefined) return hit ?? undefined;
  if (inProgress.has(def)) return undefined; // a retire frame that depends on this rule (a rig move framing it)
  inProgress.add(def);
  try {
    const r = ownersRetire(board, ruleOwners(board, def.owner));
    const v = Number.isFinite(r) ? r / FPS : null;
    ownerMemo.set(def, v);
    return v ?? undefined;
  } finally { inProgress.delete(def); }
};

/** A rule's state at song seconds t, or null when it does not exist yet (or has faded). */
export const ruleAt = (board: Board, idOrDef: string | RuleDef, t: number): RuleState | null => {
  const def = typeof idOrDef === 'string' ? findRule(board, idOrDef) : idOrDef;
  if (!def) return null;
  const f = t * FPS;
  if (def.t0 !== undefined && f < def.t0 * FPS) return null;
  const L = layoutBoard(board);
  const {a, dir} = ruleBase(L, def, t);
  const G = ruleGrowFrames(board, def);
  const len = def.t0 === undefined ? def.length : def.length * clamp((f - def.t0 * FPS) / Math.max(1, G));
  let opacity = def.opacity ?? RULE_OPACITY;
  const until = def.until ?? ownerUntil(board, def);
  if (until !== undefined) opacity *= 1 - clamp((f - until * FPS) / 10);
  if (opacity <= 0.001) return null;
  const mv = def.move?.(t) ?? {};
  const r = mv.rot ?? 0;
  const off = {x: mv.dx ?? 0, y: mv.dy ?? 0};
  // a swelling word shoves board rules outward like any neighbour (ruling 194.7: it never grows across them)
  for (const cue of boardCues(board)) {
    if (cue.name !== 'swell' || cue.params?.emerged) continue;
    const full = {x: a.x + dir.x * def.length, y: a.y + dir.y * def.length};
    const pu = swellPushOf(cue, L, [a, full, full, a]);
    if (pu) { const o = swellOffsetAt(cue, L, pu, f); off.x += o.x; off.y += o.y; }
  }
  const A = {x: a.x + off.x, y: a.y + off.y};
  const d = rot(dir, r);
  return {
    id: def.id, job: def.jobAt?.(t) ?? def.job, a: A, b: {x: A.x + d.x * len, y: A.y + d.y * len}, angle: def.angle + r, len, full: def.length, opacity,
    width: def.width ?? RULE_WIDTH, colour: def.colour ?? PALETTE.paper,
  };
};

/** Every rule of a board as a tracked element (motion checks; the growing tip makes no abrupt appearance). */
export const ruleTracks = (board: Board): TrackedElement[] => (board.rules ?? []).map((def) => ({
  id: `rule ${def.id}`,
  exempt: ['abrupt'] as TrackedElement['exempt'], // a rule grows from a point at full opacity: not a cut
  sample: (t: number) => {
    const s = ruleAt(board, def, t);
    if (!s || s.len < 0.5) return null;
    const mid = {x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2};
    return {opacity: s.opacity / (def.opacity ?? RULE_OPACITY), quad: rectQuad(mid.x - s.len / 2, mid.y - s.width / 2, s.len, s.width, s.angle)};
  },
}));
