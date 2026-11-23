# Engine fix brief 3: results (22 November 2026)

Builder: Opus 5.5, for the T2 LeBron supervisor chat. Engine commits 57b054e, 891d260, 97e34e5 and 6e6e355, plus the KIT and results commit. No browser or video render was run, and every finding is measured from scene geometry, not watched. Big Toothy Grins "before" is rough cut 3 (`Engine fix test 2 - 22 November`); "after" is `Rough cut 4 - 22 November`. Room for One's "before" is `Engine fix test 2`; "after" is `Engine fix test 3 - 22 November` (`--reveal-coverage 0.05`). Both final scenes were refreshed with `--skip-build --all-words` after the section builds, on the committed engine.

## Item by item

1. Ending (blocking): `ending: {reveal: false, hold: "WOLVES"}` is now in Big Toothy Grins' settings. The song ends on w10028 WOLVES!, at rest from frame 5307 (176.90 s) and held still to frame 5394. Rough cut 3 instead pulled back to a 2.5%-coverage strand and was still moving at the end. With the reveal on, it now lands at least 0.5 s before the end and stops at the coverage floor, centred. The new still-ending check passes on both songs. Room for One's reveal shows 82 of 82 plaques at 9.0% coverage (was 7.2%), with the same start and end frames.
2. Specks: the rule is letters under 10% of the frame height at onset + 3 frames, and growing at least 1.5 times once the camera arrives, or under 4% outright. Fable's "4% of frame height" does not match how his examples measure: they ranged from 2.4% to 9.4% letter height, while readable words ran 12% to 44%. Big Toothy Grins went from 40 specks to 0.
   2.1. Fable's examples, letter height at onset + 3 frames, before then after: SO and YOU at 42.3 s, 5.0% then 6.0%; YOU at 57.8 s, 2.6% then 8.3%; ONE at 93.7 s, 9.4% then 8.6%; DOES and HE at 86.8 s, 2.4% then 7.0%; HE'S at 101.9 s, 4.3% then 13.1%; YOU'RE IN at 133.3 s, 4.1% then 13.0%; I'M at 137.6 s, 6.7% then 13.2%; AND at 144.7 s, 5.6% then 13.2%; IT'S at 158.0 s, 5.3% then 5.3%.
   2.2. Still under 10%: SO and YOU (42.3 s), YOU (57.8 s), ONE (93.7 s), DOES and HE (86.8 s), IT'S (158.0 s). The rule no longer flags them, because they stay at that size in their own framing (riders on a plaque with a large anchor). Whether they still read as specks needs the render.
   2.3. YOU'RE IN was missing from the build report because it sat whole, at 4.1%, through its onset window. The later move to DANGER cropped it, which the shown-whole gate allows for words past their moment. The size rule now covers that case.
3. Line groups: the overlap repair now retires a word's whole plaque group at once (only words past their reading moment). Measured: JELL-O, BOUNCIN', LIKE and IT'S all leave at 62.80 s, where rough cut 3 retired JELL-OH 0.3 s early. WHINE? and THAT leave together at 169.30 s. FROM, THE and ARC leave together at 102.90 s, so FROM HE'S ARC no longer happens.
4. Sparse frame: AND and WE at 126.4 s are fixed (no longer flagged). One sparse frame remains, SMILES and RIGHT at 156.4 s (5.4% and 11.7%, 48% of the frame apart). Sparse frames and specks now rank section candidates right after the shown-whole gate; they do not fail a candidate.
5. Edge clutter: words outside their focus window and under half in frame are hidden for the hold (101 hides in Big Toothy Grins, 79 in Room for One). Of Fable's sample times, 72.9, 150.9, 158, 160.9 and 163.8 s and the M at 89.5 s now show none. At 148.9 s the camera is mid-move (frames 4465 to 4469); OFF BENCH DRIVES BONES TREY show for those 4 frames and are hidden for the hold that follows.
6. Lone small words: NOT FIXED. The pass (22% letter height, centred) found nothing to do in Big Toothy Grins. In every Fable example, the next word arrives 6 to 11 frames (0.2 to 0.37 s) later in the same hold: AND, then WE, then ATTACK; THOSE, then HANDS; YOU, then HEAR, then THAT. That is too short for a camera push in and back out. I tried one and reverted it, because it never fired. The fix belongs in the plaque planner: riders sized closer to their anchors, or the first word of a group framed alone with a longer hold. Measured now: AND (23.8 s) 9%, THOSE 7%, YEAH 7%, YOU (45.8 s) 7%, RIGHT 12%, YOU (163.0 s) 9%; NERVOUS (86.5 s) 24%, now with company. In Room for One, 8 lone words were brought closer.
7. Wordmark: the image is resampled once, now at high quality. The 710x150 px source is the limit: it is drawn at 1.66 to 1.73 times its size in each WOLVES texture, so its edges soften. A sharp result needs a source at least about 1,300 px wide, or an SVG.
8. Song input: Jell-O and the RIGHT / OFF / OF THE / BENCH split are used as given. Nothing in the input keys on word index: timing corrections are empty, sung repeats are keyed by time, and sections by line id. The map's line and word indexes are consistent.

## Numbers

| | Big Toothy Grins before | Big Toothy Grins after | Room for One before | Room for One after |
|---|---|---|---|---|
| Overlap intervals | 0 | 0 | 0 | 0 |
| Partly shown focused words | 0 | 0 | 0 | 0 |
| Blank opening frames | 0 | 0 | 0 | 0 |
| Dropped focused words (wholly out of frame) | 6 | 3 | 4 | 3 |
| Specks / sparse frames | 40 / 3 | 0 / 1 | not measured / 0 | 1 / 0 |
| Sync: late, lyric words dropped | 0, 3 | 0, 2 | 0, 2 | 0, 0 |
| Pop share | 63/366 (17.2%) | 66/372 (17.7%) | 82/309 (26.5%) | 79/310 (25.5%) |
| Ending | pull-back to 2.5%, moving at the end | still on WOLVES! | reveal 7.2%, still | reveal 9.0%, still |
| Exit status | 1 | **0** | 1 | 1 (reveal under 20%, 76ers ring 10 of 15 frames, as before) |

## Costs and caveats

9. Section builds are slower: about 2 to 3 minutes per section, against about 1 minute before, because every candidate is now checked for size and sparse frames.
10. Room for One section 9 now has 39 survivors (was 41); section 8 still has 1.
11. All Big Toothy Grins sections still use the severity fallback.
