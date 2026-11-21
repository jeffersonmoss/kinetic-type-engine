// Bug: the narrator of Paper Trail (storyboard item 52, the hero prop): a thumb-sized listening device on a red circuit
// board stick, lying flat, seen from above. A silver USB-A plug at the left end (the metal shell with its two square
// windows, on a dark collar), a round silver microphone can with a dark port hole near the right end, a microSD socket on
// the lower long edge, a row of gold pads along the upper edge with traces, one small black chip, one LED (steady: it
// changes only when a board changes `led`), and a white label strip printed with the device ID in mono.
// States: `eject` slides the memory card out of its socket (masked at the socket mouth, the same card as MemoryCard);
// `wrap` winds toilet paper round the board in five overlapping turns from the plug end (only the plug left showing; a
// lit LED glows dimly through), and coming off it peels turn by turn from the loose end into a tail that runs down to
// `bugWrapTail` (Fable props gate loop 1, items 52 and 53); `tie` drops a paper necktie on it (the existing Tie prop, in
// Tissue; cut from the film at the same gate, item 54, but the option stays); `ghost` draws the dashed
// "not there" outline only; `bagged` draws a clear evidence bag round it with a Manila header reading EVIDENCE.
import React from 'react';
import {PALETTE, clamp} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, circlePath, mix, place, propGraphic, propPoint, propQuad, propTransform, rrectPath} from './common';
import {MonoText, clipKey, neverRealDash, outlineFor, worldPx} from './drawingHelpers';
import {MicroSdCard} from './MemoryCard';
import {partialDash, rrectPerimeter, type RoleColours, roleColours} from './roles';
import {Tie} from './Tie';

/** Natural size: 360 long overall (x -180 to 180: the plug from -180, the board from -128 to 180, 308 by 90, about 3.4
 *  to 1), 90 wide (y -45 to 45). Anchor: the centre of the 360 length on the board's centre line. `size` is the 360
 *  length. */
export const BUG_SIZE = {w: 360, h: 90};
/** The ID printed on the label (storyboard item 138: invented for the film). */
export const BUG_ID = '7F:3A:9C:E2:04:B1';
const BOARD = {x: -128, y: -45, w: 308, h: 90, r: 10};
const PLUG = {x: -180, y: -30, w: 56, h: 60};
const COLLAR = {x: -134, y: -36, w: 12, h: 72};
const MIC = {x: 150, y: 0, r: 25};
const LABEL = {x: -114, y: -19, w: 192, h: 36};
const CHIP = {x: 86, y: -17, w: 32, h: 34};
const LED = {x: 102, y: -32};
const SLOT = {x: -106, y: 16, w: 72, h: 29};
/** The socket mouth on the lower edge (the card comes out here, narrower than the mouth). */
const MOUTH = {x0: -100, x1: -40, y: 45};
const CARD_W = 50, CARD_H = (192 / 140) * 50;
const PADS = Array.from({length: 7}, (_, k) => ({x: -104 + k * 16, y: -42, w: 9, h: 13}));
/** The wrap (Fable props gate loop 1, items 52 and 53): `turns` overlapping wound turns of toilet paper, each `w` wide
 *  along the stick and slanted `skew` like a helix, from the plug end (x0) to past the mic end; each turn stands a
 *  little prouder than the one under it (`proud` per turn), so the outline steps at every overlap. The outermost turn,
 *  at the mic end, carries the loose end with its torn corner lifting. */
const WRAP = {x0: -128, x1: 190, half: 50, proud: 1.4, skew: 12, turns: 5, w: 96};
const turnStep = (WRAP.x1 - WRAP.x0 - WRAP.w) / (WRAP.turns - 1);
const turnAt = (k: number) => {
  const a = WRAP.x0 + k * turnStep;
  const h = WRAP.half + WRAP.proud * k;
  return {a, h, top: -h, bot: h};
};
/** The freed paper's tail (unwinding): it comes out from under the stick's lower edge at the turn that is coming off
 *  and runs down to this fixed end, `w` wide, heading straight down (+y in the Bug's frame): join a tissue() band here. */
const TAIL = {x: 30, y: 210};
const WRAP_X_MAX = WRAP.x1 + WRAP.skew + 4;
const WRAP_Y_MAX = WRAP.half + WRAP.proud * (WRAP.turns - 1) + 2;

export interface BugProps extends PropBase {
  colours?: Partial<RoleColours>;
  /** 0 dark, 1 lit (steady; boards change it only on a named cue). */
  led?: number;
  /** 0 to 1: the memory card slides out of the socket on the lower edge, masked at the socket mouth. */
  eject?: number;
  /** 0 to 1: toilet paper wound round the board in five overlapping turns from the plug end; at 1 only the plug shows.
   *  Going down from 1 the turns come off one at a time from the loose end (the mic end), each peeling off the top face
   *  toward the lower edge, and the freed paper leaves under the lower edge as a tail ending at `bugWrapTail`. */
  wrap?: number;
  /** 0 to 1: a paper necktie drops onto the board (from 70 design units above, fading in over the first third); 0 none. */
  tie?: number;
  /** Swing of the tie's blade, degrees (a board computes one damped swing). */
  tieSwing?: number;
  /** Dashed outline only (the place where the bug was). True, or a number (0 off). */
  ghost?: boolean | number;
  /** Colour of the ghost's dashes (default the muted role; a board brightens it to paper and back). */
  ghostColour?: string;
  /** 0 to 1 (or true): the evidence bag. The outline draws on over the first 70 percent, the Manila header wipes on
   *  over the last 70 percent. */
  bagged?: boolean | number;
  /** The ID string on the label (default BUG_ID). */
  label?: string;
  /** Label text colour (default the ground role; a board can light it). */
  labelInk?: string;
  /** Label strip colour (default the paper role). */
  labelPaper?: string;
}
const bugPlace = (p: BugProps) => place(p, BUG_SIZE.w);
const num = (v: boolean | number | undefined) => (v === true ? 1 : v === false || v === undefined ? 0 : clamp(v));
/** Evidence bag geometry (design space). */
const BAG = {x: -210, y: -98, w: 420, h: 178, header: 36};

/** The Bug. Anchor: centre of its 360 length. */
export const Bug: React.FC<BugProps> = (p) => {
  const q = bugPlace(p);
  const sw = outlineFor(q, BUG_SIZE.w);
  const C = roleColours(p.colours);
  const silver = mix(C.muted, C.paper, 0.45), silverDark = mix(silver, C.ground, 0.35);
  const trace = mix(C.accent, C.ground, 0.32);
  const led = clamp(p.led ?? 0), eject = clamp(p.eject ?? 0), wrap = clamp(p.wrap ?? 0);
  const ghost = num(p.ghost) > 0;
  const bag = num(p.bagged);
  const tie = clamp(p.tie ?? 0);
  const id = clipKey('bug', p);
  const E = {stroke: C.edge, strokeWidth: sw, strokeLinejoin: 'round' as const};
  const thin = worldPx(q, 1.6);

  if (ghost) {
    const dash = neverRealDash(q);
    const G = {fill: 'none', stroke: p.ghostColour ?? C.muted, strokeWidth: Math.max(sw, worldPx(q, 3)), strokeDasharray: dash, strokeLinejoin: 'round' as const};
    return (
      <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
        <path d={rrectPath(PLUG.x, PLUG.y, PLUG.w + 6, PLUG.h, 4)} {...G} />
        <path d={rrectPath(BOARD.x, BOARD.y, BOARD.w, BOARD.h, BOARD.r)} {...G} />
        <path d={circlePath(MIC.x, MIC.y, MIC.r)} {...G} />
      </g>
    );
  }

  // LED (Fable gate loop 1, item 51): lit, a pale lens with a light core and a soft Bug Red halo about three times the
  // lens across at about 40 percent; unlit, no halo and a dark lens.
  const ledOn = mix(C.highlight, C.paper, 0.6), ledOff = mix(C.ground, C.accent, 0.22);
  const cardTop = MOUTH.y - CARD_H + eject * (CARD_H + 4);
  const tieTop = -70 * (1 - tie);
  // the wrap: how much of each turn is still on (the outermost turn comes off first)
  const nOn = wrap * WRAP.turns;
  const turnFrac = (k: number) => clamp(nOn - k);
  // the outermost turn still (partly) on: the tail leaves from it
  const peeling = wrap > 0 && wrap < 1 ? Math.min(WRAP.turns - 1, Math.max(0, Math.ceil(nOn) - 1)) : -1;
  const paper = C.paper, paperBack = mix(C.paper, PALETTE.shadow, 0.1);
  const paperEdge = mix(C.paper, PALETTE.shadow, 0.55), overlapShade = mix(C.paper, PALETTE.shadow, 0.35);
  const turnD = (k: number) => {
    const t = turnAt(k), sk = WRAP.skew, r = 7;
    const right = t.a + WRAP.w;
    if (k === WRAP.turns - 1) {
      // the loose end: a ragged right edge, its top corner torn away (the lifted flap is drawn separately)
      const rag = [0, 1, 2, 3, 4, 5, 6].map((j) => {
        const y = t.top + 22 + j * ((t.bot - t.top - 22) / 6);
        const u = (y - t.top) / (t.bot - t.top);
        return `L${(right + sk * (1 - u) + (j % 2 ? 3 : -2)).toFixed(1)} ${y.toFixed(1)}`;
      }).join('');
      return `M${t.a + sk + r} ${t.top}H${right + sk - 20}L${right + sk - 1} ${t.top + 22}${rag}L${right} ${t.bot}H${t.a + r}Q${t.a} ${t.bot} ${t.a + 0.3} ${t.bot - r}L${t.a + sk - 0.3} ${t.top + r}Q${t.a + sk} ${t.top} ${t.a + sk + r} ${t.top}Z`;
    }
    return `M${t.a + sk + r} ${t.top}H${right + sk}L${right} ${t.bot}H${t.a + r}Q${t.a} ${t.bot} ${t.a + 0.3} ${t.bot - r}L${t.a + sk - 0.3} ${t.top + r}Q${t.a + sk} ${t.top} ${t.a + sk + r} ${t.top}Z`;
  };
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <defs>
        <clipPath id={`${id}-mouth`}><rect x={-400} y={MOUTH.y} width={800} height={400} /></clipPath>
        {wrap > 0 && Array.from({length: WRAP.turns}, (_, k) => {
          const t = turnAt(k), f = turnFrac(k);
          return (
            <React.Fragment key={k}>
              <clipPath id={`${id}-t${k}`}><path d={turnD(k)} /></clipPath>
              <clipPath id={`${id}-on${k}`}><rect x={-400} y={-400} width={800} height={(400 + t.top + f * (t.bot - t.top)).toFixed(2)} /></clipPath>
            </React.Fragment>
          );
        })}
      </defs>
      {/* the freed paper's tail, coming out from under the lower edge at the turn that is coming off */}
      {peeling >= 0 && (() => {
        const t = turnAt(peeling), w = WRAP.w;
        const d = `M${t.a.toFixed(1)} ${t.bot - 14}L${(t.a + w).toFixed(1)} ${t.bot - 14}L${(TAIL.x + w / 2).toFixed(1)} ${TAIL.y}L${(TAIL.x - w / 2).toFixed(1)} ${TAIL.y}Z`;
        const m0 = {x: t.a + w / 2, y: t.bot}, m1 = TAIL;
        const perf = [0.45, 0.85].map((u) => {
          const cx = m0.x + (m1.x - m0.x) * u, cy = m0.y + (m1.y - m0.y) * u;
          return `M${(cx - w / 2 + 6).toFixed(1)} ${cy.toFixed(1)}H${(cx + w / 2 - 6).toFixed(1)}`;
        }).join('');
        return (
          <g>
            <path d={d} fill={paper} stroke={paperEdge} strokeWidth={worldPx(q, 2.5)} strokeLinejoin="round" />
            <path d={perf} stroke={paperEdge} strokeWidth={worldPx(q, 2)} strokeDasharray={`${worldPx(q, 4).toFixed(2)} ${worldPx(q, 4).toFixed(2)}`} />
          </g>
        );
      })()}
      {/* the memory card, sliding out of the socket on the lower edge (masked at the mouth) */}
      {eject > 0 && (
        <g clipPath={`url(#${id}-mouth)`}>
          <g transform={`translate(${(MOUTH.x0 + MOUTH.x1) / 2} ${(cardTop + CARD_H / 2).toFixed(2)}) scale(${CARD_W / 140})`}>
            <MicroSdCard C={C} sw={sw * (140 / CARD_W)} />
          </g>
        </g>
      )}
      {/* USB-A plug: dark collar, metal shell, two square windows, shell seam */}
      <path d={rrectPath(PLUG.x, PLUG.y, PLUG.w, PLUG.h, 3)} fill={silver} {...E} />
      <path d={rrectPath(PLUG.x + 10, -21, 12, 12, 1.5) + rrectPath(PLUG.x + 10, 9, 12, 12, 1.5)} fill={C.ground} />
      <path d={`M${PLUG.x + 40} ${PLUG.y + 4}V${PLUG.y + PLUG.h - 4}`} stroke={silverDark} strokeWidth={worldPx(q, 2)} />
      <path d={`M${PLUG.x + 4} -2H${PLUG.x + 36}`} stroke={mix(silver, C.paper, 0.6)} strokeWidth={worldPx(q, 2)} strokeLinecap="round" />
      <path d={rrectPath(COLLAR.x, COLLAR.y, COLLAR.w, COLLAR.h, 3)} fill={mix(C.ground, C.muted, 0.3)} {...E} />
      {/* the board */}
      <path d={rrectPath(BOARD.x, BOARD.y, BOARD.w, BOARD.h, BOARD.r)} fill={C.accent} {...E} />
      <path d={rrectPath(BOARD.x + 6, BOARD.y + 6, BOARD.w - 12, BOARD.h - 12, BOARD.r - 4)} fill="none" stroke={mix(C.accent, C.paper, 0.22)} strokeWidth={thin} opacity={0.8} />
      {/* traces: pads down to the label, chip to the mic, chip to the LED */}
      <path d={PADS.map((d) => `M${d.x + d.w / 2} ${d.y + d.h}V${LABEL.y}`).join('') + `M${CHIP.x + CHIP.w} -6H${MIC.x - MIC.r}M${CHIP.x + CHIP.w} 8H${MIC.x - MIC.r + 4}M${LED.x} ${LED.y + 6}V${CHIP.y}M${SLOT.x + SLOT.w} 30H${CHIP.x - 2}V${CHIP.y + CHIP.h}`} fill="none" stroke={trace} strokeWidth={worldPx(q, 2.2)} strokeLinejoin="round" />
      {PADS.map((d, k) => <rect key={k} x={d.x} y={d.y} width={d.w} height={d.h} rx={1.5} fill={C.highlight} />)}
      {/* microSD socket: a metal housing on the lower edge, its dark mouth at the edge */}
      <path d={rrectPath(SLOT.x, SLOT.y, SLOT.w, SLOT.h + 2, 3)} fill={silver} stroke={C.edge} strokeWidth={sw * 0.7} strokeLinejoin="round" />
      <path d={`M${SLOT.x + 10} ${SLOT.y + 8}H${SLOT.x + SLOT.w - 10}`} stroke={silverDark} strokeWidth={worldPx(q, 1.8)} />
      <rect x={MOUTH.x0} y={MOUTH.y - 5} width={MOUTH.x1 - MOUTH.x0} height={5} fill={C.ground} />
      {/* chip */}
      <path d={[0, 1, 2, 3].map((k) => `M${CHIP.x + 5 + k * 7.5} ${CHIP.y - 4}V${CHIP.y}M${CHIP.x + 5 + k * 7.5} ${CHIP.y + CHIP.h}V${CHIP.y + CHIP.h + 4}`).join('')} stroke={silver} strokeWidth={worldPx(q, 2)} />
      <path d={rrectPath(CHIP.x, CHIP.y, CHIP.w, CHIP.h, 2)} fill={mix(C.ground, PALETTE.shadow, 0.5)} />
      <circle cx={CHIP.x + 7} cy={CHIP.y + 7} r={2.4} fill={C.muted} />
      {/* LED (steady) */}
      {led > 0 && (
        <g>
          <circle cx={LED.x} cy={LED.y} r={24} fill={C.accent} opacity={0.4 * led} />
          <circle cx={LED.x} cy={LED.y} r={15} fill={C.accent} opacity={0.3 * led} />
          <circle cx={LED.x} cy={LED.y} r={11} fill={C.highlight} opacity={0.45 * led} />
        </g>
      )}
      <path d={rrectPath(LED.x - 8, LED.y - 5.5, 16, 11, 3)} fill={mix(ledOff, ledOn, led)} stroke={C.edge} strokeWidth={thin} />
      {led > 0 && <path d={rrectPath(LED.x - 4, LED.y - 2.5, 8, 5, 2)} fill={C.paper} opacity={led} />}
      {/* label strip with the ID */}
      <path d={rrectPath(LABEL.x, LABEL.y, LABEL.w, LABEL.h, 3)} fill={p.labelPaper ?? C.paper} stroke={C.edge} strokeWidth={thin} />
      <MonoText x={LABEL.x + LABEL.w / 2} y={LABEL.y + LABEL.h / 2 + 6.3} text={p.label ?? BUG_ID} size={18} width={LABEL.w - 14} anchor="middle" fill={p.labelInk ?? C.ground} />
      {/* microphone can with its dark port hole */}
      <path d={circlePath(MIC.x, MIC.y, MIC.r)} fill={silver} {...E} />
      <path d={circlePath(MIC.x, MIC.y, MIC.r - 7)} fill="none" stroke={silverDark} strokeWidth={worldPx(q, 2)} />
      <path d={`M${MIC.x - 13} ${MIC.y - 12}A18 18 0 0 1 ${MIC.x + 4} ${MIC.y - 18}`} fill="none" stroke={mix(silver, C.paper, 0.7)} strokeWidth={worldPx(q, 2.5)} strokeLinecap="round" />
      <path d={circlePath(MIC.x, MIC.y, 7)} fill={C.ground} />
      {/* the wrap: five overlapping wound turns from the plug end, a shadow under each overlap, perforations across
          some turns, the loose end with its torn corner lifting; turns come off from the loose end, peeling down */}
      {wrap > 0 && Array.from({length: WRAP.turns}, (_, k) => {
        const f = turnFrac(k);
        if (f <= 0) return null;
        const t = turnAt(k), sk = WRAP.skew;
        const peelY = t.top + f * (t.bot - t.top);
        const perfX = t.a + WRAP.w * 0.62;
        const last = k === WRAP.turns - 1;
        const right = t.a + WRAP.w;
        return (
          <g key={`w${k}`} clipPath={`url(#${id}-on${k})`}>
            {/* the shadow this turn casts on the turn under it, just left of its edge */}
            {k > 0 && (
              <g clipPath={`url(#${id}-t${k - 1})`}>
                <path d={`M${t.a + sk - 4} ${t.top}L${t.a - 4} ${t.bot}`} stroke={overlapShade} strokeWidth={worldPx(q, 7)} opacity={0.5} />
              </g>
            )}
            <path d={turnD(k)} fill={k % 2 ? mix(paper, paperBack, 0.5) : paper} stroke={paperEdge} strokeWidth={worldPx(q, 2.4)} strokeLinejoin="round" />
            {k % 2 === 1 && <path d={`M${perfX + sk} ${t.top + 5}L${perfX} ${t.bot - 5}`} stroke={paperEdge} strokeWidth={worldPx(q, 2)} strokeDasharray={`${worldPx(q, 4).toFixed(2)} ${worldPx(q, 4).toFixed(2)}`} />}
            {/* the loose end's torn corner, lifting off the top edge */}
            {last && <path d={`M${right + sk - 21} ${t.top + 1}L${right + sk + 6} ${t.top - 14}L${right + sk - 2} ${t.top + 21}Z`} fill={paperBack} stroke={paperEdge} strokeWidth={worldPx(q, 2)} strokeLinejoin="round" />}
            {/* the peel line of a turn coming off: the lifted lip, back side showing */}
            {f < 1 && <path d={`M${t.a + sk * (1 - f) + 2} ${peelY - 3}H${right + sk * (1 - f) - 2}`} stroke={paperBack} strokeWidth={worldPx(q, 6)} strokeLinecap="round" />}
            {f < 1 && <path d={`M${t.a + sk * (1 - f) + 2} ${peelY}H${right + sk * (1 - f) - 2}`} stroke={paperEdge} strokeWidth={worldPx(q, 2)} strokeLinecap="round" />}
          </g>
        );
      })}
      {/* a lit LED glows dimly through the paper */}
      {wrap > 0 && led > 0 && <circle cx={LED.x} cy={LED.y + 2} r={18} fill={C.accent} opacity={0.3 * led * clamp(nOn - 3)} />}
      {/* the paper necktie (the Tie prop in Tissue: Tissue blade, edge outline), knot by the plug, blade along the board */}
      {tie > 0 && (() => {
        const k = 0.44;
        const sAt = p.tieSwing ?? 0;
        const C2 = {accent: C.paper, paper: C.edge, ground: C.ground, muted: C.muted};
        return (
          <g opacity={clamp(tie * 3)} transform={`translate(-104 ${tieTop.toFixed(2)}) rotate(-90) scale(${k})`}>
            <clipPath id={`${id}-tie`}><path d="M-34 -4L34 -4L60 440L0 530L-60 440Z" transform={`rotate(${sAt.toFixed(2)})`} /></clipPath>
            <g clipPath={`url(#${id}-tie)`}>
              <Tie x={0} y={0} swing={sAt} colours={C2} />
            </g>
          </g>
        );
      })()}
      {/* the evidence bag: clear plastic outline, sheen, zip seal, Manila header with EVIDENCE */}
      {bag > 0 && (() => {
        const b = BAG;
        const L = rrectPerimeter(b.w, b.h, 14);
        const lineU = clamp(bag / 0.7);
        const headU = clamp((bag - 0.3) / 0.7);
        const bw = Math.max(sw, worldPx(q, 3));
        return (
          <g>
            <path d={rrectPath(b.x, b.y, b.w, b.h, 14)} fill={C.paper} opacity={0.1 * bag} />
            <path d={`M${b.x + 12} ${b.y + b.header + 34}L${b.x + 44} ${b.y + b.h - 14}M${b.x + 16} ${b.y + b.header + 20}L${b.x + 26} ${b.y + b.header + 44}M${b.x + b.w - 20} ${b.y + b.header + 22}L${b.x + b.w - 12} ${b.y + b.header + 50}`} stroke={C.paper} strokeWidth={worldPx(q, 5)} strokeLinecap="round" opacity={0.45 * headU} />
            <path d={`M${b.x + 10} ${b.y + b.header + 8}H${b.x + b.w - 10}M${b.x + 10} ${b.y + b.header + 14}H${b.x + b.w - 10}`} stroke={C.muted} strokeWidth={worldPx(q, 2)} opacity={headU} />
            <clipPath id={`${id}-head`}><rect x={b.x - 10} y={b.y - 10} width={(b.w + 20) * headU} height={b.header + 20} /></clipPath>
            <g clipPath={`url(#${id}-head)`}>
              <path d={`M${b.x + 14} ${b.y}H${b.x + b.w - 14}Q${b.x + b.w} ${b.y} ${b.x + b.w} ${b.y + 14}V${b.y + b.header}H${b.x}V${b.y + 14}Q${b.x} ${b.y} ${b.x + 14} ${b.y}Z`} fill={C.highlight} stroke={C.edge} strokeWidth={worldPx(q, 2.4)} strokeLinejoin="round" />
              <MonoText x={b.x + 16} y={b.y + 26} text="EVIDENCE" size={24} width={118} fill={C.ground} />
              <path d={`M${b.x + 160} ${b.y + 13}H${b.x + 270}M${b.x + 160} ${b.y + 25}H${b.x + 240}M${b.x + 300} ${b.y + 13}H${b.x + b.w - 18}M${b.x + 300} ${b.y + 25}H${b.x + b.w - 50}`} stroke={mix(C.highlight, C.ground, 0.5)} strokeWidth={worldPx(q, 2.2)} strokeLinecap="round" />
            </g>
            <path d={rrectPath(b.x, b.y, b.w, b.h, 14)} fill="none" stroke={C.muted} strokeWidth={bw} strokeLinejoin="round" strokeDasharray={partialDash(L, lineU)} />
          </g>
        );
      })()}
    </g>
  );
};
/** Design-space box of everything the Bug draws in its current state. */
const bugBox = (p: BugProps) => {
  let x0 = -180, x1 = 180, y0 = -45, y1 = 45;
  const w = clamp(p.wrap ?? 0);
  if (w > 0) { x1 = WRAP_X_MAX; y0 = -WRAP_Y_MAX - 15; y1 = WRAP_Y_MAX; }
  if (w > 0 && w < 1) { x0 = Math.min(x0, TAIL.x - WRAP.w / 2 - 2, WRAP.x0 - 2); y1 = TAIL.y + 2; }
  if (clamp(p.eject ?? 0) > 0) y1 = Math.max(y1, MOUTH.y + clamp(p.eject ?? 0) * (CARD_H + 4));
  if (clamp(p.tie ?? 0) > 0) { y0 = Math.min(y0, -36 - 70 * (1 - clamp(p.tie ?? 0))); y1 = Math.max(y1, 36); }
  if (num(p.bagged) > 0) { x0 = Math.min(x0, BAG.x); x1 = Math.max(x1, BAG.x + BAG.w); y0 = Math.min(y0, BAG.y); y1 = Math.max(y1, BAG.y + BAG.h); }
  return {x: x0, y: y0, w: x1 - x0, h: y1 - y0};
};
/** World quad of the Bug in its current state (bag, wrap, card and tie included). */
export const bugQuad = (p: BugProps): Pt[] => propQuad(bugPlace(p), bugBox(p));
/** World point at the centre of the microphone's port hole (words sprout here; listening traces end here). */
export const bugMic = (p: BugProps): Pt => propPoint(bugPlace(p), {x: MIC.x, y: MIC.y});
/** World point at the centre of the card socket's mouth on the lower edge (the card comes out here). */
export const bugSlot = (p: BugProps): Pt => propPoint(bugPlace(p), {x: (MOUTH.x0 + MOUTH.x1) / 2, y: MOUTH.y});
/** World point at the centre of the label strip (the ID string). */
export const bugLabel = (p: BugProps): Pt => propPoint(bugPlace(p), {x: LABEL.x + LABEL.w / 2, y: LABEL.y + LABEL.h / 2});
/** World quad of the label strip. */
export const bugLabelQuad = (p: BugProps): Pt[] => propQuad(bugPlace(p), LABEL);
/** World point at the LED. */
export const bugLed = (p: BugProps): Pt => propPoint(bugPlace(p), LED);
/** World point where the plug's metal shell meets its collar: put this at a USB port's mouth (TVSet tvUsbPort) and
 *  the shell is wholly in the port. */
export const bugPlugCollar = (p: BugProps): Pt => propPoint(bugPlace(p), {x: COLLAR.x, y: 0});
/** World point at the tip of the plug. */
export const bugPlugTip = (p: BugProps): Pt => propPoint(bugPlace(p), {x: PLUG.x, y: 0});
/** World centre of the ejecting card at the current `eject` (where a MemoryCard can take over). */
export const bugCard = (p: BugProps): Pt => propPoint(bugPlace(p), {x: (MOUTH.x0 + MOUTH.x1) / 2, y: MOUTH.y - CARD_H / 2 + clamp(p.eject ?? 0) * (CARD_H + 4)});
/** World point at the end of the unwinding wrap's tail (the centre of its end edge; the tail heads straight down the
 *  Bug's frame there, `bugWrapTailWidth` wide). The tail is drawn while 0 < wrap < 1: join a tissue() band here. */
export const bugWrapTail = (p: BugProps): Pt => propPoint(bugPlace(p), TAIL);
/** World width of the wrap's paper (the tail and each turn). */
export const bugWrapTailWidth = (p: BugProps): number => WRAP.w * ((p.size ?? BUG_SIZE.w) / BUG_SIZE.w);
/** World size of the ejected card's width (to match a MemoryCard's size to it). */
export const bugCardWidth = (p: BugProps): number => CARD_W * ((p.size ?? BUG_SIZE.w) / BUG_SIZE.w);
export const bugGraphic = (o: PropGraphicOpts<BugProps>): DecorGraphic => propGraphic(o, Bug, bugQuad);
