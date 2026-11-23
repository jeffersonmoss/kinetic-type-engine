# Engine fix brief 5: results (22 November 2026)

Builder: the T2 engine chat (Claude, Opus 5.5). Engine: `Kinetic Type Engine/deterministic`, branch `world-canvas`. Covers sections 1 to 5 and changes 2 to 5. Nothing was rendered; the screenshots to take are in part 7.

## 1. Outcome first

1. Big Toothy Grins rough cut 6 is built and re-joined under the final rules (changes 3 to 5): `~/Experiments/Big Toothy Grins Music Video/engine output/Rough cut 6 - 22 November/`, exit 0.
   1. Gates: overlap 0 (rescanned on the final scene), partly shown 0, no empty stretch over 0.25 s, first and last frames non-empty, still ending PASS, sync 0 late, idle 0.
   2. Sections were built once, with the jersey font and bold. All later changes (Type rules numbers, importance, size order) were applied by re-joining (`--skip-build`); no section was rebuilt again.
2. The Type rules check finds 20 failures in rough cut 6, all rule 1 (letters too small), in 6 sections. None of them is an unhandled case:
   1. 17 are small words the engine dropped and then brought back, because dropping them left a stretch over 0.25 s empty that no fill could clear. The empty-screen rule is unwaivable, so it outranks the size rule.
   2. 3 are important words that cannot grow and that Type rule 2 forbids dropping: BONES at 147.27 s (10.5%), TREY at 158.17 s (9.5%) and ANT at 89.80 s (13.2%).
   Rebuilding those sections is the only way to clear them; the list is in part 6.
3. Raise the Flagg rough cut 2 (checked, not rebuilt) has 262 Type-rule failures: rule 1: 107, rule 2: 2, rule 3: 127, rule 4: 26. Most clear with a rebuild under the new engine (part 6.2).
4. Room for One: skipped for the Type rules (change 4). Its test 6 run (`engine output/Engine fix test 6 - 22 November`) was made before changes 3 to 5, under the change 2 code. It passed overlap 0, partly shown 0 and no long empty stretch. Exit 1 came only from the two failures it already had: reveal coverage (9.6%, was 10.8%) and the 76ers ring.
5. Addendum: on hold. Neither the item 26 text nor the cost change was written; KIT.md item 26 and the repair costs are unchanged.
6. The Big Toothy Grins song input change (`engine input/song settings.json`) is not committed. Its folder carries other chats' uncommitted changes. The change covers `player_names` and the WOLVES and TIMBERWOLVES colours.

## 2. H_ref

1. Change 5 sets the minimum at 9% crowded and 13.5% with room, from the larger HE at 40.6 s measured at 64 px. The engine uses 9% and 13.5%.
2. My measurement of the same word (`w3001`, frames 1218 to 1226) is 66 px at 720 (9.2% of frame height). It comes from the scene geometry (projected cap line), not from pixels. 66 against 64 is close enough that I kept the approved 9%.

## 3. Engine changes

1. **Size (Type rules 1 and 2)**, `composition.mjs` enforceMinSize.
   1. Per camera hold, each shown word's largest letters are measured.
   2. Minimum: `min_word_h` 0.09 crowded, `room_factor` 1.5 (13.5%) otherwise. Crowded means 3 or more words at least half in frame, or boxes covering 30% or more of the frame.
   3. A short word is grown, about its centre or away from a neighbour, up to 2.5 times. A growth is kept only with no new overlap (counted with every dropped word shown) and no worse shown-whole result.
   4. A word that can't grow is dropped only if not important. Important means keyword mode rank 2 or 3: a name, number, player name or line-end rhyme word, ranked by `keywords.mjs` wordRanks. An important word stays and is reported.
   5. Words entering past a clip plane (tick, slide-out) or on a hinge are measured and may be dropped, but never grown.
   6. The pass runs after the clutter and unreadable hides and repeats until nothing changes; then those hides run again.
   7. The empty-screen rule outranks it: per stretch the fills can't clear, one drop or hide (the one covering most of it) is undone, for up to 12 rounds.
2. **Dropped words allowed:** dropped words are out of the shown-whole gates, listed as allowed by the sync check, and not counted as activity by the idle check.
3. **Colours (rule 3):** non-team text snaps to cream `#F3EBDD`, white, grey 75% `#BFBFBF` or grey 50% `#808080`. Team styles keep theirs. The snap happens at section build (`normalizePalette`), so an already-built scene keeps its old colours until rebuilt.
4. **No outlines (change 2, rule 3):** every word is solid. Outline styles become their solid twins, white edges are removed, and wordmarks lose their stroke and accent rings. 15 words in Big Toothy Grins.
5. **Jersey font (rule 4):**
   1. Graduate has one weight (Google Fonts serves 400; asking for 700 fails), so its thinness is the font's own.
   2. It is bolded by an outward same-colour stroke, `jersey_bold` 0.10 × cap wide and mitred, and the word box carries the width.
   3. New song setting `player_names` puts names in the jersey font; numerals already were.
6. **Fill 5:** a camera move into an empty hold is skipped, and the camera keeps its last filled pose, but never when a word is sung in that hold. A first version without that guard left YOU MISS AND at 5% at 36.2 s; caught by the check and fixed.
7. **Overlap gate** rescans the final scene as written.
8. **Type rules check:** `type_rules_check.mjs`, read-only, reports by section.
9. **KIT.md:** new "Type rules" section, word for word, with change 5's numbers. The brief 5 section is updated to match.

## 4. Song input (Big Toothy Grins)

1. WOLVES (rule 4: the wordmark in its own colours) is its own navy lettering on an aurora green block (`#78BE20`), about 7:1 contrast. No stroke or accent. Navy on the lake blue block measured about 2.4:1 without the white stroke.
2. TIMBERWOLVES has no wordmark artwork in the input, so it would be drawn as text, green on navy. It does not appear in rough cut 6, so nothing fails. Wordmark art is needed before any song uses it.
3. `player_names`: Jaden, McDaniels, Rudy, Gobert, Ayo, Dosunmu, Melo, Ant, Shannon, Bones, Trey, Lyles.

## 5. Counts, Big Toothy Grins rough cut 6

1. Grown: 72 words. Dropped: 39 by the size pass, of which 14 were undone for the empty-screen rule, so 25 are dropped in the final scene.
   1. The 25: THAT'S, THE, OF, ARE, GETS, THE, SETS, HE ×3, ONE, GONE, WHOLE, PACK, THAT, THE, IN, NOT, MEN, BOTH, UP, FOR, A, THE, WE.
   2. All are non-important under the ranking.
2. Hidden for a later hold: 11 words. Important words kept under size: 3. Outlines made solid: 15. Jersey-font words shown: about 29.

## 6. Type-rule failures (for Jefferson to pick what to rebuild)

Full lists, one line per failure with measured values and what a rebuild would change:
1. `~/Experiments/Big Toothy Grins Music Video/engine output/Rough cut 6 - 22 November/Type rules check - 22 November 2026.md`
2. `~/Experiments/Raise the Flagg Music Video/engine output/Rough cut 2 - 22 November/Type rules check - 22 November 2026.md`

### 6.1. Big Toothy Grins rough cut 6: 20 failures, 6 sections

1. Section 1 (Chorus one), 11.43 to 12.33 s: YOU 7.7% (needs 13.5%). Kept because dropping it empties 11.3 to 11.6 s.
2. Section 2 (Jaden and Rudy), 35.60 to 36.83 s: YOU 7.4%. Kept to avoid an empty 35.3 to 35.7 s.
3. Section 4 (Melo and hook), 53.37 to 54.83 s and 57.77 to 59.00 s: YOU 8.5% and YOU 8.3%. Kept to avoid an empty 57.6 to 57.9 s.
4. Section 6 (Ant, one fake): ANT 13.2% at 89.80 s (important, can't grow); OR 9.3% at 100.27 s; THE, AND and THAT around 107.4 to 110.4 s at 4 to 6%. Kept to avoid empties at 100.2 s and 109.2 s.
5. Section 7 (Chorus two), 115.63 to 117.10 s: THE 8.3%.
6. Section 9 (Bones and Trey):
   1. BONES 10.5% at 147.27 s (important).
   2. RIGHT, BACK, TO at 3.8 to 6.8% at 155.5 to 157.5 s.
   3. IT'S 4.2% and TREY 9.5% (important) at 157.97 to 159.10 s.
   The 155.5 to 159.1 s stretch is the worst stretch of the song.
7. What a rebuild would change: a new layout for that section in which those words fit at size, or neighbours that cover the stretch when they are dropped. The engine as it stands cannot fix these by re-joining alone.

### 6.2. Raise the Flagg rough cut 2: 262 failures, all 12 sections (built before brief 5)

1. Rule 3 (127): all are the old grey (`#7d7a76`, and `#96938e` on panels). A rebuild snaps it to flat grey `#808080`. No outlined words were found.
2. Rule 4 (26):
   1. Player names in anton, gothic or wide instead of the jersey font: COOPER 4.70 s, FLAGG 5.27 s, KYRIE 65.30 s, COOP 72.93 s, and others.
   2. MAVS at 58.17 s is not drawn as a wordmark, because the song input has no `team_wordmarks`.
   3. A rebuild needs `player_names` in its song settings (I used Cooper, Coop, Flagg, Kyrie, P.J., Naji, Risacher, Gafford for this check) and a Mavericks wordmark image.
3. Rule 1 (107): words under 9% or 13.5% in every section, the smallest about 5% (SING 149.57 s, LOUD 60.87 s, IT 40.40 s, THE MAINE 95.13 s). A rebuild runs the size pass (grow or drop).
4. Rule 2 (2): "down" at 79.70 s and "Risacher," at 80.30 s are not placed. They may be keyword-mode drops from the build or a text-matching miss in my checker; I did not confirm which.
5. Sections by failure count:
   1. Intro 6
   2. Verse 1 Newport 17
   3. Verse 1 handles 23
   4. Chorus 1 raise 35
   5. Chorus 1 wave 28
   6. Verse 2 Kyrie 28
   7. Verse 2 Gafford 19
   8. Chorus 2 raise 29
   9. Chorus 2 wave 24
   10. Bridge 5
   11. Final chorus raise 19
   12. Final chorus and outro 29
6. Rules 3 and 4 fail in nearly every section, so effectively every section needs a rebuild under the new rules.

## 7. Screenshots to render

1. Big Toothy Grins rough cut 6, Type-rule failures:
   1. 11.4 to 12.4 s
   2. 35.5 to 36.9 s
   3. 53.3 to 59.0 s
   4. 89.7 to 90.0 s
   5. 100.2 to 101.6 s
   6. 107.4 to 110.4 s
   7. 115.6 to 117.1 s
   8. 147.2 to 148.1 s
   9. 155.5 to 159.1 s
2. Big Toothy Grins rough cut 6, checks of this pass:
   1. Size reference: 40.1 to 41.3 s (both HEs).
   2. Jersey bold, compared with real jersey lettering: 43 at 48.97 s, MELO at 54.97 s, AYO at 41.53 s, 34 at 142.73 s, TREY at 148.23 s, SHANNON at 130.60 s, MCDANIELS! at 30.53 s.
   3. WOLVES navy on green: 17.77 s, and the ending hold from 176.7 s.
   4. Words that were outlined, now solid: HOWL? at 12.37 s, HOT? at 27.48 s, GO? at 97.03 s, TREY? at 151.59 s.
   5. Flat grey: GOBERT! at 40.03 s.
   6. Fill 5: 153.8 to 155.6 s.
3. Raise the Flagg rough cut 2:
   1. LOUD at 60.87 s
   2. SING at 149.57 s
   3. THE MAINE at 95.13 s
   4. COOPER and FLAGG at 4.7 to 6.3 s
   5. MAVS at 58.17 s
   6. One grey word anywhere, for the old grey

## 8. Files and cleanup

1. Engine files changed:
   1. `composition.mjs`
   2. `style.mjs`
   3. `keywords.mjs`
   4. `compose_plaques.mjs`
   5. `build_best.mjs`
   6. `build_song.mjs`
   7. `shown_gate.mjs`
   8. `whole_song_checks.mjs`
   9. `viewer.html`
   10. `type_rules_check.mjs` (new)
   11. `KIT.md`
2. The keyword-mode tests still pass (6 of 6).
3. The partial builds killed when change 2 arrived are in `~/.safe-delete` (restorable for 7 days). Scratch files are deleted.
