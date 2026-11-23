# Engine fix brief 13: results (23 November 2026)

Builder: Gemini 4 Neon. No renders, no browser launch, and no song builds or joins, as asked.

## What changed

1. **`deterministic/viewer.html` (ripple setup and `visibility`):**
   - Added per-word `w.ripple` support (default unchanged when `w.ripple` is absent or `null`, so Big Toothy Grins and all existing songs keep the exact existing ring ripple: outline at `+0.3` along `w.N`, `renderOrder = 0`, opacity `(1 - x)^1.5`).
   - **`kind: "ghost"`:** draws the word's own alpha silhouette (`wc`) filled with `fill` at `fill_opacity` (default `0.6`), plus the existing 16-tap dilated outline (`r = max(2, round(wc.height * 0.025))`, `destination-out` `wc`) tinted to `edge` at `edge_opacity` (default `0.9`), composited onto the ripple texture (`SRGBColorSpace`, `anisotropy = 8`).
   - **`behind: true`** (default `true` for `kind: "ghost"`, `false` otherwise): positions the ripple at **`-0.25` along `w.N`** (words sit at `+0.5` in front of their plaque panel, so `-0.25` stays `+0.25` in front of the opaque panel occluder while sitting behind the word) and sets **`ripple.renderOrder = -1`**, guaranteeing the transparent ghost draws before the real wordmark (`renderOrder = 0`, `depthWrite: false` for no-block image wordmarks) even at oblique camera angles.
   - **Scale and opacity curve:** same `1x` to `2x` scale path over `RIP_T` (`0.45 s`). Fast-fade opacity curve chosen: **`(1 - x)^2.5`** (overridable via optional `fade_power`; default ring stays `1.5`). Reasoning: during `x = 0..0.18` (first ~2.5 frames), the real flag itself throws outward at the same `1 + x` rate up to `THROW_PEAK = 1.18`, covering the ghost's blue fill until `x ≈ 0.22` (frame +3). With `(1 - x)^2.5`, the curve multiplier is `1.00` at `x = 0`, `0.53` at `x = 0.22` (blue fill clearly visible at ~0.32 effective alpha as it emerges), `0.18` at `x = 0.50` (halfway to 2x, quickly faded), `0.03` at `x = 0.75` (barely opaque), and `0` at `x = 1.0`.
   - Also gated ripple visibility on `front.visible` (so a word hidden via `w.opacity = 0` cannot emit a disembodied ripple) and `w.pulses && w.pulses.length`.
2. **`deterministic/song_appearance.mjs` (`songAppearance`):** copies `team_wordmarks.<NAME>.ripple` onto every matched scene word when `w.ripple === undefined` (per-word overrides win).
3. **`deterministic/word_roles.mjs` (`applyWordRoles`):** copies `word_overrides.<map index>.ripple` onto the matched word (`null` opts out of a wordmark ripple) and propagates `w.ripple` to reveal copies when not already set.
4. **`deterministic/apply_notes.mjs`:** includes `'ripple'` in the properties copied from source words to reveal copies, so a `w.ripple` set directly in `song notes.mjs` carries through.
5. **`deterministic/KIT.md`:** added a short process note under `## Engine fix brief 13 (23 November 2026)` at the end of the file. The `## Type rules` section was not edited.

## How to set it (and where Raise the Flagg sets it)

Three places flow into `w.ripple`, in order of precedence (most specific wins):

1. `word_overrides["<map index>"].ripple` in `song settings.json` (per lyric word; `null` opts out of a wordmark ripple), or `w.ripple = { ... }` set directly in `song notes.mjs`.
2. `team_wordmarks["<NAME>"].ripple` in `song settings.json` (every word using that wordmark).

**For Raise the Flagg (Cooper):** add `"ripple"` directly under `team_wordmarks["FLAG-BANNER"]` in `Raise the Flagg Music Video/engine input/song settings.json`:

```json
"FLAG-BANNER": {
  "image": "art/Mavericks banner - photoreal - transparent.png",
  "colours": {
    "background": ""
  },
  "ripple": {
    "kind": "ghost",
    "edge": "#D8DCDF",
    "fill": "#00538C",
    "edge_opacity": 0.9,
    "fill_opacity": 0.6,
    "behind": true
  }
}
```

(Because Flagg's `song notes.mjs` renames `FLAGG` words to `"FLAG-BANNER"`, `team_wordmarks["FLAG-BANNER"].ripple` is the right single place — `word_overrides` matches by `mapIndexOf`, which would not match renamed `"FLAG-BANNER"` words.)

## What was checked

- `node --check` passed on `deterministic/song_appearance.mjs`, `deterministic/word_roles.mjs`, `deterministic/apply_notes.mjs`, and the extracted `<script type="module">` from `deterministic/viewer.html`.
- Pure-Node unit assertions (no browser, no song build) passed for `songAppearance` (`team_wordmarks.ripple` copying, deep cloning, per-word precedence, `null` opt-out, and zero `ripple` property on unset wordmarks) and `applyWordRoles` (`word_overrides.ripple` copying, reveal-copy propagation, and untouched default words).
- Ran `node --test deterministic/test_keywords.mjs`: 5 of 6 passed; 1 pre-existing failure (`he dropped inside the stretch` in test 3, from brief 10 item 48 where pronouns became keywords; untouched here).

## What is untested (and exact stills to inspect)

- **Untested in WebGL / Chrome / Three.js:** canvas compositing of `fill` + `edge`, actual visual weight of `(1 - x)^2.5` over `#0b0b0d`, depth/renderOrder layering over both `panel` and `open` plaques, and visual parity on Big Toothy Grins.
- **Suggested stills for the supervisor** once Raise the Flagg re-joins with `FLAG-BANNER` and the `ripple` block above (using the pulse times already in `Raise the Flagg Music Video/engine input/song notes.mjs`, at 30 fps):
  - **Panel plaque (`panel` occluder check):** `w10012` (`FLAG-BANNER`, Bridge chant shout at `122.4067 s`, frame `3672`) or `w9047` (`119.1967 s`, frame `3576`) — still frames **`3672`, `3675`, `3677`, `3679`, `3682`** (pulse onset, emergence +3, mid-grow +5, fast-fade +7, near-gone +10).
  - **Open plaque (`open` surface check):** `w12038` (`FLAG-BANNER`, Outro chant shout at `156.0067 s`, frame `4680`) — still frames **`4680`, `4683`, `4685`, `4687`, `4690`**.
  - **Regression check (default ring unchanged):** any pulsing word in Big Toothy Grins (or `w07 EVENT` in Flagg at `7.5127 s`, frames `225`, `228`, `231`).

No temp files were created or deleted.
