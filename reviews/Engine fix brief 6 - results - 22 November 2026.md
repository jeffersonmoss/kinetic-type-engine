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

All 21 failures are rule 1 (letters too small). None is unexplained. Full list: `Big Toothy Grins Music Video/engine output/Rough cut 6b - 22 November/Type rules check - 22 November 2026.md`.

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

## 6. Files and cleanup

1. Engine: `composition.mjs` (crowded 4), `viewer.html` (blur samples), `type_rules_check.mjs` (outline detection), `KIT.md`.
2. Rough cut 6 is left in place. Rough cut 6b holds copies of its sections, about the same size on disk. Rough cut 6 could go once 6b is accepted (not deleted; your call).
3. My scratch files are deleted.
