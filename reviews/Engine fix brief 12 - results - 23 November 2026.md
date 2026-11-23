# Engine fix brief 12: results (23 November 2026)

Builder: the T2 engine chat (Claude, Opus 5.5). Nothing rendered; no section rebuilt.

## 1. Outcome

1. Big Toothy Grins `engine output/Rough cut 6g - 23 November` (a copy of 6f's sections) re-joined with `--skip-build`. It exits 0; every gate passes. Type rules check: 16 failures, all rule 1 (6f: 18).
2. My first 6g join failed: all 8 wordmarks counted as partly shown, because the shown check compared the typed text width ("WOLVES" in Anton) with the new, narrower image box. Image wordmarks now skip that test, as jersey-fitted words already did. The failed-gates copy was replaced by the passing join.

## 2. Item 1: PORTLAND and wordmark blocks

1. **Engine rule (every image wordmark on a block):** centred with an even margin of 0.25 x the ink height on all four sides, measured from the artwork's ink (alpha box), not its file box. The box is cut to the ink's shape about its centre. In 6f the image was fitted by height in a much wider box, which left big side margins (the "wide bar") and almost none top and bottom.
2. The cut shrank every wordmark by about a quarter (WOLVES from about 28% to 21% of the frame height), so a new pass grows each one back toward its size before the cut, or the song's median wordmark if that is larger, with no new overlap, edge cut or static partial. All 8 grew: WOLVES 28.7 to 30.4%; **PORTLAND 13.8% to 28.7% (x2.08), the same as the WOLVES moments** (6f: 18.6%).
3. **PORTLAND (129.5 s):** the real black Trail Blazers lettering on a Blazers red (#E03A3E) block with even margins; no white background, no red edge. Black on red is 4.84:1, red on the black ground 4.54:1. Black lettering would not read on the black ground, so it needs a block; I chose red over white because he objected to the white bar. That is a colour choice he has not seen.
4. **WOLVES (7 words):** same rule; green block (#78BE20) kept, now centred with even margins.
5. Unseen: all of it. The margin share (0.25) is my choice.

## 3. Item 2: jersey font

1. **Winner: Barlow Condensed Bold** (kit key `barlow`). Comparison sheet: `reviews/Jersey font comparison - Timberwolves Icon jersey - 23 November 2026.png` (the Nike photo's MINNESOTA and 5 enlarged, then 9 candidates set in white on navy).
2. Why: the photo's lettering is a plain condensed sans with flat ends, squarish rounds and a medium-bold stroke; MINNESOTA measures about 4.5 cap heights wide on the arched, slightly foreshortened jersey. Barlow Condensed Bold matches the shapes (flat terminals, squared O and S, flat-topped 5) and is among the narrowest (5.87). Barlow Semi Condensed (6.77) and Saira Semi Condensed (7.44), the suggested starters, are clearly wider; Oswald (5.77) is as narrow but more of a grotesque with taller, rounder curves; Bebas Neue (4.98) is narrower but lighter and rounder. Barlow Condensed is also already in the kit with measured metrics, so no browser measurement was needed. None has the jersey's crossbarless A.
3. Glyph samples were drawn with Pillow from the Google Fonts TTFs, and widths come from the fonts' own advance tables (fontTools), not a browser. No browser rendering was needed.
4. **Per-song setting** `jersey_font` (default stays Graduate for songs that do not set it). Big Toothy Grins is set to `barlow`: all 21 player names are in it (white on the navy block; 14 with full block padding now, 7 tight, against 11 and 10 in 6f, because the narrower font leaves more room). Reveal copies follow. No jersey numbers occur in this song.
5. Sections are still planned in Graduate; the join re-sets the font at the same cap height, so the narrower names sit in boxes laid out for wider ones (more space round them). A rebuild would plan for the new widths.

## 3b. Items 1.2 and 1.3: no thin borders; the jersey font stands

1. **Engine minimum, 3x the 6f thickness** (6f's PORTLAND red edge was 0.045 of the image height, about 0.84% of the frame height at its onset; 3x is about 2.5%):
   1. Score rim (the block colour round the bulb panel): 0.06 -> 0.18 of the letter height. The bulb digits now fit inside the rim, so they are drawn slightly smaller where the rim is tight.
   2. Wordmark edge (`colours.edge`): 0.045 -> 0.135 of the image height; with even margins it now frames the block, clear of the ink. No song uses an edge now (PORTLAND's was removed in item 1).
   3. Ring-box border (palette styles with `border`): 0.07 -> 0.21 of the letter height. Big Toothy Grins has none.
   4. **Name blocks:** my item 47.1 "tight" blocks had a 0.08 margin, a thin line. They now keep at least 0.18 of the letter height: full padding if it fits, else the 0.18 minimum grown about the centre (RUDY, both TREY at 148 and 151 s), else the letters shrink inside the box (x0.868: AYO 44.9 s, ANT 80.2 s, BONES 155.5 s, TREY 158.2 s; the size pass then regrew ANT and BONES to 13.9%).
   5. Letter outlines are not borders (Type rule 3) and are unchanged.
2. **Each border in 6g as a fraction of the frame height** (at onset + 6 frames):
   1. Score rims: 43 (49.3 s) 5.86% (6f 1.95%); 34 (142.75 s) 6.51% (6f 2.17%).
   2. Wordmark block margins: WOLVES 7.16 to 7.59%; PORTLAND 7.16%.
   3. Name blocks: full padding 3.89 to 9.56% (14 names); minimum margin RUDY 4.59%, TREY 148.25 s and 151.59 s at the 0.18 minimum (frame fraction not measured); shrunk AYO 3.33%, ANT 80.17 s 2.50%, BONES 155.53 s 2.50%, **TREY 158.19 s 1.49%**. TREY's margin is 0.18 of its letters, but its letters are only 8.3% of the frame (already a Type rule 1 failure), so its margin stays under the 2.5% target. The minimum is set relative to letter height, not the frame.
   4. Other team-colour blocks (palette styles): 4.15 to 12.2%.
3. **Item 1.3:** noted; the jersey font change (item 2) stands as done.
4. Re-joined 6g: exit 0, every gate passes; Type rules check 16 failures, all rule 1 (unchanged).

## 4. Files and cleanup

1. Engine: `song_appearance.mjs`, `viewer.html` (even margins; `BORDER` minimums), `shown_gate.mjs`, `composition.mjs` (`growWordmarks`), `build_song.mjs`, `word_roles.mjs` (`BLOCK_MIN_PAD`), `type_rules_check.mjs`, `KIT.md` (new "Engine fix brief 12" section; Type rules untouched).
2. Song input (not in git): `song settings.json`: `jersey_font: "barlow"`, PORTLAND `colours: { background: "#E03A3E" }` (edge and white background removed).
3. 6f is left in place; 6g holds copies of its sections.
4. My temp folder (font downloads, a Python environment, probes, a pre-change copy of the song settings) is deleted.
