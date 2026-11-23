# Engine fix brief 18 — results (23 November 2026)

Implemented automatic keep-clear avoidance around screen-space props (`under_words` and `over_words`) across layout, camera framing, shown-whole repair, composition passes, and targeted overlap resolution on branch `world-canvas` in `~/Experiments/Kinetic Type Engine`. Generic engine feature; no song names in engine code. No browser was launched and nothing was rendered.

## What changed

1. **`deterministic/interp.js`** (shared between Node and `viewer.html` via `globalThis.KT_INTERP`):
   - Added `DEFAULT_KEEP_CLEAR_MARGIN` (`24`), `hasKeepClearProps(scene)`, `propKeepClearRects(scene, frame, W, H, { useMargin })`, `keepClearObstaclesInRange(scene, f0, f1, W, H, { useMargin })`, and `clearRectsFromObstacles(obstacles, { W, H, mx, my, minW, minH })`.
   - Computes per-frame or per-range screen-space keep-clear zones from `propScreenRects` (following keyed prop motion) for every visible (`opacity > 0.05`) prop on `under_words` or `over_words` with `keepClear !== false`, and splits the safe `1280x720` frame into maximal clear rectangles avoiding all active obstacles.
2. **`deterministic/song_appearance.mjs`**:
   - Extracted `compileStageLayers(scene, song, resolve, { embedImages })` so `build_song.mjs` can compile stage geometry before the whole-song framing/composition passes (and write lightweight geometry for section builds) while keeping `songAppearance(...)` backwards-compatible.
   - Parsed `keep_clear_margin_px` (top-level `song.keep_clear_margin_px` or per-prop override `props[i].keep_clear_margin_px`, default `24`, validated `>= 0`) and per-prop opt-out `props[i].keep_clear` (boolean, default `true`), compiling `keepClear` and `keepClearMarginPx` onto each `scene.props` entry.
3. **`deterministic/shown_gate.mjs`**:
   - Added `fitPoseInBox(pose, pts, vfov, box)` (exact perspective solver fitting 3D corners into an arbitrary NDC rectangle `[x0, x1] x [y0, y1]`) and `fitPoseInClearArea(pose, pts, vfov, obstacles, ...)`.
   - Updated `repairShown` step 3 so hold reframing stays inside the clear area whenever `hasKeepClearProps(scene)` is true (untouched when false).
4. **`deterministic/overlap_gate.mjs`**:
   - Added `wordScreenPoly` and `wordPropOverlapFrames` helpers sharing the exact projection, `drawnScale`, and `wordClips` math with `checkPropWordOverlap`.
   - Updated `checkPropWordOverlap` to honor per-prop `keep_clear: false` opt-out and accept `{ useMargin = false }` (hard gate checks raw `hitBox`; margin check reports `hitBox + keep_clear_margin_px`).
   - Extended `tamePulses(scene, { until, onsetOf })` so when `hasKeepClearProps(scene)` is true and `onsetOf` is provided, pulses or stamp landings that push a word into a keep-clear prop are lowered or dropped just like word-word overlap pulses.
5. **`deterministic/keep_clear.mjs`** (new module):
   - `frameClearOfProps`: early hold-by-hold pass reframing every prop-active hold whose focused sung words intrude on `hitBox + keep_clear_margin_px` into the clear rectangle that maximizes letter height (with mild side stability to avoid unnecessary jumping, and clean hold splitting when a wide multi-word hold can be split at a non-overlapping focus boundary to stay above `min_word_h`).
   - `resolvePropOverlaps`: post-composition escalation pass in two phases (Phase 1: hard clearance of raw `hitBox`; Phase 2: non-destructive margin polish for `keep_clear_margin_px`). Escalation order strictly prefers framing over shrinking:
     - **A.** Pulse / stamp taming (`drawnScale > 1`).
     - **B.** Camera move timing (land earlier, shorten, start later, delay move, drop bow, or cut on moves that sweep across the prop).
     - **C.** Hold reframing into a clear rectangle (recording any word forced below `min_word_h` in `belowMin`).
     - **D.** Entrance cleanup (`pop` / start at onset) and plaque-plane slide into the clear zone at 100% size.
     - **E.** Scale down to `min_word_h` first; only if no `>= min_word_h` placement clears raw `hitBox`, scale further to avoid overlapping and report the word in provenance (`belowMin`).
     - **F.** Post-onset focus-tail hide only after `appearance..max(appearance + SHOWN_FRAMES - 1, onset)` is already satisfied.
6. **`deterministic/composition.mjs` & `deterministic/word_roles.mjs`**:
   - Guarded `tightenLone`, `enforceMinSize`, `growWordmarks`, `slideWhole`, `placeInRoom`, and `teamColourNames` with `hasKeepClearProps(scene)` so downstream sizing, block padding, wordmark growth, static-partial slides, and dropped-word room placement never push a focused word into a keep-clear zone (zero work / zero behavior change for no-props songs).
7. **`deterministic/compose_plaques.mjs` & `deterministic/build_best.mjs`**:
   - Added optional `--stage <file>` support so section builds for songs with keep-clear props steer plaque row aspect ratios toward the clear band's shape during prop windows (`compose_plaques.mjs`), reframe prop-active holds before shown-whole repair, and record `13.1.22_prop_covers_sung_word` in candidate evaluation (`build_best.mjs`). Completely skipped when no keep-clear props exist.
8. **`deterministic/build_song.mjs`**:
   - Writes lightweight `<OUT>/sections/stage-keep-clear.json` and passes `--stage` to `build_best.mjs` only when keep-clear props exist.
   - Compiles stage layers early (`compileStageLayers`), runs `frameClearOfProps` before `repairShownAndOverlap`, runs `resolvePropOverlaps` before final gates, re-runs `placeInRoom` if `resolvePropOverlaps` opened space for any previously dropped word, passes `onsetOf` to `tamePulses`, and reports keep-clear framing, targeted repairs, below-minimum warnings, unresolved items, raw `hitBox` gate, and `keep_clear_margin_px` check under `## Backdrops and props (brief 17 & 18)` in `Whole song - provenance and flags.md`.
9. **`deterministic/KIT.md`**:
   - Documented `keep_clear_margin_px`, `props[i].keep_clear`, per-section and join-time keep-clear behavior, and zero-impact guarantee under `## Engine fix brief 18 (23 November 2026)`.
10. **`deterministic/test_stage_layers.mjs`**:
    - Added 4 brief 18 `node:test` cases (9/9 total with brief 17): keep-clear geometry + `keep_clear_margin_px` + `keep_clear: false` opt-out + keyed motion, camera reframing without shrinking, scale-down fallback + `belowMin` reporting, and multi-hold hoist tracking (low hoist -> top band, high hoist -> left band).

## Settings

In `song settings.json`:
- `keep_clear_margin_px` (optional number `>= 0`, default `24`): top-level default keep-clear margin in screen pixels added around every keep-clear prop's `hitBox`. Can also be overridden per prop as `props[i].keep_clear_margin_px`.
- `props[i].keep_clear` (optional boolean, default `true`): set `false` to opt a specific prop out of keep-clear avoidance and `checkPropWordOverlap`.

## Gate results (before vs after)

Tested on an isolated temp copy of `~/Experiments/Raise the Flagg Music Video/engine input` (workspace commit `677fb9b`: 3 chorus backdrops + hoisted `banner-20xx` prop at `x: 860, anchor_y: 2297`, 14 keys, `stay: true`, default `keep_clear_margin_px: 24`) joined against a copy of `Rough cut 6 - 23 November` sections (`--skip-build`), plus a prop-aware section rebuild check (`--sections 4 --N 10`). Nothing was written to the Flagg workspace.

| Gate / metric | Before (c3c0ea4, `--skip-build`) | After (Brief 18, `--skip-build`) | After (Brief 18, `--sections 4 --N 10`) |
|---|---:|---:|---:|
| `checkPropWordOverlap` (raw `hitBox`, hard gate) | **128 (FAIL)** | **0 (PASS)** | **0 (PASS)** |
| Keep-clear margin (`hitBox + 24 px`, reported) | — | **0** | **0** |
| Projected word overlap (`overlapFinal`) | 0 (PASS) | 0 (PASS) | 0 (PASS) |
| Shown whole (`finalPartial`) | 0 (PASS) | 0 (PASS) | 0 (PASS) |
| Static partly on screen (`staticFinal`) | 0 (PASS) | 0 (PASS) | 0 (PASS) |
| Empty first/last frame (`emptyEnds`) | 0 (PASS) | 0 (PASS) | 0 (PASS) |
| Empty stretches > 0.25 s (`emptyRuns`) | 0 (PASS) | 0 (PASS) | 0 (PASS) |
| Room left for dropped word (`roomLeft`) | 0 (PASS) | 0 (PASS) | 0 (PASS) |
| Sync late words (`sync.late`) | 0 (PASS) | 0 (PASS) | 0 (PASS) |
| Idle holds (`idle`) | 0 (PASS) | 0 (PASS) | 0 (PASS) |
| Still ending (`stillEnding`) | PASS | PASS | PASS |
| Opening blank (`appearance.blank`) | 0 (PASS) | 0 (PASS) | 0 (PASS) |
| Words scaled below legibility minimum (`belowMin`) | — | **0** | **0** |
| Unresolved prop overlaps (`unresolved`) | — | **0** | **0** |
| Holds reframed / targeted repairs | — | 120 / 20 | 104 / 21 |
| Sync dropped words (`sync.dropped`, allowed) | 74 | 80 | 77 |
| Unreviewed keyword drops (`KEYWORD DROP REVIEW FAIL`)* | 4 | 4 | 2 |

\*Note on `KEYWORD DROP REVIEW FAIL`: `Rough cut 6 - 23 November` has no `Keyword drop review.json` file yet (brief 10 item 44 requires the song chat to visually still and approve/reject dropped keywords). On `--skip-build`, the unreviewed keyword drop count stayed unchanged at 4 (`w3003 HE`, `w4008 RAISE`, `w4021 TOWN`, `w5030 LOUD`; before was `w3003 HE`, `w4021 TOWN`, `w5030 LOUD`, `w8001 RAISE`), and rebuilding Section 4 with `--stage` reduced Section 4's keyword drops to 0 (2 total song-wide: `w3003 HE`, `w5030 LOUD`). Every automatic engine gate passed.

## No-props byte-identical verification (brief item 9)

Built a no-props copy of the Flagg input (`backdrops` and `props` removed, `--skip-build`) with both commit `c3c0ea4` (exported via `git archive`) and the Brief 18 code:
- `c3c0ea4`: `7,643,100` bytes, SHA-256 `dc1b4fe590bfaec6be5a4441139d054e40a23d8820b2e1cca9e0c44513ffa57a`
- Brief 18: `7,643,100` bytes, SHA-256 `dc1b4fe590bfaec6be5a4441139d054e40a23d8820b2e1cca9e0c44513ffa57a`
- **Byte-identical: `true`.**

## Unit tests and syntax checks

- `node --check` passed on all 10 touched/added files (`interp.js`, `song_appearance.mjs`, `overlap_gate.mjs`, `shown_gate.mjs`, `keep_clear.mjs`, `composition.mjs`, `word_roles.mjs`, `compose_plaques.mjs`, `build_best.mjs`, `build_song.mjs`).
- `node --test deterministic/test_stage_layers.mjs`: **9/9 passed** (5 brief 17 + 4 brief 18).
- Note: pre-existing `deterministic/test_keywords.mjs` has 1 unrelated failure (`he dropped inside the stretch`, predating brief 18 from brief 10's pronoun-keyword rule); untouched.

## What was NOT done / NOT tested

- **No Chrome render or visual inspection** (per rule 10: no browser launched). The song chat should rebuild (or `--skip-build` join + review the keyword drops in `Keyword drop review.json`) and visually inspect chorus stills to confirm the left/top clear-band framing beside the hoisted banner and 2011 backdrop banner looks balanced.
- **Full `N=200` 12-section rebuild of Raise the Flagg** was not run (only `--skip-build` over all 12 Rough cut 6 sections and a `--sections 4 --N 10` prop-aware section rebuild check); running a full chorus rebuild (`--sections 4,5,8,9,11,12`) in the song chat will let `compose_plaques.mjs` stack chorus plaques vertically for the clear band and further reduce word drops.
- **Temp files:** the isolated temp folder (`kte-brief18-work-*` under `os.tmpdir()` with `TEMP_README.md`) was removed after verification; no temp files remain.
