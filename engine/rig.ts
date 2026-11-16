// The rig camera (rules 44 to 49 and 166): the only camera. The rig angle R is authored, never derived: it changes only through the roll and tilt keys and accumulates
// through a board. Between keys the rig DRIFTs (R 0.4 degrees per second, zoom 1.5 percent per second, toward the next
// move) unless a `hold` key says `still`. Whole-camera moves are exempt from the 32 px per frame cap but every key is
// eased and a quarter turn takes at least 8 frames. Pure function of (board, frame), cached per board.
import {BOX_H, BOX_W, FPS, HALF_DIAGONAL, HEIGHT, WIDTH} from './config';
import {layoutBoard, wordCorners} from './layout';
import {resolveAnchor} from './letters';
import type {BlockGeom, Board, BoardLayout, CameraState, Pt, RigKey, RigKind, RigTarget} from './types';
import {clamp, easeInOutCubic, lerp, normDeg, rot} from './util';

export const DRIFT_ROT = 0.4; // degrees per second
export const DRIFT_ZOOM = 0.015; // fraction per second
/** Half the frame diagonal: a counter of this radius on screen covers the whole frame. */
export {HALF_DIAGONAL};
/** Default frames per kind (rule 46). */
export const RIG_DEFAULT_FRAMES: Record<RigKind, number> = {roll: 12, tilt: 10, whip: 8, step: 7, dive: 10, soar: 10, track: 30, crane: 30, hold: 0};
/** Frames range the style bible gives each kind; outside it the validator warns (slow rolls 24 to 36 also pass). */
export const RIG_FRAME_RANGE: Record<RigKind, [number, number] | null> = {roll: [9, 14], tilt: [8, 12], whip: [6, 9], step: [6, 8], dive: [8, 12], soar: [8, 12], track: null, crane: null, hold: null};
/** Kinds that are transits: a word sung during one is checked when it ends (rule 181.2) instead of during it. */
export const TRANSIT_KINDS = new Set<RigKind>(['roll', 'tilt', 'whip', 'step', 'dive', 'soar']);

export const easeInOutQuart = (p: number) => { const x = clamp(p); return x < 0.5 ? 8 * x ** 4 : 1 - (-2 * x + 2) ** 4 / 2; };
const easeSine = (p: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(p));
/** Linear with eased ends: velocity ramps up over `ramp` frames and down over the last `ramp` (a steady TRACK). */
export const rampEase = (frames: number, ramp = 6) => (p: number) => {
  const T = Math.max(1, frames), r = Math.min(ramp, T / 2) / T;
  const x = clamp(p), vmax = 1 / (1 - r);
  if (x < r) return (vmax * x * x) / (2 * r);
  if (x > 1 - r) { const y = 1 - x; return 1 - (vmax * y * y) / (2 * r); }
  return vmax * (r / 2) + vmax * (x - r);
};

export const toScreenCam = (cam: CameraState, p: Pt): Pt => {
  const q = rot({x: (p.x - cam.x) * cam.zoom, y: (p.y - cam.y) * cam.zoom}, cam.rot);
  return {x: q.x + WIDTH / 2, y: q.y + HEIGHT / 2};
};
/** Camera centre that puts world point P at screen point S for a given angle and zoom. */
export const solveCentre = (P: Pt, S: Pt, r: number, z: number): Pt => {
  const d = rot({x: S.x - WIDTH / 2, y: S.y - HEIGHT / 2}, -r);
  return {x: P.x - d.x / z, y: P.y - d.y / z};
};

/** A resolved key. */
export interface RigMove {
  key: RigKey; kind: RigKind; start: number; dur: number;
  /** Authored pose at the end of the move (no drift). */
  target: CameraState;
  /** Actual pose at the start (drift included). */
  from: CameraState;
  /** World point that travels in a straight line on screen (null: the camera centre does). */
  pivot: Pt | null;
  ease: (p: number) => number;
  /** Frames the author asked for, when the engine had to lengthen the move (quarter turns need 8). */
  stretchedFrom?: number;
  /** Drift direction after the move ends: signs of R and zoom creep (0 for a still hold). */
  driftRot: number; driftZoom: number;
}
type RigCache = {pose0: CameraState; moves: RigMove[]; startF: number; drift0: {r: number; z: number}};
const cache = new WeakMap<Board, RigCache>();

const frameBox = (L: BoardLayout, ref: NonNullable<RigTarget['frame']>, t: number): {pts: Pt[]; cap?: number; cover?: number} => {
  const blockPts = (b: BlockGeom) => b.words.flatMap((w) => wordCorners(b, w));
  if ('word' in ref) { const g = L.words.get(ref.word); if (!g) throw new Error(`rig: word ${ref.word} not on board`); return {pts: wordCorners(L.blocks[g.block], g), cap: g.h, cover: Math.min(g.w, g.h) / 2}; }
  if ('words' in ref) { const gs = ref.words.map((i) => L.words.get(i)!).filter(Boolean); return {pts: gs.flatMap((g) => wordCorners(L.blocks[g.block], g)), cap: gs[0]?.h}; }
  if ('block' in ref) { const b = L.blocks[ref.block]; return {pts: blockPts(b), cap: b.words[0]?.h}; }
  if ('blocks' in ref) return {pts: ref.blocks.flatMap((k) => blockPts(L.blocks[k])), cap: L.blocks[ref.blocks[0]]?.words[0]?.h};
  if ('anchor' in ref) {
    const a = resolveAnchor(L, ref.anchor, t);
    return {pts: a.quad ?? [a.p], cap: a.h, cover: a.w !== undefined && a.h !== undefined ? Math.min(a.w, a.h) / 2 : undefined};
  }
  return {pts: [ref.point]};
};
const fit = (pts: Pt[], r: number, fill: number) => {
  const q = pts.map((p) => rot(p, r));
  const xs = q.map((p) => p.x), ys = q.map((p) => p.y);
  const w = Math.max(1, Math.max(...xs) - Math.min(...xs)), h = Math.max(1, Math.max(...ys) - Math.min(...ys));
  return Math.min((BOX_W * fill) / w, (BOX_H * fill) / h);
};
const centreOf = (pts: Pt[]): Pt => {
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  return {x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2};
};

/** Resolves a target pose from a starting authored pose. Returns the pose and the framed centre (the default pivot). */
export const resolveTarget = (L: BoardLayout, to: RigTarget | undefined, base: CameraState, t: number): {pose: CameraState; centre: Pt | null} => {
  const pose: CameraState = {...base};
  if (!to) return {pose, centre: null};
  if (to.rot !== undefined) pose.rot = to.rot;
  if (to.zoom !== undefined) pose.zoom = to.zoom;
  if (to.x !== undefined) pose.x = to.x;
  if (to.y !== undefined) pose.y = to.y;
  if (!to.frame) return {pose, centre: null};
  const fb = frameBox(L, to.frame, t);
  const C = centreOf(fb.pts);
  if (to.cover && fb.cover) pose.zoom = (HALF_DIAGONAL / fb.cover) * 1.04;
  else if (to.cap && fb.cap) pose.zoom = to.cap / fb.cap;
  else if (to.fill) pose.zoom = fit(fb.pts, pose.rot, to.fill);
  const S = to.screen ?? {x: WIDTH / 2, y: HEIGHT / 2};
  const c = solveCentre(C, S, pose.rot, pose.zoom);
  pose.x = c.x; pose.y = c.y;
  return {pose, centre: C};
};

const driftState = (s: CameraState, dtSec: number, dr: number, dz: number): CameraState => {
  if (dtSec <= 0 || (dr === 0 && dz === 0)) return s;
  return {...s, rot: s.rot + dr * DRIFT_ROT * dtSec, zoom: s.zoom * (1 + dz * DRIFT_ZOOM * dtSec)};
};
const interp = (a: CameraState, b: CameraState, p: number, pivot: Pt | null): CameraState => {
  const r = lerp(a.rot, b.rot, p);
  const z = Math.exp(lerp(Math.log(a.zoom), Math.log(b.zoom), p));
  if (!pivot) return {x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), zoom: z, rot: r};
  const sa = toScreenCam(a, pivot), sb = toScreenCam(b, pivot);
  const c = solveCentre(pivot, {x: lerp(sa.x, sb.x, p), y: lerp(sa.y, sb.y, p)}, r, z);
  return {x: c.x, y: c.y, zoom: z, rot: r};
};
const easeFor = (k: RigKey, frames: number): ((p: number) => number) => {
  const e = k.ease ?? (k.kind === 'whip' ? 'quart' : k.kind === 'track' ? 'linear' : 'cubic');
  if (e === 'quart') return easeInOutQuart;
  if (e === 'sine') return easeSine;
  if (e === 'linear') return rampEase(frames, 6);
  return easeInOutCubic;
};

const craneState = (k: RigKey, base: CameraState, t: number): CameraState => {
  const fo = k.follow!(t);
  const c = solveCentre(fo.board, fo.screen, base.rot, base.zoom);
  return {...base, x: c.x, y: c.y};
};

const resolve = (board: Board): RigCache => {
  const hit = cache.get(board);
  if (hit) return hit;
  const L = layoutBoard(board);
  const startF = board.start * FPS;
  const firstBlockPose = (): CameraState => {
    const b = L.blocks[0];
    if (!b) return {x: WIDTH / 2, y: HEIGHT / 2, zoom: 1, rot: 0};
    const pts = b.words.flatMap((w) => wordCorners(b, w));
    const C = centreOf(pts);
    return {x: C.x, y: C.y, zoom: Math.min(1.6, fit(pts, 0, 0.9)), rot: 0};
  };
  const pose0 = board.rigStart ? resolveTarget(L, board.rigStart, {x: WIDTH / 2, y: HEIGHT / 2, zoom: 1, rot: 0}, board.start).pose : firstBlockPose();
  const keys = [...(board.rig ?? [])].sort((a, b) => a.t - b.t);
  const moves: RigMove[] = [];
  let nominal = pose0;
  // first pass: authored targets (drift does not enter them)
  const targets: {target: CameraState; pivot: Pt | null; dur: number; stretchedFrom?: number}[] = [];
  for (const k of keys) {
    const t = k.t;
    let base: CameraState = {...nominal};
    if (k.by !== undefined) {
      if (k.kind === 'roll' || k.kind === 'tilt') base.rot = nominal.rot + k.by;
      else if (k.kind === 'dive') base.zoom = nominal.zoom * k.by;
      else if (k.kind === 'soar') base.zoom = nominal.zoom / k.by;
    }
    const {pose, centre} = resolveTarget(L, k.to, base, t);
    let target = pose;
    let frames = k.frames ?? RIG_DEFAULT_FRAMES[k.kind];
    if (k.kind === 'track' && k.speed !== undefined && !k.to) {
      const d = rot({x: Math.cos((k.dir ?? 0) * Math.PI / 180) * k.speed * frames, y: Math.sin((k.dir ?? 0) * Math.PI / 180) * k.speed * frames}, -base.rot);
      target = {...base, x: base.x + d.x / base.zoom, y: base.y + d.y / base.zoom};
    }
    if (k.kind === 'crane' && k.follow) target = craneState(k, base, t + frames / FPS);
    // limits (rule 166.4): a 90 degree change takes at least 8 frames; any change at least 6
    const dRot = Math.abs(target.rot - nominal.rot);
    const changes = dRot > 1e-6 || Math.abs(Math.log(target.zoom / nominal.zoom)) > 1e-6 || Math.hypot(target.x - nominal.x, target.y - nominal.y) > 1e-6;
    let need = Math.ceil((8 * dRot) / 90 - 1e-9);
    if (changes && k.kind !== 'hold') need = Math.max(need, 6);
    let stretchedFrom: number | undefined;
    if (frames < need) { stretchedFrom = frames; frames = need; }
    if (k.kind === 'hold' && changes && frames < 6) { stretchedFrom = frames; frames = 6; }
    let pivot: Pt | null = centre;
    if (k.about) pivot = resolveAnchor(L, k.about, t).p;
    targets.push({target, pivot, dur: frames, stretchedFrom});
    nominal = target;
  }
  // drift directions: toward the next move
  const driftFor = (j: number): {r: number; z: number} => {
    const k = keys[j];
    if (k && k.kind === 'hold' && k.still) return {r: 0, z: 0};
    const cur = j < 0 ? pose0 : targets[j].target;
    const nx = targets[j + 1]?.target;
    if (!nx) return {r: 1, z: 1};
    const dr = nx.rot - cur.rot, dz = nx.zoom - cur.zoom;
    return {r: Math.abs(dr) > 1e-6 ? Math.sign(dr) : 1, z: Math.abs(dz) > 1e-6 ? Math.sign(dz) : 1};
  };
  const drift0 = driftFor(-1);
  const out: RigCache = {pose0, moves, startF, drift0};
  // second pass: actual start states (with drift)
  keys.forEach((k, j) => {
    const start = k.t * FPS;
    const prevEnd = j === 0 ? startF : moves[j - 1].start + moves[j - 1].dur;
    let from: CameraState;
    if (j === 0) from = driftState(pose0, (start - startF) / FPS, drift0.r, drift0.z);
    else from = evalMove(moves[j - 1], Math.min(start, prevEnd + 1e9), board, start);
    const d = driftFor(j);
    const T = targets[j];
    moves.push({key: k, kind: k.kind, start, dur: T.dur, target: T.target, from, pivot: T.pivot, ease: easeFor(k, T.dur), stretchedFrom: T.stretchedFrom, driftRot: d.r, driftZoom: d.z});
  });
  cache.set(board, out);
  return out;
};

const evalMove = (m: RigMove, _x: number, board: Board, f: number): CameraState => {
  if (m.dur <= 0 || f >= m.start + m.dur) return driftState(m.target, (f - m.start - m.dur) / FPS, m.driftRot, m.driftZoom);
  const p = (f - m.start) / m.dur;
  if (m.kind === 'crane' && m.key.follow) {
    const live = craneState(m.key, {...m.from, rot: lerp(m.from.rot, m.target.rot, m.ease(p)), zoom: m.target.zoom}, f / FPS);
    const blend = easeInOutCubic(clamp((f - m.start) / Math.min(8, m.dur)));
    return {x: lerp(m.from.x, live.x, blend), y: lerp(m.from.y, live.y, blend), zoom: Math.exp(lerp(Math.log(m.from.zoom), Math.log(live.zoom), blend)), rot: live.rot};
  }
  void board;
  return interp(m.from, m.target, m.ease(p), m.pivot);
};

/** Rig state of a board at a (fractional) frame. */
export const rigAt = (board: Board, frame: number): CameraState => {
  const c = resolve(board);
  let j = -1;
  for (let k = 0; k < c.moves.length; k++) if (c.moves[k].start <= frame) j = k;
  if (j < 0) return driftState(c.pose0, (frame - c.startF) / FPS, c.drift0.r, c.drift0.z);
  return evalMove(c.moves[j], 0, board, frame);
};
/** The resolved moves of a rig (validator and report). */
export const rigMoves = (board: Board): RigMove[] => resolve(board).moves;
/** Authored R (no drift) at a frame: the last move's target angle, interpolated during the move. */
export const rigNominalRot = (board: Board, frame: number): number => {
  const c = resolve(board);
  let r = c.pose0.rot;
  for (const m of c.moves) {
    if (m.start > frame) break;
    const p = m.dur > 0 ? m.ease((frame - m.start) / m.dur) : 1;
    const prev = r;
    r = prev + (m.target.rot - prev) * clamp(p);
    if (frame >= m.start + m.dur) r = m.target.rot;
  }
  return r;
};
/** Transit windows [start, end] in frames (rule 181.2). */
export const rigTransits = (board: Board): {start: number; end: number; kind: RigKind}[] =>
  rigMoves(board).filter((m) => TRANSIT_KINDS.has(m.kind) && m.dur > 0).map((m) => ({start: m.start, end: m.start + m.dur, kind: m.kind}));

// (The gaussian whip smear, rigSmearAt, is gone: true motion blur on every transit is in smear.tsx, engine item 32.)

/** Screen angle of a block at song seconds t (rule 166.5): its world angle plus the rig's R, normalised to (-180, 180]. */
export const screenAngle = (board: Board, block: number, t: number): number => {
  const L = layoutBoard(board);
  const b = L.blocks[block];
  if (b.def.pin === 'screen') return normDeg(b.angle);
  return normDeg(b.angle + rigAt(board, t * FPS).rot);
};
