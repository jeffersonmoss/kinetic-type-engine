# Kinetic Type Engine

A Remotion engine for kinetic typography lyric videos: the lyric is set as blocks of type on one large board (a world), a camera rig moves over it, every new block comes out of something already on the board (a letter, a rule, a panel, a path), and a frame-by-frame validator checks that every word can be read when it is sung. It began as the kit of the first video (Buy This IPO) and is now song-free: the song, the frame, the palette and the fonts are passed in.

Versions: Remotion 4.0.543, React 19.3.1, TypeScript 7.0.2 (see `package.json`). Run `npm install` once.

## 1. Set-up, in one page

1. **Repository layout.**
   1.1. `engine/`: the engine. `engine/index.ts` is the whole public API; import from it, not from single files.
   1.2. `props/`: drawing components a video can share (the catalogue is `props/README.md`; `example/PropsGallery.tsx` shows them).
   1.3. `tools/`: `validate-boards.mjs` (the validator), `measure-fonts.mjs` and `measure-outlines.mjs` (font metrics).
   1.4. `fonts/`: font metrics files (`*.metrics.json`) and font specs (`*.fonts.json`).
   1.5. `example/`: a 34-second scene on a made-up lyric (four boards), the worked example for this document.
   1.6. `fixtures/ipo-proof/`: the first video's proof board, rendered through this engine to check that the extraction changed nothing (section 12).
2. **A video configures the engine once.** It writes a song module (see `example/song.ts`) that calls `configureEngine(config)`, and its boards module imports that song module first, before anything else. The config:
   2.1. `words`: `{text, start_s, end_s, line}[]`, one per sung word, in order (`line` is the index into `lines`).
   2.2. `lines`: `{id, text, start_s, end_s, words}[]`, where `words` are global word indices.
   2.3. `beats` (optional): `{t}[]`. The median beat sets `BEAT_FRAMES`, the "one state change per beat" rule (19 frames without beats). `energy` (optional): loudness 0 to 1 at 10 Hz; a few verbs scale with it.
   2.4. `fps`, `width`, `height` (default 30, 1280, 720). The speed cap is 0.025 of the width per frame (32 px at 1280), and every frame-size value (margins of the rig's framing box, the cull distance, the screen camera) follows the configured size.
   2.5. `palette`: colour roles the engine uses when a board or block names no colour: `ground` (default ground, and the shade a swinging panel darkens to), `shadow` (hard shadows, panel ink, the vignette), `paper` (type on dark grounds, rules, seam and hinge lines), `accent` (strikes, burns, bites), `accent2` (explode particles), `highlight` (rays, coins, bursts), and `light` (grounds on which the default type colour is `ground`; default `[paper, highlight, accent]`). Optional prop roles (phase 2): `body` (a prop's body colour; default `shadow`), `detail` (grey detail lines; default 60 percent of the way from `ground` to `paper`), `ground2` (a second dark ground; default 60 percent from `ground` to `shadow`). The defaults match `props/common.ts`, so a video that sets none of them renders as before.
   2.6. `fonts`: `{key: {family, style?, weight?, upper?, connectives?}}`. `upper` shows words in capitals; `connectives` names the font that connective words of a block in this font are set in (they keep the block font's case). `defaultFont` (default the first key) is used when neither block nor board names a font. `mono` (optional, phase 2): `{family, weight?}` for props and graphics that need a monospaced face (readouts, receipts); read it as `MONO_FONT` (null when unset; a `fonts.mono` key is used if present). Lyric words never use it unless a block names that key.
   2.7. `metrics`: the font metrics file (section 11), with an entry for every font key.
   2.8. `wordRules` (optional): `connectives` (default: the, a, an, of, to, and, in, on, it, is, that, this, so, or, at, for), `emphasis(i)` (extra E2 words; default number words), and `rule(i)`, a house rule applied before everything else that returns `{tier?, opts?}` (font, colour, displayed text). The fixture uses `rule` for the first video's "every baby is Baby, in the serif, E2".
   2.9. `handoffs` (optional): the handoff frames boards may start or end on (section 9.4).
3. **One configuration per bundle.** The configured values are module-level bindings, so one Remotion entry point holds one song. Each video, the example and the fixture has its own entry (`example/index.ts`, `fixtures/ipo-proof/index.ts`) with its own `Root.tsx`. Never register two songs' compositions in one root. Inside the engine nothing reads the configuration while modules load; it is read when boards are laid out and drawn.
4. **Fonts are the video's job.** Load them in a browser-only module (see `example/fonts.ts`, which uses `@remotion/google-fonts`) imported by the Root, never by the boards module, so the validator can load boards in node.
5. **Draw.** A composition renders `<SmearStage boards={BOARDS} t={useSongTime(start)} />` (or `TypeStage` without motion blur). `useSongTime(start)` turns the composition frame into song seconds.
6. **Validate.** `node tools/validate-boards.mjs <boards module> [EXPORT=BOARDS] [--step N] [--json] [--layout] [--at SECONDS]`. A relative module path is resolved against the current directory, so a host video can run the engine's tool from its own folder. It bundles the module in node, prints a report per board and line, and exits 1 on any error. `npm run validate:example` and `npm run validate:fixture` are the two checked in. `--layout` prints block placements and rows; `--at T` prints every word's screen box and opacity at song second T, the quickest way to see why a margin or overlap fails.
7. **Render** (outside any sandbox): `npm run render:example`, `npm run render:fixture`, or `npx remotion studio example/index.ts`.
8. **A host video that reads the engine in place** (as the DOGEfather film does, from its own folder with its own `node_modules`) must alias the engine folders and pin `react`, `react-dom` and `remotion` to its own `node_modules` in its `remotion.config.ts`, or the bundle holds two copies of each and hooks and `useCurrentFrame` break. The working copy is `~/Experiments/DOGEfather Music Video/film/remotion.config.ts`:
   ```ts
   const HOST = process.cwd();
   const ENGINE = path.resolve(HOST, '<path to>/Kinetic Type Engine');
   const nm = (p: string) => path.join(HOST, 'node_modules', p);
   Config.overrideWebpackConfig((config) => ({...config, resolve: {...config.resolve, alias: {
     ...(config.resolve?.alias as Record<string, string> | undefined),
     '@engine': path.join(ENGINE, 'engine'), '@props': path.join(ENGINE, 'props'),
     react: nm('react'), 'react-dom': nm('react-dom'), remotion: nm('remotion')}}}));
   ```
   Import only what `engine/index.ts` exports; the engine keeps those exports backward compatible.

## 2. The data model

8. **Board** (`Board`): one world-space arrangement with a time window. `{id, start, end, bg, colour?, exit, font?, width?, align?, blocks, rig?, rigStart?, rules?, panels?, graphics?, paths?, ground?, vignette?, handoff?, track?, keepClear?}`. `exit` is `cut` (a 12-degree slice), `fall`, `fade`, `leave` or `none`. A video is usually a few long boards, often one per chunk.
9. **Block** (`Block`): a run of consecutive sung words `[first, last]` laid out together. Placement is either an attachment code relative to the previous block (`attach: 'NEW' | 'R' | 'D' | 'CW' | 'CCW' | 'T+' | 'T-' | 'FREE' | 'FAN'`, with `at`, `offset`, `gap`, `column`, `fan`) or an anchor (`anchor: {to, align?, angle?, gap?, offset?}`, section 4). Size is either justified rows (the default: rows are broken by tier and justified to `width`, default 640) or fixed: `cap` (every row at one cap height, wrapped at `width`, connectives not halved) or `stack: {measure, dir?, leading?}` (one word per row, each row justified to `measure`, so a short word is the giant one). Other fields: `font`, `align`, `rows` (manual row breaks), `hero` and `e2` (tier lists), `colour` and `style` (per-word options), `emerge` (required, section 5), `verb` (cues, section 7), `on` (printed on a panel), `showFrom`, `keepUntil`, `z`, `pin: 'screen'`, `repeat` (growth on repeats), `tower`.
10. **Tiers.** E0 connectives (half size in justified rows), E1 ordinary words, E2 emphasis (line-final words, `e2`, `emphasis`), E3 heroes (`hero`). Rows hold one E3, or up to two E2, or up to three content words.
11. **Word options** (`WordOpts`, through `block.style[i]` or the word rule): `font`, `colour`, `tier`, `text` (displayed text), `scale`, `tilt`, `shadow`, `plate` (a coloured plate behind the word), `replace` (letter art: `'hole'`, `'ring'`, `'blank'`, or a function that draws the letter itself).

## 3. The camera rig

12. The rig is the only camera. `board.rig: RigKey[]` and `board.rigStart` (the pose at the board's start). A key is `{t, kind, frames?, by?, to?, about?, ease?, smear?, still?, follow?, speed?, dir?, label?}`.
13. **Kinds.**
    13.1. `roll`, `tilt`: change R by `by` degrees (relative to the authored R, so drift never accumulates into it), or to `to.rot`. A ROLL is the big turn (often 90 degrees); a TILT is 12 or 25.
    13.2. `dive`, `soar`: zoom in or out by the factor `by`, or to `to.zoom`.
    13.3. `step`: move to a new framing at the same R. `whip`: a fast move with up to 40 px of directional smear.
    13.4. `track`: steady travel at `speed` px per frame along `dir`. `crane`: `follow(t)` returns a board point and the screen point to hold it at.
    13.5. `hold`: with `still: true`, no drift until the next key.
    13.0. A key may carry `name` ('FAN', 'QUARTER', 'RUN', 'DIVE'), set by the helpers below, which turns on that move's checks (35.1).
    13.6. `fanTurn({t, fan, joint, frames?, to?, label?})` (phase 2) builds the `tilt` of a FAN seam: `by: -fan` about the Joint (`joint` a word index, meaning its last letter's right flank, or any anchor), default 10 frames, optional `to` to frame the new line. Start it about half its frames before the new line's first sung frame; mid-turn the old last word reads at -fan/2 and the new first word at +fan/2 (DOGE item 56).
    13.7. `quarter({t, by, joint, frames?, to?, label?})` (phase 2; DOGE item 64): QUARTER with smear, a `roll` of `by` (60 to 90 either way) about the Joint (`joint` a word index, its last letter's right flank, or any anchor), default 12 frames. Put it in a hole between landings of at least `quarterClearFrames(by)` frames (18 at 60 degrees to 27 at 90). `SmearStage` blurs it.
    13.8. `runTrack({words: [first, last], lead?, screen?, label?})` (phase 2; DOGE item 63): RUN, a linear `track` that carries the camera along one wide row from `lead` frames before the first word (negative: after it; -6 keeps the first word's 20-frame margin) to the last word's sung frame, landing the last word at `screen` (default 62 percent across, mid height). At most 22 px per frame (`RUN_SPEED`).
    13.9. DIVE (DOGE K9): give any `dive` key `name: 'DIVE'` to check DOGE's limit of 6 percent zoom change per frame. The existing dive helpers do not set it, so their boards validate as before.
14. **Targets.** `to` frames something: `{frame: {word} | {words} | {block} | {blocks} | {anchor} | {point}, cap?, fill?, cover?, screen?, x?, y?, zoom?, rot?}`. `cap` sets the zoom from the framed word's cap height; `fill` fits the target into the framing box (the frame less 120 px a side and 80 px top and bottom); `cover` makes an anchor's box cover the frame; `screen` is where the target lands on screen. `about` is the board point that travels in a straight line on screen during the move.
15. **Drift and easing.** Between keys the rig drifts 0.4 degrees and 1.5 percent of zoom per second toward the next move. Every key is eased; a quarter turn is stretched to at least 8 frames and any change to at least 6. Whole-camera moves are exempt from the speed cap.
16. **Transits** are `roll`, `tilt`, `whip`, `step`, `dive` and `soar`. Start the transit that brings in a line on the frame the line starts (`example/boards.ts` has a `lineStart` helper): its first word is sung during the transit and is read when it ends.
17. **Authoring at a turned rest.** At rest R the screen is the world turned by R, so a block at world angle `a` reads at `a + R`. At R = -90 set blocks at angle 90 to read level. `example/boards.ts` has `S(C, R)`, which maps a screen point to the world point under it for a rest framed at C.

## 4. Anchors

18. An anchor (`AnchorRef`) is a point on the board: a letter part `{word, letter?, part?, offset?}` (parts `flankL`, `flankR`, `top`, `foot`, `stemTop`, `tail`, `terminal`, `centreLine`, `counter`, `counter2`, `centre`), a rule `{rule, s?}` (s from 0 to 1 along it), a board path `{path, s? | tipAt?}`, a block corner `{block, corner?}` or a point `{point, angle?}`. `resolveAnchor(layout, ref, t)` gives the world point, the direction and, for counters and blocks, a box.
19. **Placing a block on an anchor**: `block.anchor = {to, align?, angle?, gap?, offset?}`. `align` is the point of the block that sits on the anchor (`tl`, `tr`, `bl`, `br`, `ml`, `mr`, `tc`, `bc`, `centre`, `baselineL`, `baselineR`); `angle: 'stroke'` takes the anchor's direction. Blocks are placed in order, so an anchor can name any earlier block or word.
20. Counters are measured from the glyph outlines (`tools/measure-outlines.mjs`); stems, tails and terminals are hand estimates in the metrics file. A counter missing from the table is guessed as a central box and the validator warns (`anchor-estimated`).

## 5. Emergence: every block comes out of something

21. `block.emerge = {move, from, at?, params?}` is required on every block (validator error `emerge`), and `from` must resolve (`emerge-anchor`). By default the move ends on the block's first sung frame. There is no default entrance: a block that does not emerge is not shown before its sung frame, and the validator reports it.
22. **The moves** (all in `engine/emergence/`):
    22.1. `seam`: rows slide out from behind a hairline at the anchor, masked there. `side` ('R', 'L', 'U', 'D'), `stagger`, `frames`, `order`.
    22.2. `sprout`: scales up from 0.08 about the anchor, stretched to the speed cap.
    22.3. `nest`: TYPE inside a counter; the block is at most 80 percent of the counter's width; usually a DIVE follows.
    22.4. `door`: the new block is already under the old word, which swings open on an edge or slides off as a lid. `edge`, `style` ('swing', 'lid'), `rule`.
    22.5. `morph`: one word becomes another; kept letters travel to their new places, the others close and open. Build it with `morph({from, keep})` (`keep: 'AGE'` turns PAGE into STAGE). Pair it with `morphMarker()`, a small DIVE that marks the morph as the event of its line.
    22.6. `shove` (mode 'push'): the new words travel along `dir` and push the old block while touching it.
    22.7. `hinge`: mode 'swing' (in the picture plane about the rule's end) or 'leaf' (about the rule's line, like a page). With `params.panel` the block is printed on a panel and the panel's `open` op does the swing (section 6).
    22.8. `fold`: retired words fold shut on a rule while the new block opens from it.
    22.9. `stack`: each word drops into its row of a `stack` block. `stackSteps(words)` gives one rig STEP per row when the stack is taller than the frame.
    22.10. `shelf`: words rise out of a rule, masked below it. `extrude`: the same out of a rule grown from a letter part.
    22.11. `type`: letters fade in 2 frames apart, the last on the sung frame.
    22.12. `swell`: as an emergence, the new word starts over an earlier repeat and grows into place; as a cue, a word grows 2 to 3.5 times and shoves its neighbours.
    22.13. `tip`: `tip({t, word, by, pinned})` tilts the rig 15 degrees and every unpinned retired word slides off down the slope.
    22.14. `portal`: `portal({counter, centre, r1, colour, t0})` fills a counter with a colour and dives through it until it is the ground; the next block waits inside.
    22.15. `drawer` (phase 2; DOGE item 59, K7): the words slide out from behind an edge of a word or prop, clipped at that edge, each slide ending on its own sung frame. Build it with `drawer({host | rect, edge, depth?, lead?})`: `host` a word index (its cap box) or `rect` a world box `{x, y, w, h, angle?}` for a prop; `edge` 'top', 'bottom', 'left' or 'right' of that box; `depth` world px (default each word's extent across the edge plus 4, so it starts hidden); `lead` frames (default 6, at least 4, lengthened to keep the slide within the speed cap). Place the block on the far side of the edge, for example `anchor: {to: {word: host, part: 'foot'}, align: 'tl', gap: 22}`.
    22.16. FAN (phase 2; DOGE item 56) is a placement and a rig turn, not a move of its own: `attach: 'FAN', fan: 18` (12 to 24 either way, positive clockwise) starts the block at the Joint (the end of the previous block's last baseline, one space on, opened by the cap corner the turn swings in) turned by `fan`; pair it with `fanTurn()` (13.6) and any emergence out of the Joint, usually `sprout` from `{word: oldLast, letter: 'last', part: 'flankR'}`. Blocks at a FAN block's angle pass the validator's `angle` warning. FAN seam words fit the existing stances: at fan/2 up to 12 they read level or tilted, as DOGE item 48 asks (within 15 degrees); a fan over 32 would put a read word between stances. Checks: `joint-distance` (error: the FAN block starts more than 213 screen px from the Joint, DOGE's 320 world px) and `fan-angle` (error when the two lines differ on screen by more than 3 degrees from `fan`; warning when at the new first word's sung frame they do not read at -fan/2 and +fan/2 within 4).
    22.17. `behind` (phase 2; DOGE item 60, K6): the new words are already behind an opaque plate carried by the old line's cover words; the plate slides or hinges away. Build it with `behind({cover, exit?, frames?, pad?, colour?, at?})` on the hidden block: `cover` the old words (one block), `exit` 'slide-up' (default), 'slide-left', 'slide-right', 'hinge-down', 'hinge-up'; `frames` 16; `pad` 18 px; `colour` default `PALETTE.shadow`. Lay the hidden block inside the cover's box (anchor it on the cover block) with a lower `z`. A hidden word is drawn from 2 frames before the plate clears it, clipped outside the plate while it crosses. Validator `behind` (error): the plate still overlaps a hidden word on its sung frame; start earlier with `at`, or use DRAWER from the same edge.
    22.18. `morph` with `roll: true` (phase 2; DOGE item 61, K5): the changed letters roll over a horizontal axis instead of closing sideways, the old ones out in the first half of `frames` (default 8) and the new ones in during the second. `morph({from, keep, roll: true, frames?})`.
23. **Relight**: `relight(displayWord, sungWord, opts)` lets a later sung word light a word already on the board instead of setting it again.

## 6. Panels, rules, paths, ground and graphics

24. **Panels** (`board.panels: BoardPanel[]`): coloured grounds in world space that words are printed on (`block.on = id`). Kinds `page`, `cheque`, `certificate`, `receipt`, `slab`, `plank`, `television`, `drawer`, `calendar`, `doorSign`, `book`. Ops over time: `open`, `fold`, `flip`, `tear`, `unroll`, `slide`, `fall`. A panel may not fold or fall until 20 frames after its last printed word is sung (`foldGap`, at least 16). A panel opening on a rule: a rule with `job: 'edge'` along the panel's hinge edge, the panel's `open` op on that edge, and each printed block `emerge: {move: 'hinge', from: {rule}, params: {panel}}` (`example/boards.ts`, L3).
25. **Rules** (`board.rules: RuleDef[]`): hairlines with a job (`seam`, `hinge`, `shelf`, `edge`), grown from `from` at `t0` within the speed cap, moved by `move(t)`. Every rule must end: `until`, an `owner` (it fades when its owners retire), or `persistent: true` (validator `line-life`).
26. **Paths** (`board.paths: BoardPath[]`): a video's own persistent line, such as a line that grows through the whole film. A path is `{id, label?, pointAt(s), tipAt?(t), draw(c)}`; anchors name it (`{path: id, s}`), TypeStage draws it under the words, the validator tracks its tip, and a handoff mark can name it. The first video's Mint Line is one (`fixtures/ipo-proof/mintPath.tsx`).
27. **Ground** (`board.ground: GroundWipe[]`): the ground colour changes only by a travelling edge, a disc or a flame, in screen or board space. The vignette is on unless `vignette: false`.
28. **Graphics** (`board.graphics: DecorGraphic[]`): every graphic has a life (`from`, `until`, an exit of at least 6 frames), a `box(c)` for the validator, a `draw(c, life)`, and optionally an `owner`, `line`, `persistent` or `ground` flag. Build rays with `rays({around, from, until, ...})`. A graphic may not cross the ink of an unretired word (`decor-ink`) or stay more than 20 frames after its owners retire (`line-linger`).

## 7. Verbs on words

29. A verb cue `{name, word, words?, at?, params?, allowEarly?}` on `block.verb` acts on words where the lyric calls for it. Built in (`engine/verbs.tsx`): carry, bite, burn, strike, count, explode, burst and others; `verbNames()` lists them. A verb starts at least 10 frames after its word is sung unless `allowEarly`.
30. **Adding a verb**: `registerVerb(name, def)` in its own module, with `modify(ctx)` returning a `WordMod` (offsets, scale, rotation, opacity, letters, marks), and optionally `overlay`, `affects`, `holds`, `removesAt`, `reserve`, `lead`, `replacesEnter`. The emergence moves are verbs registered the same way.

## 8. Word life

31. A word is hidden until its block emerges, read from its sung frame, and retired at the latest of: 6 frames after its line's last word ends, 20 frames after it is sung, `block.keepUntil`, any hold (morph sources, relit words), and 10 frames after a transit it was sung during. It then dims to 45 percent over 10 frames and stays on the board until it is more than a frame diagonal from the frame centre (culled) or a clearing portal fills the ground. Board exits (`cut`, `fall`, `fade`, `leave`) end everything at `board.end`. `retireFrame`, `cullFrame` and `lifeStage` are exported.
32. Repeats: `block.repeat = {word, index}` grows the keyed word to 1.25 or 1.5 on its second and third appearance, pushing the rows below.

## 9. The validator

33. One command: `node tools/validate-boards.mjs <boards module>`. It checks every frame of every word's reading interval (sung frame to retire frame) and reports per board and per line, with the emergence moves, anchors and rig moves of each line.
34. **Per word** (errors unless noted): `visible` (opacity 0.9 on the sung frame, 0.45 after), `margin` (inside the 48 px safe margin for 20 frames after it is sung, 12 if its cap is 200 px or more), `crop-half` (never less than half its height in frame while its line is sung), `sung-cap` (at least 56 px cap on screen), `stance` (level within 8 degrees, tilted 12 or 25 within 4, a quarter turn of -90 within 5 for at most 3 words a row with a 90 px cap, held 20 frames; +90 only for one word of 6 letters or fewer; never upside down), `overlap`, `transit-read`, `display-late`, `relight`, `min-life` (warning), and motion: speed (the smaller of screen and board-relative speed, 32 px per frame at 1280), `min-visible` (15 frames), `state-rate` (one change per beat), opacity steps of at most one sixth per frame.
35. **Per board** (`engine/validateRules.ts`): `ink-overlap`, `counter-fit`, `arrival-fade`, `arrival-pop`, `anchor-hidden` (an emergence anchor off screen or invisible when its move starts), `empty-frame` (a rig move with no type in frame), `two-scales` (two lines in a row with no rest at the giant level: cap 240 px or more spanning 800 px), `variety` (R unchanged at rest for three lines; after a ROLL no word of the previous block left in frame), `level-run` (two lines resting level with no tilted or sideways retired text in frame), `decor-life`, `decor-ink`, `line-life`, `line-linger`, `panel-fold-early`, `rig-frames`, `rig-turn`, `rig-stretched` (warnings for keys outside the style ranges), `load` (warning: more than 15 bright or 26 visible words). `two-scales` trips easily on short test boards, where no line is meant to be giant; waive it there (35.2) rather than inventing a hero line.
35.1. **Named moves** (phase 2): `quarter-clear` (QUARTER: warning outside 55 to 95 degrees, error in a hole shorter than `quarterClearFrames`), `run-speed` (RUN over 22.5 px per frame), `dive-rate` (DIVE over 6 percent per frame), `joint-distance` and `fan-angle` (22.16), `behind` (22.17).
35.2. **Waivers**: `board.waive: [{rule, why}]` turns that board's errors of `rule` into warnings marked `[waived: why]`. Use it only for a deliberate exception, and say why.
36. **Handoffs.** A handoff is a fixed picture at a boundary between two separately built chunks: `{id, t, bg, elements}`, where an element is a word at a fixed screen box (`{kind: 'word', text, x, baseline, cap, w}`, checked within 3 px) or a mark the validator only lists (`{kind: 'mark', label, path?}`, a warning to check the still; a mark naming a board path errors if the board lacks it). `board.handoff = {start?, end?}` (`'open'` as the end for a test clip). When the song defines handoffs, the first and last boards of a module must declare them. On a handoff frame nothing else may be visible (`handoff-extra`).
36.1. **Chunk carries** (phase 2; DOGE K10, Fable item 48): `board.carry: [{kind, B, side, firstWord?}]` moves a board as one sheet with the neighbouring chunk across boundary frame `B` (absolute song frames). `slideUp`: 520 px up over frames B+2 to B+31 (sine ease). `quarterCW`: 90 degrees clockwise about the frame centre over 27 frames ending 8 before `firstWord`. `side: 'out'` on the outgoing board (its `end` at B+45), `'in'` on the incoming board authored in its final place (its `start` at B). The numbers are DOGE's `lib/handoff.ts`, so chunks on either kit meet exactly. A carry is folded into the board camera (`rigAt`, screen-pinned blocks too; `rigOwnAt` is the camera without it), so the stage, smear and every check see it; `carryAt`, `carrySpan`, `carryCam` are exported. Validator `carry` (errors): the board's own camera must hold across the carry (use `{kind: 'hold', still: true}` at B); slideUp outgoing type must sit above y 520 at B and incoming type below y 648; outgoing type must be out of frame at B+45; the board times must cover the motion. An emergence anchor brought in by an incoming carry is not reported as `anchor-hidden`. quarterCW: on the incoming side `firstWord` must be the board's first sung frame, and the outgoing type must be out of frame by B+45 (so step it to the left or right band first; type near the frame centre stays in frame through a turn about the centre). A carry counts as a transit for `SmearStage`, so a slideUp or quarterCW blurs, and the validator sees the same drawn opacity.
37. **Tracked elements.** `board.track` (TrackedElement: `{id, sample(t), from?, to?, exempt?}`) puts any moving thing a video draws itself under the same motion checks; a boards module may also export `ELEMENTS` for screen-space elements. `board.keepClear(t)` returns world polygons no word may overlap.

## 10. Motion blur

38. `SmearStage` draws a board as `TypeStage` does, plus true motion blur during rig transits: several sub-frame samples of everything the camera moves, averaged, with the words being read drawn once, sharp, at the frame itself. The sample count follows the largest per-frame displacement (`smearSamplesAt`), so a still frame is drawn once.

## 11. Font metrics

39. Layout runs in node (the validator) and in the browser (the render) with the same numbers, from one metrics file per font set: `{source, measured, fonts: {key: {cap, desc, space, fallback, adv, kern?, asc?, inkDesc?}}, anchors?}`. `fonts/anton-dmserif-barlow.metrics.json` covers Anton 400, DM Serif Display italic 400 and Barlow Condensed 700 (keys `anton`, `serif`, `barlow`).
40. **New fonts.** Write a font spec (`fonts/<name>.fonts.json`: `{css, fonts: {key: {family, style, weight}}}`), then: `node tools/measure-fonts.mjs page <spec> <words.json>`; dump the page in headless Chrome outside any sandbox (the command is in the tool's header); `node tools/measure-fonts.mjs apply <spec> <dump> <metrics.json>`; then `node tools/measure-outlines.mjs <metrics.json> key=font.ttf ...` for the counters and ascender and descender ink.

## 12. The example and the parity fixture

41. **`example/`** (composition `KineticTypeExample`, 750 frames, no audio): the first board (0 to 14 s) has five made-up lines. L0 rises out of a floor rule (SHELF). L1: a ROLL of -90 leaves L0 in frame, sideways; THE WHOLE STREET slides out of a SEAM and TURNS sprouts at the giant size. L2: a TILT to the stack; STACK EVERY CRATE lands as a STACK, with rays() round it that end. L3: a TILT back to level; a page opens on its edge rule with SIGN THE PAGE printed on it (PAGE at the giant size). L4: a TILT out to 0.8; SET THE slides out of a seam at SIGN, and STAGE is the MORPH of PAGE. It validates with 0 errors and 0 warnings.
41.1. **Phase 2 boards** (the same composition, now 34 s; boards `fan and drawer`, 14.0 to 22.0 s, and `slide up`, 20.5 to 25.0 s): L5 TURN THE CORNER rises out of a floor rule (CORNER giant). L6 AND FAN OUT: FAN +18 at the Joint, `fanTurn` about CORNER's last letter, the block sprouts out of the Joint. L7 OUT OF THE DRAWER: DRAWER out of the bottom edge of OUT (DRAWER giant). A STEP lifts the type above y 520 and the board slides up (carry out, B = frame 615) while SLIDE UP, already set on its shelf, comes in from below (carry in) and is sung at 21.7 s. On `slide up` (20.5 to 31.8 s), L9 HIDE BEHIND IT: IT is behind a plate on SLIDE UP that slides up (BEHIND). L10 RUN ALONG THE WHOLE ROW: a TILT of +12 to RUN, then a RUN along the wide row (seam out of IT). L11 TURN RIGHT: a QUARTER of -90 about ROW's last letter, TURN RIGHT sprouting from it; a STEP takes it to the left band and the board turns out with a quarterCW carry (B = frame 910). Board `all the way round` (30.3 to 34 s) comes in by that carry with L12 ALL THE WAY ROUND. The example validates with 0 errors; `slide up` waives `two-scales` (three warnings).
42. **`fixtures/ipo-proof/`** (composition `IpoProofV3`, 541 frames, song 29.77 to 47.80 s, no audio): the first video's ProofV3 board at commit f07dd72, unchanged except its imports, its Mint Line (a `BoardPath` from `mintPath.tsx`), its anchors (`{mint: true}` became `{path: 'mint'}`) and the song set-up in `song.ts`. The video-only parts it needs (the Mint Line, the ant, the palette) are fixture-local files. Its validator report is identical, line for line, to the first video's at f07dd72 (0 errors, 2 warnings). Rendering it and comparing with the first video's render of the same commit is the visual check.

## 13. What the first video keeps (left out of the engine)

43. These parts of the first video's kit (`video/src/components/kit/` in the Buy This IPO repo at f07dd72) are not in the engine. A video that wants such a piece supplies it through the hooks named here.
    43.1. The Mint Line (`mintLine.ts`, `graphics/MintLine.tsx` `MintLineView`): hook `board.paths` (a copy lives in `fixtures/ipo-proof/`). `BoardRules` moved into the engine (`TypeStage.tsx`).
    43.2. Handoffs H1 to H6 (`handoffs.ts`) and `graphics/HandoffFrame.tsx`: hook `configureEngine({handoffs})`; a video draws its own handoff picture.
    43.3. The rebus (the IPO word as letter parts): the rebus functions of `script.ts`, `rebusTimes.json`, the rebus geometry in `layout.ts`, `rebusEnter` in `wordState.ts`, `RebusParts` and `Rebus` in `graphics/Characters.tsx`, and `tools/extract-rebus-times.mjs`. Hooks: `wordRules.rule` (text and tier) and letter art functions (`WordOpts.replace`).
    43.4. The Egg (`graphics/Egg.tsx`, and the `egg` and `coin` letter art): hook letter art functions.
    43.5. `ChorusDream.tsx` (the chorus presets) and chorus detection by section name.
    43.6. The IPO graphics: `graphics/Characters.tsx` (AntMark, CharacterToken, Coin, CoinStream, Page), `Dream.tsx`, `HubO.tsx`, `TheLine.tsx`, `BeatStage.tsx` (its `useSongTime` is now `engine/time.ts`), `effects/ripple.ts`. Hooks: `board.graphics`, `board.track`, and the `props/` folder.
    43.7. `script.ts`: the `boardsFromScript` storyboard parser and the IPO tier rules (Baby, the names and number words, chorus and verse sizes, `eggCapRatioAt`). Hook `wordRules`. A generic script parser is phase-2 item 46.
    43.8. `palette.ts` and `fonts.ts`: the palette is config, font loading is the video's.
44. **Removed** (one camera, one word life): the automatic K1 camera (`camera.ts` `cameraFrames`, `boardFrames`, `fitPoints`, `legalZoom`, camera keys and overrides, `board.camera`, `rotateCamera`, `creep`); the v2 word life (default entrances slam, pop, slide, drop, spin, type; line-based dimming `lifeOpacity`; crop culling; the E3 beat pulse; the reading-path Line `board.line`); the v2 validator rules (`cropped`, `turns`, `framing`, `cap-height`, `v2-board`, `transits`); the `decor`, `overlay` and `screen` render props (use `board.graphics`); and the re-exports of the remotion-open-fx easings and `@remotion/noise`. Every board is now what the first video called a v3 board; `rig` is optional and defaults to a drift from `rigStart`.

## 14. Phase 2: moves to port

45. These are listed so that a video does not build its own copy. Built (group 1): FAN with its checks (13.6, 22.16), DRAWER (22.15), QUARTER (13.7), RUN (13.8), the DIVE rate check (13.9), BEHIND (22.17), MORPH roll (22.18), and the slideUp and quarterCW carries with their checks (36.1). Not built from group 1: DOGE's DOOR plate (K4) and the STACK 80 percent fill check.
46. **From the engine comparison** (items 33 to 48 of the Fable engine comparison in the Right Chip Wrong Huang repo):
    46.1. Item 33: no entrance or landing during a fast move (`entranceAdjust`, `camera-rest`, `entrance-in-move`, `follow-move`), reconciled with `transit-read`.
    46.2. Item 34: carry-out and spine rules (`sheetExit`, `residueLife`, a spine at full strength until the next pivot).
    46.3. Item 35: hold creep and the 30-frame `still-camera` check (the rig already drifts).
    46.4. Item 36: fast-move length limits by size of move (`fastLimits`).
    46.5. Item 37: edge entrances as emergence moves (`slideFrom`, `drawer`, `rise`).
    46.6. Item 38: tracked props with keep-clear shapes (`prop-clear`); `board.track` and `keepClear` exist, the prop check does not.
    46.7. Item 39 (optional): verbs `tumble`, `sinkBehind`, `turnBack`, `grow`, `shoveUp`, `slideAlong`.
    46.8. Item 40 (optional): `station()`, a rig key from a pin, rotation and zoom.
    46.9. Item 41 (optional): push seam for grounds (`seamPush`).
    46.10. Item 42 (optional): `station-size` and `row-width` checks.
    46.11. Item 43: the prop library, into `props/`.
    46.12. Item 44: the display guard (banned spellings per song).
    46.13. Item 45: size checks `small-type` (the engine's `sung-cap` is the 56 px floor), `framing`, `prop-size`, the timeline `empty` warning.
    46.14. Item 46 (optional, recommended before the skill): script lines with attach codes as a front end that produces blocks with anchors.
    46.15. Item 47 (optional): `camera.follow` as a rig helper; the rig's `crane` key is unproven.
    46.16. Item 48 (optional): chunk handoff functions, see 47.10.
47. **The DOGEfather move list** (its Storyboard v2, sections 2.2 to 2.5 and part 3), with what the engine already has:
    47.1. FAN (the new line starts at the Joint, rotated 12 to 24 degrees; the camera turns through the seam): built, `attach: 'FAN'` and `fanTurn()` (22.16). `joint-distance` and `fan-angle` are checked.
    47.2. STACK (a new row under the last, the camera steps down one row): the engine's `stack` emergence and `stackSteps` cover the layout and the steps; the DOGE rule that row type is 80 percent of safe width is not checked.
    47.3. DRAWER (the line slides out from behind an edge of a word or prop, clipped there): built, the `drawer` emergence (22.15).
    47.4. RUN (one row wider than the frame, the camera travels along it): built, `runTrack()` (13.8) with `run-speed`; the "each word lands ahead of the camera" check is left to the per-word margin rule.
    47.5. QUARTER with smear (the camera turns 60 to 90 degrees about the Joint): a `roll` with `about` at the Joint; built, `quarter()` (13.7); `SmearStage` gives the blur; `quarter-clear` checks the 18 to 27 clear frames.
    47.6. DOOR (the finished line as one plate swings 90 degrees about a corner to a vertical spine, scaling to 0.5): not the engine's `door` (which opens an old word to show a new block under it); the plate move is DOGE's K4 `plate` verb and is not built.
    47.7. BEHIND (a plate of the old line hinges or slides away and the new words are already there): close to `door` (style 'lid') and to panels with `fold` or `slide`; built, `behind()` (22.17).
    47.8. MORPH (shared letters hold still, changed letters roll over a horizontal axis in 8 frames): the engine's `morph` moves kept letters and closes and opens the others; built, `roll: true` (22.18).
    47.9. DIVE (a scale move through a letter's ink or counter into the next arrangement, at most 6 percent per frame): the rig's `dive` with `cover`, `rigDiveInto`, and `portal`; the 6 percent limit is checked on keys named 'DIVE' (13.9).
    47.10. The `slideUp` and `quarterCW` handoffs (both chunks move as one sheet across a boundary): built as chunk carries (36.1); both are checked; the incoming quarterCW board is authored in its final place, and stance is not checked during the carry itself (the per-word stance rule applies from the sung frame).

## 15. Known gaps

48. The letter anatomy other than counters (stems, tails, terminals) is hand-estimated.
49. `crane` and `track` keys and several verbs were never exercised by a validated board in the first video.
50. Props: see `props/README.md`.
