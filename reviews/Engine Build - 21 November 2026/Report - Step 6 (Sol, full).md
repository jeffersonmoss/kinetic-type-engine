# Step 6 — Kinetic Type Engine effects core

Step 6 is implemented in the working tree on `main`. The four-commit [patch series](<Commit Series - Step 6.patch>) was assembled and replayed on `6a6b553442673c14460582eccac23b26a7b2e2ad`, the current HEAD including Jefferson’s block-capitals amendment. Apply it with `git am` to a clean checkout of that commit. The working tree already contains the changes.

The literal `ROOM FOR ONE` nest in Section 2 fails the authored fit rules with Anton. At the wide format’s 46.8 px minimum cap, the reply needs 295.25 px of advance. The measured `O` at the 149.76 px hero cap permits 11.29 px under the engine’s 80% counter-width rule. The passing fixture uses a single `I` at 50 px cap inside a larger `O`. The production placement remains open for the pilot.

## Build and verification by commit

| Commit | Work and evidence |
|---|---|
| **6.1** | Moved the `VerbDef` contract to `engine/types.ts`. Added board-first lookup to word state, overlays, line marks, and validation, with fallback to the legacy registry. Opened `Block.exit` to named effects, with block-only targets and the original projected turn spelling. Added vertical per-letter scale. |
| **6.2** | Added the three definition shapes, checked and frozen typed calls, scoped duplicate detection, `extendEffect`, the resolver-injected `legacy(name, params?)` adapter, and frozen effect tables. `scheduleUnit` and `unitCues` generate word and row timing. Glyphs and syllables share a word cue and use the per-letter offset, rotation, scale, and opacity channels. `reverse` produces an exit definition and reflects the stagger; `reverseSchedule` can reuse an already-resolved entrance when retracting. |
| **6.3** | Implemented the requested catalogue. Pair plans carry a kept-glyph mask and corresponding incoming refs. They transfer a run in board or screen space, or accept a screen-pinned carrier from a previous board. `slotRoll` dismisses the changed outgoing ink. `follow` counter-rotates for either turned placement, and `zoomLadder` emits increasingly tight rig moves with still holds. |
| **6.4** | Added seven fixture arrangements to the Step 2 harness. `node check/golden.mjs --effects-test` tests state and compares 170 SSR frame hashes. The 84 previous hashes are byte-for-byte unchanged, and 86 new samples cover the pilot effects. |

Every scratch commit ran `npx tsc --noEmit` successfully and `npm run -s validate:example` reported `TOTAL: 0 errors, 12 warnings across 6 boards`. A second clean clone replayed the series using `git am` and produced the same tree as the assembly clone and the same delivery files as the working tree.

Additional checks on the replay:

- `node check/golden.mjs --effects-test` rejected bad and unknown parameters by name, rejected duplicate definitions and table keys, and adapted 49 legacy registered verbs. `reverse(rise())` at progress 1 matched the original entrance at progress 0, both directly and through `wordStateAt`.
- Glyphs in `MOVES` landed at frames 52, 55, 58, 61, and 64. The check measured their offsets, rotation, two-axis scale, and opacity one frame before and on each landing. A row cascade and a sung-clock syllable cascade also matched their requested schedules.
- Two frozen boards resolved the same `film:letters` name to different effects. The legacy registry had no entry for that name before or after drawing. The precedence check also verified a board-local `rise` and the legacy fallback.
- Protected reading opacity met the 0.5 threshold for all 606 sampled word-frames, using the least-opaque rendered glyph of each word. The fixtures use controlled timing. Full-song protected reading, contrast, crop, and overlap still depend on the compiler and pilot checks.
- `node check/golden.mjs --self-test` matched all 170 hashes and changed only the recoloured pure-type frame. `--frame-core` and `--context-test` passed. `node tools/check-imports.mjs` passed. `npm run -s validate:fixture` reported `TOTAL: 0 errors, 2 warnings across 1 boards`.

## Section 2 walkthrough

| Passage or supporting effect | Result |
|---|---|
| **h.1 — FOUR RINGS ON HIS HAND** | A sung word cascade stages the stamp arrivals. `beatPunch('HAND')` reaches 1.12× scale while holding opacity at 1. The actual three-word reply exceeds the Anton counter as measured above. The smaller nest fixture verifies its type-on, placement, and host hold through the requested frame. |
| **h.2 — YEAR TWENTY-FOUR** | All four `FOUR` glyph centres matched at screen-space transfer to within 0.000001 px. The other words retract on the original stamp schedule in reverse. The reply’s sung rises use the foot of `TWENTY-FOUR`, which is the one word in the anchor row. |
| **h.3 — WHO’S STILL CHASING?** | `STILL` holds the same board position across transfer during the camera roll. A clockwise placement produced a −90° camera target, and the counter-clockwise fixture check produced +90°. The repeated reply binds four sung tokens to two laid-out rows, keeping the second `KING!` addressable. The camera recipe leaves the old line in board space. |
| **h.4 — WHAT’S HE CHASING?** | `slotRoll` retains all eight glyphs of `CHASING?` through release and rolls the changed words out and in. The fixture treats the persistent word as preset for protected reading. The reply transfers `ING!` from the second `KING!` to `RING!`. A partial exit fades the old `K` while the kept letters stay lit up to transfer. |
| **Hook into verse 1** | Two-board cut fixtures carried `ONE` to the suffix of `FORTY-ONE` in wide and to the separate `ONE` row in portrait. The screen-space glyph centre matched across the cut. The outgoing fall was exercised separately as a block exit after the reading interval. |
| **Hook variations and draft support** | The bottom-edge `turnIn({axis: 'x'})` enters through the existing perspective renderer. The zoom ladder increased camera scale at its two holds. An anchored stamp was exercised with a prior word as source. The fixtures also cover progressive `type`, persistent `dockExit` at 0.45 opacity, and block-local `fall`, `fade`, and the older projected turn. |

## Deviations, failed checks, and open questions

- The design marks `repeatStack` as existing. This HEAD contains no such implementation or registry entry. The typed implementation binds separate rendered rows to the actual sung copies so each occurrence has a distinct landmark. It avoids drawing extra copies from a single word state with no independent timing.
- Typed `rise` uses a baseline lift and opacity ramp. The legacy `rise` keeps its existing clip and speed profile. Typed `turnIn` reuses the projected renderer for whole words. A glyph cascade has affine offset, rotation, scale, and opacity channels. Whole-word clips, perspective planes, and graphical overlays require a separate lowering path if combined with a glyph cascade or a partial kept-glyph fate.
- First attempts caught a TypeScript inference error in fixture typing, an exact floating-point assertion on the dock opacity, and a fallback test that still supplied a local `rise` table entry. The fixture typing, tolerance, and fallback setup were corrected. The requested checks were rerun.
- The Step 7 compiler owns real song and syllable binding, explicit stay/fate timing, outgoing protection during slot changes, layout and source visibility, and attachment of the screen carrier to the scene handoff. It must treat the split portrait runs as one sung token. The literal nest needs a placement decision for the full reply, with the reading floor intact. The checked-in amendment’s block-capital defaults and emphasis diagnostics remain Step 7 work. The new fixtures use Anton capitals and match cuts align cap boxes.
- The existing smear compositing and whole-run versus per-letter `textLength` findings still apply. The fixtures cover numeric placement, ownership, and SSR markup. They leave actual glyph pixels, kerning at the representation switch, and picture rhythm for browser inspection.

## Browser checks for the main agent

Run the Step 7 inspection sheet for the hook into verse in both formats once it compiles. Inspect the frame before, on, and after the `FOUR`, `STILL`, `CHASING?`, `ING!`, and cross-scene `ONE` transfers for a dropped or doubled glyph, a baseline shift, or a spacing jump. Inspect the stamp and HAND punch, the edge turn at a sampled pre-reading crossing, both zoom steps, and the settled reply at reading size. Check that the camera leaves the previous line coherent as a sideways note and that the new line reads upright. Inspect the selected nest treatment and the smear path with sharp text and any over-ink. Run the draft with audio to judge sung timing and the Pulp Fiction reference. No browser or Remotion renderer ran in this build.

`props/` and the finished films were outside the build. No cleanup items remain from the scratch patch verification.
