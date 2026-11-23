import { scanOverlap, checkPropWordOverlap, OVERLAP_GATE } from './overlap_gate.mjs';
// Single-build assembler, Best-of-200 selector, seed variants, pins, and CLI (rulebook 4.4, 13.4, 18.6.2, 18.8).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { seedFor } from './rng.mjs';
import { planWords } from './plan_words.mjs';
import { checkPalette, checkSlots, assignStyles, resolvePlaqueWordStyles, normalizePalette } from './style.mjs';
import { composePlaques } from './compose_plaques.mjs';
import { planTrail } from './plan_trail.mjs';
import { planCameraAndVisibility } from './camera.mjs';
import { planJoints, applyRepeatRunGroups } from './plan_joints.mjs';
import { evaluateScene } from './checks.mjs';
import { repairShown, gateFailures } from './shown_gate.mjs';
import { staticFocusRuns } from './composition.mjs';
import { frameClearOfProps } from './keep_clear.mjs';
// Hard gate (Jefferson, rough cut 4): no severity fallback, demotion or ruling waives it.
export const SHOWN_GATE = '13.1.0_every_sung_word_shown_whole';
// Readable size and sparse frames (engine fix brief 3, items 2 and 4): ranked right after the shown-whole gate.
export const SIZE_CHECK = '13.1.20_readable_size_and_sparse_frames';
export const STATIC_CHECK = '13.1.21_static_partly_on_screen_focus';
export const PROP_OVERLAP_GATE = '13.1.22_prop_covers_sung_word';
import { renderProvenanceMarkdown } from './provenance.mjs';
import { plaqueSheet, trailSheet } from './debug_svg.mjs';

const add = (a, b) => a.map((x, i) => x + b[i]);
// Spec 43.1.1: the scene's joint record (provenance such as rejected candidates and pins stays in the build log).
const sceneJoint = j => (j ? {
  prim: j.prim, family: j.family, host: j.host, edge: j.edge, mode: j.mode, f0: j.f0, f1: j.f1,
  run: j.run ?? null, forced_repeat: !!j.forced_repeat, ...(j.carried ? { carried: true } : {}),
  ...(j.letter ? { letter: j.letter } : {}),
} : null);
const mul = (a, k) => a.map(x => x * k);

// Font metrics for the fonts viewer.html loads; they live in the shared engine's fonts folder (KTE_METRICS overrides).
const DEFAULT_METRICS_PATH = process.env.KTE_METRICS ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '../fonts/room-for-one-variety.metrics.json');

export function buildSingle({
  wordsInput,
  map,
  metrics,
  palette,
  title,
  salt,
  buildIndex = 0,
  clipName = 'Clip',
  window: win = [0, 21.971, 24.5],
  vfov = 40,
  fps = 30,
  family = 'Corner Room',
  mortar = 0.30,
  panel = 'on',
  wordsMode = 'pop',
  ease = 'asymmetric',
  pinnedShots = null,
  preservePinnedTiming = false,
  joints = true,
  stage = null,
}) {
  const [startSec, endSec, revealUntil] = win;
  const fullSalt = `${salt}#${buildIndex}`;
  const seed = seedFor(title, fullSalt);

  // Stage 1-2: words, clusters, shots, tiers.
  const wordPlan = planWords(wordsInput, map, endSec, title);
  const { shots } = wordPlan;

  // Stage 3: styles.
  const styleDecisions = assignStyles(shots, palette, seed, { pinnedShots });

  // Stage 4: plaques.
  const plaques = composePlaques(shots, metrics, seed, { mortar, pinnedShots, stage, fps });
  // Spec 32.3: each repeat run lands as one still group (layout unchanged).
  if (joints) applyRepeatRunGroups(shots, map.tempo_bpm);

  // Stage 5-6: trail geometry with look-ahead.
  const trail = planTrail({
    shots,
    plaques,
    map,
    seed,
    vfov,
    fps,
    clipEnd: endSec,
    family,
    panelMode: panel,
    wordsMode,
    pinnedShots,
  });

  // Finalize surface-dependent colours and post-fit block rules (12.1.3, 12.2).
  const styleResolveLogs = trail.placedPlaques.map(p => resolvePlaqueWordStyles(p.words, palette, p.surface));

  // Stage 6b: attached word transitions (Fable spec, 22 November 2026).
  const jointPlan = joints
    ? planJoints({ shots, placedPlaques: trail.placedPlaques, boundaries: trail.boundaries, map, seed, metrics, vfov, fps, wordsMode, pinnedShots, clipEnd: endSec })
    : null;

  // Stage 7-9: camera keys, visibility, reveal.
  const cameraPlan = planCameraAndVisibility({
    shots,
    placedPlaques: trail.placedPlaques,
    trailBoundaries: trail.boundaries,
    map,
    seed,
    vfov,
    fps,
    clipEnd: endSec,
    revealUntil,
    family,
    wordsMode,
    easeMode: ease,
    panelMode: panel,
    pinnedShots,
    preservePinnedTiming,
    jointPlan,
  });

  // Assemble scene.json (18.3.16).
  const scenePlaques = trail.placedPlaques.map((p, si) => {
    const pt = cameraPlan.plaqueTiming[si];
    return {
      id: p.id,
      shot: p.shot,
      C: p.C,
      R: p.R,
      U: p.U,
      N: p.N,
      w: p.w,
      h: p.h,
      thickness: p.thickness,
      surface: p.surface,
      flip_mounted: !!p.flip_mounted,
      fold: p.fold,
      on: pt.on,
      off: pt.off,
      reveal_on: pt.reveal_on,
      reveal_stamp: pt.reveal_stamp,
    };
  });

  const sceneWords = [];
  for (let si = 0; si < trail.placedPlaques.length; si++) {
    const p = trail.placedPlaques[si];
    for (const w of p.words) {
      let wR = p.R, wU = p.U;
      if (w.turn === 90) { wR = p.U; wU = mul(p.R, -1); }
      else if (w.turn === -90) { wR = mul(p.U, -1); wU = p.R; }
      const wC = add(p.C, add(mul(p.R, w.x), add(mul(p.U, w.y), mul(p.N, 0.5))));
      const wt = cameraPlan.wordTimings.get(w.id);
      sceneWords.push({
        id: w.id,
        text: w.text,
        plaque: p.id,
        cluster: w.cluster,
        role: w.role,
        cap: w.cap,
        font: w.font,
        slot: w.slot,
        rowScale: w.rowScale,
        style: w.style,
        colours: w.colours,
        w: w.boxW,
        h: w.boxH,
        fontPx: w.fontPx,
        pad: w.pad,
        C: wC,
        R: wR,
        U: wU,
        N: p.N,
        on: wt.on,
        stamp: wt.stamp,
        off: wt.off,
        reveal_on: wt.reveal_on,
        reveal_stamp: wt.reveal_stamp,
        ...(jointPlan ? { motion: wt.motion, clip: wt.clip, joint: sceneJoint(wt.joint), ...(wt.pre_offset ? { pre_offset: wt.pre_offset } : {}) } : {}),
      });
    }
  }

  const sceneCams = cameraPlan.cams.map(k => ({
    f0: k.f0,
    f1: k.f1,
    kind: k.kind,
    verb: k.verb,
    fold: k.fold,
    ease: k.ease,
    from: { target: k.from.target, R: k.from.R, U: k.from.U, N: k.from.N, dist: k.from.dist },
    to: { target: k.to.target, R: k.to.R, U: k.to.U, N: k.to.N, dist: k.to.dist },
    bow: !!k.bow,
    stagger: !!k.stagger,
    hold_target_until: k.hold_target_until ?? 0,
    ...(k.flip ? { flip: k.flip, flipAxis: k.flipAxis } : {}),
    ...(k.pivot ? { pivot: k.pivot } : {}),
    ...(k.joint ? { joint: k.joint } : {}),
  }));

  const scene = {
    meta: {
      clip: clipName,
      flags: { mortar, panel, words: wordsMode, ease },
      title,
      salt,
      buildIndex,
      fps,
      vfov,
      frames: cameraPlan.totalFrames,
      ...(jointPlan ? { joints_version: 1 } : {}),
      palette: {
        ground: palette.ground,
        panel: palette.panel,
        panel_side: palette.panel_side,
        styles: palette.styles, // viewer.html takes any style it lacks from here
      },
    },
    end: revealUntil,
    plaques: scenePlaques,
    words: sceneWords,
    cams: sceneCams,
  };

  // Stage 9b (Jefferson, rough cut 4, 22 November 2026): every sung word is shown whole when it appears. The camera
  // plan is repaired until the gate holds (shown_gate.mjs); the gate itself is hard (see the candidate pick below).
  const sungT = new Map(shots.flatMap(s => s.words).map(w => [w.id, w.t]));
  for (const w of scene.words) if (sungT.has(w.id)) w.t = sungT.get(w.id);
  const onsetOf = w => (w.t != null ? Math.round(w.t * fps) : null);
  const gateUntil = Math.min(...scene.words.map(w => w.reveal_on ?? Infinity));
  // Brief 18: when section build receives keep-clear stage geometry, reframe prop-active holds into the clear area
  // before shown-whole repair and evaluation.
  const hasStageProps = !!(stage && globalThis.KT_INTERP?.hasKeepClearProps?.(stage));
  if (hasStageProps) {
    scene.backdrops = stage.backdrops;
    scene.props = stage.props;
    frameClearOfProps(scene, onsetOf, { until: Math.min(gateUntil, scene.meta.frames) });
  }
  const shownRepair = jointPlan ? repairShown(scene, onsetOf, { until: gateUntil }) : { before: 0, after: 0, log: [], remaining: [] };

  // Stage 10: hard checks and score.
  trail.boundaries.backtracks = trail.backtracks;
  const evaluation = evaluateScene({
    scene,
    shots,
    placedPlaques: trail.placedPlaques,
    trailBoundaries: trail.boundaries,
    cameraPlan,
    map,
    wordsMode,
    jointPlan,
  });
  if (shownRepair.remaining.length) {
    const k = SHOWN_GATE;
    evaluation.checks[k] = { failures: shownRepair.remaining.map(x => `${x.id} (${x.text}) sung at ${x.onsetF}: ${x.why}`) };
    evaluation.failedChecks = [k, ...evaluation.failedChecks];
    evaluation.passed = false;
  }

  const overlap = scanOverlap(scene, { from: Math.min(...scene.words.map(w => w.on)), until: Math.min(gateUntil, scene.meta.frames), repair: true });
  if (overlap.overlaps.length) {
    evaluation.checks[OVERLAP_GATE] = { failures: overlap.overlaps };
    evaluation.failedChecks.push(OVERLAP_GATE);
    evaluation.passed = false;
  }
  // Brief 8 item 58: a focused word static and partly on screen (the join can only slide, drop or hide it by
  // necessity) ranks the candidate down, right after the shown-whole gate; it does not by itself fail one.
  const staticFocus = staticFocusRuns(scene, onsetOf, { until: Math.min(gateUntil, scene.meta.frames) });
  if (staticFocus.length) {
    evaluation.checks[STATIC_CHECK] = { failures: staticFocus.map(x => `${x.w.id} (${x.w.text}) ${Math.round(100 * x.share)}% on screen and static, frames ${x.start}-${x.end}`) };
    evaluation.failedChecks.push(STATIC_CHECK);
  }
  const soft = [...(shownRepair.small ?? []), ...(shownRepair.sparse ?? [])];
  if (soft.length) {
    evaluation.checks[SIZE_CHECK] = { failures: soft.map(x => `${x.id} (${x.text}) sung at ${x.onsetF}: ${x.why}`) };
    evaluation.failedChecks.push(SIZE_CHECK); // ranks candidates (survivors too); it does not by itself fail one
  }
  // The overlap repair retires words after the shown-whole repair ran: judge the focused words again on the scene as
  // it is written, so a candidate cannot pass (or rank) on a stale shown-whole result.
  if (overlap.retired.length) {
    const known = new Set(shownRepair.remaining.map(x => x.id));
    const fresh = gateFailures(scene, onsetOf, { until: gateUntil }).filter(x => x.kind === 'partial' && !known.has(x.id));
    if (fresh.length) {
      shownRepair.remaining.push(...fresh);
      evaluation.checks[SHOWN_GATE] = { failures: shownRepair.remaining.map(x => `${x.id} (${x.text}) sung at ${x.onsetF}: ${x.why}`) };
      if (!evaluation.failedChecks.includes(SHOWN_GATE)) evaluation.failedChecks.unshift(SHOWN_GATE);
      evaluation.passed = false;
    }
  }
  if (hasStageProps) {
    const propCheck = checkPropWordOverlap(scene, onsetOf, { until: Math.min(gateUntil, scene.meta.frames) });
    if (!propCheck.pass) {
      evaluation.checks[PROP_OVERLAP_GATE] = { failures: propCheck.violations.map(v => v.summary) };
      evaluation.failedChecks.push(PROP_OVERLAP_GATE);
      evaluation.passed = false;
    }
    delete scene.backdrops;
    delete scene.props;
  }

  // Build structured build log (4.1, 18.7.4) and pin snapshot (18.8.8).
  let changeCounter = 0;
  const shotLogs = [];
  const pinSnapshot = [];
  const divergences = [];

  for (let si = 0; si < shots.length; si++) {
    const shot = shots[si];
    const p = trail.placedPlaques[si];
    const bnd = trail.boundaries[si];
    const pt = cameraPlan.plaqueTiming[si];
    const camLog = cameraPlan.shotCameraLogs[si];
    const sty = styleDecisions[si];
    const changesOnItsOwn = [];

    const addChange = (stage, detail) => {
      const id = `c${++changeCounter}`;
      changesOnItsOwn.push({ id, stage, detail });
    };

    for (const c of p.changes ?? []) addChange(c.stage, c.reason);
    for (const c of styleResolveLogs[si] ?? []) addChange('style', `${c.word}: ${c.from}->${c.to} (${c.reason})`);
    if (bnd) {
      for (const l of bnd.ladderLog ?? []) {
        addChange('plan_trail', `${l.step} ${l.fold} (${l.edge ?? ''} ${l.alignMode ?? ''}): ${l.failedTest ?? 'used'}`);
      }
      if (bnd.earlyHidePrev2) {
        addChange('plan_trail', `early hide p${si - 1} (${bnd.earlyHideReason})`);
      }
    }
    for (const c of camLog.changes ?? []) addChange(c.stage, c.reason);

    // Check fork pin divergences (18.8.8).
    const shotDivReasons = [];
    if (pinnedShots?.[si]) {
      const pin = pinnedShots[si];
      if (p.layout !== pin.layout) shotDivReasons.push(`layout ${pin.layout}->${p.layout}`);
      if (JSON.stringify(p.slots) !== JSON.stringify(pin.slots)) shotDivReasons.push(`slots ${pin.slots.join('/')}->${p.slots.join('/')}`);
      if (JSON.stringify(p.arrangements) !== JSON.stringify(pin.arrangements)) shotDivReasons.push(`arr ${pin.arrangements.join('/')}->${p.arrangements.join('/')}`);
      if (bnd && pin.boundary) {
        if (bnd.fold !== pin.boundary.fold) shotDivReasons.push(`fold ${pin.boundary.fold}->${bnd.fold}`);
        if (bnd.edge !== pin.boundary.edge) shotDivReasons.push(`edge ${pin.boundary.edge}->${bnd.edge}`);
        if (bnd.sign !== pin.boundary.sign) shotDivReasons.push(`sign ${pin.boundary.sign}->${bnd.sign}`);
        if (bnd.alignMode !== pin.boundary.alignMode) shotDivReasons.push(`align ${pin.boundary.alignMode}->${bnd.alignMode}`);
        if (camLog.entryVerb !== pin.boundary.verb) shotDivReasons.push(`verb ${pin.boundary.verb}->${camLog.entryVerb}`);
      }
      if (shotDivReasons.length) {
        addChange('pins', `diverged from A pin: ${shotDivReasons.join(', ')}`);
        divergences.push({ shot: si + 1, reasons: shotDivReasons });
      }
    }

    const finalBoundary = bnd
      ? {
          fold: bnd.fold,
          verb: camLog.entryVerb,
          edge: bnd.edge,
          sign: bnd.sign,
          alignMode: bnd.alignMode,
          gap: bnd.gap,
          gapU: bnd.gapU,
        }
      : null;

    const intendedBoundary = bnd
      ? {
          ...(bnd.intended ?? { fold: bnd.intendedFold, edge: bnd.edge, sign: bnd.sign, alignMode: bnd.alignMode, gap: bnd.gap }),
          verb: camLog.entryVerbIntended ?? bnd.intendedVerb,
        }
      : null;

    shotLogs.push({
      shot: si + 1,
      words: shot.words.map(w => ({ id: w.id, text: w.text, role: w.role })),
      boundary: shot.boundary,
      isSetPiece: bnd?.isSetPiece ?? false,
      isEcho: !!shot.echo,
      motifOf: shot.motifOf != null ? shot.motifOf + 1 : null,
      parallelOf: shot.parallelOf != null ? shot.parallelOf + 1 : null,
      pinned: !!pinnedShots?.[si],
      intendedBoundary,
      finalBoundary: finalBoundary ? { ...finalBoundary, kind: bnd.kind, intendedKind: bnd.intendedKind, flipAxis: bnd.flipAxis } : finalBoundary,
      intendedPlaque: p.intended,
      finalPlaque: {
        layout: p.layout,
        side: p.side,
        slots: p.slots,
        arrangements: p.arrangements,
        surface: p.surface,
        Q: p.Q,
        fill: p.terms.fill,
      },
      styles: sty,
      joints: jointPlan ? jointPlan.joints.filter(j => j.shot === si + 1).map(j => ({ word: j.word, text: j.text, prim: j.prim, family: j.family, host: j.host, edge: j.edge, mode: j.mode, f0: j.f0, f1: j.f1, run: j.run, forced_repeat: j.forced_repeat, pinned: j.pinned })) : null,
      changesOnItsOwn,
      frames: {
        landings: camLog.landingFrames,
        accents: camLog.accentFrames,
        on: pt.on,
        off: pt.off,
        offOnScreen: pt.offOnScreen,
        offReason: pt.offReason,
        reveal_on: pt.reveal_on,
      },
      codePaths: [
        'plan_words.mjs:planWords',
        'style.mjs:assignStyles',
        'compose_plaques.mjs:composePlaques',
        'plan_trail.mjs:planTrail',
        'camera.mjs:planCameraAndVisibility',
      ],
    });

    pinSnapshot.push({
      shot: si + 1,
      layout: p.layout,
      side: p.side,
      slots: p.slots,
      arrangements: p.arrangements,
      styles: sty,
      boundary: finalBoundary,
      internalVerbs: cameraPlan.shotInternalVerbs[si],
      ...(jointPlan ? { joints: jointPlan.joints.filter(j => j.shot === si + 1 && !j.carriedIds).map(j => ({ word: j.word, prim: j.prim, edge: j.edge, mode: j.mode, D: j.D })) } : {}),
      accents: camLog.accentDecision ?? {},
      plaqueTiming: {
        on: pt.on,
        off: pt.off,
        offOnScreen: pt.offOnScreen,
        offReason: pt.offReason,
        reveal_on: pt.reveal_on,
        reveal_stamp: pt.reveal_stamp,
      },
    });
  }

  const buildLog = {
    clip: clipName,
    title,
    salt,
    buildIndex,
    seed,
    flags: { mortar, panel, words: wordsMode, ease },
    frames: cameraPlan.totalFrames,
    passed: evaluation.passed,
    overlapRepairs: overlap.retired,
    failedChecks: evaluation.failedChecks,
    checkFailures: Object.fromEntries(evaluation.failedChecks.map(k => [k, evaluation.checks[k].failures])),
    rulingFlags: evaluation.flags ?? [],
    shownRepair: { before: shownRepair.before, after: shownRepair.after, beforeDropped: shownRepair.beforeUnshown, afterDropped: shownRepair.afterUnshown, log: shownRepair.log, dropped: shownRepair.dropped.map(x => `${x.id} ${x.text}: ${x.why}`) },
    pops: jointPlan?.log?.pops ?? [],
    score: evaluation.score,
    terms: evaluation.terms,
    backtracks: trail.backtracks,
    hasJump: trail.boundaries.slice(1).some(b => b.isJump),
    reveal: {
      f0: cameraPlan.revealF0,
      f1: cameraPlan.revealF1,
      chosen: {
        name: cameraPlan.revealEval.chosen.name,
        dist: cameraPlan.revealEval.chosen.dist,
        coverShare: cameraPlan.revealEval.chosen.coverShare,
        facing: cameraPlan.revealEval.chosen.facing,
        metric: cameraPlan.revealEval.chosen.metric,
        passes: cameraPlan.revealEval.chosen.passes,
      },
      refused: cameraPlan.revealEval.refused,
    },
    shots: shotLogs,
    pins: pinSnapshot,
    divergences,
    joints: jointPlan ? {
      list: jointPlan.joints.map(j => ({ index: j.index, word: j.word, text: j.text, shot: j.shot, track: j.track, prim: j.prim, family: j.family, host: j.host, compoundHost: j.compoundHost, edge: j.edge, mode: j.mode, f0: j.f0, f1: j.f1, run: j.run, forced_repeat: j.forced_repeat, pinned: j.pinned, carried: j.carriedIds, rejected: j.rejected })),
      runs: jointPlan.runs,
      forcedRepeats: jointPlan.forcedCount,
      pinDivergences: jointPlan.log.divergences,
      notes: jointPlan.log.notes,
    } : null,
  };

  return { scene, buildLog, evaluation, trail, cameraPlan };
}

// Distance between two builds for seed variants (13.4):
// share of boundaries with a different fold + 0.5 * share of shots with a different layout class.
export function buildDistance(aLog, bLog) {
  const nShots = aLog.shots.length;
  const nBounds = Math.max(1, nShots - 1);
  let diffFolds = 0;
  for (let i = 1; i < nShots; i++) {
    if (aLog.shots[i].finalBoundary?.fold !== bLog.shots[i].finalBoundary?.fold) diffFolds++;
  }
  let diffLayouts = 0;
  for (let i = 0; i < nShots; i++) {
    if (aLog.shots[i].finalPlaque.layout !== bLog.shots[i].finalPlaque.layout) diffLayouts++;
  }
  return diffFolds / nBounds + 0.5 * (diffLayouts / nShots);
}

function medianOf(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2;
}

// Amendment 11 (Astra, engine rule review, 22 November 2026): a fallback candidate is ranked by its worst single
// reading loss (frames short of 15 readable or 8 still on one word; an unreadable anchor counts 15) before total
// severity, and the word is named.
export function worstReadingLoss(log) {
  const f = log.checkFailures ?? {};
  let worst = { loss: 0, word: null };
  for (const m of f['13.1.13_protected_reading'] ?? []) {
    const r = m.match(/^(\S+) \((.*?)\).*?: (\d+) readable, (\d+) still/);
    if (!r) continue;
    const loss = Math.max(15 - Number(r[3]), 8 - Number(r[4]), 0);
    if (loss > worst.loss) worst = { loss, word: `${r[1]} ${r[2]}` };
  }
  for (const m of f['13.1.1_readable_anchor'] ?? []) if (15 > worst.loss) { const r = m.match(/^(\S+) \((.*?)\)/); worst = { loss: 15, word: r ? `${r[1]} ${r[2]}` : m }; }
  return worst;
}
export const gateCount = log => (log.checkFailures?.[SHOWN_GATE] ?? []).length;
export const sizeCount = log => (log.checkFailures?.[SIZE_CHECK] ?? []).length;
export const staticCount = log => (log.checkFailures?.[STATIC_CHECK] ?? []).length;

// Ruling B20 severity: 10 x readable-anchor failures + 5 x clean-motion overlaps + 3 x flashes + 2 x focus + 1 x other.
export function severity(log) {
  const f = log.checkFailures ?? {};
  const n = k => (f[k] ?? []).length;
  const all = Object.values(f).reduce((a, v) => a + v.length, 0);
  const named = n(SHOWN_GATE) + n('13.1.1_readable_anchor') + n('13.1.16_clean_motion') + n('13.1.6_no_flash') + n('13.1.3_focus_dominance');
  return 10 * n('13.1.1_readable_anchor') + 5 * n('13.1.16_clean_motion') + 3 * n('13.1.6_no_flash') + 2 * n('13.1.3_focus_dominance') + (all - named);
}
export function buildBest({
  wordsInput,
  map,
  metrics,
  palette,
  title,
  salt = 'demo',
  N = 200,
  pick = 1,
  clipName = 'Clip A baseline',
  window: win = [0, 21.971, 24.5],
  vfov = 40,
  fps = 30,
  family = 'Corner Room',
  mortar = 0.30,
  panel = 'on',
  wordsMode = 'pop',
  ease = 'asymmetric',
  pinsLog = null,
  stage = null,
}) {
  checkPalette(palette);
  checkSlots(metrics);

  // If pins are given (forks B, C, D, E), build that exact buildIndex with A's pins!
  if (pinsLog) {
    const pf = pinsLog.flags ?? {};
    const easeOnlyFork = pf.mortar === mortar && pf.panel === panel && pf.words === wordsMode && pf.ease !== ease;
    const res = buildSingle({
      wordsInput, map, metrics, palette, title, salt,
      buildIndex: pinsLog.buildIndex,
      clipName, window: win, vfov, fps, family, mortar, panel, wordsMode, ease,
      pinnedShots: pinsLog.pins,
      preservePinnedTiming: easeOnlyFork,
      stage,
    });
    return {
      chosen: res,
      survivorsCount: res.buildLog.passed ? 1 : 0,
      totalCandidates: 1,
      flagged: !res.buildLog.passed,
      medianScore: pinsLog.medianScore ?? res.buildLog.score,
      medianTerms: pinsLog.medianTerms ?? res.buildLog.terms,
    };
  }

  // Build N candidates with salts <salt>#0 .. <salt>#(N-1) (4.4).
  const all = [];
  for (let bi = 0; bi < N; bi++) {
    const res = buildSingle({
      wordsInput, map, metrics, palette, title, salt,
      buildIndex: bi,
      clipName, window: win, vfov, fps, family, mortar, panel, wordsMode, ease,
      stage,
    });
    all.push(res);
  }

  const medianScore = medianOf(all.map(r => r.buildLog.score));
  const termNames = Object.keys(all[0].buildLog.terms);
  const medianTerms = Object.fromEntries(termNames.map(k => [k, medianOf(all.map(r => r.buildLog.terms[k]))]));

  const checkFrequency = {};
  for (const { buildLog } of all) for (const check of buildLog.failedChecks) {
    checkFrequency[check] = (checkFrequency[check] ?? 0) + 1;
  }
  // Eligibility tiers (engine fix brief 2, 22 November 2026): a partly shown focused word is Jefferson's absolute rule
  // and outranks overlap, which the joined-scene repair can still fix. Whole and overlap-free first, then whole, then
  // the rest (ranked below by fewest partly shown words).
  const noOverlap = r => !r.buildLog.checkFailures[OVERLAP_GATE]?.length, whole = r => !gateCount(r.buildLog);
  const tiers = [all.filter(r => whole(r) && noOverlap(r)), all.filter(whole), all];
  const eligible = tiers.find(t => t.length);
  const survivors = all.filter(r => r.buildLog.passed);
  let pool;
  let flagged = false;
  if (survivors.length >= 3) {
    pool = [...survivors].sort((a, b) => staticCount(a.buildLog) - staticCount(b.buildLog) || sizeCount(a.buildLog) - sizeCount(b.buildLog) || b.buildLog.score - a.buildLog.score || a.buildLog.buildIndex - b.buildLog.buildIndex);
  } else {
    flagged = true;
    // 4.4: If fewer than 3 survive, keep the three with fewest failed checks and flag the clip.
    // Fable's ruling B20 (22 November 2026): survivors first, then the lowest severity, ties by score.
    pool = [...eligible]
      .sort((a, b) => (b.buildLog.passed - a.buildLog.passed) || gateCount(a.buildLog) - gateCount(b.buildLog) || staticCount(a.buildLog) - staticCount(b.buildLog) || sizeCount(a.buildLog) - sizeCount(b.buildLog) || worstReadingLoss(a.buildLog).loss - worstReadingLoss(b.buildLog).loss || severity(a.buildLog) - severity(b.buildLog) || b.buildLog.score - a.buildLog.score || a.buildLog.buildIndex - b.buildLog.buildIndex)
      .slice(0, Math.max(3, survivors.length));
  }

  // 13.4 Seed variants: among builds scoring within 10% of the best (band: score >= best - 0.10 * |best|).
  const best = pool[0];
  const threshold = best.buildLog.score - 0.10 * Math.abs(best.buildLog.score);
  const band = pool.filter(r => r.buildLog.score >= threshold);
  const pick1 = best;

  let pick2 = pick1;
  if (band.length > 1) {
    const others = band.filter(r => r !== pick1);
    others.sort((a, b) => buildDistance(pick1.buildLog, b.buildLog) - buildDistance(pick1.buildLog, a.buildLog) || b.buildLog.score - a.buildLog.score || a.buildLog.buildIndex - b.buildLog.buildIndex);
    pick2 = others[0];
  } else if (pool.length > 1) {
    pick2 = pool[1];
  }

  let pick3 = pick2;
  if (band.length > 2) {
    const others = band.filter(r => r !== pick1 && r !== pick2);
    const minDist = r => Math.min(buildDistance(pick1.buildLog, r.buildLog), buildDistance(pick2.buildLog, r.buildLog));
    others.sort((a, b) => minDist(b) - minDist(a) || b.buildLog.score - a.buildLog.score || a.buildLog.buildIndex - b.buildLog.buildIndex);
    pick3 = others[0];
  } else if (pool.length > 2) {
    pick3 = pool[2];
  }

  const chosen = pick === 3 ? pick3 : pick === 2 ? pick2 : pick1;
  chosen.buildLog.checkFrequency = checkFrequency;
  chosen.buildLog.medianScore = medianScore;
  chosen.buildLog.medianTerms = medianTerms;
  chosen.buildLog.survivorsOfN = survivors.length;
  chosen.buildLog.flaggedLowSurvivors = flagged;
  chosen.buildLog.worstReadingLoss = worstReadingLoss(chosen.buildLog);
  chosen.buildLog.shownGateFailures = gateCount(chosen.buildLog);

  return {
    chosen,
    all,
    survivors,
    survivorsCount: survivors.length,
    totalCandidates: N,
    flagged,
    medianScore,
    medianTerms,
    picks: [pick1, pick2, pick3],
  };
}

export function writeClipOutputs({ outDir, clipName, commandLine, title, salt, flags, result, repoDir }) {
  fs.mkdirSync(outDir, { recursive: true });
  const { scene, buildLog } = result.chosen;
  const prov = renderProvenanceMarkdown({
    clipName,
    commandLine,
    title,
    salt,
    buildIndex: buildLog.buildIndex,
    flags,
    repoDir,
    buildLog,
    medianTerms: result.medianTerms,
    medianScore: result.medianScore,
    divergences: buildLog.divergences ?? [],
  });
  fs.writeFileSync(path.join(outDir, 'scene.json'), JSON.stringify(scene, null, 1) + '\n');
  fs.writeFileSync(path.join(outDir, 'build log.json'), JSON.stringify(buildLog, null, 1) + '\n');
  fs.writeFileSync(path.join(outDir, `Render provenance - ${clipName}.md`), prov);
  fs.writeFileSync(path.join(outDir, 'plaque sheet.svg'), plaqueSheet(scene));
  fs.writeFileSync(path.join(outDir, 'trail sheet.svg'), trailSheet(scene));
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      args[key] = val;
    }
  }
  return args;
}

// CLI entrypoint (18.6.2).
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const args = parseArgs(process.argv.slice(2));
  const repoDir = path.dirname(fileURLToPath(import.meta.url));
  const wordsFile = args.words && fs.existsSync(args.words) ? args.words : 'h1 words.json';
  // Song-agnostic (Kinetic Type Engine, 22 November 2026): the song map, palette and title come from the caller
  // (build_song.mjs passes them from the song's engine input folder). The title seeds every random choice.
  for (const k of ['map', 'palette', 'title']) if (args[k] == null) { console.error(`build_best.mjs: --${k} is required`); process.exit(2); }
  const mapFile = args.map;
  const metricsFile = args.metrics ?? DEFAULT_METRICS_PATH;
  const paletteFile = args.palette;
  const title = args.title;
  const salt = args.salt ?? 'demo';
  const win = (args.window ?? '0,21.971,24.5').split(',').map(Number);
  const outDir = args.out ?? path.join(process.cwd(), 'build_best output');
  const clipName = path.basename(outDir);
  const mortar = args.mortar != null ? Number(args.mortar) : 0.30;
  const panel = args.panel ?? 'on';
  const wordsMode = ['pop', 'preset'].includes(args.words) ? args.words : (args.wordsMode ?? 'pop');
  // Notice --words can be passed both as the words file path AND as `--words preset` per 18.6.2!
  // Let's handle both cleanly: collect all occurrences of --words from raw argv.
  const rawArgv = process.argv.slice(2);
  let wordsFileResolved = null; // --words <file> is required (the section's words file)
  let wordsModeResolved = 'pop';
  for (let i = 0; i < rawArgv.length; i++) {
    if (rawArgv[i] === '--words' && rawArgv[i + 1]) {
      const v = rawArgv[i + 1];
      if (v === 'pop' || v === 'preset') wordsModeResolved = v;
      else wordsFileResolved = v;
    }
  }
  const ease = args.ease ?? 'asymmetric';
  const pick = args.pick != null ? Number(args.pick) : 1;
  const N = args.N != null ? Number(args.N) : 200;
  const pinsLog = args.pins ? JSON.parse(fs.readFileSync(args.pins, 'utf8')) : null;
  const stage = args.stage ? JSON.parse(fs.readFileSync(args.stage, 'utf8')) : null;

  const wordsInput = JSON.parse(fs.readFileSync(wordsFileResolved, 'utf8'));
  const map = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
  const metrics = JSON.parse(fs.readFileSync(metricsFile, 'utf8'));
  const palette = JSON.parse(fs.readFileSync(paletteFile, 'utf8'));
  normalizePalette(palette); // brief 5: cream, white or flat grey text; team colours kept for team styles

  const result = buildBest({
    wordsInput, map, metrics, palette, title, salt, N, pick, clipName,
    window: win, mortar, panel, wordsMode: wordsModeResolved, ease, pinsLog, stage,
  });

  const commandLine = `node build_best.mjs ${rawArgv.map(s => (/\s/.test(s) ? `"${s}"` : s)).join(' ')}`;
  const flags = { mortar, panel, words: wordsModeResolved, ease, pick, ...(args.pins ? { pins: args.pins } : {}) };
  writeClipOutputs({ outDir, clipName, commandLine, title, salt, flags, result, repoDir });

  const bl = result.chosen.buildLog;
  console.log(`${clipName}: survivors=${result.survivorsCount}/${result.totalCandidates} build=#${bl.buildIndex} score=${bl.score.toFixed(4)} passed=${bl.passed}${args.pins ? ` diverged=${bl.divergences.length}` : ''}`);
}
