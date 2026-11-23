# Engine fix brief 10: results (23 November 2026)

Builder: the T2 engine chat (Claude, Opus 5.5). Nothing was rendered. No section was rebuilt. The real team artwork (item 38) is in, on Jefferson's order.

## 1. Necessity drops of keywords (items 37 and 39)

Room: a placement on the word's own plaque plane, same orientation, letters at least the size minimum (13.5% with room, 9.0% crowded, plus a 3% margin) where it is sung, centre within 3 of its widths and heights of its planned spot, whole in frame over the shown-whole window (its appearance through its onset, at least the shown frames), overlapping no other word over its life (size-drop ghosts counted), and not static and partly on screen at its onset. A word put back enters as a pop.

Final 6f, with the Opus keyword marks merged (item 43). 0 keywords are dropped by necessity; 9 were put back.

| Word | Time | Had room | Result |
|---|---|---|---|
| w09 THAT'S | 12.95 s | n/a | now a filler (Opus marks), dropped as a filler |
| w2026 YOU | 35.64 s | yes | put back, grown x1.89 |
| w4003 YOU | 53.68 s | yes | put back, grown x1.64 |
| w4009 GETS | 55.52 s | yes | put back, grown x1.54 |
| w4015 YOU | 57.79 s | no | shown anyway: dropping it left frames 1728 to 1741 empty, so it is swelled to the minimum there |
| w5011 SETS | 74.32 s | not dropped | shown from 74.13 s to the end of section 5, right of THREE |
| w5014 HE | 75.91 s | yes | put back, grown x1.97 |
| w6001 ONE | 89.24 s | yes | put back, grown x1.84 |
| w6008 GONE | 91.12 s | not dropped | shown from 91.0 s, letters 44% at its onset (item 39) |
| w6057 WHOLE | 107.92 s | n/a | now a filler, shown small |
| w6058 PACK | 108.19 s | yes | put back, grown x2.88 |
| w6059 HOWLS | 108.46 s | yes | put back, grown x1.04 |
| w7009 THAT'S | 115.67 s | n/a | now a filler, shown and swelled |
| w9012 BOTH | 150.27 s | yes | put back, grown x2.53 |
| w9025 RIGHT, w9026 BACK, w9029 IT'S | 156 to 158 s | n/a | RIGHT and IT'S are now fillers; BACK is shown; none needed putting back |
| w10016 WE | 169.58 s | yes | put back in its planned spot, grown x2.18 |
| w10017 CIRCLE | 169.74 s | not dropped | slid 0.75 of its width, whole at its onset, as in 6e |

1. **SETS (74.3 s):** never dropped this time. The size pass had dropped it for a short later hold (from 74.73 s) where it is 10%. New rule: a short hold that starts after the onset no longer counts as focused when the hold containing the onset already meets the minimum. Nothing else in section 5 changed. It is still 10% in that later hold (a Type rule 1 failure).
2. **GONE (91.1 s, item 39): back without touching section 6.** It now reads YOU UP HE GONE from 91.0 to 91.4 s, then stays as the camera pulls back.
   1. **Why our tests missed it in 6e:** the size pass judged GONE by its next hold (from 91.5 s), where it is 9.3% and could not grow without an overlap, and dropped the whole word, although at its onset it filled 44% of the frame height. A keyword dropped by necessity was reported, not failed (Type rule 2 as amended), so no gate stopped it. The empty-screen gate did not fire because YOU UP HE were on screen. Nothing measured a word that would fit at its onset.
   2. **The item 37 gate catches it:** run on the 6e final scene, the room check finds room for all 7 of 6e's drops, GONE among them ("in its planned spot, letters 44.2%"), so the join would fail.
3. **The gate (item 37):** after every pass, the join reruns the room check on a copy; a keyword dropped by necessity that still has room fails the join. 6f passes.
4. **Drop review gate (item 44):** `Keyword drops for review.json` is written beside the final scene; 6f lists 0 drops, so there is nothing to review and the final scene is written. With drops, the join fails until `Keyword drop review.json` approves each one.
5. **Unseen risk:** the 9 put-back words are grown up to x2.88 and enter as pops. The gates pass, but none has been seen.
6. Faults I hit and fixed on the way:
   1. The room check tested no frames for WHOLE (it appears after its onset); it now uses the shown-whole gate's window.
   2. An early put-back of WE took CIRCLE's slide; the room check now runs only after the static-partial hides.
   3. After the Opus marks, the hold-hide partner rule stopped seeing pronouns (it read the classifier's reason text) and SETS and GONE flickered off for a hold. Pronouns are now flagged on the word.

## 2. Outcome of the re-join

1. Big Toothy Grins `engine output/Rough cut 6f - 23 November` re-joined with `--skip-build`. It exits 0; every gate passes, including the room and drop-review gates.
2. Type rules check: 18 failures, all rule 1 (6e: 22). Necessity drops: 0 (6e: 7). Two fixes to the check itself: the song's team colours count as allowed text colours, and words are matched to the song map by index (so TR3Y counts as the map's TREY).

## 3. Items 40 to 47

1. **Item 40, the 34 at 142.75 s:** bulb digits (classified as a score: "talkin'" before it).
2. **Item 41, numeral routing:** every word drawn as digits is judged a score or a jersey number. Jersey: "number", "no.", "#", "wearing" or "jersey" beside it, or a player name beside it. Otherwise a score or stat (the common case in a game song), with the reason reported. Override: `word_overrides` `{ numeral: "score" | "jersey" }` (or the older `score: true`). In this song both numerals (43, 34) are scores; no jersey numbers occur, so the jersey path is untested on real data.
3. **Item 42, TR3Y:** `word_overrides` 366 `display: "TR3Y"`. Font (anton), box and position are unchanged; only the letters differ.
4. **Item 43, Opus keyword marks:** merged from `Keyword marks - Opus pass - 23 November 2026.json`: 395 of 395 words, 27 differ from the classifier (for example THAT'S, IT'S and WHOLE become fillers; ALWAYS, THERE and UP become keywords). Existing keys (92 score, 366 name false) are kept. New tool `keyword_marks.mjs`: `prompt` writes the marking agent's prompt, `merge` merges a marks file. A copy of the song settings from before the merge was kept until this pass ended, then deleted with my temp folder.
5. **Item 44:** see 1.4.
6. **Item 45:** KIT.md section "Engine fix brief 10, items 39 to 47" (process notes for the marks and the review gate, plus numerals, display override and team colours).
7. **Items 46 and 47, names and jersey numbers in team colours** (on for Big Toothy Grins and every song in progress, per item 46.2 as corrected; a relayed message saying "pinned off for videos in progress" was superseded by the supervisor's correction): song setting `jersey_colours`, default `"block"`: white jersey letters on a block of the darker team colour (#0C2340, navy), with `"letters"` (letters in the team colour that reads best on black, #78BE20 green) and `"off"`. No LaMelo engine song input exists, so no pin was needed. Raise the Flagg gets the default at its next join.
   1. In 6f, 11 of 21 names got the navy block. The other 10 got green letters, because growing the box to block padding would overlap a word or cut it at an edge. **The video therefore mixes the two looks.** A rebuild (held) could plan room for blocks; or the song could choose `"letters"` for all. That is a choice for Jefferson.
   2. Unseen: the navy block on the near-black ground may barely show as a block; the white letters carry it.
8. **KIT.md Type rules:** while I worked, another chat edited rule 3 (it now ends "Jersey numbers follow rule 4.") and rule 4 (adding "white letters on the darker team colour, or letters in team colours"). The brief says the rule 4 wording is pending Jefferson's approval, so I left that hunk uncommitted and did not touch it.

## 3b. Item 48: keyword mode and "shut you down" (Raise the Flagg; checked, not built)

1. **How keyword mode chose words before:** inside a fast stretch it dropped every word on a fixed function-word list (all pronouns, auxiliaries, prepositions, conjunctions), then thinned the remaining words to 0.4 s apart, keeping the higher-ranked (name or number, then line-end rhyme word, then the rest). It never consulted the keyword flags. On the Flagg map that dropped 82 words in 4 stretches: 50 as function words and 32 by the spacing. YOU in all three "shut you down" lines went as a function word, and the first DOWN went by the spacing.
2. **Now:** keyword mode drops only fillers, by the same flags as everything else (Opus marks through word_overrides, else the classifier); the spacing step is removed. The classifier also keeps a particle right after an object pronoun (DOWN after YOU), which the spacing had kept only by chance in two of the three lines.
3. **Check on the Flagg map:** all three "shut you down" lines (55.70 s, 107.80 s, 146.74 s) keep SHUT, YOU and DOWN. Keyword mode now drops 36 words there, all fillers. Flagg was not built; its next join will change.
4. Big Toothy Grins has no fast stretches, so 6f is unchanged (the re-join gives a byte-identical final scene).

## 4. Items 33 to 36

Correction: my first reply called these items 13 to 16; they are 33 to 36.

1. **Item 33, TODAY:** the report was wrong, not the render. The fly-through pass ran before the fills; a fill then changed the camera near 154 s and kept TODAY on. The pass now runs again after the fills, and the report marks any hide a later fill undid ("UNDONE later on 4 of its frames"). Correction to my brief 9 results: only DAY's hide was in effect in 6e.
2. **Item 34, ghost at 126.00 s:** hidden. It was GRINS's blue block; the camera passes through the plaque at frames 3780 to 3781. New rule: a word is hidden on frames where the camera goes through its box. It also hides ARC at 3057 to 3059 (101.9 s). The engine's near clip now matches the viewer (20 units).
3. **Item 35, slow swell releases:** releases now try 12, 8 and 6 frames, to the square root of the swell and then to rest, steered about points of the box if needed. In the final 6f:
   1. AND (23.2 s): over 6 frames to rest.
   2. IT'S (157.8 s): over 12 frames to x1.83.
   3. THAT (109.2 s): still drops back in 3 frames; every slower or steered release overlaps a neighbour (62 refusals).
4. **Item 36, WE at 17.93 s:** not done. The lone-sideways rule is unchanged (still a report).

## 5. Real team artwork (item 38)

1. Intro: `Timberwolves logo - masked badge.png` then `Timberwolves logo - front stare.png`, the same files, boxes and timing as rough cut 5 (dissolve at 4.1 s over 0.6 s). Checked by content hash in the 6f scene.
2. WOLVES (7 words): `WOLVES wordmark - real Timberwolves wordmark - transparent.png`, made from the Wikimedia Commons original (`File:Minnesota_Timberwolves_wordmark.gif`, public domain), kept beside it. Green background kept.
3. PORTLAND (1 word): `PORTLAND wordmark - real Trail Blazers lettering cropped from the team logo.png`, cropped from the real team logo SVG (copied out as `Trail Blazers logo - real team logo.svg`; the tracing-reference folder is left as is). Commons' Blazers wordmark reads BLAZERS, so it was not used. Red edge kept; `letter_share` now comes from the image's transparent margins.
4. Sources: `engine input/Real team artwork - sources - 23 November 2026.md`.
5. Imitation files kept, unused:
   1. `WOLVES wordmark - our imitation - navy on transparent.png` and `.svg`
   2. `WOLVES wordmark - current jersey lettering - navy on transparent.png`
   3. `PORTLAND wordmark - our imitation.png` and `.svg`
   4. `Wolf badge - our imitation - front stare.png` and `.svg`
   5. `Wolf badge - our imitation - howling.png` and `.svg`
   6. `Our imitation artwork - generator scripts/`
6. Correction: earlier in this chat I said KIT Type rule 4 says "never the real artwork"; it never did.
7. Unseen: the real wordmarks' letter sizes after the sizing pass, and how they look on their backgrounds.

## 6. Not done

1. Nothing rendered.
2. THAT's release (4.3.3) and WE at 17.93 s (4.4).
3. 18 rule 1 failures; only section rebuilds clear them. Section rebuilds remain held.
4. Brief 9 item 27 (a lone sideways word failing the join) still waits on Jefferson.
5. The mixed block and letters look for names (3.7.1) needs his choice.

## 7. Stills

1. 74.0 to 75.5 s: ALL THREE SETS.
2. 90.9 to 91.6 s: YOU UP HE GONE.
3. 142.6 to 143.2 s: the 34 in bulb digits.
4. 159.2 to 159.8 s: TR3Y.
5. Names in team colours, both looks: 30.5 s (MCDANIELS, block), 29.1 s (JADEN'S, letters), 147.3 s (BONES, block), 148.3 s (TREY, letters).
6. The put-back words: 35.5 to 36.0 s, 53.6 to 54.1 s, 55.4 to 55.9 s, 75.8 to 76.3 s, 89.1 to 89.6 s, 108.1 to 108.9 s, 150.2 to 150.7 s, 169.5 to 170.0 s.
7. 0.0 to 8.9 s: intro with the real badges; WOLVES (for example 120.3 to 121.1 s) and PORTLAND (129.3 to 130.1 s).
8. 125.9 to 126.1 s (GRINS) and 101.8 to 102.0 s (ARC): hides. 23.2 to 23.7 s (AND) and 157.6 to 159.2 s (IT'S): releases.

## 8. Files and cleanup

1. Engine: `composition.mjs`, `build_song.mjs`, `word_roles.mjs`, `keywords.mjs`, `type_rules_check.mjs`, new `keyword_marks.mjs`, `KIT.md` (new section). KIT line 192 (rule 3) committed as is, as told (cf4061b). Line 193 (rule 4), edited by the other chat, is left uncommitted: its wording is pending Jefferson.
2. Song input (not in git): `song settings.json` (real artwork, keyword marks merged, 366 display TR3Y).
3. 6f: `Keyword drops for review.json` (empty list). The stale pre-item-37 scene was deleted earlier (restorable for 7 days). Rough cuts 6c to 6e left in place.
4. My temp folder is deleted.
