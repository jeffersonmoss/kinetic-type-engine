# Engine fix brief 4: results (22 November 2026)

Builder: Opus 5.5, for the T2 LeBron supervisor chat. Engine commits db9e8c7 (group 1 and the black-frame rule), 04352da (echoes, fill passes) and the final commit with this file (cut ends focus, clutter on move tails, rider floor, KIT). No browser or video render was run. Every finding below is measured on the final scene (`Whole song - final - scene.json`) from geometry: for each frame in Fable's window, every word that is switched on, above 5% opacity and has any part of its box in frame is listed with its letter-band share in frame, whether it reads the right way round (`readableOrientation`), and its letter height. A frame is black when no word is visible, facing the camera and in frame.

Builds:

1. Big Toothy Grins: `engine output/Rough cut 5 - 22 November` (full rebuild, N 200, every section re-picked; the keyword-mode build that was there is in safe-delete, restorable for 7 days). After Jefferson's map change (TELL-OH to TELL-O, word 118; HELL-OH to HELL-O, word 124), section 4 was rebuilt alone (`build_song.mjs --sections 4`, new option) and the song re-joined. The final scene shows w4019 TELL-O and w4025 HELL-O; neither old spelling appears in any output file. All numbers below are from that final join.
2. Room for One: `engine output/Engine fix test 5 - 22 November` (full rebuild, `--reveal-coverage 0.05`).

Both pass 0 projected overlap, 0 partly shown focused words, 0 blank opening frames and a still ending. Neither has an empty stretch over 0.5 s (item 16). Big Toothy Grins exits 0; Room for One exits 1 only for the two failures it already had (reveal under 20%, 76ers ring 10 of 15 readable frames).

## Group 1, blocking: 126.3 to 127.2 s, "and we attack"

1. FIXED. No mirrored or back-facing text is visible in the window. AND is whole at 11.4% letter height; WE is now shown (it was dropped as never wholly in frame in rough cut 4 and in the first brief 4 build), growing from 2.7% to 27.1%. BACK is not visible. Section 7 was re-picked (#187).
   1.1. Why brief 3's check passed: the sparse-frame check only compares small words; WE was 13.8% letter height, over the 12% small limit, so it never looked for an anchor. Nothing checked orientation at all. BACK was upside down (the camera rolled 180 degrees in the pivot at frames 3778 to 3791), not mirrored as Fable guessed.
   1.2. Check fixed: `hideUnreadable` hides, on every frame, any word outside its focus window that is in frame and seen from behind or mirrored, and any tilted more than 100 degrees while the camera is still. Sparse frames now use 15% (small) and 20% (anchor), and an anchor must be whole and read the right way round.

## Group 2, polish brief 3 called cleared

2. White chevron under INSIDE, 150.9 to 151.2 s: FIXED. Every word visible in frames 4527 to 4536 is 100% in frame.
   2.1. Why brief 3's check passed: the chevron was a sliver of STUCK left in frame on the cut to INSIDE. STUCK's focus window (to its onset plus 15 frames) ran one frame into the new hold, so the clutter pass skipped the whole hold. My brief 3 spot check sampled frame 4527, before the cut.
   2.2. Check fixed: a camera cut after a word's onset now ends its focus window.
3. CUTS halved, 72.9 to 73.6 s: FIXED for CUTS (not visible in the window). AND, BOTH and MOVES each show cut letters on 1 frame of the window (shares 74 to 89%), inside a camera move.
   3.1. Why brief 3's check passed: it measured the padded box, under which CUTS was 67% in frame, against an under-half threshold.
   3.2. Check fixed: the share is now measured on the letter band, and anything 95% or less in frame counts as cut.
4. "FF" beside WIDE, 148.9 to 149.6 s: FIXED for the hold (frames 4469 to 4488 show only whole words). PARTLY on the 2 camera-move frames before it (4467 and 4468): OF THE, DRIVES, BONES and TREY show cut letters (33 to 44% in frame).
   4.1. Why brief 3's check passed: the padded-box share again (OFF and FF at 78%).
   4.2. Check fixed as in 3.2. Clipped clutter is also hidden on the last frames of a camera move of 8 frames or fewer into the hold, but only while another word is whole in frame (otherwise it would black the frame). Here the earlier frames of that move have no other whole word, so they stay.

## Group 3, backlog

5. Specks:
   5.1. SO YOU CAN, 42.2 s: FIXED. SO and YOU are 11.1% letter height (were 6.0% and 3.2%).
   5.2. Sideways ONE, 93.7 s: NOT FIXED. ONE is 7.4 to 8.6%, unchanged.
   5.3. IT'S, 158.0 s: PARTLY. 7.2 to 7.5% (was 5.3 to 5.5%).
6. Lone small words: PARTLY, by a planner change as asked. The rider floor in `plan_words.mjs` rose from 13% to 20% of the shot's biggest anchor (RIDER_FLOOR). AND at 126.4 s went from 5.8% to 11.4%, and WE is now shown. The build reports 2 lone words it brought closer (tightenLone) and 1 speck left (was 0 with the old floor, because the size rule only flags words that grow or sit under 4%).
7. Edge slivers:
   7.1. 59.6 s: FIXED. TELL-O and CAN are whole; nothing else is in frame.
   7.2. 157.9 s: PARTLY. LYLES, RIGHT, BACK and TO show cut letters on 1 to 2 frames (camera move).
   7.3. 164.9 s: FIXED. All words whole.
   7.4. 175.0 s: PARTLY. CIRCLE shows 33% of its letters on 1 frame.
8. Black frames: superseded by Jefferson's correction (item 16). Single black frames are not the rule; only perceptibly long empty stretches are. Fable's 11 runs were 1 to 3 frames each, so under the corrected rule they are allowed and none is filled.
9. The final scenes have 23 short gaps in Big Toothy Grins (longest 4 frames, 0.13 s) and 15 in Room for One (longest 8 frames, 0.27 s), all under the 0.5 s limit. The floor-13 versus floor-20 trade noted earlier no longer matters under this rule.

## Found on the way: Room for One's outro chant

10. Room for One's outro (138.6 to 154.6 s) was black for about 16 s apart from flashes of the whispered echoes, in every engine build since Engine fix test 1. The final overlap repair retired RING!, which carries nine re-sung pulses, for its own first echo. Fixed as a rule: an echo never retires a sung word; when it floats over its own held word, that word steps back only while the echo shows. All 8 echoes now show, RING! returns between them, and the idle check passes. If the uploaded Room for One video came from an engine build, it has this black stretch; I could not tell which build was uploaded.

## Numbers

| | Big Toothy Grins rough cut 4 | Big Toothy Grins rough cut 5 | Room for One test 4 | Room for One test 5 |
|---|---|---|---|---|
| Overlap intervals | 0 | 0 | 0 | 0 |
| Partly shown focused words | 0 | 0 | 0 | 0 |
| Blank opening frames | 0 | 0 | 0 | 0 |
| Still ending | yes | yes | yes | yes |
| Dropped focused words | 3 | 2 | 2 | 4 |
| Empty stretches over 0.5 s mid-song | 0 | 0 | 1 (the 16 s outro, item 10) | 0 |
| Shorter gaps (allowed) | not counted | 23, longest 4 frames | not counted | 15, longest 8 frames |
| Unreadable words hidden | none hidden | 116 | none hidden | 40 |
| Focused words seen unreadably (left alone) | not measured | 5 | not measured | 1 |
| Pop share | 17.7% | 18.1% | 27.1% | 28.5% |
| Reveal coverage | off | off | 3.7% | 10.8% |
| Exit status | 0 | 0 | 1 | 1 (reveal under 20%, 76ers ring, as before) |

## Not done or open

11. Pivots that cross the plaque plane give 1 to 2 empty frames each; allowed under the corrected rule.
12. ONE at 93.7 s is still under 10%.
13. Slivers on 1 to 2 camera-move frames remain at several of Fable's times; the clutter rule acts in holds and on move tails only when another word is whole in frame.
14. The fill and the gate run on the joined scene, so the follow-ups re-joined both songs (`--skip-build`) without rebuilding any section.

## Follow-up: no dead screen (superseded by item 16)

15. The empty-frame gate cannot be waived: no section pick, fallback or song setting passes a build with an empty frame mid-song (exit 1, "EMPTY FRAMES FAIL (not waivable)"). A frame now counts as filled only when some word is at least half in frame and reads the right way round; my earlier test counted an edge sliver, which is how 797 (Big Toothy Grins) and 3589 and 4644 (Room for One) passed the engine while my independent check still found them empty. A fourth fill try, the camera stutter, holds the camera on the run's last filled pose over the run (`key.hold` in `interp.js`, which the render also uses) and keeps the words visible on that frame on. Result, both by the engine and by an independent per-frame check from the first sung word to the end: 0 empty frames in Big Toothy Grins Rough cut 5 and in Room for One Engine fix test 5, and 0 word-frames shown mirrored or from behind. Camera holds: 12 in Big Toothy Grins (18 frames in all, longest 4 frames) and 8 in Room for One (10 frames, longest 2). Overlap, partly shown, blank opening and still ending all still pass; Big Toothy Grins exits 0. The supervisor's note named one run in Big Toothy Grins (156.33 s); there were six by the engine's count and more under the stricter test, all cleared.

## Correction: long gaps, not black frames (Jefferson, 22 November 2026)

16. Jefferson: "not a single black frame. I'm just saying perceptibly long gaps between something disappearing and the next thing appearing. A black frame is a vanishingly small amount of time. That is not the rule." Item 15's rule is replaced. The gate now fails only on an empty stretch longer than the song setting `empty_gap_max_s` (default 0.5 s, 15 frames; our best guess, not his number), and only such stretches are filled. Shorter gaps trigger no fill, no failure and no re-pick; the report counts them. The gate still cannot be waived by any section pick or fallback. Kept: the stricter test for an empty frame (no word at least half in frame and readable), the four fill tries for long stretches (the camera hold now only for those), and the echo fix for Room for One's 16 s outro (item 10), which does not depend on the fill. Re-joined both songs: neither has a stretch over 0.5 s, so no fill or camera hold is applied (0 holds in either final scene). This changed both final scenes from the item 15 version: the 1 to 4 frame fills and the 20 camera holds are gone. Overlap, partly shown, blank opening and still ending still pass.
