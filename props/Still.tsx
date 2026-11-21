// Still: a copper pot still (Sweet Distillation storyboard item 54, a hero prop). An iron firebox with a fire door, a
// riveted copper onion pot on it, a smaller onion helmet with a gauge, the swan neck arching over to the right and
// down to a spout, and an upright open-topped feed hopper on the pot's left shoulder (`hopper: 'chute'` and `'funnel'` give the
// earlier versions; `feeding` draws a book half inside it). `fire` lights the flames behind the fire door; with the funnel, `feed` opens its lid and
// `bubble` lifts the lid 3 px (a board sets it once a beat).
import React from 'react';
import {clamp} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, f1, mix, place, propGraphic, propPoint, propQuad, propTransform, rrectPath, strokeOf} from './common';
import {type RoleColours, roleColours} from './roles';

/** Natural size: 400 wide (x -200 to 200; the hopper and its open lid reach x -236), 510 tall (y -510 to 0). `size` is
 *  the 400 width. */
export const STILL_SIZE = {w: 400, h: 510};
const CX = -25; // pot axis
const SPOUT = {x: 182, y: -192};
const HOP = {x: CX - 118, y: -300, angle: -28}; // 'funnel' hopper throat on the pot shoulder, tilted out to the left
const CHUTE = {x: CX - 100, y: -318, angle: -20}; // 'chute' hopper throat, a little higher on the shoulder
/** The chute's open mouth: 144 across inside the rim, wider than a 120 px Book's short side at the 380 px Still. */
const CHUTE_MOUTH = {x: 0, y: -84};
/** 'box' hopper (Fable loop 2 fix 4): upright, standing on the left shoulder, its bottom here; opening 172 across the rim. */
const BOX = {x: CX - 140, y: -292};
const BOX_MOUTH = {x: 0, y: -97};
export interface StillProps extends PropBase {
  /** Colour overrides: the roles of roles.ts (propColours' roles plus `edge` and `syrup`). */
  colours?: Partial<RoleColours>;
  /** 0 to 1: flames behind the fire door (0 cold and dark). */
  fire?: number;
  /** Flame flicker phase (any number; a board passes song seconds times 10 or so). */
  flicker?: number;
  /** 0 to 1: the hopper lid swings open (75 degrees at 1). */
  feed?: number;
  /** 0 to 1: the lid lifts 3 design units (the pot bubbling). */
  bubble?: number;
  /** 'box' (default since Fable loop 2, 17 Nov 2026): an upright open-topped hopper on the pot's left shoulder, wider
   *  at the top, a dark Ink opening seen from slightly above with a rim all round, 172 across (156 inside); `feeding` is
   *  drawn inside it. 'chute' (the loop 1 version): an open square hopper on the pot's shoulder, its dark mouth
   *  wider than a book's short side, no lid or lever; `feed` and `bubble` do nothing to it. 'funnel': the earlier side
   *  funnel with a hinged lid (feed opens it, bubble lifts it). */
  hopper?: 'chute' | 'funnel' | 'box';
  /** World-space content drawn inside the 'box' hopper's opening, behind its front wall (a book half in the hopper). */
  feeding?: React.ReactNode;
}
const stillPlace = (p: StillProps) => place(p, STILL_SIZE.w);
const potD = (cx: number) =>
  `M${cx - 104} -132C${cx - 168} -162 ${cx - 182} -292 ${cx - 62} -334L${cx + 62} -334C${cx + 182} -292 ${cx + 168} -162 ${cx + 104} -132Z`;
const helmetD = (cx: number) =>
  `M${cx - 50} -352C${cx - 96} -372 ${cx - 84} -428 ${cx - 20} -444L${cx + 20} -444C${cx + 84} -428 ${cx + 96} -372 ${cx + 50} -352Z`;
const NECK = `M${CX} -440C${CX} -500 ${CX + 128} -512 ${SPOUT.x - 14} -430C${SPOUT.x + 2} -390 ${SPOUT.x} -300 ${SPOUT.x} -214`;
/** Hopper geometry in its own frame (throat at 0, 0, mouth up). */
const HOPPER_D = 'M-16 0L16 0L46 -62L-46 -62Z';

/** A copper pot still on a firebox. Anchor: bottom centre of the firebox. */
export const Still: React.FC<StillProps> = (p) => {
  const q = stillPlace(p);
  const sw = strokeOf(q);
  const C = roleColours(p.colours);
  const copper = C.body, copperLight = mix(C.body, C.paper, 0.38), copperDark = mix(C.body, C.ground, 0.32);
  const iron = C.ground, ironDetail = C.muted;
  const fire = clamp(p.fire ?? 0);
  const fl = p.flicker ?? 0;
  const lid = 75 * clamp(p.feed ?? 0);
  const lift = 3 * clamp(p.bubble ?? 0);
  const E = {stroke: C.edge, strokeWidth: sw, strokeLinejoin: 'round' as const};
  const rivets = (y: number, x0: number, x1: number, n: number, r = 3.2) =>
    Array.from({length: n}, (_, k) => <circle key={k} cx={x0 + ((x1 - x0) * (k + 0.5)) / n} cy={y} r={r} fill={copperDark} />);
  // flame tongues: an outer accent flame and an inner highlight flame, their tips swaying with the flicker phase
  const tongue = (x: number, w: number, h: number, ph: number) => {
    const sway = 6 * Math.sin(fl * 1.7 + ph);
    const top = -28 - h * fire * (0.85 + 0.15 * Math.sin(fl * 2.3 + ph * 1.9));
    return `M${f1(x - w / 2)} -28C${f1(x - w / 2)} ${f1(-28 - h * 0.4 * fire)} ${f1(x + sway - w * 0.2)} ${f1(top + 14)} ${f1(x + sway)} ${f1(top)}C${f1(x + sway + w * 0.2)} ${f1(top + 14)} ${f1(x + w / 2)} ${f1(-28 - h * 0.4 * fire)} ${f1(x + w / 2)} -28Z`;
  };
  const box = (p.hopper ?? 'box') === 'box';
  const at = `translate(${BOX.x} ${BOX.y})`;
  return (
    <g opacity={p.opacity ?? 1}>
    <g transform={propTransform(q)}>
      {/* the swan neck: drawn first so the helmet sits over its root */}
      <path d={NECK} fill="none" stroke={C.edge} strokeWidth={24 + 2 * sw} strokeLinecap="butt" strokeLinejoin="round" />
      <path d={NECK} fill="none" stroke={copper} strokeWidth={24} strokeLinecap="butt" strokeLinejoin="round" />
      <path d={NECK} fill="none" stroke={copperLight} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" transform="translate(-5 -4)" opacity={0.9} />
      {/* spout: a collar and a downturned nozzle */}
      <path d={rrectPath(SPOUT.x - 18, -226, 36, 14, 3)} fill={copperDark} {...E} />
      <path d={`M${SPOUT.x - 9} -212L${SPOUT.x + 9} -212L${SPOUT.x + 6} ${SPOUT.y}L${SPOUT.x - 6} ${SPOUT.y}Z`} fill={copper} {...E} />
      {/* firebox: iron box on two feet, a top plate, a fire door with a grate */}
      <path d="M-112 -6L-100 0L-80 0L-74 -6ZM74 -6L80 0L100 0L112 -6Z" fill={iron} {...E} />
      <path d={rrectPath(-120, -124, 240, 118, 6)} fill={iron} {...E} />
      <path d={rrectPath(-136, -136, 272, 16, 4)} fill={iron} {...E} />
      {rivets(-112, -112, 112, 8, 3).map((r, k) => React.cloneElement(r, {key: `fb${k}`, fill: ironDetail}))}
      <path d="M-50 -24V-74A50 32 0 0 1 50 -74V-24Z" fill={fire > 0 ? mix(C.ground, C.accent, 0.35) : mix(C.ground, C.paper, 0.08)} stroke={ironDetail} strokeWidth={sw * 0.7} />
      {fire > 0 && (
        <g>
          <path d={tongue(-24, 30, 52, 0) + tongue(2, 36, 66, 1.3) + tongue(26, 28, 48, 2.6)} fill={C.accent} />
          <path d={tongue(-22, 16, 30, 0.6) + tongue(2, 20, 42, 2.0) + tongue(24, 14, 28, 3.1)} fill={C.highlight} />
        </g>
      )}
      <path d="M-44 -30H44M-44 -38H44" stroke={ironDetail} strokeWidth={3} />
      <path d="M-50 -24V-74A50 32 0 0 1 50 -74V-24Z" fill="none" stroke={C.edge} strokeWidth={sw * 0.6} />
      {/* hopper on the left shoulder, behind the pot outline at its throat */}
      {(p.hopper ?? 'box') === 'box' ? null : (p.hopper ?? 'box') === 'chute' ? (
        <g transform={`translate(${CHUTE.x} ${CHUTE.y}) rotate(${CHUTE.angle})`}>
          <path d={rrectPath(-30, -4, 60, 26, 4)} fill={copperDark} {...E} />
          <path d="M-30 0L30 0L72 -70L-72 -70Z" fill={copper} {...E} />
          <path d="M-22 -10L-58 -62" stroke={copperLight} strokeWidth={6} strokeLinecap="round" />
          <path d="M-80 -70L80 -70L66 -96L-66 -96Z" fill={copperDark} {...E} />
          <path d="M-68 -74L68 -74L58 -92L-58 -92Z" fill={C.ground} />
          {rivets(-62, -60, 60, 5, 2.8)}
        </g>
      ) : (
      <g transform={`translate(${HOP.x} ${HOP.y}) rotate(${HOP.angle})`}>
        <path d="M-12 22L12 22L16 0L-16 0Z" fill={copperDark} {...E} />
        <path d={HOPPER_D} fill={copper} {...E} />
        <path d="M-40 -50L40 -50" stroke={copperLight} strokeWidth={4} strokeLinecap="round" />
        <g transform={`translate(-48 ${f1(-64 - lift)}) rotate(${f1(-lid)})`}>
          <path d={rrectPath(0, -8, 96, 10, 3)} fill={copperDark} {...E} />
          <circle cx={78} cy={-12} r={5} fill={copperDark} stroke={C.edge} strokeWidth={sw * 0.6} />
        </g>
      </g>
      )}
      {/* the onion pot */}
      <path d={potD(CX)} fill={copper} {...E} />
      <path d={`M${CX - 122} -180C${CX - 148} -230 ${CX - 128} -290 ${CX - 80} -314`} fill="none" stroke={copperLight} strokeWidth={9} strokeLinecap="round" />
      <path d={`M${CX - 160} -236Q${CX} -214 ${CX + 160} -236`} fill="none" stroke={copperDark} strokeWidth={4} />
      {rivets(-228, CX - 140, CX + 140, 11)}
      <path d={`M${CX - 112} -150Q${CX} -138 ${CX + 112} -150`} fill="none" stroke={copperDark} strokeWidth={3} />
      {/* collar, helmet, gauge */}
      <path d={rrectPath(CX - 64, -354, 128, 22, 4)} fill={copperDark} {...E} />
      <path d={helmetD(CX)} fill={copper} {...E} />
      <path d={`M${CX - 62} -380C${CX - 66} -404 ${CX - 50} -424 ${CX - 30} -432`} fill="none" stroke={copperLight} strokeWidth={6} strokeLinecap="round" />
      {rivets(-360, CX - 46, CX + 46, 6, 2.6)}
      <circle cx={CX + 40} cy={-398} r={15} fill={C.paper} stroke={C.edge} strokeWidth={sw * 0.6} />
      <path d={`M${CX + 40} -398L${CX + 49} -406`} stroke={C.accent} strokeWidth={3} strokeLinecap="round" />
      {/* the 'box' hopper: back of the rim and the dark opening (drawn over the helmet's edge) */}
      {box && (
        <g transform={at}>
          <path d="M-86 -86L86 -86L74 -110L-74 -110Z" fill={copperDark} {...E} />
          <path d="M-76 -90L76 -90L67 -106L-67 -106Z" fill={C.edge} />
        </g>
      )}
    </g>
    {box && p.feeding}
    {box && (
      <g transform={propTransform(q)}>
        <g transform={at}>
          <path d={rrectPath(-40, -8, 80, 22, 4)} fill={copperDark} {...E} />
          <path d="M-38 0L38 0L82 -86L-82 -86Z" fill={copper} {...E} />
          <path d="M-30 -12L-66 -76" stroke={copperLight} strokeWidth={7} strokeLinecap="round" />
          {rivets(-46, -54, 54, 5, 2.8)}
          <path d={rrectPath(-88, -92, 176, 12, 3)} fill={copperDark} {...E} />
        </g>
      </g>
    )}
    </g>
  );
};
export const stillQuad = (p: StillProps): Pt[] => propQuad(stillPlace(p), {x: -256, y: -515, w: 456, h: 515});
/** World point at the tip of the spout (where the Hose starts and drops fall from). */
export const stillSpout = (p: StillProps): Pt => propPoint(stillPlace(p), SPOUT);
/** World point at the centre of the hopper's mouth (where books go in). */
export const stillHopper = (p: StillProps): Pt => {
  if ((p.hopper ?? 'box') === 'box') return propPoint(stillPlace(p), {x: BOX.x + BOX_MOUTH.x, y: BOX.y + BOX_MOUTH.y});
  const chute = p.hopper === 'chute';
  const H = chute ? CHUTE : HOP;
  const a = (H.angle * Math.PI) / 180;
  const v = chute ? CHUTE_MOUTH : {x: 0, y: -62};
  return propPoint(stillPlace(p), {x: H.x + v.x * Math.cos(a) - v.y * Math.sin(a), y: H.y + v.x * Math.sin(a) + v.y * Math.cos(a)});
};
export const stillGraphic = (o: PropGraphicOpts<StillProps>): DecorGraphic => propGraphic(o, Still, stillQuad);
