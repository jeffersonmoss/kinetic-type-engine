// The Mint Line (IPO storyboard v3, rules 53 and 173): the first video's one recurring graphic, kept here as fixture-local
// code (the engine knows it only as a BoardPath, mintPath.tsx). It is a path that only ever grows from its own
// tip. Defined piecewise in time (MintSeg legs: straight runs, eased turns, the exponential climb of L03, a stop,
// and an open-ended last leg). Pure: the tip is integrated frame by frame from t0 and cached per definition object.
import {FPS, clamp, deg, easeInOutSine, rad, type Pt} from '../../engine';
import {DURATION_FRAMES} from './song';
import type {MintLineDef, MintSeg} from './mintTypes';

const SUB = 4; // integration substeps per frame
type Sample = {p: Pt; heading: number; s: number};
type Cache = {f0: number; samples: Sample[]; prefixLen: number; state: State};
type State = {
  p: Pt; heading: number; speed: number; seg: number;
  turnFrom: number; turnTo: number; turnStart: number; turnFrames: number;
  exp: {k: number; a: number; origin: Pt; base: number; u: number} | null;
};
const cache = new WeakMap<MintLineDef, Cache>();
const dirOf = (h: number): Pt => ({x: Math.cos(rad(h)), y: Math.sin(rad(h))});
const polyLen = (pts: Pt[]) => pts.slice(1).reduce((a, p, k) => a + Math.hypot(p.x - pts[k].x, p.y - pts[k].y), 0);

const init = (def: MintLineDef): Cache => {
  const f0 = def.t0 * FPS;
  const prefixLen = def.prefix && def.prefix.length > 1 ? polyLen(def.prefix) : 0;
  const state: State = {p: {...def.start}, heading: def.heading, speed: def.speed, seg: 0, turnFrom: def.heading, turnTo: def.heading, turnStart: f0, turnFrames: 0, exp: null};
  return {f0, samples: [{p: {...def.start}, heading: def.heading, s: prefixLen}], prefixLen, state};
};

/** Advances the integration by one frame (from sample k to k + 1). */
const stepFrame = (def: MintLineDef, c: Cache) => {
  const st = c.state;
  const segs: MintSeg[] = def.segs ?? [];
  const fNext = c.f0 + c.samples.length; // frame being integrated to
  // activate legs whose time has come (a leg starts on the first frame at or after its time)
  while (st.seg < segs.length && segs[st.seg].t * FPS <= fNext) {
    const g = segs[st.seg];
    if (g.speed !== undefined) st.speed = g.speed;
    if (g.stop) st.speed = 0;
    const target = g.heading ?? st.turnTo;
    st.turnFrom = st.heading; st.turnTo = target; st.turnStart = fNext - 1; st.turnFrames = g.exp ? 0 : g.turnFrames ?? 8;
    st.exp = g.exp ? {k: g.exp.k, a: g.exp.a ?? 1 / g.exp.k, origin: {...st.p}, base: target, u: 0} : null;
    if (g.exp) st.heading = target;
    st.seg++;
  }
  let s = c.samples[c.samples.length - 1].s;
  for (let j = 1; j <= SUB; j++) {
    const ff = fNext - 1 + j / SUB;
    const ds = st.speed / SUB;
    if (ds <= 0) continue;
    if (st.exp) {
      const e = st.exp;
      const slope = (u: number) => e.a * e.k * (Math.exp(e.k * u) - 1);
      e.u += ds / Math.sqrt(1 + slope(e.u) ** 2);
      const v = e.a * (Math.exp(e.k * e.u) - 1 - e.k * e.u);
      const d = dirOf(e.base), left = {x: d.y, y: -d.x};
      st.p = {x: e.origin.x + d.x * e.u + left.x * v, y: e.origin.y + d.y * e.u + left.y * v};
      const sl = slope(e.u);
      st.heading = deg(Math.atan2(d.y + left.y * sl, d.x + left.x * sl));
    } else {
      if (st.turnFrames > 0) st.heading = st.turnFrom + (st.turnTo - st.turnFrom) * easeInOutSine((ff - st.turnStart) / st.turnFrames);
      else st.heading = st.turnTo;
      const d = dirOf(st.heading);
      st.p = {x: st.p.x + d.x * ds, y: st.p.y + d.y * ds};
    }
    s += ds;
  }
  c.samples.push({p: {...st.p}, heading: st.heading, s});
};

const samplesTo = (def: MintLineDef, f: number): Cache => {
  let c = cache.get(def);
  if (!c) { c = init(def); cache.set(def, c); }
  const need = Math.min(Math.ceil(f - c.f0) + 1, DURATION_FRAMES + 60);
  while (c.samples.length <= need) stepFrame(def, c);
  return c;
};

/** The tip of the Line at song seconds t: point, heading (world degrees) and arc length drawn so far (prefix included). */
export const mintTipAt = (def: MintLineDef, t: number): Sample => {
  const f = t * FPS;
  const c = samplesTo(def, f);
  if (f <= c.f0) return c.samples[0];
  const u = f - c.f0, k = Math.floor(u), p = u - k;
  const a = c.samples[k], b = c.samples[Math.min(k + 1, c.samples.length - 1)];
  return {p: {x: a.p.x + (b.p.x - a.p.x) * p, y: a.p.y + (b.p.y - a.p.y) * p}, heading: a.heading + (b.heading - a.heading) * p, s: a.s + (b.s - a.s) * p};
};

/** The drawn Line at song seconds t as a polyline (prefix, then the tip's path up to t). */
export const mintPath = (def: MintLineDef, t: number): Pt[] => {
  const f = t * FPS;
  const c = samplesTo(def, f);
  const pre = def.prefix && def.prefix.length > 1 ? def.prefix.slice(0, -1) : [];
  if (f <= c.f0) return [...pre, def.start];
  const k = Math.floor(f - c.f0);
  const pts = c.samples.slice(0, k + 1).map((s) => s.p);
  // drop collinear interior points of straight runs (keeps paths short)
  const out: Pt[] = [...pre];
  for (const p of pts) {
    const n = out.length;
    if (n >= 2) {
      const a = out[n - 2], b = out[n - 1];
      const cross = (b.x - a.x) * (p.y - b.y) - (b.y - a.y) * (p.x - b.x);
      if (Math.abs(cross) < 1e-3 * Math.max(1, Math.hypot(p.x - b.x, p.y - b.y))) { out[n - 1] = p; continue; }
    }
    if (n >= 1 && Math.hypot(p.x - out[n - 1].x, p.y - out[n - 1].y) < 1e-6) continue;
    out.push(p);
  }
  out.push(mintTipAt(def, t).p);
  return out;
};

/** Point and heading at arc length s along the Line (as it will be drawn; s may exceed the length drawn at any t). */
export const mintPointAt = (def: MintLineDef, s: number): {p: Pt; heading: number} => {
  const pre = def.prefix && def.prefix.length > 1 ? def.prefix : null;
  const c = samplesTo(def, def.t0 * FPS);
  if (pre && s <= c.prefixLen) {
    let acc = 0;
    for (let k = 1; k < pre.length; k++) {
      const L = Math.hypot(pre[k].x - pre[k - 1].x, pre[k].y - pre[k - 1].y);
      if (acc + L >= s) { const u = (s - acc) / Math.max(1e-6, L); return {p: {x: pre[k - 1].x + (pre[k].x - pre[k - 1].x) * u, y: pre[k - 1].y + (pre[k].y - pre[k - 1].y) * u}, heading: deg(Math.atan2(pre[k].y - pre[k - 1].y, pre[k].x - pre[k - 1].x))}; }
      acc += L;
    }
  }
  // extend the integration until the arc length is reached (or the film ends)
  let cc = c;
  while (cc.samples[cc.samples.length - 1].s < s && cc.samples.length < DURATION_FRAMES + 60) { stepFrame(def, cc); }
  cc = cache.get(def)!;
  const ss = cc.samples;
  let lo = 0, hi = ss.length - 1;
  if (s >= ss[hi].s) return {p: ss[hi].p, heading: ss[hi].heading};
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ss[m].s <= s) lo = m; else hi = m; }
  const u = clamp((s - ss[lo].s) / Math.max(1e-6, ss[hi].s - ss[lo].s));
  return {p: {x: ss[lo].p.x + (ss[hi].p.x - ss[lo].p.x) * u, y: ss[lo].p.y + (ss[hi].p.y - ss[lo].p.y) * u}, heading: ss[lo].heading + (ss[hi].heading - ss[lo].heading) * u};
};

/** Arc length at which the tip passes closest to a world point (for SHELF words standing on the Line). */
export const mintArcNear = (def: MintLineDef, q: Pt, tMax: number): number => {
  const c = samplesTo(def, tMax * FPS);
  let best = 0, bd = Infinity;
  for (const sm of c.samples.slice(0, Math.ceil(tMax * FPS - c.f0) + 1)) { const d = Math.hypot(sm.p.x - q.x, sm.p.y - q.y); if (d < bd) { bd = d; best = sm.s; } }
  return best;
};

/** Song seconds at which the tip reaches arc length s (Infinity if it never does). */
export const mintTimeAtArc = (def: MintLineDef, s: number): number => {
  const c = samplesTo(def, def.t0 * FPS);
  if (s <= c.prefixLen) return -Infinity;
  mintPointAt(def, s);
  const ss = cache.get(def)!.samples;
  for (let k = 1; k < ss.length; k++) if (ss[k].s >= s) { const u = (s - ss[k - 1].s) / Math.max(1e-6, ss[k].s - ss[k - 1].s); return (c.f0 + k - 1 + u) / FPS; }
  return Infinity;
};
