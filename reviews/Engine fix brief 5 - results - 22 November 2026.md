# Engine fix brief 5: results (22 November 2026)

Builder: the T2 engine chat (Claude, Opus 5.5). Engine: `Kinetic Type Engine/deterministic`, branch `world-canvas`. Nothing was rendered; the stills to render are in part 6.

## 1. Outcome first

1. Big Toothy Grins rough cut 6 is built: `~/Experiments/Big Toothy Grins Music Video/engine output/Rough cut 6 - 22 November/`, exit 0. Gates: overlap 0 (rescanned on the final scene), partly shown 0, no empty stretch over 0.25 s, first and last frames non-empty, still ending PASS, sync 0 late, idle 0.
2. Room for One rebuilt in full (`engine output/Engine fix test 6 - 22 November`, `--reveal-coverage 0.05`). Overlap 0, partly shown 0, no long empty stretch, first and last frames non-empty, still ending PASS. Exit 1 comes only from the two failures it already had: reveal coverage (9.6% against 20%; it was 10.8% in test 5) and the imagined 76ers ring element (10 readable frames).
3. The first full Big Toothy Grins build failed the empty-screen gate at 154.0 to 155.0 s (frames 4621 to 4651). The cause was not the size rule: section 9's new layout put a whip into a hold showing a third of TODAY. I added a fifth fill (part 2, item 7) and re-joined both songs from their built sections. The numbers above are from that re-join.
4. Section 3 of the brief was replaced by "Change 2" (no outlines at all), which arrived mid-pass. The outline-size threshold I had built was removed, and every word is now solid.
5. Addendum (item 26 text and readable-size cost change): the brief's addendum says this is ON HOLD and "NOT approved", but the relayed message called it "approved KIT.md text". I followed the brief file. I had written neither the text nor the cost change, so nothing in KIT.md is marked pending. If the item 26 wording has since been approved, please send the exact text.
6. The song input change (Big Toothy Grins `engine input/song settings.json`: wordmark colours and `player_names`) is in the song's own folder, which has other uncommitted changes from its own chat. I did not commit it.

## 2. What changed in the engine

1. **Size** (`composition.mjs` enforceMinSize, after the lone-word pass). For each camera hold a word is in, its letters are measured at their largest while at rest, at least 95% in frame and readable.
   1. Minimum: `min_word_h` (default 0.092 of frame height) when crowded, and `room_factor` (1.5) times that otherwise.
   2. Crowded: at least `crowded_words` (3) words at least half in frame, or their projected boxes cover at least `crowded_area` (0.30) of the frame.
   3. A word under its minimum is grown to it, up to 2.5 times. It grows about its centre, or about an edge midpoint or corner so it can grow away from a neighbour ("just move over the big word"). The growth is kept only if it adds no projected overlap over the word's life and leaves the word no less shown at onset.
   4. Otherwise it is dropped for its whole life (focus hold), or hidden for a later hold while another word of size stays on screen.
   5. The empty-screen rule outranks it: the fills are tried on a copy first, and any drop or hide inside a stretch they cannot clear is undone.
2. **Dropped words allowed.** Words dropped for size are left out of the shown-whole gates (`sungWords`). The sync check lists them as "dropped (size), allowed", and the idle check does not count them as visible activity. The partly-shown gate is unchanged for shown words.
3. **Colours** (`style.mjs` normalizePalette). Non-team text is cream `#F3EBDD`, white `#FFFFFF`, grey 75% `#BFBFBF` or grey 50% `#808080`; other colours snap to the nearest. Team styles keep their colours. In both songs, grey `#7d7a76` and its panel variant `#96938e` became `#808080`. The viewer's grey style no longer has a built-in white outline.
4. **No outlines** (`composition.mjs` noOutlines; change 2). Outline styles become their solid twins and white edges are removed. Wordmark stroke and accent rings are removed, and the pass runs again after the wordmarks are added. Changed: 15 words in Big Toothy Grins and 32 in Room for One. The 76ers striped jersey words keep their per-letter thickening, which is in each letter's own colour.
5. **Jersey font and bold.**
   1. I checked the font before offsetting, as change 2 asked. Graduate, our jersey face, has a single weight: Google Fonts serves 400, and a request for 700 returns HTTP 400. The thin letters come from the font, not our weight choice.
   2. So jersey words get an outward stroke in their own colour, `jersey_bold` (0.10) × cap wide, so 5% of the cap sits outside each edge. It is mitred (limit 2) to keep the corners square.
   3. `wordBox` adds the same width, so layout and the overlap checks see the drawn letters.
   4. New song setting `player_names`: listed words (possessive 's ignored) take the jersey font, as numerals already did.
6. **Overlap gate** now rescans the final scene as written, after the size, outline and fill passes. Before, it reported the count from the earlier joint repair.
7. **Fill 5: skip a move into an empty hold.** When a camera move lands on a hold with nothing readable, the camera stays on its last filled pose until the next move, and the words on that pose stay on. It is kept on the same terms as the other fills (no new overlap, no new partly shown word, fewer empty frames). It fixed 154.0 to 155.0 s: the whip at frames 4617 to 4625 was skipped, and DID, THEY and TODAY stay on.
8. KIT.md has a new section, "Size, colours, outlines and bold jersey fonts", covering all of the above. The no-outlines entry describes the behaviour plainly and says its rule wording awaits Jefferson's approval.

## 3. Song input (Big Toothy Grins)

1. WOLVES wordmark: the white stroke and green accent are gone. Change 2 offered "navy on lake blue (or green on navy; builder's call)". I measured navy on lake blue at about 2.4:1 contrast without the stroke, so I chose green letters (tint `#78BE20`) on a navy block (`#0C2340`), about 7:1. TIMBERWOLVES uses the same pairing.
2. `player_names`: Jaden, McDaniels, Rudy, Gobert, Ayo, Dosunmu, Melo, Ant, Shannon, Bones, Trey, Lyles.

## 4. H_ref

1. Measured on rough cut 5: the larger HE at 41 s is `w3001`, a horizontal rider in the wide font, shown on frames 1218 to 1226 (40.6 to 40.87 s), just before a cut at 41.0 s. Its cap height is 66 px at 720 (9.2% of frame height). That is H_ref, now the `min_word_h` default of 0.092.
2. The sideways HE (`w3003`, turned −90°, lower right, partly out of frame) measured 59 px. After the cut it is horizontal at 72 px.
3. The lamelo chat estimated 40 px and 24 px. My numbers are 1.65 to 2.5 times larger. They come from the scene's geometry (projected cap line, cap/box ratio), not from pixels. Please check them against a render of frame 1222 (40.73 s). If the render shows about 40 px, `letterHeight` overstates size and every threshold here needs scaling.

## 5. Counts (final scenes)

1. Big Toothy Grins rough cut 6:
   1. 59 words grown (the reference HE `w3001` by 2.07 times, away from its neighbour).
   2. 28 dropped by the size pass, of which 7 were undone for the empty-screen rule, so 21 words are dropped in the final scene.
   3. 10 hidden for a later hold; 0 kept small.
   4. 15 outlines made solid.
   5. 29 words in the jersey font shown.
   6. Dropped words: THE 13.21 s, YOU 35.64, IT'S 37.36, WHEN 53.52, GETS 55.52, BOTH 72.83, HE 75.91, HE 86.96, ONE 89.24, GOT 102.36, THE 107.83, AND 109.36, HE'S 135.80, BONES 147.26, BOTH 150.27, RIGHT 156.39, BACK 156.65, TO 156.91, IT'S 158.01, TREY 158.19, WE 169.58.
2. Room for One test 6: 30 grown, 14 dropped (0 undone), 4 hidden, 32 outlines made solid.
3. Two of the dropped words are names: BONES at 147.26 s and TREY at 158.19 s. Other BONES and TREY words are shown. Dropping is allowed under section 5 of the brief, but you may want to check these two.

## 6. Stills and time ranges to render (Big Toothy Grins rough cut 6 unless marked)

1. Size reference: 40.1 to 41.3 s (both HEs, TURNS, THROWS). At 41 s HE should be large or absent, never small and sideways.
2. Jersey bold against real jersey lettering:
   1. 43 at 48.97 s (team block)
   2. MELO at 54.97 s
   3. AYO at 41.53 s
   4. 34 at 142.73 s
   5. TREY at 148.23 s
   6. SHANNON at 130.60 s
   7. MCDANIELS! at 30.53 s
   8. LYLES at 157.23 s
   Check stroke thickness, square corners, and that no letters clip at the box edge.
3. Solid wordmarks (green on navy): WOLVES at 17.77 s and the ending hold at 176.7 s to the end.
4. Former outline words, now solid: HOWL? at 12.37 s, HOT? at 27.48 s, GO? at 97.03 s, TREY? at 151.59 s.
5. Flat grey `#808080`: GOBERT! at 40.03 s and DOSUNMU at 44.03 s.
6. Fill 5: 153.8 to 155.6 s (the whip is skipped; DID, THEY and TODAY stay on, then the pivot to BONES).
7. Drops: 35.4 to 35.9 s (YOU) and 156.2 to 158.5 s (RIGHT BACK TO ... IT'S TREY) for rhythm and empty-looking frames.
8. Room for One regression (test 6):
   1. The striped jersey words 24 at 9.35 s and KING! at 15.18 s (they should be unchanged).
   2. CHASING? at 19.06 s (formerly outlined, now solid).
   3. Any grey word, for the flat grey.

## 7. Files

1. Engine: `composition.mjs`, `style.mjs`, `compose_plaques.mjs`, `build_best.mjs`, `build_song.mjs`, `shown_gate.mjs`, `whole_song_checks.mjs`, `viewer.html`, `KIT.md`.
2. Cleanup: the two partial builds I killed when change 2 arrived went to `~/.safe-delete` (restorable for 7 days). My scratch files are in the session scratchpad and will be deleted.
