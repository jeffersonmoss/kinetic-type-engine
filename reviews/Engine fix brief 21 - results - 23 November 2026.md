# Engine fix brief 21 — results (23 November 2026)

Implemented jersey-font exclusivity (player names, jersey numbers, and their reveal copies only) and Type rule 5 (city names in the team's own styling; jersey font only for player names and jersey numbers) on branch `world-canvas` in `~/Experiments/Kinetic Type Engine`. Generic engine changes; no song names in engine code. No browser was launched and nothing was rendered.

## Non-jersey accent face chosen

- **`teko` (Teko Bold, weight 700)** replaces `collegiate` (Graduate) as `KIT.accent`.
  - **Why**: `teko` is already loaded by `viewer.html`, measured in `fonts/room-for-one-variety.metrics.json` with full ASCII uppercase/digit/punctuation coverage, and is already the rulebook's own non-collegiate `accent` slot (`Rulebook final - Fable.md`). Its squared-off geometric block capitals (`avgW/cap = 0.794`) sit cleanly between `narrow` (`gothic`, `0.481`) / `standard` (`anton`, `0.551`) and `wide` (`wide`, `1.118`), keeping the accent role's visual contrast while staying narrower than bolded `collegiate` (`0.887 + 0.10`), so join-time replacements never overflow existing boxes.
  - **Custom `jersey_font` safety**: `nonJerseyAccentFont(songJerseyFont)` picks the first non-jersey face from `['teko', 'barlow', 'shoulders', 'bebas', 'anton']`, so even a song setting `jersey_font: "teko"` still gets a distinct non-jersey accent face (`barlow`).

## What changed

1. **`deterministic/style.mjs`**:
   - Changed `KIT.accent` from `'collegiate'` to `'teko'`.
   - Exported `ACCENT_FALLBACKS`, `isSongJerseyFont(font, songJerseyFont = null)`, and `nonJerseyAccentFont(songJerseyFont = null)`.
2. **`deterministic/compose_plaques.mjs`**:
   - Exported `fontForWord(word, slotFont, adlibShot, jerseyFont)` so `JERSEY_FONTS[0]` (`collegiate`) is assigned only to `word.jerseyWord` (player names and jersey numbers, even when inside an ad-lib shot such as `(Flagg!)`) or standalone non-score digits.
   - Ad-lib shots (`adlibShot`), non-jersey `word.accent` words, and score digits (`word.scoreWord`) receive `nonJerseyAccentFont(jerseyFont)` (`teko` by default).
   - Songs with no ad-lib shots, non-jersey accent words, or score digits assign identical fonts to every word (`JERSEY_FONTS[0]` for player names/jersey numbers, `slotFont` for ordinary words) and build identically to before.
3. **`deterministic/build_song.mjs`**:
   - Updated `sectionWords` to tag `jerseyWord: true` only for player names (excluding `team_wordmarks` keys and respecting `word_overrides.<idx>.name`) and jersey numbers (classified via `word_overrides` / `numeralKind`), and `scoreWord: true` for score numerals (which keep their scoreboard bulb digits).
   - Passed `KTE_JERSEY_FONT` to section build child processes when `song.jersey_font` is set.
   - Added the hard join gate calling `checkJerseyFonts(finalObj, { song, until: frames })`: fails the join (`JERSEY FONT ON NON-PLAYER WORD FAIL`, exit 1, writes `Whole song - FAILED GATES - not for render - scene.json`) if any non-dropped, non-replaced, non-score, non-wordmark word in a jersey font (`JERSEY_FONTS` or `song.jersey_font`) is not a player name, jersey number, or reveal copy of one, naming the word, font, and time. Reported in `Whole song - provenance and flags.md` and on stdout.
4. **`deterministic/word_roles.mjs`**:
   - Updated `applyWordRoles`:
     - Scores keep their bulb digits (`w.score = true`, bulb box width untouched) and have any jersey font key replaced with `nonJerseyAccentFont(song.jersey_font)`.
     - Respects explicit `w.player_name === false` (e.g. words renamed from a player name to an ordinary word by `song notes.mjs`) and excludes `team_wordmarks` keys from automatic player-name tagging unless `word_overrides.<idx>.name === true`.
     - Updated `o.name === false` replacement to check `isSongJerseyFont(w.font, song.jersey_font)` and exclude jersey fonts from candidate fonts.
     - Added a universal post-loop over all non-reveal-copy words (matched, unmatched/renamed by `song notes.mjs`, ad-lib words from `--skip-build` sections, echoes) stripping any jersey font (`JERSEY_FONTS` or `song.jersey_font`) from words that are not player names, jersey numbers, or legacy `w.jersey` words and re-measuring them in `nonJerseyAccentFont(song.jersey_font)` (scaling down only if wider than the existing box).
     - Updated reveal-copy synchronization so reveal copies of player names/jersey numbers match their source jersey font, while reveal copies of non-player words are also stripped of any jersey font.
   - Exported `checkJerseyFonts(scene, { song, players, until })` shared by `build_song.mjs` and `type_rules_check.mjs`.
5. **`deterministic/sung_pulses.mjs`**:
   - Prevented `addEcho` / `makeEcho` from copying a jersey font from a held player-name anchor onto a non-matching echo word (measures and assigns `KIT.accent` instead).
6. **`deterministic/song_appearance.mjs`**:
   - Ensured words matched by `team_wordmarks` never retain a jersey font key on `w.font`.
7. **`deterministic/type_rules_check.mjs`**:
   - Added Type rule 5 using `checkJerseyFonts(scene, { song, players, until: scene.meta.frames })` (reporting violating word, font, and time), and guarded Rule 4 against `w.player_name === false` and `ov.numeral === 'score'`.
   - Updated summary counts (`byRule: [1, 2, 3, 4, 5]`).
8. **`deterministic/KIT.md`**:
   - Appended verbatim to `## Type rules`:
     `5. City names use the team's own styling of the city name (its real artwork through `team_wordmarks`), never a generic font. The jersey font is only for player names and jersey numbers.`
   - Added `## Engine fix brief 21 (23 November 2026)` documenting the accent face, font-assignment rules, join enforcement, and hard gate.
9. **`deterministic/test_stage_layers.mjs`**:
   - Added 3 Brief 21 `node:test` cases (**21/21 total** with briefs 17–20):
     - `KIT.accent` (`teko`), `nonJerseyAccentFont` (including `jersey_font: 'teko'`), `isSongJerseyFont`, and `fontForWord` across ordinary words, ad-lib shots, `word.accent`, score digits, player names inside ad-libs, and jersey numbers.
     - `applyWordRoles` stripping jersey font from ad-libs, renamed unmatched non-names (`player_name: false`), echoes, scores (preserving bulb digits), and non-player reveal copies while keeping jersey font on player names, jersey numbers, and their reveal copies.
     - `checkJerseyFonts` failing with word and time on non-player/non-number words and non-player reveal copies in either `collegiate` or custom `song.jersey_font`, while allowing player names, jersey numbers, their reveal copies, scores, and image wordmarks.

## Test: Raise the Flagg (full 12-section build + `--skip-build` re-join)

Built in an isolated temp folder under the system temp directory (`kte-brief21-yBSoUb`, with `TEMP_README.md`, removed after verification) from a copy of `~/Experiments/Raise the Flagg Music Video/engine input` (workspace HEAD `19ee02a`, `Rough cut 7 notes: climbing banner, chant pulses, DALLAS wordmark`). Nothing was written into the Flagg workspace (`git status --short` verified empty).

### Words changed in the Flagg build

- **42 words** moved off `collegiate` (jersey font) to `teko` (compared against Rough cut 7, which had 58 `collegiate` words: 14 shown player names + 2 jersey numbers + 42 non-player words):
  - **30 ad-lib shot words** built directly in `teko` during section builds:
    - Section 1 (`Intro`): `w02 YEAH`, `w05 THE`, `w06 MAINE`, `w07 EVENT` (4)
    - Section 4 (`Chorus 1 - raise it high`): `w4008 RAISE`, `w4009 IT`, `w4010 HIGH`, `w4017 TONIGHT`, `w4028 DALLAS` (also receives the `DALLAS` image wordmark), `w4029 LIGHTS` (6)
    - Section 8 (`Chorus 2 - raise it high`): `w8008 RAISE` (dropped: size), `w8009 IT`, `w8010 HIGH`, `w8017 TONIGHT`, `w8028 DALLAS` (image wordmark), `w8029 LIGHTS` (6)
    - Section 9 (`Chorus 2 - wave it proud`): `w9008 WAVE`, `w9031 SO`, `w9032 LOUD` (3)
    - Section 11 (`Final chorus - raise it high`): `w11008 RAISE`, `w11009 IT`, `w11010 HIGH`, `w11017 TONIGHT`, `w11028 DALLAS` (image wordmark), `w11029 LIGHTS` (6)
    - Section 12 (`Final chorus and outro`): `w12031 SO`, `w12032 LOUD`, `w12048 RAISE`, `w12049 IT`, **`w12050 HIGH` at `165.66 s`** (5)
  - **12 `"Raise the flag"` words** (`FLAG`, renamed from `Flagg` with `player_name: false` by `song notes.mjs`) re-fonted from `collegiate` to `teko` at the join (`roles.fontChanges = 12`): `w4003`, `w4032`, `w5003`, `w5036`, `w8003` (dropped: room), `w8032`, `w9003`, `w9035`, `w11003`, `w11032`, `w12003`, `w12035`.
  - **Remaining `collegiate` words in the final scene**: **26** total — **14** shown player names (`COOPER`, `FLAGG`, `COOP`, `FLAGG!`, `KYRIE`, `PJ`, `GAFFORD`, `NAJI`, `RISACHER`), **10** chant-replaced `FLAGG!` shouts (`replaced_by: "championship banner pulse"`, never drawn), and **2** jersey numbers (`w7015 32` at `82.78 s`, `w10013 32` at `122.88 s`). **0** non-player/non-number words remain in `collegiate`.
  - **City-name wordmarks**: all **23** `DALLAS` words render with the real `DALLAS` road-jersey image wordmark from Flagg HEAD `19ee02a`.

### Parity check (no jersey-face accent words)

- Comparing per-section `scene.json` from the fresh 12-section build against Rough cut 7's sections:
  - **Sections 2, 3, 6, 7** (all 4 verse sections, which have no ad-lib shots and no prop-key changes between Rough cut 7 and HEAD `19ee02a`): **100% byte-for-byte identical** (`identical = true`, `0` font diffs).
  - Section 10 (`Bridge`) differed only because Flagg HEAD `19ee02a` updated the climbing championship banner prop keys in the Bridge (`--stage` keep-clear geometry).
- **`--skip-build` re-join check** (reusing Rough cut 7's 12 pre-brief-21 sections with Flagg HEAD `19ee02a`): `applyWordRoles` stripped all **42** non-player `collegiate` words to `teko` (`fontChanges: 42`), passing the jersey font gate (`jerseyViolations: 0`) and `type_rules_check` Rule 3/4/5 (`byRule: [13, 27, 0, 0, 0]`). (That re-join had 1 partial word and 1 empty run `3868-3877` from mixing pre-`19ee02a` Section 10 geometry with `19ee02a` banner prop keys; the fresh 12-section build cleared both cleanly.)

### Gate lines — full 12-section build (`--N 200 --jobs 6`, 307.8 s)

| Gate | Result |
|---|---|
| `Jersey font gate` (`checkJerseyFonts`) | **0 violations (PASS)** (`12` join font changes, `0` non-player jersey words) |
| `Opening blank` | **0 frames (PASS)** |
| `Shown whole` (`finalPartial`) | **0 partly shown (PASS)** (`sweepBefore: 1`, `sweepAfter: 0`, `finalDropped: 9`) |
| `Projected overlap` (`overlapFinal`) | **0 remaining intervals (PASS)** (`pulses tamed: 5`) |
| `Static partly on screen` (`staticFinal`) | **0 (PASS)** (`staticHidden: 15`) |
| `Prop covers sung word` (`propOverlapViolations`) | **0 intervals (PASS)** |
| `Room for a dropped word` (`roomLeft`) | **0 (PASS)** (`put back: 51`) |
| `Room for a phrase gap` (`gapsLeft`) | **0 (PASS)** |
| `Empty first/last frame` (`emptyEnds`) | **PASS, something on screen** |
| `Empty stretches > 0.25 s` (`emptyRuns`) | **PASS, none** (`filled: 1`, `shortGaps: 23`, longest `6` frames) |
| `Sync` (`sync.late`) | **0 late (PASS)** (`49` lyric words dropped total) |
| `Idle stretches` (`idle`) | **0 (PASS)** |
| `Still ending` (`stillEnding`) | **PASS** (ends on `w12050 HIGH` in `teko`, rest frame `4974`, `f0 = f1 = 5249`) |
| `Reveal check` | **PASS (off)** |
| `Keyword drop review` (`dropFails`) | **FAIL (expected — no `Keyword drop review.json` in temp output dir; 17 unreviewed keyword drops)** |

### `type_rules_check.mjs` results

- **Old Rough cut 7 baseline** (before Brief 21): `total: 103`, `byRule: [13, 27, 0, 23, 40]` (**40 Rule 5 jersey-font failures**, **23 Rule 4 failures** for missing DALLAS wordmark).
- **New full 12-section build**: `total: 41`, `byRule: [15, 26, 0, 0, 0]` (**Rule 3: 0, Rule 4: 0, Rule 5: 0**).

## Unit tests and syntax checks

- `node --check deterministic/style.mjs deterministic/compose_plaques.mjs deterministic/sung_pulses.mjs deterministic/song_appearance.mjs deterministic/word_roles.mjs deterministic/build_song.mjs deterministic/type_rules_check.mjs deterministic/test_stage_layers.mjs`: passed.
- `node --test deterministic/test_stage_layers.mjs`: **21/21 passed** (5 brief 17 + 4 brief 18 + 4 brief 19 + 5 brief 20 + 3 brief 21).

## What was NOT done / left undone

- **No Chrome render or visual check** (per rule 9).
- **Flagg workspace was not modified** (per rule 8). When the Flagg song chat builds Rough cut 8 on this engine commit, it should run a fresh build (not `--skip-build` against pre-`19ee02a` sections, since HEAD `19ee02a` changed Section 10's climbing banner prop keys as well as adding the `DALLAS` wordmark) and review/update its `Keyword drop review.json`.
- **Temp cleanup**: the isolated temp folder (`kte-brief21-yBSoUb`, containing `TEMP_README.md`) was removed after verification. Nothing outside that temp folder was deleted.
