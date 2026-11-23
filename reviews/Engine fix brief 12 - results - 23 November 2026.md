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

## 4. Files and cleanup

1. Engine: `song_appearance.mjs`, `viewer.html`, `shown_gate.mjs`, `composition.mjs` (`growWordmarks`), `build_song.mjs`, `word_roles.mjs`, `type_rules_check.mjs`, `KIT.md` (new "Engine fix brief 12" section; Type rules untouched).
2. Song input (not in git): `song settings.json`: `jersey_font: "barlow"`, PORTLAND `colours: { background: "#E03A3E" }` (edge and white background removed).
3. 6f is left in place; 6g holds copies of its sections.
4. My temp folder (font downloads, a Python environment, probes, a pre-change copy of the song settings) is deleted.
