# Step 3 smear and textLength investigation

Source lines refer to the frame core at the end of step 3.

## Smear compositing

**Confirmed in markup.** In [TypeStage.tsx](../../engine/TypeStage.tsx#L251), lines 251–277 put every verb overlay and world-space `over` graphic in the blur pass. The sharp pass draws sharp blocks without those overlays. [SmearStage](../../engine/smear.tsx#L43) lays the sharp pass over the entire averaged stack at lines 43–49.

An esbuild/Node SSR probe rendered a sharp word with both a tagged verb overlay and a tagged `over` graphic. The blur pass held both tags. The sharp pass held the word and neither tag. Where their ink overlaps, this ordering places both marks behind the sharp word. The sharp pass also moves all reading words above the blur stack regardless of their original block order.

Route over-ink by explicit word ownership and pass. Draw a sharp-owned overlay once after its owner. Keep blur-owned ink in the samples and decide the ordering of unowned over-ink and mixed-owner cues before making a general change. The main agent should inspect a transit frame with a reading word, a verb overlay, and a world-space over-graphic, plus the adjacent unsmeared frame.

## Per-letter textLength and spaces

**Confirmed switch, unverified pixel jump.** [TypeStage.tsx](../../engine/TypeStage.tsx#L53) accumulates every advance at line 53. Lines 69–76 use a single kerned text run with `textLength={g.w}` until a per-letter mod is present. Lines 80–99 then draw one text node per non-space glyph and assign its own `textLength`. [metrics.ts](../../engine/metrics.ts#L14) folds pair kerning into the preceding advance at lines 14–18, so the split form can scale individual glyphs differently from the browser-shaped whole run. [wah.ts](../../engine/wah.ts#L40) and [spread.ts](../../engine/spread.ts#L73) return no letter mods before their active window.

The SSR probe switched `AV A` from one text node at frame 12 to three identity-transformed nodes at frame 13. The whole run had a 250.03 px advance. In split mode the last A started at 176.61 px, 35.46 px past the end of V. That gap matched the space advance in layout. The allegation that splitting collapses an internal space is false for this path. Whole-run whitespace normalization for repeated or edge padding, and the actual change in glyph ink positions, need browser evidence.

If the main agent sees a jump, test a persistent letter representation for affected words. Use the metrics' natural glyph advances for glyph width and apply pair kerning to the next position. Compare adjacent frames with identity transforms for an AV pair and for explicit padding. Inspect both pixel displacement and space width. Neither investigation changed the renderer.
