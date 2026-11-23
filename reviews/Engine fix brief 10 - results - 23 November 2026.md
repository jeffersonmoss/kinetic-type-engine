# Engine fix brief 10: results (23 November 2026)

Builder: the T2 engine chat (Claude, Opus 5.5). Nothing was rendered. No section was rebuilt. The real team artwork (item 38) is in, on Jefferson's order.

## 1. Necessity drops of keywords: room check (item 37)

Room: a placement on the word's own plaque plane, same orientation, letters at least the size minimum (13.5% with room, 9.0% crowded, plus a 3% margin) where it is sung, centre within 3 of its widths and heights of its planned spot, whole in frame over the shown-whole window (its appearance through its onset, at least the shown frames), overlapping no other word over its life (size-drop ghosts counted), and not static and partly on screen at its onset. A word put back enters as a pop.

| Word | Time | Had room | Result |
|---|---|---|---|
| w09 THAT'S | 12.95 s | yes | put back, grown x1.75 |
| w2026 YOU | 35.64 s | yes | put back, grown x1.89 |
| w4003 YOU | 53.68 s | yes | put back, grown x1.64 |
| w4009 GETS | 55.52 s | yes | put back, grown x1.54 |
| w4015 YOU | 57.79 s | no | not dropped in the end: dropping it left frames 1728 to 1741 empty, so it is shown and swelled to the minimum there |
| w5011 SETS | 74.32 s | not dropped | shown from 74.13 s, right of THREE (see 1.2) |
| w5014 HE | 75.91 s | yes | put back, grown x1.97 |
| w6001 ONE | 89.24 s | yes | put back, grown x1.84 |
| w6008 GONE | 91.12 s | not dropped | shown, still small (Type rule 1 failure, 9.3%) |
| w6057 WHOLE | 107.92 s | no | not dropped in the end: shown small (5.6%) because dropping it left an empty stretch; held for the section 6 rebuild |
| w6058 PACK | 108.19 s | yes | put back, grown x2.88 |
| w6059 HOWLS | 108.46 s | yes | put back, grown x1.04 |
| w7009 THAT'S | 115.67 s | no | not dropped in the end: shown and swelled to the minimum (empty-stretch fill); held for a rebuild if that is not enough |
| w9012 BOTH | 150.27 s | yes | put back, grown x2.53 |
| w9025 RIGHT | 156.39 s | yes | put back, grown x1.83 |
| w9026 BACK | 156.65 s | yes | put back, grown x2.19 |
| w9029 IT'S | 158.01 s | yes | put back, grown x3.31 |
| w10016 WE | 169.58 s | yes | put back in its planned spot, grown x2.18 |
| w10017 CIRCLE | 169.74 s | not dropped | slid 0.75 of its width so it is whole at its onset, as in 6e |

1. Of the 7 necessity drops in 6e, 6 are put back (THAT'S, SETS, HE, ONE, BOTH, WE) and GONE is shown small. 6f has 0 keyword necessity drops; the Type rules check lists none.
2. **SETS (74.3 s):** it was not put back by the room check; it was never dropped this time. The size pass had dropped it for a short later hold (74.73 s on) where it is 10%. New rule: a short hold that starts after the onset no longer counts as focused when the hold containing the onset already meets the minimum. SETS now shows with ALL THREE, right of THREE, from 74.13 s to the end of the section. It is still 10% in that later hold, a Type rule 1 failure for the rebuild. Nothing else in section 5 changed for this.
3. **The gate:** after every pass, the join reruns the room check on a copy; a keyword dropped by necessity that still has room fails the join ("ROOM FOR A DROPPED KEYWORD"). 6f passes it.
4. **Unseen risk:** 13 words are put back, several of them pronouns, grown up to x3.31 and entering as pops. The gates pass (overlap, shown whole, static partials, empty), but none has been seen. Check them in the render.
5. Two faults I hit and fixed on the way:
   1. The first 6f join failed (WHOLE partly shown): the check tested the frames from appearance through onset, and WHOLE appears after its onset, so it tested none. It now uses the shown-whole gate's window.
   2. A first put-back pass ran before the static-partial slides; WE took the spot CIRCLE needed and CIRCLE was dropped. The room check now runs only after the static-partial hides.

## 2. Outcome of the re-join

1. Big Toothy Grins `engine output/Rough cut 6f - 23 November` re-joined with `--skip-build`. It exits 0, every gate passes.
2. Type rules check: 15 failures, all rule 1 (6e: 22). Necessity drops: 0 (6e: 7).

## 3. Real team artwork (item 38)

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
6. KIT Type rule 4 already reads "Team names and logos use the team's real wordmark or logo", so it matches. Correction: earlier in this chat I said rule 4 says "never the real artwork"; it does not.
7. Unseen: the real wordmarks' letter sizes after the wordmark sizing pass, and how they look on their backgrounds.

## 4. Items 33 to 36

Correction: my first reply called these items 13 to 16; they are 33 to 36.

1. **Item 33, TODAY:** the report was wrong, not the render. The fly-through pass ran before the fills; a fill then changed the camera near 154 s and kept TODAY on. The pass now runs again after the fills, and the report marks any hide a later fill undid ("UNDONE later on 4 of its frames"). Correction to my brief 9 results: only DAY's hide was in effect in 6e.
2. **Item 34, ghost at 126.00 s:** hidden. It was GRINS's blue block; the camera passes through the plaque at frames 3780 to 3781. New rule: a word is hidden on frames where the camera goes through its box. It also hides ARC at 3057 to 3059 (101.9 s). The engine's near clip now matches the viewer (20 units).
3. **Item 35, slow swell releases:** releases now try 12, 8 and 6 frames, to the square root of the swell and then to rest, steered about points of the box if needed. In the final 6f only 2 swells are x2 or more:
   1. AND (23.2 s): over 6 frames to rest.
   2. THAT (109.2 s): still drops back in 3 frames; every slower or steered release overlaps a neighbour (62 refusals).
   3. IT'S and PACK are no longer swelled: item 37 puts them back at full size (x3.31 and x2.88), so the earlier releases for them are gone.
4. **Item 36, WE at 17.93 s:** not done. The lone-sideways rule is unchanged (still a report).

## 5. Not done

1. Nothing rendered.
2. THAT's release (4.3.2) and WE at 17.93 s (4.4).
3. 15 rule 1 failures; only section rebuilds clear them. Section rebuilds remain held.
4. Brief 9 item 27 (a lone sideways word failing the join) still waits on Jefferson.

## 6. Stills

1. 74.0 to 75.5 s: ALL THREE SETS.
2. 12.9 to 13.6 s, 35.5 to 36.0 s, 53.6 to 54.1 s, 55.4 to 55.9 s, 75.8 to 76.3 s, 89.1 to 89.6 s, 107.8 to 108.9 s, 150.2 to 150.7 s, 156.3 to 157.0 s, 157.9 to 158.5 s, 169.5 to 170.0 s: the 13 words put back.
3. 0.0 to 8.9 s: intro with the real badges.
4. WOLVES moments (for example 120.3 to 121.1 s) and PORTLAND (129.3 to 130.1 s): real wordmarks.
5. 125.9 to 126.1 s (GRINS) and 101.8 to 102.0 s (ARC): hides.
6. 23.2 to 23.7 s: AND's 6-frame release.
7. 169.6 to 171.3 s: CIRCLE then IN, as in 6e.

## 7. Files and cleanup

1. Engine: `composition.mjs`, `build_song.mjs`, `KIT.md` (brief 8 section: room check, focused hold, real artwork). The working copy of KIT.md also has an uncommitted change to Type rule 3 (a sentence on numerals as scores or jersey numbers) that I did not make; I left it out of my commit and did not touch it.
2. Song input (not in git): `song settings.json` points at the real files; new files listed in 3.
3. 6f: the stale `Whole song - earlier final, before a failed join - scene.json` (the 6f scene before items 37 and 38) is deleted (restorable for 7 days). Rough cuts 6c to 6e left in place.
4. My temp folder is deleted.
