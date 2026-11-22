# Engine rule changes: rough cut 2 notes, 22 November 2026

Written by Claude (Opus 5.5), the engine builder, for review by Fable, Neon and Astra before the next render. This file is meant to be read on its own. All code lives in the worktree "Deterministic engine - h1 - word transitions 22 November", branch `word-transitions`.

## How to read this

- "Before" numbers come from the rough cut 2 scene, the commit before this pass. "After" numbers come from the rebuilt scene in this pass. Both are measured with the same new whole-song checks (`whole_song_checks.mjs`), using the corrected word times and the sung-repeat list described below.
- "Sung events" means every word in the song map (with the corrections in change 2), plus the chant repeats and ad-libs the map lacks (`videos/Room for One - sung repeats.json`).
- Every time in that repeats file is an estimate. Whisper (large-v3-turbo) on this mix confirmed how many repeats there are, but its word timestamps were unusable. Nobody has checked these times by ear. They are the weakest input in this pass.

## Change 1. Animated entrances by default; pops rationed

**Old rule.**
- In `plan_joints.mjs`, `ANCHOR_WEIGHTS` gave pop a weight of 20 (the highest, with shove and slide-out at 18).
- `RIDER_WEIGHTS = { pop: 50, tick: 50 }`, and riders could use only tick or pop: `if (prim !== 'tick' && G.role === 'rider') return null`.
- Variety rule V1 forbids the same primitive twice in a row, so riders alternated tick and pop.
- In the forced-repeat branch (spec 34), a pop was chosen first whenever the previous joint was not a pop.
- rail needed a host (`NEEDS_HOST`).
- tick and rail were rejected when their host was under 60% in frame.
- There was no host-free animated entrance.

**Observed problem.** Rough cut 2: 164 of 316 entrances (52%) were pops. Per section, 30% to 67%, with section 6 at 35 of 52. Jefferson: pops "have become a crutch".

**Diagnosis.** Three causes:
1. The weights.
2. The rider rule (half of all riders popped).
3. After the weights, the main cause: every animated primitive except tick needed an adjacent host in frame.

When the first change still left 45% pops, the rejection log of the popped words in section 6 showed which constraints blocked them:

| Rejection | Count |
|---|---|
| "no adjacent host" | 9 |
| "host under 60% in frame at f0" | 11 to 12 per primitive |
| After adding zoom: "timing (earliest, L)" | 9 |
| After adding zoom: item 15 "attack settles ... under 15 readable frames" | 49 across the song |

The item 15 rejections were short-gap words, which spec 35.4 forces into attack mode.

**New rule** (all in `plan_joints.mjs` unless noted):
1. A new primitive, `zoom`: uniform scale 0.10 to 1 about the word's own centre, with no host.
   1.1. Defined in `primitives.mjs` CATALOGUE (family `zoom`, k 0.25, min 4, max 6 frames, land or attack) and built by `buildZoom`.
   1.2. Weights: anchor 10, rider 15.
2. Riders may use tick, sprout, extrude, slide-out, dock, rail and zoom (`RIDER_PRIMS`). Rider weights: tick 50, sprout 20, extrude 20, slide-out 15, zoom 15, dock 12, rail 12. Pop stays at 50 but is gated by item 3.
3. Pop is drawn only as an accent. In `planJoints`, `accentOk` is true when no pop has been used on this line yet and the pop count so far is under `POP_ACCENT_SHARE` = 0.12 of the entrances so far. In that case pop's weight is `POP_ACCENT_WEIGHT` = 4; otherwise pop is removed from the pool.
4. Forced-repeat branch: the least recently used animated primitive is repeated (logged as a forced repeat) before falling back to a pop. A pop comes only when no animated primitive is eligible, and a pop right after a pop is logged as a forced repeat.
5. rail no longer needs a host (`HOST_OPTIONAL` = tick, rail). When the host is under 60% in frame, tick and rail drop the host and enter from off frame along the plaque.
6. Zoom timing in `tryPrim`:
   6.1. It skips the waits on the previous anchor's settle (+8, +15 frames). Its earliest start is the previous word's onset (`ctx.prevSung.L`).
   6.2. Under a short gap (spec 35.4, under 8 frames), zoom may land as well as attack.
7. Check change in `checks.mjs` (13.1.16 clean motion): the "entrances overlap" rule (spec 14) exempts pairs where either joint is a zoom. The in-frame ink-box overlap test still applies.
8. Pops are logged per word with a reason (`first word`, `pinned`, `no animated entrance fits`, `accent`) in `log.pops`.

**Risks.**
1. Zoom is now the most common anchor entrance in several sections (8 to 15 per section). That is a new kind of sameness: the variety rules stop back-to-back repeats, but not frequency.
2. A zoom takes 4 to 6 frames, so it costs that many still reading frames. Protected-reading failures (13.1.13) rose in some sections.
3. Overlapping zooms in time are allowed. Two words growing at once may read as busy, though the ink-box test stops them colliding.
4. A landing zoom starts growing before its own onset, by at most the gap since the previous onset.
5. An accent pop is possible but rare in practice: every remaining pop is "first word" or "no animated entrance fits".
6. The 15% target is met only after the section 1 opening (build 144, 9 of 30 pops) is counted. That section was not rebuilt (ruling 15).

**Numbers:**

| Measure | Before | After |
|---|---|---|
| Whole song pops | 164 of 316 (52%) | 44 of 304 (14.5%) |
| Sections 2 to 9 | 0.35 to 0.67 per section | each 0.08 to 0.14, max 14.3% |
| Opening | 9 of 30 | unchanged, 9 of 30 |

The entrance count fell from 316 to 304 because sections re-plan their shots. Echo words (change 3) are not counted as entrances.

Remaining pops by reason:

| Section | First word | No animated entrance fits |
|---|---|---|
| 2 | 1 | 3 |
| 3 | 1 | 4 |
| 4 | 1 | 4 |
| 5 | 1 | 1 |
| 6 | 1 | 6 |
| 7 | 1 | 7 |
| 8 | 1 | 2 |
| 9 | 1 | 0 |

## Change 2. Sync: the count sung over "count of three", and pivots that landed late

**Old rule.**
1. Word times came straight from the song map:

   | Word (map index) | Map time |
   |---|---|
   | "of" (280) | 116.68 s |
   | "three!" (281) | 117.84 s |
   | "(One! Two! Three!)" (282 to 284) | 118.50, 118.82, 119.12 s |

   The 21 November whisper ear check had already flagged these times as doubtful (its item 2) but left them pending.
2. `planPivot`: `const f1 = first.landingFrame`. The pivot ended on the landing group's anchor onset, and it carried every group word with an onset up to f1 + 4.
3. `checks.mjs` 13.1.9 expected every landing at its anchor's onset minus 1.

**Observed problem.**
1. Rough cut 2, about 1:55 to 2:00: OF stayed on screen while the count was being sung. The count appeared only after it was sung.
2. Measured with the new check, against the corrected times:

   | Word | Frames late |
   |---|---|
   | OF | 10 |
   | THREE! (line 32) | 30 |
   | THREE! (line 33) | 38 |
   | NOW, 48.0 s | 5 |
   | WANTS | 3 |
   | THREE (section 7) | 3 |
   | WATCH, 106.2 s | 4 |

**Diagnosis.** Two flaws:
1. The data. The count is sung over the end of "count of three": whisper heard it at 116.70, 117.24 and 117.84 s, and Jefferson heard it on screen. The engine followed the wrong map faithfully.
2. The engine. In a pivot (camera turn) boundary, a word sung before the anchor (HE'LL at 97.6 s, WATCH at 106.2 s) stayed on the far side of the turn until after it was sung. The turn was timed to end on the anchor, not on the first word it carries.

The seam at 3592, section offsets and the severity fallback were checked, and none was the cause.

**New rule.**
1. Timing corrections, applied before sections are cut, in `videos/Room for One - section words.mjs` `correctedMap()` from `videos/Room for One - timing corrections.json`. The new times:

   | Word or line | Time |
   |---|---|
   | of | 116.30 s (estimate) |
   | three! | 116.50 s (estimate) |
   | One! | 116.70 s |
   | Two! | 117.24 s |
   | Three! | 117.84 s |
   | Line 32 ends | 116.70 s |
   | Line 33 starts | 116.70 s |

   Each correction is checked against the map's word text and fails loudly if the map changes.
2. `planPivot`: f1 = min(anchor landing frame, earliest onset minus 1 of the group words), and the landing frame moves with it.
3. 13.1.9: a landing passes when it is within 1 frame of min(anchor onset − 1, the group's first onset − 1). This also covers cut (travel) landings, which arrive on the group's first word.
4. New whole-song check, `whole_song_checks.mjs` `checkSync`, run on the joined, post-passed scene:
   4.1. Every sung event must be placed (a copy enters between 3 s before and 0.3 s after its onset), pulsed or echoed.
   4.2. A placed word fails when it first shows more than 2 frames after its onset.

**Risks.**
1. The two moved times for "of" and "three!" are guesses. If the lead actually sings "of three" over the count, the new order is wrong in a different way.
2. Pivots now finish earlier, so the camera holds longer on a group before its anchor is sung, and the earlier shot loses up to the group's span in reading time.
3. Loosening 13.1.9 could hide a genuinely early landing whose group happens to start early.
4. `checkSync` matches by text within a 3 s window. Repeated words close together, like "THE KING! THE KING!", could be matched to the wrong copy, so a lateness could be missed or misattributed.

**Numbers** (whole-song sync check):

| Measure | Before | After |
|---|---|---|
| Late words | 7 | 0 |
| Unshown sung words | 38 | 0 |

The 38 unshown words were the chant repeats and ad-libs (see change 3).

13.1.9 failures per section after rebuild: see "Section results" at the end.

## Change 3. Sung words that never appear, long holds, and the echo treatment

**Old rule.**
1. Only lyric-map words are planned. The chant pulse existed only for hook 1, hand-timed in `apply_jefferson_notes.mjs` (CHANT, 21.06 / 21.38 / 21.69 s).
2. There was no rule about holds while words are sung, and no treatment for ad-libs. The song map has no entries for the hook 2 chant repeats (70.9 to 83.4 s), the hook 3 repeats, or the ad-libs after hook 3 (141 to 150 s).

**Observed problem.**
1. Rough cut 2, about 1:22: ONE MORE RING was re-sung while the words sat still.
2. About 2:18: the engine held RING while other words (ONE MORE, and PHILLY over and over) were sung and never shown.
3. The new hold check found two holds while singing:

   | Frames | Length | Sung onsets inside |
   |---|---|---|
   | 2126 to 2494 | 12.3 s | 19 |
   | 4140 to 4638 | 16.6 s | 19 |

**Diagnosis.** The engine never saw these words. The song map stretches "ring!" from 70.9 to 83.4 s and has nothing between 141.55 and 154.87 s. No rule merged or dropped them; they were missing from the input. Whisper confirmed the extra singing:
1. Five "one more ring" in 70.3 to 77.3 s.
2. Two more near 80 to 82 s.
3. Four in 135.8 to 142.8 s.
4. "Feel it" (Jefferson hears PHILLY) at about 141 to 144.5 s.
5. Two "one more ring" at about 147 and 149.5 s.

**New rule.**
1. Data: `videos/Room for One - sung repeats.json` lists 36 sung events the map lacks. Chants are placed on a beat grid: every 2 beats (95.7 BPM) from the lyric "(One", with ONE/MORE/RING offsets of 0, 0.32 and 0.63 s taken from hook 1's drum hits. Ad-libs are snapped to beats.
2. Engine: `sung_pulses.mjs` `addSungPulses(scene, events)` runs in `apply_jefferson_notes.mjs` (third argument) over every section. For each sung event in time order:
   2.1. **Placed:** an unused copy with the same normalised text entered between 3 s before and 0.3 s after the onset. Nothing more is done.
   2.2. **Pulsed:** otherwise, if a copy is visible (on screen, centre within 0.95 of the frame, entered more than 1 frame earlier, not leaving within 2 frames), the newest such copy gets a pulse at onset − 1 frame. Exceptions: no pulse within 0.2 s of an existing one, and none before its motion ends + 2 frames (spec 33).
   2.3. **Echoed:** otherwise, the event gets an echo word (change 4).
3. Whole-song hold check, `whole_song_checks.mjs` `checkHolds`:
   3.1. Activity is a word entering, a motion segment, a pulse (9 frames), or a camera key whose start and end poses differ.
   3.2. A gap in activity longer than 2.0 s that contains a sung onset fails.
   3.3. Measured up to the reveal.

**Risks.**
1. Every repeat time is an estimate. If the beat grid is off by half a beat, the pulses land off the singing, which is worse than none.
2. Hook 3's ONE and MORE were off screen, so they became echoes rather than pulses: 13 echoes in hook 3 and after it.
3. A pulse on a word that is moving is skipped, so a fast camera can still leave a sung word without visible activity. The hold check would catch a gap over 2 s, but not a shorter one.

**Numbers:**

| Measure | Before | After |
|---|---|---|
| Pulses added | 0 (hook 1's 3 hand-timed only) | 23 |
| Echo words | 0 | 13 |
| Holds over 2 s while singing | 2 (longest 16.6 s) | 0 |

## Change 4. Echo words (ad-libs over a held word)

**Old rule.** New, nothing superseded.

**Observed problem.** Rough cut 2, about 2:18: PHILLY sung repeatedly while RING was held; nothing moved.

**New rule.** `sung_pulses.mjs` `addEcho`, chosen by the planner for any sung event with no copy on screen; no word is named in the code.
1. The held word is the newest sung word fully in frame.
2. The echo is a new word with `echo: true`, a copy of the held word's font and size, plain white style, text from the event's display text. It pops on at the onset (`stamp: true`, the strong pop).
3. After 3 frames it grows from 1 to 1.8 and fades from 1 to 0 over 24 frames, then switches off.
4. Placement:
   4.1. First, beside the held word on its plaque (above, below, right, left, then diagonals, one gap away), in frame within 0.95, with its grown box clear of every visible word and live echo.
   4.2. If the held word fills the shot, the echo floats 0.3 word heights in front of it at a free screen spot (left top, right bottom, and so on), 22% of the frame height, and may cover the held word only.
5. Echoes never join the reveal and are not counted as entrances.

**Risks.**
1. An echo floating over the held word partly hides it while it fades.
2. Opacity is stepped per frame (viewer keys), which may band slightly.
3. Font size is scaled through `fontPx`; a texture-size limit in the viewer could make large echoes soft.
4. Nobody has watched an echo yet.

**Numbers:** 13 echoes:
- ONE and MORE for the three hook 3 repeats (138.3 to 141.1 s) and for the two later chants (147.0 and 149.5 s)
- PHILLY! ×3 (141.3, 142.6, 144.5 s)

The RING of each repeat pulses the held RING! instead.

## Change 5. Reveal: one connected shape

**Old rule.**
1. In `assemble_sections.mjs` `buildReveal` (42.2 fallback), the reveal used the longest tail of the true layout (newest backwards) whose slabs did not meet, with conflicts tested only between sections.
2. That tail was then shortened until the last frame covered the `--reveal-coverage` share.
3. In rough cut 2, 51 of 83 plaques were shown.

**Observed problem.** The pull-back showed about three clusters with large empty gaps, so they looked unconnected. The gaps came from travel joints (the camera cuts or travels to a distant plaque) and section seams.

**Diagnosis.** The true trail is a chain of short runs separated by jumps of 650 to 2,200 units (plaques are about 1,000 wide). The reveal showed the true layout.

**New rule.** `compactLayout(plaques)`, used by `buildReveal` when `compact` (the default):
1. **Chains.** The trail, in on-order, is cut wherever two consecutive plaques' boxes are more than `CHAIN_BREAK` = 0.5 plaque sizes apart.
2. **Placement.** The newest chain stays put, so the shot before the reveal continues unchanged. Each earlier chain, newest first, moves rigidly so its newest plaque sits beside the next chain's oldest plaque, 0.3 plaque heights apart.
3. **Order of tries.**
   3.1. No turn.
   3.2. Then +90 and −90 degrees about the neighbour's N, R and U axes.
   3.3. Each on the neighbour's side (±R, ±U) nearest the chain's true direction.
4. **Acceptance.** The first placement in which no moved plaque, padded by 0.1 of its size, meets a placed plaque is taken. A chain with no fit is dropped and logged.
5. **Copies.** The reveal shows moved copies (`reveal_copy_of`, id + "r", on never, reveal_on at f0). The originals switch off at f0. Copies drop entrance motion, clips and pulses, and take their original's style in the notes pass.
6. **Camera.** It fits all copies (86% fill), choosing the face-on or a three-quarter diagonal view with the most coverage. Every plaque is shown; coverage is only reported.

**Risks.**
1. Whether this reads as one shape depends on the camera view. A flat bend (a 90 degree turn about R or U) can put a chain edge-on to the camera.
2. Copies at the same place as the originals (the newest chain) switch over on one frame. They should be identical, but any style difference would flash.
3. `checkReveal`'s 20% coverage floor fails (9.6%). The render command keeps `--reveal-coverage 0.05`, as instructed, and with compaction that flag no longer shortens anything.
4. With `CHAIN_BREAK` at 0.5, chains also break at moderately spaced joints inside a section, which straightens some true shapes.

**Numbers:**

| Measure | Before | After |
|---|---|---|
| Plaques revealed | 51 of 83 | 82 of 82 (this rebuild has 82 plaques) |
| Gaps between runs in the true layout | 1,086, 796, 902, 1,490, 1,181, 2,212, 1,657, 1,640, 651 units (all shown as is) | 1,086, 1,042, 679, 1,017, 1,046, 560, 1,270, 1,645, 1,607, 890, 1,513, 656 units in this rebuild's true layout, all closed |
| Largest gap between consecutive plaques | 2,212 units | 522 units, 0 chains dropped |
| Last-frame coverage | 5.7% | 9.6% (still under the 20% check) |

In the after layout, 13 chains were placed; none needed a 90 degree bend.

## Section results (this rebuild, 200 candidates each)

Severity fallback still chooses most sections: no candidate passes every check in sections 2 to 7. Severity uses the ruling's weights (10/5/3/2/1). Rough cut 2 had 13.1.9 sync failures in sections 3 (1), 4 (1) and 6 (2); there are none now.

| Section | Passing of 200 | Chosen | Severity | Hard failures left |
|---|---|---|---|---|
| 2 Verse one, Father Time | 0 | #184 | 7 | 13.1.6 ×1, 13.1.13 ×4 |
| 3 Verse one, Maxey | 0 | #171 | 15 | 13.1.6 ×2, 13.1.13 ×4, 13.1.16 ×1 |
| 4 Verse one, Jaylen Brown | 0 | #16 | 25 | 13.1.1 ×1, 13.1.6 ×1, 13.1.7 ×1, 13.1.13 ×6, 13.1.16 ×1 |
| 5 Hook two | 0 | #139 | 8 | 13.1.6 ×1, 13.1.16 ×1 |
| 6 Verse two, Embiid to KCP | 0 | #56 | 24 | 13.1.6 ×1, 13.1.7 ×6, 13.1.10 ×2, 13.1.13 ×13 |
| 7 Verse two, Simons to the count | 0 | #54 | 19 | 13.1.3 ×4, 13.1.7 ×1, 13.1.13 ×10 |
| 8 Hook three | 1 | #94 | 0 | none |
| 9 Outro | 61 | #158 | 0 | none |

The two sections that passed in rough cut 2 (hook two with 14 passing, hook three with 16) now pass rarely or not at all. The chief cost of the new entrances is protected reading (13.1.13): a zoom spends 4 to 6 frames moving that a pop spent readable. This is the main thing for reviewers to weigh against the pop budget.

## Element check (unchanged)

The 76ers ring is readable for 10 frames, where 15 are needed. It pops on at 649, and the cut at 659 is set by the music.

# Second pass: engine rule review amendments and rough cut 4 notes (22 November 2026)

Sources: the merged amendments in "reviews/Engine rule review - 22 November 2026/Merged amendments - Fable rules disagreements.md" (items 1 to 16), and Jefferson's notes on rough cut 4 relayed by the supervising session. Wording rule for this section (Jefferson's calibration): only his own absolutes are written as absolutes, in his words. Everything else is a strong default: the checks fail loudly and every exception is reported, but judgment may override one where a rigid rule would make the video worse, and the report says so.

Jefferson's absolute, in his words (condensed by the supervisor): "When a word is revealed, it should be revealed fully. Either don't pop it on until you have room for it, or pop it on fully and then move off of it, but don't pop it on halfway. It should never appear but not be fully visible." Also: "Even if words are too fast to read, that's better than them just not being shown or even worse being partially shown." He narrowed it the same evening: it applies to the focused word (being revealed and sung now); words that have had their moment may be cropped at the edges; and a word may be dropped when the screen is busy.

## Change 6. The focused word is shown whole (new hard gate)

**Old rule (superseded).**
1. Ruling A5 in `checks.mjs` (13.1.6 scan): "`const seen = !!(proj && proj.inFrameShare >= 0.25 - 1e-6); // ruling A5: slivers under 25% are not sightings`". A word a quarter in frame counted as seen.
2. Ruling B20 in `build_best.mjs` `severity`: 13.1.6 no-flash failures were a weight ("3 x flashes") in the severity sum, so a section on the severity fallback could ship a word that was never shown whole.
3. Camera framing (`camera.mjs` `makePosterLanding`): a landing frames its own cluster. A rider of the next cluster sung before that cluster's landing is framed by nobody.

**Observed problem.**
1. Rough cut 4, about 34 s: HITCH (w3006, rider of the STRIDE cluster, sung before STRIDE's landing) showed only its H for its whole life (frames 1026 to 1183). The zoom landing framed LITTLE alone at distance 451. 13.1.6 flagged it, but section 3 shipped on the severity fallback.
2. Rough cut 4, about 39 s: THAT'S and THE were sung while the camera still framed ZERO / BACK?, and sat cut off along the bottom edge until LAST landed, with an empty band between the rows.

**Diagnosis.** Nothing in the engine required a sung word to be whole when it appears. The camera serves anchors; riders sung before their anchor's landing fall between two framings, and the only test of them was a sighting count that a 25% sliver satisfied and the fallback could outweigh.

**New rule.** `shown_gate.mjs` (new, generic).
1. Gate (Jefferson's absolute): from the frame a sung word comes to rest (`appearanceFrame`: its switch-on frame, or the end of its entrance, or a pivot's landing for carried words) through its sung onset, and for at least 6 frames, every corner is in front of the camera and inside the frame, the word faces the camera, it is switched on and not faded, and its ink can be drawn (Change 8). Before it comes to rest it may sweep in (a rail, or a camera move carrying it); it may not sit still partly in frame.
2. A word wholly out of frame is not a gate failure: it is a dropped word, allowed when the screen is busy (Jefferson's correction), and every dropped word is logged with its reason.
3. Repair, run on every candidate in `build_best.mjs` before the checks, and again on the joined whole-song scene (section 1 and the seams were never repaired), never on the reveal: for each failing word in onset order,
   3.1. a word with no entrance motion switches on later, when the frame has room, by its onset at the latest;
   3.2. if the next camera move frames it, that move starts earlier so it lands when the word appears, by at most 15 frames (the 0.5 s pickup cap), keeping 8 still frames on the outgoing hold;
   3.3. if it appears whole but the camera leaves too soon, the next move starts later (shorter, never under 4 frames) or a cut is held back a few frames;
   3.4. otherwise the hold it appears in is reframed to fit every word that appears or is sung in it, riders included, as tightly as the 0.94 x 0.90 reading margins allow. This is the tight composition rule applied to the group: the empty band between rows goes when the frame fits the group rather than the old framing.
   A repair is kept only when it lowers the cost (a partly shown word 1000, a dropped word 1).
4. In `build_best.mjs`, a candidate with a partly shown focused word fails check `13.1.0_every_sung_word_shown_whole`. The fallback ranks candidates with fewer of them first, before reading loss and severity (Change 16), so no severity sum can trade one away. If every candidate of a section still has one, the build reports it as a failure.

**Risks.**
1. Reframing widens some holds, so anchors get smaller (13.1.1 and the 65 px floor may fail more often). His rule puts a whole word above a big one.
2. Starting a move earlier takes up to 15 frames from the outgoing word's reading time (13.1.13 counts it).
3. Repairs change `scene.cams` after `camera.mjs` planned them; the camera plan's own log does not show them. They are listed in each build log (`shownRepair.log`) and in the provenance.
4. A word that is dropped is gone for good; the idle gate (Change 9) is what stops whole stretches going missing.

**Before and after.** Whole-song sweep of the committed rough cut 4 scene (96a6185): 48 focused words partly shown, HITCH, THAT'S and THE among them. After this pass: each section build repaired its own words before its checks (sections 2 to 9: 3, 7, 4, 3, 6, 12, 1 and 2 partly shown before repair, 0 after, 46 repairs); the joined-scene sweep found 3 more in section 1 and at the seams and repaired them (8 repairs, mostly switching a word on a few frames later); the final scene has 0 partly shown focused words. 2 words are dropped (wholly out of frame around their onset): FROM (w2018, frame 817), and THREE! (w7064, frame 3495), which is whole on 3 frames and then cut away from, not partly shown. Wholly out of frame on the committed scene: 35.

## Change 7. Echoes render, read and drop under busyness (amendments 1, 2, 3)

**Old rule (superseded).** `sung_pulses.mjs` `makeEcho`: "`C, w, h, fontPx: A.fontPx ? A.fontPx * h / A.h : A.fontPx, on: f, off: f1, stamp: true`" with `ECHO_HOLD = 3, ECHO_FRAMES = 24, ECHO_GROW = 1.8`; floating echoes sized "`const hh = depth * v * ECHO_SCREEN_H`"; width "`A.w * Math.max(0.5, text.length / Math.max(1, A.text.length))`". Echoes were "not counted as entrances", and any sung event with no copy on screen got one.

**Observed problem.** Rough cut 4, 141 to 150 s: RING! held alone for about 10 s while PHILLY and "one more ring" were sung; none of the 13 echoes drew a letter.

**Diagnosis.**
1. `cap` was not scaled, so the viewer drew the glyphs at the held word's size (cap 222.7) in a 56.4-unit box: blank (Neon, verified).
2. `depth * v` is half the frame height, so a "22%" echo was 11%.
3. The 3-frame stamp shrink then a grow stuttered, and the echo started fading after 3 frames, under the 15 readable frames.
4. Echoes for ONE and MORE were placed one by one around the held word, so the phrase read out of order.

**New rule.** `sung_pulses.mjs`.
1. Geometry: box, cap, font size and padding scale together; width from the font metrics (`shown_gate.mjs` `textWidth`); a floating echo is 22% of the full frame height (`2 * depth * tan(vfov / 2)`).
2. Timing (default): pops strongly into place on the first token's onset, holds 12 frames at full size, then grows to 1.3x while it fades over 12 frames; it ends before the next camera move; with under 8 frames of room it is dropped.
3. Scope: lyric-map words never get echoes or pulses for their own events (Change 10). Repeat and ad-lib events are grouped into phrases (under 0.5 s apart). Each token pulses a matching word that is fully shown, unoccluded, still and at least 8% of the frame high; the tokens with no such word become one echo carrying them in reading order, placed left of or above the held word first so the phrase reads into it.
4. When no spot is free (screen busy) or the camera leaves too soon, the repeat is dropped and logged. Repeats and ad-libs are dropped before lyric-map words (Jefferson's correction): they are added last, into the space the lyric words leave.
5. Echoes count as pops in the entrance share (`entrance_counts.mjs`).

**Risks.** Nobody has watched an echo with ink yet. An echo beside a held word can still crowd a busy frame; the placement test keeps it clear of every visible word at its grown size, which is also what drops some of them.

**Before and after.** Echoes: 13 blank (ink check fails all 13, nothing else) before; 8, all drawable (ink check passes) and whole in frame on all 24 of their frames: ONE MORE at 138.28, 139.53, 140.79, 146.98 and 149.51 s; PHILLY! at 141.29, 142.57 and 144.45 s. The RING of each repeat pulses the held RING!. No repeat or ad-lib was dropped. A first run of this pass dropped all of them as "screen busy", because the floating echo counted the held word it is allowed to cover; fixed after.

## Change 8. Checks read visible ink, not on and off frames (supervisor's item 4)

**Old rule (superseded).** `whole_song_checks.mjs` `checkSync`: "`if (echoAt.some(e => e.k === k && Math.abs(e.f - f) <= 3)) continue;`" and `checkHolds` counted "`if (w.on < 1e8) act.add(w.on);`" for every word, so a blank echo counted as shown and as activity.

**Diagnosis.** The checks trusted the scene's on and off frames. A render bug passed them.

**New rule.** `shown_gate.mjs` `inkOk` applies `viewer.html` `wordTexture`'s maths: the canvas is w x h at 220 / cap pixels per unit and the cap line sits at mid-height + half a cap, so the letters fit only when the box is at least one cap high and as wide as the text (from the font metrics). `fullyShown` requires it, and every whole-song check goes through `fullyShown` (camera projection, all corners, front-facing). On the committed scene it fails exactly the 13 echoes and no other word.

**Risks.** It is a model of the viewer, not the viewer; a different texture bug (a font failing to load) would still pass. It is cheap enough to keep in every check.

## Change 9. The idleness gate (rough cut 4, 141 to 150 s)

**Old rule (superseded).** `checkHolds`: "the longest stretch with no screen activity (a word entering, a pulse, an echo, a camera move) that contains a sung onset. Fails over MAX_HOLD_S." Activity was any word's on frame, any 9-frame pulse on any word, and "any camera key whose poses differ ... for its whole length" (Fable 19).

**Observed problem.** The 10 s RING! hold passed: blank echoes and pulses on RING! counted as activity while PHILLY and ONE MORE went by unshown.

**Diagnosis.** A pulse on the held word was counted as using the cue of a different sung word, and a slow camera drift counted as a move.

**New rule (default, failing loudly).** `whole_song_checks.mjs` `checkHolds`. Jefferson, condensed: "What's not okay is no activity when there are all kinds of cues for exactly the kind of activity that this engine is designed to turn into the animation."
1. Every sung event (lyric, repeat, ad-lib) must fall within 2 s after visible activity: a word appearing whole with drawable ink, a camera move above a visible speed (0.4% of the frame per frame of centre shift or scale, or 0.2 degrees of turn; amendment 14), a cut, or a picture element arriving.
2. Pulses (Jefferson's activity priority): sung cues come first (new words, the repeated phrase brought back, ad-lib entrances); a beat pulse is filler. A pulse counts for a sung event only when the pulsed word has the event's own text (RING re-sung pulses RING), or as general activity when nothing is being sung (within 6 frames of no onset). A pulse on RING never counts for PHILLY or ONE MORE.
3. Instrumental beat pulses (`sung_pulses.mjs` `addBeatPulses`, new): in every stretch of 2 s or more with no sung event, the newest word held whole and still pulses on beats 1 and 3 of each bar, clear of sung onsets by 0.4 s.
4. A failure sets the build's exit code and lists each idle stretch with the words sung in it.

**Risks.** The 2 s window is a default; a deliberate held moment would fail and need a reported exception. The visible-speed threshold is a best guess.

**Before and after.** Committed scene: holds check passed while the RING! hold was idle. This pass: 0 idle stretches (PASS). The first run of this pass, with the echoes dropped, failed correctly: 6.3 s (ONE MORE, PHILLY x3) and 3.9 s (ONE MORE) after the RING! hold. 10 instrumental beat pulses were added (RING at 1.5 and 2.7 s, RING! at 77.4 to 80.0 s and 145.7 to 153.3 s, MORE! at 159.7 s).

## Change 10. One sync window; lyric words matched by their own word (amendment 7)

**Old rule (superseded).** `addSungPulses` treated a same-text copy as placed "up to 3.0 s before ... or 0.3 s after" the onset, while `checkSync` accepted "`w.on <= (ev.t + PLACED_AFTER_S) * fps + LATE_FRAMES + 30`" (about 1.4 s), matched by text, and let a pulse or an echo excuse a lyric word.

**Diagnosis (Fable 15).** A word over 9 frames late got an echo plus its own late entrance; one over about 41 frames late passed silently because the echo covered it.

**New rule.** `sung_pulses.mjs` exports `SYNC` (`LATE_FRAMES = 2`), used by both. Lyric-map events are never handled by the pulse pass. `checkSync` matches each lyric event to its own placed word (same text and sung time, each word used once; build_best now writes each word's sung time `t` into the scene), fails it when it switches on more than 2 frames after its onset, and lists it as dropped when it is never wholly in frame from 2 frames before to 8 after its onset. The stale-word test promised in the old header is deleted (amendment 13): the idle gate covers what it was for.

**Before and after.** This pass: 0 late, 0 lyric words dropped by checkSync's window (the shown-whole sweep, which judges from the appearance frame, lists the 2 in Change 6).

## Change 11. Pulses only on a word the viewer can see (amendment 9)

**Old rule (superseded).** "`Math.abs(q.x) <= IN_FRAME && Math.abs(q.y) <= IN_FRAME`" on the word's centre (`IN_FRAME = 0.95`).

**New rule.** A pulse target is wholly in frame and front-facing at the onset and 8 frames later, still, at least 8% of the frame high, and not covered over 30% by a nearer word.

## Change 12. Readability gate in tryPrim (amendment 4)

**Old rule (superseded).** `plan_joints.mjs` `tryPrim` checked 15 readable frames only for attacks: "`if (mode === 'attack' && G.role !== 'rider' && ctx.nextAnchor && ctx.nextLeaves && ctx.nextAnchor.L - 9 - f1 < 15)`", and a zoom skipped the previous anchor's settle wait.

**Diagnosis (Neon).** Landing zooms started inside the previous anchor's reading time; 13.1.13 failed 37 times in sections 2 to 7 and most sections shipped on the fallback.

**New rule (default).** For every fit, land first: an entrance is rejected when it leaves this word fewer than 15 readable frames before the camera leaves for the next landing, or the previous anchor fewer than 15 after it settled, while a pop would keep 15. (A first build rejected whenever a pop merely kept more: 62 "protects reading" pops and a 35% pop share, with no gain where nothing could reach 15. Judgment: an entrance is rejected only where it is what costs the reading.) A pop chosen because every animated entrance failed that way is logged "protects reading" and is legitimate; the pop share is reported as it comes, even above 15%.

**Before and after.** Pops (echoes counted, Change 7), whole song: 82 of 314 entrances, 26.1%; without the 8 echoes 74 of 306, 24.2% (committed scene: 44 of 304, 14.5%, echoes not counted). Reasons in sections 2 to 9: no animated entrance fits 51, first word 8, protects reading 4, accent 2. The rise comes from the new limits together (no off-frame tick, rails at least 6 frames and speed-capped, zoom overlap at most 2 frames, the caps, the reading gate); it was not traced primitive by primitive. Sections on the severity fallback: 6 of 8 rebuilt (2 to 7), as before; severity rose (section 7: 88, was 19), mostly 13.1.13 protected reading and 13.1.1

## Change 13. Frequency caps for every primitive (amendment 5)

**Old rule (superseded).** Only pops were budgeted: "`POP_ACCENT_SHARE = 0.12`", counted with the mandatory first-word pop; zoom was exempt from the entrance-overlap rule ("`ent[k].prim !== 'zoom' && ent[k - 1].prim !== 'zoom'`").

**New rule (default).** In the draw, an animated primitive is out once it has 25% of the section's entrances (at least 2) or 2 of the last 4; the forced branch takes a capped-in animated entrance first, then (a judgment call, because the caps are defaults and Jefferson's note makes animated entrances the default) the least recently used animated entrance over its cap, logged in the build notes, and only then a pop. A first build that put capped-out words on pops instead raised the pop share to 34% (49 "no animated entrance fits", most of them caps). Run treatments keep their primitive. The first-word pop is outside the accent share. A zoom may overlap its neighbour by at most 2 frames (planner and 13.1.16).

## Change 14. Off-frame entry only by rail (amendment 6)

**Old rule (superseded).** A tick with no host "fall[s] back to entering from off frame" over 4 frames.

**New rule (default).** A tick needs a host. Rail and dock take at least 6 frames and move at most one eighth of the frame width per frame.

## Change 15. Pivot pickups (amendment 8)

**Old rule (superseded).** `planPivot`: "`const f1 = Math.min(first.landingFrame, groupL);`" with no limit, the pivot recorded on `first.anchorWordId` even when the anchor was not carried, and 13.1.9 accepting the group-first landing for every landing.

**New rule (default).** A carried word may pull the landing by at most 15 frames (0.5 s); past that the pivot is refused and the boundary falls back to a cut with the words entering on their own. When the anchor is not carried the pivot is recorded on the first carried word. The 13.1.9 group-first tolerance applies only to pivot and travel landings.

## Change 16. Fallback ranking names the worst reading loss (amendment 11)

**Old rule (superseded).** "Fable's ruling B20: survivors first, then the lowest severity, ties by score."

**New rule.** Survivors first; then fewest partly shown focused words (Change 6); then the smallest worst single reading loss (frames short of 15 readable or 8 still on one word, an unreadable anchor counting 15), named in the build log (`worstReadingLoss`); then severity; then score.

## Change 17. Click track for repeats and ad-libs (amendment 10)

**New.** `click_track.mjs` writes the song with a click on every repeat and ad-lib time ("out/Whole song/Whole song - repeats and ad-libs click track.m4a"). With a vocal stem it snaps each time to a stem onset within 60 ms; there is no vocal stem on disk, so all 36 are marked unconfirmed (beat-grid estimates).

## Amendments 12 to 16: what was done and what is logged

1. Amendment 12 (map audit): the word-length test is built and lists words over 3 s in the provenance (it finds the long "ring!"). The vocal-energy gap test and the backing-line order test need a vocal stem: not built.
2. Amendment 13: done (stale-word comment deleted, Change 10).
3. Amendment 14: done (visible speed, Change 9).
4. Amendment 15 (feed repeats into trail and camera planning): not built. The echo phrase (Change 7) is the stopgap; a chant whose earlier copy is off screen still gets an echo instead of the camera bringing the phrase back.
5. Amendment 16 (reveal): the approach Jefferson praised (compactLayout, sliding sections together and bending at overlaps) is kept. Built: a dropped chain fails the build; a moved plaque whose original is in frame on the frame before the switch fails the build. Not built: scoring placements by 16:9 coverage, rotating `want` into the moved frame, scoring views for uprightness. The reveal code is unchanged; because the sections changed, it now has 8 chains (was 13) and covers 10.1% of the last frame (was 9.6%), still under the 20% check. Both safety assertions pass.
