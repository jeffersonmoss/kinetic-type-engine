// The type engine's renderer: draws boards (laid-out lyric blocks) through the virtual camera, one SVG.
import React from 'react';
import {FPS, HEIGHT, PALETTE, WIDTH} from './config';
import {SCREEN_CAM, cameraAt, cameraTransform, toScreen} from './camera';
import {carryCam} from './carry';
import {Ground, Vignette} from './ground';
import {ruleAt} from './rules';
import {blockToWorld, layoutBoard, wordCorners, worldToBlock} from './layout';
import {FONT_FAMILY, FONT_STYLE} from './metrics';
import {Panel} from './panel';
import {panelById} from './panels';
import type {BlockGeom, Board, BoardCtx, BoardPanel, BoardLayout, CameraState, Pt, WordGeom, WorldWord} from './types';
import {add, easeInOutCubic, len, polyPath, rad, rot, scale, sfOf} from './util';
import {getVerb, type WordMod} from './verbRegistry';
import {drawGraphics} from './lines';
import {EXIT_FRAMES, baseCtx, boardActive, boardCues, wordStateAt} from './wordState';
import {smearWordPass} from './smearSampling';

/** Drawing order of a block: `z`, or -1 for a DOOR's new block so that it sits under the old word. */
export const blockZ = (b: BlockGeom) => b.def.z ?? (b.def.emerge?.move === 'door' ? -1 : 0);

/** Whether the default type colour on this ground is the dark `ground` colour (palette.light lists such grounds). */
export const isLightGround = (bg: string) => (PALETTE.light ?? []).some((c) => c.toUpperCase() === bg.toUpperCase());
/** Default type colour for a ground: Paper on Ink and Ink 2, Ink on light grounds. */
export const defaultTypeColour = (bg: string) => (isLightGround(bg) ? PALETTE.ground : PALETTE.paper);

export {boardActive};

/** Index of the word being sung on a board (last started), -1 if none. */
export const currentWordOn = (L: BoardLayout, f: number) => { let c = -1; for (const i of L.order) if (L.words.get(i)!.sf <= f) c = i; return c; };

/** Context handed to graphics, paths and letter art. */
export const boardContext = (board: Board, t: number): BoardCtx => {
  const f = t * FPS;
  const L = layoutBoard(board);
  const cam = cameraAt(board, f);
  const word = (i: number): WorldWord => {
    const g = L.words.get(i);
    if (!g) throw new Error(`word ${i} is not on board ${board.id ?? board.start}`);
    const b = L.blocks[g.block];
    const corners = wordCorners(b, g);
    const c = scale(corners.reduce(add, {x: 0, y: 0}), 0.25);
    return {geom: g, cx: c.x, cy: c.y, corners, angle: b.angle, w: g.w, h: g.h};
  };
  return {
    t, frame: f, board, layout: L, cam, word, current: currentWordOn(L, f),
    toScreen: (p: Pt) => toScreen(cam, p),
    blockToWorld: (k: number, p: Pt) => blockToWorld(L.blocks[k], p),
  };
};

const letterXs = (g: WordGeom) => { const xs: number[] = []; let x = g.x; for (const a of g.adv) { xs.push(x); x += a; } return xs; };

/** One word in block-local coordinates. */
const WordView: React.FC<{board: Board; L: BoardLayout; b: BlockGeom; g: WordGeom; m: WordMod; f: number; cam: CameraState; look: Pt; colour: string; uid: string}> = ({board, b, g, m, f, cam, look, colour, uid}) => {
  if (m.hidden || m.opacity <= 0.003) return null;
  const cx = g.x + g.w / 2, cy = g.y + g.h / 2;
  const tf = (dx: number, dy: number) => `translate(${cx + dx} ${cy + dy}) rotate(${m.rot})${m.skewY ? ` skewY(${m.skewY})` : ''} scale(${m.sx} ${m.sy}) translate(${-cx} ${-cy})`;
  const fill = m.tint ?? m.colour ?? colour;
  const fam = FONT_FAMILY[g.font], st = FONT_STYLE[g.font];
  const shadowOn = g.opts.shadow ?? (g.tier >= 2 && !isLightGround(board.bg));
  const shOff = rot({x: 6 / cam.zoom, y: 6 / cam.zoom}, -(cam.rot + b.angle));
  const perLetter = !!m.letters || !!g.opts.replace?.length;
  const xs = letterXs(g);
  const chars = [...g.text];

  const textEl = (key: string, fillC: string, off: Pt) => {
    if (!perLetter) {
      return <text key={key} x={g.x + off.x} y={g.baseline + off.y} fontFamily={fam} fontStyle={st.fontStyle} fontWeight={st.fontWeight} fontSize={g.size}
        fill={fillC} textLength={g.w} lengthAdjust="spacingAndGlyphs">{g.text}</text>;
    }
    return (
      <g key={key}>
        {chars.map((ch, k) => {
          const lm = m.letters?.[k];
          if ((lm?.opacity ?? 1) <= 0.003 || ch === ' ') return null;
          const art = g.opts.replace?.find((r) => r.index === k);
          const lx = xs[k] + g.adv[k] / 2, ly = g.y + g.h / 2;
          const ltf = lm ? `translate(${lx + lm.dx} ${ly + lm.dy}) rotate(${lm.rot}) scale(${lm.s * (lm.sx ?? 1)} ${lm.s}) translate(${-lx} ${-ly})` : undefined;
          if (art) {
            if (key === 'sh') return null;
            const box = {x: xs[k], y: g.y, w: g.adv[k], h: g.h, cx: lx, cy: ly, size: g.size};
            const d = Math.min(g.h, g.adv[k] * 1.15);
            let el: React.ReactNode = null;
            if (art.art === 'hole') el = <g><ellipse cx={lx} cy={ly} rx={g.adv[k] * 0.42} ry={g.h * 0.42} fill={art.colour ?? PALETTE.ground} /><ellipse cx={lx} cy={ly} rx={g.adv[k] * 0.42} ry={g.h * 0.42} fill="none" stroke={fillC} strokeWidth={3} vectorEffect="non-scaling-stroke" /></g>;
            else if (art.art === 'ring') el = <circle cx={lx} cy={ly} r={d * 0.39} fill="none" stroke={art.colour ?? PALETTE.highlight} strokeWidth={d * 0.22} />;
            else if (typeof art.art === 'function') el = art.art(box, {t: f / FPS, frame: f, look});
            return <g key={k} opacity={lm?.opacity ?? 1} transform={ltf}>{el}</g>;
          }
          return (
            <text key={k} x={xs[k] + off.x} y={g.baseline + off.y} fontFamily={fam} fontStyle={st.fontStyle} fontWeight={st.fontWeight} fontSize={g.size} fill={fillC}
              textLength={g.adv[k]} lengthAdjust="spacingAndGlyphs" opacity={lm?.opacity ?? 1} transform={ltf}>{ch}</text>
          );
        })}
      </g>
    );
  };

  const body = (dx: number, dy: number, op: number, key: string) => {
    const pad = (g.opts.plate?.pad ?? 0.18) * g.size;
    return (
      <g key={key} transform={tf(dx, dy)} opacity={op}>
        {g.opts.plate && (
          <>
            {g.opts.plate.shadow !== false && <rect x={g.x - pad + shOff.x} y={g.y - pad + shOff.y} width={g.w + 2 * pad} height={g.boxH + 2 * pad} fill={PALETTE.shadow} />}
            <rect x={g.x - pad} y={g.y - pad} width={g.w + 2 * pad} height={g.boxH + 2 * pad} fill={g.opts.plate.fill} />
          </>
        )}
        {shadowOn && !g.opts.plate && textEl('sh', PALETTE.shadow, shOff)}
        {textEl('tx', fill, {x: 0, y: 0})}
        {m.marks}
      </g>
    );
  };
  const content = (
    <g>
      {(m.ghosts ?? []).map((gh, k) => body(gh.dx, gh.dy, gh.opacity, `gh${k}`))}
      {body(m.dx, m.dy, m.opacity, 'main')}
    </g>
  );
  if (!m.clip) return content;
  const id = `clip-${uid}-${g.i}`;
  return (
    <g>
      <clipPath id={id}><path d={m.clip} clipRule="evenodd" /></clipPath>
      <g clipPath={`url(#${id})`}>{content}</g>
    </g>
  );
};

/** Every rule of a board at t (rules.ts): 3 world px by default, never under 2 px on screen. */
export const BoardRules: React.FC<{board: Board; t: number; cam: CameraState}> = ({board, t, cam}) => (
  <g>
    {(board.rules ?? []).map((def) => {
      const s = ruleAt(board, def, t);
      if (!s || s.len < 0.25) return null;
      return <line key={def.id} x1={s.a.x} y1={s.a.y} x2={s.b.x} y2={s.b.y} stroke={s.colour} strokeWidth={Math.max(s.width, 2 / Math.max(0.01, cam.zoom))} opacity={s.opacity} strokeLinecap="butt" />;
    })}
  </g>
);

/** One board at song time t (without the SVG root). */
/** Which part of a board a motion-blur pass draws (smear.tsx): 'blur' is one sub-frame sample of everything the camera
 *  moves except the words being read; 'sharp' is, at the frame's own time, the words being read and everything in screen
 *  space (pinned blocks, screen graphics, the vignette). Without a pass the board is drawn whole, once. */
export type SmearPass = 'blur' | 'sharp';
export const BoardView: React.FC<{board: Board; t: number; uid?: string; smearPass?: SmearPass; sharpFrame?: number}> = ({board, t, uid = 'b', smearPass, sharpFrame}) => {
  const f = t * FPS;
  if (!boardActive(board, f)) return null;
  const ctx = boardContext(board, t);
  const {layout: L, cam} = ctx;
  const endF = board.end * FPS;
  const colour = board.colour ?? defaultTypeColour(board.bg);
  // where the sung word is, for letter art that looks at it
  const cur = ctx.current >= 0 ? ctx.word(ctx.current) : null;
  // motion blur is never on a word from 3 frames after it is sung until it retires (rule 178), judged at the frame itself
  const f0 = sharpFrame ?? f;
  // and a word arriving during the shutter is drawn once, sharp, too, never at the partial opacity of the samples it is
  // in (Fable round 2 item 30); a word in neither pass is in no sample (smearSampling.ts)
  const passOf = (g: WordGeom) => smearWordPass(board, g.i, g.sf, f0);
  const sharp = (g: WordGeom) => smearPass !== undefined && passOf(g) === 'sharp';
  const blurred = (g: WordGeom) => smearPass === undefined || passOf(g) === 'blur';
  const blurPass = smearPass === 'blur', sharpPass = smearPass === 'sharp';
  // drawing order with panels: a panel, then the blocks printed on it, then free blocks of the same z
  const panelZ = (id: string) => panelById(board, id)?.z ?? 0;
  const keyOf = (b: BlockGeom): number[] => (b.def.on ? [panelZ(b.def.on), 1, blockZ(b)] : [blockZ(b), 2, 0]);
  const cmp = (x: number[], y: number[]) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  const layers = (withPanels: boolean) => {
    const items: {key: number[]; block?: BlockGeom; panel?: BoardPanel}[] = L.blocks.map((b) => ({key: keyOf(b), block: b}));
    if (withPanels) for (const p of board.panels ?? []) items.push({key: [p.z ?? 0, 0, 0], panel: p});
    return items.sort((x, y) => cmp(x.key, y.key));
  };
  const drawBlocks = (pick: (b: BlockGeom, g: WordGeom) => boolean, bcam: CameraState, withPanels = false) => layers(withPanels).map(({block: b, panel}, k) => panel
    ? <Panel key={`p${panel.id}`} def={panel} t={t} uid={`${uid}-${panel.id}`} />
    : b && (
    <g key={`b${b.index}-${k}`} transform={`translate(${b.ox} ${b.oy}) rotate(${b.angle})`}>
      {b.words.filter((g) => pick(b, g)).map((g) => {
        const m = wordStateAt(board, g.i, f);
        const lc = blockToWorld(b, {x: g.x + g.w / 2, y: g.y + g.h / 2});
        const look = cur ? rot({x: cur.cx - lc.x, y: cur.cy - lc.y}, -b.angle) : {x: 0, y: 0};
        return <WordView key={g.i} board={board} L={L} b={b} g={g} m={m} f={f} cam={bcam} look={len(look) > 2 ? look : {x: 0, y: 0}} colour={g.opts.colour ?? colour} uid={`${uid}${sfOf(board.start)}`} />;
      })}
    </g>
  ));
  const onBoard = (b: BlockGeom) => b.def.pin !== 'screen';
  const blocks = sharpPass ? null : drawBlocks((b, g) => onBoard(b) && blurred(g), cam, true);
  const sharpBlocks = sharpPass ? drawBlocks((b, g) => onBoard(b) && sharp(g), cam) : null;
  const pinned = !blurPass && L.blocks.some((b) => !onBoard(b)) ? drawBlocks((b) => !onBoard(b), carryCam(board, f, SCREEN_CAM)) : null;
  const overlays = boardCues(board).map((cue, k) => {
    const def = getVerb(cue.name);
    if (!def?.overlay) return null;
    return <g key={k}>{def.overlay(baseCtx(cue, L, f))}</g>;
  });
  const sid = `${uid}-${sfOf(board.start)}`;
  let inner = sharpPass ? (
    <g>
      <g transform={cameraTransform(cam)}>{sharpBlocks}</g>
      {pinned}
      {drawGraphics(board, ctx, 'screen')}
      {board.vignette !== false && <Vignette uid={sid} />}
    </g>
  ) : (
    <g>
      <Ground board={board} t={t} />
      <g>
        <g transform={cameraTransform(cam)}>
          {drawGraphics(board, ctx, 'under')}
          <BoardRules board={board} t={t} cam={cam} />
          {(board.paths ?? []).map((p) => <g key={`path-${p.id}`}>{p.draw(ctx)}</g>)}
          {blocks}
          {overlays}
          {drawGraphics(board, ctx, 'over')}
        </g>
      </g>
      {!blurPass && pinned}
      {!blurPass && drawGraphics(board, ctx, 'screen')}
      {!blurPass && board.vignette !== false && <Vignette uid={sid} />}
    </g>
  );
  const df = f - endF;
  if (df >= 0 && board.exit === 'leave') {
    // leave: slides a quarter frame left while fading (16 frames; peak speed within the cap)
    const p = easeInOutCubic(df / EXIT_FRAMES.leave);
    inner = <g transform={`translate(${-0.25 * WIDTH * p} 0)`} opacity={1 - p}>{inner}</g>;
  }
  if (df >= 0 && board.exit === 'cut') {
    // Slice: a 12-degree cut travels left to right in 12 frames (brief 12.3); this (old) board survives only right of it.
    const p = easeInOutCubic(df / EXIT_FRAMES.cut);
    const tan = Math.tan(rad(12));
    const X = -HEIGHT * tan + p * (WIDTH + 2 * HEIGHT * tan);
    const top = X + (HEIGHT / 2) * tan, bot = X - (HEIGHT / 2) * tan;
    const id = `slice-${uid}-${sfOf(board.start)}`;
    return (
      <g>
        <clipPath id={id}><path d={polyPath([{x: top, y: -10}, {x: WIDTH + 400, y: -10}, {x: WIDTH + 400, y: HEIGHT + 10}, {x: bot, y: HEIGHT + 10}])} /></clipPath>
        <g clipPath={`url(#${id})`}>
          <rect x={0} y={0} width={WIDTH} height={HEIGHT} fill={board.bg} />
          {inner}
        </g>
        <line x1={top} y1={0} x2={bot} y2={HEIGHT} stroke={PALETTE.paper} strokeWidth={3} />
      </g>
    );
  }
  return inner;
};

export interface TypeStageProps {
  boards: Board[];
  /** Absolute song time (use useSongTime(chunkStart)). */
  t: number;
  /** Prefix for SVG ids when several TypeStages share a frame. */
  uid?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  /** Motion-blur pass (SmearStage sets these; leave them unset). */
  smearPass?: SmearPass;
  /** The frame being rendered, when `t` is a sub-frame sample time (rule 178's read words are judged at this frame). */
  sharpFrame?: number;
}
/** All active boards at t in one frame-sized SVG. An exiting board is drawn over the board replacing it. */
export const TypeStage: React.FC<TypeStageProps> = ({boards, t, uid = 'ts', style, children, smearPass, sharpFrame}) => {
  const f = t * FPS;
  const active = boards.filter((b) => boardActive(b, f)).sort((a, b) => b.start - a.start);
  return (
    <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={{position: 'absolute', inset: 0, overflow: 'hidden', ...style}}>
      {active.map((b, k) => <BoardView key={`${b.id ?? ''}${b.start}`} board={b} t={t} uid={`${uid}${k}`} smearPass={smearPass} sharpFrame={sharpFrame} />)}
      {children}
    </svg>
  );
};

export {worldToBlock};
