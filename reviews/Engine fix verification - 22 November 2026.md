# Engine fix verification, 22 November 2026

## Why rough cut 2 overlapped

The trail's 9.6.2 slab checks operate in world space and its sight lines probe selected points at landings. Focus dominance compares relative projected size at landings. The readable-anchor check looks for a short initial streak and skips same-plaque words. Clean motion checks moving entrances. The shown-whole gate checks framing rather than obstruction by another word. The severity fallback could select a scene that failed the older checks, and section checks never saw conflicts created by joining sections or adding echoes.

The old final scene exhibits both kinds of overlap. Around 90.23 s, the NERVOUS and YOU texture envelopes cross the seam between coplanar, intersecting panels p509 and p601. Around 101.87 s, FROM and THE on p606 meet HE'S on p607 in projection. Those two parallel plaque planes are separated by about 1,281 world units. The same projected gate counts both.

The gate measures projected texture envelopes during the lyric sequence. Their rectangles can include transparent space around glyphs. Browser pixels, ripple outlines, and the composited final reveal were outside this check. Render review remains with the supervisor.

## Rebuild

Run from the engine checkout. The build writes the final scene and provenance even if a whole-song gate fails.

```zsh
cd "/Users/jeffersonmoss/Experiments/Kinetic Type Engine/deterministic"
node build_song.mjs "$HOME/Experiments/Big Toothy Grins Music Video/engine input" --out "$HOME/Experiments/Big Toothy Grins Music Video/engine output/Engine fix test - 22 November"
node build_song.mjs "$HOME/Experiments/Room for One Music Video/engine input" --out "$HOME/Experiments/Room for One Music Video/engine output/Engine fix test - 22 November" --reveal-coverage 0.05
```

## Song inputs

Big Toothy Grins now supplies `intro` and `team_wordmarks` in `song settings.json`. Both logo images live alongside it. The first PNG uses a circular alpha mask. The intro starts on frame zero. The badge has a 1.5 s minimum hold and drifts into an 18-frame dissolve from 4.1 to 4.7 s. The front-facing logo cuts at frame 266, the frame for the 8.858 s onset. The wordmark entries use the reference note's estimated Icon palette. WOLVES and TIMBERWOLVES have null font paths, so the build reports the absent face and applies the colours to existing lettering.

## Room for One

All eight sections were rebuilt at 200 candidates per section and the approved opening was reused. The title fallback covered frames 0–97. The revised intro and overlap checks both passed. Relative to the documented parity run, measured projected overlap fell from 64 intervals to zero. Sections 2–7 still used fallback and sections 8–9 passed. The chosen candidates changed in sections 2, 3, 4, 6, and 7.

The whole-song build still exited 1. THREE! is now partly shown (three frames starting at frame 3494), and reveal compaction now drops p308 and p401. Reveal coverage fell from 10.1% to 9.7% against the existing 20% floor. The 76ers ring still gets 10 readable frames against its 15-frame minimum. Late lyric words and idle stretches stayed at zero. Pop share changed from 82 of 314 entrances (26.1%) to 82 of 309 entrances (26.5%). The shown-whole check lists five dropped words and the separate sync check lists two.

## Big Toothy Grins

The projected lyric-overlap count fell from 67 intervals in Rough Cut 2 to zero. The joined sweep retired six spent words. The opening check passed with zero blank frames. All ten sections remained on severity fallback, with zero of 200 candidates per section passing all checks. Each chosen section passed the projected overlap check. The final scene has 65 pops of 368 entrances (17.7%), one partly shown word (ON, six frames from 286), zero idle stretches, and zero late words. The shown-whole check lists three dropped words and the sync check lists two. The build exited 1 because ON is partly shown and reveal coverage is 11.6% against the 20% floor. The engine records these results in `Whole song - provenance and flags.md` alongside each scene.

### Most frequent failures by section

| Section | Three most frequent checks, candidates failing |
| --- | --- |
| 1 - Chorus one | Shown whole 200/200, Sync 199/200, Protected reading 189/200 |
| 2 - Verse one - Jaden and Rudy | Protected reading 200/200, Floors and stillness 192/200, Shown whole 191/200 |
| 3 - Verse one - Ayo | Protected reading 200/200, Sync 189/200, Focus dominance 166/200 |
| 4 - Melo and hook | Sync 200/200, Protected reading 199/200, Clean motion 189/200 |
| 5 - Ant - watching tape | Protected reading 200/200, Clean motion 200/200, Sync 197/200 |
| 6 - Ant - one fake | Protected reading 200/200, Clean motion 200/200, Sync 197/200 |
| 7 - Chorus two | Sync 200/200, Shown whole 194/200, Clean motion 189/200 |
| 8 - Shannon off the pine | Readable anchor 200/200, Floors and stillness 200/200, Protected reading 200/200 |
| 9 - Bones and Trey | Protected reading 200/200, Clean motion 199/200, Focus dominance 179/200 |
| 10 - Final chorus | Sync 200/200, Clean motion 197/200, Protected reading 192/200 |

The most persistent failures came from protected reading and sync. The protected-reading check requires 15 readable frames with eight consecutive still frames. Entrances and camera moves can consume the available reading window. Sync also checks the landing and entrance deadlines, so zero late final-scene words does not imply a section sync pass. To increase the survivor count, the planner would need to reserve reading holds and settle entrances against the lyric deadlines before picking folds and moves, then validate the camera repairs against those same deadlines.

## Engine changes

- `build_best.mjs` ranks eligible overlap-free variants ahead of candidates with overlaps and tallies failures across the candidate pool.
- `overlap_gate.mjs` scans and repairs projected word and panel conflicts.
- `build_song.mjs` checks the joined output and reports overlap, opening, and wordmark results.
- `song_appearance.mjs` loads the intro and wordmark data. `viewer.html` renders the images and fits custom faces.
- `KIT.md` and the rule-change entry describe the input contract and gate decisions.

Both final assemblies were refreshed with `--skip-build` after the final joined-scene repairs, retaining the 200-candidate section outputs. Node syntax checks passed, including the extracted viewer module. The song appearance check verified the timeline, embedded PNG assets, title fallback, blank rejection, explicit missing-face reporting, and embedding of a supplied TTF. No browser or video render was run.
