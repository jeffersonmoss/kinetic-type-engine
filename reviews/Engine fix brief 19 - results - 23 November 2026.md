# Engine fix brief 19 — results (23 November 2026)

Implemented the room-pass priority, beneficiary lock, and whole-life static-partial / shown-whole / overlap checks on branch `world-canvas` in `~/Experiments/Kinetic Type Engine`. Generic engine fix; no song names in engine code. No browser was launched and nothing was rendered.

## What changed

1. **`deterministic/composition.mjs`**:
   - **`enforceMinSize`**: when a filler is dropped to make room for a keyword (`dropped: 'room'`), records `x.dropped_for = w.id` on the filler.
   - **`placeInRoom`**:
     - **Keywords before fillers in every room pass (item 4)**: dropped candidates (`size`, `static`, `room`) are sorted stably with `w.keyword` first, followed by fillers, across every call to `placeInRoom` (initial room pass, post-keep-clear room re-run, and the `roomLeft` join gate).
     - **Beneficiary lock (item 3)**: a word with `w.dropped === 'room'` and `w.dropped_for` is never put back while `byId.get(w.dropped_for)?.dropped` is truthy; because keywords are tried first, the beneficiary keyword is always tried before its room-dropped filler. If the beneficiary stays dropped, the filler is logged as `no room (dropped to make room for <id> <text>, which is still dropped); still dropped`. If the beneficiary is shown (or just put back), the filler may be tried clear of it and `dropped_for` is cleared if put back (and restored on failed trials).
     - **Whole-life gates inside `placeInRoom` (item 5)**: every candidate placement now clears temporary `w.opacity` hides between offsets, applies any later-hold under-size hides, and then checks:
       - `staticPartials(scene, { words: [w], until: Math.max(until, scene.meta.frames ?? until) }).length === 0` (whole life, replacing the old `.some(r => r.start <= o + G.SHOWN_FRAMES)` check that missed post-onset static partials such as `w9009 IT 3204-3212`);
       - `gateFailures({ ...scene, words: [w] }, onsetOf, { until }).every(x => x.kind !== 'partial' && x.kind !== 'unshown')` (exact shown-whole gate);
       - `ghostOverlap(w, lo, hi) === 0` (projected overlap over its whole life up to `until`) and `wordPropOverlapFrames` (when keep-clear props exist).
       Any placement failing any of these is rejected so the join gate is never the first place it is caught.
2. **`deterministic/build_song.mjs`**:
   - Keeps `w.dropped_for` intact through the initial room pass, the post-keep-clear room re-run, and the `roomLeft` room gate, then strips the transient `w.dropped_for` field from `finalObj.words` before writing the scene JSON (matching `size_restore` / `size_hides` / `size_kept_holds`).
3. **`deterministic/KIT.md`**:
   - Added `## Engine fix brief 19 (23 November 2026)` documenting keyword-first room ordering, `dropped_for` beneficiary locking, whole-life static-partial / shown-whole / overlap validation inside `placeInRoom`, and no-props behavior.
4. **`deterministic/test_stage_layers.mjs`**:
   - Added 4 brief 19 `node:test` cases (13/13 total with briefs 17 & 18):
     - Filler with `dropped: 'room', dropped_for: kw.id` stays locked while `kw` stays dropped, and is tried after `kw` is put back once `kw` fits.
     - Keyword wins the sole clear spot over an earlier-indexed filler when both compete in `placeInRoom`.
     - Placement that is whole through `onset + SHOWN_FRAMES` but becomes static and partly on screen later in its life is rejected by `placeInRoom` (stays dropped; `staticPartials` = 0 immediately after `placeInRoom`).
     - End-to-end `enforceMinSize` records `dropped: 'room'` and `dropped_for` on a room-dropped filler when the keyword still ends up `dropped: 'size'`.

## Test: Raise the Flagg (rebuilding Section 9 at N = 200)

Tested in an isolated temp folder using a copy of `~/Experiments/Raise the Flagg Music Video/engine input` (workspace HEAD `b4cbecd`, with map word 322 `IT` marked filler) and copies of `Rough cut 7 - 23 November` sections (nothing written into the Flagg workspace).

Note on baseline commits: the brief reported the bug on `a4ad096` (same room-pass code as `4d9da23`); while this fix was implemented, Brief 16b (`27f82a5`, including a `staticPartials` off-by-one fix and phrase-gap repair) landed on `world-canvas`. Both baselines are reported below alongside Brief 19 rebased on `27f82a5` with `--sections 9 --N 200`.

### Join gate lines (before vs after)

| Gate / metric | Before (`4d9da23` / `a4ad096`, `--skip-build`) | Before (`27f82a5` pre-brief-19 tip, `--skip-build`) | After (Brief 19, `--sections 9 --N 200`) |
|---|---:|---:|---:|
| `STATIC PARTLY ON SCREEN FAIL` (`staticFinal`) | **1 FAIL (`w9009 IT 3204-3212`)** | 0 (PASS, but still put `w9009 IT` back at `+0.25w` over dropped `w9010 PROUD`) | **0 (PASS)** |
| `w9009 IT` status (map 322, filler) | Put back (`x3.65`, largest word at 22.7%), FAILED static partial `3204-3212` | Put back (`+0.25w`, `x3.65`, largest word at 22.7%) over dropped `w9010 PROUD` | **Stays dropped (`dropped: "room"`, blocked because `w9010 PROUD` is still dropped)** |
| `w9010 PROUD` status (keyword) | Dropped (`size`); no room (needs `x2.69`) | Dropped (`size`); no room (needs `x2.69`) | **Tried before `w9009 IT`; still no room at size (needs `x2.69` at onset frame 3198, exceeds frame width across all offsets)** |
| `PROP COVERS SUNG WORD` (`propOverlapViolations`) | 0 (PASS) | 0 (PASS) | **0 (PASS)** |
| Projected overlap (`overlapFinal`) | 0 (PASS) | 0 (PASS) | **0 (PASS)** |
| Shown whole (`finalPartial`) | 0 (PASS) | 0 (PASS) | **0 (PASS)** |
| Room for dropped word (`roomLeft`) | 0 (PASS) | 0 (PASS) | **0 (PASS)** |
| Room for phrase gap (`gapsLeft`) | — | 0 (PASS) | **0 (PASS)** |
| Empty first/last frame (`emptyEnds`) | 0 (PASS) | 0 (PASS) | **0 (PASS)** |
| Empty stretches > 0.25 s (`emptyRuns`) | 0 (PASS) | 0 (PASS) | **0 (PASS)** |
| Sync late words (`sync.late`) | 0 (PASS) | 0 (PASS) | **0 (PASS)** |
| Idle stretches (`idle`) | 0 (PASS) | 0 (PASS) | **0 (PASS)** |
| Still ending (`stillEnding`) | PASS | PASS | **PASS** |
| Opening blank (`opening blank`) | 0 (PASS) | 0 (PASS) | **0 (PASS)** |
| Put back count (`placeInRoom`) | 49 | 49 | **48** |
| `KEYWORD DROP REVIEW FAIL` count (expected; unreviewed) | 16 | 16 | **15** |

### Exact `KEYWORD DROP REVIEW FAIL` list

- **Before (`4d9da23` & `27f82a5`, 16 words)**:
  `w3003 HE`, `w5015 PASS`, `w6030 LEAVE`, `w7003 RIM`, `w7021 MAKE`, `w8016 TONIGHT`, `w9010 PROUD`, `w9011 HE`, `w9014 PASS`, `w9015 HE`, `w9042 THEY`, `w11006 IT`, `w11009 IT`, `w12009 IT`, `w12011 HE`, `w12013 HE`
- **After (Brief 19, `--sections 9 --N 200`, 15 words)**:
  `w5015 PASS`, `w6030 LEAVE`, `w7003 RIM`, `w7021 MAKE`, `w8016 TONIGHT`, `w9010 PROUD`, `w9011 HE`, `w9014 PASS`, `w9042 THEY`, `w11006 IT`, `w11009 IT`, `w11021 TOWN`, `w12009 IT`, `w12011 HE`, `w12013 HE`

Changes in the keyword drop list:
- **Rescued (2 keywords)**: `w3003 HE` (keyword-first ordering let `HE` claim the room previously taken by filler `w3002 AND`) and `w9015 HE` (found clean whole-life placement once `w9013 HE` chose a zero-static-partial offset).
- **Newly dropped (1 keyword)**: `w11021 TOWN` (previously put back only because filler `w11019 A` ran before it and crowded frame 4088 down to the 9.0% minimum; with keywords tried before fillers, `w11021` faces the 13.5% uncrowded minimum and its onset-frame size is 136.2% so `k = 1.00` leaves frame 4088 at 11.1%).
- **`w9010 PROUD` (Section 9)**: tried before `w9009 IT`, still has no room at size because at onset frame 3198 (before the `follow` move `3199-3203` finishes zooming in) its height is 5.17%, requiring `x2.69` to clear 13.5%, which overflows frame width at every offset within 3 widths/heights. `w9009 IT` now properly stays dropped instead of popping back over it.

## No-props verification (item 6)

Tested two no-props songs comparing `27f82a5` vs Brief 19 (`--skip-build` in isolated temp folders):

1. **Big Toothy Grins (`Rough cut 6k - 23 November`, real no-props song)**:
   - `Whole song - scene.json`: **byte-identical** (`db1d13cd8ff07137de6c563cda773ea4dee24c66a1e53325a0479d0c197f5f48`).
   - `Whole song - notes - scene.json`: **byte-identical** (`27b53843ccc6b562636eb128ec2b57248ffde4e63ee35ed952b04bf57e808454`).
   - `Whole song - final - scene.json`: **every gate PASSES** (`keywordsDropped: 0`, `staticFinal: 0`, `finalPartial: 0`, `overlap: 0`, `roomLeft: 0`, `gapsLeft: 0`, `emptyRuns: []`). `cams` and `plaques` are identical; 6 of 373 words differ (`c4522a36...` -> `630e898e...`), all strictly caused by Brief 19's global room-pass rules (items 4 & 5):
     - `w4003 YOU` (keyword) is now placed before `w4002 WHEN` (filler) (item 4), so both take clean non-colliding offsets.
     - `w5047 DOES`, `w9012 BOTH`, `w10016 WE` shift to nearby offsets that pass `staticPartials` for their whole life without relying on downstream hiding (item 5), and `w6056 THE` updates opacity accordingly.
2. **Raise the Flagg with `backdrops` and `props` removed (`Rough cut 6` sections)**:
   - `Whole song - scene.json` (`834b5b09...`) and `Whole song - notes - scene.json` (`127854a1...`): **byte-identical**.
   - Final joined scene: `cams` and `plaques` are identical; 6 of 371 words differ (`90063143...` -> `41a00242...`), all strictly caused by items 4 & 5:
     - `w3003 HE` (keyword) is now put back ahead of filler `w3002 AND` (item 4), reducing dropped keywords from **4 -> 3** (`w3002 AND` is restored small by `undoSizeForEmpty` for empty frames 795–806, and `w3012 THEN` now fits too).
     - `w4018 FROM` (with neighbour `w4019 A`) and `w12023 LET` move to zero-static-partial placements over their whole life (item 5).
   - Keep-clear passes remain 100% skipped when `hasKeepClearProps(scene)` is `false`.

## Unit tests and syntax checks

- `node --check deterministic/composition.mjs deterministic/build_song.mjs deterministic/test_stage_layers.mjs`: passed.
- `node --test deterministic/test_stage_layers.mjs`: **13/13 passed** (5 brief 17 + 4 brief 18 + 4 brief 19).

## What was NOT done / NOT tested

- **No Chrome render or visual inspection** (per rule 8).
- **Full 12-section rebuild of Raise the Flagg** was not run (only Section 9 was rebuilt at `N = 200` and joined with Rough cut 7's other 11 sections, per item 7).
- **Flagg `Keyword drop review.json`** was not created or written into the Flagg workspace (belongs to the song chat).
- **Temp files**: the isolated temp folder (`$TMPDIR/kte-brief19/` with `TEMP_README.md`, worktree, and test copies) was removed after merging and verification.
