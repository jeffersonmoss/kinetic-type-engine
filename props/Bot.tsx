// Bot: a small robot, the stand-in for Claude, ChatGPT and the new AIs in Sweet Distillation (storyboard item 56).
// Rounded square head with two round eyes and a mouth slot, a funnel for an antenna (what goes in), a neck, a body with
// a chest panel, jointed arms with round hands, two legs with feet. It can be an empty shell (a dashed outline, filling
// with Syrup from the feet up as `fill` rises) or, at `fill` 1, solid in its `tone`. Poses: stand, armsUp, read (an
// open book or an answer slip held at the chest), sip (a striped straw from its mouth, down and to the right).
import React, {useId} from 'react';
import {clamp, lerp} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, circlePath, f1, mix, place, polyD, propGraphic, propPoint, propQuad, propTransform, rrectPath, strokeOf} from './common';
import {Book} from './Book';
import {type RoleColours, partialDash, roleColours, rrectPerimeter} from './roles';

export type BotPose = 'stand' | 'armsUp' | 'read' | 'sip';
/** Natural size: 190 tall (feet at y 0, funnel rim at y -190), about 100 wide standing. `size` is the 190 height. */
export const BOT_SIZE = {h: 190};
export interface BotProps extends PropBase {
  /** Colour overrides: the roles of roles.ts (propColours' roles plus `edge` and `syrup`). */
  colours?: Partial<RoleColours>;
  /** Body colour when solid, and the colour of the dashed shell outline (default the accent role). */
  tone?: string;
  /** 0 to 1: Syrup level inside the shell, from the feet up; at 1 the Bot is solid `tone`. Default 1. */
  fill?: number;
  /** 0 to 1: eyes lit (highlight) or dark (ground). Default 1. */
  lit?: number;
  /** 0 to 1: the mouth slot opens. */
  mouth?: number;
  pose?: BotPose;
  /** Pose being moved toward and how far (0 to 1, eased by the board): arms and head blend between the two. */
  to?: BotPose;
  p?: number;
  /** In the read pose: what is held (default 'book'). */
  holds?: 'book' | 'slip' | 'none';
  /** Cover colour of the held book (default the paper role mixed toward the tone). */
  bookCover?: string;
  /** How the read pose holds the book: 'up' (default since 17 Nov 2026, Fable gate fix 8) open and upright at the chest
   *  like the answer slip, two pages of print facing the viewer; 'flat' the earlier open Book lying across the hands. */
  bookHold?: 'up' | 'flat';
  /** 0 to 1: a domino mask drops onto the eyes (at 1 it sits on them). */
  mask?: number;
  /** 0 to 1: how much of the outline is drawn (dashed while a shell, solid when full). Default 1. */
  dash?: number;
}
const botPlace = (p: BotProps) => place(p, BOT_SIZE.h);

// joint angles, degrees from straight down, positive away from the body; [upper, fore] per arm, plus a head turn
interface Arms {lu: number; lf: number; ru: number; rf: number; head: number}
const POSE: Record<BotPose, Arms> = {
  stand: {lu: 12, lf: 6, ru: 12, rf: 6, head: 0},
  armsUp: {lu: 148, lf: 162, ru: 148, rf: 162, head: 0},
  read: {lu: 18, lf: -96, ru: 18, rf: -96, head: 0},
  sip: {lu: 12, lf: 6, ru: 26, rf: -142, head: 6},
};
const SHOULDER = {x: 46, y: -94}, UPPER = 30, FORE = 27, ARM_W = 13, HAND_R = 8.5;
const EYE = {x: 17, y: -142, r: 10};
const MOUTH = {y: -127};
const blendPose = (p: BotProps): Arms => {
  const a = POSE[p.pose ?? 'stand'], b = POSE[p.to ?? p.pose ?? 'stand'], k = clamp(p.p ?? 0);
  return {lu: lerp(a.lu, b.lu, k), lf: lerp(a.lf, b.lf, k), ru: lerp(a.ru, b.ru, k), rf: lerp(a.rf, b.rf, k), head: lerp(a.head, b.head, k)};
};
const dirOut = (deg: number, side: 1 | -1): Pt => ({x: side * Math.sin((deg * Math.PI) / 180), y: Math.cos((deg * Math.PI) / 180)});
const armPts = (A: Arms) => {
  const arm = (side: 1 | -1, u: number, f: number) => {
    const s = {x: side * SHOULDER.x, y: SHOULDER.y};
    const du = dirOut(u, side), df = dirOut(f, side);
    const e = {x: s.x + du.x * UPPER, y: s.y + du.y * UPPER};
    const h = {x: e.x + df.x * FORE, y: e.y + df.y * FORE};
    return {s, e, h};
  };
  return {L: arm(-1, A.lu, A.lf), R: arm(1, A.ru, A.rf)};
};
/** Closed capsule path from a to b, radius r, and its perimeter. */
const capsule = (a: Pt, b: Pt, r: number): {d: string; per: number} => {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1e-3;
  const nx = (-dy / L) * r, ny = (dx / L) * r;
  const d = `M${f1(a.x + nx)} ${f1(a.y + ny)}L${f1(b.x + nx)} ${f1(b.y + ny)}A${r} ${r} 0 0 0 ${f1(b.x - nx)} ${f1(b.y - ny)}L${f1(a.x - nx)} ${f1(a.y - ny)}A${r} ${r} 0 0 0 ${f1(a.x + nx)} ${f1(a.y + ny)}Z`;
  return {d, per: 2 * L + 2 * Math.PI * r};
};
interface Part {d: string; per: number; key: string}
const bodyParts = (A: Arms): {back: Part[]; front: Part[]; head: Part[]} => {
  const rr = (key: string, x: number, y: number, w: number, h: number, r: number): Part => ({key, d: rrectPath(x, y, w, h, r), per: rrectPerimeter(w, h, r)});
  const arms = armPts(A);
  const armParts = (k: string, a: ReturnType<typeof armPts>['L']): Part[] => [
    {key: `${k}u`, ...capsule(a.s, a.e, ARM_W / 2)}, {key: `${k}f`, ...capsule(a.e, a.h, ARM_W / 2)},
    {key: `${k}h`, d: circlePath(a.h.x, a.h.y, HAND_R), per: 2 * Math.PI * HAND_R},
  ];
  const funnel: Pt[] = [{x: -16, y: -190}, {x: 16, y: -190}, {x: 4, y: -175}, {x: -4, y: -175}];
  const funnelPer = 32 + 8 + 2 * Math.hypot(12, 15);
  return {
    back: [rr('legL', -30, -40, 20, 32, 5), rr('legR', 10, -40, 20, 32, 5), rr('footL', -38, -11, 32, 11, 5), rr('footR', 6, -11, 32, 11, 5), rr('neck', -10, -112, 20, 8, 2)],
    front: [rr('body', -44, -108, 88, 72, 16), ...armParts('L', arms.L), ...armParts('R', arms.R)],
    head: [rr('head', -39, -166, 78, 54, 17), rr('stem', -3, -176, 6, 10, 2), {key: 'funnel', d: polyD(funnel), per: funnelPer}],
  };
};

/** A Bot. Anchor: the point between its feet on the ground line. */
export const Bot: React.FC<BotProps> = (p) => {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const q = botPlace(p);
  const sc = q.scale ?? 1;
  // small Bots (under 150 px tall, Fable gate fix 4): each solid part's outline is drawn under its fill, so only its
  // outer half shows (3 px at the usual 6) and the tone fills the whole limb; the chest panel loses its inner marks
  const small = sc * BOT_SIZE.h < 150;
  const sw = strokeOf(q);
  const C = roleColours(p.colours);
  const tone = p.tone ?? C.accent;
  const fill = clamp(p.fill ?? 1);
  const solid = clamp((fill - 0.9) / 0.1);
  const dash = clamp(p.dash ?? 1);
  const A = blendPose(p);
  const parts = bodyParts(A);
  const headRot = `rotate(${f1(A.head)} 0 -112)`;
  const all = [...parts.back, ...parts.front];
  const level = -192 * fill;
  const eyeCol = mix(C.ground, C.highlight, clamp(p.lit ?? 1));
  const on = 12 / sc, off = 8 / sc;
  const outlinePart = (pt: Part, dashed: boolean) => (
    <path key={pt.key} d={pt.d} fill="none" stroke={dashed ? tone : C.edge} strokeWidth={dashed ? sw * 0.85 : sw} strokeLinejoin="round"
      strokeDasharray={dashed ? partialDash(pt.per, dash, on, off) : partialDash(pt.per, dash)} />
  );
  const fillPart = (pt: Part) => <path key={pt.key} d={pt.d} fill={tone} />;
  const solidParts = (pts: Part[]) => (small
    ? pts.map((pt) => <g key={pt.key}>{outlinePart(pt, false)}{fillPart(pt)}</g>)
    : [...pts.map(fillPart), ...pts.map((pt) => outlinePart(pt, false))]);
  const arms = armPts(A);
  const holds = p.holds ?? 'book';
  const readK = (p.pose === 'read' ? 1 - clamp(p.p ?? 0) : 0) + (p.to === 'read' ? clamp(p.p ?? 0) : 0);
  const sipK = (p.pose === 'sip' ? 1 - clamp(p.p ?? 0) : 0) + (p.to === 'sip' ? clamp(p.p ?? 0) : 0);
  const m = clamp(p.mask ?? 0);
  const mouthH = lerp(5, 16, clamp(p.mouth ?? 0));
  // with the mask on, the mouth is a smaller rounded opening lower on the face, clear of the mask (Fable fix 11)
  const mouthY = lerp(MOUTH.y, -121, m), mouthW = lerp(26, 16, m), mouthHm = lerp(mouthH, Math.min(mouthH, 9), m);
  const mouthR = lerp(2.5, mouthHm / 2, m);
  // the held thing sits between the hands at chest height
  const held = readK > 0.5 && holds !== 'none' ? (
    holds === 'book' && (p.bookHold ?? 'up') === 'up'
      ? (
        <g transform={`translate(${f1((arms.L.h.x + arms.R.h.x) / 2)} ${f1(arms.L.h.y - 6)}) rotate(-4)`}>
          <path d={rrectPath(-40, -34, 80, 56, 4)} fill={p.bookCover ?? mix(C.paper, tone, 0.35)} stroke={C.edge} strokeWidth={sw * 0.6} strokeLinejoin="round" />
          <path d={`M-35 -26Q-18 -33 -1 -27L-1 16Q-18 10 -35 16Z`} fill={C.paper} stroke={C.edge} strokeWidth={sw * 0.4} strokeLinejoin="round" />
          <path d={`M1 -27Q18 -33 35 -26L35 16Q18 10 1 16Z`} fill={C.paper} stroke={C.edge} strokeWidth={sw * 0.4} strokeLinejoin="round" />
          {!small && [-18, -10, -2, 6].map((y, k) => (
            <path key={k} d={`M-30 ${y}Q-18 ${y - 5} -6 ${y - 1}M6 ${y - 1}Q18 ${y - 5} 30 ${y}`} fill="none" stroke={mix(C.paper, C.ground, 0.45)} strokeWidth={3} strokeLinecap="round" />
          ))}
        </g>
      )
      : holds === 'book'
      ? <Book x={(arms.L.h.x + arms.R.h.x) / 2 + 10} y={arms.L.h.y + 10} size={44} anchor="spine" open={1} cover={p.bookCover ?? mix(C.paper, tone, 0.35)} colours={p.colours} />
      : (
        <g transform={`translate(${f1((arms.L.h.x + arms.R.h.x) / 2)} ${f1(arms.L.h.y - 4)}) rotate(-4)`}>
          <path d={rrectPath(-22, -30, 44, 52, 3)} fill={C.paper} stroke={C.edge} strokeWidth={sw * 0.6} />
          {[-20, -12, -4, 4, 12].map((y, k) => <rect key={k} x={-15} y={y} width={k === 4 ? 16 : 30} height={4} rx={2} fill={mix(C.paper, C.ground, 0.45)} />)}
        </g>
      )
  ) : null;
  const straw = sipK > 0.5 ? (
    <g transform={headRot}>
      <path d={`M6 ${MOUTH.y}L58 ${MOUTH.y + 62}`} stroke={C.edge} strokeWidth={9 + sw * 0.8} strokeLinecap="round" />
      <path d={`M6 ${MOUTH.y}L58 ${MOUTH.y + 62}`} stroke={C.paper} strokeWidth={9} strokeLinecap="round" />
      <path d={`M6 ${MOUTH.y}L58 ${MOUTH.y + 62}`} stroke={C.accent} strokeWidth={9} strokeDasharray="7 7" />
    </g>
  ) : null;
  const eyes = (
    <g transform={headRot}>
      {[-1, 1].map((s) => <circle key={s} cx={s * EYE.x} cy={EYE.y} r={EYE.r} fill={eyeCol} stroke={C.edge} strokeWidth={sw * (small ? 0.4 : 0.6)} />)}
      {fill > 0.5 && <path d={rrectPath(-mouthW / 2, mouthY - mouthHm / 2, mouthW, mouthHm, mouthR)} fill={C.ground} />}
    </g>
  );
  const panel = (
    <g opacity={solid}>
      <path d={rrectPath(-24, -96, 48, 34, 6)} fill={mix(tone, C.paper, 0.55)} stroke={C.edge} strokeWidth={sw * 0.5} />
      {!small && [-12, 0, 12].map((x, k) => <circle key={x} cx={x} cy={-86} r={4} fill={k === 1 ? C.highlight : C.ground} />)}
      {!small && <path d={rrectPath(-14, -76, 28, 6, 3)} fill={C.ground} />}
    </g>
  );
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <defs>
        <clipPath id={`bot-${uid}`}>
          {all.map((pt) => <path key={pt.key} d={pt.d} />)}
          <g transform={headRot}>{parts.head.map((pt) => <path key={pt.key} d={pt.d} />)}</g>
        </clipPath>
      </defs>
      {/* the Syrup inside the shell, from the feet up to the level */}
      {fill > 0 && solid < 1 && <rect x={-90} y={level} width={180} height={-level + 2} fill={C.syrup} clipPath={`url(#bot-${uid})`} />}
      {/* the solid body (fades in over the last tenth of the fill) */}
      {solid > 0 && (
        <g opacity={solid}>
          {solidParts(parts.back)}
          {solidParts(parts.front.slice(0, 1))}
          <g transform={headRot}>{solidParts(parts.head)}</g>
        </g>
      )}
      {panel}
      {held}
      {solid > 0 && <g opacity={solid}>{solidParts(parts.front.slice(1))}</g>}
      {/* the shell outline (dashed) while not solid */}
      {solid < 1 && (
        <g opacity={1 - solid}>
          {all.map((pt) => outlinePart(pt, true))}
          <g transform={headRot}>{parts.head.map((pt) => outlinePart(pt, true))}</g>
        </g>
      )}
      {straw}
      {eyes}
      {m > 0 && (
        <g transform={`${headRot} translate(0 ${f1(-(1 - m) * 46)})`} opacity={clamp(m * 3)}>
          <path d={`${rrectPath(-35, EYE.y - 9, 70, 18, 9)}${circlePath(-EYE.x, EYE.y, 6)}${circlePath(EYE.x, EYE.y, 6)}`} fill={C.ground} fillRule="evenodd" />
          <path d={`M-35 ${EYE.y - 2}L-46 ${EYE.y - 8}L-44 ${EYE.y + 4}ZM35 ${EYE.y - 2}L46 ${EYE.y - 8}L44 ${EYE.y + 4}Z`} fill={C.ground} />
        </g>
      )}
    </g>
  );
};
export const botQuad = (p: BotProps): Pt[] => propQuad(botPlace(p), {x: -72, y: -196, w: 144, h: 197});
/** World point at the centre of the chest panel (a straw goes in here). */
export const botChest = (p: BotProps): Pt => propPoint(botPlace(p), {x: 0, y: -80});
/** World point at the funnel's rim (books slide in here). */
export const botFunnel = (p: BotProps): Pt => propPoint(botPlace(p), {x: 0, y: -190});
/** World point at the top of the head beside the funnel (a mortarboard sits here, the funnel through its button). */
export const botHeadTop = (p: BotProps): Pt => propPoint(botPlace(p), {x: 0, y: -166});
/** World points of the two hands at the current pose blend. */
export const botHands = (p: BotProps): {left: Pt; right: Pt} => {
  const a = armPts(blendPose(p));
  const q = botPlace(p);
  return {left: propPoint(q, a.L.h), right: propPoint(q, a.R.h)};
};
/** World point at the lower end of the sip straw (put it in the glass). */
export const botStrawTip = (p: BotProps): Pt => {
  const a = (blendPose(p).head * Math.PI) / 180, v = {x: 58, y: MOUTH.y + 62 + 112};
  return propPoint(botPlace(p), {x: v.x * Math.cos(a) - v.y * Math.sin(a), y: -112 + v.x * Math.sin(a) + v.y * Math.cos(a)});
};
export const botGraphic = (o: PropGraphicOpts<BotProps>): DecorGraphic => propGraphic(o, Bot, botQuad);
