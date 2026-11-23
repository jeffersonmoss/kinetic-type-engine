# Engine fix brief 6: results (22 November 2026)

Builder: the T2 engine chat (Claude, Opus 5.5). Nothing was rendered; the stills to check are in part 5.

## 1. Outcome first

1. Big Toothy Grins `engine output/Rough cut 6b - 22 November` was re-joined with `--skip-build` from rough cut 6's sections (copied into the 6b folder). It exits 0.
   1. Overlap 0, rescanned on the final scene.
   2. Partly shown 0.
   3. No empty stretch over 0.25 s, and the first and last frames are non-empty.
   4. Still ending PASS, sync 0 late, idle 0.
2. The small sideways HE at 40.7 s (w3003) is now caught. It is resolved by growing it, not by dropping it, which differs from the brief's "drop it". Part 2 explains why, and a decision is needed.
3. SHOOTING's "shadow" is not a style. It is the renderer's motion blur. The viewer fix is made but unverified until a re-render.
4. The Type rules check now reports the Raise the Flagg outlines. It finds 127 outlined words, including COOPER at 4.9 s and TONIGHT at 43.9 s and 95.3 s.
5. Item 5 (no word static and partly on screen) is an engine rule and gate. Raise the Flagg rough cut 2 has 7 cases, including the FL fragment (not rebuilt). Big Toothy Grins 6b had 12; all are now hidden and the gate passes (part 7). Side effect: one more Type rule 1 failure in 6b (22, was 21).

## 2. The small HE at 40.7 s

1. **Which of the three causes it was:** none of them. It was not brought back by the empty-screen undo, not a word that can't grow, and not missed by the check.
   1. In rough cut 6 the size pass grew it ×1.04 to 9.5% of the frame height.
   2. That passed, because its frame (HE, TURNS, HE) counted as crowded and the crowded minimum is 9%.
   3. The check agreed for the same reason. HE, the measured reference, was itself only about 9%. The real problem was calling three words in a mostly empty frame crowded.
2. **Fix:** "crowded" now needs 4 words, up from 3, or 30% of the frame covered by word boxes. The song setting `crowded_words` defaults to 4. The frame at 40.7 s is now judged to have room, so the HE's minimum is 13.5%. The check reports any case like this one, since it uses the same measure.
3. **Result in 6b:** the size pass grew w3003 ×1.53, to 13.9%, about 100 px at 720, close to the other HE. Growth comes before dropping because the approved Type rule 1 drops only "a word that won't fit at that size", and this one fits with no overlap. Dropping a non-important word that could be grown would need a rule change.
4. **Decision for Jefferson:** keep it sideways at full size (6b now), or drop it? Dropping would need an approved rule, such as "a non-important word turned sideways is dropped rather than grown". (q1)
5. **Side effect:** with crowded set to 4, Raise the Flagg's rule 1 failures rose from 107 to 124. In Big Toothy Grins 6b: 74 grown (72 before), 45 dropped by the size pass, 14 of them brought back for the empty-screen rule, 31 dropped in the final scene.

## 3. SHOOTING at about 101.6 s (the brief says 109.2 s)

1. The scene has SHOOTING (w6036) on screen only from frame 3015 to 3049 (100.5 to 101.6 s). At 109.2 s the words on screen are GIVES, ANT, GROWL, A, HOWLS, THE, WHOLE, PACK and AND.
2. It is solid cream in the scene: no extrude, depth or shadow copy. On frames 3047 and 3048 a 4-frame camera follow starts and moves the image 13 to 76 px per half frame.
3. The renderer's motion blur took one sample per 10 px. At 13 px that is 2 samples: two half-strength copies 13 px apart, which reads exactly as a grey drop shadow. The ghost stacks on GIVES, GROWL and WOLVES on the spot-check sheet are the same thing with more samples.
4. **Fix** (`viewer.html` sampleCount): samples at most 3 px apart, up to 32 per frame, and a frame with under 4 px of motion is drawn sharp. The 13 px frame now gets 5 samples (a smear, not a copy). The 76 px frame gets 26.
5. **Not verified:** I cannot render. Renders of fast moves will take longer, up to 32 draws a frame instead of 12.

## 4. Outline detection in already-built scenes

1. Raise the Flagg rough cut 2's outlined COOPER and TONIGHT carry no outline in the scene. They are in the grey style, which the viewer of that time drew with a white outline. Brief 5 removed that from the viewer, so a re-render with today's viewer would draw them flat.
2. The check now counts as outlined:
   1. any word with a stroke, a white edge or an outline palette style;
   2. in a scene built before brief 5 (no `meta.jersey_bold`), any word in the grey style.
3. Raise the Flagg: 127 rule 3 failures, all grey words, now reported as outlined. Total failures 279: rule 1 124, rule 2 2, rule 3 127, rule 4 26. Report: `Raise the Flagg Music Video/engine output/Rough cut 2 - 22 November/Type rules check - 22 November 2026.md`.

## 5. Type rules check on rough cut 6b (replaces brief 5 results part 6.1)

All 21 failures (22 after item 5, see part 7) are rule 1 (letters too small). None is unexplained. Full list: `Big Toothy Grins Music Video/engine output/Rough cut 6b - 22 November/Type rules check - 22 November 2026.md`.

1. 3 are important words that can't grow and may not be dropped: ANT 13.2% at 89.80 s, BONES 10.5% at 147.27 s, TREY 9.5% at 158.17 s.
2. 18 are 14 non-important words the engine dropped and then showed small again, because each drop left a stretch over 0.25 s empty that no fill could clear:
   1. YOU 11.43 s
   2. YOU 35.60 s
   3. WHEN and YOU 53.4 to 54.8 s
   4. YOU 57.77 s
   5. OR 100.27 s
   6. THE, HOWLS and AND 107.4 to 110.4 s
   7. THAT'S 115.63 s
   8. RIGHT, BACK and TO 155.5 to 157.5 s
   9. IT'S 157.97 s
3. Sections with failures:
   1. 1 (Chorus one)
   2. 2 (Jaden and Rudy)
   3. 4 (Melo and hook)
   4. 6 (Ant, one fake)
   5. 7 (Chorus two)
   6. 9 (Bones and Trey)
   Only a rebuild of a section clears its failures, by giving it a layout where these words fit or the gaps are covered.
4. Time ranges to render as screenshots:
   1. 11.4 to 12.4 s
   2. 35.5 to 36.9 s
   3. 53.3 to 59.0 s
   4. 89.7 to 90.0 s
   5. 100.2 to 101.6 s
   6. 107.4 to 110.4 s
   7. 115.6 to 117.1 s
   8. 147.2 to 148.1 s
   9. 155.5 to 159.1 s
5. Also check these, for this brief:
   1. 40.1 to 41.3 s: the grown sideways HE.
   2. 101.4 to 101.7 s: SHOOTING during the camera follow; the shadow should be gone.
   3. Any fast move, for the new blur.

## 7. Item 5: no word static and partly on screen

1. **Definition** (best guesses, in KIT.md):
   1. Visible share: the word's projected letters clipped exactly to the frame, over their full projected area.
   2. Partly on screen: share between 0.5% and 99.5%, while the word is drawn.
   3. Static: the share changes by under 0.01 per frame for 4 frames or more in a row.
2. **Resolution:** the word is hidden for its whole partly-on-screen stretch. A focused word is hidden only after it has been shown whole through its onset and for 6 frames; if the static frames fall inside that, the join fails. Moving it in or pushing it out with the camera is not built; hiding cleared every case.
3. **Gate:** the join exits 1 if any case is left (`STATIC PARTLY ON SCREEN FAIL`). The provenance report lists each word hidden.
4. **Raise the Flagg rough cut 2 (check only, not rebuilt): 7 cases.**
   1. DUNKS 31.03 s, 6% on screen
   2. PASS 37.23 s, 47%
   3. PAY 77.80 s, 1%
   4. PLAY 84.13 s, 11%
   5. MAINE 122.33 s, 2%
   6. FLAGG! 162.63 s, 32% (Jefferson's FL fragment: a zoom entrance that comes to rest past the right edge)
   7. FLAGG! 163.60 s, 42% (the same word a second later)
5. **Big Toothy Grins rough cut 6b: 12 found before the fix, 0 after.** All hidden (time is where the static stretch starts):
   1. HOT? 27.73 s, 11%
   2. HANDS 34.00 s, 75%
   3. GOODBYE 44.03 s, 8%
   4. EYES 46.83 s, 6%
   5. WE and AND 70.47 s, 75% and 81%
   6. ANT 90.13 s, 2%
   7. DOWN 90.50 s, 9%
   8. EVER 97.03 s, 4%
   9. WIN 110.97 s, 18%
   10. BALL 143.67 s, 8%
   11. OF THE 146.23 s, 9%
   Ten are focused words caught by a camera follow after their onset; each is hidden from the end of its shown-whole requirement.
6. **Side effect:** hiding HANDS left 34.0 to 34.4 s empty, so the empty-screen undo brought back ARE (w2024, 8.7%, a hinge word that cannot grow). The Type rules check now lists 22 rule 1 failures in 6b (Section 2 has 2). The report in the 6b folder is updated.
7. **Other gates on 6b:** exit 0, overlap 0, partly shown 0, no empty stretch over 0.25 s, first and last frames non-empty, still ending PASS, sync 0 late.
8. **Stills to render:** Flagg rough cut 2 162.4 to 164.0 s (the fragment, before); Big Toothy Grins 6b at 27.7, 34.0, 70.5, 90.1 and 146.2 s (each word should vanish rather than sit cut at the edge).
9. **Not checked:** `type_rules_check.mjs` does not include this rule; the join's gate and provenance report it.

## 6. Files and cleanup

1. Engine: `composition.mjs` (crowded 4; static partly-on-screen rule), `build_song.mjs` (its gate), `viewer.html` (blur samples), `type_rules_check.mjs` (outline detection), `KIT.md`.
2. Rough cut 6 is left in place. Rough cut 6b holds copies of its sections, about the same size on disk. Rough cut 6 could go once 6b is accepted (not deleted; your call).
3. My scratch files are deleted.

## 8. Render check of rough cut 6b: ARE and the sideways HE (rough cut 6c)

1. **ARE at 34 s (w2024): why it was small.** It slides out from behind HANDS' edge past a clip plane. The size pass never grew a word with a clip plane, so it was marked for dropping. Dropping it left 34.0 to 34.4 s empty (HANDS is hidden there for item 5), so the empty-screen undo brought it back at 8.7% of frame height. Your 5.6% was likely read from the downscaled tiles; the scene measures 8.7%.
2. **Why it seemed missing from the failure list:** it was not missing from the latest list. It was added as w2024 ARE 8.7% at 34.00 s when 6b was re-joined for item 5 (22 failures). The earlier 21-failure list was made before that re-join.
3. **Engine fix:** a word entering past a clip plane is now grown, with its slide scaled by the same factor. A growth is kept only if the word still starts wholly behind the plane and is wholly past it when the clip ends, plus the usual overlap and shown-whole checks. Hinge words are still not grown. In 6c, ARE is grown ×1.60 from its bottom edge to 13.9%. Its slide grows from 135 to 216 units, so it still emerges from behind HANDS.
4. **The sideways HE at 40.4 to 40.8 s (w3003):** its settled cap height is 13.9% of frame height, at or above 13.5%, so it was not changed. It is a slide (rail) entrance, not a flip, and it is not mirrored. The word is turned 90°: it reads top to bottom, so its 13.9% cap height runs across the screen and the word stands only about 10% tall. Type rule 1 measures cap height, so it passes. Making it fail needs a rule decision: drop a sideways non-important word, or measure a sideways word by its height on screen.
5. **Rough cut 6c** (`engine output/Rough cut 6c - 22 November`, re-joined with `--skip-build` from 6b's sections): exit 0. Overlap 0, partly shown 0, static partly on screen 0, no empty stretch over 0.25 s, first and last frames non-empty, still ending PASS, sync 0 late. 81 grown (74 in 6b), 37 dropped. Type rules check: 20 failures, all rule 1 (22 in 6b). ARE and ANT are no longer on the list; ANT now grows ×1.05.
6. **Stills to render from 6c:** 33.5 to 34.6 s (ARE grown, sliding out from behind HANDS), 89.7 to 90.0 s (ANT), 40.3 to 40.9 s (the sideways HE, unchanged).
