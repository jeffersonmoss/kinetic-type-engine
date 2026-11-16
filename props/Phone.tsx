// Phone: a modern smartphone with a chat, incoming-call, outgoing-call or blank screen. Ported from the DOGEfather kit
// (K14, item 19).
import React from 'react';
import {clamp, easeOutCubic} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropColours, type PropGraphicOpts, bubbleD, f1, linesD, mix, place, propColours, propGraphic, propQuad, propTransform, rrectPath, strokeOf} from './common';

/** Generic phone-handset glyph (24 x 24 icon outline, centred on 0, 0): not a brand mark. */
const HANDSET = 'M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z';
const Handset: React.FC<{x: number; y: number; size: number; angle?: number; fill: string}> = ({x, y, size, angle = 0, fill}) => (
  <path d={HANDSET} fill={fill} transform={`translate(${f1(x)} ${f1(y)}) rotate(${angle}) scale(${(size / 24).toFixed(3)}) translate(-12 -12)`} />
);

/** Natural size 300 x 600; `size` is the width. */
export const PHONE_SIZE = {w: 300, h: 600};
const PW = 150, PH = 300;
const SCR = {x: -136, y: -286, w: 272, h: 572};
export type PhoneScreen = 'chat' | 'incoming' | 'outgoing' | 'blank';
export interface PhoneProps extends PropBase {
  screen?: PhoneScreen;
  /** 'chat': how many bubbles are in (fractional: bubble k pops in as this goes from k - 1 to k). Up to 5 show. */
  bubbles?: number;
  /** Accent notification dot on the top-right corner, no numeral. */
  badge?: boolean;
}
const CHAT_LINES = [2, 3, 2, 3, 2];
const CHAT_WIDTHS = [[150, 110], [160, 150, 90], [140, 96], [156, 132, 104], [150, 80]];
const phonePlace = (p: PhoneProps) => place(p, PHONE_SIZE.w);

const PhoneChat: React.FC<{n: number; C: PropColours}> = ({n, C}) => {
  const leftBubble = mix(C.body, C.paper, 0.14), rightBubble = mix(C.accent2, C.ground, 0.2);
  const out: React.ReactNode[] = [];
  // Header: contact avatar and name bar.
  out.push(<circle key="av" cx={-96} cy={-232} r={14} fill={C.body} />);
  out.push(<path key="nm" d={rrectPath(-72, -238, 90, 12, 6)} fill={C.muted} />);
  out.push(<path key="hl" d="M-130 -208H130" stroke={C.body} strokeWidth={2} />);
  let y = -192;
  for (let k = 0; k < 5; k++) {
    const lines = CHAT_LINES[k];
    const h = 26 + 20 * lines;
    const right = k % 2 === 1;
    const w = 196;
    const x = right ? 122 - w : -122;
    const q = clamp(n - k);
    if (q > 0) {
      const e = easeOutCubic(q);
      const s = 0.6 + 0.4 * e;
      const ox = right ? x + w : x, oy = y + h; // pop from the tail corner
      out.push(
        <g key={k} opacity={clamp(q * 3)} transform={`translate(${ox} ${oy}) scale(${s.toFixed(3)}) translate(${-ox} ${-oy})`}>
          <path d={bubbleD(x, y, w, h, right)} fill={right ? rightBubble : leftBubble} />
          <path d={linesD(x + 18, y + 16, CHAT_WIDTHS[k], 20, 10)} fill={right ? mix(C.muted, C.paper, 0.45) : C.muted} />
        </g>,
      );
    }
    y += h + 12;
  }
  return <>{out}</>;
};
const PhoneCall: React.FC<{incoming: boolean; C: PropColours}> = ({incoming, C}) => (
  <>
    <circle cx={0} cy={-140} r={58} fill={C.body} stroke={C.muted} strokeWidth={3} />
    <circle cx={0} cy={-156} r={20} fill={mix(C.body, C.muted, 0.45)} />
    <path d="M-34 -104Q0 -140 34 -104" fill={mix(C.body, C.muted, 0.45)} />
    <path d={rrectPath(-80, -56, 160, 16, 8)} fill={C.paper} />
    <path d={rrectPath(-50, -28, 100, 11, 5.5)} fill={C.muted} />
    {incoming ? (
      <>
        <circle cx={-72} cy={180} r={36} fill={C.accent} />
        <Handset x={-72} y={180} size={38} angle={135} fill={C.paper} />
        <circle cx={72} cy={180} r={36} fill={C.highlight} />
        <Handset x={72} y={180} size={38} fill={C.ground} />
      </>
    ) : (
      <>
        {[-78, 0, 78].map((x) => [24, 98].map((y) => <circle key={`${x}${y}`} cx={x} cy={y} r={26} fill={C.body} />))}
        <circle cx={0} cy={196} r={38} fill={C.accent} />
        <Handset x={0} y={196} size={40} angle={135} fill={C.paper} />
      </>
    )}
  </>
);

/** Modern smartphone. Anchor: centre. Natural size 300 x 600: a body-coloured slab (corner radius 46) with side
 *  buttons, a dark screen with a notch, status bar and home bar. Screens: 'chat' (alternating bubbles with grey text
 *  lines, each popping in from 0.6 scale), 'incoming' (blank caller avatar, two bars, accent decline and highlight
 *  answer circles with handset glyphs), 'outgoing' (avatar, bars, six control circles, accent end-call circle),
 *  'blank'. */
export const Phone: React.FC<PhoneProps> = (p) => {
  const q = phonePlace(p);
  const sw = strokeOf(q);
  const C = propColours(p.colours);
  const screen = p.screen ?? 'chat';
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      {/* side buttons, behind the body */}
      <path d={rrectPath(-PW - 7, -170, 12, 52, 4) + rrectPath(-PW - 7, -100, 12, 52, 4) + rrectPath(PW - 5, -150, 12, 74, 4)} fill={C.body} stroke={C.paper} strokeWidth={sw * 0.6} />
      <path d={rrectPath(-PW, -PH, 2 * PW, 2 * PH, 46)} fill={C.body} stroke={C.paper} strokeWidth={sw} />
      <path d={rrectPath(SCR.x, SCR.y, SCR.w, SCR.h, 34)} fill={C.ground} />
      {screen === 'chat' && <PhoneChat n={p.bubbles ?? 0} C={C} />}
      {screen === 'incoming' && <PhoneCall incoming C={C} />}
      {screen === 'outgoing' && <PhoneCall incoming={false} C={C} />}
      {/* notch with camera, status bar, home bar */}
      <path d="M-66 -287L-56 -287Q-50 -287 -49 -280Q-47 -262 -30 -262L30 -262Q47 -262 49 -280Q50 -287 56 -287L66 -287Z" fill={C.body} />
      <circle cx={26} cy={-276} r={5} fill={mix(C.ground, C.accent2, 0.35)} />
      <path d={rrectPath(-118, -276, 34, 9, 4.5)} fill={C.muted} />
      <path d={rrectPath(88, -277, 28, 12, 3)} fill="none" stroke={C.muted} strokeWidth={2} />
      <path d={rrectPath(91, -274, 18, 6, 1.5)} fill={C.muted} />
      <path d={rrectPath(-50, 266, 100, 6, 3)} fill={C.muted} />
      {p.badge && <circle cx={PW - 12} cy={-PH + 12} r={24} fill={C.accent} stroke={C.paper} strokeWidth={sw * 0.6} />}
    </g>
  );
};
export const phoneQuad = (p: PhoneProps): Pt[] => propQuad(phonePlace(p), {x: -PW, y: -PH, w: 2 * PW, h: 2 * PH});
/** World quad of the phone's screen. */
export const phoneScreenRect = (p: PhoneProps): Pt[] => propQuad(phonePlace(p), SCR);
export const phoneGraphic = (o: PropGraphicOpts<PhoneProps>): DecorGraphic => propGraphic(o, Phone, phoneQuad);
