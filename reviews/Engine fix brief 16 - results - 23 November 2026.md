# Engine fix brief 16 — results (23 November 2026)

Completed by Gemini Neon on branch `world-canvas`. Re-joined Big Toothy Grins as `~/Experiments/Big Toothy Grins Music Video/engine output/Rough cut 6i - 23 November` using `--skip-build` from 6h's 10 built sections (no section rebuild was required). **No browser was launched and nothing was rendered.**

---

## Summary of changes

### 1. Transparent no-block image wordmarks & SVG `viewBox` support (prepare only)
- `deterministic/song_appearance.mjs`:
  - `imageSize(file)` now parses `<svg ... viewBox="minX minY W H">` (falling back to numeric `width`/`height` with optional `px`, rejecting `%`), so transparent SVGs without explicit pixel `width`/`height` attributes resolve exact dimensions.
  - `songAppearance` now trims **every** image wordmark's box cleanly to its ink aspect ratio about `w.C` (never growing there, so it adds no overlap), recording `w.wordmark.ink`, `w.wordmark.margin` (`0.25` when `colours.background` is set; `0` when no background block), and `w.wordmark.size`. Previously, no-block wordmarks (`WOLVES`, `colours.background: ""`) kept the old typed-text box width with empty side wings.
- `deterministic/viewer.html`:
  - `wordTexture` uses `w.wordmark.size` when drawing SVGs (avoiding Chromium's 300×150 fallback when `width`/`height` are omitted or `%`), rasterizes image wordmarks sharply up to 2048 px (capped at 4096), and maps `ink` cleanly for both `margin = 0.25` and `margin = 0`.
  - Ripple generation pads the ripple canvas by `r` px on every side and scales the ripple plane 1:1 in world units (`w.w * o.width / wc.width`, `w.h * o.height / wc.height`) so transparent wordmarks with `margin = 0` never clip their dilated outline at the canvas edge.
- `deterministic/composition.mjs`:
  - `inFrameShare` and `visibleFraction` measure the full ink box (`band = 1`) for image wordmarks (`!!w.wordmark?.image`).
- **Current PNG wiring untouched:** `song settings.json` keeps `team_wordmarks.WOLVES` pointing at the current Icon PNG (`WOLVES wordmark - Icon (blue panel, three trees) - from Jefferson reference.png`, `colours.background: ""`, `letter_share: 0.668`).
- **Synthetic SVG swap check (pure Node, temp folder cleaned):** Swapping **only** `team_wordmarks.WOLVES.image` in `song settings.json` to a synthetic `4.5:1` transparent SVG (`viewBox="0 0 450 100"`, no `width`/`height` attributes) passed `songAppearance` + `growWordmarks`: all 7 `WOLVES` resolved `size={w:450,h:100}`, `margin=0`, and grew cleanly to **80.0% of frame width** (31.6% height, `cap` 21.1%, well above the 13.5% room minimum even with `letter_share: 0.668` left in place; removing `letter_share` when the real SVG arrives is optional and would report the true 31.6% letter height).
- **Honest limitation:** Because no browser was launched, the `viewer.html` SVG rasterization and padded ripple paths were syntax-checked (`node --check`) and mathematically verified, not visually rendered in headless Chrome yet.

### 2. Image wordmarks much larger (sized by ink box)
- `deterministic/composition.mjs` (`growWordmarks`):
  - Sizes every image wordmark by its projected **ink box** width share (independent of panel padding or old typed-text box width) toward `WORDMARK_ALONE_WIDTH = 0.80` (80% of frame width), bounded by the existing `0.94 × 0.90` safe margins, overlap gate, shown-whole gate, and static-partial check; with neighbours, grows as large as room allows under those same gates.
  - Added half-edge pivots (`±0.5`) after `[0, 0]` so any needed clearance nudge stays closer to centre, and allowed a lone static-entrance wordmark switching on before its hold lands to start cleanly at its hold start (still `<=` sung onset, 0 frames late) when pre-hold frames overlap the outgoing plaque (which unlocked `w10028 WOLVES!`, the final shot, to reach 80.0% dead-centred).

#### `WOLVES` (and `PORTLAND`) ink width share: 6h vs 6i

| Scene word | Map idx | Time (s) | Focus frame | 6h ink width | 6i ink width | 6i ink height | 6i centre (NDC) | Notes |
|---|---:|---:|---:|---:|---:|---:|---|---|
| `w15 WOLVES` | 14 | 16.76 | 509 | 29.0% | **80.0%** | 83.6% | `(0.00, 0.00)` | Alone; full 80% target |
| `w28 WOLVES` | 27 | 25.73 | 778 | 27.4% | **56.1%** | 58.7% | `(0.00, -0.30)` | Alone; tall 1.7:1 PNG limited vertically by `w27 ATTACK` on outgoing move |
| `w4038 WOLVES!` | 137 | 70.48 | 2120 | 27.4% | **80.0%** | 83.6% | `(0.00, 0.00)` | Alone; full 80% target |
| `w7015 WOLVES!` | 273 | 119.42 | 3589 | 27.4% | **80.0%** | 83.6% | `(0.00, 0.00)` | Alone; full 80% target |
| `w7028 WOLVES!` | 286 | 128.30 | 3855 | 27.4% | **63.6%** | 66.5% | `(0.00, -0.20)` | Alone; tall 1.7:1 PNG limited vertically by `w7027 ATTACK` on outgoing move |
| `w10015 WOLVES!` | 381 | 168.14 | 5050 | 27.4% | **56.3%** | 58.9% | `(0.00, -0.30)` | Alone; tall 1.7:1 PNG limited vertically by `w10014 PACK` on outgoing move |
| `w10028 WOLVES!` | 394 | 176.95 | 5314 | 27.4% | **80.0%** | 83.6% | `(0.00, 0.00)` | Alone (final frame); `on 5298->5307`, full 80% target |
| `w8001 PORTLAND` | 287 | 129.47 | 3890 | 40.1% | **59.5%** | 28.4% | `(0.00, +0.22)` | Alone (red block `0.25` margin); limited by `w8002 KNOWS` on outgoing move |

*Note on the upcoming 4:1–5:1 SVG:* On `w28`, `w7028`, and `w10015`, the 1.70:1 PNG is limited to 56–64% width only because growing a 1.7:1 box to 80% width makes it 83.6% tall (nearly 3× the plaque height), touching the adjacent plaque during the outgoing camera move. In the synthetic 4.5:1 SVG swap test, all 7 `WOLVES` reach **80.0% width × 31.6% height**, centred, with zero adjacent-plaque conflict.

### 3. No dropped words while there is room
- **Which pass dropped `w9033 A` (`idx=365`, `159.08 s`, in `"UP FOR A TR3Y"`):**
  - `enforceMinSize` pass 1 grew `w9033 A` `x1.06` from `8.7%` to `9.3%` (passing the `9.0%` crowded minimum).
  - `enforceMinSize` pass 2 saw nearby words thinned, raised the hold minimum to `13.5%` (with room), could not grow `A` in place across the 9 pivots, and set `w.dropped = 'size'`.
  - `placeInRoom` (`composition.mjs:737`) then skipped it because it filtered `if (!w.keyword || ... || !['size', 'static'].includes(w.dropped)) continue;`, ignoring non-keywords and `'room'` drops — and the room gate in `build_song.mjs` only checked `placeInRoom`.
- **Engine fixes (`deterministic/composition.mjs`, `deterministic/build_song.mjs`):**
  - Extended `placeInRoom` and the hard room gate (`ROOM FOR A DROPPED WORD FAIL`) to **all** dropped words (both keywords and non-keywords, across `'size'`, `'static'`, and `'room'` drops).
  - Added `0.25` offset steps, onset-frame fallback when pre-onset frames fail before camera landing, `readableOrientation` check, focus-hold size validation matching `sizeShortfalls`, and later-hold hiding when another word of size stays on screen.
  - Fixed a bug in `enforceMinSize` (`composition.mjs`) where a filler dropped with `dropped = 'room'` inside the same pass was overwritten at the end of the pass with `dropped = 'size'` and `size_restore = "[[0,0]]"` — which in 6h caused `undoSizeForEmpty` to delete `w9025 RIGHT`'s `dropped` flag while leaving its opacity `[[0,0]]` (invisible yet undropped).

#### Words restored in 6i (dropped/invisible in 6h, now shown in 6i) — 8 words
1. `w07 THAT` — map index `6`, `12.11 s` (was 6h `room`): moved `3` heights up plaque, grown `x1.14`, letters `13.9%` (`13.5%` min), pop.
2. `w09 THAT'S` — map index `8`, `12.95 s` (was 6h `size`): moved `1` height up plaque, grown `x1.75`, letters `13.9%` (`13.5%` min), pop.
3. `w5007 YOUR` — map index `144`, `73.10 s` (was 6h `size`): moved `-0.25` widths and `1` height, grown `x1.11`, letters `13.9%` (`13.5%` min), pop.
4. `w5040 DOES` — map index `177`, `84.53 s` (was 6h `room`): moved `3` widths and `-0.25` heights, grown `x1.07`, `on 2535->2536` (onset), letters `13.9%` (`13.5%` min), pop.
5. `w5047 DOES` — map index `184`, `86.79 s` (was 6h `size`/`room`): moved `-1.5` heights, grown `x1.30`, letters `9.3%` (`9.0%` min), pop.
6. `w9010 ON` — map index `342`, `149.65 s` (was 6h `room`): moved `3` heights up plaque, grown `x1.37`, letters `13.9%` (`13.5%` min), pop.
7. `w9027 TO` — map index `359`, `156.91 s` (was 6h `room`): moved `-1.5` heights, grown `x2.46`, letters `9.3%` (`9.0%` min), pop.
8. `w9033 A` — map index `365`, `159.08 s` (was 6h `size`, `"UP FOR A TR3Y"`): **restored right in its planned spot** (`du=0, dv=0`), letters `9.3%` (`9.0%` min), pop.

*(In addition, 8 other fillers that 6h only brought back undersized via `undoSizeForEmpty` — `w4002 WHEN` idx 101 at `53.52 s`, `w6035 OR` idx 225 at `100.31 s`, `w6056 THE` idx 246 at `107.83 s`, `w6060 AND` idx 250 at `109.36 s`, `w6061 THAT` idx 251 at `109.52 s`, `w9029 IT'S` idx 361 at `158.01 s`, `w9031 UP` idx 363 at `158.53 s`, and `w9032 FOR` idx 364 at `158.73 s` — are now placed at readable size by `placeInRoom`, alongside the 9 restored keywords: 25 words put back total.)*

#### Drops that stay in 6i — 3 words (all non-keywords; 0 keywords dropped; 0 too-fast drops)
Keyword mode found `0` fast stretches in Big Toothy Grins (`keywords.dropped: 0`), so **none** of the remaining drops are for speed — all 3 stay dropped for **no room**:

1. `w10 THE` — map index `9`, `13.21 s` (`dur = 0.170 s`, local rate `2.5 wps`, `dropped = size`): **no room** — after `w09 THAT'S` is restored beside `w08 HOWL?`, no placement within 3 widths/heights fits whole and readable through onset at the `13.5%` room minimum (needs `x1.75` growth) without overlapping other words or sitting static and partly on screen.
2. `w2030 AND` — map index `57`, `36.73 s` (`dur = 0.240 s`, local rate `3.5 wps`, `dropped = room`): **no room** — dropped to make room for keyword `w2029 MISS` in a crowded 4-word / 33%-area frame (`SHOOT`, `YOU`, `YOU`, `MISS`); even at `x1.00` (`9.0%` crowded minimum), no placement within 3 widths/heights is clear of neighbours and whole in frame.
3. `w9025 RIGHT` — map index `357`, `156.39 s` (`dur = 0.263 s`, local rate `3.5 wps`, `dropped = room`): **no room** — dropped to make room for keyword `w9026 BACK`; no placement within 3 widths/heights fits whole and clear at the `9.0%` crowded minimum (letters `5.1%`, needs `x1.83`).

*Honest note on non-`dropped` sync/shown-whole items (unchanged from 6h):* `checkSync` also reports 3 pre-existing words that were never `w.dropped` but sit out of frame around their onset due to section camera paths (`w8003 OUR` idx 289 at `130.36 s`, `w9006 GOES` idx 338 at `148.59 s`, `w9008 TWO` idx 340 at `149.19 s`), plus `TREY` (idx 366 at `159.26 s`) which is shown on screen as `TR3Y` via `word_overrides["366"].display` so `checkSync`'s text match doesn't pair it. None of those 4 were caused by Brief 16.

### 4. End under 3:00 in the timeline (`end_s: 178.15`)
- `deterministic/build_song.mjs`:
  - Added optional song setting `end_s`: `const SONG_END = song.end_s != null ? Math.min(song.end_s, map.duration_s) : map.duration_s;`.
  - Filtered `sung` events (`map.words`, `repeatsFile.events`) and `map.beats` to `<= SONG_END`, so `meta.frames`, `endOnWord`, `buildReveal`, `checkStillEnding`, `checkSync`, `checkHolds`, and `emptyEnds` all operate inside the trimmed timeline.
- `Big Toothy Grins Music Video/engine input/song settings.json`:
  - Added `"end_s": 178.15` (preserving `custom_fonts`, `jersey_font: "twolves_pointy"`, and `team_wordmarks.WOLVES` untouched).
- **Final frame count & rounding:** `178.15 * 30 = 5344.5` -> `Math.round(5344.5) = 5345` frames at 30 fps (**frames `0` through `5344`**; last frame `5344` is at `178.133 s`, total duration `178.167 s`, matching `capture.mjs`'s `Math.round((t1 - t0) * fps)`). No change at the start (`opening blank: 0`). `w10028 WOLVES!` is at rest from frame `5307` (`176.90 s`) through frame `5344` (`37` still frames = `1.23 s`, `stillEnding: PASS`).

---

## Gate & Type-rules verification (`Rough cut 6i - 23 November`)
- **Join exit code:** `0` (`Whole song - final - scene.json` written).
- **Hard gates:** all PASS — `sync late: 0`, `idle: 0`, `finalPartial: 0`, `overlaps: 0`, `staticFinal: 0`, `roomLeft: 0`, `keywordsDropped: 0`, `emptyEnds: []`, `emptyRuns: []` (longest short gap 6 frames), `opening blank: 0`, `stillEnding: PASS` (frame 5344).
- **Type rules check** (`Rough cut 6i - 23 November/Type rules check - 23 November 2026.md`):
  - **10 failures total** (`byRule: [10, 0, 0, 0]`, down from 18 in 6h): 10 Rule 1, **0 Rule 2**, **0 Rule 3**, **0 Rule 4**.

---

## Suggested stills to render & check (time, frame, word)
1. **`16.97 s` (frame `509`) — `w15 WOLVES`**: first chorus hero wordmark, grown to **80.0% width × 83.6% height**, dead-centred.
2. **`25.93 s` (frame `778`) — `w28 WOLVES`**: second chorus wordmark (**56.1% width**, shifted `-0.30` vertically to clear `w27 ATTACK` on the outgoing move — worth eyeballing whether the 1.7:1 vertical shift looks good before the 4.5:1 SVG arrives).
3. **`128.50 s` (frame `3855`) — `w7028 WOLVES!`** and **`129.67 s` (frame `3890`) — `w8001 PORTLAND`**: back-to-back lone wordmarks (`63.6%` and `59.5%` ink width).
4. **`159.17 s` (frame `4775`) — `w9033 A` in `"UP FOR A TR3Y"`**: confirms `A` is back in its planned spot with no gap and no overlap.
5. **`12.17 s` (frame `365`) — `w07 THAT`** and **`13.03 s` (frame `391`) — `w09 THAT'S`**: two newly restored fillers in Section 1 (verify placement above the line reads naturally).
6. **`177.13 s` (frame `5314`) and `178.13 s` (frame `5344`, last frame) — `w10028 WOLVES!`**: confirms the final shout is **80.0% width**, dead-centred, and held cleanly to the cut at frame `5344` (`< 3:00`).

---

## Files to consider cleaning up later (not deleted)
- Older rough cut folders in `~/Experiments/Big Toothy Grins Music Video/engine output/` (`Rough cut 6h - 23 November` and earlier) were left untouched per Rule 2; only our own temp folder `/tmp/brief16` was created and deleted.

---

## Addendum results (WOLVES SVG wired in — Rough cut 6j, 23 November 2026)

Carried out on branch `world-canvas` (no engine code changes were required — commit `6e00ae9`'s SVG `viewBox`, ink-box sizing, and `margin = 0` support worked cleanly alongside commits `c3c0ea4` and `a4ad096`). Re-joined Big Toothy Grins into a new folder using `--skip-build` from 6i's 10 built sections (no section rebuild required; `Rough cut 6i - 23 November` left untouched). **No browser was launched and nothing was rendered.**

### Commits & outputs
- **Song repo (`~/Experiments/Big Toothy Grins Music Video`, branch `main`):** `7b73fee` — added `engine input/WOLVES wordmark - Icon lettering only - traced vector.svg` (copied from `~/Experiments/Timberwolves WOLVES Icon Wordmark Vector/WOLVES Icon wordmark - vector.svg`, `2543.94 × 1065.47` = `2.39:1`) and updated `engine input/song settings.json` (`team_wordmarks.WOLVES.image` pointed at the SVG, `colours.background: ""`, removed old `letter_share: 0.668` so lettering reports its true `1.0` share of the lettering-only SVG). Old Icon panel PNG and Statement PNG left in place unused. Note: `song settings.json` also carried prior uncommitted Rough cut 6–6i settings; `Keyword marks - Opus pass - 23 November 2026.json` and all other pre-existing untracked/modified files were kept out of the commit.
- **Engine repo (`~/Experiments/Kinetic Type Engine`, branch `world-canvas`):** no code changes needed; this results update committed separately.
- **6j join folder:** `~/Experiments/Big Toothy Grins Music Video/engine output/Rough cut 6j - 23 November`
- **Final frame count:** **`5345` frames** at 30 fps (frames `0` through `5344`, last frame at `178.133 s`, `end_s: 178.15`; unchanged from 6i; `w10028 WOLVES!` at rest from frame `5307` through `5344`).

### `WOLVES` (and `PORTLAND`) ink width share: 6i vs 6j

All 7 `WOLVES` occurrences resolved `size = { w: 2543.94, h: 1065.47 }`, `margin = 0`, `letter_share = 1`, embedded as `data:image/svg+xml;base64,...`.

| Scene word | Map idx | Time (s) | Focus frame | 6i ink width (1.70:1 PNG) | 6j ink width (2.39:1 SVG) | 6j ink height | 6j centre (NDC) | Notes |
|---|---:|---:|---:|---:|---:|---:|---|---|
| `w15 WOLVES` | 14 | 16.76 | 509 | 80.0% | **80.0%** | 59.6% | `(0.00, 0.00)` | Alone; full 80% target, centred |
| `w28 WOLVES` | 27 | 25.73 | 778 | 56.1% | **77.9%** | 58.0% | `(0.00, -0.30)` | Alone; **+21.8 pp** wider than 6i (still shifted `-0.30` to clear `w27 ATTACK` on outgoing move) |
| `w4038 WOLVES!` | 137 | 70.48 | 2120 | 80.0% | **80.0%** | 59.6% | `(0.00, 0.00)` | Full 80% target, centred |
| `w7015 WOLVES!` | 273 | 119.42 | 3589 | 80.0% | **80.0%** | 59.6% | `(0.00, 0.00)` | Alone; full 80% target, centred |
| `w7028 WOLVES!` | 286 | 128.30 | 3855 | 63.6% | **80.0%** | 59.6% | `(0.00, 0.00)` | Alone; **+16.4 pp** wider than 6i, now dead-centred (was `-0.20` in 6i) |
| `w10015 WOLVES!` | 381 | 168.14 | 5050 | 56.3% | **77.9%** | 58.0% | `(0.00, -0.29)` | Alone; **+21.6 pp** wider than 6i (shifted `-0.29` to clear `w10014 PACK` on outgoing move) |
| `w10028 WOLVES!` | 394 | 176.95 | 5314 | 80.0% | **80.0%** | 59.6% | `(0.00, 0.00)` | Alone (final frame); `on 5298->5307`, full 80% target, centred |
| `w8001 PORTLAND` | 287 | 129.47 | 3890 | 59.5% | **59.5%** | 28.4% | `(0.00, +0.22)` | Unchanged (red block `0.25` margin) |

### Words restored or dropped vs 6i
- **Restored (6i → 6j):** none (`0`).
- **Newly dropped (6i → 6j):** none (`0`).
- The exact same 3 non-keywords remain dropped for **no room** (`w10 THE` at `13.21 s`, `w2030 AND` at `36.73 s`, `w9025 RIGHT` at `156.39 s`); `0` keywords dropped; `w9033 A` in `"UP FOR A TR3Y"` remains restored.

### Gate & Type-rules verification (`Rough cut 6j - 23 November`)
- **Join exit code:** `0` (`Whole song - final - scene.json` written).
- **Hard gates:** all PASS — `sync late: 0`, `idle: 0`, `finalPartial: 0`, `overlaps: 0`, `staticFinal: 0`, `roomLeft: 0`, `keywordsDropped: 0`, `emptyEnds: []`, `emptyRuns: []` (longest short gap 6 frames), `opening blank: 0`, `stillEnding: PASS` (frame `5344`).
- **Type rules check** (`Rough cut 6j - 23 November/Type rules check - 23 November 2026.md`): **`10` failures total** (`byRule: [10, 0, 0, 0]`, identical to 6i: 10 Rule 1, 0 Rule 2, 0 Rule 3, 0 Rule 4).

### Suggested stills to render & check (6j)
1. **`16.97 s` (frame `509`) — `w15 WOLVES`**: first chorus hero SVG (`80.0% × 59.6%`, centred, transparent with blue fill / white inner / green outer outline and padded ghost ripple).
2. **`25.93 s` (frame `778`) — `w28 WOLVES`**: jumped from `56.1%` to **`77.9%` width** (`(0.00, -0.30)`); check balance and clearance from `w27 ATTACK`.
3. **`128.50 s` (frame `3855`) — `w7028 WOLVES!`**: jumped from `63.6%` to **`80.0%` width**, now dead-centred (back-to-back with `w8001 PORTLAND` at `129.67 s` / frame `3890`).
4. **`168.33 s` (frame `5050`) — `w10015 WOLVES!`**: jumped from `56.3%` to **`77.9%` width** (`(0.00, -0.29)`).
5. **`177.13 s` (frame `5314`) and `178.13 s` (frame `5344`, last frame) — `w10028 WOLVES!`**: final hold SVG (`80.0% × 59.6%`, centred) through the end cut at frame `5344`.

### Anything left undone / files to consider cleaning up
- **Visual render check pending:** No browser was launched and no frames were rendered, so actual Chromium rasterization of the embedded SVG (`data:image/svg+xml;base64,...`) and the padded ripple on `margin = 0` still need a real render check on the stills above.
- **Left untouched (not deleted per temp-only rule):** `engine input/Keyword marks - Opus pass - 23 November 2026.json` (kept out of commit `7b73fee` per addendum item 4; consider removing or moving out of `engine input/`), and older rough-cut folders in `engine output/` (`Rough cut 6i - 23 November` and earlier).
