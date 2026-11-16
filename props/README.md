# Props

Drawing components that more than one video can use: objects drawn on the board beside the type (a phone, a gavel, a poker chip, a coin, an ant). The props of the Elon video (DOGEfather) are ported here, one file per prop, named after the object (`props/Phone.tsx`); `props/index.ts` exports them all, and the catalogue below lists them.

## The interface a prop follows

1. **A plain React SVG component.** It takes its position and size in world px (`x`, `y`, `size`, optionally `angle`), its animation state as plain numbers (`t` in song seconds, an `open` or `progress` from 0 to 1), and colours as props. It returns SVG elements only, with no `<svg>` wrapper, no hooks that read the frame, and no fonts it loads itself. `fixtures/ipo-proof/AntMark.tsx` is the pattern for shape (it takes its default colour from the first video's palette file, which a shared prop should not).
2. **Colours default to palette roles.** Read defaults from `PALETTE` (engine/config.ts) inside the component body, never at module load, so a prop takes each video's palette: `colour = PALETTE.paper`.
3. **A board puts it on the board as a graphic** (`board.graphics`, `DecorGraphic` in engine/types.ts): `{id, layer, from, until, exit?, owner?, box(c), draw(c, life)}`. `draw` returns the prop; `box` returns the prop's ink as world polygons for the validator, from the same numbers `draw` uses. A prop file may export a helper that builds the whole graphic (`chipGraphic({...}): DecorGraphic`) so the box and the drawing cannot drift apart.
4. **A moving prop is tracked.** If a prop travels, add a `TrackedElement` (engine/motionCheck.ts: `{id, sample(t), from?, to?}`) to `board.track`, so the validator checks its speed and state changes like a word.
5. **A prop words must not cover** declares its shape through `board.keepClear(t)` (world polygons).
6. **Props read as the real thing**: real defining features (edge spots on a chip, a modern phone, a gavel's face), no puns the viewer has to decode.

## Using the library

1. Import from `props/index.ts`. Every prop takes `x`, `y` (its anchor, world px), `size` (world px of one natural dimension, named in the catalogue; default the natural size), `angle`, `opacity`, `hero` (10 px outlines instead of 6) and `colours` (overrides for any role).
2. **Colour roles** (`propColours` in `common.ts`), read from `PALETTE` at draw time: `ground` (dark ink, screens, holes; the first video's Carbon), `body` (cases and plates, from `PALETTE.shadow`; Slate), `paper` (outlines, paper; Thermal), `highlight` (money, lights; Highlighter), `accent` (red parts; Kerf), `accent2` (pens, blue parts; Ballpoint). Two roles the engine palette lacks are derived: `muted` (grey detail, ground mixed 60 percent toward paper; Ghost) and `wall` (a second dark ground, ground mixed 60 percent toward shadow; Wall). Pass `colours` to set them exactly.
3. **On a board**: each prop has `xxxGraphic({id, from, until, layer?, exit?, exitBy?, owner?, line?, persistent?, ground?, props})`, where `props` is the prop's props or a function of song seconds. `draw` and `box` read the same props, and `box` is the prop's world quad (`xxxQuad`). For a moving prop add `propTrack(id, propsAt, xxxQuad, {from, to, state})` to `board.track`; for a prop words must not cover, return its `xxxQuad(propsAt(t))` from `board.keepClear(t)`.
4. Text in props (Strip, Dialog and Browser buttons, the Cursor's badge) uses the configured font named `mono`, else the default font, or `typeface` if given. Their geometry assumes a monospaced face with 0.612 em advances (Space Mono).
5. `example/PropsGallery.tsx` (composition `PropsGallery` in the example's Root) shows every prop on a grid with its working parts cycling.

## Catalogue

Animation params are plain numbers the board computes from song time; 0 to 1 unless stated.

1. `BadgeRail`: a rail with ID badges clipped on (size = 600 overall width). `count`, per badge `clips` (open), `drops` (px fallen), `tilts` (degrees).
2. `BassDrum`: a marching bass drum, head to the viewer, two mallets (size = 580 width). `strikes: [left, right]` (0 drawn back, 1 on the head), `flex` (head dents in on contact).
3. `Bill`: a banknote with engraving, no numerals or portrait (size = 470 width). No working parts.
4. `BillFan`: bills fanned like cash held at the corner (size = one bill's 470 width). `fan` (0 stacked, 1 fanned), `count`, `step` (degrees).
5. `Bin`: a ribbed desktop trash can with a hinged lid (size = 200 width). `lid` (degrees open). `binMouth` gives the drop point.
6. `Browser`: a browser window (size = 720 width). `page` ('grid', 'chat', 'blank'); grid: `amounts` (0 to 8, highlight blocks wipe on), `tapped` (thumbnail index); chat: `ghosted` (0 to 3); `button: {label, press}`.
7. `CargoShip`: a cargo ship with a grain sack and pill bottle on deck (size = 524 width). `rock` (degrees of roll).
8. `Chainsaw`: a chainsaw, hero prop (size = 655 width). `chain` (px of chain travel; under 33 per frame reads forward), `puff` (one exhaust puff cycle).
9. `ChipSpray`: wood chips thrown on parabolas from a chute (world px; `scale` multiplies distances). `p` (progress through a 20-frame spray), `angle` (spray direction), `count`, `seed`.
10. `Chipper`: a towable wood chipper, hero prop (size = 735 width). `drum` (degrees), `shake` (px jitter of the body). `chipperChuteExit` and `chipperChuteAngle` feed ChipSpray.
11. `Clinic`: a small house with a plus window (size = 236 width). `lit` (window), `frost` (blue tint and icicles).
12. `ContractSheet`: a signed contract page (size = 300 width). No working parts.
13. `Cursor`: an arrow pointer in a mortarboard (size = 52 arrow width). `busy` (arrow becomes a busy ring), `spin` (ring degrees), `press` (click dip), `lanyard` (badge drops on), `tassel` (degrees), `cap`.
14. `Dial`: a gauge with safe and danger bands and a trefoil (size = 360 diameter). `value` (needle), `safeTo`, `dangerFrom`.
15. `Dialog`: a system alert with a warning triangle and one button (size = 520 width). `press` (button depresses 4 px), `label`.
16. `Figure`: a stroke figure, adult or child (size = standing height, 150 or 87). `pose` ('stand', 'lean', 'lie', 'sit'), `changes: [{at, to}]` with `t` (each change a 14-frame eased move), `stride` (walking phase, radians), `flip`.
17. `FileDrawer`: a filing cabinet whose top drawer slides out with folders (size = 360 width). `extension`.
18. `Gavel`: a gavel and sound block (size = 322 width). `swing` (0 raised, 1 on the block). `gavelFace` gives the strike point.
19. `Germ`: a spiked virus particle (size = 40 diameter). `spin` (degrees).
20. `Globe`: a desk globe (size = 310 width). `turn` (longitude at the face centre), `dots: [{lat, lon, lit}]`.
21. `GrainSack`: a tied burlap sack with a wheat mark (size = 130 width). No working parts.
22. `HabitatDome`: a dashed "never real" plan dome (size = 84 width). `draw` (drawn on by stroke length).
23. `Hemicycle`: a parliament seat diagram (size = fan width, 2 x `radius`). `p` (recolour from `start` to `colour`), `rows`, `seats`.
24. `IdBadge`: an ID badge on a clip (size = 100 width). `clip` (0 closed, 1 open).
25. `Mars`: a red planet with craters (size = 260 diameter). `domes` (0 to 3, plan domes draw on along the limb).
26. `Monitor`: a desktop monitor showing a ledger (size = 560 width). `lit`, `select` (ledger blocks outlined top to bottom), `headset`.
27. `Mug`: a glass beer mug with a foam head (size = 160 width). No working parts.
28. `Pen`: a click ballpoint pen in writing pose, anchored at the tip (size = 362 length). `click`.
29. `Phone`: a modern smartphone (size = 300 width). `screen` ('chat', 'incoming', 'outgoing', 'blank'), `bubbles` (chat bubbles pop in, up to 5), `badge`.
30. `PillBottle`: a prescription bottle with a child-proof cap (size = 140 width). No working parts.
31. `PostCard`: a social post card, no logo (size = 440 width). No working parts.
32. `Printer`: a thermal receipt printer, slot up (size = body width, `width` + 140). No working parts; draw paper under it. `printerSlot` gives the slot.
33. `ReceiptPaper`: torn thermal paper with banding (world px `x, y, w, h`). `serrated`, `tooth`.
34. `Rocket`: a rocket with fins and a flame (size = 124 width). `burn` (flame length and opacity), `flicker` (flame shape phase).
35. `Spot`: a stage spotlight hung from a truss, with a beam (size = 140 fixture width). `aim` (degrees from down), `on` (beam and lens), `beam`, `spread`. The beam is not in its box (`spotBeamPolygon` gives it).
36. `Strip`: receipt paper printing mono figures with pen marks (size = paper width). `t` (song seconds) with `printFrom`, `printTo` (characters ink in as the paper jolts), `strikes`, `brackets` (pen marks, each `{chars, at}`), `highlight` (draws on, can draw back).
37. `Tie`: a necktie under a shirt collar (size = 132 collar width). `swing` (degrees). `tieTip`, `tieKnot` give its points.
38. `TrefoilMark`: a radiation trefoil on a highlight disc (size = 56 diameter). No working parts.
39. `Truss`: a lighting truss beam (world px `x0, x1, y`, `depth`). No working parts.
40. `WaveLine`: a sine wave line (world px `x0, x1, y`). `phase` (px; moves crests toward +x), `amplitude`, `wavelength`. `waveY` floats things on it.
41. `WitnessChair`: an upholstered chair, front view (size = 224 width). No working parts.
42. `WitnessTable`: a hearing-room table with a name card and microphone (size = 520 width). No working parts.
