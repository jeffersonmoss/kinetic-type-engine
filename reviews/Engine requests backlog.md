# Engine requests backlog

Requests from videos built on this engine, worked in the next engine pass.

## From the DOGEfather video, 16 November 2026

1. Camera snap at an outgoing slideUp: the B_OUT still hold (KIT 36.1) jumps the camera out of its rest drift in one frame (DOGE D3, frames 7079 to 7080: zoom 1.026 to 1.000, rotation -113.3 to -114.0, type moves about 25 px). The validator does not flag it. Ease the drift to the held pose over the last 10 to 15 frames, and add a validator check for one-frame camera jumps.
2. Browser prop: a chat bubble cannot be switched off on cue (`ghosted` only greys it); the button is about 14 px with no pressed state. DOGE drew a BLOCK key and bubble-out overlays locally in `~/Experiments/DOGEfather Music Video/film/src/drawings/D3/props.tsx`; fold them in.
3. Figure prop: `POSES.lie` is a flat bar that Fable rejected as not reading as a person. Replace it with the body-on-its-side `lie(...)` from `film/src/drawings/D2/roadFigure.tsx`.

## From the IPO video, 16 November 2026

4. Ink boxes that exclude padding spaces; crumbs that respect the bite clip; a sprout option that finishes by the sung frame; stroke widths that do not scale with zoom; a caption typed-reveal option.
5. SVG `<text textLength>` collapses padded spaces (IPO 54da5fd, the G blob): draw padded hub words per letter, or strip padding before textLength.
6. Mirror IPO 4a7603c (handoff carry by word index, angled handoff words, `appearedAt` in motionCheck) and a clean letter close without letter-spaced slivers (IPO ChunkF `cleanCloseF`).

## From the DOGEfather video, 16 November 2026 (later)

7. Smear draw order: during a camera smear, verb overlays and 'under'/'over' graphics are drawn only in the blur pass, and the sharp pass then redraws every sung, unretired word on top. An 'over' prop drops behind the words for the smear and pops back in front after it (DOGE B2, frames 1,564 to 1,575: the chainsaw blinked behind GOVERNMENT for 12 frames during a FAN; Fable failed it). Keep 'over' graphics and verb overlays above words in the sharp pass too. DOGE's workaround (screen graphic via `cameraTransform`, `film/src/drawings/B2/props.tsx`, `G.sawOnScreen`) loses motion blur. Check whether the IPO kit has the same order.
8. `framing` in validateMotion.ts cannot be waived: a `framing` entry in `board.waive` is recorded but not applied. DOGE's hook boards follow a Fable ruling (left writing column x 64 to about 718, prop in the right 40 percent), so "first row fills 60 percent of safe width" is impossible and each hook board carries 8 warnings. Make framing waivable, or let a board declare a column layout. Board: `~/Experiments/DOGEfather Music Video/film/src/drawings/hooks/hookBoard.ts`.
9. The `carry` rule checks outgoing type but not outgoing graphics: props carried up past y 520 into the next chunk passed the validator at three DOGE seams and were caught only by Fable from stills. Extend `carry` to graphics.
10. New rule, "readable before sung": flag any word readable more than 3 frames before its sung frame (would have caught Jefferson's ELON note on DOGEfather and his IPO-too-early note on Buy This IPO). DOGE's per-chunk `sync-audit.mjs` (e.g. `~/Experiments/DOGEfather Music Video/film/src/drawings/hooks/sync-audit.mjs`) prints sung vs first-readable frame per word and is a starting point.

## From Buy This IPO, fix rounds 3 and 4 (16 November 2026), to mirror from ~/Experiments/Buy This IPO Music Video

11. HubO is now one fixed poker chip (Ink body, Paper keyline, 8 wedge inserts, dashed ring, upright spade; `rot` to counter the rig, `exit` slide-up; colour, counter states and bulbs retired). IPO kit commit 34d66d0.
12. `letterTimes(word, [t...])` verb: each letter hidden until its own sung time, 4-frame pop from 0.85 scale (9ddf0dc).
13. Figure `kneel` pose (ebfceab). Captions may carry a ruled `minCap` (ebfceab).
