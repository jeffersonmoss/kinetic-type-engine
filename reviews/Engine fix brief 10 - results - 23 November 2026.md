# Engine fix brief 10: results (23 November 2026)

Builder: the T2 engine chat (Claude, Opus 5.5). Nothing was rendered. No section was rebuilt and the logo swap was not touched.

## 1. Outcome first

1. Big Toothy Grins `engine output/Rough cut 6f - 23 November` was re-joined with `--skip-build` from 6e's sections. It exits 0, and every gate passes.
2. Type rules check: 22 failures, all rule 1, the same 22 words as 6c to 6e. Dropped by necessity: 7, unchanged.
3. **Why the TODAY hides did not show (Fable item 9):** the report was wrong, not the render. The fly-through pass ran before the empty-screen fills. A fill then changed the camera near 154 s and turned TODAY back on for those frames. The report still listed the hides. Two fixes:
   1. The pass now runs again after the fills, on the final camera.
   2. The report marks any hide a later fill undid. Both TODAY hides now read "UNDONE later on 4 of its frames" and are not counted as visible.
4. **Correction to my brief 9 results:** "3 hides, all 3 visible" was wrong. Only DAY's was in effect in 6e; the two TODAY hides had been undone.
5. **Ghost at 126.00 s (item 12):** now hidden. It was GRINS's blue block: the camera's pivot goes through the plaque between frames 3780 and 3782. New rule: a word is hidden on the frames where the camera goes through its box.
   1. This also hides ARC at frames 3057 to 3058 (101.9 s), a pass-through of the same kind that no earlier cut hid. Unseen.
6. **Swell releases (item 13; the lamelo chat asked for slow releases that stay in frame):** releases now try 12, 8 and 6 frames. Each runs to the square root of the swell, then to full rest, and is steered about other points of the word's box if needed.
   1. IT'S (157.8 s) shrinks over 12 frames to x1.83, instead of dropping in 2 frames. It still ends smaller than its swelled size, so Fable's "settled IT'S is small" stands.
   2. AND (23.2 s) and PACK (108.2 s) shrink over 6 frames to rest, instead of 3. A slower release runs AND off the frame during the camera sweep.
   3. YOU (35.2 s) and THAT (109.4 s) still drop back in 3 frames. Every slower or steered release overlaps a neighbour, and for YOU some also run off the frame. The report now counts each refusal.

## 2. Other changes

1. The engine's near clip now matches the viewer's camera (near 20 units, was 1). The visible-pixels flag uses the hidden part's area on screen, not its share of the word: GRINS read 0% of its word but covered a third of the frame. No gate changed result.
2. Item 14 (one-frame changes) and item 15 (YOU, PACK, THAT): no action asked. PACK changed anyway (1.6.2).
3. WE at 17.93 s: the lone-sideways rule is unchanged (it is still a report), so nothing was done there, per the lamelo chat's note.

## 3. Not done

1. Nothing rendered: GRINS, ARC, DAY, AND, PACK and IT'S are all unseen.
2. YOU and THAT releases (see 1.6.3).
3. Item 27 of brief 9 (a lone sideways word failing the join) still waits on Jefferson's decision.
4. Section rebuilds and the logo swap: held.

## 4. Stills for the pass after Jefferson's section decisions

1. 125.9 to 126.1 s: no blue ghost (GRINS).
2. 101.8 to 102.0 s: ARC's new hide.
3. 153.9 to 155.2 s: TODAY on throughout, as in 6e.
4. 23.2 to 23.7 s: AND's 6-frame release.
5. 108.1 to 108.6 s: PACK's 6-frame release.
6. 157.6 to 159.2 s: IT'S 12-frame release.

## 5. Files and cleanup

1. Engine: `composition.mjs`, `build_song.mjs`, `KIT.md` (brief 8 section updated; Type rules untouched).
2. Rough cuts 6c, 6d and 6e are left in place; 6f holds copies of 6e's sections. The older cuts could go once one is accepted; I have not deleted them.
3. My temp folder is deleted.
