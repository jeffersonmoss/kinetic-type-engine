import type {EngineContext} from '../context';
import {bounds, corners} from '../effects/geometry';
import {add, clamp, normDeg, rot} from '../engine/util';
import {WORLD_DEFAULTS, isWorldAngle, isWorldReadAngle, type SongWordRate, type WorldCameraMove, type WorldReadAngle} from '../engine/worldSettings';
import type {Board, CameraState, CanvasWord, ReadingInterval, RigKey, RigKind} from '../engine/types';
import type {WorldOptions, WorldPullBack} from '../score';
import type {TokenReading} from './types';
import {boxUnion, centre, type PlacedCue} from './worldLayout';

interface Shot {
  focus: PlacedCue;
  cues: PlacedCue[];
  onset: number;
  ready: number;
  moveStart: number;
  move: WorldCameraMove;
  readEnd: number;
  pose: CameraState;
  readAngle: WorldReadAngle;
  macro: boolean;
  arrival: 'pop' | 'preset';
  pullBack?: WorldPullBack;
  pullBackExplicit: boolean;
  phraseStart: number;
}

function scaleTargetFor(focus: PlacedCue, scaleSpec: number | 'whisper' | 'grid' | 'headline' | 'macro' | undefined): {target: number; macro: boolean} {
  if (typeof scaleSpec === 'number') return {target: scaleSpec, macro: scaleSpec > 1.15};
  if (scaleSpec) {
    return {
      target: WORLD_DEFAULTS.scale.tierDefaults[scaleSpec],
      macro: scaleSpec === 'macro',
    };
  }
  // Survey-calibrated defaults: connectors stay compact in grid scale (never blown up to 90% height); hero words fill headline width cleanly.
  if (focus.small) return {target: WORLD_DEFAULTS.scale.tierDefaults.grid, macro: false};
  if (focus.hero) return {target: WORLD_DEFAULTS.scale.tierDefaults.headline, macro: false};
  return {target: 0.74, macro: false};
}

function mapMoveToRigKind(move: WorldCameraMove): RigKind {
  switch (move) {
    case 'cut': return 'cut';
    case 'whip': return 'whip';
    case 'track': return 'track';
    case 'roll': return 'roll';
    case 'push': return 'dive';
    case 'pull': return 'soar';
    case 'hold': return 'hold';
  }
}

function fitsInPose(cues: readonly PlacedCue[], pose: CameraState, width: number, height: number): boolean {
  const halfW = width / 2, halfH = height / 2;
  for (const cue of cues) {
    for (const p of cue.quad) {
      const q = rot({x: (p.x - pose.x) * pose.zoom, y: (p.y - pose.y) * pose.zoom}, pose.rot);
      if (Math.abs(q.x) > halfW * 0.96 || Math.abs(q.y) > halfH * 0.96) return false;
    }
  }
  return true;
}

export function worldCamera(
  ctx: EngineContext,
  board: Board,
  placed: readonly PlacedCue[],
  rate: SongWordRate,
  options: WorldOptions,
): TokenReading[] {
  const {fps, format: {width, height}} = ctx;
  const start = Math.round(board.start * fps), end = Math.round(board.end * fps);
  const sec = (n: number) => Math.round(n * fps);
  const pc = WORLD_DEFAULTS.physicalConstants;
  const hb = WORLD_DEFAULTS.hardBudgets;

  const byId = new Map(placed.map((cue) => [cue.id, cue]));
  const byPhrase = new Map<number, PlacedCue[]>();
  for (const cue of placed) {
    if (cue.onset >= end) throw new Error(`${cue.item.id}: world word starts outside scene ${board.id}`);
    const list = byPhrase.get(cue.phrase) ?? [];
    list.push(cue);
    byPhrase.set(cue.phrase, list);
  }

  const byOnset = new Map<number, PlacedCue[]>();
  for (const cue of placed) {
    const group = byOnset.get(cue.onset) ?? [];
    group.push(cue);
    byOnset.set(cue.onset, group);
  }

  // Decide solver default phrase mode: alternates locked-camera pop-in phrases (~63% pop-ins, ~60% static camera)
  // with decisive cut/whip travel phrases, matching Pulp Fiction Survey normalization Section 2.
  const phraseLocked = new Map<number, boolean>();
  for (const [phraseId, cues] of byPhrase) {
    const sameAngle = cues.every((c) => Math.abs(normDeg(c.at.angle - cues[0].at.angle)) <= 90 + 1e-6);
    phraseLocked.set(phraseId, cues.length >= 2 && sameAngle && phraseId % 2 === 0);
  }

  const onsetList = [...byOnset.entries()];
  const shots: Shot[] = [];
  const rollHistory: {endFrame: number; absDeg: number}[] = [];
  let prevMoveWasExtremeRoll = false;
  let activeEventCount = 0;

  for (let shotIdx = 0; shotIdx < onsetList.length; shotIdx++) {
    const [onset, cues] = onsetList[shotIdx];
    const nextOnset = onsetList[shotIdx + 1]?.[0] ?? end;
    const sung = cues.filter(({runs}) => runs[0].vocal);
    const focus = (sung.length ? sung : cues)[0];
    const previous = shots.at(-1);
    const camSpec = focus.override?.camera;
    const phraseCues = byPhrase.get(focus.phrase) ?? cues;
    const isPhraseStart = phraseCues[0].onset === onset;
    const lockedPhrase = phraseLocked.get(focus.phrase) ?? false;

    const priorRoll = previous?.pose.rot ?? 0;
    const canKeepPriorAngle = isWorldReadAngle(priorRoll + focus.at.angle);
    const prevRolled = rollHistory.length > 0 && previous !== undefined && rollHistory.at(-1)!.endFrame === previous.ready;
    const withinPostRollHold = prevRolled && onset - previous!.ready < sec(hb.minHoldAfterTurn_s);

    // Determine settled camera rotation (strictly multiple of 45°) and active reading angle (0, ±45, ±90).
    let roll = priorRoll;
    if (camSpec?.angle !== undefined) {
      roll = priorRoll + normDeg(camSpec.angle - priorRoll);
    } else if (camSpec?.readAngle !== undefined) {
      const targetCam = normDeg(camSpec.readAngle - focus.at.angle);
      roll = priorRoll + normDeg(targetCam - priorRoll);
    } else if (camSpec?.move === 'hold' && previous && canKeepPriorAngle) {
      roll = priorRoll;
    } else if (!isPhraseStart && lockedPhrase && canKeepPriorAngle) {
      roll = priorRoll;
    } else {
      // Decoupled orientation: allow vertical (±90°) or diagonal (±45°) active reads on short turns
      // instead of always counter-rotating every word back to 0° horizontal.
      const turnFromPrior = Math.abs(normDeg(priorRoll + focus.at.angle));
      const keepNonZeroRead = !!previous && canKeepPriorAngle && turnFromPrior > 0
        && (focus.small || phraseCues.length <= 3) && (focus.phrase % 3 === 1);
      if (keepNonZeroRead) {
        roll = priorRoll;
      } else {
        const targetCam = normDeg(-focus.at.angle);
        const rawDelta = normDeg(targetCam - priorRoll);
        // Solver anti-dizziness guardrail: avoid violating hard budgets on auto-generated rolls.
        const recentWindowStart = onset - sec(hb.rollWindow_s);
        const recentDeg = rollHistory.filter((r) => r.endFrame >= recentWindowStart).reduce((s, r) => s + r.absDeg, 0);
        const lastRoll = rollHistory.at(-1);
        const lastBigRoll = [...rollHistory].reverse().find((r) => r.absDeg >= 90);
        const tooSoonAfterBig = Math.abs(rawDelta) >= 90 && lastBigRoll !== undefined && onset - lastBigRoll.endFrame < sec(hb.minBigTurnGap_s);
        const holdRoomAfter = nextOnset - onset;
        const tooShortForRollHold = Math.abs(rawDelta) >= 45 && !lockedPhrase && holdRoomAfter < sec(hb.minHoldAfterTurn_s);
        const tooDizzy = (prevMoveWasExtremeRoll && Math.abs(rawDelta) >= hb.forbidConsecutiveExtremeTurnsDeg)
          || recentDeg + Math.abs(rawDelta) > hb.maxRollInWindowDeg
          || (lastRoll !== undefined && onset - lastRoll.endFrame < sec(hb.minHoldAfterTurn_s))
          || tooShortForRollHold;
        if ((tooSoonAfterBig || tooDizzy) && canKeepPriorAngle) {
          roll = priorRoll;
        } else {
          roll = priorRoll + rawDelta;
        }
      }
    }

    if (!isWorldAngle(roll)) {
      throw new Error(`${focus.item.id}: [world-angle] camera rotation ${roll}° is not a multiple of 45°`);
    }
    const readAngleRaw = normDeg(roll + focus.at.angle);
    if (!isWorldReadAngle(readAngleRaw)) {
      throw new Error(`${focus.item.id}: [world-read-angle] "${focus.runs[0].text}" would read at ${readAngleRaw}° on screen (must be 0, ±45, or ±90)`);
    }
    const readAngle = (Math.round(readAngleRaw / 45) * 45) as WorldReadAngle;
    const rollDelta = Math.abs(roll - priorRoll);

    // Choose decisive camera move (authored or solver fallback grounded in survey proportions + tempo overflow).
    const availableGapFrames = previous ? onset - (previous.focus.runs[0].vocal?.end ?? previous.onset) : 0;
    const fitsPrevious = !!previous && fitsInPose(sung.length ? sung : cues, previous.pose, width, height);
    let move: WorldCameraMove;
    if (camSpec?.move) {
      move = camSpec.move;
    } else if (!previous) {
      move = 'hold';
    } else if (fitsPrevious && rollDelta < 1e-6 && camSpec?.frame === undefined && camSpec?.scale === undefined) {
      // Target is already framed on the locked camera -> stay dead-still and let the word pop in on its beat!
      move = 'hold';
    } else {
      // Fast-song overflow rule (Survey Normalization 4B.1): never compress a whip below physical 0.125s floor.
      const minWhipFrames = sec(pc.whipDurationRange_s[0]);
      if (availableGapFrames < minWhipFrames && rollDelta < 1e-6) {
        move = 'cut';
      } else if (rollDelta >= 45) {
        // Long pauses allow smooth rolls (Survey: 100% of smooth rolls occur on pauses >= 0.75s); shorter gaps use blur whips or crisp cuts.
        if (availableGapFrames >= sec(pc.smoothRollRange_s[0])) move = 'roll';
        else if (availableGapFrames >= minWhipFrames) move = 'whip';
        else move = 'cut';
      } else {
        // Survey active event mix: ~56% cut, ~25% whip, ~19% smooth track/zoom.
        const bucket = activeEventCount % 9;
        if (bucket < 5) move = 'cut';
        else if (bucket < 7) move = 'whip';
        else move = 'track';
      }
    }

    if (previous && move === 'hold' && (rollDelta > 1e-6 || camSpec?.frame !== undefined || camSpec?.scale !== undefined)) {
      // Holding camera cannot simultaneously change pose/angle/framing; reject explicitly authored contradictions, else keep prior pose.
      if (camSpec?.move === 'hold' && (rollDelta > 1e-6 || camSpec?.scale !== undefined)) {
        throw new Error(`${focus.item.id}: [world-camera-move] move "hold" cannot combine with a camera roll or scale change`);
      }
    }

    // Arrival mechanism: authored or survey proportions (~63% pop-in, ~37% pre-set revealed by camera travel).
    const arrival: 'pop' | 'preset' = focus.override?.arrival
      ?? (move === 'hold' || move === 'cut' || lockedPhrase ? 'pop' : 'preset');

    // Compute move timing using absolute physical constants (never stretched/squashed by WPM).
    const ready = Math.max(start, onset);
    let durFrames = 0;
    if (previous && move !== 'hold' && move !== 'cut') {
      const requestedSec = camSpec?.duration ?? (
        move === 'whip' ? pc.whipDuration_s
          : move === 'roll' ? Math.min(pc.smoothRollDuration_s, Math.max(hb.rollMin_s, availableGapFrames / fps * 0.85))
          : move === 'track' ? pc.trackDuration_s
          : move === 'push' ? pc.pushInDuration_s
          : pc.pullBackDuration_s
      );
      const previousVocal = previous.focus.runs[0].vocal;
      const previousEnd = previousVocal ? Math.min(previousVocal.end, ready) : previous.onset;
      const relinquish = previousVocal
        ? Math.min(sec(pc.cameraMoveAnticipation_s), Math.floor((previousEnd - previousVocal.onset) * 0.42))
        : 0;
      const postRollFloor = prevRolled ? previous.ready + sec(hb.minHoldAfterTurn_s) : previous.ready + 1;
      const earliestStart = Math.min(ready - 1, Math.max(postRollFloor, previousEnd - relinquish));
      const maxAvailable = Math.max(0, ready - earliestStart);
      const desired = Math.max(1, sec(requestedSec));
      const minMoveFrames = move === 'whip' ? sec(hb.whipMin_s) : move === 'roll' ? sec(hb.rollMin_s) : 3;
      if (maxAvailable < minMoveFrames || withinPostRollHold) {
        // Tempo overflow fallback: switch cleanly to a 0-frame hard cut rather than an illegal sub-100ms smear.
        move = fitsPrevious && withinPostRollHold && rollDelta < 1e-6 ? 'hold' : 'cut';
        durFrames = 0;
      } else {
        durFrames = Math.min(desired, maxAvailable);
      }
    }
    const moveStart = move === 'hold' || move === 'cut' ? ready : Math.max(start, ready - durFrames);

    // Compute framing target (word, phrase lockup, or explicit ID list).
    let pose: CameraState;
    let macro = false;
    if (previous && move === 'hold') {
      pose = {...previous.pose};
    } else {
      let framedCues: PlacedCue[];
      const needPhraseHoldForRoll = !camSpec?.frame && rollDelta >= 45 && nextOnset - onset < sec(hb.minHoldAfterTurn_s);
      if (camSpec?.frame === 'phrase' || needPhraseHoldForRoll || (!camSpec?.frame && lockedPhrase && isPhraseStart)) {
        framedCues = phraseCues;
      } else if (Array.isArray(camSpec?.frame)) {
        framedCues = camSpec.frame.map((ref) => byId.get(ref)).filter((c): c is PlacedCue => !!c);
        if (!framedCues.length) framedCues = sung.length ? sung : cues;
      } else {
        framedCues = sung.length ? sung : cues;
      }

      const rotatedPts = framedCues.flatMap(({quad}) => quad.map((p) => rot(p, roll)));
      const box = bounds(rotatedPts);
      const scaleInfo = framedCues.length > 1 && camSpec?.scale === undefined
        ? {target: 0.86, macro: false}
        : scaleTargetFor(focus, camSpec?.scale);
      macro = scaleInfo.macro;

      // Keep active words comfortably inside frame (zero severed leading letters) unless deliberately macro.
      const heightLimit = macro ? 0.96 : 0.82;
      const zoom = Math.min(scaleInfo.target * width / Math.max(1, box.width), heightLimit * height / Math.max(1, box.height));
      const mid = centre(box);
      // Gentle framing bias toward attached parent so surrounding typography bleeds organically at frame edges (~88% clipped frames)
      // while keeping 100% of the active word safely inside the frame!
      const host = focus.parent && rot(centre(focus.parent.box), roll);
      const spareX = Math.max(0, (width - box.width * zoom) * 0.42);
      const spareY = Math.max(0, (height - box.height * zoom) * 0.42);
      const bias = host && !macro && framedCues.length === 1 ? {
        x: clamp((host.x - mid.x) * zoom * 0.25, -spareX, spareX) / zoom,
        y: clamp((host.y - mid.y) * zoom * 0.25, -spareY, spareY) / zoom,
      } : {x: 0, y: 0};
      const p = rot(add(mid, bias), -roll);
      pose = {...p, zoom, rot: roll};
    }

    if (previous && move !== 'hold') {
      activeEventCount++;
      if (rollDelta >= 45) {
        rollHistory.push({endFrame: ready, absDeg: rollDelta});
        prevMoveWasExtremeRoll = rollDelta >= hb.forbidConsecutiveExtremeTurnsDeg;
      } else {
        prevMoveWasExtremeRoll = false;
      }
    }

    const pbRaw = camSpec?.pullBack;
    const pullBack: WorldPullBack | undefined = pbRaw === true
      ? {scope: 'cluster', hold: 0.40, move: 'pull'}
      : pbRaw && typeof pbRaw === 'object' ? pbRaw : undefined;
    const pullBackExplicit = pbRaw !== undefined;

    const shot: Shot = {
      focus,
      cues,
      onset,
      ready,
      moveStart,
      move,
      readEnd: onset,
      pose,
      readAngle,
      macro,
      arrival,
      pullBack,
      pullBackExplicit,
      phraseStart: phraseCues[0].onset,
    };
    if (previous) previous.readEnd = move === 'hold' ? onset : Math.max(previous.ready, moveStart - 1);
    shots.push(shot);
  }

  if (!shots.length) return [];
  shots.at(-1)!.readEnd = end - 1;

  // Solver default pull-backs on long pauses (>= longPauseThreshold_s) when not explicitly overridden.
  const longPauseFrames = sec(rate.longPauseThreshold_s);
  for (const [i, shot] of shots.entries()) {
    if (shot.pullBackExplicit) continue;
    const vocals = shot.cues.flatMap((c) => c.runs[0].vocal ? [c.runs[0].vocal] : []);
    const vocalEnd = Math.max(shot.onset, ...vocals.map(({end: e}) => e));
    const window = shot.readEnd - vocalEnd;
    if (i === shots.length - 1 && window >= sec(pc.pullBackDuration_s + pc.minReadableHold_s)) {
      shot.pullBack = {scope: 'world', hold: Math.max(0.45, (window - sec(pc.pullBackDuration_s)) / fps), move: 'pull'};
    } else if (window >= longPauseFrames) {
      shot.pullBack = {scope: 'cluster', hold: 0.42, move: 'pull'};
    }
  }

  // Emit rig keys, CanvasWord states, and protected reading intervals.
  const rig: RigKey[] = [];
  const world: Record<number, CanvasWord> = {};
  const readings: TokenReading[] = [];
  const setFrameByCue = new Map<PlacedCue, number>();

  const addMove = (at: number, frames: number, kind: RigKind, to: CameraState, label: string, joint?: PlacedCue['joint']) => {
    if (kind === 'hold') return;
    rig.push({
      t: at / fps,
      frames,
      kind,
      to,
      label,
      ...(kind === 'whip' ? {ease: 'out' as const} : {}),
      ...(joint && (kind === 'whip' || kind === 'roll') ? {about: {point: joint}} : {}),
    });
  };

  for (const [i, shot] of shots.entries()) {
    const {focus, cues, move, onset, ready, moveStart, pose, arrival, readAngle, macro} = shot;
    const vocals = cues.flatMap((cue) => cue.runs[0].vocal ? [cue.runs[0].vocal] : []);
    const vocalEnd = Math.max(onset, ...vocals.map(({end: e}) => e));

    if (!i) {
      board.rigStart = pose;
    } else if (move !== 'hold') {
      const kind = mapMoveToRigKind(move);
      const frames = move === 'cut' ? 0 : Math.max(1, ready - moveStart);
      addMove(moveStart, frames, kind, pose, `${move} to ${focus.runs[0].text}`, focus.joint);
    }

    for (const cue of cues) {
      const {runs, parent, glyph, attachment} = cue;
      const vocal = runs[0].vocal;
      const parentSet = parent ? setFrameByCue.get(parent) ?? start : start;
      const rawSet = arrival === 'pop'
        ? onset
        : Math.min(onset, i ? Math.max(start, moveStart) : start);
      const set = Math.max(start, rawSet, parentSet);
      setFrameByCue.set(cue, set);

      const after = cue.override?.burst?.after;
      const readingEnd = vocal ? Math.max(ready, Math.min(shot.readEnd, vocal.end)) : onset;
      const burst = cue.override?.burst
        ? Math.max(readingEnd, vocal?.end ?? onset) + 1 + sec(after ?? 0)
        : undefined;

      for (const [k, {i: word}] of runs.entries()) {
        world[word] = {
          set,
          sung: !!vocal,
          arrival,
          line: cue.line.id,
          attachment: k ? 'baseline' : attachment,
          parent: k ? runs[k - 1].i : glyph?.word ?? parent?.runs.at(-1)!.i,
          ...(glyph && !k ? {letter: glyph.index} : {}),
          ...(burst === undefined ? {} : {burst}),
          readAngle,
          ...(macro ? {macro: true} : {}),
        };
      }
      if (!vocal) continue;
      const interval: ReadingInterval = {start: ready, end: readingEnd};
      readings.push({
        token: vocal.token.id,
        line: cue.item.id,
        text: vocal.token.text,
        board: board.id!,
        words: runs.map(({i: wi}) => wi),
        onset: vocal.onset,
        vocalEnd: vocal.end,
        preset: arrival === 'preset',
        landing: ready,
        interval,
      });
    }

    // Readable pull-back reveal (NEVER emits a 1-frame flash; requires room for both move and >= minReadableHold_s crisp hold).
    if (shot.pullBack) {
      const pbMove = shot.pullBack.move ?? 'pull';
      const minHold = sec(shot.pullBack.hold ?? pc.minReadableHold_s);
      const moveDur = pbMove === 'cut' ? 0 : sec(pbMove === 'whip' ? pc.whipDuration_s : pc.pullBackDuration_s);
      const revealStart = Math.max(vocalEnd + 1, ready + sec(pc.syllableCutHoldFloor_s));
      const revealWindow = shot.readEnd - revealStart;
      if (revealWindow >= moveDur + Math.max(sec(pc.minReadableHold_s), Math.min(minHold, revealWindow - moveDur))) {
        const lastIdx = cues.at(-1)!.index;
        const clusterStart = shot.pullBack.scope === 'world' ? 0 : Math.max(0, lastIdx - 7);
        const visibleSet = placed.slice(clusterStart, lastIdx + 1).filter((c) => {
          const w = world[c.runs[0].i];
          return w && w.set <= revealStart && (w.burst === undefined || w.burst > revealStart);
        });
        if (visibleSet.length >= 2) {
          const targetBox = boxUnion(visibleSet.map(({box}) => box));
          const wideBox = bounds(corners(targetBox).map((p) => rot(p, pose.rot)));
          const fill = shot.pullBack.scope === 'world' ? 0.88 : 0.86;
          const wideZoom = Math.min(width * fill / Math.max(1, wideBox.width), height * fill / Math.max(1, wideBox.height));
          if (wideZoom < pose.zoom * 0.84) {
            const revealPose: CameraState = {...centre(targetBox), rot: pose.rot, zoom: wideZoom};
            addMove(revealStart, moveDur, mapMoveToRigKind(pbMove), revealPose, `reveal ${shot.pullBack.scope ?? 'cluster'}`);
          }
        }
      }
    }
  }

  board.world = world;
  board.rig = rig;
  board.readingIntervals = Object.fromEntries(readings.flatMap(({words, interval}) => words.map((w) => [w, interval])));
  return readings;
}
