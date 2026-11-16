// The built-in verb effects. Each one is registered through the registry and
// is self-contained; new effects follow the same pattern in their own files (see KIT.md, "Adding an effect").
import React from 'react';
import {FONTS, FPS, HEIGHT, PALETTE, WIDTH} from './config';
import {energyAt} from './time';
import {toWorld} from './camera';
import {Burst} from './burst';
import {blockToWorld, wordCorners, worldToBlock} from './layout';
import {FONT_FAMILY, FONT_STYLE} from './metrics';
import type {BoardLayout, Pt, VerbCue, WordGeom} from './types';
import {add, clamp, dotsPath, easeInOutSine, easeInQuad, easeOutCubic, lerp, len, polyPath, rand, rot, scale, springAt, sub} from './util';
import {ENTRANCE_SPEED_SHARE, MIN_TRANSITION_FRAMES, MIN_VISIBLE_FRAMES, framesForDistance, maxScaleDelta} from './motion';
import {getVerb, letterIdentity, registerVerb, type LetterMod, type VerbWordCtx} from './verbRegistry';
import {exitFade} from './lines';
import {retireFrame} from './wordState';

const P = <T,>(c: {cue: VerbCue}, key: string, dflt: T): T => ((c.cue.params?.[key] as T | undefined) ?? dflt);
const centre = (g: WordGeom): Pt => ({x: g.x + g.w / 2, y: g.y + g.h / 2});
const letterCentres = (g: WordGeom): Pt[] => {
  let x = g.x;
  return g.adv.map((a) => { const c = {x: x + a / 2, y: g.y + g.h / 2}; x += a; return c; });
};
const blockOf = (L: BoardLayout, i: number) => L.blocks[L.words.get(i)!.block];
const blockWords = (L: BoardLayout, i: number) => blockOf(L, i).words.map((w) => w.i);
const worldCentre = (L: BoardLayout, i: number) => {
  const c = wordCorners(blockOf(L, i), L.words.get(i)!);
  return scale(c.reduce(add, {x: 0, y: 0}), 0.25);
};
const startAtWord = (cue: VerbCue, L: BoardLayout) => L.words.get(cue.word)?.start ?? 0;
/** Letters of the affected words in reading order: returns this word's offset into that sequence. */
const letterOffset = (c: VerbWordCtx) => c.affected.slice(0, c.k).reduce((a, i) => a + (c.L.words.get(i)?.adv.length ?? 0), 0);
const totalLetters = (L: BoardLayout, words: number[]) => words.reduce((a, i) => a + (L.words.get(i)?.adv.length ?? 0), 0);
const right = (down: Pt): Pt => ({x: -down.y, y: down.x});

// explode: letters thrown radially with spin and gravity, a Burst, neighbours in the block pushed 60 px.
registerVerb('explode', {
  affects: (cue, L) => blockWords(L, cue.word),
  modify: (c) => {
    const dt = c.df / FPS;
    if (dt < 0) return null;
    const target = c.L.words.get(c.cue.word)!;
    const tc = centre(target);
    if (c.i !== c.cue.word) {
      const d = sub(centre(c.geom), tc); const D = len(d) || 1;
      const push = 60 * easeOutCubic(c.df / 8);
      return {dx: (d.x / D) * push, dy: (d.y / D) * push};
    }
    const letters: LetterMod[] = letterCentres(c.geom).map((lc, k) => {
      const d = sub(lc, {x: tc.x, y: tc.y + c.geom.h * 0.3}); const D = len(d) || 1;
      const jitter = (rand('ex', c.i, k) - 0.5) * 0.9;
      const dir = rot({x: d.x / D, y: d.y / D}, (jitter * 180) / Math.PI);
      const v = 520 + 480 * rand('exv', c.i, k);
      const g = 0.5 * 1800 * dt * dt;
      return {dx: dir.x * v * dt + c.down.x * g, dy: dir.y * v * dt + c.down.y * g, rot: (rand('exr', c.i, k) - 0.5) * 900 * dt, s: 1, opacity: 1 - clamp((dt - 0.7) / 0.4)};
    });
    return {letters};
  },
  removesAt: (c) => (c.i === c.cue.word ? c.at * FPS + 33 : null),
  overlay: (c) => {
    const dt = c.df / FPS;
    if (dt < 0 || dt > 2) return null;
    const cam = c.camAt(c.at * FPS);
    const down = rot({x: 0, y: 1}, -cam.rot);
    return <Burst seed={`explode${c.cue.word}`} count={P(c, 'count', 100)} origin={worldCentre(c.L, c.cue.word)} dt={dt}
      colours={P(c, 'colours', [PALETTE.accent2, PALETTE.highlight])} down={down} size={1 / cam.zoom} speed={[350 / cam.zoom, 1000 / cam.zoom]} gravity={1500 / cam.zoom} />;
  },
});

// vanish: letters fade out one after another in reading order, starting perLetter (2) frames apart; each letter
// fades over MIN_TRANSITION_FRAMES, so nothing blinks (motion legibility).
registerVerb('vanish', {
  modify: (c) => {
    const per = P(c, 'perLetter', 2);
    const off = letterOffset(c);
    return {letters: c.geom.adv.map((_, k) => ({...letterIdentity(), opacity: 1 - clamp((c.df - per * (off + k)) / MIN_TRANSITION_FRAMES)}))};
  },
  removesAt: (c) => c.at * FPS + P(c, 'perLetter', 2) * totalLetters(c.L, c.affected) + MIN_TRANSITION_FRAMES,
});

// closeIn (DISAPPEAR, entry 92): the letters close to nothing from both ends inward, each to its own centre line over
// `frames` (default 6), `per` frames apart (default 4), the middle letter last. params: per, frames.
registerVerb('closeIn', {
  early: true,
  modify: (c) => {
    if (c.df < 0) return null;
    const per = P(c, 'per', 4), fr = Math.max(MIN_TRANSITION_FRAMES, P(c, 'frames', 6));
    const n = c.geom.adv.length;
    return {letters: c.geom.adv.map((_, k) => {
      const u = clamp((c.df - per * Math.min(k, n - 1 - k)) / fr);
      return {...letterIdentity(), sx: Math.max(0.001, 1 - u), opacity: 1 - clamp((u - 0.5) / 0.5)};
    })};
  },
  removesAt: (c) => c.at * FPS + P(c, 'per', 4) * Math.ceil(c.L.words.get(c.i)!.adv.length / 2) + Math.max(MIN_TRANSITION_FRAMES, P(c, 'frames', 6)),
});

// closeAway (kit pass 21): closeIn that removes the word. Its letters close exactly as closeIn's; once the last has
// closed the word is hidden for good, so nothing zero-width is left lying on the board for the validator (or a later
// camera move) to find, and its reading life ends there (removesAt). params: per, frames, as closeIn.
{
  const ci = getVerb('closeIn')!;
  registerVerb('closeAway', {
    ...ci,
    modify: (c) => {
      const r = ci.removesAt!(c);
      if (r !== null && c.f >= r) return {hidden: true, opacity: 0};
      return ci.modify!(c);
    },
  });
}

// powerDown: the block collapses to a horizontal line, then a dot, then nothing.
registerVerb('powerDown', {
  affects: (cue, L) => cue.words ?? blockWords(L, cue.word),
  modify: (c) => {
    if (c.df < 0) return null;
    const pts = c.affected.flatMap((i) => wordCorners(blockOf(c.L, i), c.L.words.get(i)!));
    const C = scale(pts.reduce(add, {x: 0, y: 0}), 1 / pts.length);
    const Cl = worldToBlock(c.block, C);
    // motion legibility: collapse 8 frames, shrink to a dot 8 frames, fade over MIN_TRANSITION_FRAMES (was 4 + 3 + 2)
    const sy = lerp(1, 0.04, easeInOutSine(c.df / 8));
    const sx = lerp(1, 0.02, easeInOutSine((c.df - 8) / 8));
    const wc = centre(c.geom);
    return {sx, sy, dx: (wc.x - Cl.x) * (sx - 1), dy: (wc.y - Cl.y) * (sy - 1), opacity: 1 - clamp((c.df - 16) / MIN_TRANSITION_FRAMES), colour: c.df > 4 ? PALETTE.paper : undefined};
  },
  removesAt: (c) => c.at * FPS + 16 + MIN_TRANSITION_FRAMES,
});

// wipe: a wiper arm pivoting below the block sweeps 120 degrees and erases what it passes.
const wipeGeom = (c: {cue: VerbCue; L: BoardLayout}) => {
  const b = blockOf(c.L, c.cue.word);
  const pivot: Pt = (c.cue.params?.pivot as Pt | undefined) ?? {x: b.w / 2, y: b.h + 60};
  const words = c.cue.words ?? b.words.map((w) => w.i);
  const corners = words.filter((i) => c.L.words.has(i)).flatMap((i) => wordCorners(blockOf(c.L, i), c.L.words.get(i)!).map((p) => worldToBlock(b, p)));
  const R = Math.max(...corners.map((q) => len(sub(q, pivot)))) + 30;
  return {b, pivot, R, a0: -150, sweep: 120, frames: (c.cue.params?.frames as number | undefined) ?? 8};
};
const wipePass = (c: {cue: VerbCue; L: BoardLayout; at: number}, g: WordGeom) => {
  const {b, pivot, a0, sweep, frames} = wipeGeom(c);
  const wc = worldToBlock(b, worldCentre(c.L, g.i));
  const th = (Math.atan2(wc.y - pivot.y, wc.x - pivot.x) * 180) / Math.PI;
  return c.at * FPS + frames * clamp((th - a0) / sweep);
};
registerVerb('wipe', {
  affects: (cue, L) => cue.words ?? blockWords(L, cue.word),
  modify: (c) => ({opacity: 1 - clamp((c.f - wipePass(c, c.geom)) / MIN_TRANSITION_FRAMES)}), // erased words fade over 6 frames (brief 12.3)
  removesAt: (c) => wipePass(c, c.L.words.get(c.i)!),
  overlay: (c) => {
    const {b, pivot, R, a0, sweep, frames} = wipeGeom(c);
    if (c.df < -2 || c.df > frames + 6) return null;
    const a = a0 + sweep * easeOutCubic(c.df / frames);
    const tip = add(pivot, rot({x: R, y: 0}, a));
    const P0 = blockToWorld(b, pivot), P1 = blockToWorld(b, tip);
    const op = 1 - clamp((c.df - frames) / 6);
    return (
      <g opacity={op}>
        <line x1={P0.x} y1={P0.y} x2={P1.x} y2={P1.y} stroke={P(c, 'colour', PALETTE.paper)} strokeWidth={12} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <circle cx={P0.x} cy={P0.y} r={14} fill={P(c, 'colour', PALETTE.paper)} />
      </g>
    );
  },
});

// overtake: the cue word's block accelerates along the reading direction past params.target, which spins a quarter turn.
const overtakeDist = (c: {cue: VerbCue; L: BoardLayout}) => {
  const b = blockOf(c.L, c.cue.word);
  const target = c.cue.params?.target as number;
  const tg = c.L.words.get(target);
  if (!tg) return 0;
  const xs = wordCorners(c.L.blocks[tg.block], tg).map((p) => worldToBlock(b, p).x);
  return (c.cue.params?.dist as number | undefined) ?? Math.max(...xs) + 40;
};
// Motion legibility: the move lasts long enough that its peak screen speed stays within the entrance share of the
// speed cap at the cue-time zoom; params.frames sets a longer move, never a shorter one.
const overtakeFrames = (c: {cue: VerbCue; L: BoardLayout; camAt: (f: number) => {zoom: number}; at: number}) =>
  Math.max((c.cue.params?.frames as number | undefined) ?? 0, framesForDistance(overtakeDist(c) * c.camAt(c.at * FPS).zoom, MIN_TRANSITION_FRAMES, ENTRANCE_SPEED_SHARE));
const overtakeSpinFrames = (c: {cue: VerbCue; L: BoardLayout; camAt: (f: number) => {zoom: number}; at: number}) => {
  const tg = c.L.words.get(c.cue.params?.target as number);
  const r = tg ? Math.hypot(tg.w, tg.boxH) / 2 : 100;
  return framesForDistance((Math.PI / 2) * r * c.camAt(c.at * FPS).zoom, MIN_TRANSITION_FRAMES, ENTRANCE_SPEED_SHARE);
};
registerVerb('overtake', {
  affects: (cue, L) => [...blockWords(L, cue.word), cue.params?.target as number],
  modify: (c) => {
    if (c.df < 0) return null;
    const target = c.cue.params?.target as number;
    if (c.i === target) {
      // quarter turn eased in-out over a beat (MIN_VISIBLE_FRAMES), corners stay under the speed cap for normal word sizes
      const p = easeInOutSine((c.df - 3) / overtakeSpinFrames(c));
      return {rot: -90 * p, dx: -40 * p};
    }
    return {dx: overtakeDist(c) * easeInOutSine(c.df / overtakeFrames(c))};
  },
  overlay: (c) => {
    const F = overtakeFrames(c);
    if (c.df < 0 || c.df > F + 6) return null;
    const b = blockOf(c.L, c.cue.word);
    const dx = overtakeDist(c) * easeInOutSine(c.df / F);
    const n = 3 + Math.round(6 * energyAt(c.t));
    const op = 1 - clamp((c.df - F) / MIN_TRANSITION_FRAMES);
    const d = Array.from({length: n}, (_, k) => {
      const y = (b.h * (k + 0.5)) / n;
      const L0 = 120 + 140 * rand('ot', k);
      const a = blockToWorld(b, {x: dx - 30 - L0, y}), z = blockToWorld(b, {x: dx - 20, y});
      return `M${a.x} ${a.y}L${z.x} ${z.y}`;
    }).join('');
    return <path d={d} stroke={PALETTE.paper} strokeWidth={3} strokeLinecap="round" opacity={op} vectorEffect="non-scaling-stroke" />;
  },
});

// stretch: the word scales along one axis over its sung duration, then springs back (or holds).
registerVerb('stretch', {
  reserve: (cue) => { const a = (cue.params?.amount as number | undefined) ?? 1.5; return (cue.params?.axis ?? 'x') === 'x' ? {sx: a} : {sy: a}; },
  early: true,
  defaultAt: startAtWord,
  modify: (c) => {
    if (c.df < 0) return null;
    const amount = P(c, 'amount', 1.5), axis = P(c, 'axis', 'x');
    const until = P(c, 'until', c.geom.end) * FPS;
    const span = Math.max(1, until - c.at * FPS);
    let s: number;
    if (c.f <= until) s = lerp(1, amount, easeOutCubic(c.df / span));
    else s = P(c, 'hold', false) ? amount : 1 + (amount - 1) * (1 - springAt(c.f - until));
    return axis === 'x' ? {sx: s} : {sy: s, dy: P(c, 'anchorBottom', false) ? -(s - 1) * c.geom.h / 2 : 0};
  },
});

// sink: drop and tilt, slowly or with gravity; optional stagger across words or letter by letter.
registerVerb('sink', {
  modify: (c) => {
    const delay = c.k * P(c, 'stagger', 0);
    const d = c.df - delay;
    if (d < 0) return null;
    const dist = P(c, 'dy', c.geom.h * 1.2);
    if (P(c, 'letters', false)) {
      return {letters: c.geom.adv.map((_, k) => {
        const p = easeInQuad((d - 2 * k) / 8);
        return {...letterIdentity(), dx: c.down.x * dist * p, dy: c.down.y * dist * p, rot: P(c, 'tilt', 10) * p};
      })};
    }
    const p = clamp(d / (P(c, 'dur', 0.5) * FPS));
    const e = P(c, 'gravity', false) ? easeInQuad(p) : easeOutCubic(p);
    const s = lerp(1, P(c, 'scale', 1), e);
    return {dx: c.down.x * dist * e, dy: c.down.y * dist * e, rot: P(c, 'tilt', 10) * e, sx: s, sy: s, opacity: P(c, 'fade', false) ? 1 - p : 1};
  },
});

// burn: a Vermilion edge eats the words from a corner of the cue word; sparks rise from the front.
const CORNER = {tl: 0, tr: 1, br: 2, bl: 3} as const;
const burnGeom = (c: {cue: VerbCue; L: BoardLayout; affected: number[]; df: number}) => {
  const w = c.L.words.get(c.cue.word)!;
  const I = wordCorners(blockOf(c.L, c.cue.word), w)[CORNER[P(c, 'corner', 'bl') as keyof typeof CORNER]];
  const pts = c.affected.flatMap((i) => wordCorners(blockOf(c.L, i), c.L.words.get(i)!));
  const maxR = Math.max(...pts.map((p) => len(sub(p, I)))) + 10;
  const r = maxR * clamp(c.df / (((c.cue.dur ?? 0.3) as number) * FPS));
  return {I, r, maxR};
};
registerVerb('burn', {
  modify: (c) => {
    if (c.df < 0) return null;
    const {I, r, maxR} = burnGeom(c);
    if (r >= maxR) return {hidden: true, opacity: 0};
    const Il = worldToBlock(c.block, I);
    const g = c.geom;
    const box = `M${g.x - 6} ${g.y - 6}H${g.x + g.w + 6}V${g.y + g.boxH + 6}H${g.x - 6}Z`;
    const circ = `M${Il.x - r} ${Il.y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
    return {
      clip: box + circ,
      marks: [<circle key={`burn${c.i}`} cx={Il.x} cy={Il.y} r={Math.max(0.1, r)} fill="none" stroke={PALETTE.accent} strokeWidth={12} vectorEffect="non-scaling-stroke" />],
    };
  },
  removesAt: (c) => c.at * FPS + (c.cue.dur ?? 0.3) * FPS,
  overlay: (c) => {
    if (c.df < 0 || c.df > (c.cue.dur ?? 0.3) * FPS + 20) return null;
    const {I, r} = burnGeom(c);
    const cam = c.camAt(c.at * FPS);
    const up = rot({x: 0, y: -1}, -cam.rot);
    const pts = Array.from({length: 28}, (_, k) => {
      const born = rand('bs', k) * Math.max(1, c.df);
      const age = (c.df - born) / FPS;
      const a = rand('ba', k) * Math.PI * 2;
      const p0 = add(I, {x: Math.cos(a) * r * (born / Math.max(1, c.df)), y: Math.sin(a) * r * (born / Math.max(1, c.df))});
      return {...add(p0, scale(up, (90 * age) / cam.zoom)), r: (4 / cam.zoom) * Math.max(0, 1 - age / 0.6)};
    });
    return <path d={dotsPath(pts)} fill={PALETTE.highlight} />;
  },
});

// smoke (burn variant): letters turn to rising dots, one letter per 2 frames.
registerVerb('smoke', {
  modify: (c) => {
    const off = letterOffset(c);
    return {letters: c.geom.adv.map((_, k) => ({...letterIdentity(), opacity: 1 - clamp((c.df - 2 * (off + k)) / 3)}))};
  },
  removesAt: (c) => c.at * FPS + 2 * totalLetters(c.L, c.affected) + 3,
  overlay: (c) => {
    if (c.df < 0) return null;
    const cam = c.camAt(c.at * FPS);
    const up = rot({x: 0, y: -1}, -cam.rot);
    const side = right(rot({x: 0, y: 1}, -cam.rot));
    const pts: {x: number; y: number; r: number}[] = [];
    let n = 0;
    for (const i of c.affected) {
      const g = c.L.words.get(i)!;
      const b = c.L.blocks[g.block];
      letterCentres(g).forEach((lc, k) => {
        const age = (c.df - 2 * n) / FPS; n++;
        if (age < 0 || age > 1.4) return;
        for (let j = 0; j < 5; j++) {
          const p = blockToWorld(b, lc);
          const rise = (60 + 60 * rand('sm', i, k, j)) * age / cam.zoom;
          const sway = Math.sin(age * 5 + j) * 14 / cam.zoom;
          pts.push({...add(add(p, scale(up, rise)), scale(side, sway + (j - 2) * 6 / cam.zoom)), r: (6 - 3 * age) / cam.zoom * Math.max(0, 1 - age / 1.4)});
        }
      });
    }
    return <path d={dotsPath(pts)} fill={PALETTE.paper} opacity={0.7} />;
  },
});

// strike: a 12 px Vermilion stroke crosses each word out; the word stays readable. Motion legibility: the stroke's
// head draws within the entrance share of the speed cap (at least MIN_TRANSITION_FRAMES; was 4 frames).
registerVerb('strike', {
  modify: (c) => {
    const d = c.df - c.k * P(c, 'stagger', 0);
    if (d < 0) return null;
    const g = c.geom;
    const p = easeInOutSine(d / framesForDistance((g.w + 16) * c.camAt(c.at * FPS).zoom, MIN_TRANSITION_FRAMES, ENTRANCE_SPEED_SHARE));
    const x0 = g.x - 8, y0 = g.y + g.h * 0.58, x1 = g.x + g.w + 8, y1 = g.y + g.h * 0.42;
    return {marks: [<line key={`strike${c.i}`} x1={x0} y1={y0} x2={lerp(x0, x1, p)} y2={lerp(y0, y1, p)} stroke={P(c, 'colour', PALETTE.accent)}
      strokeWidth={P(c, 'width', 12)} strokeLinecap="round" vectorEffect="non-scaling-stroke" />]};
  },
});

// fling: thrown along a parabola out of frame.
registerVerb('fling', {
  modify: (c) => {
    const dt = c.df / FPS;
    if (dt < 0) return null;
    // defaults slowed for motion legibility (were 900, -1300, 2600, spin 540): about 29 world px per frame at most
    const vx = P(c, 'vx', 500), vy = P(c, 'vy', -700), g = P(c, 'gravity', 900);
    const r = right(c.down);
    const off = add(scale(r, vx * dt), scale(c.down, vy * dt + 0.5 * g * dt * dt));
    return {dx: off.x, dy: off.y, rot: P(c, 'spin', 180) * dt, opacity: 1 - clamp((dt - 1.2) / 0.2)};
  },
  removesAt: (c) => c.at * FPS + 1.4 * FPS,
});

// rush: flies from a vanishing point to readable size, holds, then swells slightly and fades. Motion legibility: the
// approach lasts as long as its distance needs within the entrance share of the speed cap (`approach` can lengthen it,
// up to RUSH_MAX_LEAD frames), eased in and out; the exit no longer flies past the camera (that could not stay under
// the cap) but grows at most what the cap allows (`past` is the ceiling) while fading over `exit` frames.
const RUSH_MAX_LEAD = 90;
registerVerb('rush', {
  early: true,
  replacesEnter: true,
  defaultAt: startAtWord,
  lead: RUSH_MAX_LEAD,
  modify: (c) => {
    const hold = P(c, 'hold', MIN_VISIBLE_FRAMES), exit = Math.max(MIN_TRANSITION_FRAMES, P(c, 'exit', 14));
    const cam = c.camAt(c.at * FPS);
    const vp = worldToBlock(c.block, toWorld(cam, P(c, 'vp', {x: WIDTH / 2, y: HEIGHT * 0.42})));
    const wc = centre(c.geom);
    const diag = Math.hypot(c.geom.w, c.geom.h) * cam.zoom;
    // never longer than the time since the board appeared (the approach would otherwise be cut in mid-flight); when
    // that limit bites the approach can exceed the cap, and the validator reports it
    const room = Math.max(MIN_TRANSITION_FRAMES, Math.floor(c.at * FPS - c.L.board.start * FPS));
    const approach = Math.min(RUSH_MAX_LEAD, room, Math.max(P(c, 'approach', 14), framesForDistance(len(sub(wc, vp)) * cam.zoom + diag / 2, MIN_TRANSITION_FRAMES, ENTRANCE_SPEED_SHARE)));
    if (c.df < -approach) return {opacity: 0};
    if (c.df < 0) {
      const p = clamp((c.df + approach) / approach), e = easeInOutSine(p);
      const s = lerp(0.05, 1, e);
      const pos = {x: lerp(vp.x, wc.x, e), y: lerp(vp.y, wc.y, e)};
      return {sx: s, sy: s, dx: pos.x - wc.x, dy: pos.y - wc.y, opacity: clamp((c.df + approach) / Math.max(MIN_TRANSITION_FRAMES, approach / 3))};
    }
    if (c.df <= hold) return null;
    const q = clamp((c.df - hold) / exit);
    const s = 1 + Math.min(P(c, 'past', 6) - 1, maxScaleDelta(diag, exit)) * easeInOutSine(q);
    return {sx: s, sy: s, opacity: 1 - easeInOutSine(q), hidden: q >= 1};
  },
  removesAt: (c) => c.at * FPS + P(c, 'hold', MIN_VISIBLE_FRAMES) + Math.max(MIN_TRANSITION_FRAMES, P(c, 'exit', 14)),
});

// bite: zigzag teeth close on the word and leave a notch.
const notch = (g: WordGeom, depth: number, at: number) => {
  const bw = g.w * 0.3, nx = g.x + g.w * at;
  const pts: Pt[] = [{x: nx - bw / 2, y: g.y - 40}];
  const teeth = 5;
  for (let k = 0; k <= teeth * 2; k++) pts.push({x: nx - bw / 2 + (bw * k) / (teeth * 2), y: g.y + g.h * (k % 2 ? depth : depth - 0.18)});
  pts.push({x: nx + bw / 2, y: g.y - 40});
  return pts;
};
registerVerb('bite', {
  modify: (c) => {
    if (c.df < 0) return null;
    const g = c.geom;
    const at = P(c, 'position', 0.75);
    const close = c.df < 3 ? easeOutCubic(c.df / 3) : 1 - easeOutCubic((c.df - 3) / 4);
    const jaw = notch(g, 0.5, at).map((p) => ({x: p.x, y: p.y - (1 - close) * g.h * 0.9}));
    const marks = c.df < 8 ? [<path key={`bite${c.i}`} d={polyPath(jaw)} fill={P(c, 'colour', PALETTE.paper)} opacity={0.95} />] : [];
    if (c.df < 3) return {marks};
    const box = `M${g.x - 6} ${g.y - 60}H${g.x + g.w + 6}V${g.y + g.boxH + 6}H${g.x - 6}Z`;
    return {clip: box + polyPath(notch(g, 0.5, at)), marks};
  },
});

// count: digits roll, zeros accrue, or a list of values steps on given times; drawn under the word by default.
registerVerb('count', {
  early: true,
  defaultAt: startAtWord,
  modify: (c) => {
    if (c.df < 0 || c.i !== c.cue.word) return null;
    const mode = P<string>(c, 'mode', 'roll');
    let text = '';
    if (mode === 'accrue') {
      const n = Math.min(P(c, 'zeros', 12), Math.floor(c.df / P(c, 'framesPer', 1)) + 1);
      text = P(c, 'base', '') + '0'.repeat(n);
    } else if (mode === 'steps') {
      const values = P<string[]>(c, 'values', []), times = P<number[]>(c, 'times', []);
      let k = -1; times.forEach((tt, j) => { if (c.t >= tt) k = j; });
      text = k >= 0 ? values[k] : '';
    } else {
      const from = P(c, 'from', 0), to = P(c, 'to', 100);
      const v = Math.round(lerp(from, to, easeOutCubic(c.df / ((c.cue.dur ?? 0.5) * FPS))));
      text = P(c, 'prefix', '') + (P(c, 'comma', false) ? v.toLocaleString('en-US') : String(v)) + P(c, 'suffix', '');
    }
    if (!text) return null;
    const g = c.geom;
    const size = P(c, 'size', g.size * 0.35);
    // The counter is set in the word's connectives font (a condensed face beside a heavy one), else the word's font.
    const countFont = P<string>(c, 'font', FONTS[g.font]?.connectives ?? g.font);
    const anchor = P<'start' | 'middle' | 'end'>(c, 'anchor', 'start');
    const off = P<Pt>(c, 'offset', {x: anchor === 'middle' ? g.w / 2 : 0, y: g.boxH + size * 0.95});
    return {marks: [<text key={`count${c.i}`} x={g.x + off.x} y={g.y + off.y} fontFamily={FONT_FAMILY[countFont]} fontWeight={FONT_STYLE[countFont].fontWeight}
      fontSize={size} fill={P(c, 'colour', PALETTE.paper)} textAnchor={anchor}>{text}</text>]};
  },
});

// brake: words compress to 80 percent width (left-anchored) with skid marks behind them. params: squash (default 0.2;
// entry 97 uses 0.08), skid (length in px, default 120), width (skid stroke in world px, default 8: Fable item 42 found
// 3 px hairlines nobody reads), stay (true: the skid marks keep their opacity while the word is read). Ruling 198: the
// skid marks fade over 6 frames when the word retires (they used to stay on the board with it for good).
const skidGeom = (c: VerbWordCtx) => {
  const d = c.df - c.k * P(c, 'stagger', 0);
  if (d < 0) return null;
  const g = c.geom;
  // skid 0 drops the marks (ruling 198: drawn along a row that drives up a road they read as hash marks)
  if (!(P(c, 'skid', 120) > 0)) return {d, op: 0, W: 0, segs: [] as {a: Pt; b: Pt}[]};
  const Ls = P(c, 'skid', 120) * easeOutCubic(d / 6);
  const W = P(c, 'width', 8);
  const fade = exitFade(c.f, retireFrame(c.L.board, c.i));
  const op = (P(c, 'stay', false) ? 0.6 : lerp(0.6, 0.25, clamp((d - 12) / 18))) * fade;
  const segs = [0, 1].map((k) => ({a: {x: g.x - Ls - 10 * k, y: g.baseline + 8 + W / 2 + (9 + W) * k}, b: {x: g.x - 4, y: g.baseline + 8 + W / 2 + (9 + W) * k}}));
  return {d, op, W, segs};
};
registerVerb('brake', {
  modify: (c) => {
    const s = skidGeom(c);
    if (!s) return null;
    const g = c.geom;
    const sx = lerp(1, 1 - P(c, 'squash', 0.2), easeOutCubic(s.d / 4));
    const skid = s.op <= 0.003 ? [] : s.segs.map((q, k) => <line key={`skid${c.i}${k}`} x1={q.a.x} y1={q.a.y} x2={q.b.x} y2={q.b.y}
      stroke={PALETTE.paper} strokeWidth={s.W} opacity={s.op} />);
    return {sx, dx: -(1 - sx) * g.w / 2, marks: skid};
  },
  // the skids in world px for the validator (ruling 198); drawn as the word's marks above from the same skidGeom
  lines: (c) => c.affected.flatMap((i, k) => {
    const g = c.L.words.get(i)!;
    const block = c.L.blocks[g.block];
    const s = skidGeom({...c, i, k, geom: g, block, down: {x: 0, y: 1}});
    if (!s || s.op <= 0.003) return [];
    return s.segs.map((q, j) => ({id: `skid ${i}.${j}`, kind: 'skid' as const, a: blockToWorld(block, q.a), b: blockToWorld(block, q.b), width: s.W, opacity: s.op, owner: [i]}));
  }),
});

// custom: params.fn(ctx) returns a partial WordMod. For scene one-offs (tear, gap, ransom, focus, jostle, anaphora).
registerVerb('custom', {
  early: true,
  modify: (c) => {
    const fn = c.cue.params?.fn as ((x: VerbWordCtx) => ReturnType<NonNullable<Parameters<typeof registerVerb>[1]['modify']>>) | undefined;
    return fn ? fn(c) : null;
  },
});

// ------------------------------------------------------------------ amendment effects K6 to K9

/** Path of a carried object: lift 12 px, shallow arc (apex 60) to the target, ease-in-out. Offsets from `from`. */
export const carryOffset = (from: Pt, to: Pt, df: number, up: Pt, o: {frames?: number; lift?: number; apex?: number} = {}): Pt => {
  const frames = o.frames ?? 10, lift = o.lift ?? 12, apex = o.apex ?? 60;
  const p = clamp(df / frames);
  const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  const h = lift * clamp(df / 2) * (1 - e) + apex * 4 * e * (1 - e);
  return add(scale(sub(to, from), e), scale(up, h));
};
const carryTarget = (c: {cue: VerbCue; L: BoardLayout}): Pt | null => {
  const to = c.cue.params?.to as Pt | undefined;
  const toWord = c.cue.params?.toWord as number | undefined;
  const off = (c.cue.params?.offset as Pt | undefined) ?? {x: 0, y: 0};
  if (to) return to;
  if (toWord !== undefined && c.L.words.has(toWord)) return add(worldCentre(c.L, toWord), off);
  return null;
};
// carry (K6): the landed word travels on a shallow arc to params.to (world point for its centre) or under params.toWord.
registerVerb('carry', {
  minDelay: 8,
  defaultAt: (cue, L) => (L.words.get(cue.word)?.start ?? 0) + 8 / FPS,
  modify: (c) => {
    if (c.df < 0) return null;
    const T = carryTarget(c);
    if (!T) return null;
    const frames = P(c, 'frames', 10);
    const from = centre(c.geom);
    const off = carryOffset(from, worldToBlock(c.block, T), c.df, {x: -c.down.x, y: -c.down.y}, {frames});
    const sq = c.df >= frames && c.df < frames + 2 ? 1 : 0;
    return {dx: off.x, dy: off.y, sx: 1 + 0.06 * sq, sy: 1 - 0.06 * sq};
  },
  overlay: (c) => {
    const n = Math.min(6, P(c, 'trail', 0));
    if (!n || c.df < 0) return null;
    const T = carryTarget(c);
    if (!T) return null;
    const frames = P(c, 'frames', 10);
    const from = worldCentre(c.L, c.cue.word);
    const cam = c.camAt(c.at * FPS);
    const up = rot({x: 0, y: -1}, -cam.rot);
    const coins: React.ReactNode[] = [];
    for (let k = 1; k <= n; k++) {
      const d = c.df - 2 * k;
      if (d < 0 || d > frames) continue;
      const p = add(from, carryOffset(from, T, d, up, {frames}));
      coins.push(<g key={k}><circle cx={p.x} cy={p.y} r={14 / cam.zoom} fill={PALETTE.highlight} /><circle cx={p.x} cy={p.y} r={14 / cam.zoom} fill="none" stroke={PALETTE.shadow} strokeWidth={2 / cam.zoom} /></g>);
    }
    return <g>{coins}</g>;
  },
});

// converge (K7, replaces the focus blur): the word lands as two copies 14 px apart that fade in and slide together over
// `frames` (default and minimum MIN_TRANSITION_FRAMES), landing on the word's start frame. Motion legibility: it used
// to start at half opacity in one frame after the sung start and the word showed before the cue (fixed in wordState).
registerVerb('converge', {
  early: true,
  replacesEnter: true,
  defaultAt: startAtWord,
  lead: MIN_TRANSITION_FRAMES,
  modify: (c) => {
    const F = Math.max(MIN_TRANSITION_FRAMES, P(c, 'frames', MIN_TRANSITION_FRAMES));
    const p = easeInOutSine((c.df + F) / F);
    if (p <= 0) return {opacity: 0};
    const off = P(c, 'offset', 14) * (1 - p);
    const op = p * lerp(0.5, 1, p);
    return {dx: off, opacity: op, ghosts: p < 1 ? [{dx: -off, dy: 0, opacity: op}] : undefined};
  },
});

// shove (K8): the cue word (incoming) takes params.target's place; the target slides to params.to (world point for its
// centre) in 6 frames, scaling to 0.5 and dimming to 50 percent, and stays until the board clears.
registerVerb('shove', {
  early: true,
  defaultAt: startAtWord,
  affects: (cue) => [cue.params?.target as number],
  overlapExempt: (cue) => [[cue.word, cue.params?.target as number]],
  modify: (c) => {
    if (c.df < 0) return null;
    const to = c.cue.params?.to as Pt | undefined;
    const p = easeOutCubic(c.df / P(c, 'frames', 6));
    const from = centre(c.geom);
    const T = to ? worldToBlock(c.block, to) : from;
    const s = lerp(1, P(c, 'scale', 0.5), p);
    return {dx: (T.x - from.x) * p, dy: (T.y - from.y) * p, sx: s, sy: s, opacity: lerp(1, 0.5, p), keepAlive: true};
  },
});

/** Fake-perspective hinge about a vertical line x = edgeX: returns the SVG transform for a panel turned by `angle` degrees. */
export const hingeTransform = (edgeX: number, angle: number, skewSign = 1) => {
  const c = Math.cos((angle * Math.PI) / 180);
  const skew = 2.3 * Math.sin((angle * Math.PI) / 180) * skewSign;
  return `translate(${edgeX} 0) skewY(${skew}) scale(${c} 1) translate(${-edgeX} 0)`;
};
// hinge (K9): words (or a letter range of one word) rotate about a vertical edge in fake perspective over 6 frames.
// params: edge 'left' | 'right', angle (degrees, default 160), frames, letters [first, last], slide (px outward).
registerVerb('hinge', {
  modify: (c) => {
    if (c.df < 0) return null;
    const ang = P(c, 'angle', 160) * easeOutCubic(c.df / P(c, 'frames', 6));
    const cs = Math.cos((ang * Math.PI) / 180);
    const edgeLeft = P(c, 'edge', 'left') === 'left';
    const skew = 2.3 * Math.sin((ang * Math.PI) / 180) * (edgeLeft ? -1 : 1);
    const slide = P(c, 'slide', 0) * easeOutCubic(c.df / P(c, 'frames', 6)) * (edgeLeft ? 1 : -1);
    const range = c.cue.params?.letters as [number, number] | undefined;
    if (range) {
      const lc = letterCentres(c.geom);
      let x0 = c.geom.x; for (let k = 0; k < range[0]; k++) x0 += c.geom.adv[k];
      let x1 = x0; for (let k = range[0]; k <= range[1]; k++) x1 += c.geom.adv[k];
      const edgeX = edgeLeft ? x0 : x1;
      return {letters: c.geom.adv.map((_, k) => (k < range[0] || k > range[1] ? letterIdentity()
        : {...letterIdentity(), dx: edgeX + (lc[k].x - edgeX) * cs - lc[k].x + slide, sx: Math.max(0.02, Math.abs(cs))}))};
    }
    const xs = c.affected.flatMap((i) => wordCorners(blockOf(c.L, i), c.L.words.get(i)!).map((p) => worldToBlock(c.block, p).x));
    const edgeX = edgeLeft ? Math.min(...xs) : Math.max(...xs);
    const wc = centre(c.geom);
    return {dx: edgeX + (wc.x - edgeX) * cs - wc.x + slide, sx: Math.max(0.02, Math.abs(cs)), skewY: skew};
  },
});
