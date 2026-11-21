import type {EngineContext} from '../context';
import {bounds, corners} from '../effects/geometry';
import {add, clamp, normDeg, rot} from '../engine/util';
import type {Board, CameraState, ReadingInterval, RigKey, CanvasWord} from '../engine/types';
import type {TokenReading} from './types';
import {boxUnion, centre, type PlacedCue} from './worldLayout';

interface Shot {
  focus: PlacedCue;
  cues: PlacedCue[];
  onset: number;
  ready: number;
  moveStart: number;
  kind: 'track' | 'whip';
  readEnd: number;
  pose: CameraState;
  scan: number;
  pullBack: boolean;
}

export function worldCamera(ctx: EngineContext, board: Board, placed: readonly PlacedCue[]): TokenReading[] {
  const {fps, format: {width, height}} = ctx;
  const start = Math.round(board.start * fps), end = Math.round(board.end * fps);
  const seconds = (n: number) => Math.round(n * fps);
  const shots: Shot[] = [];
  const byOnset = new Map<number, PlacedCue[]>();
  for (const cue of placed) {
    if (cue.onset >= end) throw new Error(`${cue.item.id}: world word starts outside scene ${board.id}`);
    const group = byOnset.get(cue.onset) ?? [];
    group.push(cue);
    byOnset.set(cue.onset, group);
  }
  for (const [onset, cues] of byOnset) {
    const sung = cues.filter(({runs}) => runs[0].vocal);
    const focus = (sung.length ? sung : cues)[0];
    const previous = shots.at(-1);
    const camera = focus.override?.camera;
    if (camera?.width !== undefined && (!Number.isFinite(camera.width) || camera.width <= 0 || camera.width > 1.1)
        || camera?.pan !== undefined && (!Number.isFinite(camera.pan) || Math.abs(camera.pan) > 0.25)
        || camera?.frames !== undefined && (!Number.isSafeInteger(camera.frames) || camera.frames < 1)) {
      throw new Error(`${focus.item.id}: invalid world camera beat for "${focus.runs[0].text}"`);
    }
    const priorRoll = previous?.pose.rot ?? 0;
    const roll = priorRoll + normDeg(-focus.at.angle - priorRoll);
    const sameLine = previous?.focus.line === focus.line;
    const kind = sameLine && roll === priorRoll ? 'track' : 'whip';
    const vocal = focus.runs[0].vocal;
    const wantedReady = onset - (vocal?.preset ? seconds(0.2) : 0);
    const ready = Math.min(onset, Math.max(start, wantedReady, (previous?.onset ?? start - 2) + 2));
    const previousVocal = previous?.focus.runs[0].vocal;
    const previousEnd = previousVocal ? Math.min(previousVocal.end, ready) : previous?.onset ?? start;
    const relinquish = previousVocal ? Math.min(seconds(0.20), Math.floor((previousEnd - previousVocal.onset) * 0.42)) : 0;
    const availableFrom = previous ? Math.min(ready - 1, Math.max(previous.onset + 1, previousEnd - relinquish)) : start;
    const moveStart = Math.max(availableFrom, ready - (camera?.frames ?? seconds(kind === 'whip' ? 0.30 : 0.22)));
    const framed = sung.length ? sung : cues;
    const box = bounds(framed.flatMap(({box}) => corners(box).map((p) => rot(p, roll))));
    const duration = vocal ? (vocal.end - vocal.onset) / fps : 0;
    const widthTarget = focus.small ? 0.70 : duration >= 0.48 ? 1.07 : 0.94;
    const target = camera?.width ?? (vocal ? widthTarget : 0.76);
    const zoom = Math.min(target * width / box.width, 0.90 * height / box.height);
    const ratio = box.width * zoom / width;
    // When the word is wide, keep at least 87% of its box on-screen at each end of the scan.
    const allowed = Math.max(0, Math.min((1 - 0.74 * ratio) / 2, 0.19));
    const scan = clamp((camera?.pan ?? (duration >= 0.47 && ratio >= 0.75 ? 0.18 : 0)) / 2, -allowed, allowed) * width / zoom;
    const mid = centre(box);
    const host = focus.parent && rot(centre(focus.parent.box), roll);
    const bias = host && scan === 0 && framed.length === 1 ? {
      x: clamp((host.x - mid.x) * zoom, -0.08 * width, 0.08 * width) / zoom,
      y: clamp((host.y - mid.y) * zoom, -(height - box.height * zoom) / 2, (height - box.height * zoom) / 2) / zoom,
    } : {x: 0, y: 0};
    const p = rot(add(mid, bias), -roll);
    const pose = {...p, zoom, rot: roll};
    shots.push({focus, cues, onset, ready, moveStart, kind, readEnd: onset, pose, scan, pullBack: false});
    if (previous) previous.readEnd = moveStart;
  }
  if (!shots.length) return [];
  shots.at(-1)!.readEnd = end - 1;

  const lastShotByLine = new Map(shots.filter((shot) => shot.cues.some(({runs}) => runs[0].vocal))
    .map((shot) => [shot.focus.line, shot]));
  const lines = [...lastShotByLine.values()].sort((a, b) => a.onset - b.onset);
  for (const [i, shot] of lines.entries()) {
    shot.pullBack = (i + 1) % 2 === 0;
  }
  for (const shot of shots) {
    shot.pullBack = shot.focus.override?.camera?.pullBack ?? shot.pullBack;
  }

  const rig: RigKey[] = [];
  const world: Record<number, CanvasWord> = {};
  const readings: TokenReading[] = [];
  const addMove = (at: number, until: number, kind: RigKey['kind'], to: CameraState, label: string, joint?: PlacedCue['joint']) => {
    if (until > at) rig.push({t: at / fps, frames: until - at, kind, to, label,
      ...(joint ? {about: {point: joint}} : {})});
  };
  const offset = (shot: Shot, direction: number): CameraState => ({
    ...shot.pose, ...add(shot.pose, rot({x: direction * shot.scan, y: 0}, -shot.pose.rot)),
  });
  for (const [i, shot] of shots.entries()) {
    const {focus, cues, kind, onset, ready, moveStart, pose} = shot;
    const following = shots[i + 1];
    const vocals = cues.flatMap((cue) => cue.runs[0].vocal ? [cue.runs[0].vocal] : []);
    const vocalEnd = Math.max(onset, ...vocals.map(({end}) => end));
    const readEnd = Math.min(shot.readEnd, vocalEnd);
    const scan = shot.scan !== 0 && readEnd - ready >= seconds(0.30);
    const arrival = scan ? offset(shot, -1) : pose;
    if (!i) board.rigStart = arrival;
    else addMove(moveStart, ready, kind, arrival, `${kind} to ${focus.runs[0].text}`, kind === 'whip' ? focus.joint : undefined);
    if (scan) addMove(ready, readEnd, 'track', offset(shot, 1), `scan ${focus.runs[0].text}`);
    for (const cue of cues) {
      const {runs, parent, glyph, attachment} = cue;
      const vocal = runs[0].vocal;
      const set = vocal ? (i ? moveStart : start) : onset;
      const after = cue.override?.burst?.after;
      if (after !== undefined && (!Number.isFinite(after) || after < 0)) {
        throw new Error(`${cue.item.id}: burst delay needs non-negative seconds`);
      }
      const burst = vocal && cue.override?.burst ? Math.max(vocal.end, onset) + 1 + seconds(after ?? 0) : undefined;
      for (const [k, {i: word}] of runs.entries()) {
        world[word] = {set, sung: !!runs[0].vocal, line: cue.line.id,
          attachment: k ? 'baseline' : attachment, parent: k ? runs[k - 1].i : glyph?.word ?? parent?.runs.at(-1)!.i,
          ...(glyph && !k ? {letter: glyph.index} : {}), ...(burst === undefined ? {} : {burst})};
      }
      if (!vocal) continue;
      const interval: ReadingInterval = {start: ready, end: Math.max(ready, Math.min(shot.readEnd, vocal.end))};
      readings.push({token: vocal.token.id, line: cue.item.id, text: vocal.token.text, board: board.id!,
        words: runs.map(({i}) => i), onset: vocal.onset, vocalEnd: vocal.end, preset: vocal.preset, landing: ready, interval});
    }
    const revealWindow = shot.readEnd - vocalEnd;
    if (shot.pullBack && revealWindow >= seconds(0.26)) {
      const whole = boxUnion(placed.slice(0, cues.at(-1)!.index + 1).map(({box}) => box));
      const wideBox = bounds(corners(whole).map((p) => rot(p, pose.rot)));
      const wideZoom = Math.min(width * 0.9 / wideBox.width, height * 0.87 / wideBox.height);
      if (wideZoom < pose.zoom * 0.79) {
        const reveal = {...centre(whole), rot: pose.rot, zoom: wideZoom};
        addMove(vocalEnd, vocalEnd + Math.min(seconds(0.32), revealWindow - 2), 'soar', reveal, 'reveal the canvas');
        // The next incoming move supplies the push-in. A scene-end reveal holds through the cut.
        if (following) following.kind = 'whip';
      }
    }
  }
  board.world = world;
  board.rig = rig;
  board.readingIntervals = Object.fromEntries(readings.flatMap(({words, interval}) => words.map((word) => [word, interval])));
  return readings;
}
