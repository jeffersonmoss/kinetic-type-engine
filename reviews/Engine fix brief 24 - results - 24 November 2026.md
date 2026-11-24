# Engine fix brief 24 — Results (24 November 2026)

Builder: Gemini Neon. Engine branch: `world-canvas` (starting from `23d9746`). Song workspace: `~/Experiments/Big Toothy Grins Music Video/` (starting from `Rough cut 6k - 23 November` sections and settings). No video was rendered and no browser was launched.

## 1. Final WOLVES → flaming wolf pack badge

- **Engine support (song-setting driven, no hard-coded special case):**
  - `deterministic/song_appearance.mjs`: added per-word image override support under `word_overrides.<map_index>.image` (with optional `colours`, `letter_share`, `ripple`, `target_height`, `centre`). Any word matched by `word_overrides.<map_index>.image` is skipped by the `team_wordmarks` pass so only that specific occurrence changes.
  - `deterministic/composition.mjs`: updated `growWordmarks` to honour `w.wordmark.target_height` and cap the target scale by `Math.min(WORDMARK_SAFE_X / ib0.w, WORDMARK_SAFE_Y / ib0.h)` so tall/square transparent images hit their target height cleanly on the first step without overshooting safe margins.
- **Song setting (`engine input/song settings.json`):**
  - `word_overrides["394"]` points to `Wolf pack badge - ring of fire - transparent - for the final WOLVES.png` (860 × 960 px, transparent, `colours.background: ""`, `target_height: 0.88`).
- **Result in both 6l scenes:**
  - `w10028 WOLVES!` (map 394, sung 176.949–177.977 s) flashes on at frame `5307` (`176.90 s`) and holds still to the final frame `5344` (`178.15 s`), centred at `(0, 0)` with ink height `88.0%` of the frame (`maxAbsY = 0.88 <= 0.90`, ink width `42.5%`, `maxAbsX = 0.425 <= 0.94`).
  - The other six `WOLVES` occurrences (`w15`, `w28`, `w4038`, `w7015`, `w7028`, `w10015`) retain `WOLVES wordmark - Icon lettering only - traced vector.svg`.

## 2. DENVER in Denver Nuggets branding lettering

- **Version chosen:** Denver Nuggets **Icon Edition** primary road jersey `DENVER` lettering (2018/19–present). The white Association Edition jersey displays `NUGGETS` rather than `DENVER`, so the Icon Edition is the current primary jersey carrying `DENVER`.
- **Reference sources saved in `engine input/Real team artwork - tracing reference only, never rendered/` and documented in `engine input/Real team artwork - sources - 23 November 2026.md`:**
  1. `Denver Nuggets DENVER wordmark - Icon jersey 2019-present - SportsLogos.net.png` (750 × 486 px lossless PNG) — primary tracing source: `https://www.sportslogos.net/logos/view/22979832019/Denver-Nuggets-Logo/2019/Jersey-Logo` (`https://content.sportslogos.net/logos/6/229/full/denver-nuggets-jersey-2019-22979832019.png`; trademark © NBA Properties, Inc., archived for reference).
  2. `Denver Nuggets wordmark 2019-present - SportsLogos.net.png` (905 × 335 px PNG) — corroborating stacked wordmark: `https://www.sportslogos.net/logos/view/22985722019/Denver-Nuggets-Logo/2019/Wordmark-Logo` (`https://content.sportslogos.net/logos/6/229/full/8572_denver_nuggets-wordmark-2019.png`).
  3. `Denver Nuggets wordmark 2018-current - Wikimedia Commons.gif` (902 × 330 px GIF) — corroborating wordmark: `https://commons.wikimedia.org/wiki/File:Denver_Nuggets_Wordmark_Logo_2018-current.gif` (`https://upload.wikimedia.org/wikipedia/commons/f/f9/Denver_Nuggets_Wordmark_Logo_2018-current.gif`, Public Domain text-logo / trademark notice).
- **Colours & honest provenance note:** NBA Properties' Frontify portal for the Denver Nuggets logo sheet PDF is login-gated and no unauthenticated public 2026 PDF URL was found. The traced SVG uses NBA Properties' published Denver Nuggets identity hexes corroborated by TruColor and team brand references: **Sunshine Yellow** `#FEC524` (fill; PMS 123 C, sampled PNG fill `#FFC82B`) and **Flatirons Red** `#8B2131` (outline; PMS 202 C, sampled PNG outline `#872534`), on a transparent background (no block).
- **Traced SVG:** `engine input/DENVER wordmark - Icon jersey lettering - traced vector.svg` (`viewBox="0 0 6903.63 1814.91"`, 11 KB, two `<g>` layers: `layer-red-outline` and `layer-yellow-fill`, `fill-rule="evenodd"` so `D` and `R` counters remain transparent). Verified by rasterizing back onto the 750 × 486 source canvas with sampled colours: **RMSE 7.23 / 255**, **MAE 1.40 / 255** across the wordmark bounding box.
- **Result in both 6l scenes:** Wired as `team_wordmarks.DENVER` with `colours.background: ""`, sized by its ink box. `w3028 DENVER` (map 94, sung 50.504–51.071 s, `on = 1514`, `off = 1596`) grows to `80.0%` frame width and `37.4%` frame height, centred horizontally (`cx = 0`, `cy = -0.180`, `maxAbsX = 0.80 <= 0.94`, `maxAbsY = 0.554 <= 0.90`).

## 3. Vertical variant: intro badges rotate into place

- **Engine support:**
  - `deterministic/song_appearance.mjs`: compiles optional `song.intro_rotation` (`{ from_deg, to_deg, ease }`, supporting `inOutSine`, `inOutCubic`, `linear`) into `scene.intro_motion.rotation`.
  - `deterministic/build_song.mjs`: added `--intro-rotation <from,to[,ease] | JSON | off>` CLI override so a second scene can be joined from the same `song settings.json` without toggling the file.
  - `deterministic/viewer.html`: `drawIntro(frame)` rotates each intro image around the centre of its opaque content box (`item.box`) continuously from `frame = 0` (`u = 0 → from_deg`) to `frame = endF - 1` (`u = 1 → to_deg`) across both badges and the dissolve between them. A single constant `cachedIntroFit` scale factor (`<= 1`) is computed across all intro frames `0..endF-1` so the rotated opaque bounding box stays inside a 4% margin (`28.8 px` on the 720 px short side, `51.2 px` on the 1280 px long side) at every angle while preserving the smooth exponential push and exact dissolve alignment. When `intro_motion.rotation` is absent, `cachedIntroFit = 1` and horizontal rendering is unchanged.
- **Sign convention & geometric confirmation (no render):**
  - HTML5 Canvas 2D (`+x` right, `+y` down) defines `ctx.rotate(θ)` with **positive `θ` clockwise** and **negative `θ` counterclockwise**: `(x', y') = (x cos θ − y sin θ, x sin θ + y cos θ)`.
  - At `frame = 0`, `θ = from_deg = -90°` (`cos θ = 0, sin θ = -1`):
    - The badge's **up** vector `(0, -1)` maps to `(-1, 0)` (**left** in the horizontal 1280 × 720 frame).
    - The badge's **right** vector `(+1, 0)` maps to `(0, -1)` (**up** in the horizontal 1280 × 720 frame).
  - Applying ffmpeg `transpose=1` (90° clockwise rotation of the 1280 × 720 frame into 720 × 1280) maps horizontal `(x, y) → (H − 1 − y, x)`:
    - Horizontal **left** `(-1, 0)` → vertical `(0, -1)` (**up**).
    - Horizontal **up** `(0, -1)` → vertical `(+1, 0)` (**right**).
  - Therefore, after `transpose=1`, frame `0` is **exact upright** (`0°` from vertical), and the badge turns smoothly clockwise in the vertical frame by `+90°` over frames `0..265` to reach `0°` (horizontal-normal / sideways in vertical) on frame `265`, matching the rest of the video.
- **Computed vertical-intro geometry (`endF = 266`, last intro frame `265`, `fitScale = 0.9487`):**
  - Frame `0` (`0.00 s`): `-90.00°`
  - Frame `123` (`4.10 s`, dissolve start): `-50.06°`
  - Frame `132` (`4.40 s`, mid-rotation / mid-dissolve): `-45.27°` (frame `133` = `4.43 s`: `-44.73°`)
  - Frame `140` (`4.67 s`, dissolve end): `-41.00°`
  - Frame `153` (`5.10 s`, tightest vertical clearance): `-34.17°`, `28.80 px` clearance on the 720 px short side (`303.84 px` minimum horizontal clearance across all frames)
  - Frame `265` (`8.83 s`, last intro frame): `0.00°`
- **H vs V identity check:** Stripping `intro_motion.rotation` from the vertical variant's `Whole song - final - scene.json` yields a **100% byte-identical** JSON to the horizontal scene.

## 4. Joined folders, gates, and checks

1. **Horizontal (normal):** `~/Experiments/Big Toothy Grins Music Video/engine output/Rough cut 6l - 24 November/`
   - `build_song.mjs --skip-build`: **exit 0** (all gates PASS: opening blank 0, sync 0 late, idle 0, shown-whole 0 partial, overlap 0, static-partial 0, empty ends 0, empty runs 0, jersey font violations 0, keyword drops 0, still ending PASS).
   - `type_rules_check.mjs`: `4` failures (`rule 1: 4`, `rule 2: 0`, `rule 3: 0`, `rule 4: 0`, `rule 5: 0`) — the same 4 pre-existing Rule 1 items from Rough cut 6k (`w6057 WHOLE`, `w7009 THAT'S`, `w7010 THE`, `w9030 TREY`); report saved to `Type rules check - 24 November 2026.md`.
2. **Vertical variant:** `~/Experiments/Big Toothy Grins Music Video/engine output/Rough cut 6l - vertical variant - 24 November/`
   - `build_song.mjs --skip-build --intro-rotation -90,0,inOutSine`: **exit 0** (all gates PASS).
   - `type_rules_check.mjs`: `4` failures (`rule 1: 4`, `rule 2: 0`, `rule 3: 0`, `rule 4: 0`, `rule 5: 0`); report saved to `Type rules check - 24 November 2026.md`.
3. **Engine regression tests:** `node deterministic/test_stage_layers.mjs` — **21/21 pass**.

## 5. Frame times for the supervisor to check

| Check | Scene | Frame | Time (s) | What to verify |
| --- | --- | ---: | ---: | --- |
| First intro frame | Vertical variant | `0` | `0.00 s` | Masked badge at `-90.00°` (upright after `transpose=1`) |
| Mid-rotation (dissolve) | Vertical variant | `133` | `4.43 s` | Masked → front-stare dissolve at `-44.73°`, badges aligned |
| Tightest rotated fit | Vertical variant | `153` | `5.10 s` | Front-stare badge at `-34.17°`, `28.8 px` clearance inside 720 px short side |
| Last intro frame | Vertical variant | `265` | `8.83 s` | Front-stare badge at `0.00°`, aligned with horizontal video |
| DENVER wordmark | Both (identical) | `1518` | `50.60 s` | Traced Nuggets Icon jersey SVG (`#FEC524` / `#8B2131`, transparent), 80% frame width |
| Final flaming badge | Both (identical) | `5307` / `5315` / `5344` | `176.90 s` / `177.17 s` / `178.13 s` | Flaming wolf pack badge flashes on at shout, 88% frame height, centred, held to end |
