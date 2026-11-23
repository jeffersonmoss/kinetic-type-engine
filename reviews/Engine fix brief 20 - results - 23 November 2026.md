# Engine fix brief 20 — results (23 November 2026)

Implemented `must_show` support (via `word_overrides.<map index>.must_show: true` and rejected drops in `Keyword drop review.json`) on branch `world-canvas` in `~/Experiments/Kinetic Type Engine`. Generic engine fix; no song names in engine code. No browser was launched and nothing was rendered.

## What changed

1. **`deterministic/keywords.mjs`**:
   - **`keywordPlan`**: preserves any map word with `overrides[String(i)]?.must_show` inside fast-word stretches so keyword mode never drops a `must_show` word.
2. **`deterministic/word_roles.mjs`**:
   - **`applyWordRoles`**: accepts optional `dropReview = {}`. Marks `w.must_show = true` (and transient `w.must_show_source`) whenever `word_overrides[idx].must_show === true` or `dropReview[idx]?.verdict === 'reject'`, and records each entry in `log.mustShow`. Marks `w.drop_approved = true` (transient) for non-`must_show` entries with `dropReview[idx]?.verdict === 'approve'` so must-show room freeing may clear them without creating unreviewed drops.
3. **`deterministic/composition.mjs`**:
   - Exported `MUST_SHOW_FLOOR_RATIO = 0.70` and `MUST_SHOW_MAX_GROW = 3.5`.
   - **Documented readable hard floor**: **70% of the hold's size minimum** (`6.3%` of frame height when crowded vs `9.0%` min; `9.45%` with room vs `13.5%` min; floored by `SPECK_FLOOR = 4.0%`).
   - **`enforceMinSize`**:
     - Protects `must_show` words from ever being dropped as fillers for another keyword (`!x.must_show`) or dropped for size.
     - For any `must_show` word that cannot reach its focus hold minimum via standard in-place growth, runs `resolveMustShow(w)` in strict preference order — validating every candidate against shown-whole (`gateFailures`), projected overlap with size-drop ghosts (`overlapsWithDrops` / `scanOverlap`), focus static-partial (`staticPartials` / `staticFocusRuns`), prop keep-clear (`wordPropOverlapFrames`), and still-ending (`minEndHold`):
       1. **Drop or hide approved/filler neighbours (including earlier-placed words in the same hold)**: prefers hiding earlier-placed neighbours strictly past their own shown-whole window (never dropping them), then dropping filler neighbours (`dropped: 'room'`, `dropped_for: w.id`), then dropping review-approved neighbours (`drop_approved`). Adapts hinge/clip entrances to scale/pop (preserving `appearanceFrame` via scale when `joint.f1 > w.on`) so growth succeeds cleanly.
       2. **Re-frame the camera**: tightens the hold's camera pose around its focused words (respecting prop keep-clear bands via `fitPoseInClearArea` when present), or inserts clean cut split(s) around the `must_show` word when earlier/later words widen the hold. Refreshes camera pose/hold caches whenever `scene.cams` changes.
       3. **Grow from a new placement**: relocates the word on its plaque plane (same orientation, within 3 widths/heights, scale or pop entrance) with zero overlap, then with approved/filler/earlier clearing, then optional early retirement strictly past the word's shown-whole requirement before a later colliding word arrives.
       4. **Readable hard floor (`70%` of hold min)**: if the full minimum cannot be reached cleanly, tries partial in-place growth (largest valid size down to `0.70 * min`), then Steps 1–3 targeting `0.70 * min` if still below the floor, and keeps the word (`w.size_kept = true`) rather than dropping it for size. Remaining under-size later holds strictly past `mustEnd` are handled as normal later-hold hides (never dropped).
   - **`hideStaticPartials`**: for a `must_show` word with a focus-window static partial that `slideWhole` cannot clear on its original entrance, tries a pop-entrance slide before giving up, and never drops it as `dropped: 'static'`.
   - **`placeInRoom`**: sorts `must_show` words ahead of regular keywords and fillers.
4. **`deterministic/build_song.mjs`**:
   - Reads an existing `Keyword drop review.json` beside `OUT` early (before `keywordPlan` and `applyWordRoles`) so rejected drops automatically receive the same `must_show` treatment as `word_overrides.<idx>.must_show: true`, and approved drops are tagged `drop_approved`.
   - Passes `minEndHold: MIN_END_HOLD` to `enforceMinSize` and continues the size-pass loop when `r.counts.mustShowChanged` is non-zero.
   - Adds a `MUST-SHOW WORD DROPPED FAIL` hard gate if any `must_show` word ends up dropped.
   - Strips transient fields (`drop_approved`, `must_show_source`, `must_show_action`) before writing scene JSON.
   - Reports every `must_show` word in `Whole song - provenance and flags.md` (and on stdout when present) with source, final size status vs minimum and 70% floor, and action(s) taken.
5. **`deterministic/KIT.md`**:
   - Added `## Engine fix brief 20 (23 November 2026)` documenting `must_show`, automatic `Keyword drop review.json` integration, the preference order, the 70% readable hard floor, hard gates, provenance reporting, and no-op parity.
6. **`deterministic/test_stage_layers.mjs`**:
   - Added 5 brief 20 `node:test` cases (**18/18 total** with briefs 17–19):
     - `applyWordRoles` marks `must_show` from both `word_overrides` and `Keyword drop review.json` rejects, and marks approved drops `drop_approved`.
     - `keywordPlan` keeps a `must_show` word inside a fast stretch.
     - Step 1 drops a review-approved neighbour to free room for a `must_show` word (zero overlaps, zero partials).
     - Step 2 re-frames the camera to enlarge a `must_show` word to full minimum when neighbours cannot be dropped.
     - Phase B keeps a boxed-in `must_show` word below full minimum above the 70% readable hard floor without dropping, overlapping, or creating a static partial.

## Test: Raise the Flagg (`--sections 5,7,9,11` + whole-song join)

Tested in an isolated temp folder under the system temp directory (with `TEMP_README.md`, removed after verification) using a copy of `~/Experiments/Raise the Flagg Music Video/engine input` (workspace HEAD `297ebb5`) plus `must_show: true` on map indices `133`, `224`, `329`, and `411`. Nothing was written into the Flagg workspace.

Three verification runs were executed:
1. **Rebuilt sections 5, 7, 9, 11 (`N = 200`, `--jobs 6`) + whole-song join** from the copied input with `must_show: true` on `133, 224, 329, 411` (unchanged sections seeded from `Rough cut 7 - 23 November`). Built 4 sections in 146.5 s (chosen candidates: Section 5 `#73`, Section 7 `#187`, Section 9 `#98`, Section 11 `#178`).
2. **Existing `Keyword drop review.json` auto-must-show check (`--skip-build`)** from the unmodified input copy with Rough cut 7's `Keyword drop review.json` placed beside the output: produced an **identical scene JSON** (`JSON.stringify` match excluding `meta.audio` path) to Run 1, with all 4 rejected drops kept and 11 of 12 remaining drops already approved.
3. **No-must-show baseline parity check (`--skip-build`)** from the unmodified input copy with no `Keyword drop review.json`: **100% identical** (`words`, `cams`, `plaques`, `props`, full scene JSON excluding `meta.audio` path) to `Rough cut 7 - 23 November/Whole song - FAILED GATES - not for render - scene.json` (commit `309498a`).

### How each of the 4 must-show words was kept

| Map index | Word | Time | Source / trigger | Final size & frames | Action taken |
|---:|---|---:|---|---|---|
| 133 | `w5015 PASS` | 55.27 s | `must_show: true` / rejected drop | **13.9%** (min 13.5%, 13 frames `1656–1668`, `full=true`, `vis=1.00`) | New placement at planned spot, grown `x1.32` (scale entrance), retired at frame `1669` before later word `w5017 SHUT` |
| 224 | `w7003 RIM` | 78.77 s | `must_show: true` / rejected drop | **13.9–14.7%** (min 13.5%, 9 frames `2360–2368`, `full=true`, `vis=1.00`) | New placement `(0w, -1h)`, grown `x1.34` (scale entrance), retired at frame `2369` before later word `w7004 GAFFORD`; then pass 2 grown `x1.50` in place to 13.9% |
| 329 | `w9014 PASS` | 107.39 s | `must_show: true` / rejected drop | **10.7%** at `A=3221` / `onset=3222` (min 9.0% crowded after zoom, 12 frames `3221–3232`, `full=true`, `vis=1.00`) | Pass 1 kept at `9.7%` in hold `3203–3222` (later hold `3233–3251` hidden); pass 2 reframed camera on hold `3203–3222` (`dist 823 -> 769`) |
| 411 | `w11021 TOWN` | 136.14 s | `must_show: true` / rejected drop | **13.9%** (min 13.5%, 26 frames `4087–4112`, `full=true`, `vis=1.00`) | Grown `x1.26` (scale entrance) after dropping filler neighbours `w11018 FROM` and `w11019 A`; `resolvePropOverlaps` landed camera key 176 4 frames earlier (`4079–4084`) to clear prop `banner-20xx` |

### Join gate lines (Run 1: `--sections 5,7,9,11` with `must_show: true` on 133, 224, 329, 411)

| Gate | Result |
|---|---|
| `Must-show words` (`mustShowDropped`) | **4 configured, 0 dropped (PASS)** — all 4 shown at/above full minimum |
| `Opening blank` | **0 frames (PASS)** |
| `Shown whole` (`finalPartial`) | **0 partly shown (PASS)** (`sweepBefore: 2`, `sweepAfter: 0`, `finalDropped: 10`) |
| `Projected overlap` (`overlapFinal`) | **0 remaining intervals (PASS)** (`pulses tamed: 9`) |
| `Static partly on screen` (`staticFinal`) | **0 (PASS)** (`staticHidden: 20`) |
| `Prop covers sung word` (`propOverlapViolations`, raw hitBox) | **0 intervals (PASS)** |
| `Room for a dropped word` (`roomLeft`) | **0 (PASS)** (`put back: 46`) |
| `Room for a phrase gap` (`gapsLeft`) | **0 (PASS)** |
| `Empty first/last frame` (`emptyEnds`) | **PASS, something on screen** |
| `Empty stretches > 0.25 s` (`emptyRuns`) | **PASS, none** (`filled: 1`, `shortGaps: 22`, longest `6` frames) |
| `Sync` (`sync.late`) | **0 late (PASS)** (`50` lyric words dropped total) |
| `Idle stretches` (`idle`) | **0 (PASS)** |
| `Still ending` (`stillEnding`) | **PASS** |
| `Reveal check` | **PASS (off)** |
| `Keyword drop review` (`dropFails`) | **FAIL (expected — no review file in `out-sections-57911`): 12 drops; with Rough cut 7's `Keyword drop review.json` beside output: 1 unreviewed drop (`w9015 HE`), 0 rejected drops** |

### New keyword drop list (12 words, down from 15 in Rough cut 7)

All 4 previously rejected drops (`133 PASS`, `224 RIM`, `329 PASS`, `411 TOWN`) are gone from the drop list. Keeping `w9014 PASS` prevented `w9015 HE` (pronoun at 107.63 s, which previously reclaimed `w9014`'s vacated spot in `placeInRoom`) from fitting at size, adding 1 new pronoun drop (`330 HE`):

1. `w6030 LEAVE` (map 201, 75.08 s, frame 2252) — already approved in Rough cut 7 review
2. `w7021 MAKE` (map 251, 84.13 s, frame 2524) — already approved in Rough cut 7 review
3. `w8016 TONIGHT` (map 292, 95.17 s, frame 2855) — already approved in Rough cut 7 review
4. `w9010 PROUD` (map 323, 106.61 s, frame 3198) — already approved in Rough cut 7 review
5. `w9011 HE` (map 324, 106.64 s, frame 3199) — already approved in Rough cut 7 review
6. `w9015 HE` (map 330, 107.63 s, frame 3229) — **new** (pronoun in "he can shut you down"; needs review)
7. `w9042 THEY` (map 358, 116.51 s, frame 3495) — already approved in Rough cut 7 review
8. `w11006 IT` (map 396, 130.99 s, frame 3930) — already approved in Rough cut 7 review
9. `w11009 IT` (map 399, 131.99 s, frame 3960) — already approved in Rough cut 7 review
10. `w12009 IT` (map 436, 145.02 s, frame 4351) — already approved in Rough cut 7 review
11. `w12011 HE` (map 438, 145.60 s, frame 4368) — already approved in Rough cut 7 review
12. `w12013 HE` (map 441, 146.15 s, frame 4384) — already approved in Rough cut 7 review

## Unit tests and syntax checks

- `node --check deterministic/keywords.mjs deterministic/word_roles.mjs deterministic/composition.mjs deterministic/build_song.mjs deterministic/test_stage_layers.mjs`: passed.
- `node --test deterministic/test_stage_layers.mjs`: **18/18 passed** (5 brief 17 + 4 brief 18 + 4 brief 19 + 5 brief 20).
- Note: pre-existing `deterministic/test_keywords.mjs` has 1 pre-existing failure (`he dropped inside the stretch`, predating brief 20 from brief 10 item 48's pronoun-as-keyword change); untouched here.

## What was NOT done / left undone

- **No Chrome render or visual check** (per rule 6).
- **Full 12-section rebuild of Raise the Flagg** was not run (rebuilt sections 5, 7, 9, 11 at `N = 200` and joined with Rough cut 7's other 8 sections, per item 5).
- **Flagg workspace was not modified** (per item 5); the song chat should add `must_show: true` on `133, 224, 329, 411` (or keep its `Keyword drop review.json` beside the output) and review the single new pronoun drop `w9015 HE` (map 330, 107.63 s) to pass the review gate.
- **Temp cleanup**: the isolated temp folder (`kte-brief20-zBUlql` with `TEMP_README.md`) was removed after verification. Nothing outside that temp folder was deleted.
