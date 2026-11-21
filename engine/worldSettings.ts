// Single-source-of-truth defaults and hard guardrails for world-canvas mode.
// Every default below cites its measured/estimated source in:
//   - reviews/Pulp Fiction Motion Survey - 21 November 2026/Pulp Fiction Motion Survey - summary and recommended defaults.md
//   - reviews/Pulp Fiction Motion Survey - 21 November 2026/Pulp Fiction Motion Survey - per spoken word defaults.md
// Rates (camera events, turns, word arrivals, pauses) are defined per spoken word / phrase / pause so they
// scale automatically with the song's local word rate from the song map. Only human-perception and kinematic
// physical constants remain in absolute seconds/frames.

export const WORLD_ALLOWED_TURNS = [-180, -135, -90, -45, 0, 45, 90, 135, 180] as const;
export type WorldTurn = (typeof WORLD_ALLOWED_TURNS)[number];
export type WorldNonZeroTurn = Exclude<WorldTurn, 0>;

export const WORLD_ALLOWED_READ_ANGLES = [-90, -45, 0, 45, 90] as const;
export type WorldReadAngle = (typeof WORLD_ALLOWED_READ_ANGLES)[number];

export const WORLD_SCALE_TIERS = ['whisper', 'grid', 'headline', 'macro'] as const;
export type WorldScaleTier = (typeof WORLD_SCALE_TIERS)[number];

export const WORLD_CAMERA_MOVES = ['hold', 'cut', 'track', 'whip', 'roll', 'push', 'pull'] as const;
export type WorldCameraMove = (typeof WORLD_CAMERA_MOVES)[number];

export const WORLD_ARRIVALS = ['pop', 'preset'] as const;
export type WorldArrival = (typeof WORLD_ARRIVALS)[number];

export const WORLD_ATTACHMENTS = ['baseline', 'stack', 'edge', 'letter', 'counter', 'anchor'] as const;
export type WorldAttachmentKind = (typeof WORLD_ATTACHMENTS)[number];

/** True iff `deg` is finite and an exact multiple of 45 degrees (rejects 5°, 10°, 12°, 25°, 30°, etc.). */
export function isWorldAngle(deg: number, tol = 1e-6): boolean {
  if (!Number.isFinite(deg)) return false;
  const snapped = 45 * Math.round(deg / 45);
  return Math.abs(deg - snapped) <= tol;
}

/** True iff screen reading angle (normalised to (-180, 180]) is a readable multiple of 45°: 0, ±45, or ±90. */
export function isWorldReadAngle(deg: number, tol = 1e-6): boolean {
  if (!isWorldAngle(deg, tol)) return false;
  let x = ((deg % 360) + 360) % 360;
  if (x > 180) x -= 360;
  return Math.abs(x) <= 90 + tol;
}

export const WORLD_DEFAULTS = Object.freeze({
  /** Tempo-scaled rates: per spoken word, per phrase, per pause, or dimensionless ratios. */
  spokenWordMapping: Object.freeze({
    /** Survey: 137/137 = 100% of intelligible spoken words visually represented [estimated]. */
    visiblePerSpokenWord: 1.0,
    /** Survey: 131/137 = 0.956 new word objects per spoken word (131/117 = 1.12 raw Whisper) [measured/estimated]. */
    newWordsPerSpokenWord: 0.96,
    /** Survey: 6/137 = 4.4% repeat phrases handled via re-frame/scale rather than spawning duplicates [estimated]. */
    repeatReframeRatio: 0.04,
  }),

  cameraEventRates: Object.freeze({
    /** Survey: 75/117 = 0.64 active camera events/Whisper word (0.58 reconciled; OLS slope 0.68, r = +0.56) [measured]. */
    overallPerWord: 0.64,
    /** Survey: 19/48 = 0.40 across 6 locked pop-in/track fast windows (dropping to 0.13-0.25 in 42-48s) [measured]. */
    lockedPhrasePerWord: Object.freeze([0.15, 0.40] as const),
    /** Survey: 40/37 = 1.08 across 5 beat-cut/syllable-whip burst windows (0.82-1.33/word) [measured]. */
    burstPhrasePerWord: Object.freeze([1.00, 1.30] as const),
    /** Survey: slow (<100 wpm) windows average 0.50 active camera events/word [measured]. */
    slowPassagePerWord: 0.50,
    /** Survey: 42/117 = 0.36 hard cuts/word (56.0% of 75 active camera events) [measured]. */
    hardCutPerWord: 0.36,
    /** Survey: 19/117 = 0.16 whips/word (1.00/phrase; 25.3% of active camera events) [measured]. */
    whipPerWord: 0.16,
    /** Survey: 8/117 = 0.07 smooth tracks/word (0.42/phrase; 10.7% of active camera events) [measured]. */
    smoothTrackPerWord: 0.07,
    /** Survey: 7/117 = 0.06 camera rolls/word (0.37/phrase; 71.4% placed on pauses) [measured/estimated]. */
    cameraRollPerWord: 0.06,
    /** Survey: 3/117 = 0.026 continuous zooms/word (0.16/phrase) [measured]. */
    zoomPerWord: 0.026,
  }),

  cameraEventMix: Object.freeze({
    /** Survey: 42/75 = 56.0% hard cuts / beat snap-jumps (0% motion blur) [measured]. */
    cut: 0.56,
    /** Survey: 19/75 = 25.3% whips (18.7% directional whip + 5.3% whip-roll + 1.3% whip pull-back; 100% blur) [measured]. */
    whip: 0.253,
    /** Survey: 14/75 = 18.7% smooth moves (10.7% track + 4.0% smooth roll + 2.6% zoom + 1.3% impact) [measured]. */
    smooth: 0.187,
  }),

  /** Survey: 277/462 = 60.0% frames camera-locked (196/462 = 42.4% strictly pixel-static) [measured]. */
  staticCameraBudgetRatio: 0.60,

  turnRates: Object.freeze({
    /** Survey Act 1 (normal brown act): 7/76 = 0.092 turns/word, 7/13 = 0.54 turns/phrase [measured/estimated]. */
    normalPerWord: 0.092,
    normalPerPhrase: 0.54,
    /** Survey Act 2 (climax crimson act): 9/41 = 0.220 turns/word, 9/6 = 1.50 turns/phrase [estimated]. */
    climaxPerWord: 0.220,
    climaxPerPhrase: 1.50,
    /** Survey overall: 16/117 = 0.137 turns/word, 16/19 = 0.84 turns/phrase [measured/estimated]. */
    overallPerWord: 0.137,
    /** Survey: 5/18 = 27.8% of speech pauses trigger a camera roll (5/7 of all rolls, 3/3 smooth rolls) [measured/estimated]. */
    pauseRollProbability: 0.28,
  }),

  turnMix: Object.freeze({
    /** Survey raw Act 1 reading-beat transitions: 117/130 = 90.0% same-angle; 100% of Act 1 turns are exact 90° [measured]. */
    sameAngleTransitionRatio: 0.90,
    /** Survey non-zero turns (n=16): 11/16 = 68.8% exact 90°, 5/16 = 31.2% diagonal (~30° Dutch in Act 2), 0% 45/135/180 [measured/estimated].
     *  Mapped onto Jefferson's legal 45°-multiple grid ("90s and 45s most common; 135s and 180s rare to avoid dizziness"): */
    nonZeroWeights: Object.freeze({
      deg90: 0.70,
      deg45: 0.24,
      deg135: 0.04,
      deg180: 0.02,
    }),
  }),

  wordArrivals: Object.freeze({
    /** Survey Section 4A (n=131 word instances) [measured]. */
    attachmentWeights: Object.freeze({
      baseline: 0.405,   // 53/131 = 40.5%
      stackBelow: 0.336, // 44/131 = 33.6%
      stackAbove: 0.092, // 12/131 = 9.2%
      edge: 0.076,       // 8/131 = 6.1% 90° edge + 2/131 = 1.5% vertical rule spine
      anchor: 0.069,     // 9/131 = 6.9% standalone fresh block anchor
      letter: 0.023,     // 3/131 = 2.3% nested inside letter counter or tucked on letter stem
    }),
    /** Survey Section 4B (n=131): 63.4% pop-in, 31.3% camera-revealed pre-set; remaining 5.3% (fades/slides) forbidden in world mode. */
    entranceWeights: Object.freeze({
      pop: 0.634,    // 83/131 = 63.4% beat-timed pop/cut-in [measured]
      preset: 0.366, // 41/131 = 31.3% camera-revealed pre-set (re-normalized with forbidden fades/slides removed)
    }),
  }),

  wordExits: Object.freeze({
    /** Survey Section 5 (n=131) [measured]. */
    cameraMovesAway: 0.740, // 97/131 = 74.0%
    hardCut: 0.145,         // 19/131 = 14.5%
    burst: 0.053,           // 7/131 = 5.3% (tumble/burst set-piece, max ~1 per minute)
  }),

  pauses: Object.freeze({
    /** Survey Normalization Section 3 & 5: phrase-splitting pause = max(0.30s, 0.9 * w_med); reference w_med = 0.370s [measured/estimated]. */
    referenceWordMed_s: 0.370,
    phraseSplitFloor_s: 0.30,
    phraseSplitWordMultiple: 0.90,
    /** Survey: 10 short pauses span 0.95x-1.6x w_med (0.35-0.60s) [estimated]. */
    shortPauseRange_wMed: Object.freeze([1.0, 1.8] as const),
    /** Survey: 7 long pauses >= 2.3x w_med (>= 0.85s) [estimated]. */
    longPauseMin_wMed: 2.3,
    longPauseFloor_s: 0.85,
  }),

  densityAndFraming: Object.freeze({
    /** Survey Section 6: median 2-3 words/frame (mean 3.6, IQR 1-5, wide reveal peak 12-17) [measured]. */
    wordsVisibleMedian: 3,
    wordsVisibleTypicalRange: Object.freeze([1, 5] as const),
    wordsVisibleWideMax: 14,
    /** Survey Section 6: median ~36-40% active ink coverage, typical 20-55%, peak 65% [estimated]. */
    inkCoverageTargetPct: 38,
    /** Survey Section 6: 410/462 = 88.7% total frames (91.3% of text frames) bleed typography at an edge [measured]. */
    targetClippedFrameRatio: 0.88,
    /** Survey Normalization Section 5: median word lifespan 0.875-1.125s = 2.4x-3.0x w_med [measured]. */
    wordLifespan_wMed: Object.freeze([2.5, 3.0] as const),
  }),

  scale: Object.freeze({
    /** Survey Section 7: median current-word width ~0.55x-0.65x frame width; full range 0.10x-4.60x [estimated]. */
    medianWordWidthRatio: 0.60,
    fullRange: Object.freeze([0.10, 4.60] as const),
    /** Survey Section 7: 4 voice tiers (current word width relative to frame width) [estimated]. */
    tiers: Object.freeze({
      whisper: Object.freeze([0.10, 0.30] as const),
      grid: Object.freeze([0.22, 0.55] as const),
      headline: Object.freeze([0.70, 1.10] as const),
      macro: Object.freeze([1.30, 3.80] as const),
    }),
    /** Default target width fraction per named tier (cleanly within each survey band). */
    tierDefaults: Object.freeze({
      whisper: 0.24,
      grid: 0.48,
      headline: 0.88,
      macro: 1.55,
    }),
    /** Survey Section 7: 46/131 = 35.1% of word instances are macro single-letter / partial fills [measured]. */
    macroSingleLetterFillRatio: 0.35,
    /** Practitioner craft (Jason Peers review of Moody): hero word ~3-4x body/connector scale. */
    heroToConnectorRatio: 3.0,
  }),

  /** Physical & human-perception constants: ALWAYS in absolute seconds/frames, NEVER scaled by WPM. */
  physicalConstants: Object.freeze({
    /** Survey Section 8 & Normalization 4B: 16 point-to-point whips median 0.188-0.250s, mode 0.125s, IQR 0.125-0.375s [measured]. */
    whipDuration_s: 0.20,
    whipDurationRange_s: Object.freeze([0.125, 0.375] as const),
    /** Survey: 3 sustained multi-word reading whips span 0.625-0.875s (fast-song overflow fallback) [measured]. */
    sustainedReadingWhipRange_s: Object.freeze([0.375, 0.875] as const),
    /** Survey: 3 smooth eased 90° rolls span 0.750-1.375s (median 1.125s) [measured]. */
    smoothRollDuration_s: 0.90,
    smoothRollRange_s: Object.freeze([0.75, 1.375] as const),
    /** Decisive point-to-point track pan duration (no sluggish drift). */
    trackDuration_s: 0.24,
    trackDurationRange_s: Object.freeze([0.15, 0.75] as const),
    /** Survey: pull-back reveal 0.125-0.32s; decisive push-in 0.25-0.35s (slow dramatic push-in E011 up to 1.375s). */
    pullBackDuration_s: 0.24,
    pushInDuration_s: 0.28,
    /** Survey Section 3 & 8: median pixel-static hold 0.250s (IQR 0.25-0.50s); 19 syllable cut-beats at 0.125s [measured]. */
    minReadableHold_s: 0.250,
    syllableCutHoldFloor_s: 0.125,
    holdBands_s: Object.freeze({
      shortSyllable: Object.freeze([0.125, 0.250] as const),
      standardWord: Object.freeze([0.250, 0.500] as const),
      emphasisPhrase: Object.freeze([0.625, 0.875] as const),
      dramaticSilence: Object.freeze([1.500, 2.250] as const),
    }),
    /** Survey Normalization 1D: pop-ins match speech onset (~0 to -50ms, within ITU-R BT.1359 +45/-125ms sync window) [uncertain]. */
    popInSyncOffset_s: 0.0,
    /** Survey Normalization 1D: camera pan/whip onset anticipates word by 150-250ms (1 whip duration) [measured/estimated]. */
    cameraMoveAnticipation_s: 0.20,
    /** Survey: tumble/burst physical exit duration 1.000s [measured]. */
    burstDuration_s: 1.00,
    /** Survey: 0% visible elastic bounce/overshoot [measured]. */
    overshoot: 0.0,
    /** Szarkowska et al. 2018 / Netflix guide: adult reading-rate ceiling (characters per second). */
    readingRateCeiling_cps: 20,
    /** World-mode whip/roll temporal supersampling (eliminates 8-12 echo onion-skinning from v1). */
    worldSmearMaxSamples: 32,
    worldSmearStepPx: 3,
  }),

  /** Hard budgets enforced as compile/validator errors (never warnings). Only rejects motion Jefferson banned. */
  hardBudgets: Object.freeze({
    /** Every world word angle and settled camera angle must be an exact multiple of 45°. */
    angleStepDeg: 45,
    /** Active reading word screen angle must be in {0, ±45, ±90} (never small tilts, never upside-down ±135°/180°). */
    maxActiveReadAngleDeg: 90,
    /** Every >=45° camera roll must land on a crisp hold of at least 0.25s (survey median pixel-static hold). */
    minHoldAfterTurn_s: 0.25,
    /** Minimum settled time between consecutive >=90° camera rolls (survey observed min 1.00s across all 7 rolls). */
    minBigTurnGap_s: 0.50,
    /** Forbid back-to-back camera turns of >=135° (Jefferson: 135s and 180s rare so viewers do not get dizzy). */
    forbidConsecutiveExtremeTurnsDeg: 135,
    /** Cumulative absolute camera rotation in any sliding 1.5s window cannot exceed 270°. */
    maxRollInWindowDeg: 270,
    rollWindow_s: 1.50,
    /** World canvas cannot be completely empty of visible type for longer than 0.30s. */
    maxEmptyGap_s: 0.30,
    /** Minimum on-screen coverage for standard active words (85%) vs explicitly authored macro crops (40%). */
    minActiveWordCoverage: 0.85,
    minMacroWordCoverage: 0.40,
    /** Physical duration bounds for explicit authored camera moves. */
    whipMin_s: 0.10,
    whipMax_s: 0.90,
    rollMin_s: 0.20,
    rollMax_s: 1.50,
    moveMax_s: 2.00,
  }),
});

export type WorldSettings = typeof WORLD_DEFAULTS;

export interface SongWordRate {
  /** Median sung inter-onset / word duration in seconds (excludes pauses > 1.2s). */
  wMed_s: number;
  /** Words per minute implied by wMed_s. */
  wpm: number;
  /** Phrase-splitting silence threshold in seconds: max(0.30s, 0.9 * wMed_s). */
  phraseThreshold_s: number;
  /** Long pause threshold in seconds: max(0.85s, 2.3 * wMed_s). */
  longPauseThreshold_s: number;
}

/** Computes tempo-adaptive word rate metrics directly from the scene's sung cues. */
export function computeSongRate(sung: readonly {onset: number; end: number}[], fps: number): SongWordRate {
  const durations: number[] = [];
  for (let i = 0; i < sung.length; i++) {
    const dur = (sung[i].end - sung[i].onset) / fps;
    if (dur > 0.05 && dur < 1.2) durations.push(dur);
    if (i > 0) {
      const ioi = (sung[i].onset - sung[i - 1].onset) / fps;
      if (ioi > 0.05 && ioi < 1.2) durations.push(ioi);
    }
  }
  durations.sort((a, b) => a - b);
  const wMed_s = durations.length
    ? durations[Math.floor(durations.length / 2)]
    : WORLD_DEFAULTS.pauses.referenceWordMed_s;
  const clamped = Math.max(0.15, Math.min(1.2, wMed_s));
  return {
    wMed_s: clamped,
    wpm: 60 / clamped,
    phraseThreshold_s: Math.max(
      WORLD_DEFAULTS.pauses.phraseSplitFloor_s,
      WORLD_DEFAULTS.pauses.phraseSplitWordMultiple * clamped,
    ),
    longPauseThreshold_s: Math.max(
      WORLD_DEFAULTS.pauses.longPauseFloor_s,
      WORLD_DEFAULTS.pauses.longPauseMin_wMed * clamped,
    ),
  };
}
