# Props

Drawing components that more than one video can use: objects drawn on the board beside the type (a phone, a gavel, a poker chip, a coin, an ant). Empty in phase 1; the props of the Elon video are to be ported here, one file per prop, named after the object (`props/PokerChip.tsx`).

## The interface a prop follows

1. **A plain React SVG component.** It takes its position and size in world px (`x`, `y`, `size`, optionally `angle`), its animation state as plain numbers (`t` in song seconds, an `open` or `progress` from 0 to 1), and colours as props. It returns SVG elements only, with no `<svg>` wrapper, no hooks that read the frame, and no fonts it loads itself. `fixtures/ipo-proof/AntMark.tsx` is the pattern for shape (it takes its default colour from the first video's palette file, which a shared prop should not).
2. **Colours default to palette roles.** Read defaults from `PALETTE` (engine/config.ts) inside the component body, never at module load, so a prop takes each video's palette: `colour = PALETTE.paper`.
3. **A board puts it on the board as a graphic** (`board.graphics`, `DecorGraphic` in engine/types.ts): `{id, layer, from, until, exit?, owner?, box(c), draw(c, life)}`. `draw` returns the prop; `box` returns the prop's ink as world polygons for the validator, from the same numbers `draw` uses. A prop file may export a helper that builds the whole graphic (`chipGraphic({...}): DecorGraphic`) so the box and the drawing cannot drift apart.
4. **A moving prop is tracked.** If a prop travels, add a `TrackedElement` (engine/motionCheck.ts: `{id, sample(t), from?, to?}`) to `board.track`, so the validator checks its speed and state changes like a word.
5. **A prop words must not cover** declares its shape through `board.keepClear(t)` (world polygons).
6. **Props read as the real thing**: real defining features (edge spots on a chip, a modern phone, a gavel's face), no puns the viewer has to decode.
