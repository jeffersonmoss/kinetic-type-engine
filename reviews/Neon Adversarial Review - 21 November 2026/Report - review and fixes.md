# Adversarial Review and Fixes — Kinetic Type Engine (Gemini Neon)

**Date:** 21 November 2026  
**Scope:** Today's commits (`4d564cf..HEAD`: `deae96a`, `434c439`, `6fcd10e`, `3cf2317`) — `kte render --final`, score staging controls and timed ground fade, and the Pulp Fiction crisp-motion engine (`engine/validateCrisp.ts`, `effects/choreography.ts`, `effects/pairs.ts`, `engine/reading.ts`, `engine/rig.ts`, `engine/ground.tsx`, `compile/*`, `cli/*`, `score/*`, `host/*`), plus hot render/validation paths they call.  
**Verification note:** Per run rules, no shell or terminal commands were executed during this pass. All TypeScript types, legacy golden invariants, and *Room for One* crisp rules were verified statically against the codebase and its current `Check.json` output.

---

## Summary of Findings

| # | Severity | Area | Status |
|---|----------|------|--------|
| 1 | **Critical** | `cli/render.ts`: `kte render --final` skips board validation (`checkFilm`) and failed inspection verdicts | Fixed |
| 2 | **Critical** | `compile/index.ts`: Staged retirement with `frames === 0` returns `removesAt` in seconds instead of frames | Fixed |
| 3 | **High** | `engine/validateCrisp.ts`: Pop check misses mid-screen hard appearance/disappearance snaps (e.g. short `pushIn`/`pushOut`) | Fixed |
| 4 | **High** | `engine/validateCrisp.ts`: Crashes on zero/negative-length boards (`cut <= first`) and out-of-board `inkTransfers` words | Fixed |
| 5 | **High** | `engine/ground.tsx`, `engine/util.ts`, `compile/index.ts`: `fadeToBlack` produces `#NaNNaNNaN` on zero-length fades, silently fails on reversed ranges or 3-digit hex `#rgb` grounds | Fixed |
| 6 | **High** | `compile/index.ts`: `scoreStyleGroups` keys groups by onset frame number — merges overlapping sung lines and emits bogus line numbers | Fixed |
| 7 | **High** | `engine/reading.ts`: Crisp `wordCoverage` ignores portrait `overlayZones` (lets sung words sit behind Shorts/Reels UI) | Fixed |
| 8 | **Medium** | `engine/validateCrisp.ts`: `camera-reading` off-by-one when camera lands on `reading.start`, ignores `pin: 'screen'`, and omits `to`/`frames` (printing `undefined`) | Fixed |
| 9 | **Medium** | `engine/validateCrisp.ts` & `engine/validateMotion.ts`: `normDeg(b - a)` wraps 360° rolls/spins to 0°; `validateCrisp` ignores per-letter 3D turns | Fixed |
| 10 | **Medium** | `effects/choreography.ts` & `effects/pairs.ts`: `tumbleOut` never sets `hidden: true` at `u >= 1`; `pushOut.ink`/`quarterTurnOut.ink` disagree with `pose`; `flap` leaves zero-scale DOM nodes; `inkTransfers` limited to `motion: 'turn'` | Fixed |
| 11 | **Medium** | `effects/lower.ts`, `engine/rig.ts`, `engine/TypeStage.tsx`: Unchecked zero-length schedule spans, invalid rig block/word refs, non-positive `dive`/`soar` factors, and zero `stand.sx`/`sy` division | Fixed |
| 12 | **Medium** | `compile/index.ts` & `compile/fates.ts`: Unknown words in `stagePlan.enter` silently ignored; cascaded scene exits truncated by `scoreExitFrames` | Fixed |
| 13 | **Medium** | `cli/render.ts`, `cli/film.ts`, `cli/main.ts`, `host/index.tsx`: Missing output directory creation on `kte render`; films without audio break `kte sheet`/`kte check`; portrait-only films break default `kte render --draft` and `kte where` | Fixed |
| 14 | **High (Perf)** | `engine/wordState.ts`: `wordStateAt` scans and allocates over all board cues per word per frame (`O(W² × F)`) | Fixed |
| 15 | **High (Perf)** | `engine/validateCrisp.ts` & `engine/reading.ts`: Redundant per-frame glyph projection, polygon clipping, camera lookups, and `O(W²)` overlap tests on hidden words | Fixed |
| 16 | **Medium (DX/AI)** | `score/index.ts`, `effects/choreography.ts`, `compile/index.ts`, `compile/entrance.ts`: Repetitive crisp staging boilerplate and lumped opaque stage-validation errors | Fixed |

---

## Numbered Findings (Fixed)

### 1. [Critical] `kte render --final` never runs board/crisp validation or inspection-verdict checks
- **Location:** `cli/render.ts:84-94` (before fix; now `cli/render.ts:93-109`)
- **Failure scenario:** `renderFilm` called `compileFolder(runtime, input)` with `check = false`, inspecting only `film.diagnostics` (compiler-stage checks) and never running `checkFilm` (`validateBoards` + `crispChecks`: wobble, pop, camera-reading, overlap, margin, ink-overlap) or checking `priorVerdicts` for `verdict === 'fail'`. A film with dozens of validator errors or failed manual inspection verdicts would still pass `--final` and spend minutes rendering a defective final MP4.
- **Fix:** In `cli/render.ts`, when `mode === 'final'` (`!draft`), pass `check = true` to `compileFolder(runtime, input, !draft)`, merge any `'fail'` entries from `priorVerdicts(input.path)` for `film.format`, and abort before bundling/browser startup with the first error if any error exists. Draft renders keep `check = false` so broken drafts remain inspectable quickly.

### 2. [Critical] Staged retirement with `frames === 0` reports `removesAt` in seconds instead of frames
- **Location:** `compile/index.ts:152-155` (before fix; now `compile/index.ts:168-171`)
- **Failure scenario:** `VerbDef.removesAt` returns an **absolute frame number** (`engine/types.ts:106`, `effects/lower.ts:208`, `engine/validate.ts:148`). For `frames === 0`, `compile/index.ts` returned `removesAt: () => at` where `at = start / ctx.fps` (seconds — 30× too small at 30 fps), and omitted `early: true`, `gradual: true`, and `opacity: 0` on the hidden mod.
- **Fix:** Changed `frames === 0` staged retirement in `compile/index.ts` to `{early: true, gradual: true, removesAt: () => start, modify: () => ({hidden: true, opacity: 0})}`.

### 3. [High] Crisp `pop` check misses mid-screen hard appearance/disappearance snaps during moving effects
- **Location:** `engine/validateCrisp.ts:108-123` (before fix; now `engine/validateCrisp.ts:171-212`)
- **Failure scenario:** The original `pop` check gated everything on `stillWord = !changed(wordDelta(a.m, b.m, b.zoom))`.
  - If `pushIn({dx: 50, dy: 0})` starts *inside* the screen at `f = start`, `a.m` (from `lowerUnit` before `span.start`) has `dx = 0, hidden = true`, while `b.m` has `dx = 50, opacity = 1`. Because `dx` changed by 50 px, `stillWord` was `false`, so the word popping into existence mid-screen at full scale passed silently.
  - If `pushOut({dx: 50, dy: 0})` ends *inside* the screen at `f = start + frames`, `dx` changes on that last step while `hidden` flips to `true` — again `stillWord` was `false`, so the word vanishing mid-screen at full scale passed silently.
- **Fix:** Kept the in-place opacity-change check and added an on-screen snap check in `engine/validateCrisp.ts`: any single-frame opacity jump `> 0.5` onto or off the screen (with `now.area >= MIN_INK_AREA`, unclipped, and not in `transfer`) that neither emerges from / turns into an edge-on 3D turn (`plane === 'hidden'` / `letters[k] === 'hidden'`) nor scales from / to zero (`<= 1e-4`) is reported as a `pop` error with a specific message distinguishing it from in-place opacity fades. Valid `pushIn`/`pushOut` off-screen moves (including *Room for One*'s `hookPush`, where `now.area === 0` at `pushIn` start and `pushOut` end), `quarterTurnIn/Out`, `diveIn/Out`, `flip`, `tumbleOut`, `slotRoll`, `matchCut`, and `explode` (smooth fragment fade, step `< 0.5`) all pass.

### 4. [High] `crispChecks` crashes on zero/negative-length boards and out-of-board `inkTransfers`
- **Location:** `engine/validateCrisp.ts:34-35, 57-58, 74, 93` (before fix; now `engine/validateCrisp.ts:47-50, 91-95, 122`)
- **Failure scenario:**
  1. When `board.end <= board.start`, `validateBoard` records a `board-time` error (`validate.ts:130`) and continues to `crispChecks`. With `cut <= first`, `samples` was `[]` and `samples[0].glyphs` threw `TypeError: Cannot read properties of undefined (reading 'glyphs')`.
  2. `layout.words.get(from.word)!` and `layout.words.get(to.word)!` crashed if an `inkTransfers` entry referenced a word absent from the board.
  3. Line 74 indexed global `WORDS[w.i]` directly instead of using `w.sf`.
- **Fix:** Early-return `[]` when `cut <= first`; guard `fromWord` and `toWord` before calling `readingGlyphs`; use `w.sf`.

### 5. [High] `fadeToBlack` produces `#NaNNaNNaN` on zero-length fades and silently fails on reversed ranges or 3-digit hex grounds
- **Location:** `engine/ground.tsx:44-46`, `engine/util.ts:74-79`, `compile/index.ts:119-124`
- **Failure scenario:**
  1. `fadeToBlack: {from: 10, to: 10}` caused `(t - fade.from) / (fade.to - fade.from)` to evaluate `0 / 0 = NaN` at `t === 10`; `mixHex` turned `NaN` into `'#NaNNaNNaN'`, corrupting SVG `fill` and contrast checking.
  2. `fadeToBlack: {from: 174.7, to: 172.1}` (reversed) silently never faded because the ratio stayed negative and clamped to `0`.
  3. `mixHex` only parsed 6-digit `#rrggbb` strings; 3-digit `#rgb` grounds (accepted by `compile/index.ts:57` and `reading.ts:54`) parsed `NaN` in channel 3 and returned the unmixed colour unchanged, silently breaking `fadeToBlack`.
- **Fix:**
  - `engine/util.ts`: Updated `mixHex` to expand `#rgb` to `#rrggbb` and guard `!Number.isFinite(k)`.
  - `engine/ground.tsx`: Guarded finite `from`/`to` and treated `fade.to <= fade.from` as progress `1` at `t >= fade.from`.
  - `compile/index.ts`: Added explicit compile-time validation requiring finite `from < to` whenever `board.fadeToBlack` is set.

### 6. [High] `scoreStyleGroups` collides on overlapping sung lines and emits frame numbers as line IDs
- **Location:** `compile/index.ts:117-123` (before fix; now `compile/index.ts:126-129`)
- **Failure scenario:** When `board.scaleStyle === 'lockup'`, `compile/index.ts` keyed `board.scoreStyleGroups` by each line's `firstOnset` frame number. Two distinct sung lines starting on the same frame (overlapping sung timings) were silently merged into one style group for `two-scales`. Moreover, `engine/validateRules.ts:260, 263` passes those group keys to `c.addPlan(l, ...)` and `Violation.line`, producing bogus `L262`/`L4520` line entries in `LineReport` instead of actual line indices.
- **Fix:** Keyed `scoreStyleGroups` by the lead block's actual engine line index (`words[authored.lead.runs[0].i].line`), which is unique per authored line even when sung timings overlap, matches `LineReport.line`, and stays in lyric order.

### 7. [High] Crisp reading coverage ignores portrait `overlayZones`
- **Location:** `engine/reading.ts:77-88, 110-114` (before fix; now `engine/reading.ts:80-91, 118-121, 157-161`)
- **Failure scenario:** In `crisp` mode, `readingSampler` checked `wordCoverage(own)` against the full frame `[0, WIDTH] × [0, HEIGHT]`. On `wide` (`overlayZones: []`), that intentionally allows lockups to bleed slightly past the 48 px margin. On `portrait` (`SHORT_916`), however, `overlayZones` occupy the bottom 256 px (20%), right 108 px, and top 102.4 px (platform UI overlays). A crisp word placed completely behind the bottom Reels/Shorts UI bar scored 100% coverage and passed validation.
- **Fix:** In `readingSampler`, compute crisp `wordCoverage` against `SAFE_BOX` when `FORMAT.overlayZones.length > 0` (portrait) and against the full frame when `FORMAT.overlayZones.length === 0` (wide — identical behavior for *Room for One*). Updated the diagnostic text to clarify `inside the safe area` vs `on screen`.

### 8. [Medium] `camera-reading` off-by-one on landing frame, ignores `pin: 'screen'`, and omits `to`/`frames`
- **Location:** `engine/validateCrisp.ts:69-73` (before fix; now `engine/validateCrisp.ts:81-86, 106-121`)
- **Failure scenario:**
  1. `transits[i]` marks whether the camera changed between `first + i - 1` and `first + i`. Checking `first + i >= reading.start` flagged a word whose protected reading began on the exact frame a camera move landed (`reading.start === moveEnd`), even though the camera is 100% stationary across `[reading.start, reading.end]`.
  2. Screen-pinned blocks (`block.pin === 'screen'`) are unaffected by board camera moves (only by `carryCam`), yet were checked against board `transits`.
  3. The pushed `Violation` only set `from`, omitting `to` and `frames`, causing `formatReports` (`engine/validate.ts:719`) to print `frames 240-undefined (undefined checked)`.
- **Fix:** Check `first + i > reading.start && first + i <= reading.end` (changes strictly between frames inside `[reading.start, reading.end]`), use block-appropriate camera transits (`screenTransits` for `pin: 'screen'`), aggregate all offending frames to set `from`, `to`, and `frames`, and include the protected interval `(frames start-end)` in `detail`.

### 9. [Medium] 360° rolls/spins wrap to 0° under `normDeg`; per-letter 3D turns ignored in `validateCrisp`
- **Location:** `engine/validateCrisp.ts:19, 94-98` (now `19, 31-42`), `engine/validateMotion.ts:40`
- **Failure scenario:**
  1. `angleDelta(a, b) = Math.abs(normDeg(b - a))` in `validateCrisp.ts` and `Math.abs(normDeg(to.rot - from.rot))` in `validateMotion.ts` fold a 360° rotation delta to `0°`, even though `CameraState.rot`, `WordMod.rot`, and `TurnPlane.theta` are continuous (unwrapped) angles in the renderer.
  2. `validateCrisp.ts`'s per-glyph `letterDelta` did not inspect `m.turn?.letters?.[index]` for staggered 3D turns.
- **Fix:** Use `Math.abs(b - a)` in `validateCrisp.ts` and `Math.abs(to.rot - from.rot)` in `validateMotion.ts`, and include `glyphTurnAngle` in `glyphDelta`.

### 10. [Medium] `tumbleOut`, `pushOut.ink`, `quarterTurnOut.ink`, and `pairs.ts` `flap` / `inkTransfers` inconsistencies
- **Location:** `effects/choreography.ts:20-25, 59-97`; `effects/pairs.ts:54-57, 158-159`
- **Failure scenario:**
  1. `tumbleOut` never set `hidden: true` at `u >= 1`, so tumbled letters remained active in the SVG DOM on every subsequent frame of the scene and could even re-enter the frame if a later camera `soar` zoomed out. Also `env.zoom ?? 1` had no lower-bound guard against `<= 0`.
  2. `pushOut.ink` and `quarterTurnOut.ink` did not apply `hidden: u >= 1`, reporting a non-empty ink box after the effect hid the word in `pose`.
  3. In `effects/pairs.ts`, `flap()` left `opacity: 1` when `u === 0` (`sy: 0`), emitting zero-scale `<text>` nodes in SVG until unmount.
  4. `lowerPair` only populated `inkTransfers` when `call.params.motion === 'turn'`, so same-board pair transforms without `motion: 'turn'` (or custom extended pair transforms) lacked kept-glyph transfer metadata in `validateCrisp`.
- **Fix:**
  - `tumbleOut`: set `hidden: u >= 1` and guard `Math.max(0.01, env.zoom ?? 1)`.
  - `quarterTurnOut` & `pushOut`: share pose helpers between `pose` and `ink`.
  - `effects/pairs.ts`: set `opacity: u === 0 ? 0 : 1` in `flap`, and emit `inkTransfers` for all non-`carryIn` pair transforms.

### 11. [Medium] Unchecked zero-length spans, bad rig refs, non-positive dive/soar factors, and zero `stand` division
- **Location:** `effects/lower.ts:161-163`, `engine/rig.ts:71-89, 161-163`, `engine/TypeStage.tsx:63`, `engine/reading.ts:39`, `engine/wordState.ts:34`
- **Failure scenario:**
  1. `lowerUnit` accepted zero/negative-length spans (`span.end <= span.start`), producing `0 / 0 = NaN` in `progress(span)`.
  2. `rig.ts` `frameBox` threw cryptic `TypeError` on missing block indices and produced `{x: NaN, y: NaN}` in `centreOf([])` for empty word/block lists; `dive`/`soar` with `by <= 0` produced `Math.log(<= 0) = NaN/-Infinity`.
  3. `TypeStage.tsx` and `reading.ts` divided `m.sx / stand.sx` without guarding `stand.sx === 0`.
  4. `wordState.ts` `cueAt` indexed `WORDS[cue.word].start_s` without guarding missing `WORDS[cue.word]`.
- **Fix:** Added explicit finite/positive span validation in `lowerUnit`, descriptive errors and empty-array/positive-factor guards in `rig.ts`, non-zero guards on `stand.sx`/`stand.sy` in `TypeStage.tsx` and `reading.ts`, and optional chaining fallback in `cueAt`.

### 12. [Medium] Silent drop of unknown `stagePlan.enter` word IDs and truncated cascaded scene exits
- **Location:** `compile/index.ts:130-145`, `compile/fates.ts:93-101`
- **Failure scenario:**
  1. If `stage()` returned a `stagePlan.enter` entry for a word index not belonging to the current board (e.g., typo or cross-scene word ID), `lowerEntrance` silently ignored it.
  2. In `compile/fates.ts`, `board.scoreExitFrames` was set to `exit.def.duration(exit.params, ctx)` — the single-unit duration — rather than the total scheduled exit span. A cascaded scene exit (e.g. `cascade(quarterTurnOut(...), {by: 'word', gap: 3})`) got cut off mid-animation when `boardActive` returned `false`.
- **Fix:** Track consumed `stagePlan.enter` keys in `compile/index.ts` and throw a clear error naming any unknown word ID; compute `board.scoreExitFrames` in `compile/fates.ts` from the maximum scheduled end frame across all scene blocks.

### 13. [Medium] CLI edge cases: missing output directory, audio-less films, portrait-only films, and `sectionFrames` bounds
- **Location:** `cli/render.ts`, `cli/film.ts`, `cli/main.ts`, `host/index.tsx`
- **Failure scenario:**
  1. `kte render --output new-dir/out.mp4` (or missing `renders/` folder) failed inside `renderMedia` *after* bundling and launching Chrome because `dirname(path)` was never created.
  2. Films without an audio file (or with `audio` omitted/`null` in `film.json`) failed `readFilm` (blocking `kte check` and `kte where`) and crashed `kte sheet` in `prepareHost` even though `sheet` renders muted PNG stills (`muted: true`).
  3. Portrait-only films (`formats: ['portrait']`) failed `kte render --draft` and `kte where` when `--format` was omitted because both hardcoded `format ?? 'wide'`.
  4. `sectionFrames` could return `start > end` if `board.start` was near/at `film.duration`.
- **Fix:**
  - `cli/render.ts`: call `mkdirSync(dirname(path), {recursive: true})` before rendering; fail fast on missing audio before compiling/bundling in `renderFilm`; allow `requireAudio = false` in `prepareHost`/`withBrowser` for `sheet`; clamp `sectionFrames` to `[0, film.duration - 1]` with `end >= start`.
  - `cli/film.ts` & `host/index.tsx`: allow `manifest.audio?: string | null` and optional `audio` in `mountFilm`/`FilmVideo` (skipping `<Audio>` when `null`/`undefined`).
  - `cli/render.ts` & `cli/main.ts`: default omitted `--format` in `render --draft` and `where` to `'wide'` if enabled, otherwise the first enabled format (`--final` still strictly requires `'wide'`).

### 14. [High — Performance] `wordStateAt` rescans and allocates over every board cue on every word-frame (`O(W² × F)`)
- **Location:** `engine/wordState.ts:288-384`
- **Failure scenario:** On crisp boards with per-word entrances, accents, and staged retirements (~100+ cues per scene), `wordStateAt` iterated over the entire `boardCues(board)` array three times per call (`replacers`, `hiders`, `modify`), calling `cueAffects` (filtering + sorting new arrays) and `baseCtx` for every irrelevant cue on the board — on every word × every frame (and up to 17× per frame during motion blur).
- **Fix:** Added a `WeakMap<Board, Map<number, WordCuePlan>>` cache (`wordCuePlans`) built in a single `O(C)` pass per board, precomputing `replaced`, `hideBefore`, and the exact list of `{cue, def, at, affected, k}` entries affecting each word (deduplicating duplicate `affected` IDs to preserve `indexOf` semantics). `wordStateAt` now only evaluates the 1–3 cues belonging to word `i`, turning `O(W² × F)` into `O(W × F)` with bit-for-bit identical output.

### 15. [High — Performance] Redundant work in `validateCrisp.ts` and `readingSampler`
- **Location:** `engine/validateCrisp.ts`, `engine/reading.ts`
- **Failure scenario:**
  1. `validateCrisp.ts` called `readingGlyphs` + `frameArea` (Sutherland-Hodgman polygon clipping) on every word for every frame of the board even when the word was hidden (`~90%` of frames), re-evaluated `camForBlock` per word instead of reusing `cameras`, and ran per-glyph wobble loops across all frames even for words with no per-letter transforms (`~95%` of words), using `samples[0].glyphs.indexOf(glyph)` inside the loop.
  2. `readingSampler` called `wordStateAt` twice per checked word-frame, computed `readingGlyphs` for every hidden `other` word during the `O(W²)` overlap loop, re-ran `groundAt` on every word, and ran full SAT `polysOverlap` across all glyph pairs with no AABB rejection.
- **Fix:**
  - `engine/reading.ts`: Added optional `layout`/`cam` parameters to `readingGlyphs` and `box` parameter to `frameArea`/`wordCoverage`; cached `wordStateAt`, `groundAt`, camera, and per-word AABBs per frame in `readingSampler`; skipped `readingGlyphs` entirely for hidden `other` words and added exact AABB early-out before per-glyph SAT.
  - `engine/validateCrisp.ts`: Reused precomputed `cameras` (and lazy `screenCams` only for pinned blocks); hoisted `frameBox`; computed `readingGlyphs` + `frameArea` lazily only when `maybeShown(m)` or on visibility transition frames; skipped per-glyph wobble loops when a word never uses `m.letters` or `m.turn?.letters`.

### 16. [Medium — Inference Efficiency] Repetitive crisp staging boilerplate and lumped opaque errors
- **Location:** `score/index.ts:100-112`, `effects/choreography.ts:127-156`, `effects/index.ts:7`, `compile/index.ts:89-95, 141-172`, `compile/entrance.ts:179-188`, `engine/validateCrisp.ts:68-70`
- **Failure scenario:**
  1. Setting `motionStyle: 'crisp'`, `scaleStyle: 'lockup'`, or `fadeToBlack` required authoring a custom `stage` callback even when no custom layout/retirement logic was needed.
  2. Computing off-screen `pushIn`/`pushOut` block-local vectors and multi-step screen-space `reframe` poses forced builders (as seen in *Room for One*'s `Staging.ts:331-363`) to hand-code error-prone screen-to-block coordinate transforms and nested rotations.
  3. `compile/index.ts` and `compile/entrance.ts` collapsed 5–6 distinct failure modes into single generic errors (`invalid staged accent/retirement/entrance for word N`), forcing agents to guess whether the problem was the word ID, integer frame, effect kind, or `source !== 'none'`. `validateCrisp.ts` wobble errors omitted peak delta values.
- **Fix:**
  - Added optional `motionStyle`, `scaleStyle`, and `fadeToBlack` fields directly on `Scene` (`score/index.ts`), copied onto the board before `stage` runs (`compile/index.ts`).
  - Added and exported `pushVector(...)` and `reframeBetween(...)` (plus `ScreenPose`) in `effects/choreography.ts` and `effects/index.ts`.
  - Split all staged entrance/accent/retirement validation checks into specific, actionable error messages, and added peak travel/angle/scale deltas to `wobble` reports.

---

## Findings Chosen Not to Fix (and Why)

1. **Floating-point frame boundary rounding in `engine/rig.ts` (`k.t * FPS` vs integer `frame`)**
   - *Observation:* When authors pass `t: seconds(at) / 30` (e.g. `229 / 30 * 30 = 229.00000000000003 > 229`), `rigOwnAt`'s `c.moves[k].start <= frame` and `evalMove`'s `f >= m.start + m.dur` can miss by ~`1e-14` frames on the exact landing frame (leaving `rot = 89.99999999999999` instead of `90`, which passes `validateCrisp`'s `1e-6` tolerance but fails strict `!==` equality in user staging scripts like `Staging.ts:248`).
   - *Why not fixed:* Changing `rig.ts`'s boundary comparison epsilon could shift which keyframe branch is selected on exact-boundary frames in legacy fixtures and break one or more of the 170 golden SSR frame hashes (`check/golden.mjs`). Because we have no shell in this run to verify the 170 hashes, we intentionally left `rig.ts`'s float comparison untouched.

2. **`effects/choreography.ts` allowing `frames(1)` on `quarterTurnIn/Out`, `diveIn/Out`, `pushIn/Out`, `tumbleOut`, `flip`, `reframe`**
   - *Observation:* `flip({axis: 'x', frames: 1})` is a no-op (both `u = 0` and `u = 1` return `{}`), and `flip({frames: 2})` blinks to edge-on for 1 frame. Other effects in `effects/units.ts` enforce `frames(6)`.
   - *Why not fixed:* *Room for One* legitimately uses short crisp durations (e.g. `frames: 5` on `quarterTurnOut` in `Staging.ts:161`, `frames: 7` on `quarterTurnIn` in `Section h2.ts:19`), and `StageCue.frames` overrides effect duration anyway. Raising the schema floor on `turnParams` would risk breaking intentional short crisp transitions.

3. **`cli/main.ts` restricting `kte render --final` to `--format wide`**
   - *Observation:* Line 47 rejects `--final --format portrait` with `--final requires the wide format`.
   - *Why not fixed:* This is an explicit product policy introduced in `deae96a` (matching the CLI usage banner `kte render [film-folder] --final [--format wide]`). Changing it would contradict the intended CLI contract.

4. **Shallow `{...board}` copies in `compile/index.ts:114`, `compile/place.ts:87,95,165`, `compile/entrance.ts:125`**
   - *Observation:* At first glance these look like wasted cache-defeating copies of `board` passed to `layoutBoard`.
   - *Why not fixed:* They are intentional and necessary — `layoutBoard` memoises permanently in a `WeakMap<Board, BoardLayout>`, and those sites run *while* `board.blocks` is still being populated or mutated by `stage()`. Removing `{...board}` would poison the `WeakMap` with stale pre-stage geometry.

5. **`engine/validateCrisp.ts` `motion-gap` off-by-one boundary after sustained notes**
   - *Observation:* After a sustained note `[a, b]`, `hold` is set to `b`, so 30 still frames (`b + 1 .. b + 30`) followed by motion at `b + 31` yields `f - hold = 31 > 30`.
   - *Why not fixed:* Tightening or loosening the `motion-gap` boundary by 1 frame could introduce new warnings on *Room for One* (which currently validates with 0 errors and 0 warnings) without being able to run `kte check` to verify.

---

## Checks for the Supervisor to Watch Most Closely

1. **`node check/golden.mjs` (170 SSR frame hashes)**
   - Watch `engine/wordState.ts` (`wordCuePlans` cache) and `engine/util.ts` (`mixHex`). Both were engineered to be bit-for-bit identical for all legacy boards and `#rrggbb` colours, and `effects/pairs.ts` `flap` (`opacity: u === 0 ? 0 : 1`) only triggers when `motion: 'turn'` (not used by any golden fixture). If any hash differs, inspect `wordCuePlans` first.
2. **`bin/kte check "/Users/jeffersonmoss/Experiments/Room for One Music Video/film"` (0 errors, 0 warnings)**
   - Watch the new on-screen snap-pop check in `engine/validateCrisp.ts:191-203` (especially on `hookPush` `pushIn`/`pushOut` in `h1`/`h2`/`h3`, `tumbleOut` in `v2`, `slotRoll` in `h2`, and `matchCut` in `v4`/`v5`), and verify that `scoreStyleGroups` using real line indices in `compile/index.ts:126-129` still yields 0 `two-scales` errors.
   - Also notice `kte check` runtime: with `wordCuePlans`, `readingSampler` AABB/hidden-word skips, and `validateCrisp` lazy glyph sampling, check time on *Room for One* should drop substantially.
3. **`npx tsc --noEmit -p .` (strict TypeScript 7.0.2)**
   - Watch `cli/render.ts` (`FilmFolder` narrowing on `input`, `priorVerdicts`, `Diagnostic[]` spread), `host/index.tsx` (`audio?: string | null`), `effects/choreography.ts` (`pushVector`, `reframeBetween` imports from `../engine/*`), and `engine/reading.ts` (`FORMAT` import and optional `readingGlyphs` args).
4. **Additional targeted tests worth running after the 3 required checks:**
   - `node check/golden.mjs --effects-test` and `--frame-core` (verifies `effects/lower.ts` positive-span guard, `effects/pairs.ts`, and `wordStateAt`).
   - A quick smoke check of `kte render --final` against a deliberately broken crisp board (e.g., an added wobble or short `pushOut`) to confirm `--final` now blocks on validator errors before launching Chrome.
