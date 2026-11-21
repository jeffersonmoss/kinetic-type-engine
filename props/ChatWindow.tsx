// ChatWindow: a generic chat app window (Paper Trail storyboard items 36, 55 and 129 to 166): a title bar with a text
// slot (and optionally the blank avatar chip), a Tissue conversation pane holding a list of bubbles (user bubbles in the
// chat colour on the right, replies on the left as pale bubbles with detail-colour text bars), a static typing indicator,
// and an input field with a text slot, an optional blank avatar chip, a still cursor and a send button. No logo, no
// brand colours, nothing copied from any real chat product; window controls are neutral marks, not traffic lights.
// Built as a new prop rather than on Browser's 'chat' page, because Browser draws its address-bar dots in the accent
// and highlight roles (Bug Red and Manila in this film, both reserved) and has no title, input, chip or bubble list.
// Also here: AvatarChip, the dashed "nobody" account picture (storyboard item 30), usable on its own.
import React from 'react';
import {PALETTE, clamp} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, bubbleD, circlePath, linesD, mix, place, propGraphic, propPoint, propQuad, propTransform, rrectPath} from './common';
import {MonoText, clipKey, outlineFor, worldPx} from './drawingHelpers';
import {type RoleColours, roleColours} from './roles';

/** Natural size 760 x 550 (x -380 to 380, y -275 to 275), anchor the centre. `size` is the 760 width. */
export const CHAT_WINDOW_SIZE = {w: 760, h: 550};
const W = 380, H = 275, BAR = 64;
const TITLE_SLOT = {x: -298, y: -H + 10, w: 520, h: BAR - 20};
const INPUT = {x: -356, y: 183, w: 712, h: 70};
const INPUT_SLOT = {x: -286, y: INPUT.y + 9, w: 548, h: INPUT.h - 18};
const PANE = {x: -W + 6, y: -H + BAR, w: 2 * W - 12, h: INPUT.y - 12 - (-H + BAR)};
const BUBBLE_TOP = -H + BAR + 18, BUBBLE_GAP = 20, BUBBLE_IN = 26;

export interface ChatBubble {
  /** 'user' (right, chat colour) or 'reply' (left, pale with text bars). */
  side: 'user' | 'reply';
  /** Width in design units (the window is 760 wide). */
  w: number;
  /** Rows of text bars (default 2); sets the height unless `h` is given. */
  lines?: number;
  /** Height in design units (overrides `lines`). */
  h?: number;
  /** Mono text rows drawn in the bubble instead of bars (prop text only; lyric words are the board's). */
  text?: string[];
  /** 0 to 1: the bubble grows from its tail corner (0.4 to 1 scale with opacity); default 1. */
  grow?: number;
  /** 0 to 1: the text bars wipe on left to right; default 1. */
  wipe?: number;
  /** Bubble opacity (a board fades bubbles out whole); default 1. */
  opacity?: number;
  /** Extra space above this bubble, design units. */
  gapBefore?: number;
  /** Leave the bubble empty (no bars), a board types into it. */
  empty?: boolean;
}
export interface ChatWindowProps extends PropBase {
  colours?: Partial<RoleColours>;
  bubbles?: ChatBubble[];
  /** Conversation scroll, design units up (the bubbles move up and are clipped at the title bar). */
  scroll?: number;
  /** Prop text in the title slot (mono); boards usually print lyric words there instead. */
  title?: string;
  /** Prop text in the input field (mono, ground colour). */
  input?: string;
  /** A still cursor in the input field (after `input`, else at the slot's start). */
  caret?: boolean;
  /** The blank dashed avatar chip at the left of the title bar. */
  titleChip?: boolean;
  /** The blank dashed avatar chip at the left end of the input field. */
  inputChip?: boolean;
  /** A static typing indicator (three still dots in a small reply bubble) above the input field. */
  dots?: boolean;
  /** User bubble colour (default accent2 darkened; Paper Trail passes Screen Deep). */
  chat?: string;
  /** Text colour inside user bubbles (default paper). */
  chatInk?: string;
  /** Title bar colour (default the wall role). */
  bar?: string;
  /** Window outline colour (default the muted role, which reads on dark and light grounds). */
  frame?: string;
  /** Chip dash colour (default the muted role). */
  chipColour?: string;
  /** A dark feed slot in the right edge between these design y values (paper feeds out of it). */
  feedSlot?: {y0: number; y1: number};
}
const chatPlace = (p: ChatWindowProps) => place(p, CHAT_WINDOW_SIZE.w);
/** Design-space boxes of the bubbles (before scroll). */
export const chatBubbleBoxes = (bubbles: ChatBubble[] = []): {x: number; y: number; w: number; h: number}[] => {
  let y = BUBBLE_TOP;
  return bubbles.map((b) => {
    y += b.gapBefore ?? 0;
    const h = b.h ?? 26 + (b.lines ?? 2) * 32;
    const x = b.side === 'user' ? W - 6 - BUBBLE_IN - b.w : -W + 6 + BUBBLE_IN;
    const box = {x, y, w: b.w, h};
    y += h + BUBBLE_GAP;
    return box;
  });
};
/** The dashed blank avatar (a circle with a head over shoulders) in design units, centred at c, radius r. */
const chipShapes = (c: Pt, r: number, colour: string, sw: number, dash: string) => (
  <g fill="none" stroke={colour} strokeWidth={sw} strokeDasharray={dash} strokeLinecap="round">
    <path d={circlePath(c.x, c.y, r)} />
    <path d={circlePath(c.x, c.y - r * 0.22, r * 0.3)} />
    <path d={`M${c.x - r * 0.58} ${c.y + r * 0.62}Q${c.x - r * 0.5} ${c.y + r * 0.12} ${c.x} ${c.y + r * 0.14}Q${c.x + r * 0.5} ${c.y + r * 0.12} ${c.x + r * 0.58} ${c.y + r * 0.62}`} />
  </g>
);
const chipDash = (r: number) => `${(r * 0.28).toFixed(2)} ${(r * 0.2).toFixed(2)}`;
const TITLE_CHIP = {x: -W + 40, y: -H + BAR / 2};
const INPUT_CHIP = {x: INPUT.x + 38, y: INPUT.y + INPUT.h / 2};

/** A generic chat window. Anchor: centre. */
export const ChatWindow: React.FC<ChatWindowProps> = (p) => {
  const q = chatPlace(p);
  const sw = outlineFor(q, CHAT_WINDOW_SIZE.w, 0.008);
  const C = roleColours(p.colours);
  const frame = p.frame ?? C.muted;
  const chat = p.chat ?? mix(C.accent2, PALETTE.shadow, 0.45);
  const chatInk = p.chatInk ?? C.paper;
  const replyFill = mix(C.paper, C.muted, 0.24);
  const chipC = p.chipColour ?? C.muted;
  const chipSw = Math.max(worldPx(q, 2), 3);
  const id = clipKey('chat', p);
  const boxes = chatBubbleBoxes(p.bubbles);
  const scroll = p.scroll ?? 0;
  const caretX = INPUT_SLOT.x + (p.input ? p.input.length * 0.612 * 26 + 6 : 4);
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <defs>
        <clipPath id={`${id}-pane`}><rect x={PANE.x} y={PANE.y} width={PANE.w} height={PANE.h} /></clipPath>
      </defs>
      {/* the window: Tissue pane, title bar, outline */}
      <path d={rrectPath(-W, -H, 2 * W, 2 * H, 18)} fill={C.paper} />
      <path d={`M${-W} ${-H + BAR}V${-H + 18}Q${-W} ${-H} ${-W + 18} ${-H}H${W - 18}Q${W} ${-H} ${W} ${-H + 18}V${-H + BAR}Z`} fill={p.bar ?? C.wall} />
      <path d={`M${W - 92} ${-H + BAR / 2}h18M${W - 56} ${-H + BAR / 2 - 9}h18v18h-18zM${W - 22} ${-H + BAR / 2 - 9}l-16 18m0 -18l16 18`} fill="none" stroke={C.muted} strokeWidth={Math.max(worldPx(q, 2), 3.5)} strokeLinecap="round" strokeLinejoin="round" />
      {p.titleChip && chipShapes(TITLE_CHIP, 22, chipC, chipSw, chipDash(22))}
      {p.title && <MonoText x={TITLE_SLOT.x + 6} y={-H + BAR / 2 + 9} text={p.title} size={26} fill={C.paper} />}
      {/* conversation */}
      <g clipPath={`url(#${id}-pane)`}>
        <g transform={scroll ? `translate(0 ${(-scroll).toFixed(2)})` : undefined}>
          {(p.bubbles ?? []).map((b, k) => {
            const bx = boxes[k];
            const g = clamp(b.grow ?? 1), wipe = clamp(b.wipe ?? 1);
            if (g <= 0 || (b.opacity ?? 1) <= 0) return null;
            const right = b.side === 'user';
            const ox = right ? bx.x + bx.w : bx.x, oy = bx.y + bx.h;
            const s = 0.4 + 0.6 * g;
            const barW = [0.82, 0.62, 0.74, 0.5].map((f) => (bx.w - 48) * f * wipe);
            const rows = b.text ? b.text.length : b.h ? Math.max(1, Math.floor((bx.h - 26) / 32)) : b.lines ?? 2;
            return (
              <g key={k} opacity={(b.opacity ?? 1) * clamp(g * 1.5)} transform={g < 1 ? `translate(${ox} ${oy}) scale(${s.toFixed(3)}) translate(${-ox} ${-oy})` : undefined}>
                <path d={bubbleD(bx.x, bx.y, bx.w, bx.h, right)} fill={right ? chat : replyFill} />
                {!b.empty && (b.text
                  ? b.text.map((t, j) => <MonoText key={j} x={bx.x + 24} y={bx.y + 38 + j * 32} text={t} size={24} fill={chatInk} />)
                  : <path d={linesD(bx.x + 24, bx.y + 20, barW.slice(0, rows).map((w, j) => Math.max(0.01, j === rows - 1 ? w * 0.7 : w)), 32, 14)} fill={right ? mix(chat, chatInk, 0.55) : C.muted} />)}
              </g>
            );
          })}
        </g>
      </g>
      {p.dots && (
        <g>
          <path d={bubbleD(-W + 6 + BUBBLE_IN, INPUT.y - 62, 96, 44, false)} fill={replyFill} />
          {[0, 1, 2].map((k) => <circle key={k} cx={-W + 6 + BUBBLE_IN + 26 + k * 22} cy={INPUT.y - 40} r={7} fill={C.muted} />)}
        </g>
      )}
      {/* input field */}
      <path d={rrectPath(INPUT.x, INPUT.y, INPUT.w, INPUT.h, INPUT.h / 2)} fill={mix(C.paper, C.muted, 0.1)} stroke={C.muted} strokeWidth={Math.max(worldPx(q, 1.5), 2.5)} />
      {p.inputChip && chipShapes(INPUT_CHIP, 22, chipC, chipSw, chipDash(22))}
      {p.input && <MonoText x={INPUT_SLOT.x} y={INPUT.y + INPUT.h / 2 + 9} text={p.input} size={26} fill={C.ground} />}
      {p.caret && <rect x={caretX} y={INPUT.y + 16} width={4} height={INPUT.h - 32} fill={C.ground} />}
      <path d={circlePath(INPUT.x + INPUT.w - 36, INPUT.y + INPUT.h / 2, 24)} fill={C.muted} />
      <path d={`M${INPUT.x + INPUT.w - 36} ${INPUT.y + INPUT.h / 2 + 12}V${INPUT.y + INPUT.h / 2 - 12}M${INPUT.x + INPUT.w - 46} ${INPUT.y + INPUT.h / 2 - 2}L${INPUT.x + INPUT.w - 36} ${INPUT.y + INPUT.h / 2 - 12}L${INPUT.x + INPUT.w - 26} ${INPUT.y + INPUT.h / 2 - 2}`} fill="none" stroke={C.paper} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
      {p.feedSlot && <path d={rrectPath(W - 7, p.feedSlot.y0, 14, p.feedSlot.y1 - p.feedSlot.y0, 6)} fill={C.ground} />}
      <path d={rrectPath(-W, -H, 2 * W, 2 * H, 18)} fill="none" stroke={frame} strokeWidth={sw} />
    </g>
  );
};
export const chatWindowQuad = (p: ChatWindowProps): Pt[] => propQuad(chatPlace(p), {x: -W, y: -H, w: 2 * W, h: 2 * H});
/** World quad of the title bar's text slot (where CHAT LOG or ChatGPT is printed). */
export const chatWindowTitleSlot = (p: ChatWindowProps): Pt[] => propQuad(chatPlace(p), TITLE_SLOT);
/** World quad of the input field's text slot (where "somebody typing" sits). */
export const chatWindowInputSlot = (p: ChatWindowProps): Pt[] => propQuad(chatPlace(p), INPUT_SLOT);
/** World quad of the conversation pane (bubbles are clipped to it). */
export const chatWindowPane = (p: ChatWindowProps): Pt[] => propQuad(chatPlace(p), PANE);
/** World quad of bubble k at the current scroll. */
export const chatWindowBubble = (p: ChatWindowProps, k: number): Pt[] => {
  const b = chatBubbleBoxes(p.bubbles)[k];
  if (!b) return [];
  return propQuad(chatPlace(p), {...b, y: b.y - (p.scroll ?? 0)});
};
/** World centre of a chip ('title' or 'input'). */
export const chatWindowChip = (p: ChatWindowProps, which: 'title' | 'input'): Pt => propPoint(chatPlace(p), which === 'title' ? TITLE_CHIP : INPUT_CHIP);
/** World point on the window's outer edge: side 'left' | 'right' | 'top' | 'bottom', `s` 0 to 1 along it (top to
 *  bottom, left to right). Strips go in and out here. */
export const chatWindowEdge = (p: ChatWindowProps, side: 'left' | 'right' | 'top' | 'bottom', s = 0.5): Pt => {
  const v = side === 'left' ? {x: -W, y: -H + 2 * H * s} : side === 'right' ? {x: W, y: -H + 2 * H * s} : side === 'top' ? {x: -W + 2 * W * s, y: -H} : {x: -W + 2 * W * s, y: H};
  return propPoint(chatPlace(p), v);
};
export const chatWindowGraphic = (o: PropGraphicOpts<ChatWindowProps>): DecorGraphic => propGraphic(o, ChatWindow, chatWindowQuad);

/** Natural size: 44 across. */
export const AVATAR_CHIP_SIZE = {w: 44};
export interface AvatarChipProps extends PropBase {
  colours?: Partial<RoleColours>;
  /** Dash colour (default the muted role: Fog on dark grounds; pass Slate on light ones). */
  colour?: string;
}
/** The blank account picture, dashed (storyboard item 30: never filled in). Anchor: its centre. `size` is the 44
 *  diameter. */
export const AvatarChip: React.FC<AvatarChipProps> = (p) => {
  const q = place(p, AVATAR_CHIP_SIZE.w);
  const C = roleColours(p.colours);
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      {chipShapes({x: 0, y: 0}, 22, p.colour ?? C.muted, Math.max(worldPx(q, 2), 3), chipDash(22))}
    </g>
  );
};
export const avatarChipQuad = (p: AvatarChipProps): Pt[] => propQuad(place(p, AVATAR_CHIP_SIZE.w), {x: -24, y: -24, w: 48, h: 48});
export const avatarChipGraphic = (o: PropGraphicOpts<AvatarChipProps>): DecorGraphic => propGraphic(o, AvatarChip, avatarChipQuad);
