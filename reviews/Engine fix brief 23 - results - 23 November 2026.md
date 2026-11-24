# Engine fix brief 23: results (23 November 2026)

Implemented Try (5b) in `deterministic/composition.mjs` `fillEmptyFrames` on branch `world-canvas` by Gemini 4 Neon (main agent on Thing 2).

## Summary of changes

1. **`deterministic/composition.mjs` (`fillEmptyFrames`, Try 5b):**
   - Added right after Try (5), so any song whose empty stretches already clear in Tries 1 to 5 is completely unaffected.
   - When a non-cut camera move `K` starts before `run.start` and lands inside `[run.start, run.end]` before the next plaque's incoming word appears at `run.end + 1`, tries delaying `K` (`K.f0 += s`, `K.f1 += s`) from `Math.min(run.end + 1 - K.f1, limitF1 - K.f1)` down to `1` while keeping outgoing words visible during `[origF0, km.f0 + 1]`.
   - Accepted only when `accept()` passes (fewer empty frames nearby, no increase in overlap frames, no increase in partly shown focused words) AND local `staticPartials` does not increase.
2. **`deterministic/KIT.md`:**
   - Added dated Brief 23 note documenting Try (5b).

## Verification

1. **`node --check deterministic/composition.mjs`:** pass.
2. **`node test_stage_layers.mjs`:** 21/21 pass (0 failures).
3. **`build_song.mjs --skip-build` on `!This Is Memphis (final)` Rough cut 1:**
   - Before Brief 23: `EMPTY STRETCH OVER 0.25 s FAIL: 890-897, 4631-4638`, `sizeUndone: 4`, `filled: 2`.
   - After Brief 23: `emptyRuns: []` (**PASS**, 0 stretches over 0.25 s, longest short gap 7 frames), `sizeUndone: 0`, `filled: 5`:
     - `frames 890-897`: camera whip delayed `887-893 -> 892-898` (+5f), `MEMPHIS THIS IS` stay on.
     - `frames 3185-3192`: camera follow delayed `3183-3187 -> 3186-3190` (+3f), `HAND IT GRINS GET 'EM THROUGH DOES IT` stay on.
     - `frames 4631-4638`: camera whip delayed `4628-4634 -> 4630-4636` (+2f), `NO MYSTERY` stay on.
   - Zero new overlaps, 0 static partials, 0 partly shown focused words, 0 late words, 0 idle stretches.
   - (That run exited 1 only for the 3 newly surfaced Section 7 keyword drops `WATCH`, `HIM`, `THEY` awaiting Opus keyword drop review, because `sizeUndone` dropped from 4 to 0.)
4. **Honest note on unchecked items:**
   - Did not run a separate `--skip-build` regression re-join on Big Toothy Grins or Raise the Flagg; because Try (5b) is strictly gated behind Tries 1 to 5 failing on a `> maxFrames` empty stretch, songs with 0 remaining empty runs after Try (5) never enter Try (5b).
