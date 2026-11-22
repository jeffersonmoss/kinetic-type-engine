# Rulebook final (Fable): one deterministic layout and camera system for kinetic-type lyric videos

Written 22 November 2026 by Fable as the final reconciliation: my merged rulebook plus my rulings on Neon's creativity pass. This file is complete in itself. Terra builds from this file alone and needs no other rulebook file. Scope: horizontal 16:9, 1280x720, 30 fps, words only, no props, no drop shadows, no fades, no model in the loop.

Order of the file: summary (1), rulings on Neon (2), my own corrections (3), the rules (4 to 14), deferred work (15), what I checked (16), parameter table (17), and last the Terra build spec for stage 1 (18).

Source tags: **[J]** Jefferson's words, quoted from a notes file I read. **[J*]** his words as quoted in an earlier draft or brief, not re-read by me in this pass. **[F]** my judgment. **[N]** adopted from Neon's creativity pass, item number given. **[R8]** and similar: research report by number, as cited in the merged rulebook. **[S]** the survey of the Pulp Fiction reference, as cited in the drafts. Nothing in this file has been rendered. Every number is a first setting.

## 1. Ten-line summary

1.1. Words become clusters: one anchor the camera lands on, plus quick pickup words (riders) set beside it and caught in passing. THE never gets its own landing. A fast run of content words (ONE, MORE before RING!) is not shrunk to riders; it builds on screen as a stack of big words under one still camera.
1.2. Each phrase becomes one plaque: a slab on which its clusters are fitted together at several sizes, in up to three letter widths, sometimes with one element turned 90 degrees.
1.3. Plaques are chained edge to edge by folds (flat, roll, inside corner, outside corner, push through, flip). Gaps are fixed by rule and never widened by a solver. Where it can, the next plaque's first word lines up with the last word across the fold.
1.4. The trail is planned before anything is rendered. Moves are sampled one at a time from his heat map; a look-ahead search refuses any fold whose plaque would hit an earlier one.
1.5. Local truth, global fiction: only the current plaque and the two before it are switched on. The reveal puts everything back.
1.6. Big moves go on the musical peaks first, ordinary boundaries are sampled afterwards with cooldown, and a two-word echo (THE KING! THE KING!) turns the camera to a second, bigger plaque by a flip or a tight corner.
1.7. The default landing is the poster: the sung word fills 56 to 84% of the frame width and its neighbours show at the edges. The camera is dead still or decisively moving, never drifting. Moves leave fast and settle long, and moving frames carry motion blur.
1.8. Two hundred complete builds are generated per clip in Node, hard checks discard the broken ones, a score ranks the rest, and the best one is rendered.
1.9. The reveal switches every plaque back on, newest first, and pulls back in one move to a still view of the whole snake, chosen from twelve directions for readability.
1.10. The first demo is seven clips of the h1 hook: a baseline, three forks that each change one thing (tight masonry, no panels, words pre-set), one clip with v5's motion feel (old ease, no blur), and two seed variants.

## 2. Rulings on Neon's creativity pass

Numbers in the first column are Neon's own item numbers (1 to 29). Verdicts: adopt, adopt changed, defer (with stage), reject.

| # | Neon's item | verdict | why, and the side effect I checked |
|---|---|---|---|
| 2.1 | 1. Polarity-flipped slabs (cream, accent, dark, open) | adopt changed | The fault is real: the merged panel #14161f on ground #0b0b0d has a contrast of about 1.1 to 1, so slabs would be invisible and fork C would test nothing. Fixed with one visibly lighter navy panel and palette contrast floors (12.1). Cream and accent slabs are deferred to stage 2 as a styling fork: his flyer has one grey ground with two ink colours, not alternating slabs; the portrait preview's panels were dark navy; eleven styles would need untested on-light twins; and a bright slab switching off on screen is far more visible than a dark one. `open` is adopted for depth exits only (2.2). |
| 2.2 | 2a. Open slab on `depth` exits | adopt changed | A solid slab would fill the frame and then blink away. A plaque whose exit fold is `depth` is built with no slab (words only), so the next plaque is visible through the gaps during the dive, and its words switch off only once the camera is behind its face (8.6, 11.3.4). Not adopted: aiming through a letter counter, which needs glyph outlines Terra cannot verify without rendering. The dive goes through the centre of the last word. |
| 2.3 | 2b. Counter insets (FOR and ONE inside ROOM's Os) | defer, stage 2, first item | This is his own direction from 21 November [J: FOR and ONE "inset in ROOM's two Os, rotated 90 degrees"], so it moves up from stage 3. Not stage 1: it needs measured counter boxes per font, it inverts the size ranking (ONE! is the hook's hero and would be the smallest word on the plaque), and a bad fit cannot be seen without a render. Neon's numbers are recorded in 15.3. |
| 2.4 | 3. 3D chant figures (cube spin, flip twin, corner echo) | adopt changed | Adopted for two-word echoes: the two repeats become two plaques joined by a flip or a tight inside corner, the second 1.25 times larger (5.6.2, 9.5.4). v5 did this and he liked v5. Rejected for runs of 3 or 4: a fixed turn sequence is a designed shape, which he argued against, and it keeps four plaques on against the window rule. Four RINGs stay on one plaque. Side effect: the hook now has 10 shots and 9 boundaries, and the escalation rule no longer forces the first KING! down to a middle size (6.4). |
| 2.5 | 4a. Asymmetric ease | adopt changed | Neon's arithmetic is right: the symmetric power-5 whip crosses 54% of its travel in one frame gap. Its formula has a fault it did not notice: speed jumps from 1.8 to 4.4 times average at the split point. I use the same two-piece shape with the join made smooth (10.5.5). Largest single-frame step on a 0.30 s quarter turn falls from about 40 degrees to about 24. |
| 2.6 | 4b. Bank roll on lateral moves | defer, stage 2 fork | A 4.5 degree lean during travel may read as sway. He asked for no wobble [J*]. Needs his eye on a clip of its own. |
| 2.7 | 4c. Two-frame wind-up before peak moves | reject | It moves the camera during a hold, which breaks "either clearly moving or not moving" [J*] and the stillness check. |
| 2.8 | 4d. Arrival impact lock | reject | By its own formula the distance changes by 0.7% and then 0.2%: invisible. If made visible it is the settle that was already ruled out. |
| 2.9 | 5. Staccato triplet with hard cuts | adopt changed | The fault is real: ONE and MORE as tiny catchwords would muffle the hook's last line. Fixed in the word rules: a run of two or three quick content words is promoted to anchors, sized 0.55 and 0.70 of the final word (5.5.5, 6.5), and the existing stack landing shows them popping big under one still camera. Rejected: a hard cut per word at 0.19 s and 0.28 s and a 4-frame readable floor. That is the flicker he named [J]: "making the camera move that fast so it jumped and like almost like flickers, that's really more annoying". |
| 2.10 | 6. Oblique callback poses | defer, stage 2 fork, on pull accents only | Never on a sung word: the half of the portrait preview he rejected was "jumping to words that aren't oriented to really fill the screen" [J]. On a pull accent nothing new is being read, so an angled view is safe there. I did not re-read report 9 to confirm Neon's reading of Bois. |
| 2.11 | 7a. Cylinder-arc plaques | defer, stage 3, first item | Neon is right that the merged rulebook lost his wish [J]: "it could use some curved effects ... texture mapping it basically onto 3D geometry", and "there's a lot more intricate shapes than box". It is now recorded (15.9). It is not 15 lines: every Node check assumes flat word boxes, and each word is its own mesh. |
| 2.12 | 7b. Runway floor read at 22 degrees | reject | Sung words read at a grazing angle break the poster rule and the readable-anchor check. |
| 2.13 | 8a. Graphic-match alignment across folds | adopt changed | The next plaque's first cluster lines up with the last cluster across the shared edge, weight 55 against 15 each for start, centre, end (8.1.1). It brings neighbours closer, as he asked. Rejected: tightening the gap by colour. Gaps stay fixed by rule. Side effect checked: a matched plaque can hang off the edge, so a 40% overlap floor is added. |
| 2.14 | 8b. Roll pivot arc about the shared corner | reject | The interpolation of 10.6 already rolls about the view axis through a moving target. One more special path for one fold is not worth the code in stage 1. |
| 2.15 | 9. Letter-width slots in row fitting | adopt | His flyer does exactly this: condensed lines beside wide lines in one family [R8, and I looked at the flyer]. Three width slots per kit, tried per row, with a small bonus when neighbouring rows differ (7.4, 12.3). Side effects handled: it replaces the hero, body and narrow font rules; slot fonts are chosen by measured width, not by name (Big Shoulders measures no narrower than Anton); the row scale band tightens to 0.78 to 1.30. Variable-width fonts stay in stage 3. |
| 2.16 | 10. Song DNA (lens, light ground, entry idiom, verse and chorus looks) | defer, stage 3 | A 22-second hook cannot test differences between songs or sections. Adopted now, at no cost: the field of view is a scene parameter, not a constant. The verse and hook contrast partly exists already (two families per song, 9.8). |
| 2.17 | 11a. Beat-magnet landing snap | reject | A landing snapped later than the vocal makes the word appear before the camera has stopped, breaking the sync check and his poster wish. Snapped earlier by two frames or less, nobody can see it. |
| 2.18 | 11b. Groove score | adopt changed | `beat_align` cannot rank builds: arrivals are fixed by onsets and accents are already on beats, so it is nearly the same number for all 200. The `rhythm_contrast` half is kept as `verb_mix`, weight 0.5 (13.2). |
| 2.19 | 12a. Twelve reveal directions | adopt changed | Neon's four shallow directions lean along X, but most plaques face Z. I add four shallow directions in front of the first plaque instead, and a facing term in the choice (14.1, 14.3). |
| 2.20 | 12b. Two-beat reveal with a mid stop | reject for the demo | It spends about 0.6 s more of a 2.5 s tail on moving. The payoff he asked for is seeing the snake, so the demo keeps one move and the longest still. Multi-stage tails already exist for full songs (14.6). Adopted: plaques come back one every 2 frames, so the snake visibly completes itself. |
| 2.21 | 12c. Aspect term in the reveal score | adopt changed | Right that a bounding box rewards a thin diagonal ribbon. The term now also counts how much of the frame the plaques themselves cover (13.2.1). |
| 2.22 | 13. Whip motion blur in stage 1 | adopt changed | Moved up from stage 2. Blur is a render option, on by default, on every moving frame (not whips only), with up to 12 samples because the portrait sheet shows stepped ghosts at 5 (10.12). Clip E turns it off. Side effect handled: the shutter opens at the frame time, so a landing frame is sharp. |
| 2.23 | 14. Asymmetric ease (objection to my drop) | adopt changed | Same ruling as 2.5. |
| 2.24 | 15. Two rider roles | adopt changed | One role stays. Neon's real point is met with two numbers: riders in a run of two or more, or with a slower onset, are set at 0.42 instead of 0.32 and prefer a row on the anchor's baseline to its left, which is on the camera's way in (6.3, 7.2). |
| 2.25 | 16. Oblique poses (objection to my drop) | defer | Same ruling as 2.10. |
| 2.26 | 17. Chant repeats in 3D (objection to my merge) | adopt changed | Same ruling as 2.4. Neon's reading of the portrait sheet is fair: its four RINGs sat at mixed orientations on one dense surface. The plaque rules allow one turned element, so that look is kept; the four separate planes of v5 are not, because v5's opening had blank frames between them (I looked at v5 sheet 1). |
| 2.27 | 18. Width-aware fitting (objection to my drop) | adopt | Same ruling as 2.15. |
| 2.28 | 19. Empty slab under popped words | noted, no change | True and inherent in building a line as it is sung; it is the question fork D exists to answer. v5 worked this way and he liked it. Panels that grow tile by tile with each word are recorded for stage 2 (15.5). |
| 2.29 | 20. Solid slab on depth folds | adopt changed | Same ruling as 2.2. It also exposed a contradiction of mine (3.2). |
| 2.30 | 21. Charcoal on black | adopt changed | Same ruling as 2.1. |
| 2.31 | 22. One-frame jumps in whips | adopt changed | Same rulings as 2.5 and 2.22. |
| 2.32 | 23. ONE MORE as footnotes | adopt changed | Same ruling as 2.9. |
| 2.33 | 24. Focus check against clipped neighbours | adopt changed | Right: the area rule would outlaw the big clipped neighbours he liked. Words less than half in frame are now judged by a looser rule and must stay out of the middle of the frame (13.1.3). |
| 2.34 | 25. Single steep reveal angle | adopt changed | Same rulings as 2.19 to 2.21. |
| 2.35 | 26 to 28. Neon's ranking | answered | Rank 1 (motion feel): ease and blur adopted; bank, wind-up and impact lock not. Rank 2 (surfaces, widths, focus check): widths and the focus fix adopted, light slabs deferred, the contrast fault fixed. Rank 3 (Song DNA, chant figures, triplet): deferred, adopted for echoes, adopted without cuts. |
| 2.36 | 29. Neon's honesty note | noted | I verified what I could: the ease arithmetic, the contrast figure, the hook timings, his quotes on curves and on the O insets, and the flyer. I did not verify Neon's citations of research report items. |

## 3. Corrections to my merged rulebook found in this pass

3.1. Row fitting had no unit. The merged rule scaled rows by `W / natural width` with nominal caps in relative units and never said how the two relate. Section 7.4 now fits every row to the measure and judges distortion against the plaque's own average scale.
3.2. The window check said plaque i-1 is never off during shot i, while the depth fold switches plaque i-1 off. The check now exempts a plaque left by `depth` (13.1.11).
3.3. The grey style fails the contrast floor on any panel (about 4.2 on the old panel, 3.3 on the new). The floor is now 3.0 for anchors and 4.5 for riders, with a lighter grey on panels (12.1).
3.4. Reveal timing counted from the last landing. With a three-word stack landing that is 0.47 s before RING! is even sung. It now counts from the last anchor's onset (14.4).
3.5. Chant escalation started every chant at the middle size, which would have shrunk the first KING!. It now steps down from the last repeat (6.4).
3.6. `h1 words.json` carries no parentheses, so the hook's ad-libs are not marked in the demo input. The demo treats no word as an ad-lib; the full song map does mark them (5.1).

## 4. Pipeline, seed, and best of N

4.1. Stages, each a pure function of its inputs and the seed: (1) words (section 5); (2) tiers (6); (3) song plan: family, motifs, styles, font kit (9.8, 12); (4) plaque composition per shot (7); (5) move types top down (9.2 to 9.5); (6) trail geometry with look-ahead (9.6, 9.7); (7) camera keys (10); (8) visibility (11); (9) reveal (14); (10) checks and score (13). Output: `scene.json`, `build log.json` (every draw, fallback, hide and score term) and a render provenance file (18.7).
4.2. Inputs: a words file (`Song map.json` or a hook slice such as `h1 words.json`; the four intro RINGs come in as ordinary words with `line: "intro"`); the song map for `tempo_bpm`, `beats`, `strong_hits_s` and `energy_10hz`; font metrics `room-for-one-variety.metrics.json`; a palette file (12.1); a title; a clip window (`start_s`, `end_s`, `reveal_until_s`; demo 0, 21.971, 24.5).
4.3. Seed [J: "pseudo-random number generator pick from like a menu of moves"]. `seed = FNV-1a 32` of the lower-cased title with non-alphanumerics removed, then `|`, then the salt. Generator mulberry32. Every decision draws from its own stream, `mulberry32(FNV-1a(seed + "|" + stage + "|" + shotIndex + "|" + attempt))`, so changing one shot's draw leaves the others untouched.
4.4. Best of N. Build `N = 200` complete candidates with salts `<salt>#0` to `<salt>#199`. Discard any that fails a hard check (13.1). Rank the rest by score (13.2). If fewer than 3 survive, keep the three with the fewest failed checks and flag the clip. Ties: lower build index.
4.5. Weighted choice everywhere: multiply the named factors, drop zero weights, draw once. If all are zero, take the highest base weight that passes the hard tests; else the named fallback.
4.6. Time is counted in whole frames. Frame `f` is time `f / 30`. Every `on`, `off`, key start and key end in `scene.json` is a frame number.

## 5. Words, clusters, shots

5.1. Display text: upper case; keep `!`, `?`, apostrophes, hyphens; drop commas, full stops, colons, semicolons, quotation marks and parentheses [J*: Suno parentheses are never shown], remembering what was dropped. Ad-lib flag: the word lies inside parentheses in its line's text (scan the line text with an open-parenthesis flag and map tokens to words in order). A words file with no line text marks no ad-libs.
5.2. Timing uses onsets only; end times are unreliable. `IOI(i)` = next onset minus this onset (last word: clip end minus onset). `beat = 60 / tempo_bpm` (demo: 95.7 BPM, 0.627 s). If `IOI < 0.04 s` the word is forced to be a rider of the next word.
5.3. Function words: THE, A, AN, OF, TO, AND, IN, ON, AT, FOR, BY, WITH, FROM, AS, OR, BUT, SO, IF, HIS, HER, ITS, MY, YOUR, OUR, HE, SHE, IT, WE, YOU, I, ME, HIM, THEM, THEY, IS, ARE, WAS, BE, CAN, THAT, THIS, THEN, THAN, HE'S, SHE'S, IT'S, THAT'S, HE'LL. Not function words: NOT, NO, question words, numbers (ONE is a number).
5.4. Boundary class after each word, first match wins.
   5.4.1. **B4**: the next word starts a new section (when the input has sections); or a line end with IOI of 3 beats or more; or IOI of 6 beats or more.
   5.4.2. **B3**: the `line` id changes.
   5.4.3. **B2**: the ad-lib flag changes; or the word ended with `.`, `!` or `?`; or it ended with a comma, colon or semicolon and IOI is 0.45 s or more; or IOI is at least 0.9 s and 1.8 times its line's median IOI; or the next word has the same text and IOI is 0.38 s or more.
   5.4.4. **B1**: between clusters inside a shot. **B0**: between a rider and its anchor.
   Basis [J]: "at the end of a sentence or phrase, we would have a more disruptive move that kind of like leaves behind what we just had, whereas words that are directly feeding into each other have more proximity".
5.5. Riders and anchors [J: "not every word needs to be individually focused, we can just kind of like pass by it on our way to the next word"]. Inside each span (a run between joints of B2 or stronger), left to right:
   5.5.1. A word is a rider on the next word when it is not the span's last word and either IOI is under 0.30 s, or it is a function word and IOI is under 0.45 s.
   5.5.2. Never a rider: a word with `!` or `?`; a number in digits; a word of 7 or more letters unless IOI is under 0.20 s.
   5.5.3. At most 3 riders in a row; a fourth promotes the non-function rider of that run with the largest IOI (all function words: the largest IOI; ties: the later), then re-run from it.
   5.5.4. Everything else is an anchor. A cluster is an anchor plus the riders leading into it.
   5.5.5. Pickup run [N 5, changed]: after 5.5.1 to 5.5.3, a maximal run of 2 or 3 consecutive riders that contains no function word is promoted. Every word of the run becomes an anchor with the flag `pickup`. Their short owned times put them in one landing group with the word they lead into (5.6.4), so the camera lands once and the words pop in turn.
5.6. Shots.
   5.6.1. A shot is one span. Its clusters share one plaque.
   5.6.2. Repeats [F; N 3 and 17 for the echo]. Consecutive spans whose normalised text is identical form a run. A run of 3 or 4 merges into one shot (a chant plaque; a run longer than 4 is cut into groups of 4, then 3). A run of exactly 2 stays two shots, and the boundary between them is an echo boundary (9.5.4).
   5.6.3. Cap: 5 clusters and 9 words. A longer span splits at its internal cluster joint with the largest IOI (ties: nearest the middle); the split is a B2.
   5.6.4. Landing groups. `owned(c)` = next cluster's anchor onset minus this one's (last cluster of the clip: clip end minus onset). `min_stop_time = min_hold + whip_floor = 0.267 + 0.20 = 0.467 s`. Inside a shot, left to right: open a group with the next cluster; while its last cluster owns less than `min_stop_time`, the group has fewer than 3 clusters and the shot has more, add the next. The camera lands once per group, at the first anchor's onset.
5.7. Demo assertions for Terra's tests. I worked these by hand from `h1 words.json`. If the code disagrees, report it; do not force it.
   5.7.1. Riders (6): ON, HIS (onto HAND!), FOR (onto ONE!), both THEs (onto KING!), HE (onto CHASING?). Pickup anchors (2): ONE and MORE before RING!. 24 clusters from 30 words.
   5.7.2. Ten shots: S1 RING x4; S2 FOUR, RINGS, (ON HIS) HAND!; S3 ROOM, (FOR) ONE!; S4 YEAR, 24!; S5 STILL, NOT, DONE!; S6 WHO'S, STILL, CHASING?; S7 (THE) KING!; S8 (THE) KING!; S9 WHAT'S, (HE) CHASING?; S10 ONE, MORE, RING!.
   5.7.3. Boundaries into S2 to S10: B3, B2, B3, B2, B3, B2, B2 (echo), B3, B2.
   5.7.4. Landing groups with more than one cluster: {NOT, DONE!}, {WHO'S, STILL}, {ONE, MORE, RING!}. Every other cluster is its own group.

## 6. Emphasis and size

6.1. Emphasis per anchor: `E = 0.30*hold + 0.20*final + 0.15*punct + 0.15*energy + 0.10*hit + 0.10*repeat - 0.25*func`, with `hold = clamp((owned - 0.3)/1.2, 0, 1)`; `final` 1 for the last cluster of a line, 0.6 for the last of a shot; `punct` 1 for `!`, 0.7 for `?`, 0.3 for a dropped stop or comma; `energy` = percentile rank among the clip's anchors of mean `energy_10hz` over the 0.5 s after the onset; `hit` 1 if a strong hit lies within 0.08 s of the onset; `repeat` 1 if the word is in the title or among the five most frequent non-function words of the input; `func` 1 for a function word.
6.2. Tiers by rank inside each section, highest E first: top 15% XL, next 30% L, next 25% M, last 30% S. Ties: the later word ranks higher. A section with fewer than 4 anchors, or an input with no sections (the demo), uses the whole clip's ranking. Pickup anchors are left out of the ranking.
6.3. Nominal cap heights, relative units before fitting: S 0.45, M 0.68, L 1.00, XL 1.50 [R8]. Riders: 0.32 of their anchor for a single rider whose IOI is under 0.22 s; 0.42 for any other rider [N 15, changed]; never under 0.13 of the largest cap on the plaque.
6.4. Chant plaque (3 or 4 repeats): the last repeat takes its own tier's cap or 1.00, whichever is larger; each earlier repeat is the next one divided by 1.25, floored at 0.45. Echo (2 repeats, two plaques): each keeps its own tier; the second plaque's measure is 1.25 times the first's (9.5.4).
6.5. Pickup anchors take 0.70 of the cap of the anchor they lead into for the last of the run, 0.55 for the one before, 0.45 for the one before that.
6.6. Fitting (7.4) rescales these, so they steer the layout rather than fix final sizes.

## 7. Plaques: one fitted composition per shot

His wish for different orientations and for the look of his flyer meets his reading rule [J]: "we need left and right to read". So plaques read left to right, top to bottom, with at most one element turned 90 degrees.

7.1. Boxes. Word box from the existing `wordBox()` in `build_scene.mjs` (text width from advances at the cap height, plus pair kerning from the metrics file; height = cap + 2 pad + 0.10 cap for block styles, 0.15 cap otherwise). Padding 0.28 x cap for block styles, 0.08 x cap otherwise.
7.2. Cluster block: the anchor with its riders in one arrangement, drawn per cluster with cooldown (tau 2 clusters).
   7.2.1. One rider: `above-left` 40 (rider above the anchor, left aligned, as THE sat over KING! in v5); `left-top` 40 (rider left of the anchor, top aligned); `perp-left` 20 (rider turned 90 degrees anticlockwise up the anchor's left edge; allowed only if the rider, scaled by no less than 0.8, is no longer than the anchor is tall).
   7.2.2. Two or three riders [N 15, changed]: `inline-left` 50 (riders in a row left of the anchor, sharing its baseline); `left-top` 30 (riders stacked left of the anchor, top aligned); `above-left` 20 (riders in a row above the anchor, left aligned).
   7.2.3. Rider to anchor gap 0.10 x anchor cap; between riders 0.25 x rider cap.
7.3. Measure. `W = 1000 x m` world units, `m` = 0.8 when the shot's top tier is S or M, 1.0 for L, 1.25 for XL.
7.4. Candidate layouts, enumerated in this fixed order: by layout class (rows-1, rows-2, rows-3, two-up, perp), then by split position, then by slot assignment in the order narrow, standard, wide per row from the top row down.
   7.4.1. Rows: every split of the cluster sequence into 1, 2 or 3 consecutive rows.
   7.4.2. Width slots [N 9]: each row is set in one of the kit's three slots, `narrow`, `standard` or `wide` (12.3). Every assignment of slots to rows is a separate candidate. A word in the accent face (12.3.3) keeps that face whatever its row's slot.
   7.4.3. Fitting rows. For each row `r`, `natW_r` = sum of its block widths at nominal caps plus inline gaps, and `s_r = W / natW_r`. The plaque's reference scale `s_ref` = the geometric mean of `s_r`, each row weighted by its number of clusters. `d_r = s_r / s_ref`. If any `d_r < 0.78` the candidate is invalid (that row would have to be set smaller than its tiers allow). If `d_r > 1.30` it is clamped to 1.30 and the row, now narrower than `W`, is aligned left, centre or right (seeded, equal). Final row scale = `s_ref x d_r`.
   7.4.4. Two-up [R8, his flyer's LAGNIAPPE beside BRASS over BAND]: for a shot of exactly 3 clusters whose top-tier cluster is first or last, that cluster beside the other two stacked. The two stacked blocks are each scaled to one common width; the big block is scaled so its height equals the stack's height; the common width is the one value that makes the total width equal `W`. Valid when each block's scale over the plaque's mean scale lies in 0.55 to 1.80. One slot for the big block and one for the stack, each enumerated.
   7.4.5. Perpendicular edge: for a shot of 2 or more clusters, the first cluster turned 90 degrees anticlockwise along the left edge of the rest, or the last turned 90 degrees clockwise along the right edge, scaled so its length equals the height of the rest. The rest is laid out by 7.4.1 to 7.4.3 in the remaining width. Same 0.55 to 1.80 band for the turned element.
   7.4.6. Gaps: inline gap = `mortar x hg`, line gap = `mortar x` the geometric mean of the two rows' largest caps, each times a seeded jitter in 0.85 to 1.15. `hg` is the geometric mean of the two neighbouring anchors' caps. `mortar` = 0.30 (fork B: 0.15).
7.5. Score each valid candidate: `Q = 0.35*fill + 0.25*fidelity + 0.20*hero + 0.20*aspect + 0.10*contrast - 0.30*wall`.
   7.5.1. `fill` = summed word-box area over plaque area. `fidelity = 1 - mean(|ln d_r|)/ln(1.30)`, floored at 0. `hero` = 1 if the shot's top-E anchor has the largest cap after fitting. `aspect` = 1 for width over height between 1.0 and 2.6, falling linearly to 0 at 0.6 and at 4.0. `contrast` = share of neighbouring row pairs set in different slots (0 for one row) [N 9]. `wall` = 1 if the plaque has 3 rows whose largest caps are within a ratio of 1.3 and the rows are not all the same word (the four similar lines he rejected [J]: "scanning back and forth above like four lines of wording that really doesn't work at all").
   7.5.2. Choose among candidates with `Q >= Qmax - 0.05` by a draw weighted by cooldown on layout class, tau 2 shots. Layout varies without ever taking a clearly worse fit.
7.6. Panel and slab. The panel is the rectangle of the composition plus padding `0.35 x` mean anchor cap `x (mortar / 0.30)`. The slab is that rectangle with thickness `0.05 x W`, face in the palette's `panel` colour, sides in `panel_side`. Each plaque has a `surface`: `panel` (slab drawn) or `open` (no slab drawn; words only). A plaque is `open` when its exit fold is `depth` (8.6) and, with `--panel off`, always. The slab box is used for every test whatever the surface.
7.7. A single-cluster shot is its block scaled to `W`, in a slot drawn with cooldown on slot (tau 2 shots, equal base weights).

## 8. Folds: how one plaque attaches to the last

8.1. Notation. Plaque A has frame (R, U, N), centre, half extents. Exit edge direction `d` is +R, -R, +U or -U. Gap `g` between slabs: uniform in 0.45 to 0.80 x hg at B2, 0.70 to 1.20 at B3, 1.40 to 2.40 at B4, times the family gap scale [J for a middle distance]. `hg` here is between A's last anchor and B's first.
   8.1.1. Alignment of B along the shared edge [N 8, changed]: `match` 55, `start` 15, `centre` 15, `end` 15. `match` puts the centre of B's first cluster level with the centre of A's last cluster along the edge direction, then shifts B the least amount needed for the two slabs to overlap along that edge by at least 40% of the shorter of their two edge lengths.
8.2. `flat`: B keeps A's frame, placed beyond the exit edge at gap `g`.
8.3. `roll`: as flat, with B's frame turned 90 degrees about N (sign sampled). The camera rolls 90 degrees to read it [S: every settled roll in the reference is 90 degrees].
8.4. `corner-in` (exit right or left) and `tip-in` (exit top or bottom): place B as flat, then rotate it -90 degrees about the hinge line (parallel to the exit edge, `g/2` beyond it, in A's face plane), so B rises on the camera's side and faces back over A. From B's landings A is a floor or wall along one frame edge. This is the 3D form of the neighbours he liked, and of his swing-in wish [J*]: "the right edge pivots to become the new letter facing the camera".
8.5. `corner-out`, `tip-out`: the same with +90 degrees. B falls away behind A's plane and A is left behind.
8.6. `depth` (push through) [N 2a, changed]: B keeps A's frame; B's first cluster is centred behind A's last cluster K at distance `D` = (reading distance of B's first landing) + 0.5 x K's cap + slab thickness. A is an `open` plaque from the start of its life (7.6), so B is seen through A's words during the dive. The camera flies along A's normal through K's centre. A's words are switched off on the first frame the camera is behind A's face plane (11.3.4).
8.7. `flip`: B sits back to back with A (`R' = -R`, `N' = -N`), `0.5 x hg` behind A's back face, aligned on K. The camera orbits 180 degrees about U.
8.8. `jump`: fallback only. B keeps A's frame, centred `2.5 x` A's larger extent along the heading `G` (9.6.3). Verb is `cut`.
8.9. All turns are 90 or 180 degrees in stage 1, so every slab box is axis aligned. 45-degree folds are deferred (15.10).

## 9. Planning the trail: peaks first, then the heat map, then look-ahead

His idea [J]: "a heat map of different moves ... and we could have just like a cooldown period ... a preference for moves that have not been recently used. But ... the model still could use the same move, like very close in time to each other, or even directly one after the other".

9.1. What is decided at each shot boundary: fold, verb (10.5), exit edge, sign, alignment, gap.
9.2. Peaks. For the boundary into shot i: `PK = 0.35*class + 0.25*energy + 0.20*hit + 0.20*emph`, with `class` 0.3, 0.6, 1.0 for B2, B3, B4; `energy` = percentile rank of the shot's mean energy; `hit` = 1 if the shot's first anchor is on a strong hit; `emph` = percentile rank of the shot's highest E.
9.3. Set pieces. Take boundaries in falling `PK` until `ceil(0.2 x boundaries)` are chosen, skipping any within 2 boundaries of one already chosen and any governed by a motif replay or an echo. Each draws its fold from: depth 32, corner-out 30, tip-out 22, flip 16, times family, times cooldown among set pieces (tau 2 set pieces). Its verb is drawn from the B4 column of 10.5. Demo: 9 boundaries, 2 set pieces.
9.4. Ordinary boundaries, in song order. `weight(fold) = base[class][fold] x family x cooldown(fold) x cooldown(axis) x energy x motif or streak override`.

| fold | axis | B2 | B3 | B4 |
|---|---|---|---|---|
| flat | none | 40 | 12 | 4 |
| roll | roll | 20 | 14 | 8 |
| corner-in | yaw | 18 | 24 | 8 |
| tip-in | pitch | 10 | 18 | 8 |
| corner-out | yaw | 1.8 | 4.2 | 7 |
| tip-out | pitch | 1.1 | 2.8 | 5.6 |
| depth | depth | 1.4 | 3.5 | 7.7 |
| flip | yaw | 0 | 0.7 | 2.8 |

   9.4.1. The last four rows are held low because those folds are reserved for set pieces. Weak joints stay on the plane or turn an inside corner; strong joints leave things behind [J for the principle].
   9.4.2. Energy, `e` = the shot's energy percentile: flat and roll x `1 + 0.65*(0.5 - e)` below 0.5 and x `1 - 0.35*(e - 0.5)` above; all other folds x `1 + 0.75*(e - 0.5)` above 0.5 and x `1 - 0.5*(0.5 - e)` below.
   9.4.3. Cooldown [J]: with `n` = decisions of that kind since last use (1 = used last time), `cooldown = 1 - 0.9*exp(-n/tau)`; never used = 1. `tau`: flat 1.5; roll, corner-in, tip-in 3; corner-out, tip-out, depth 4; flip 6. Axis (roll, yaw, pitch, depth) tau 2. Set-piece and echo uses count. Cooldown is never a ban.
9.5. Deliberate repetition.
   9.5.1. Line motif: a line whose normalised text occurred before replays the first occurrence's plaque layout, fold, verb and styles with no sampling. The second occurrence mirrors exit edges and signs; the last occurrence in the song scales its plaque by 1.25.
   9.5.2. Parallel lines: two lines in one section (or in one clip, when the input has no sections) whose final anchors match (WHO'S STILL CHASING?, WHAT'S HE CHASING?) share plaque layout class, entering fold and verb; the second mirrors the first's exit edge if that passes 9.6, else it is free.
   9.5.3. Streak: at an ordinary boundary, with probability 0.12, lock the fold and verb just drawn for the next 2 (60%) or 3 (40%) ordinary boundaries of the same or weaker class.
   9.5.4. Echo [N 3, changed]: the boundary between the two shots of a 2-repeat run draws its fold from `flip` 55, `corner-in` 45, with no other factor. The verb is `sweep`. For `corner-in` the gap is fixed at 0.30 x hg and the alignment is `match`. The second plaque copies the first's layout class, slots, rider arrangement and styles (pins still win), and its measure is 1.25 times the first's. If the drawn fold fails 9.6.2, try the other; if both fail, the boundary is treated as an ordinary B2 from 9.7 step 1.
9.6. Geometry with look-ahead. Shots are placed in order by depth-first search. For shot i, list its options (edge x sign x alignment) in an order drawn once by weight, then take the first that passes every test below.
   9.6.1. Edge base weights: right 45, bottom 25, top 18, left 12, times edge cooldown (tau 2), times heading and envelope (9.6.3), times flow (9.6.4), times balance (9.6.5).
   9.6.2. Tests. (a) Solid trail: B's slab box, grown by 60 units on every side, intersects no earlier slab box (for `flip`, A is tested without the growth). (b) No hairpin: with slab centres c1 (two back), c2, c3 (candidate), `|c3 - c1| >= 0.6 x (|c2 - c1| + |c3 - c2|)`; not applied when the fold into c3 is `flip` [J on doubling back]. (c) No corkscrew: after two turning folds running on one axis with one sign, a third on that axis takes the other sign. (d) Camera clear: no landing or accent pose of shot i lies inside the box of a switched-on plaque grown by 0.5 x its largest cap. (e) Sight line: rays from each landing pose to the 9 points (centre, corners, edge midpoints) of the sung cluster's box cross no other switched-on `panel` plaque. If the only offender in (d) or (e) is plaque i-2, hide it early (11.3.3) instead of rejecting.
   9.6.3. Heading and envelope. `G = normalize(0.80, s1*0.45, s2*0.40)` with seeded signs. `L = sqrt(sum of all slab areas)`. Envelope: an ellipsoid with half axes (1.33 L, 0.75 L, 0.75 L), long axis on world X, centred `1.2 L x G_x` along X; `rho` = a point's normalised radius. Factor: `(1 + 0.3*dot(step, G)) x exp(-2*max(0, rho - 1))`.
   9.6.4. Flow. At a B2 boundary, an exit edge equal to the direction the camera last travelled inside A (dominant axis from A's second-last landing target to its last, in A's frame) is x1.4, the opposite edge x0.5. No factor when A has one landing, and none at B3 or B4: a strong boundary is a permitted reset.
   9.6.5. Balance: keep a decayed signed sum per axis, `bal = bal*0.85 + sign`. A sign that would take `|bal|` over 1.5 is x0.35 and the other x1.45.
9.7. When no option passes, in fixed order: (1) the next fold by weight for this boundary, up to 4 folds; (2) backtrack one shot and take its next option, within a budget of 200 backtracks per build; (3) `jump`, trying `G` turned 0, 45, -45, 90, -90 degrees about world Y. Gaps are never widened (searching farther is what made v5 loose). Every step is logged, and fallbacks cost score (13.2).
9.8. Families. A family multiplies fold, verb and gap. A song takes one for hook sections and one for the rest. Stage 1 uses Corner Room throughout; the other three columns ship unexercised and their kits are provisional.

| | Corner Room | Tumbling Run | Corridor Rush | Poster Stack |
|---|---|---|---|---|
| flat | 0.8 | 0.5 | 1.4 | 2.2 |
| roll | 0.8 | 1.5 | 0.5 | 2.4 |
| corner-in | 2.2 | 0.8 | 0.7 | 0.6 |
| tip-in | 1.8 | 1.6 | 0.5 | 0.4 |
| corner-out | 0.6 | 1.6 | 0.8 | 0.3 |
| tip-out | 0.5 | 2.2 | 0.6 | 0.3 |
| depth | 0.6 | 0.8 | 2.8 | 0.4 |
| flip | 0.5 | 1.8 | 0.6 | 0.3 |
| cut | 0.8 | 0.7 | 1.0 | 1.8 |
| whip | 1.0 | 1.3 | 1.2 | 1.3 |
| sweep | 1.2 | 1.1 | 0.8 | 0.7 |
| glide | 1.0 | 0.7 | 1.2 | 0.5 |
| gap scale | 0.85 | 1.0 | 1.1 | 0.8 |
| font kit (narrow / standard / wide / accent) | gothic / anton / wide / collegiate | gothic / bebas / stencil / teko | gothic / shoulders / stencil / teko | gothic / anton / wide / collegiate |

## 10. Camera

10.1. Two states only: still (identical pose on consecutive frames) and moving. No drift, sway, settle, bounce, wind-up or shake exists in the system [J*: "either clearly moving or not moving. It shouldn't just be wavering around and wobbling"].
10.2. Reading distance for a box of width `w` and height `h` at fill fractions `(fw, fh)`: `max((w/fw)/(2*th), (h/fh)/(2*tv))` with `tv = tan(vfov/2)`, `th = tv x 16/9`. `vfov` is a scene parameter, 40 degrees in stage 1 (then `th` = 0.64706, `tv` = 0.36397).
10.3. Poster, the default landing for a group of one cluster [J]: "quite clearly filling up the screen with the words you're supposed to be reading at the time, and then you can just kind of see the edges of the other words in the periphery".
   10.3.1. Pose: on the plaque normal through the target, face on, camera up = the word's up (so a turned element is reached by a 90-degree roll and read upright).
   10.3.2. Fill of the anchor box by final tier (width / height): XL 0.84 / 0.60; L 0.78 / 0.54; M 0.70 / 0.46; S 0.56 / 0.34. Then back off until the whole cluster fits 0.92 / 0.86. Target: the cluster box centre, moved the least amount that puts the anchor inside the safe frame (4% margins).
   10.3.3. Because every landing is centred, the eye is already where the next word lands. No separate eye-trace rule is needed.
10.4. Stack, for a landing group of 2 or 3 clusters: fit the group box in 0.86 / 0.74; words pop while the camera is still [S]. If the smallest anchor would be under 65 px tall, tighten the fit up to 0.94 / 0.86; if it is still under 65 px, the group's last cluster is split off to its own landing. Whenever more than one cluster is framed, the one being sung must be the largest word in frame, or the only one of the group yet switched on, and at least 30% of the width or 22% of the height; otherwise use its poster (the fix for v5's small HAND! and 24!).
10.5. Verbs. `T_whip = clamp(0.5 beat, 0.20, 0.30)`, `T_sweep = clamp(0.75 beat, 0.36, 0.50)`, `T_glide = clamp(1 beat, 0.50, 0.70)`, `cut` = 0. Demo: 0.30, 0.47, 0.627 s. Base weights, times family, times an energy factor, times verb cooldown (tau 1.5):

| verb | B1 (inside a plaque) | B2 | B3 | B4 and set pieces | energy factor |
|---|---|---|---|---|---|
| cut | 35 | 8 | 8 | 20 | 0.5 + 1.0 e |
| whip | 40 | 42 | 34 | 25 | 0.6 + 0.8 e |
| sweep | 20 | 40 | 46 | 35 | 1.0 |
| glide | 5 | 10 | 12 | 20 | 1.5 - 1.0 e |

   10.5.1. Time available = destination landing time minus (source landing time or accent end) minus `min_hold`. A verb is eligible when that is at least 0.8 x its duration; the duration used is the smaller of the two. If none is eligible the verb is `cut`.
   10.5.2. Rotation floors: 90 degrees needs 0.30 s, 180 degrees 0.50 s, `depth` 0.33 s. No move is shorter than 0.20 s [J: "making the camera move that fast so it jumped and like almost like flickers, that's really more annoying"]. A move that cannot meet its floor is not eligible; the fold is then redrawn by 9.7 step 1.
   10.5.3. Pickup lead: when the destination cluster has riders, prefer a duration that starts the move at or before the first rider's onset, so the camera is already swinging when THE is sung [J: "we can just be swinging the camera to King and just kind of catch the incidentally"].
   10.5.4. Even pace [J: "It's much more important for the motion to be like consistent"]: inside one shot the longest moving transit is at most 2.0 times the shortest; redraw the offending verb once.
   10.5.5. Ease [N 4a and 14, changed]: leave fast, settle long, with no jump in speed. For move progress `u` in 0 to 1: `e(u) = y0 x (u/x0)^a` for `u <= x0`, and `e(u) = 1 - (1 - y0) x ((1 - u)/(1 - x0))^b` above, with `y0 = b*x0 / (a*(1 - x0) + b*x0)`, which makes the speed equal on both sides of the join. Whip and depth: `a` 2, `b` 4, `x0` 0.34 (so `y0` = 0.5075, peak speed 2.99 times the average). Sweep and glide: `a` 2, `b` 3, `x0` 0.40 (`y0` = 0.5, peak 2.5). With `--ease symmetric` (clip E) the ease is v5's: `u < 0.5 ? (2u)^p / 2 : 1 - (2 - 2u)^p / 2`, `p` 5 for whip and depth, 3 for sweep and glide.
10.6. Interpolation. A pose is a target point, an orientation and a distance. Over a move with eased parameter `e`: target linear, orientation by quaternion slerp (shortest arc; `flip` composed explicitly about U), distance on a log scale, `position = target + normal x distance`. A corner fold is then an orbit about the hinge with type in view the whole way.
   10.6.1. Stagger [R9]: when the two distances differ by a factor of 2 or more, zooming in delays the distance change (`e' = ease((u - 0.3)/0.7)`, 0 before 0.3) and zooming out finishes it early (`e' = ease(u/0.7)`, 1 after 0.7).
   10.6.2. Bow: a sweep or glide whose target travels over 1.5 destination frame widths multiplies distance by `1 + 0.25*sin(pi*e)`.
10.7. Timing: every landing completes one frame before its anchor's onset; after every landing at least `min_hold` (8 frames) of stillness. Landings are never moved to the beat grid (2.17).
10.8. Accents for long holds. `max_still = clamp(2 beats, 0.9, 1.4) s` (demo 1.254 s). If nothing would move or pop for longer than that after a landing, add one accent on the first beat at least 0.5 s after the landing that leaves `min_hold` before departure: `punch` 40 (push in to 0.92 / 0.70 over `T_whip`; not on XL), `pull` 45 (pull back over `T_sweep` to the whole plaque in 0.86 / 0.74; needs 2 or more clusters and 10.4's floor; x1.5 on a line's last cluster), `still` 15. Cooldown tau 2 accents. The last shot of a clip takes no accent. Accent poses are face on in stage 1 (2.10).
10.9. Punch into a final anchor: in a group of 2 or 3 clusters whose last anchor is L or XL, owns 0.6 s or more and starts at least `min_hold + 0.24 s` after the landing, push from the group framing to that anchor's poster over `T_whip`, arriving one frame before its onset.
10.10. First frame [J*]: "The video needs to start before the word starts appearing". The camera starts in the first poster pose on an empty panel.
10.11. "Dancing" [J: "the camera should feel like it's just dancing, like dancing and pivoting through the world of these words"] comes from landings on sung onsets, durations that are fractions of the beat, accents on beats, even pace, flow, big moves on peaks, and moves that leave fast and settle long. Whether it dances can only be judged from video.
10.12. Motion blur [N 13, changed]. A render option, on by default, off with `--blur off`. For a frame at time `t`, the viewer projects the camera target at `t` and at `t + 0.5` frame; with `shift` = the distance between the two in pixels plus the pixel travel of a point 300 px from the centre under the roll between the two poses, the frame is the equal-weight average of `n = clamp(ceil(shift / 10), 1, 12)` renders at times spread evenly over `t` to `t + 0.5` frame. `n` = 1 on every still frame. The shutter opens at the frame time, so a landing frame and every hold frame are sharp. Word and plaque visibility are taken at `t` for all samples. Blur changes no geometry and no check.

## 11. Visibility: what is switched on, and when

His words [J]: "We can like make it temporarily invisible while we move through it or past it, and then if we zoom out at the end to show the whole canvas, we can put it back or manipulate it ... This is not journalism."

11.1. Words (`--words pop`, the baseline): an anchor switches on one frame before its onset with a stamp (scale 1.10 to 1.00 over 3 frames, about its centre, no opacity ramp). A rider switches on one frame before its own onset with no stamp. With `--words preset`, every word of a plaque switches on with the plaque and nothing stamps.
11.2. A plaque's slab switches on at the first frame of the transit into it (a `cut`: at the cut). With `preset`, it switches on at the middle frame of the last move before that transit, so it is already a neighbour when the camera lands beside it. The first plaque is on from frame 0.
11.3. The window [J for the licence].
   11.3.1. While shot i is being sung, plaques i, i-1 and i-2 are on. Nothing else is.
   11.3.2. Plaque i-3 is switched off during the transit into shot i: at the first frame of that transit on which its projected box is wholly off screen; else at the transit's middle frame; for a `cut`, at the cut.
   11.3.3. Early hide: a plaque i-2 flagged by 9.6.2 is switched off by the same ladder during the transit into shot i.
   11.3.4. `depth`: A (words; it has no slab) is switched off on the first frame on which the camera position is behind A's face plane. It then stays off until the reveal and does not count as one of the three in 11.3.1.
   11.3.5. No fades, no edge turns. A switch-off that happens on screen is counted and costs score (13.2).
11.4. Everything comes back at the reveal (14.4).

## 12. Style

12.1. Palette file, one per song: `ground`, `panel`, `panel_side`, a list of styles `{id, kind: block | fill | outline, colours, role: hero | accent | plain | quiet, group, outline_twin?, flat_fill?, on_panel?}`, `voices.adlib`, and `pins`.
   12.1.1. Room for One: the existing eleven styles from `viewer.html`; `ground` #0b0b0d; `panel` #262b40; `panel_side` #3a4060 [F, replacing the merged #14161f and #2a2d3a after N 21; colours not yet seen on screen]. Pins from his colour logic [J*]: intro RING 1 and 2 `heat-flame`, RING 3 `cavs`, RING 4 `lakers`, 24! `sixers`, ONE! `sixers`, final RING! `sixers-outline`.
   12.1.2. Contrast floors, checked at build start with the WCAG contrast formula; a failure stops the build and names the pair. `panel` against `ground` at least 1.35. `panel_side` against `panel` at least 1.35. Each style's text colour against what is behind it (its own block colour, else `panel`, else `ground` on an open plaque): at least 3.0 for anchors.
   12.1.3. Riders need 4.5. A rider whose style falls short takes the style's `on_panel` colour if it has one, else the `plain` style. `grey` gets `on_panel` #96938e.
12.2. Assigning styles, first rule that applies: a pin; a motif replay or echo copies its first occurrence; otherwise each shot draws a chord, a primary from `hero` and `accent` (cooldown on `group`, tau 2 shots) and a secondary from `plain` 70, `quiet` 30. An ad-lib shot draws its primary from `voices.adlib`. The top-tier anchor takes the primary, other anchors the secondary. Block styles only on final caps in the top half of the plaque's range; smaller words take `flat_fill`. Riders: `quiet` beside a block, else their anchor's style. A shot ending in `?` takes outline twins throughout. Outline styles never on riders [R8: thin strokes collapse when small].
12.3. Fonts [N 9; R8: his flyer uses one family in several widths].
   12.3.1. One kit per family (9.8): `narrow`, `standard`, `wide`, `accent`. Corner Room: League Gothic (`gothic`), Anton (`anton`), Archivo Black (`wide`), Graduate (`collegiate`).
   12.3.2. At build start, measure each slot font's mean advance per cap height over A to Z from the metrics file and assert `narrow < standard < wide`, with wide at least 1.4 times narrow; stop the build if not. (From the metrics file's fallback advances I estimate 0.45, 0.51 and 0.89.)
   12.3.3. Every word takes the font of its row's slot (7.4.2), riders included, except: numbers in digits and ad-lib shots take the accent font.
   12.3.4. Block capitals throughout [J*]. Do not use `serif`: it loads Graduate in `viewer.html` with different metrics from `collegiate`.

## 13. Checks and score

13.1. Hard checks, computed in Node from the same projection and the same interpolation code as the viewer (18.3), on every frame. A build failing any is discarded.
   13.1.1. Readable anchor: each anchor with its own landing has 8 consecutive frames whole inside the safe frame, cap at least 65 px, camera still, upright within 1 degree, nothing overlapping it. Anchors in a stack: the same, counted from their pop.
   13.1.2. Rider seen [J: "they can kind of see it go by even if it's too fast to read"]: each rider has at least 3 frames with half or more of its box in frame between 0.1 s before its onset and 0.6 s after its anchor's onset, and is at least 30 px tall at the anchor's landing.
   13.1.3. Focus dominance [J: "it's not clear what word you're supposed to be focusing on"; N 24, changed]. At every landing frame, with `A_s` the on-screen area of the sung anchor (or group box): (a) every other visible word that is at least half in frame has on-screen area at most `A_s / 1.6`; (b) every other visible word that is less than half in frame has on-screen area at most `A_s` and no part inside the central rectangle of half the frame's width and half its height.
   13.1.4. No wall of lines: at every landing at most 2 other visible words are parallel to the sung word within 10 degrees, between 0.5 and 2 times its on-screen cap, and at least 60% in frame, not counting its own landing group and not counting words with the same text as the sung word (a chant is one word repeated, so there is no question which line to read).
   13.1.5. No blank transit: never more than 2 consecutive frames with under 3% of the frame covered by switched-on slabs and words, after the first word.
   13.1.6. No flash: no word is first seen for fewer than 4 frames before leaving the frame or being switched off.
   13.1.7. Move floors (10.5.2) and stillness (8 still frames after each landing; no stretch longer than `max_still + 0.2 s` with nothing moving or popping, outside the reveal).
   13.1.8. Trail: 9.6.2 (a) to (c) hold for every plaque.
   13.1.9. Sync: every word is on by its onset frame; every landing completes one frame before its onset, give or take one frame.
   13.1.10. Sung word whole: in every still frame the sung anchor's box is not clipped. Neighbours may be clipped freely [J*].
   13.1.11. Window discipline: plaques i and i-1 are never off during shot i, except a plaque left by `depth` (11.3.4).
   13.1.12. Reveal (14.5).
13.2. Score, for ranking the survivors (weights are mine and unvalidated):
`score = 2.0*neighbour + 1.5*fill + 1.0*variety + 1.0*peaks + 1.0*reveal + 0.5*pace + 0.5*verb_mix - 1.5*seen_hides - 2.0*fallbacks - 1.0*flow_breaks`
   13.2.1. `neighbour` = share of poster landings where another word covers 2% or more of the frame. `fill` = mean over landings of `min(1, covered share / 0.35)`. `variety` = distinct folds used / 6, capped at 1; when the clip has 8 or more ordinary boundaries, times 0 if any fold exceeds 45% of them. `peaks` = share of set pieces that kept their drawn fold. `reveal` = `0.5 x` (share of the frame's 86% box filled by the trail's projected bounding rectangle) `+ 0.5 x min(1, summed projected plaque area / (0.25 x frame area))` [N 12c, changed]. `pace` = share of shots meeting 10.5.4 on the first draw. `verb_mix` = share of windows of 4 consecutive shot-entry moves that contain at least one of cut or whip and at least one of sweep or glide [N 11b, changed]. `seen_hides` = on-screen switch-offs / shots. `fallbacks` = (boundaries that did not keep their first-drawn fold + 2 x jumps) / boundaries. `flow_breaks` = B2 boundaries leaving by the edge opposite the last travel / B2 boundaries.
13.3. The log reports every term for the chosen build and the median of the 200, so tuning has numbers.
13.4. Seed variants [R11]. Among builds scoring within 10% of the best, A2 is the one farthest from A, and A3 the one whose smaller distance to A and A2 is largest. Distance = share of boundaries with a different fold + 0.5 x share of shots with a different layout class.
13.5. What none of this can judge, and still needs his one watch: whether it dances, whether plaques read as space or as clutter, whether pre-set words spoil a line, whether the new ease and blur beat v5's.

## 14. The reveal

His words [J]: "at the end, we can zoom out and show this like wandering path through space that looks like a game of snake played in three dimensions". And [J]: "we don't actually have to be honest about every aspect of that path".

14.1. Directions [N 12a, changed], in this fixed order, in the first plaque's axes (R, U, N): the eight diagonals `(+-1, +-1, +-1)/sqrt(3)`, then four shallow front views `normalize(+-0.35, +-0.35, 0.866)`. The camera sits along the direction from the trail's centre and looks back. Camera up = world up projected.
14.2. Both sides readable: during the reveal a slab's back face shows its own composition, unmirrored, at 72% brightness, unless a `flip` plaque is mounted there. During the song back faces show the plain panel. Open plaques show their words from both sides in the reveal, the back copy at 72%.
14.3. Fit: every slab corner inside 86% of the frame. Choice: lowest `fitted distance x (1 + 2 x share of plaques more than half covered by nearer ones) / (0.6 + 0.4 x facing)`, where `facing` = the area-weighted mean over plaques of the absolute cosine between the view direction and the plaque normal. Ties by the fixed order.
14.4. Timing and return. `T_stage = clamp(2 beats, 1.0, 1.6) s` (demo 1.254 s). Start on the first beat at or after `last anchor onset + max_still`; if that leaves less than `T_stage + 1.5 s` before `reveal_until_s`, take the latest earlier beat that does, else `reveal_until_s - T_stage - 1.5 s`. One pull-back by 10.6 with the sweep ease, then dead still to the end. For the first 30% of the move the target stays on the last sung word, so the eye is not thrown. Hidden plaques that are off screen at the start of the move switch on at once; those that would be on screen switch on newest first, one every 2 frames, each with the 3-frame stamp, so the snake completes itself as the camera leaves [N 12b for the pacing]. A plaque within 0.9 x its larger extent of the camera stays off until the camera has passed it (v5's pull-back crashed through ONE!).
14.5. Check: in the last frame every plaque is on, all corners in frame, at most 25% of plaques more than half covered. On failure take the next direction by 14.3's ranking; if all twelve fail keep the best and flag it.
14.6. Longer tails (full songs) use up to 4 stages of geometric steps in distance, each landing on a beat with a still breath of at least `min_hold` between; not needed for the demo.

## 15. Deferred, with the stage each belongs to

15.1. Race along a line [J: "racing along things that are all in one line"], stage 2: a shot of 3 or more clusters on one row whose non-final clusters own under 0.6 s on average may be tracked at constant distance (tallest cap 42% of frame height, speed cap 1.5 frame widths per second) with a true stop on the last cluster. Weight 35 against 65 for landings.
15.2. Instrumental overviews, stage 2: at gaps of 6 beats or more, a beat-timed pull-back to the section just sung, dead still, then a dive to the next anchor. No orbit.
15.3. Counter insets, stage 2, first item [J: FOR and ONE "inset in ROOM's two Os, rotated 90 degrees"; N 2b for the numbers]: a cluster mode for an anchor with one or two O, 0 or D counters and one or two short words (4 characters or fewer) that follow it. Inset width 0.66 of the counter's inner width, height at most 0.50 of its inner height, turned 90 degrees when the counter is more than 1.25 times taller than wide, raised by 0.03 of the inner height, clearance 0.14 of the smaller inner dimension. Needs a measured counter table per font and a rule for the size ranking. The same table allows a depth dive aimed through a counter.
15.4. Stage 2 styling fork, surface modes [N 1]: light and accent slabs with on-light ink twins for every style, drawn per plaque with cooldown; shown to him as one clip against the dark baseline.
15.5. Stage 2 if he prefers popped words but dislikes empty slab: panels that switch on tile by tile with each cluster [after N 19].
15.6. Stage 2 motion forks, each its own clip: bank on lateral moves (peak 4.5 degrees, zero at both ends) [N 4b]; angled pull accents (22 degrees of yaw toward the previous plaque, 11 of pitch, sung word never involved) [N 6].
15.7. Literal lexicon [J*: "These lines should behave like what the lyrics are saying"], stage 2: UP, DOWN, LEFT, RIGHT, AROUND, THROUGH, BACK and their kin multiply the matching edge or fold by 6.
15.8. Stage 2 tooling: a 640x360 animatic with sound, a live viewer with a seed picker, a WebCodecs capture trial [R12]. No native renderer.
15.9. Curved type, stage 3, first item [J: "it could use some curved effects ... texture mapping it basically onto 3D geometry"; N 7a for the numbers]: a rare plaque bent on an inward cylinder of 70 degrees (radius 0.818 W), landing poses on the local normals, collision by the enclosing box, at most one per hook. Needs curved projection in every check.
15.10. Stage 3: Song DNA (field of view of 34, 40 or 48 degrees by tempo and word rate; a light ground theme; word entry idioms; verse measure x0.85 and hook x1.15) [N 10]; style card, catalog history, built-in palettes; the other families shown to him as clips; variable-width fonts [R8]; 45-degree folds; shared-letter lockups; authored multi-shot figures, including a cube of chant plaques [N 3]; global shot breaking; multi-stage reveals with a turn between stages [N 12b].
15.11. Each stage reruns the hook and reports score changes.

## 16. What I did and did not check in this pass

16.1. Read in full: the reconciliation brief, my merged rulebook, Neon's creativity pass, `build_scene.mjs`, `viewer.html`, `capture.mjs`, `h1 words.json`, the v5 render provenance file, his notes on v5, his two notes on the portrait preview, and the song map summary. Looked at: v5 sheets 1 and 3, portrait sheet 1, and his flyer. Searched his other notes for the quotes Neon cites on curves and the O insets and found them.
16.2. Checked by arithmetic: the one-frame jump of the symmetric whip (Neon is right: 54% on a 7-frame move); the speed jump in Neon's ease (its fault); the panel contrast (about 1.1 on the merged colours, about 1.4 on the new); grey and red on the new panel (3.3 and 3.2); the hook's riders, shots and landing groups under the new rules (5.7); the demo's beat-derived durations.
16.3. Not done: I re-read none of the twelve research reports, so Neon's citations of report items (Bois, Fong, the pavement-marking rule) are unverified by me, and where I kept a report tag from the merged rulebook it rests on that earlier reading. I did not look at v5 sheets 2 and 4 or portrait sheets 2 and 3 in this pass. I watched no video. I ran no code: the assertions of 5.7 are hand-worked and nothing in sections 7 to 14 has been executed.
16.4. Two tensions carried over from the merge, still needing his eye. Spacing: the lateral passes wanted tight masonry; he asked for "a little bit closer than they were in that little demo" [J], so the baseline gap is in the middle and tight masonry is fork B. Planning ahead: he said "you design it one moment at a time" [J]; this rulebook samples one move at a time and looks ahead only to refuse a collision.
16.5. That panels and density are what made the portrait preview's first half work is an inference of the lateral passes, not something he said. Hence fork C.
16.6. This pass changed the baseline's motion (ease, blur) away from v5's on my judgment and Neon's arithmetic, not on anything he said. Hence clip E.

## 17. Parameter table

| # | parameter | default | rule | reason | basis |
|---|---|---|---|---|---|
| 17.1 | frame, fps, vertical field of view | 1280x720, 30, 40 degrees (a scene parameter) | scope, 10.2 | fixed by the brief; lens may vary per song later | J*, N 10 |
| 17.2 | `N` builds | 200 | 4.4 | cheap in Node; enough to rank | R11, F |
| 17.3 | zero-IOI guard | 0.04 s | 5.2 | aligner collisions | F |
| 17.4 | rider IOI; function-word IOI | 0.30 s; 0.45 s | 5.5.1 | too quick to land on | J, F |
| 17.5 | long-word rider limit | 7 letters, 0.20 s | 5.5.2 | cannot be read in passing | F |
| 17.6 | max riders in a row | 3 | 5.5.3 | more is a line | F |
| 17.7 | pickup run | 2 or 3 riders, no function word | 5.5.5 | content words are not footnotes | N 5, F |
| 17.8 | B2 comma IOI; gap rule; repeat IOI | 0.45 s; 0.9 s and 1.8x median; 0.38 s | 5.4.3 | phrase breaks | F |
| 17.9 | B4 gaps | 3 beats at a line end; 6 beats anywhere | 5.4.1 | long rests | F |
| 17.10 | shot caps; chant run; echo run | 5 clusters, 9 words; 3 or 4; exactly 2 | 5.6 | plaque stays to 3 rows; echoes turn | F, N 3 |
| 17.11 | `min_hold`; `whip_floor`; `min_stop_time` | 8 frames; 0.20 s; 0.467 s | 5.6.4 | readable floor; no flicker | S, J |
| 17.12 | group max clusters | 3 | 5.6.4 | one still frame, three reads | F |
| 17.13 | emphasis weights | 0.30, 0.20, 0.15, 0.15, 0.10, 0.10, -0.25 | 6.1 | held and final words are loud | F |
| 17.14 | tier quotas | 15, 30, 25, 30% | 6.2 | mid sizes are rare in the reference | S, F |
| 17.15 | nominal caps | 0.45, 0.68, 1.00, 1.50 | 6.3 | flyer and poster ranks | R8 |
| 17.16 | rider scale; quick-single limit; floor | 0.42; 0.32 under 0.22 s; 0.13 of plaque max | 6.3 | catchword ratios; bridges read larger | R8, N 15 |
| 17.17 | chant step; echo measure | divide by 1.25 from the last, floor 0.45; x1.25 | 6.4, 9.5.4 | repeats escalate | F, N 3 |
| 17.18 | pickup caps | 0.70, 0.55, 0.45 of the final anchor | 6.5 | a build toward the last word | N 5, F |
| 17.19 | padding | 0.28 block, 0.08 other | 7.1 | as v5 | F |
| 17.20 | rider arrangements, one rider | 40, 40, 20; tau 2 | 7.2.1 | THE over KING! worked | S, F |
| 17.21 | rider arrangements, two or three | 50, 30, 20 | 7.2.2 | on the camera's way in | N 15, F |
| 17.22 | rider gaps | 0.10 anchor cap; 0.25 rider cap | 7.2.3 | riders belong to the anchor | F |
| 17.23 | measure | 1000 x (0.8, 1.0, 1.25) | 7.3 | plaques differ in size | F |
| 17.24 | row scale band; two-up and perp band | 0.78 to 1.30; 0.55 to 1.80 | 7.4.3 to 7.4.5 | tiers survive fitting now that width does the work | N 9, F |
| 17.25 | width slots | 3 per kit, one per row | 7.4.2 | the flyer's method | R8, N 9 |
| 17.26 | `mortar` | 0.30; fork B 0.15 | 7.4.6 | the middle he asked for; the flyer's value as the fork | J, R8, F |
| 17.27 | gap jitter | 0.85 to 1.15 | 7.4.6 | avoids a ruled look | F |
| 17.28 | layout score weights | 0.35, 0.25, 0.20, 0.20, 0.10, -0.30 | 7.5 | fill first, then fidelity | F, N 9 |
| 17.29 | layout tolerance; cooldown | 0.05; tau 2 | 7.5.2 | variety among near-equal fits | F |
| 17.30 | aspect band | 1.0 to 2.6, zero at 0.6 and 4.0 | 7.5.1 | suits a 16:9 pull accent | F |
| 17.31 | panel padding; slab thickness | 0.35 mean cap; 0.05 W | 7.6 | reads as an object | F |
| 17.32 | slab gaps B2, B3, B4 | 0.45 to 0.80; 0.70 to 1.20; 1.40 to 2.40 x hg | 8.1 | closer than v5, looser than the canvas | J, F |
| 17.33 | alignment weights; overlap floor | match 55, others 15 each; 40% | 8.1.1 | neighbours meet across the fold | N 8, F |
| 17.34 | depth offset; flip offset; jump offset | reading distance + 0.5 cap + thickness; 0.5 hg; 2.5 extents | 8.6 to 8.8 | clear of the slab | F |
| 17.35 | peak weights | 0.35, 0.25, 0.20, 0.20 | 9.2 | class leads | F |
| 17.36 | set-piece share; spacing | 20%; 3 apart | 9.3 | big moves stay rare | F, R11 |
| 17.37 | set-piece fold weights | 32, 30, 22, 16 | 9.3 | flips rarest | F |
| 17.38 | fold table | 9.4 | 9.4 | gentle at weak joints | J, F |
| 17.39 | energy curves | 0.65, 0.35, 0.75, 0.5 | 9.4.2 | energy sharpens moves | F |
| 17.40 | cooldown depth; tau by fold; axis tau | 0.9; 1.5, 3, 4, 6; 2 | 9.4.3 | soft preference, never a ban | J |
| 17.41 | motif scale on last occurrence | 1.25 | 9.5.1 | final hook lands hardest | F |
| 17.42 | streak | 0.12; 2 (60%) or 3 (40%) | 9.5.3 | a move may repeat on purpose | J |
| 17.43 | echo fold weights; echo corner gap | flip 55, corner-in 45; 0.30 hg | 9.5.4 | the same word, turned | N 3, F |
| 17.44 | edge weights; edge tau | 45, 25, 18, 12; 2 | 9.6.1 | reading runs right and down | F |
| 17.45 | slab growth for collision | 60 units | 9.6.2 | never touching | F |
| 17.46 | hairpin ratio | 0.6 | 9.6.2 | no doubling back | J, F |
| 17.47 | camera clearance; sight rays | 0.5 cap; 9 | 9.6.2 | nothing in the lens or the way | F |
| 17.48 | heading; envelope; factors | (0.80, 0.45, 0.40); (1.33, 0.75, 0.75) L at 1.2 L; 0.3 and exp(-2x) | 9.6.3 | a trail that fits 16:9 | F |
| 17.49 | flow factors | 1.4, 0.5 | 9.6.4 | follow through | R10, F |
| 17.50 | balance | decay 0.85; limit 1.5; 0.35 and 1.45 | 9.6.5 | no spiral | F |
| 17.51 | fold retries; backtracks | 4; 200 | 9.7 | bounded search | F |
| 17.52 | family table | 9.8 | 9.8 | four looks, one exercised | F |
| 17.53 | poster fills | 0.84/0.60, 0.78/0.54, 0.70/0.46, 0.56/0.34 | 10.3.2 | fills the frame, leaves an edge | J, F |
| 17.54 | cluster fit; safe margin | 0.92/0.86; 4% | 10.3.2 | riders in frame, word whole | F |
| 17.55 | stack fit; tightest fit; min anchor; min rider | 0.86/0.74; 0.94/0.86; 65 px; 30 px | 10.4, 13 | legible at 720p | F |
| 17.56 | sung-word floor in groups | 30% width or 22% height | 10.4 | fixes v5's small heroes | F |
| 17.57 | verb durations | whip clamp(0.5 beat, 0.20, 0.30); sweep clamp(0.75, 0.36, 0.50); glide clamp(1, 0.50, 0.70) | 10.5 | on the beat grid | S, F |
| 17.58 | verb weights; tau | table 10.5; 1.5 | 10.5 | energy picks sharpness | F |
| 17.59 | compression; rotation floors | 0.8; 0.30, 0.50, 0.33 s | 10.5.1, 10.5.2 | big turns need time | S, F |
| 17.60 | pace ratio | 2.0 | 10.5.4 | even pace | J |
| 17.61 | ease, whip and depth | a 2, b 4, x0 0.34 | 10.5.5 | leave fast, settle long, no speed jump | N 4a, F |
| 17.62 | ease, sweep and glide | a 2, b 3, x0 0.40 | 10.5.5 | the same, gentler | N 4a, F |
| 17.63 | ease, clip E | symmetric power 5 and 3 | 10.5.5 | v5's motion, for comparison | F |
| 17.64 | stagger; bow | 0.3 at ratio 2; 0.25 over 1.5 widths | 10.6 | arrive then punch; show the space | R9, F |
| 17.65 | `max_still` | clamp(2 beats, 0.9, 1.4) s | 10.8 | keeps the pulse | S, F |
| 17.66 | accent weights; timing | 40, 45 (x1.5), 15; tau 2; first beat after 0.5 s | 10.8 | one decisive move per long hold | F |
| 17.67 | punch fill; punch-in rule | 0.92/0.70; L or XL, owns 0.6 s, lead 0.507 s | 10.8, 10.9 | tight but whole | F |
| 17.68 | blur shutter; sample rule; cap | 0.5 frame from the frame time; one per 10 px; 12 | 10.12 | motion reads as motion; landings stay sharp | N 13, F |
| 17.69 | stamp | 1.10 to 1.00 over 3 frames | 11.1 | hard arrival, no fade | S, F |
| 17.70 | window | current plus 2 back | 11.3 | neighbours stay, the rest goes | J, F |
| 17.71 | depth switch-off | first frame behind the face plane | 11.3.4 | never vanishes in front of the lens | N 2a |
| 17.72 | colours | ground #0b0b0d, panel #262b40, side #3a4060, grey on panel #96938e | 12.1 | slabs must be visible | N 21, F |
| 17.73 | contrast floors | panel 1.35; side 1.35; anchors 3.0; riders 4.5 | 12.1 | legibility by size | F |
| 17.74 | chord secondary | plain 70, quiet 30 | 12.2 | grey is a spice | F |
| 17.75 | slot width assertion | narrow < standard < wide; wide at least 1.4x narrow | 12.3.2 | slots by measurement, not by name | F |
| 17.76 | readable frames; upright | 8; 1 degree | 13.1.1 | reference floor | S, F |
| 17.77 | rider seen | 3 frames, half in frame | 13.1.2 | seen going by | J |
| 17.78 | dominance | 1.6 for words half in frame; 1.0 and outside the central half otherwise | 13.1.3 | one clear focus, big edges allowed | J, N 24 |
| 17.79 | wall of lines | 2 others; 10 degrees; 0.5 to 2x; 60%; same text exempt | 13.1.4 | the rejected second half | J, F |
| 17.80 | blank transit; flash | 3% for 2 frames; 4 frames | 13.1.5, 13.1.6 | no black, no flicker | J, F |
| 17.81 | score weights | 2.0, 1.5, 1.0, 1.0, 1.0, 0.5, 0.5, -1.5, -2.0, -1.0 | 13.2 | neighbours and fill lead | F |
| 17.82 | neighbour area; fill target; reveal area target | 2%; 35%; 25% | 13.2.1 | the liked first half; a snake, not a ribbon | J, N 12c |
| 17.83 | variant band; distance weights | 10%; 1 and 0.5 | 13.4 | differ without being worse | R11, F |
| 17.84 | reveal directions | 8 diagonals + 4 shallow front (0.35, 0.35, 0.866) | 14.1 | readable plaques | N 12a, F |
| 17.85 | reveal fit; facing term; back-face brightness | 86%; 0.6 + 0.4 facing; 72% | 14.2, 14.3 | whole snake, readable | F |
| 17.86 | reveal stage; hold; target hold; return pace | clamp(2 beats, 1.0, 1.6) s; 1.5 s; 30%; one plaque per 2 frames | 14.4 | lands on the beat; the snake completes itself | R10, N 12b |
| 17.87 | reveal cover limit; near rule | 25%; 0.9 extent | 14.4, 14.5 | path stays a path | F |
| 17.88 | fuzz sizes; alarm level | 1,000 and 200; 30% | 18.5 | find rule clashes early | F |

## 18. Terra build spec, stage 1

18.1. What stage 1 is. A Node pipeline that turns `h1 words.json` into seven `scene.json` files for the h1 hook (0 to 21.971 s, reveal to 24.5 s), each with a build log, a render provenance file and two debug SVG sheets; a fuzz report; and viewer and capture changes so the supervisor can render them. Everything is generated fresh. `h1 moves.json` is not read and no hand-made move list exists anywhere in the pipeline.
   18.1.1. In stage 1: sections 4 to 14 of this file, with one family (Corner Room), one palette (Room for One) and the demo window.
   18.1.2. Not in stage 1: everything in section 15.
   18.1.3. You run in a sandbox and must never launch Chrome. You do not render. The supervisor renders from your render list (18.6.5). Delete only inside your own temp folder; list anything else you think should go in your report.

18.2. Where. The build folder is the git-initialised copy of `Path-first 3D - h1` that the supervisor prepared at `prototype/Deterministic engine - h1/` (it holds `build_scene.mjs`, `viewer.html`, `capture.mjs`, `h1 words.json` and one baseline commit). If your build prompt names a different folder, use that. Commit after each step of 18.4. Inputs outside the folder, read only: `~/Experiments/Kinetic Type Engine/fonts/room-for-one-variety.metrics.json` and `~/Experiments/Room for One Music Video/analysis/Song map.json`. If the sandbox cannot read them, stop and report; do not invent data.

18.3. Files. Pure functions, no clock, no `Math.random`, no network.

| # | file | holds |
|---|---|---|
| 18.3.1 | `rng.mjs` | FNV-1a, mulberry32, named streams, weighted choice (4.3, 4.5) |
| 18.3.2 | `plan_words.mjs` | sections 5 and 6 |
| 18.3.3 | `compose_plaques.mjs` | section 7; reuses `measure()` and `wordBox()` lifted from `build_scene.mjs` |
| 18.3.4 | `plan_trail.mjs` | sections 8 and 9 |
| 18.3.5 | `interp.js` | pose interpolation, both eases, stagger, bow, projection (10.2, 10.5.5, 10.6). One implementation, written as a plain script that sets `globalThis.KT_INTERP`, so Node imports it for the checks and `capture.mjs` inlines it into the page. The viewer must not carry a second copy of this maths. |
| 18.3.6 | `camera.mjs` | sections 10 (except 10.12), 11 and 14 |
| 18.3.7 | `style.mjs` and `palettes/room for one.json` | section 12 |
| 18.3.8 | `checks.mjs` | section 13 |
| 18.3.9 | `provenance.mjs` | 18.7 |
| 18.3.10 | `debug_svg.mjs` | a plaque sheet (every plaque face on, word boxes, text, slot, fitted caps, row scales) and a trail sheet (slab boxes from three axes, numbered, with fold names) |
| 18.3.11 | `build_best.mjs` | 4.4, fork flags, pins, variants; the command line of 18.6.2 |
| 18.3.12 | `make_demo.mjs`, `fuzz.mjs`, `test_rules.mjs` | 18.6 |
| 18.3.13 | `viewer.html` | changed: slabs as boxes in `panel` and `panel_side`; no slab for `open`; one textured plane per word, 0.5 units above the face, with its own R, U, N; visibility from `on` and `off` frames with no opacity ramp; the 3-frame stamp; poses from `KT_INTERP`; back-face copies in the reveal (14.2); blur by 10.12 (accumulate the `n` renders on a 2D canvas with alpha `1/(k+1)` for sample `k`, counting from 0); the fog and the old pop and opacity code removed. Keep front-side materials, the font list and `frameJPEG()`. |
| 18.3.14 | `capture.mjs` | changed only to inline `interp.js` at a `/*INTERP*/` placeholder and to accept `--blur on|off` after the existing positional arguments. Keep its cleanup code as it is. |
| 18.3.15 | `build_scene.mjs` | left in place, unused, for reference |

   18.3.16. `scene.json`: `meta` {clip, flags, title, salt, build index, fps, vfov, frames, palette colours}; `plaques` [{id, shot, C, R, U, N, w, h, thickness, surface, on, off, reveal_on}]; `words` [{id, text, plaque, cluster, role (anchor, rider, pickup), cap, font, style, colours, w, h, fontPx, pad, C, R, U, N, on, stamp, off, reveal_on}]; `cams` [{f0, f1, kind (transit, accent, reveal), verb, ease {a, b, x0} or {p}, from {target, R, U, N, dist}, to {the same}, bow, stagger, hold_target_until}], with stillness between keys. All positions are world units, all times frames.

18.4. Build order. Each step is tested before the next and committed.
   18.4.1. `rng.mjs`, `plan_words.mjs`, and the assertions of 5.7 in `test_rules.mjs`.
   18.4.2. `style.mjs` with the contrast floors and the slot width assertion (12.1.2, 12.3.2), then `compose_plaques.mjs` and the plaque sheet.
   18.4.3. `plan_trail.mjs` and the trail sheet.
   18.4.4. `interp.js`, `camera.mjs`, `checks.mjs`.
   18.4.5. `build_best.mjs`, pins and forks, `provenance.mjs`, `make_demo.mjs`.
   18.4.6. `fuzz.mjs` and the report.
   18.4.7. `viewer.html` and `capture.mjs`.

18.5. The fuzz report. `node fuzz.mjs` runs single builds, no rendering: 1,000 salts on the hook (`demo#0` to `demo#999`; the first 200 are clip A's candidates) and 200 salts on the full `Song map.json`. It prints a summary and writes `out/Stage 1 demo/fuzz report.md` with, for each of the two runs:
   18.5.1. Per hard check (13.1.1 to 13.1.12): the share of builds failing it. Any check failing in over 30% of builds is listed first under the heading "Likely rule clashes" and is not tuned silently.
   18.5.2. The share of builds using a `jump`; the distribution of backtracks; the share of echo boundaries that kept their drawn fold.
   18.5.3. The score: minimum, quartiles, maximum, and the median of every term.
   18.5.4. Mean plaque fill; use of each layout class, slot and rider arrangement; use of each fold against its intended share from the weights.
   18.5.5. For clip A's 200: how many survive, and the five best with every score term.
   18.5.6. The full-song run leans on rules not yet built (15.1, 15.2) and on sections the song map leaves empty. Label its numbers a scaling probe.

18.6. Command lines you must provide.
   18.6.1. `node test_rules.mjs`: all tests, exit code 0 only if every one passes. Tests: 5.7.1 to 5.7.4; palette and slot assertions; ease values (`e(0) = 0`, `e(1) = 1`, equal slope either side of `x0` to 1e-6, never decreasing); the same seed giving byte-identical `scene.json` twice; a fork with pins reproducing A's choices when no test fails; no em-dash in any written `.md`.
   18.6.2. `node build_best.mjs --words "h1 words.json" --map "<path to Song map.json>" --title "Room for One" --palette "palettes/room for one.json" --salt demo --window 0,21.971,24.5 --out "out/Stage 1 demo/<clip folder>"` plus the fork flags `--mortar 0.15`, `--panel off`, `--words preset`, `--ease symmetric`, `--pick 2`, `--pick 3`, and `--pins "<path to another clip's build log.json>"`.
   18.6.3. `node make_demo.mjs`: builds all seven clips of 18.8 in order, writes every file of 18.6.4, and prints one line per clip: survivors of 200, chosen build index, score, and for forks the number of shots that diverged from A's pins.
   18.6.4. Per clip folder, named as in 18.8: `scene.json`, `build log.json`, `Render provenance - <clip name>.md`, `plaque sheet.svg`, `trail sheet.svg`.
   18.6.5. `out/Stage 1 demo/Render list.md`: for each clip, the exact `node capture.mjs "<scene.json>" "<output mp4>" 30 0 24.5 --blur on` line (clip E: `--blur off`) for the supervisor to run outside the sandbox. Output names: `Room for One - h1 deterministic stage 1 - Clip A baseline.mp4` and so on.
   18.6.6. `node fuzz.mjs` (18.5).

18.7. Render provenance, one file per clip, written at build time [J wants every judge to see the code behind each render]. Contents:
   18.7.1. Header: clip name, the full command line, title, salt, chosen build index, flags, the git commit of the build folder, and the pipeline with the file and function that owns each stage.
   18.7.2. One table row per shot: shot number and its words with roles; boundary class into it and whether it is a set piece or an echo; the intended rule decision (the first draw from the weights: fold, verb, exit edge, sign, alignment, gap, layout class, slots, rider arrangements, styles, and for forks the pinned value); what the code changed on its own (each ladder step of 9.7 with the test that failed, clamped or redrawn verbs, an early hide, a stack that was split, a pin that could not be kept); the final decision; landing frames, accent frames, switch-on and switch-off frames with whether each switch-off was on screen; and the code path (file and function for each decision).
   18.7.3. After the table: the reveal direction chosen and the ones refused with reasons; every score term for this build beside the median of the 200; hard checks passed; and for forks a plain list of shots that differ from clip A in more than the fork's one thing.
   18.7.4. Every "changed on its own" entry must be traceable to an entry in `build log.json`.

18.8. The seven clips. All use salt `demo` and the same inputs.

| # | folder and clip name | what changes against A | flags | question it answers |
|---|---|---|---|---|
| 18.8.1 | `Clip A baseline` | nothing: panels on, mortar 0.30, words pop on their onsets, new ease, blur on, best score of 200 | none | does the system work |
| 18.8.2 | `Clip B tight masonry` | mortar 0.15 | `--mortar 0.15 --pins A` | how close is close enough |
| 18.8.3 | `Clip C no panels` | every plaque open: words on the ground colour, as in v5 | `--panel off --pins A` | do plaques help, or was v5's sparseness fine |
| 18.8.4 | `Clip D words preset` | all words of a plaque already set when the camera arrives | `--words preset --pins A` | discovered room or built as sung |
| 18.8.5 | `Clip E motion as in v5` | symmetric ease and no blur; geometry and timing identical to A | `--ease symmetric --pins A`, rendered `--blur off` | is the new motion better than v5's |
| 18.8.6 | `Clip A2 seed variant` | another build from the same 200, chosen by 13.4 | `--pick 2` | does the seed give real variety |
| 18.8.7 | `Clip A3 seed variant` | the third by 13.4 | `--pick 3` | the same |

   18.8.8. Pins: B, C, D and E reuse A's sampled choices per shot (fold, edge, sign, alignment, gap draw, verb, layout class, slots, rider arrangements, styles). If a pinned choice fails a test under the fork's geometry, the normal ladder takes over from that shot and the divergence is logged and printed, so he is told when a fork clip differs in more than its one thing. Clip E must show zero divergence; if it does not, that is a bug.
   18.8.9. Clip E changes two things on purpose, because together they are one question (v5's motion against the new). The two flags are separate, so either can be rendered alone if he asks.

18.9. Acceptance checks you must pass before handing back. Report each as pass or fail with the evidence; a fail you could not fix is reported, not hidden.
   18.9.1. `node test_rules.mjs` exits 0.
   18.9.2. `node make_demo.mjs` run twice gives byte-identical `scene.json` for all seven clips (compare hashes).
   18.9.3. Clip A has at least 3 survivors of 200. If it has fewer, do not loosen a check or a threshold: report which checks kill the builds, with the fuzz numbers.
   18.9.4. `grep` finds no `Math.random`, `Date.now` or `new Date` in any module of 18.3.1 to 18.3.12 or in `interp.js` (`capture.mjs` keeps its existing uses for the port and the temp-folder label; it is not a build module).
   18.9.5. The fuzz report exists with every part of 18.5, and the summary names every check over the 30% alarm.
   18.9.6. Clip E's `scene.json` differs from A's only in `meta` and the `ease` fields. B, C and D each list their divergences.
   18.9.7. Every clip folder holds the five files of 18.6.4; each provenance file has one row per shot (10 expected) and passes 18.7.4.
   18.9.8. A Node dry run of the viewer's logic: for clip A, step all 735 frames through `KT_INTERP` and the visibility rules and confirm that the still frames found equal the holds planned by `camera.mjs`, and that the camera pose on each landing frame equals the planned landing pose. `node --check` passes on every `.mjs` and on `interp.js`.
   18.9.9. No module you wrote or changed reads or mentions `h1 moves.json` (the old `build_scene.mjs`, left unused, still names it in a comment).
   18.9.10. No Chrome was launched, no file outside the build folder was changed, and any temp folder you made carries a `TEMP_README.md` and is removed at the end.
   18.9.11. Your report states what you could not verify. At the least: nothing was rendered, so the viewer and capture changes are untested in a browser; colours and fonts were not seen; and any rule in this file that you found ambiguous, with the reading you took.

18.10. If a rule here is wrong. A specification is not authority. If a rule cannot be built as written, contradicts another, or gives a result that is plainly not what the rule is for, do not force it and do not quietly bend it: build the nearest reading, record it in the report with the evidence, and carry on.

Be honest in your response.
