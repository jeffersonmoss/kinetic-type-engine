# Engine fix brief 17 — results (23 November 2026)

Implemented generic photographic backdrops, screen-space hoisted props with brief 13 ghost ripples, the prop-covers-sung-word join gate, and backdrop-aware empty-screen handling on branch `world-canvas` in `~/Experiments/Kinetic Type Engine`. No song names in engine code. No browser was launched and nothing was rendered.

## What changed

1. **`deterministic/interp.js`** (shared between Node and `viewer.html` via `globalThis.KT_INTERP`):
   - Added `SHARP_EASE` (`{ a: 2, b: 4, x0: 0.34 }`), `backdropRect(b, W, H)`, `backdropOpacity(b, frame)`, `propOpacityAt(p, frame)`, `propPoseAt(p, frame)`, `propScreenRects(p, frame, backdrops, W, H)`, and `stageVisible(scene, frame, W, H)`.
   - Both Node gates/checks and `viewer.html` use the exact same backdrop-to-screen transform, fade math, and sharp-eased keyframe interpolation.
2. **`deterministic/png_alpha.mjs`**:
   - Extended `pngAlphaBox(file, { minY = 0, maxY = Infinity, alphaMin = 128 } = {})` with optional vertical bounds and alpha threshold (defaults preserve exact existing behavior) so cable-hung PNG props can measure their opaque body bounds starting at `anchor_y` without counting thin cables above it.
3. **`deterministic/song_appearance.mjs`**:
   - Extended `imageSize(file)` with pure-Node natural dimension parsing for `.jpg`/`.jpeg` (SOF) and `.webp` (VP8/VP8L/VP8X) alongside `.png` and `.svg`.
   - Added compilation of optional `song.backdrops` and `song.props` into `scene.backdrops`, `scene.props`, and deduplicated `scene.stageImages` (repeated chorus entries pointing at the same image embed the base64 asset only once). When a song sets neither `backdrops` nor `props`, none of those three keys are added to the scene.
   - Updated the opening-blank loop to break on `KT_INTERP.stageVisible(scene, f)` as well as `scene.intro` and `fullyShown` words.
4. **`deterministic/composition.mjs`**:
   - Updated `anyVisible(scene, f, pose, vfov, sideFill)` to return `true` when `KT_INTERP.stageVisible(scene, f)` is true.
5. **`deterministic/overlap_gate.mjs`**:
   - Added `checkPropWordOverlap(scene, onsetOf, { until, W, H, focusRead })`: the new hard join gate that checks every sung word across its focus window against every visible prop's screen-space `hitBox`.
6. **`deterministic/viewer.html`**:
   - Guarded all new rendering behavior behind `hasStageLayers = !!((S.backdrops && S.backdrops.length) || (S.props && S.props.length))`. Songs without `backdrops` or `props` run the exact original opaque WebGL renderer and `renderAt` loop unchanged.
   - When `hasStageLayers` is true:
     - Uses `THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true })` with `renderer.setClearColor(0x000000, 0)`.
     - Sets `colorWrite: false` on `p.surface === 'panel'` occluder meshes (keeping `depthWrite: true`, `clippingPlanes`, and `polygonOffset`), so 3D panels still occlude 3D words behind them without painting opaque ground-coloured rectangles over the photographic backdrop or prop.
     - Decodes `S.stageImages` before `window.READY = true`.
     - Prebuilds brief 13 ghost (or outline) ripple canvases from each pulsing prop's `rippleBox` (defaulting to `[0..w, anchor_y..h]` when `anchor_y > 0`, padded by `r` on every side as in brief 16 so the ripple expands symmetrically outward from the prop banner's own edge behind the prop, not about the midpoint of the long cables).
     - Composites each motion-blur sub-frame `t` onto an opaque `sampleCanvas` in layer order: ground fill → active backdrops → `under_words` props (with ghost ripples behind by default) → WebGL 3D words → `over_words` props → running-average `1 / (k + 1)` into `output`. Also feeds `propMotionPx(frame)` into `sampleCount(frame)` so fast prop hoists blur smoothly.
7. **`deterministic/build_song.mjs`**:
   - Runs `checkPropWordOverlap(finalObj, onsetOf, { until: frames })` alongside `overlapFinal`. Any violation sets `process.exitCode = 1`, prints `PROP COVERS SUNG WORD FAIL`, stops writing `Whole song - final - scene.json` (writing the `FAILED GATES` inspection copy instead), and lists every violation under `## Backdrops and props (brief 17)` in `Whole song - provenance and flags.md`.
8. **`deterministic/KIT.md`**:
   - Documented the schema, defaults, gate, and existing-gate handling under `## Engine fix brief 17 (23 November 2026)`.
9. **`deterministic/test_stage_layers.mjs`**:
   - Added a 5-test `node:test` unit suite covering `pngAlphaBox({ minY })`, zero-impact baseline, backdrop/prop compilation + deduplication + sharp-eased step keys + `stay`, non-dead backdrop/prop empty-frame behavior, and `checkPropWordOverlap` pass/fail cases.

## Song-settings shape (documented in `deterministic/KIT.md`)

### `backdrops`

```json
"backdrops": [
  {
    "id": "ch1",
    "image": "art/Championship banner backdrop - dark arena with 2011 banner.png",
    "from_s": 36.0,
    "to_s": 60.0,
    "fit": "cover",
    "fade_in_s": 0.4,
    "fade_out_s": 0.4,
    "opacity": 1.0
  }
]
```

- `from_s` required; `to_s` defaults to song end; `fit` defaults to `"cover"` (`"contain"` and `"stretch"` also supported); `fade_in_s` / `fade_out_s` default to `0`; `opacity` defaults to `1.0`.
- Multiple entries allowed (e.g. one per chorus); identical image paths are deduplicated in `scene.stageImages`.

### `props`

```json
"props": [
  {
    "id": "banner-20xx",
    "image": "art/Championship banner 20 question marks - prop with long cables.png",
    "ref": ["ch1", "ch2", "ch3"],
    "x": 860,
    "anchor_x": 0,
    "anchor_y": 2297,
    "scale": 1,
    "layer": "under_words",
    "move_s": 0.4,
    "key_mode": "step",
    "keys": [
      { "t": 36.0, "y": 500 },
      { "t": 40.0, "y": 440 },
      { "t": 94.0, "y": 390 },
      { "t": 162.0, "y": 97, "dur_s": 0.8 }
    ],
    "stay": true,
    "ripple": {
      "kind": "ghost",
      "edge": "#D8DCDF",
      "fill": "#00538C",
      "edge_opacity": 0.9,
      "fill_opacity": 0.6,
      "behind": true
    },
    "pulses": [40.0, 94.0, 162.0]
  }
]
```

Key design notes for the song chat:
- **`anchor_y: 2297` (required for the cable-hung banner prop):** `(anchor_x, anchor_y)` in prop pixels is the point placed at `(x, y)` in backdrop pixels. Setting `anchor_y: 2297` places the banner rod at backdrop `y` (e.g. `y: 97` aligns level with the 2011 rod) while the 2297 px of cables extend cleanly off the top of the frame. It also automatically trims `hitBox` (for the gate) and `rippleBox` (for the ghost ripple) to start at `y = 2297`.
- **`ref`:** accepts a single backdrop index (`0` or `"0"`), a backdrop `id` (`"ch1"`), an array of indices/ids (`["ch1", "ch2", "ch3"]`), `"all"`, or omitted (screen pixels `1280x720`). Unless `windows` or `from_s`/`to_s` are set explicitly on the prop, the prop inherits the referenced backdrop(s)' visibility and fade windows.
- **Keyframes (`key_mode: "step"` default):** `keys[0]` sets the starting pose; each later key `{ t, y, x?, dur_s?, ease? }` moves from the previous pose starting at `t` over `dur_s` (default `move_s = 0.4` s, clamped before the next key) with `SHARP_EASE` (`{ a: 2, b: 4, x0: 0.34 }`), then holds completely still until the next key. Set `"key_mode": "span"` if you want direct key-to-key interpolation across `[keys[k-1].t, keys[k].t]` instead.
- **End move (`stay: true`, optional `stay_until_s`):** extends the prop's final window to `stay_until_s` (defaulting to song end) with `fadeOut = prop.fade_out_s ?? 0`, so the prop holds solid at full opacity while the backdrop fades out underneath it.

## Gates

### New join gate: prop covers sung word (`overlap_gate.mjs` `checkPropWordOverlap`)

- Checks every active sung word (`sungWords(scene, onsetOf)`) across its focus window `[Math.max(0, Math.min(appearance, onset)), Math.min(until, Math.max(appearance, onset) + 15))` (matching `composition.mjs`'s `focusWindow` / `FOCUS_READ = 15`).
- Projects the word's box on each frame (with `wordXform`, `drawnScale`, `wordClips`, near-plane clip at `20`, NDC clip) into `1280x720` screen pixels and clips that polygon against each visible prop's (`opacity > 0.05`) screen-space `hitBox`.
- `hitBox` defaults to the PNG's opaque alpha bounds (`alpha > 64`) from `y = anchor_y` downward (for Raise the Flagg's `450x2874` prop with `anchor_y: 2297`, this measures `[5..445, 2297..2870]` — the solid rod and banner, excluding the transparent space and 5 px suspension cables above `y = 2297`). Can be overridden per prop via `hit_box: { x0, y0, x1, y1 }`.
- Any overlap over `1 px^2` fails the join (`exit 1`, `PROP COVERS SUNG WORD FAIL`, no `Whole song - final - scene.json` written) and reports each contiguous run with the word (`id`, `text`, onset, focus frames), prop (`id`, filename), frame range and seconds, peak share of the word covered (%), peak overlap area (`px^2`), and peak frame.

### How existing gates handle backdrops and props

- **No dead screen (`composition.mjs` `anyVisible` -> `emptyFrames`, `fillEmptyFrames`, `emptyEnds`, `nearEmpty`, and `song_appearance.mjs` opening `blank`):** checks `KT_INTERP.stageVisible(scene, f)`, which returns `true` when any backdrop has `backdropOpacity(b, f) > 0.05` OR any prop has `opacity > 0.05` with its `hitBox` intersecting the `1280x720` frame. A backdrop alone on screen (or a stayed prop alone at the end after the backdrop fades out) is therefore never treated as a dead/empty frame. Outside backdrop/prop windows, empty-screen detection and fills work identically to before.
- **Projected overlap (`overlap_gate.mjs` `scanOverlap`):** unchanged — checks 3D words and 3D panels only, treating backdrops strictly as background.
- **Shown whole (`shown_gate.mjs`):** unchanged — checks sung words only, treating backdrops as background.
- **Other songs unchanged:** when a song sets no `backdrops` and no `props`, `scene.backdrops`, `scene.props`, and `scene.stageImages` are omitted, `stageVisible` returns `false`, `checkPropWordOverlap` returns immediately with `pass: true`, and `viewer.html` uses its exact original opaque WebGL path.

## What was tested

- `node --check` passed on `png_alpha.mjs`, `interp.js`, `song_appearance.mjs`, `composition.mjs`, `overlap_gate.mjs`, `build_song.mjs`, and the extracted `<script type="module">` from `viewer.html` (551 lines).
- `node --test deterministic/test_stage_layers.mjs`: **5/5 passed** (synthetic RGBA PNG `minY` alpha box, untouched baseline, backdrop/prop compilation + `stageImages` deduplication + sharp-eased step keys + `stay`, non-dead backdrop/stayed-prop empty-frame checks, and `checkPropWordOverlap` fail/pass/cables-only/after-focus cases).
- End-to-end `build_song.mjs --skip-build` scene joins run in an isolated temp folder under `os.tmpdir()` (with `TEMP_README.md`, removed immediately afterward) using a copy of `Raise the Flagg Music Video/engine output/Rough cut 6 - 23 November` sections and the real `1672x941` backdrop and `450x2874` prop PNGs:
  - **Baseline (no backdrops/props):** `backdrops: null`, `props: null`, `stageImages: null` (unchanged).
  - **Real 3-chorus backdrop + hoisted prop (`x: 860, anchor_y: 2297, ref: ["ch1","ch2","ch3"], stay: true`):** deduplicated to 2 `stageImages` (`stage1`, `stage2`), measured `hitBox: { x0: 5, y0: 2297, x1: 445, y1: 2870 }` and `rippleBox: { x0: 0, y0: 2297, x1: 450, y1: 2874 }`, and the new gate caught and reported **128 colliding chorus sung-word intervals** (`PROP COVERS SUNG WORD FAIL`, e.g. `w3029 COOP`, `w4001 RAISE`, `w4003 FLAG`, `w4007 HIGH`).
  - **Important finding for the song chat:** on the existing Rough cut 6 chorus layout, words are framed across the centre of the `1280x720` frame while a prop at backdrop `x = 860` occupies screen `x ≈ 662..999` (starting just 22 px right of centre). Because the planner/camera does not automatically reserve a keep-clear zone for screen-space props, any existing centred chorus layout will fail `checkPropWordOverlap` whenever the banner body is on screen during sung chorus words.

## What was NOT done / NOT tested

- **No Chrome render or visual check** (per rule 14: no browser launched). Actual WebGL transparent compositing (`alpha: true` + `colorWrite: false` panel occluders), backdrop cover scaling, prop hoist motion blur, and prop ghost-ripple visual appearance have **not** been visually verified in Chrome yet; the song chat should render and inspect stills (a verse frame with a panel occluder to verify `#0b0b0d` parity, a chorus hoist frame with a pulse, and the final fade-out frame with `stay: true`).
- **No automatic word/camera keep-clear avoidance around props:** brief 17 asked for the join gate (not a planner/camera avoidance pass). If Raise the Flagg's chorus words need to stay automatically clear of the hoisted banner at `x = 860` so the join passes the new gate, that will need a follow-up brief (e.g. a per-window camera keep-clear box in `camera.mjs` / `shown_gate.mjs` / `composition.mjs` that frames chorus words in the left/clear band while the prop is active).
- **Temp files:** both the unit test temp folder (`kte-brief17-test-*`) and the `--skip-build` verification temp folder (`kte-brief17-build-*`) were created under `os.tmpdir()` with `TEMP_README.md` and deleted on completion; no temp files remain.
