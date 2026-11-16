// Motion legibility checks (Builder brief 12.1 to 12.3) for words and for any graphic a chunk registers.
// An element is anything with a position and a visibility over time: a word (the validator builds these itself),
// or a decor graphic described by a TrackedElement (board.track for world-space graphics drawn as board decor,
// validateElements() for screen-space graphics drawn outside TypeStage).
import {FPS} from './config';
import {BEAT_FRAMES, MIN_TRANSITION_FRAMES, MIN_VISIBLE_FRAMES, SPEED_CAP, VISIBLE_THRESHOLD} from './motion';
import type {Pt} from './types';

/** One frame of a tracked element. `quad` is its outline (screen px, or world px for board.track); `state` is any
 *  value that changes when the element visibly changes state (colour, shape, page number...). */
export interface TrackedSample {
  opacity: number; quad: Pt[]; state?: string | number;
  /** boards (rule 181.3, camera exempt from the cap): the previous frame's outline drawn through THIS frame's
   *  camera. When given, the speed checked is the smaller of the screen speed and the speed relative to the board. */
  relPrev?: Pt[];
  /** The element is turning on an edge (a panel opening or folding, or a word printed on one): a swing is limited by
   *  its angle, not by the speed of its far edge (ruling 192), so the speed cap is not applied to this frame. */
  swing?: boolean;
}
export interface TrackedElement {
  /** Name used in the report ("flip sheet", "hat 2"). */
  id: string;
  /** Sample at absolute song seconds; null when the element does not exist at t. */
  sample: (t: number) => TrackedSample | null;
  /** Song seconds to check (default: the board's span for board.track; required for validateElements). */
  from?: number; to?: number;
  /** Rules this element is deliberately exempt from (say why in a comment where you set it). */
  exempt?: MotionRule[];
  /** The element is a prop type must keep clear of (Fable item 38): no word may overlap it, and a word in its first
   *  15 frames from its sung frame stays 24 px from it (validator `prop-clear`). board.track only. */
  clear?: boolean;
  /** Smallest on-screen longer side, px, while shown at opacity 0.5 or more (validator `prop-size`, Fable item 45). */
  minSize?: number;
}
export type MotionRule = 'speed' | 'min-visible' | 'state-rate' | 'flash' | 'abrupt';

export interface MotionViolation {rule: MotionRule; element: string; word?: number; from: number; to: number; frames: number; detail: string}

const onScreen = (q: Pt[], box: {w: number; h: number}) => {
  const xs = q.map((p) => p.x), ys = q.map((p) => p.y);
  return Math.max(...xs) >= 0 && Math.min(...xs) <= box.w && Math.max(...ys) >= 0 && Math.min(...ys) <= box.h;
};
/** Checks one element sampled per frame from f0 to f1 (absolute frames). */
export const checkTrack = (
  id: string, f0: number, f1: number, at: (f: number) => TrackedSample | null,
  opts: {exempt?: MotionRule[]; word?: number; abruptOk?: boolean; /** only frames where the element is at least partly inside this screen box count for speed (nothing off screen is seen moving). */ screen?: {w: number; h: number}; /** largest opacity change allowed between two frames. */ maxOpacityStep?: number} = {},
): MotionViolation[] => {
  const out: MotionViolation[] = [];
  const ex = new Set(opts.exempt ?? []);
  const agg = new Map<string, MotionViolation & {worst: number}>();
  const note = (rule: MotionRule, f: number, worst: number, detail: (w: number) => string) => {
    if (ex.has(rule)) return;
    const a = agg.get(rule);
    if (!a) agg.set(rule, {rule, element: id, word: opts.word, from: f, to: f, frames: 1, detail: '', worst});
    else { a.to = f; a.frames++; a.worst = Math.max(a.worst, worst); }
    agg.get(rule)!.detail = detail(agg.get(rule)!.worst);
  };
  type Ev = {f: number; kind: 'appear' | 'disappear' | 'state'; state?: string | number};
  const events: Ev[] = [];
  let prev: TrackedSample | null = null;
  let vis = false, runStart = -1;
  let lastLow = -Infinity, lastHigh = -Infinity; // for entrance and exit ramp lengths
  let state: string | number | undefined;
  for (let f = Math.ceil(f0); f <= f1; f++) {
    const s = at(f);
    const op = s ? s.opacity : 0;
    // speed: every corner, between consecutive frames where the element is visible
    if (s && prev && !s.swing && !prev.swing && op > 0.05 && prev.opacity > 0.05 && s.quad.length === prev.quad.length && (!opts.screen || onScreen(s.quad, opts.screen) || onScreen(prev.quad, opts.screen))) {
      let v = 0;
      s.quad.forEach((q, k) => { v = Math.max(v, Math.hypot(q.x - prev!.quad[k].x, q.y - prev!.quad[k].y)); });
      if (s.relPrev && s.relPrev.length === s.quad.length) {
        let r = 0;
        s.quad.forEach((q, k) => { r = Math.max(r, Math.hypot(q.x - s.relPrev![k].x, q.y - s.relPrev![k].y)); });
        v = Math.min(v, r);
      }
      if (v > SPEED_CAP + 0.5) note('speed', f, v, (w) => `moves ${w.toFixed(0)} px in one frame (cap ${SPEED_CAP.toFixed(0)})`);
    }
    // no visible opacity jump bigger than one sixth of the full range per frame (a 6-frame transition), wherever it
    // happens (a retired word brightening from 0.45 to 1 in a frame is a flash too)
    if (opts.maxOpacityStep !== undefined && !opts.abruptOk && !ex.has('abrupt') && Math.abs(op - (prev ? prev.opacity : 0)) > opts.maxOpacityStep + 1e-6 && (s || prev))
      note('abrupt', f, Math.abs(op - (prev ? prev.opacity : 0)), (w) => `opacity changes by ${w.toFixed(2)} in one frame (at most ${opts.maxOpacityStep!.toFixed(2)}: transitions take at least ${MIN_TRANSITION_FRAMES} frames)`);
    // visibility events, with ramp lengths for the abrupt check
    if (op <= 0.05) lastLow = f;
    if (op >= 0.95) lastHigh = f;
    const nowVis = op >= VISIBLE_THRESHOLD;
    if (nowVis && !vis) {
      events.push({f, kind: 'appear'});
      runStart = f;
      state = s?.state;
    } else if (!nowVis && vis) {
      events.push({f, kind: 'disappear'});
      const len = f - runStart;
      if (len < MIN_VISIBLE_FRAMES) note('min-visible', runStart, MIN_VISIBLE_FRAMES - len, () => `visible for only ${len} frames (needs ${MIN_VISIBLE_FRAMES})`);
    } else if (nowVis && s && s.state !== undefined && s.state !== state) {
      events.push({f, kind: 'state', state: s.state});
      state = s.state;
    }
    // abrupt: full opacity reached (or lost) in fewer frames than an entrance (exit) may take
    if (!opts.abruptOk && op >= 0.95 && f - lastLow < MIN_TRANSITION_FRAMES - 1 && lastLow > -Infinity && f - lastLow > 0)
      note('abrupt', f, f - lastLow, () => `goes from hidden to fully visible (or back) in under ${MIN_TRANSITION_FRAMES} frames`);
    if (!opts.abruptOk && op <= 0.05 && f - lastHigh < MIN_TRANSITION_FRAMES - 1 && lastHigh > -Infinity && f - lastHigh > 0)
      note('abrupt', f, f - lastHigh, () => `goes from hidden to fully visible (or back) in under ${MIN_TRANSITION_FRAMES} frames`);
    vis = nowVis;
    prev = s;
  }
  // state changes at most once per beat; no blinking (reappearing) or alternating back within two beats
  for (let k = 1; k < events.length; k++) {
    const gap = events[k].f - events[k - 1].f;
    if (gap < BEAT_FRAMES - 1) note('state-rate', events[k].f, gap, () => `changes state ${gap} frames after its last change (at most once per beat, ${BEAT_FRAMES.toFixed(0)} frames)`);
    if (events[k].kind === 'appear' && events[k - 1].kind === 'disappear' && gap < 2 * BEAT_FRAMES)
      note('flash', events[k].f, gap, () => 'disappears and comes back (blinks)');
    if (k >= 2 && events[k].kind === 'state' && events[k - 2].kind === 'state' && events[k].state === events[k - 2].state && events[k].f - events[k - 2].f < 2 * BEAT_FRAMES)
      note('flash', events[k].f, gap, () => 'alternates between two states');
  }
  for (const a of agg.values()) { const {worst, ...v} = a; void worst; out.push(v); }
  return out;
};

/** Checks screen-space graphics drawn outside TypeStage. Each element needs `from` and `to` (song seconds). */
export const validateElements = (elements: TrackedElement[]): MotionViolation[] =>
  elements.flatMap((e) => {
    if (e.from === undefined || e.to === undefined) return [{rule: 'speed' as MotionRule, element: e.id, from: 0, to: 0, frames: 0, detail: 'no from/to given; not checked'}];
    return checkTrack(e.id, e.from * FPS, e.to * FPS, (f) => e.sample(f / FPS), {exempt: e.exempt});
  });

/** Text report of motion violations. */
export const formatMotion = (title: string, v: MotionViolation[]) =>
  [`== ${title}`, ...(v.length ? v.map((x) => `   ERROR ${x.rule} ${x.element} frames ${x.from}-${x.to} (${x.frames}): ${x.detail}`) : ['   no motion violations'])].join('\n');
