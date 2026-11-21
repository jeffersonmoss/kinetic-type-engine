# Step 7 — Kinetic Type Engine score, compiler, host, and CLI

Step 7 is implemented in the working tree on `main`. Rendering and listening remain to be verified by the main agent. The unedited Room for One scaffold compiles in both formats and produces sync and inspection reports. Its hard check findings remain open for the pilot.

The [three-commit patch series](<Commit Series - Step 7.patch>) is based on `e2f47b40c4a3eeb850a542f0005643b9b7f34b91`. Use `git am` in a clean checkout of that commit. The current working tree already contains the edits.

## Build and verification

| Commit | Work | Evidence |
|---|---|---|
| 7.1 | Added score builders, motif expansion, occurrence binding, edit-clock mapping, placement, cap tiers, portrait overrides, fates, cameras, and screen-pinned glyph ownership. The compiler passes each accepted inclusive `[S, E]` to the board validator, sync report, and inspection list. Split runs share the interval object and token ID. | The held call reads from frame 41 through frame 55 as the reply becomes readable at frame 49. Dimming at frame 54 fails. Onset plus 1 frame passes and onset plus 3 frames fails. A lost source names its token and frame. Ambiguous `ONE` lists both candidates. An overwide portrait row reports its shortfall. |
| 7.2 | Added the scoped host, full-size 1280 × 720 and 1080 × 1920 pixel compositions, and 854 × 480 and 480 × 854 pixel AAC draft targets. Wired `new`, `ingest`, `check`, `render --draft`, `sheet`, and `where` through the existing `bin/kte` launcher with the `dev` pin. | Node generated and type-checked the unedited Room for One score. `where 0:08` returned frame 240, `line-1.reply`, scene `h1`, and `score/Section h1.ts`. Esbuild bundled the host entry for both formats with the copied audio asset. The verdict file round-tripped in Node. |
| 7.3 | Added Node fixtures for score, timing, emphasis, handoff, and both edge cases, plus a film-folder generator for browser inspection. Updated the real-input song test for Python fallback. | The screen carrier transfers three glyphs at frame 70 with matching cap coordinates in both formats. The held word disappears on the outgoing board at the cut. The format-scoped host rendered SSR markup. `node tools/check-imports.mjs` passed across 105 source files. |

Before every scratch commit, `npx tsc --noEmit` passed, `npm run -s validate:example` reported 0 errors and 12 warnings across 6 boards, and `node check/golden.mjs --self-test` matched all 170 SSR hashes. Its recolour test changed only pure-type frame 32. The series was replayed in a second clean checkout and compared with the assembly tree and working-tree files.

### Room for One input and diagnostics

- `kte new` ingested the untouched Suno alignment, song configuration, and MP3 from a separate temporary film folder. It found `~/Experiments/Buy This IPO Music Video/.venv/bin/python` with `KTE_PYTHON` unset. Import produced 39 lines, 319 sung tokens, 275 beats, and 20 open ear checks.
- All 6 song-import tests passed with the real inputs. They matched display text and beat records to the legacy map, preserved the corrected token’s raw time and stable IDs, and found a working interpreter after an invalid `KTE_PYTHON` override. The focused `npm run -s check:song-import` also passed.
- `bin/kte check` exited 1 on the unedited full-song draft. Wide reported 224 errors, 206 warnings, and 684 inspection frames. Portrait reported 250 errors, 191 warnings, and 685 inspection frames. Each report contains 319 sync rows, gives the `v1` scene cut and its opener fallback, and records 0 raw boards and 0 emphasis-font words across 8 boards.
- The generated `h1` and `v1` scenes use their stable `line-N` song-map IDs. The worked example uses illustrative motif IDs. The later scene gets `opening()` with sung-clock type-on as its draft fallback. Non-final scenes get `fade()` when their exit is absent. A strict compile rejects missing required fields, including the exit.
- Anton caps apply to hero and body text. Barlow Condensed Bold caps apply to connectives. The gap between rows starts at 0.04 times the larger cap, with measured ascender and descender clearance. Word and line overrides support mixed case and emphasis fonts. The fixture rendered `Enter` in the emphasis face and counted 1 emphasis-font word. The same override without a reason warns.
- The literal `ROOM FOR ONE` reply needs 312.35 px at the 46.80 px reading floor. Eighty percent of Anton’s measured hero `O` counter allows 11.29 px, so the compiler rejects a 301.06 px shortfall. This measurement uses the compiler’s separate-word row spacing and Barlow connective, so it differs from the Step 6 measurement. The storyboard needs another placement.

### Edge inspection evidence

| Fixture | Wide | Portrait |
|---|---|---|
| Legal entrance | 0 hard errors. The frame-edge crossing is sampled at frame 43. Protected reading begins at frame 44. | 0 hard errors. The crossing is sampled at frame 43. Protected reading begins at frame 45. |
| Cropped reading | `edge.1.token-1` fails at frame 54 within `[44, 61]`. Frame 54 is listed for inspection. | `edge.1.token-1` fails at frame 55 within `[45, 61]`. Frame 55 is listed for inspection. |

The clean fixture yields 4 listed frames per format. The clipped fixture yields 5 and also triggers the existing camera-in-motion rules. These are Node checks. The browser stills and human verdicts are pending.

## Implementation decisions and limits

- The draft rise fallback schedules words on their sung clock so a spoken line can appear one word at a time. Draft preview rendering accepts timing and picture diagnostics so the original scaffold can be inspected. Structural compile failures, such as a missing binding or an impossible nest, stop it.
- A score-created board uses its explicit fates and protected intervals instead of the legacy word retirement timer. The legacy validator treats a short read at rest as a warning on these boards under v2 item 111. Its other framing and movement rules still run.
- The sampler checks opacity, cap size, contrast, safe-box bounds, and same-board occlusion with transformed glyph advance boxes. Projected turns, font outlines, clip masks, and ink overlap between outgoing and incoming boards still need picture review. The inspection list includes transition midpoints, kept transfers, scene-cut triplets, edge crossings, and compiler error frames. The hull pass remains Step 10.
- The import guard permits type-only `score` references to `Board` and `EngineContext` for the specified `raw` callback and declarative rule types. It permits the checked-in measured metrics JSON in compiler defaults. The step 6 registry adapter remains available for legacy effects.
- An initial handoff test exposed an unbounded sampling board. The carrier now samples the finite cut frame. An initial patch replay flagged a blank line at EOF. The final series was regenerated and checked after removal.
- Room for One’s count-in and other open alignment spots still need listening. The illustrative hook transitions and the storyboarding choice for the nest belong to Step 8. This build did not run a browser or Remotion render. The `props/` tree and finished films were outside the work.
- The shared-memory lookup returned `MCP tool call requires approval, but approval policy is never`. The committed history and requested design and reports supplied the build context.

The Step 6 effects, frame-core, and context regression modes of `check/golden.mjs` also passed. One scratch checkout from the first assembly attempt remains at `${TMPDIR%/}/kte-build-step-seven-WZlhzq`. Its owner label identifies this build. `safe_rm` reported `[Errno 1] Operation not permitted` when moving it to `~/.safe-delete/items/` and left it untouched. The main agent can remove this scratch with the standard `safe_rm` command on the host. The successful assembly, replay, and test-film folders were removed.

## Main-agent commands

Run this from a shell that can launch the Remotion browser. It uses only temporary film folders. Keep the folder until the clips, stills, and verdicts have been reviewed.

```bash
set -euo pipefail
cd "$HOME/Experiments/Kinetic Type Engine"
source_film="$HOME/Experiments/Room for One Music Video"
audio="$source_film/audio/!Room for One (LeBron Glaze).mp3"
work="$(mktemp -d "${TMPDIR:-/tmp}/kte-build-main-inspection-XXXXXX")"
printf 'owner: main agent\nshared: no\npurpose: Step 7 browser verification\ncreated by: Step 7 main agent on Thing Two\ndate: %s\nuntil: after clips, stills, and inspection verdicts are verified\nexpensive to recreate: yes\n' "$(date +%F)" > "$work/TEMP_README.md"
film="$work/Room for One"

env -u KTE_PYTHON bin/kte new "Room for One" --here "$film" \
  --audio "$audio" --alignment "$source_film/analysis/Suno lyric alignment.json" \
  --song "$source_film/song.json" --suno-clip 77c334f8-edae-47f6-bb68-877d66123a4f

bin/kte render "$film" --draft --section h1 --format wide
bin/kte render "$film" --draft --section v1 --format wide
bin/kte render "$film" --draft --section h1 --format portrait
bin/kte render "$film" --draft --section v1 --format portrait

for clip in "$film"/renders/*.mp4; do
  printf '%s\n' "$clip"
  ffprobe -v error -show_entries stream=codec_name,codec_type,width,height -of compact "$clip"
done

room_status=0
bin/kte check "$film" || room_status=$?
test "$room_status" -le 1
test -s "$film/reviews/wide/Frames to inspect.json"
test -s "$film/reviews/portrait/Frames to inspect.json"
bin/kte sheet "$film" --format wide
bin/kte sheet "$film" --format portrait

node fixtures/step-seven/make-edge.mjs "$work" "$audio"
bin/kte check "$work/Edge Move Clean"
if bin/kte check "$work/Edge Move Clipped"; then
  printf 'Expected the clipped fixture to fail.\n' >&2
  exit 1
fi
bin/kte sheet "$work/Edge Move Clean" --format wide
bin/kte sheet "$work/Edge Move Clean" --format portrait
bin/kte sheet "$work/Edge Move Clipped" --format wide
bin/kte sheet "$work/Edge Move Clipped" --format portrait
printf 'Review files are under %s\n' "$work"
```

Play both section clips with audible music and confirm that the first lyric in `v1` opens from its own scene. Inspect the contact sheets and named PNG stills in `renders/inspection/<format>/`. Confirm the clean crossing at frame 43, and the clipped sung word at wide frame 54 and portrait frame 55. The safe box in full-size pixels is `x=48…1232, y=48…672` for wide and `x=72…918, y=153.6…1536` for portrait. Record each reviewed frame’s verdict and note in the respective film’s `reviews/Inspection.json`. Once the actual hook-to-verse score is written, inspect its retained glyphs immediately before, at, and after the transfers and listen for sync with the vocals.
