# Engine fix brief 4: Fable's recheck of Big Toothy Grins rough cut 4 (22 November 2026)

Supervisor: T2 LeBron chat (Claude). Builder: Opus 5.5. Repo `~/Experiments/Kinetic Type Engine`, branch `world-canvas`.

Fable's report: `~/Experiments/Big Toothy Grins Music Video/reviews/Fable recheck - rough cut 4 - 22 November 2026.md`. Read it. Jefferson asked that every improvement Fable suggests be made before the video is final, so all three groups below are in scope; do them in this order and commit after each.

Important: three items your brief 3 results file called fixed are still visible on the render. For each, find why your check passed while the picture shows the fault, fix the check as well as the scene, and say so in the report.

## 1. BLOCKING: section 7 (Chorus two), 126.3 to 127.2 s, "and we attack"
Not fixed and now worse: small AND at the top edge, WE at the bottom, and the BACK plaque seen from behind, half off the right edge, shows a large mirrored green "CK" for about 0.9 s. Fable's guess (unchecked): the clipped plaque counts as the anchor in the sparse-frame check. Engine rules: hide plaques seen from behind outside their focus window (no mirrored text, ever, on screen), and clipped words or plaques never count as anchors. Then re-pick section 7.

## 2. Polish listed as cleared but still visible
2.1. White chevron under INSIDE at 150.9 to 151.2 s.
2.2. CUTS halved at the top edge at 72.9 to 73.6 s.
2.3. Clipped "FF" beside WIDE for the whole hold at 148.9 to 149.6 s (not just 4 frames).

## 3. Backlog Fable says can wait (do it now if it does not break 1 and 2)
3.1. Speck-sized: SO YOU CAN 42.2 s, sideways ONE 93.7 s, IT'S 158.0 s.
3.2. Lone small words (your brief 3 item 6): find a planner change, for example a bigger minimum plaque scale for a lone word, rather than a camera push.
3.3. Thin edge slivers at 59.6, 157.9, 164.9 and 175.0 s.
3.4. 1 to 3 fully black frames between layouts at 53.27, 55.40, 71.37, 73.60, 84.43, 89.10, 111.6, 144.5, 155.17, 156.33 and 160.33 s, which play as hard cuts. Engine rule: no fully black frame mid-song unless the song input asks for one.

## Build and report
1. Build Big Toothy Grins into `engine output/Rough cut 5 - 22 November` (replacing your earlier keyword-mode build there, which was identical to rough cut 4).
2. Keep every existing gate passing (0 overlap, 0 partly shown focused words, no blank opening, still ending).
3. Room for One regression build into `engine output/Engine fix test 5 - 22 November` with `--reveal-coverage 0.05`; report any gate it newly fails.
4. Report each item with Fable's timestamp: fixed, partly, or not, measured on the final scene, and how you checked it.

## Rules
1. Never launch Chrome or render video; the supervisor renders.
2. Delete only inside your own temp folder, apart from replacing the build output named above; list anything else you think should go in your report.
3. Don't use `sed -i`.
4. Be honest in your response.
