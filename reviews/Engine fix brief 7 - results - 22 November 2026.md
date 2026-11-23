# Engine fix brief 7: results (22 November 2026)

Builder: the T2 engine chat (Claude, Opus 5.5). Nothing was rendered; stills to check are in part 9. This pass also carries the queued 6c items (ARE at 34 s, HE at 40.5 s; brief 6 results part 8).

## 1. Outcome first

1. Big Toothy Grins `engine output/Rough cut 6c - 22 November` was re-joined once more with `--skip-build` (same sections as 6b) and overwritten. It exits 0.
   1. Overlap 0 (now scanned with stamps and sung pulses at their peak), partly shown 0, static partly on screen 0.
   2. No empty stretch over 0.25 s, with undersized-only frames now counted as empty. First and last frames non-empty. Still ending PASS, sync 0 late.
2. Type rules check on 6c: **22 failures, all rule 1** (20 before this pass). Rule 2 now reports 8 necessity drops instead of failing them (part 3). Report: `Big Toothy Grins Music Video/engine output/Rough cut 6c - 22 November/Type rules check - 22 November 2026.md`.
3. **Not fully done:**
   1. GONE (91.1 s) is still dropped, "by necessity": its only overlap partners are keywords (YOU, UP, HE), so the make-room rule cannot free space. It is in section 6, which is not rebuilt (part 7).
   2. The swell fill (item 3) clears the empty stretches, but the swollen words are back to their small size for the rest of their hold, so the Type rules check still lists them. It is a fill, not a size fix.
   3. Item 6: two of Fable's four cases (TALKIN' 138.0 s, TRIED 93.0 s) are not static in the scene; see part 4.
   4. Item 9 (single display tokens) is proposed only (part 6).
   5. Round-letter fix, bulb digits and the stamp and pulse peak changes are in the viewer and unverified until a render.
4. My commit b261eeb accidentally included the supervisor's KIT.md Type rules edits. They are unchanged since; I did not edit that section in this pass.

## 2. Blocking items 1 to 3

1. **Item 1, clipped words mid-frame (DOES 84.6 to 86.0 s).** The visible share now counts clip planes and cover by other plaques' panel occluders (a ray test). DOES was 56% visible behind folded panel p508. In 6c the size pass resolved the line differently: DOES (an auxiliary, a filler) was dropped to make room for the keyword HE, which grew x2.33. The line now reads HE MAKE YOU KIND OF NERVOUS (KIND and YOU kept, both dropped in 6b). A word that never finishes entering past a clip plane is handled by the brief 6 clip-entrance rule (grow with scaled slide, else dropped).
2. **Item 2 / 19 / 21, keywords by sense.** One classifier (`word_roles.mjs`) serves the grey rule, the size pass and keyword mode. Order: song-input override; names and numbers; pronouns; a preposition ending its clause; the line-end rhyme word; stressed (accent, or capitals in the map); fillers; everything else is a content word and a keyword. In the size pass a keyword that cannot grow first tries hiding its overlapping fillers; only then is it dropped, logged "dropped by necessity" with the reason.
   1. **Keywords 6b dropped that 6c keeps: 11.** MISS 36.5 s, GETS 55.5 s, HE 84.7 s, YOU 85.3 s, KIND 85.7 s, HE 87.0 s, WHOLE 107.9 s, PACK 108.2 s, HE'S 135.8 s, NOT 141.2 s, MEN 149.4 s.
   2. **Still dropped, by necessity: 7 from 6b plus IN 170.4 s:** THAT'S 13.0 s, SETS 74.3 s, HE 75.9 s, ONE 89.2 s, GONE 91.1 s, BOTH 150.3 s, WE 169.6 s, IN 170.4 s (static at the frame edge, no slide makes it whole).
3. **Item 3, undersized-only frames are empty.** A frame whose readable words are all under that frame's minimum (x0.97) is empty. The existing fills could not clear 9 such stretches, so a sixth fill, the **swell**, scales the small words up to the minimum for the stretch (3 frames up, back down by its end or as the next word arrives, at most x3.5). It is kept only with no new overlap frames, partial or static partial. 9 swells in 6c:
   1. 23.2 s AND x3.48
   2. 35.2 s YOU x3.47
   3. 57.6 s YOU x1.69
   4. 100.2 s OR x1.51
   5. 108.2 s PACK x2.50
   6. 109.2 s THAT x2.27
   7. 115.6 s THAT'S x1.68, THE x1.97 (handing off)
   8. 147.1 s BONES x1.33
   9. 157.7 s IT'S x3.34, TREY x1.47

   A swell of x3.5 over a third of a second is a visible pulse; please judge it in the render.

## 3. Polish items 4 to 8

1. **Item 4, zoom entrances:** 146 zoom entrances now start at no less than half the size minimum with room (6.75% of frame height) instead of x0.1. Kept only with no new overlap.
2. **Item 5, edge-on:** a word within 20° of edge-on to the camera is unreadable while the camera is still, so it is hidden outside its focus window. The IN plaque at 65.3 to 66.1 s (15.5°) is hidden. 10 other new hides, the largest WE ATTACK 25.7 to 26.4 s and WOLVES! 170.4 to 171.4 s. Focus words shown unreadable (reported, not hidden) rose from 1 to 2: THREE and TO.
3. **Item 7, pulse peak:** the overlap scan now uses the drawn size: the stamp landing (1.1) and the sung-pulse throw (1.18). It found 18 new collisions: 16 stamp landings of one or two frames, and 2 from growth and a slide (fixed by part 3.5). A new rule lowers a colliding stamp to 1.05, then switches it off, and a colliding pulse to 1.12, 1.06, then drops it: 14 changes in 6c. PACK over OF A at 167.2 s: OF and A are retired under PACK by the existing repair, so it no longer collides.
4. **Item 8, hold partners:** when the size pass hides a word for a hold, the neighbour that leans on it is hidden too. HIM hidden with GIVE 141.5 to 142.0 s; HIS hidden with IT'S 39.2 to 39.5 s. WHEN stays hidden while HE'S shows at 136.1 to 136.9 s (HE'S is in focus, and showing WHEN would overlap). "Guard him tight" at 83.6 s: GUARD and THE are still under size there (Type check items 4 and 5); the order problem needs section 5 rebuilt.
5. **Overlap is now measured in frames** for growth, slides, fills and swells, with overlap involving the moved word weighted first. Counting intervals let WE grow into CIRCLE (21.8 s) and TREY slide onto FOR and A.

## 4. Item 6, static partials Fable saw

1. **TREY 148.6 s and WATCHING TAPE 79.4 s:** missed for two reasons, now fixed.
   1. The letter band ignored ink outside the cap height. TREY's band was in frame, but its jersey stroke and overshoot were cut. The band now adds 3% overshoot, plus half the bold stroke on jersey words. TREY is now hidden 148.9 to 149.5 s.
   2. The stillness test used a centred difference, which missed a camera pausing 3 or 4 frames mid-sweep (TAPE at 58%). It now compares with the frame before, and 3 still frames count (was 4). TAPE is now hidden at 79.6 to 79.8 s.
2. **TALKIN' at about 138.0 s:** in the scene it is 14% on screen for 4 frames, settling for only 2 before it is hidden. Not caught at 3 frames. Lowering the threshold to 2 would also catch ordinary camera arrivals.
3. **TRIED at about 93.0 s:** hidden in the scene from 92.4 to 93.2 s; it is partly on screen only while the camera sweeps (93.2 to 93.4 s). Not static, so out of scope for this rule.
4. **The blue AND plaque at 79.4 s:** no AND is drawn near the frame at 79.4 s in the scene. I could not match it without a still.

## 5. Raise the Flagg rough cut 3 (items 10 to 12, check only)

1. **Item 10:** the static gate did set exit 1 on RAISE, but the join still wrote `Whole song - final - scene.json`, which the render used. Now a failing gate writes no final scene: the scene goes to `Whole song - FAILED GATES - not for render - scene.json`, any earlier final scene is renamed, the provenance report starts its render section with "GATES FAILED", and the exit is 1.
2. **Item 11:** the gate did handle top and bottom edges; it missed the word because of the ink band (part 4.1.1). The word is FLAGG! (w12040, jersey font), whose cap band sat just past the top edge while its bold stroke showed. With today's engine the gate finds FLAGG! at 162.6 to 163.4 s (4% on screen), FLAGG! at 117.3 s, LEAD at 85.4 s, plus RAISE 90.3 s and MAINE 13.6 s as before.
3. **Item 12:** no section passing at N 200 is expected, and it is not caused by the new Type rules. Rough cut 1, built before them, also had 0 passing in 11 of 12 sections. The checks that fail in all or nearly all candidates are older timing checks:
   1. 13.1.13 protected reading (200/200 in most sections);
   2. 13.1.7 floors and stillness (landing still for 8 frames, transit and pivot floors);
   3. 13.1.1 readable anchor.

   Readable size (13.1.20) fails in 12 to 177 of 200, never all. With about 3 sung words a second, every landing cannot be still for 8 frames and keep every reading window protected. To fix it, scale those floors by lyric density per section (or by `fast_words`), or rank them by severity rather than pass or fail in fast sections. Big Toothy Grins shows the same pattern.

## 6. Item 9, single display tokens (proposed, not done)

1. "and right off of the bench": make `OFF OF THE` one display token, or `RIGHT OFF` and `OF THE BENCH`, so it is sized as one unit rather than dropped.
2. "It's TREY up for a TREY": make `UP FOR A TREY` one token; that TREY is the shot (word 366, now `name: false`).
3. Both need section 8 and section 9 rebuilt, and the song map and song.json edited in both `engine input/` and `analysis/`. Not done; section 9 is on the no-rebuild list.

## 7. Sections 9, 6, 5 and 2 (not rebuilt)

1. **Section 9, Bones and Trey (147.3 to 160.4 s):** 11 rule 1 failures. BONES 10.5%; RIGHT BACK TO at 4 to 7%; TREY 9.5%; UP FOR at 9 to 10%. BOTH dropped. The camera holds these lines far away, so only a new layout can make them large. A rebuild would place RIGHT BACK TO LYLES and IT'S TREY UP FOR A TREY on larger plaques, with item 9's tokens. Screenshot 147.2 to 148.2, 155.5 to 160.4 s.
2. **Section 6, Ant, one fake (89.2 to 111.7 s):** GONE and ONE dropped; THE 4 to 6% and WHOLE 5.6% at 107.4 to 109.0 s; AND 6.2% at 109.3 s (THAT swells there). A rebuild would give YOU UP HE GONE one plaque with room for GONE, and THE WHOLE PACK HOWLS a single line. Screenshot 89.2 to 91.6, 107.4 to 110.4 s.
3. **Section 5, Ant, watching tape (71.4 to 89.2 s):** SETS and HE dropped (74.3, 75.9 s); "guard him tight" order (THE HIM / GUARD TIGHT, 83.6 s), GUARD 10.3% and THE 11.8%. A rebuild would keep WITH THE PACK off GUARD's plaque. Screenshot 74.0 to 76.2, 83.4 to 87.0 s.
4. **Section 2, Jaden and Rudy:** no Type rule failure left. MISS is kept now, and YOU at 35.2 s swells to size. A rebuild would show "you shoot, you miss" without the doubled YOU. Screenshot 35.0 to 37.4 s.

## 8. Names, scores, teams, colours (items 13 to 24)

1. **Scores (item 13):** `word_overrides {"92": {"score": true}}` marks 43 (49.3 s) as a score. The viewer draws it as bulb digits: seven-segment shapes of bulbs, lit orange-red with a wider glow, unlit bulbs completing the 8 in dim dark grey. Not detected automatically. Other numbers in the lyrics:
   1. 34 at 142.75 s ("thirty-FOUR") is still a jersey numeral; I could not tell whether it is a score. (q3)
   2. FIFTEEN out of SIXTEEN is a stat, so I left it as words.
2. **Player names (item 14):** every `player_names` word is set in the jersey font and never grey. In 6c, 3 grey names were made cream: GOBERT! 39.5 s, DOSUNMU 44.1 s, TREY 148.3 s.
3. **Keywords never grey (item 18):** 37 grey keywords were made cream in 6c.
4. **Team names (items 15, 22):**
   1. WOLVES and WOLVES! appear 7 times, all drawn with our imitation WOLVES wordmark image: 16.8, 25.7, 70.5, 119.4, 128.3, 168.1 and 177.0 s.
   2. PORTLAND at 129.5 s is drawn with our imitation Blazers-style wordmark (red, black, white).
   3. TIMBERWOLVES appears only in the title. DENVER is in plain type, as a city. Should it be a team wordmark? (q4)
5. **Names by meaning (item 23):** `word_overrides {"366": {"name": false}}`. TREY at word 362 is the player (jersey font). TREY at word 366 is the shot: it is set in anton, kept at the jersey box width, so its layout is unchanged. Other name matches that may not be names:
   1. Raise the Flagg's "Raise the Flagg" (a flag pun on the name; 14 instances).
   2. "the Maine Event" (MAINE is a state).
   3. In Big Toothy Grins, none besides TREY.
   4. Numbers that are not jersey numbers ("number one", "a three", "two men", "all three sets") are keywords but not set as jersey numerals unless written in digits.
6. **Our imitation artwork (item 24):** the howling badge, the front-stare wolf, WOLVES and PORTLAND are new imitations by an Opus delegate, saved in `engine input/` as SVG and PNG. The song input uses them, and 6c embeds exactly these four images (checked by size). The real files remain in `engine input/` unused. The delegate also copied them into a `Real team artwork - tracing reference only, never rendered` folder and added a generator-scripts folder, neither requested; your call whether to keep them.

## 9. Proposed Type rules wording (old text, new text, one line each)

1. **Scores (exception to rule 3).**
   1. Old: "3. Letters are one solid colour, with no outlines: cream, white, flat grey at 75% or 50%, or a team colour. Keywords (...) are never grey. ..."
   2. New, added at the end of rule 3: "Scores are drawn as scoreboard bulb digits: lit bulbs orange-red, unlit bulbs dim dark grey."
   3. Change: a number marked as a score is exempt from the letter colour list and drawn as bulbs.
2. **Player names never grey, always the jersey font (rule 4).**
   1. Old: "4. Player names and jersey numbers use a bold jersey font."
   2. New: "4. Player names and jersey numbers use a bold jersey font and are never grey. A name used in another sense is not a name."
   3. Change: makes the grey ban and the name-by-meaning override part of the rule.
3. **Team names, the wordmark (rule 4):** the current text ("Team names and logos are our own close imitations of the team's wordmark or logo ...") already covers it. No change proposed. KIT line 156 ("ideally the official wordmark") is left for the lamelo chat.
4. **Grey only for de-emphasised words:** covered by the current rule 3 ("Keywords ... are never grey"). No separate wording, per item 18.

## 10. Stills to render from 6c

1. Bulb digits: 48.97 s (43 first frame; it pops in, so this is its entrance), 49.3 s and 50.5 s (at rest). Lit and unlit bulbs are both visible in 4 and 3.
2. Round letters: OH and OUT at 97.6 to 98.4 s; GOES 42.1 s; SO 42.3 s; CLOCKS 71.7 s; GROWL 107.3 s; OUT 139.1 s; GOES 148.6 s.
3. Imitation artwork beside the originals: the intro badge 0 to 4.7 s, the front stare 4.1 to 8.9 s (check the transparent PNG reads on black), WOLVES 16.8, 70.5 and 177.0 s, PORTLAND 129.5 to 130.6 s.
4. Swells: 23.2, 35.2, 108.2, 109.2, 115.6, 157.7 to 159.1 s.
5. Edge-on hide: 65.0 to 66.1 s (the IN plaque should be gone).
6. Static fixes: 79.4 to 79.8 s (TAPE), 148.6 to 149.5 s (TREY), 84.4 to 87.0 s (HE MAKE YOU KIND OF NERVOUS).
7. Hold partners: 141.3 to 142.1 s (GIVE and HIM both hidden).
8. Zoom floor: any zoom, for example HE at 90.6 s.
9. From brief 6, still open: 33.5 to 34.6 s (ARE), 40.3 to 40.9 s (the sideways HE).

## 11. Files and cleanup

1. Engine: `composition.mjs`, `overlap_gate.mjs`, `build_song.mjs`, `word_roles.mjs` (new), `viewer.html`, `type_rules_check.mjs`, `KIT.md` (new section "Engine fix brief 7"; "No word static" section updated; Type rules section untouched).
2. Big Toothy Grins input: `song settings.json` (imitation images, PORTLAND, word_overrides) and the imitation artwork.
3. My scratch files are deleted.
