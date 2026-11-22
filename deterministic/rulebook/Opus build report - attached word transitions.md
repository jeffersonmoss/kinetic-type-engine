# Opus build report: attached word transitions

Written by Claude (Opus 5.5), 22 November 2026, for the supervisor. Worktree: `prototype/Deterministic engine - h1 - word transitions 22 November`, branch `word-transitions`. Commits from 5125d79 (gallery) to the picture-elements commit (see `git log`).

## What changes the story first

Updated after the second round (picture elements, the #144 fixes). Earlier counts below are kept and marked.

1. **Build #144 now passes every word check; 1 of 200 builds does** (commit c2b9ac0). The two failures were my own regressions: a popped first word no longer switched on with its plaque (blank frames 387 to 390), and the camera left 4th RING after 10 readable frames (reading is now protected for 15 frames before a camera move under joints). No check was relaxed. New failure counts are in section 4.
2. **Picture elements are built but have never been seen.** No SVG rasteriser works in my sandbox (ImageMagick draws the composed SVGs blank, Quick Look is blocked), so the hand's orientation, ring placement and the 76ers placeholder on the thumb are verified only by arithmetic and XML parsing. Section 9.
3. **The 76ers ring fails the readability rule by design of the music.** It pops on the last drum hit (frame 650) and the hand must leave when the next line starts (frame 659), so it has 9 frames on screen and 6 readable ones (needs 15, 8 still). Its first solid stretch is 4 frames, so it passes no-flash. Everything else passes the element checks.
4. **The reveal is held back 13 frames (652 to 665)** so the hand can leave first; the clip grows from 24.5 s to 24.9333 s. The word checks were not re-run on the post-passed scene (they need the build's plan objects); the change only inserts still frames before the reveal.
5. **All art is placeholder.** Neon's new files (bare hand with anchors, five-ring hand, 76ers top view) had not landed when I finished; the code picks them up automatically on a rerun, but the anchor path is untested against real anchors.
6. **The pinned Clip A still fails** 13.1.1, 13.1.14, 13.1.15 and 13.1.17; not recommended.

## 1. What was built

1. Primitive gallery (earlier commit 5125d79): 15 primitives plus the flip on its second axis, caption bar via `meta.captions`, already rendered by the supervisor.
2. `primitives.mjs`: catalogue, nominal durations, builders for every object primitive, pivot sign choice, hinge lines.
3. `interp.js`: the `pivot` camera key (exact end pose, tested to 1e-6 on four edges and both signs) and the word-motion evaluator (shift, hinge, scale channels; clips with `ride`).
4. `viewer.html`: per-word poses re-applied per motion-blur sub-sample, per-word clip planes, moving words counted in the blur sample count, panel trim test `< -1`, caption bar.
5. `plan_trail.mjs`: boundary-kind draw (item 36) with V3, kind gaps, flip second axis, attached-pair exemption in the trail test (41.3).
6. `plan_joints.mjs` (new): repeat-run detection and one-landing run groups, host search with compound hosts, timing modes and item 15 planning rule, collision tests, variety V1 and V2 on both tracks, run rules (32.2 to 32.5), forced repeats (34), weights (35), parallel-shot copy (32.7), pins with logged divergences, pivot joints for camera kinds.
7. `camera.mjs`: landings from the joint planner, `follow` keys for object entrances, `pivot` keys for pivot kinds, attack arrival frames, accents dropped within 8 frames of word motion, plaque `on` at pivot `f0`, word timings from the planner.
8. `checks.mjs`: animated and clipped word boxes in 13.1.1, 13.1.3, 13.1.4, 13.1.6, 13.1.10; words-only 13.1.5; 13.1.7 follow and pivot floors with word motion as activity; 13.1.8 pair exemption; 13.1.9 land, attack and carried sync; new 13.1.13 to 13.1.17; score terms `joint_variety`, `attach`, `mix`, `forced_repeats`, `pivot_purity`.
9. `build_best.mjs`: joints in the scene (`motion`, `clip`, `joint`, `pre_offset`), camera `pivot` and `joint` fields, `meta.joints_version = 1`, joints in the build log and pins. `provenance.mjs` lists every joint with rejected candidates (item 50).
10. `apply_jefferson_notes.mjs`: flip block only for old scenes (46.3); pulse guard (33); colour rules now read sung order from word ids, because `on` no longer follows sung order once words enter early (without this the second THE lost its stripes).
11. `make_clip_a.mjs`: reproducible pinned Clip A.
12. `test_rules.mjs`: all old tests pass, plus new ones: pivot end poses, primitive start and rest states, pre_offset holds then returns to rest, nominal durations, repeat-run detection, V1 on both tracks over 6 builds (only run segments or logged forced repeats may repeat), at most 4 in a row, same seed gives the same scene, score weights (perfect terms now 10.5).

## 2. Deviations from Fable's spec, with evidence

1. **Shove and uncover use a single `pre_offset` on the pushed host, not plaque-wide staging (item 27, 42.3).** Jefferson's decision, 22 November 2026. The host's rest is where it lands; before the joint it is drawn displaced by `s` (sitting in the guest's slot), easing to zero during the joint. Each host word carries `pre_offset: [{v, f0, f1, by}]` for reading, and the same offset is in its `motion`. Shove and uncover now weigh 18 like slide-out (35.1 had 14 and 10). Consequence found in the 200-build survey: in a chain of shoves (RING run) a guest that later becomes a host is itself displaced, which leaves a one-slot gap; check 13.1.15 catches it (31 builds), so such builds lose.
2. **Repeat runs whose words face different ways are framed word by word.** 32.3 asks for one still framing, but check 13.1.1 needs each sung anchor upright within 1 degree. Runs also use the tight 0.94 x 0.86 framing.
3. **Stacks whose first word alone would cover under 3.2% of the frame are tightened to 0.94 x 0.86.** Without it the final ONE MORE RING! stack failed 13.1.5 in every build sampled (ONE alone at 2.6% for 6 or more frames).
4. **Carried words switch on at the first pivot frame from which they face the camera and stay in frame for 4 frames,** not at pivot `f0` (14.3). At `f0` a room-corner word is edge-on and flashed for one frame (13.1.6). Effect on the flip: the second THE KING! switches on about frames 483 to 487 of the 474 to 493 flip, as it turns to face us.
5. **Carried riders may be sung during the pivot** (13.1.9 exempts them). The item 53 table itself puts THE inside the flip.
6. **Attack entrances must leave 15 readable frames before the camera leaves for the next anchor.** Planning-side addition to item 15, because 13.1.13 otherwise failed for attack guests.
7. **Hinge and scale primitives (fold-down, swing-in, extrude, sprout) require a gap of at most 0.35 cap to the host,** matching 13.1.15, while item 11 allows 0.6. Item 11 and 47.3 disagree; I made the planner obey the check.
8. **A pinned joint that repeats the previous primitive is logged as a forced repeat,** the same as a drawn one (needed so a pinned fork reproduces its parent exactly).
9. One joint per pivot; carried words share it. 13.1.15 is applied to object primitives only.
10. The gallery shows each primitive once (Jefferson's re-scope), not the four-edge variants.

## 3. Outputs (all in `out/Word transitions demo/`)

1. `Best of 200/` and `Best of 200 - Jefferson notes - scene.json`: build #144, recommended.
2. `Clip A/`, `Clip A - Jefferson notes - scene.json`, `Clip A/pins used.json`: the pinned Clip A.
3. `RENDER ME - opening candidate.txt`: exact commands and frames to check. The render command for the recommended scene:

```
node capture.mjs "out/Word transitions demo/Best of 200 - Jefferson notes - scene.json" "out/Word transitions demo/Room for One - word transitions - opening candidate.mp4" 30 0 24.5 --blur on
```

4. Length chosen: 24.5 s (h1 is the whole opening the engine has words for: 0 to 21.97 s of singing plus the reveal). Build #144 shows: pop, tick, sprout (run of three), dock, room-corner pivot (three), shove with pre_offset (three), cube-roll pivot (two), slide-out, flip, rail, and the chant pulses. Missing from it: fold-down, swing-in, extrude, uncover, pivot-roll and pass-through.

## 4. Survivor counts over 200 builds (salt `demo`)

After c2b9ac0: 1 survivor (#144, score 4.3293). Failures per check: variety 196, focus dominance 133, families 110, attachment 70, blank transit 48, clean motion 44, no flash 9, readable anchor 3, reveal 2, wall of lines 1, protected reading 0. The first-round figures below are superseded and kept for the record.

1. Survivors (first round, superseded): 0. Builds by number of failed checks: 2 failed: 2 builds; 3: 34; 4: 67; 5: 72; 6: 23; 7: 2.
2. Failures per check: 13.1.14 variety 196; 13.1.13 protected reading 183; 13.1.5 no blank transit 135; 13.1.3 focus dominance 133; 13.1.17 families 110; 13.1.15 attachment 70; 13.1.16 clean motion 44; 13.1.6 no flash 9; 13.1.1 readable anchor 3; 13.1.12 reveal 2; 13.1.4 wall of lines 1. 13.1.2, 13.1.7 to 13.1.11: 0.
3. Main causes, from the failure messages:
   1. Variety: forced repeats over the cap of 2 per 30 joints (186 builds). Most come from the RING run framed word by word (the camera leaves every 19 frames, so item 15 leaves room only for `pop`, and two pops in a row are forced) and from riders after anchor pops.
   2. Protected reading: RING pops get 10 to 13 readable frames when the run is framed word by word (193 messages).
   3. Blank transit: long sweeps and glides between plaques with no word in frame for 3 or more frames (an old camera behaviour now visible because panels no longer count, as item 5.5 intended).
   4. Focus dominance: the previous plaque's words larger than the new anchor at landing (STILL, NOT, WHAT'S, FOUR landings).
   5. Attachment: the host leaves frame during a `follow` because the guest's landing is a poster framing that excludes its host.
4. My reading: the camera framing (posters that exclude the host, word-by-word run framing) is now the binding constraint, not the primitives. A pair framing for attached entrances (host and guest in one landing) would likely lift 13.1.15, 13.1.13 and the forced repeats together. That is a camera design call for Fable; I did not invent it.

## 5. Open risks

1. Chained shoves leave a gap (section 2, item 1); a proper chain would need the earlier word's pre_offset to grow with each push.
2. `follow` keys under shove and uncover: the spec pictures a still camera for push; in #144 the camera follows when the guest's landing differs.
3. The flip words appear mid-turn (section 2, item 4); Jefferson asked for them to rotate in with the turn, which is what back-face culling allows, but it should be looked at.
4. The 13.1.15 check reads the host's pose at `f0` from the final scene, so retroactive pre_offsets are included; a subtle error there would show as false passes or fails, not in the render.

## 6. What could not be verified without a render

1. Whether clip planes, hinges and scales look right in the viewer (only the gallery has been rendered so far).
2. Motion blur on moving words.
3. Whether pre_offset pushes read as a push.
4. Visual effect of the tightened stack framing on ONE MORE RING! and the reveal.
5. The frames listed in `RENDER ME - opening candidate.txt` are the ones to check.

## 7. Not done

1. First-round items 1 and 2 (the element mechanism and the two storyboard uses) are now built; see section 9.
2. Camera framing was not redesigned (that call is Fable's). The HAND! slot uses the existing framing, which already leaves the strip to the right edge clear.
3. Real anchors, Neon's bare hand and the 76ers top view: waiting on Neon.

## 8. Temporary files and housekeeping

1. My scratch scripts are in this session's scratchpad (`/private/tmp/claude-501/-Users-jeffersonmoss-Documents-GoogleDrive-CODEX-PROJECTS-TECH-SUPPORT--Blerg/ec875574-48a5-4514-b265-f82c97403c21/scratchpad/`: `smoke.mjs`, `survey.mjs`, `survey2.mjs`, `joints.mjs`, `frame.mjs`, `shot1.mjs`, `diffE.mjs`, `viewer_module.mjs`, `layout.mjs`, and the folders `hand preview/` and `element svgs/` holding the decoded element SVGs). Other files in that scratchpad predate this task and are not mine to judge.
2. Untracked in the worktree and not mine: `out/Jefferson notes demo/Clip A baseline - scene v8.json`, `v9`, `v11`, `v12`. Left as they are.
3. Nothing deleted.

## 9. Picture elements (second round)

Files: `elements.mjs` (engine, generic), `viewer.html` (draws elements), `videos/Room for One - picture elements.mjs` (this video only), tests in `test_rules.mjs` section 13, output `out/Word transitions demo/Best of 200 - Jefferson notes and picture elements - scene.json`.

1. Engine (`elements.mjs`), nothing video-specific:
   1. Elements replace a word (inheriting its entrance motion, clips, timing and reveal; the word is hidden) or sit beside a word as an example of it.
   2. Sets: any number of items laid over a base element, split across the free beats by `groupAcrossBeats` (explicit sizes such as [2, 2, 1], or automatic; one per beat is the special case).
   3. Art: each piece is a list of fallback sources (a file, layers of it by id with alternative ids, a whole file placed at a point, or a piece moved onto an anchor rect of the base drawing). Pieces are composed on one canvas and turned by multiples of 90 degrees. SVGs go into the scene as data URLs, so capture needs no file access.
   4. Placement in a screen slot: the element's read box is fitted into a rectangle of the frame at a given camera pose, on the word's plane.
   5. Opacity keys (stepped), an exit slide off a frame edge, and `holdRevealUntil` (moves the reveal and everything after it later).
   6. `checkElements`: the words' no-flash (4 frames) and readability rules (15 readable, 8 still in a row, 90% in frame, facing within 40 degrees, 65 px for main elements) on each element's read box; frames under 50% opacity are not readable. Plus overlap with words on the same plaque and an optional keep-clear strip to a frame edge.
2. This video's script:
   1. All art paths are in one constant (`ART`). Order of preference: Neon's new bare hand with anchors, then the five-ring file's layers, then the four-ring placeholder (bare hand = that file without the `championship-rings` group; it still shows the rings' cast shadows).
   2. The hand is turned -90 degrees: fingers left, wrist and forearm off the right edge. The read box (fingertips to wrist) is measured on the placeholder and must be re-measured on Neon's new hand.
   3. HAND!: the slot runs from the word's left edge to the right frame edge at the word's height, while the camera holds on it (frames 150 to 169). The hand's read box lands at x 0.26 to 0.98, y -0.54 to 0.54 (frame units, -1 to 1, y up). The strip from it to the right edge is clear for all 20 frames. The hand is up from 144 to 327 (it docks in with HAND!'s own entrance) and comes back in the reveal.
   4. ONE / MORE / RING: the bare hand pops in with ONE at 589 (the camera finishes its pivot at 594), held 594 to 658 at x 0.57 to 0.98, y -0.31 to 0.31, right of every word (the strip is clear for all 65 frames). It is about 280 px wide, so each ring is small, about 40 px.
   5. Rings on the chant pulses (one frame early, as the words' pulses): both Heat rings 631, Cavaliers and Lakers 640, 76ers 650.
   6. Exit set by the music: "At forty-one" starts at 21.971 s, frame 659. The hand and rings slide right 659 to 664, gone at 665; the reveal now starts at 665.
   7. 76ers flicker, fitted between 650 and 659 from Jefferson's 6/2/4/5 starting pattern, with the first solid kept at 4 frames for the no-flash rule: solid 650 to 653, dip to 0.15 at 654, solid 655, dip 656 to 657, solid 658. The second dip is longer than the first, as asked. At this span the second solid is one frame; if that reads as noise, the only room is the 76ers pop moving earlier, which would leave the drum hit.
3. Element check results: hand-with-four-rings 25 readable, 21 still; bare hand 67 and 65; Heat rings 28 and 28; Cavaliers and Lakers 19 and 19; 76ers 6 and 4 (fails, item 3 at the top).
4. Viewer: element images are decoded before READY, drawn to a canvas texture and handled by the same mesh, pose, stamp and visibility code as words; replaced words are not drawn. Not rendered.
5. Deviations: anchors are read from hidden `<rect>` elements by id (`anchor-index`, `anchor-middle`, `anchor-ring`, `anchor-pinky`, `anchor-thumb`); a ring layer is moved by its own `translate()` origin onto the rect centre, and a whole file (the 76ers top view) is centred and scaled to the rect width. Rect transforms other than one rotate() are ignored. This is a guess at Neon's format and is untested.

## 10. Jefferson's notes on candidate 2 (third round)

1. No flicker: the 76ers ring just pops on. It has 10 readable frames before the hand leaves (needs 15), so it still fails the readability rule; nothing else fails.
2. Ring timing: each pop now starts 2 frames early (the viewer's 1.1x pop settles to full size two frames after it starts) and reaches full size on the hit's frame.
   1. Audio onsets (librosa onset detection on the mp3): 21.065, 21.404, 21.694 s, so frames 632, 642, 651.
   2. Chant pulse times on the words (Jefferson's marks one frame early): 21.027, 21.347, 21.657 s, so frames 631, 640, 650. His marks themselves are 21.06, 21.38, 21.69 s.
   3. Song map beats: 21.084 and 21.734 s; the middle hit falls between beats.
   4. Pops start at 630, 640 and 649 and reach full size at 632, 642 and 651. In candidate 2 they started at 631, 640 and 650, so they reached full size at 633, 642 and 652: one frame late on the first and third hits, on time on the second, as Jefferson heard.
3. Hidden once it leaves (new default in `elements.mjs`): after an element has been seen cleanly, it is hidden for good from the first frame it is wholly out of frame, shows a cut edge inside the frame, or is partly behind a visible panel. It stays out of the reveal unless the video asks for `reveal: true`; `stay_after_leaving` keeps it for a shot meant to show it.
   1. `checkElements` now flags any frame where an element is drawn with a cut edge inside the frame or partly behind a panel. Only panels are tested, not words with solid backgrounds, and the panel growth copies the viewer's margin without its corner trimming, so it can over-report near corners.
   2. HAND!'s hand: a panel starts to cover it on frame 170, the first frame of the pivot to ROOM (its cut end would show from 175), so it is hidden from 170. **It vanishes while still mostly in frame at the start of the pivot.** Motion blur may hide that, but it has to be checked by eye. A softer exit, such as a fade over the first pivot frames, would need a decision.
   3. Bare hand: slides off to the right from 659 and is hidden from 662, when it is wholly out of frame.
4. The full-song step is on hold, as the coordinator asked. I did not start it.

## 11. Tight composition (fourth round, Jefferson's note on candidate 3)

1. New in `elements.mjs`, on by default for any element with a left or right cut edge (`tight: false` turns it off).
   1. After the slot is chosen, the drawing slides toward the empty space and grows, keeping a margin of 0.35 of each word's cap height from every word visible during the hold. The drawing runs from the read box's far edge (the fingertips) to the cut.
   2. The cut stays at or beyond the frame edge, so only the forearm bleeds.
   3. Choice of placement: the largest size, from the slot size up to 2.5 times it and at most 80% of the frame height, that keeps at least 90% of the drawing in frame. If no size reaches 90%, the placement with the most in frame wins; shares within 2 points count as equal, and then the slot's height is preferred.
   4. Panels are not treated as obstacles. They are invisible, and the separate occlusion rule hides an element once one covers it.
2. New check: at the first frame of each still hold, an element with less than 70% of its drawing in frame is flagged if a tight placement there could show more than 70%. Words arriving later in the same hold count as obstacles.
   1. It catches candidate 3's HAND! hand: frame 150, 56% in frame, 91% possible.
   2. It does not flag candidate 3's bare hand. Words fill the left of that frame, so nothing better is possible there.
3. Results:
   1. HAND! hand: fingertips-to-wrist box x -0.28 to 0.50, y -0.60 to 0.57; 1.08x the slot size; 91% of the drawing in frame (at least 89% over the hold). It is now hidden from 172 rather than 170, still mid-pivot.
   2. Bare hand: x 0.58 to 0.99, y 0.34 to 0.97, 57% in frame. It moved to the top right, beside MORE, because MORE's margin there is smaller than RING!'s lower down. It is still the slot size (about 260 px wide).
4. `checks.mjs` thresholds are untouched. All tests pass, including a new tight-composition test. The only element failure is still the 76ers ring's 10 readable frames.


## 12. Whole song (22 November 2026, Fable's rule audit ruling)

Driver: `videos/Room for One - whole song.mjs` (sections from `videos/Room for One - section words.mjs`, joining in `assemble_sections.mjs`). Outputs in `out/Whole song/`; per-section provenance and the flagged list are in `out/Whole song/Whole song - provenance and flags.md`. Render command in `out/Whole song/RENDER ME - whole song.txt` (174.76 s, 5243 frames). Nothing was rendered.

Built from the ruling:
1. Section A check changes in `checks.mjs`: focus thresholds As and 2·As; blank transit 6 frames, broken by any word at least half in frame; flash needs 25% of the word in frame; variety, wall of lines and reveal as score terms or flags; families dropped; clean motion narrowed to in-frame box overlap for 2 or more frames; forced repeats per 30 joints. Bug hunts 8.1 and 9.1: cause not found in the time box, so the shove hinge/clip and host-60% messages are demoted to logged flags.
2. Severity fallback in `build_best.mjs` (no section blocks the render).
3. Build 144 kept as the opening (its own reveal removed); sections 2 to 9 built at 200 candidates each and joined rigidly; vanishing rule (`hideWhenGone`); one reveal at 160.3 s with the 42.2 fallback (longest conflict-free tail, 61 of 83 plaques).
4. Jefferson's notes post-pass and the picture elements over the whole scene.

Sections: 2 (0 passing, #138), 3 (0, #113), 4 (0, #34), 5 (14, #154), 6 (0, #29), 7 (0, #73, severity 27), 8 (16, #99), 9 (59, #94). Five sections ship on the severity fallback with protected-reading and sync failures left; they are listed for Jefferson in the provenance file.

Not built: repair ladder (22), safe joint (23), stage 1 constraints (17.1 to 17.3, host eligibility 8.3), focus and eligible-list logs (2.3, 7.5), carrying cooldown and style state across sections (B14), trail tested only against plaques that are on inside the engine (D33), nudge and re-fold (38.1, 38.2), landscape changes (39), fly-over (40), and a joined-scene re-run of every check (B25). The section 2 join is a cut at frame 659, so the hand's exit slide is not seen. Long still holds remain in the instrumental (141.5 to 154.9 s) and on line 19. The only element-check failure is the 76ers ring (10 readable frames, needs 15).


### 12.1 Second pass (reveal fix, Neon art)

1. Cause of the black reveal: `rigidTransform` used the section's first plaque as its "from" frame and mutated it mid-walk, so every later plaque of a section was moved by a half-updated frame (trail scattered over about 100,000 units) while words and cameras were not moved at all (all sections sat in their own local space, overlapping). Fixed by snapshotting both frames. Every word now sits on its plaque (323 words, max in-plane offset 0.62 plaque sizes). This changes the whole song body, not just the reveal.
2. Reveal: camera looks at the centre of the shown plaques' bounding box, backs off until every corner is within 86% of the frame, and tries the face-on view and eight three-quarter diagonals. New `checkReveal` fails if under 20% of the last frame is covered. The 20% floor allows only the last 3 plaques (21.4% covered); the whole conflict-free tail (51 to 52 plaques) covers about 5.7%, because the trail is a sparse 3D snake. `--reveal-coverage 0.05` builds the full-tail version (check then reports FAIL).
3. Pull-back now runs from frame 4809 to 5153; the still hold at the end is 3.0 s.
4. Picture elements use Neon's bare hand and the 76ers top view; rings from the four-ring file sit on the anchors. Hand read box re-measured to [0.02, 0.01, 0.98, 0.57].


### 12.2 Rough cut 2 notes (re-sung pulses, pop budget, sync, holds, echoes, reveal layout)

Full write-up for reviewers: "Engine rule changes - rough cut 2 notes - 22 November 2026.md" in this folder. In short:
1. Pops: 52% to 14.5% of entrances (sections 2 to 9: 7.7% to 14.3%). New host-free zoom; riders get quick animated primitives; pop only as an accent or when nothing animated fits.
2. Sync: count times corrected (sung over "count of three"); pivots land by the first carried onset. Whole-song sync check: 7 late and 38 unshown before, 0 and 0 after.
3. Holds while singing: 12.3 s and 16.6 s before, none over 2 s after (23 pulses, 13 echoes from `sung_pulses.mjs`).
4. Reveal: compacted layout, all 82 plaques, largest gap 522 units (was 2,212).
5. Cost: sections 2 to 7 have no passing candidate; protected reading failures rose.
