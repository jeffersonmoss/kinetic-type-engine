# Engine fix test 2: results (22 November 2026)

Builder: Opus 5.5, for the T2 LeBron supervisor chat. Brief: `Engine fix brief 2 - wordmark images and partly shown words - 22 November 2026.md` plus the supervisor's intro items 4 to 6. Engine commits 5863d64, 5cf9529, b4a664a and this one. No browser or video render was run.

## Why the focused words were partly shown

1. Neither partial was caused by the post-passes. Both were already in the chosen section candidates. Sol's selector filtered to overlap-free candidates before ranking by partly shown words, so it picked candidates that kept one partial (Big Toothy Grins section 1, Room for One section 7).
2. The joined sweep could not repair either one:
   2.1. ON (Big Toothy Grins, frame 286) sits in the opening hold, before the first camera key. Every repair needed a key that had already finished, so nothing could reframe that hold.
   2.2. THREE! (Room for One, frame 3494) pops in whole, but a 5-frame follow move starts on frame 3495 and takes it out of frame. Starting the move later would leave it under the minimum length, and delaying the whole move pushes ONE! (6 frames later) partly out instead.

## Engine changes

3. Section selection tiers: (a) whole and overlap-free, (b) whole, (c) the rest, ranked by fewest partly shown words. A candidate's shown-whole result is re-judged after its own overlap repair.
4. `repairShown` can reframe the opening hold. A short move that takes the focused word away is delayed whole (up to 15 frames), or, if that costs another word, it becomes a cut on its landing frame.
5. `repairShownAndOverlap` alternates both repairs on the final joined scene until neither changes anything. The final checks then judge the scene as written.
6. Team wordmark images (`team_wordmarks.<NAME>.image`) keep their aspect ratio, fit the word box, tint through alpha (`tint`), and take `stroke` and `accent` outlines plus a `background` block. The report lists IMAGE, FONT or NEITHER for each entry.
7. Intro: each PNG is sized and centred on its alpha bounds (`png_alpha.mjs`). The front stare's badge fills 90% of its canvas and the howling badge fills 100%, which caused the ghost double ring. All images share one exponential push (4.5% per second, about 21% over a 4.4 s hold, 48% across the 8.9 s intro) and a linear drift (6% of the frame width), with no easing or wobble. At any frame, including the 18-frame dissolve, both badges therefore have the same size and centre.

## Big Toothy Grins input (not committed: that folder's repo already had uncommitted changes)

8. Copied `WOLVES wordmark - current jersey lettering - navy on transparent.png` into `engine input/`. WOLVES uses it with a white stroke, an aurora green #78BE20 accent and a lake blue #236192 block, keeping the artwork's navy letters. TIMBERWOLVES has no image or font (NEITHER), and no scene word matches it.

## Results (Sol's pass, then this pass)

| | Big Toothy Grins | Room for One |
|---|---|---|
| Projected overlap intervals | 0, then 0 | 0, then 0 |
| Partly shown focused words | 1 (ON), then 0 | 1 (THREE!), then 0 |
| Dropped focused words (wholly out of frame) | 3, then 6 | 5, then 4 |
| Blank opening frames | 0, then 0 | 0, then 0 |
| Wordmarks | none drawn as images, then WOLVES as an image on 14 scene words (7 sung, 7 reveal copies) | none |
| Pop share | 65/368 (17.7%), then 63/366 (17.2%) | 82/309 (26.5%), then 82/309 (26.5%) |
| Sync: late, lyric words dropped | 0 and 2, then 0 and 3 | 0 and 2, then 0 and 2 |
| Idle stretches | 0, then 0 | 0, then 0 |
| Reveal coverage (needs 20%) | 11.6%, then **2.5%** | 9.7%, then 7.2% |
| Reveal plaques | 98 of 98, then 98 of 98 | 80 of 82, then 82 of 82 |
| Sections on severity fallback | 10 of 10, then 10 of 10 | 6 of 8 built, then 6 of 8 |
| Exit status | 1, then 1 | 1, then 1 |

9. Both songs still exit 1. Big Toothy Grins fails only the reveal coverage. Room for One fails the reveal coverage and the imagined 76ers ring (10 readable frames against 15).
10. Worse after this pass: Big Toothy Grins reveal coverage fell from 11.6% to 2.5%, and its dropped words rose from 3 to 6. The cause is probably the new selector tiers: they chose different candidates in sections 1 and 5 to 8, which changes the trail layout. Not investigated further (brief item 3.4). Room for One coverage fell from 9.7% to 7.2%, but no plaques are dropped now.
11. Pre-existing and unchanged: Big Toothy Grins' reveal pull-back ends 1.40 s after the song ends (start frame 5317, end 5437, song 5395 frames).

Outputs: `~/Experiments/<song> Music Video/engine output/Engine fix test 2 - 22 November/`.
