# Engine fix brief 14: results (23 November 2026)

Builder: Gemini 4 Neon. No renders, no browser launch, and no section rebuilds, as asked. Jersey font left HELD (unset, default Graduate). `KIT.md` Type rules text untouched.

## 1. Outcome

- Re-joined Big Toothy Grins as `~/Experiments/Big Toothy Grins Music Video/engine output/Rough cut 6h - 23 November` with `--skip-build` from 6g's sections: **exit 0**, every gate passes (0 overlaps, 0 partial/unshown focused words, 0 static partials, 0 empty stretches, 0 keyword drops).
- Type rules check (`Rough cut 6h - 23 November/Type rules check - 23 November 2026.md`): **18 failures, all Rule 1** (`byRule: [18, 0, 0, 0]`, identical to 6g on Graduate; 0 Rule 2, 0 Rule 3, 0 Rule 4).
- All 7 `WOLVES` wordmarks now render the Icon blue-panel artwork (blue panel ~28.6% of frame height, ink 19.1% of frame height) with `colours.background: ""` (no extra block); `PORTLAND` grows x1.39 to match at 19.1% letters (red block ~28.6% of frame height).
- Zero occurrences of `#78BE20`, `#78BE21`, `#236192`, or `#0C2340` remain anywhere in 6h's `Whole song - final - scene.json`.

## 2. WOLVES wordmark sourcing (honest note)

- **No official or documented public source hosts a high-resolution flat copy of the arched, spiked `WOLVES` + three-trees lockup.** Sources checked:
  1. Official NBA Properties 2026 Minnesota Timberwolves Logo Sheet PDF (`https://media.ffycdn.net/us/nba/2jsX6odw5FzEx6xzXgG7.pdf`, © 2026 NBA Properties, Inc.) — contains Primary Icon, Global Logo, Secondary `MINN` logo, and horizontal/stacked `MINNESOTA TIMBERWOLVES` wordmarks only; no arched `WOLVES` or three-trees lockup.
  2. Official NBA.com June 7, 2026 unveil press release (`https://www.nba.com/timberwolves/news/timberwolves-unveil-all-new-logo-uniforms-and-courts`) and uniform galleries (`https://www.nba.com/timberwolves/photos/wolves-pics-wolves-unveil-new-icon-jerseys`, `...association-jerseys`, `...statement-jerseys`) — uniform photos confirm the **exact same arched, spiked `WOLVES` letterforms** on the 2026–27 uniforms, but note a real discrepancy vs Jefferson's reference: the actual 2026–27 Nike jerseys have **no three pine trees** under `WOLVES`, and put **green** letters with white outline on the blue Icon jersey (while putting blue letters with white + green outlines on the white Association jersey).
  3. SportsLogos.net Timberwolves archive (`https://www.sportslogos.net/logos/list_by_team/232/Minnesota-Timberwolves-Logos/`), May 30 leak and June 7 unveil articles (`https://news.sportslogos.net/2026/06/07/minnesota-timberwolves-officially-unveil-new-logos-uniforms-inspired-by-past-designs/basketball/`) — primary/secondary/dark logos and jersey photography only; no flat 2026–27 `WOLVES` wordmark.
  4. Wikimedia Commons / English Wikipedia — only the retired 2008–17 straight `WOLVES` GIF (`513 x 195`) and tiny pixel kit icons.
- **What was saved in `~/Experiments/Big Toothy Grins Music Video/engine input/`:**
  - `WOLVES wordmark - Icon (blue panel, three trees) - from Jefferson reference.png` (**318 x 187 px**, wired into `team_wordmarks.WOLVES`): cropped from the middle (`ICON`) panel of Jefferson's 399 x 501 reference (removing the `"ICON"` header label) and padded symmetrically to even 31 px (`0.25 x` ink height) margins on all four sides in official Timberwolves Blue `#1D428A` (the reference background's median RGB is `#1D418B`, matching within 1 LSB; no visible seam).
  - `WOLVES wordmark - Statement (black panel, three trees) - from Jefferson reference.png` (**318 x 187 px**, saved on disk, not wired in): cropped from the bottom (`STATEMENT`) panel and padded on `#000000`.
  - Updated `Real team artwork - sources - 23 November 2026.md` with all source URLs and this provenance note.
- **Icon vs Statement decision:** Icon is used for **all 7 `WOLVES` words** (`w15` 16.76 s, `w28` 25.73 s, `w4038` 70.48 s, `w7015` 119.42 s, `w7028` 128.30 s, `w10015` 168.14 s, `w10028` 176.95 s ending hold) per Jefferson's preference, keeping a unified motif across all chorus hits (and avoiding the slight bottom clipping of the Statement trees at `y=501` in Jefferson's reference).
- **Low-resolution warning:** Because both files are cropped from Jefferson's 399 x 501 reference (256 x 125 px of artwork ink inside a 318 x 187 px panel), they will upscale ~1.1x–1.3x at 1280 x 720 (where the blue panel renders ~350 x 206 px). If Jefferson has the original higher-res URL/file for that three-panel sheet, swapping in a higher-res crop is a one-file replacement.

## 3. Green block removal audit

Every place checked for a green background block (or `#78BE20` Aurora Green):
1. **`Big Toothy Grins Music Video/engine input/song settings.json`:** `team_wordmarks.WOLVES.colours.background` was **`"#78BE20"`** (the **only** place drawing a green background block in the song or engine, affecting all 7 `WOLVES` words). Changed to **`""`** (no extra block). Also updated unused `team_wordmarks.TIMBERWOLVES` from `#78BE20` on `#0C2340` to `#FFFFFF` on `#1D428A`.
2. **`Big Toothy Grins Music Video/engine input/palette.json`:** Had no green background blocks, but used the superseded 2017–2026 Timberwolves palette (`#236192` Lake Blue, `#0C2340` Midnight Blue, `#78BE20` Aurora Green text on `team-b`/`team-accent`). Replaced with the official 2026–27 palette (`#1D428A` Blue, `#009A44` Green flat text only, `#FFFFFF` White); zero green background blocks.
3. **Engine defaults (`deterministic/`):** None draw a green background block (`viewer.html` `ST` has no green block; `word_roles.mjs` picks the darkest team colour for name blocks, now `#1D428A`). Note: `deterministic/palettes/starter - two team colours.json` is an unused template for new songs that still has 2017–26 placeholder hexes (`#236192`, `#0C2340`, `#78BE20` text, no green block) — left untouched per rule 4.

## 4. Official colour pass

### Official team colours used in Rough cut 6h

| Team | Official Name | Pantone | Hex | Where it appears in 6h | Source |
|---|---|---|---|---|---|
| Minnesota Timberwolves (2026–27) | **Timberwolves Blue** | PMS 7687 | `#1D428A` | 48 hero block words (`team-a` 27, `team-b` 21), 21 player-name blocks (incl. `w9016 TREY?`), 2 scoreboard rims (`43`, `34`), all 7 `WOLVES` Icon artwork panels, both intro badges | NBA Properties 2026 Logo Sheet (`https://media.ffycdn.net/us/nba/2jsX6odw5FzEx6xzXgG7.pdf`; `29r/66g/138b`; TruColor lists `#1D4289`) |
| Minnesota Timberwolves (2026–27) | **Timberwolves Green** | PMS 347 | `#009A44` | 61 flat-fill accent words (`team-accent`, NO block; 5.34:1 on ground), `WOLVES` Icon outline & three trees, both intro badges | NBA Properties 2026 Logo Sheet (`https://media.ffycdn.net/us/nba/2jsX6odw5FzEx6xzXgG7.pdf`; `0r/154g/68b`; matches TruColor `#009A44`) |
| Minnesota Timberwolves (2026–27) | **White** | — | `#FFFFFF` | Text on all 48 hero blocks and 21 player-name blocks (9.55:1 on `#1D428A`), `WOLVES` Icon inner outline, both intro badges | NBA Properties 2026 Logo Sheet & TruColor (`https://www.trucolor.net/portfolio/national-basketball-association-official-colors-franchise-records-1946-1947-through-present/`) |
| Minnesota Timberwolves (2026–27) | **Timberwolves Gray** | PMS 428 | `#C1C6C8` | Inside both intro badges (basketball & wolf shading; not used on text because `normalizePalette` snaps low-saturation colours to `#BFBFBF`) | NBA Properties 2026 Logo Sheet (`193r/198g/200b`; matches TruColor `#C1C6C8`) |
| Portland Trail Blazers | **Trail Blazers Red** | PMS 186 | `#E03A3E` | `w8001 PORTLAND` (129.47 s) background block (4.84:1 with black lettering, 4.54:1 on ground) | NBA Properties Trail Blazers Guideline Sheet (`https://cdn-assets-us.frontify.com/s3/frontify-enterprise-files-us/eyJwYXRoIjoibmJhXC9maWxlXC9oTkxmazY1bkQ1dWVtTnN0c1d1dC5wZGYifQ:nba:NkreCIncuu_IAveu4QryHM_wlhBN8hUSmV1iEQxwjAU`; `224r/58g/62b`; note TruColor/Rose Quarter print specs render PMS 186 C as `#C8102E`) |
| Portland Trail Blazers | **Trail Blazers Black** | PMS Black | `#000000` | `w8001 PORTLAND` lettering (cropped from real team SVG) | Same NBA Properties Trail Blazers Guideline Sheet |

### Non-team / engine colours present in 6h (flagged for completeness)

- **Ground:** `#0b0b0d` (engine canvas ground and invisible panel occluder fill; not a team colour).
- **Palette `panel` `#262b40` and `panel_side` `#3a4060`:** stored in `palette.json` for `checkPalette` contrast validation only; **never drawn on screen** (`viewer.html` draws panels in `colours.ground`).
- **Plain / quiet lyric text (Type rule 3 non-team text):** cream `#F3EBDD` (242 words), flat 50% grey `#808080` (3 quiet filler words: `w13 A`, `w5024 ALL`, `w8006 A`).
- **Scoreboard bulb digits (`w3026 43`, `w8037 34`):** engine scoreboard panel `#0A0F1C`, unlit bulbs `#24252B`, lit bulb gradient `#FFE3B8` -> `#FF8A3D` -> `#F2471C` (not team colours; surrounded by official `#1D428A` rim).
- **Intro badge 2 (`Timberwolves logo - front stare.png`):** pixel check shows its dark blue (`#0A3981`), green (`#069D3B`), and gray (`#B6C1CB`) deviate slightly from the 2026 NBA Logo Sheet's exact `#1D428A` / `#009A44` / `#C1C6C8` (unlike `Timberwolves logo - masked badge.png`, which is within ~2–3 LSBs). Flagged; untouched here.

## 5. Files changed

- **Engine (committed on `world-canvas`):**
  - `deterministic/build_song.mjs`: refreshes `scene.meta.palette` and style-derived `w.colours` from current `palette.json` (with `normalizePalette` + `checkPalette`) right after `assemble(...)`, so `--skip-build` joins pick up palette colour edits instead of keeping colours baked into section scenes.
  - `deterministic/word_roles.mjs`: when `teamColourNames` puts a player name/jersey number on a block, strips inherited `stroke`/`outline`, sets `w.kind = 'block'`, and clears outline styles (`w.style = 'cream'`) so `noOutlines`/`viewer.html` cannot overwrite `block_text` or draw an outline (fixed `w9016 TREY?`, which previously had green text on navy in 6g and failed Rule 3 on first 6h check).
  - `deterministic/song_appearance.mjs`: records `w.wordmark.pre_cap = w.cap` for every image wordmark (not only those with an extra `colours.background`), so `growWordmarks` keeps no-block wordmarks like `WOLVES` in the median size calculation and sizes `PORTLAND` to match.
  - `deterministic/KIT.md`: added `## Engine fix brief 14 (23 November 2026)` process note at end; `## Type rules` untouched.
  - `reviews/Engine fix brief 14 - results - 23 November 2026.md`: this report.
- **Song input & output (outside git, in `~/Experiments/Big Toothy Grins Music Video/`):**
  - Added `engine input/WOLVES wordmark - Icon (blue panel, three trees) - from Jefferson reference.png` and `engine input/WOLVES wordmark - Statement (black panel, three trees) - from Jefferson reference.png`.
  - Updated `engine input/palette.json`, `engine input/song settings.json`, `engine input/Real team artwork - sources - 23 November 2026.md`.
  - Created `engine output/Rough cut 6h - 23 November/` (sections copied from 6g, re-joined with `--skip-build`, plus `Type rules check - 23 November 2026.md`).

## 6. What is untested & stills to inspect

- **Untested in WebGL / Chrome:** visual sharpness of the 318 x 187 Icon wordmark PNG at 1280 x 720, visual balance of `#1D428A` blue blocks and `#009A44` green flat text on `#0b0b0d`, and `w9016 TREY?` solid white-on-blue rendering.
- **Suggested stills for the supervisor (from `Rough cut 6h - 23 November/Whole song - final - scene.json`, 30 fps):**
  1. **WOLVES Icon wordmark (no green block, sharpness & framing check):** `w15 WOLVES` at `16.76 s` (frame `509`, onset+6), `w4038 WOLVES!` at `70.48 s` (frame `2120`), and final held `w10028 WOLVES!` at `176.95 s` (frame `5315` or last frame `5394`).
  2. **Official 2026–27 palette (`#009A44` green accent text & `#1D428A` blue hero blocks):** `w04 PROWL` at `10.09 s` (frame `309`), `w14 PACK` at `14.60 s` (frame `444`), `w27 ATTACK` at `24.54 s` (frame `742`).
  3. **Player-name blocks (`#FFFFFF` on `#1D428A`, incl. `w9016 TREY?` fix):** `w2013 MCDANIELS!` at `30.57 s` (frame `923`), `w9016 TREY?` at `151.59 s` (frame `4554`).
  4. **PORTLAND red block (`#E03A3E`, matched to WOLVES height) & scoreboard rims (`#1D428A`):** `w8001 PORTLAND` at `129.47 s` (frame `3890`), `w3026 43` at `49.30 s` (frame `1485`).

## 7. Cleanup

- Deleted my own temp folder `/tmp/brief14`.
- Retired old wordmark files in `engine input/` (`WOLVES wordmark - real Timberwolves wordmark - Wikimedia Commons original.gif`, `WOLVES wordmark - real Timberwolves wordmark - transparent.png`) and older rough cuts (`6g` etc.) were left in place per rule 5; the two retired Wikimedia Commons WOLVES files can be archived or removed once 6h is approved.

## 8. Engine fix brief 15 addendum (revised, 23 November 2026): durable team font record

- Followed the revised brief 15 (`## REVISED, 23 November 2026: font choice dropped`): original items 1 to 3 (free Icon chamfered look-alike, setting `jersey_font`, `Λ` for `A`) were withdrawn; no font was wired into Big Toothy Grins (`jersey_font` remains unset / default Graduate).
- Added `deterministic/team_fonts.json` with the durable Minnesota Timberwolves entry: chosen look `"Classic Edition pointy lettering"` (Jefferson, 23 November 2026), `font_file` `"pending, being built in ~/Experiments/Timberwolves Classic Pointy Font/"`, 2017–2026 RARE Design Icon chamfered font recorded under `alternates_not_chosen`, names white with no outline, numbers white, and reference folder `~/Experiments/Big Toothy Grins Music Video/reference/Timberwolves jersey photos - expires 7 December 2026` (355 photos / 222 backs).
- Added a short process note under `## Engine fix brief 15 (23 November 2026)` in `deterministic/KIT.md` (outside `## Type rules`).
- `Rough cut 6h - 23 November` already carries brief 14 with no font change, exits 0, and passes every gate (Type rules check: 18 failures, all Rule 1, `[18, 0, 0, 0]`); no code affecting the join changed, so 6h was not redundantly re-run.
