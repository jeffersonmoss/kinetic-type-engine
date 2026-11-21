# Kinetic Type Engine build, steps 2 to 4

The implementation and reports are in the working tree on `main`. The sandbox denied `git add` with `.git/index.lock: Operation not permitted`. `main` still points to `5c8b3e1` (`v0.9.0`). The ordered commits are available in [Commit Series - Steps 2 to 4.patch](<Commit Series - Steps 2 to 4.patch>). Apply the series with `git am` from a **clean** checkout of `v0.9.0`. The build working tree already holds those edits.

## Step 2 — Golden harness

`check/golden.mjs` bundled the example and a pure-type fixture with esbuild and hashed `renderToStaticMarkup` output. SSR worked on the first bundled run, so the 30-minute debugging cap and state-only fallback were unused.

| Command | Result |
|---|---|
| `node check/golden.mjs --update` | Stored 84 SHA-256 hashes, 12 frames for each of six example boards and the pure-type board. |
| `node check/golden.mjs --self-test` twice in separate processes | Both runs matched all 84 hashes. Recolouring the pure-type fixture only at frame 32 changed exactly one hash. |

The manifest records the SSR method. The hashes cover the sampled SVG markup.

## Step 3 — Frame core

| Item | Evidence |
|---|---|
| 126.1 Stack | `node check/golden.mjs --frame-core` showed leftward travel. Horizontal offset fell from 25.98 to 16.24 px on the drop and from 19.48 to 4.87 px on the run. Vertical offset stayed at 0 px. Explicit `dir` names travel direction. The source side is the opposite side. Direct legacy verb cues may still use the string `params.from` for the source side. |
| 126.2 Registry | The frame-core check rejected duplicate `seam` registration and confirmed that `extendVerb` preserved existing hooks. The built-in `shove` and `hinge` use it for their extensions. |
| 126.3 Shadows | Default text and plate shadows switched off in the flat, whole-turn, and letter-turn paths. The SSR probe found no default shadow fills on the pure-type fixture. This commit rebaselined 69 changed frame hashes, including example frame 152, the single sample affected by 126.1. The updated 84 hashes matched on rerun. |
| 126.4 Handoffs | The validator rejected unknown start and end IDs, including an inherited object key. It accepted the reserved `end: 'open'`. |
| 126.5 Visibility | `0.5` passed for every protected frame from 7 to 24, beginning one frame after onset. `0.45` failed at each tested protected frame (7, 23, 24) and passed outside the interval. Frame core consumes inclusive bounds and guards against early implicit retirement. Step 7 owns token binding, interval selection, deadlines, and fate scheduling. |
| 126.6 Slide | A named frame edge and a point with a reason produced distinct directional motion. Missing anchors, unknown rules, and blank or absent point reasons failed validation. The example still slides from the bottom edge. |
| 126.7 Investigation | Node confirmed the smear ordering and the markup switch. The tested internal space retained its 35.46 px advance. The report gives source lines, proposed patches, and the browser checks. [Investigation](<Step 3 - smear and textLength investigation.md>) |

Applying `0.5` to the legacy motion-event timeline first produced a `state-rate` error for example word 56 at frame 1408. The checker retains the old `0.25` motion-event cutoff for legacy word timelines so an ordinary retirement dim stays continuous. Reading validation uses `0.5`, including legacy reading checks. An initial type check caught an incomplete edge-anchor union narrowing in 126.6. The corrected code passed.

The additional `npm run -s validate:fixture` check exposed two IPO proof overlaps at frames 1407–1410 after `DRIVE,` picked up the corrected default stack direction. The fixture now explicitly requests the leftward travel it had in `v0.9.0`. Before the repairs and after that adjustment, the IPO validator reported `TOTAL: 0 errors, 2 warnings across 1 boards`.

## Step 4 — Engine context

`EngineScope` applies the synchronous runner at each configuration-reading component body. `withEngine` restores the previous singleton on success or throw and rejects promises. Layout, validation, fill and rig centering use format-relative metrics. The wide fill box stays 1,040 × 560 px by using the same proportions of its safe box in each format. Legacy sizing thresholds retain their wide ratios. Compiler-protected words use the design's 7.5% short-edge cap floor.

| Done-test | Command and observation |
|---|---|
| 127(a) | `node check/golden.mjs --context-test` produced exact combined-versus-solo SSR markup for both formats, distinct fonts and palettes, and an active smear pass. Nested restore, immutability and promise rejection also passed. |
| 127(b) | The same command matched wide, portrait, wide with interleaved frame requests against three new Node processes. This exercised frozen, independently laid-out boards, rig and word state. The actual `compileScore` pipeline arrives in step 7. |
| 127(c) | Portrait `AXES` passed the giant rule at 220.0 px cap and 471.6 px span. The board had zero validator errors. A 195 px cap failed the giant rule. |
| 127(d) | All 84 wide hashes matched the step 3 manifest byte for byte. |
| Imports | `node tools/check-imports.mjs` passed across 71 source files. A scratch project rejected five forbidden static, dynamic and re-export edges while accepting type-only edges. The harness itself needs the Node and esbuild imports required by step 2, so the script permits those specifically in `check/golden.mjs`. |

The interleaving test initially compared raw objects with JSON wire output, which omits `undefined` fields. It now compares both sides through the same serialization. The portrait fixture also needed a wider giant word and enough inset for its tilted second line. No thresholds were waived to pass it.

`npx tsc --noEmit` exited 0 and `npm run -s validate:example` reported `TOTAL: 0 errors, 12 warnings across 6 boards` before each commit. `props/` and the finished films stayed untouched.

## Browser checks for the main agent

Step 8 still requires wide and portrait host renders in the same session and solo, with matching pictures in each format. Run the sheet for both formats, inspect the sampled edge-entry and clipped-reading cases from Amendment 4, and record the inspection verdicts. For the IPO proof, the existing handoff warning asks the reviewer to check the Mint Line at x = 320 px on the H1 still. For the investigation, check a smeared transit with over-ink and the adjacent unsmeared frame. Check adjacent whole-run and per-letter frames for pixel displacement and whitespace. No browser or Remotion renderer ran in this build.
