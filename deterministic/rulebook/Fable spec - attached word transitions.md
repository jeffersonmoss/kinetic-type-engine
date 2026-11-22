# Fable spec: attached word transitions (hinge, slide, hide, push)

Written by Fable, 22 November 2026, for Neon to build. Engine: worktree J, `prototype/Deterministic engine - h1 - Jefferson notes 22 November/`. Section numbers such as 9.6.2 or 13.1.5 refer to `Rulebook final - Fable.md` in this folder. Design calls here are final. Where a number is a guess it says so.

## A. What Jefferson asked for, and what is wrong today

1. His complaint (22 November 2026): "we're not getting any of the transition where one word emerges from another, they just emerge in a different place and the camera moves to them." He wants words that "rotate out from behind other words that they are like touching", "adjacent sides of a cube", "words sliding from behind each other", and more "word flips" instead of "camera flips".
2. His decision: "make more primitives for introducing words and restrict them from being used the same way twice in a row", with a deliberate exception when "the song is doing the same thing three times in a row", after which "it needs to do something else".
3. His later instruction: "the sliding, the hiding, the pushing, the hinging, all of those primitives are needed", and it must stay deterministic: "giving our deterministic tool more options ... without needing model to intervene". So four families are required (slide, hide, push, hinge) and every choice is made by rule and seed. No model call anywhere in the build.
4. His frame-of-reference rule: "Movement is relative ... it just matters that they are moving in relation to each other." The test of a transition is the relationship between the new word and the current word at the moment of change (shared edge, hinge, behind it, on its back face), never which of camera or word "really" moved.
5. Diagnosis, checked against the code and the v12 render:
   5.1. Confirmed in code. `camera.mjs` word visibility (the `wordTimings` loop) gives every word exactly one entrance: switch on one frame before onset, with a 3-frame stamp for anchors. In scene v12, 23 of 30 words have `stamp: true`; the other 7 are riders or the flip words.
   5.2. Confirmed in code. `plan_trail.mjs` always puts a gap between plaques (0.45 to 2.40 x `hg`, `gapRanges`), and `compose_plaques.mjs` adds a panel pad of 0.35 x mean cap inside each plaque edge. No word is ever created touching the previous one across a boundary.
   5.3. Confirmed in code. `viewer.html` has no per-word transform over time. The only moving things are the camera, the stamp scale and the chant pulse. `interp.js` has one special camera key (`flip`), which turns the axes but does not pivot about a joint.
   5.4. Confirmed in frames (five contact sheets cut from v12). Frames 97 to 117: FOUR sits alone on black, the camera sweeps, RINGS pops. Frames 170 to 184 (the roll into ROOM): about eight consecutive frames show no type at all. Frame 261: a hard cut to YEAR alone. Frames 535 to 544: KING! leaves as a sliver and WHAT'S appears alone. Only the flip at 474 to 493 shows one phrase turning into the next.
   5.5. One thing the diagnosis missed. Check 13.1.5 (no blank transit) counts panel area as coverage. The notes post-pass made panels invisible, so the check now passes frames that are blank on screen. Fixed in item 48.1.
6. What the reference really shows, so nobody over-reads it. The measured Pulp Fiction survey found 93% of words attached to earlier text, but 63% simply pop in at the attached spot, 31% are revealed by camera travel, 1.5% slide, and no word is pushed off screen by another. Every settled turn is a 90 degree in-plane roll about a shared line; there are no 3D cube turns and no 180 degree flips in it. So the cube hinge, the fold and the flip below come from Jefferson's own description, not from Pulp Fiction. The research folder and the Last30Days file turned up no other catalogued example of these entrances; outside Pulp Fiction the catalogue rests on his words and on my design.

## B. Model: rest world, entrances, joints

7. The rest world stays. Every word keeps the fitted rest position that `compose_plaques` and `plan_trail` give it. The reveal, the trail and the layout checks all use rest positions. An entrance is a short rigid motion (and sometimes a clip) that ends exactly at rest.
8. A joint is the change from one sung word to the next new word. Chant pulses (skill item 13.1) are not joints.
9. Each joint has a host (a word already on screen that the new word touches) and a guest (the new word). Symbols: `e` is the host edge the guest sits on (right, left, top, bottom); `d` is the unit vector out of that edge in the plaque plane; `t` is the unit vector along the edge; `N` is the plaque normal; `ext_d(X)` is word X's box size along `d`; `g` is the gap between the two boxes along `d`.
10. Two actors, chosen by where the joint is, never by taste:
    10.1. Joints between plaques that turn (hinge, flip, dive) are done by the camera pivoting about the joint. The ground is plain and panels are invisible, so a camera pivot about a shared edge is identical on screen to the two words turning about that edge.
    10.2. Joints inside a plaque, and flat joints between plaques, are done by moving the guest (and for push and uncover, the words already on that plaque).
11. Adjacency test, used everywhere. Guest G is adjacent to host H on edge `e` when both lie in one plane, `g` is between 0 and 0.6 x min(cap H, cap G), and the two facing edges overlap along `t` by at least 60% of G's facing edge. A host may be compound: a run of visible words in one row or column whose facing edges, taken together, meet the 60% rule. For rider ticks (item 24.3) the overlap floor is 40%. Sprout (item 25.2) needs any overlap at all.
12. Host choice, in order: the previous sung word if adjacent; else the adjacent visible word sung most recently; else a compound host; else none. The host must be at least 60% inside the frame at the entrance's first frame, measured at the camera pose of that frame.
13. Easing. Object motion and follow moves use the sharp ease `{a: 2, b: 4, x0: 0.34}`. Camera pivots use `{a: 2, b: 3, x0: 0.40}`, except pass-through, which uses the sharp ease. No overshoot, no opacity ramp, no fade. Only `pop` keeps the 3-frame stamp.
14. Timing. `L` is the word's landing frame, onset frame minus 1. `D` is the duration in frames.
    14.1. `land`: the entrance ends at `L`. Preferred.
    14.2. `attack`: the entrance starts at `L` and ends at `L + D`, with `D` at most 6. With the sharp ease the guest is half out by frame `L + 2`.
    14.3. `carried`: the word switches on at the first frame of a camera pivot and has no motion of its own.
    14.4. `D` is the largest value up to the primitive's nominal that fits. If the fit is below the primitive's minimum in both modes, the primitive is not eligible at that joint.
15. The protected reading interval, restated for moving words. A readable frame of an anchor is one where the word is fully unclipped, not in a motion segment of its own, at least 90% inside the frame, turned no more than 40 degrees from the camera axis, and at least 65 px in cap height. Every anchor needs 15 readable frames, 8 of them consecutive with the camera dead still. Riders keep rule 13.1.2.
    15.1. Planning rule the selector uses: an entrance that will make the camera leave the previous anchor may not start before that anchor's settle frame plus 15 (plus 12 for camera pivots and the dive, which keep the old word readable for their first frames). An entrance under a camera that stays still, where the previous anchor stays in frame, may start at settle plus 8 if it moves that anchor (push, uncover) and at once if it does not.
    15.2. Settle frame: `pop` settles at its switch-on frame; anything else at the last frame of its entrance.
    15.3. No entrance starts before the previous word's entrance has ended, or before its own host has settled. If the fit fails, shorten `D` to its minimum, then fall to `pop`.

## C. Catalogue of primitives

Durations assume the song map's tempo; at 96 BPM one beat is 18.75 frames. `D` = clamp(round(k x beat frames), min, max).

### Hinge family

16. `cube-roll` (boundary, camera). Source: Jefferson, "adjacent sides of a cube"; no Pulp Fiction example.
    16.1. Geometry: fold `corner-out` (exit left or right) or `tip-out` (exit top or bottom) with gap 0. Plaque B hangs from A's exit edge and falls away behind A's plane. The hinge line is A's exit edge. All four edges are allowed.
    16.2. Motion: the camera pivots 90 degrees about the hinge line (item 44). On screen the hinge crosses the frame, A foreshortens to nothing on one side and B unfolds from the same line on the other.
    16.3. Occlusion: none needed. Words are front-side only, so B is culled until the camera crosses the hinge plane, and A is culled once the camera is behind A's plane.
    16.4. Words: every word of B's first landing group whose onset falls in `[f0, f1 + 3]` is carried.
    16.5. `D`: k = 0.75, clamp 10 to 15, floor 9 frames. `land` only: the pivot ends at `L` of B's first anchor.
    16.6. Reading interval: the old word needs 12 still frames before `f0`; the first few frames of the turn complete its 15.
17. `room-corner` (boundary, camera). Source: his earlier wish in rulebook 8.4, "the right edge pivots to become the new letter facing the camera". The same as `cube-roll` with folds `corner-in` and `tip-in` at gap 0: B rises on the camera's side. The old word does not vanish; it becomes a foreshortened wall or floor along one frame edge. Same timing as item 16.
18. `pivot-roll` (boundary, camera). Source: Pulp Fiction 7.5 to 7.6 s (WHAT COUNTRY swings to vertical along the right edge of YOU; I saw this on the 6 s strip), and the survey's other 90 degree rolls at 16.25 to 17.0 s, 30.75 to 32.1 s and 33.0 to 34.1 s (log only).
    18.1. Geometry: fold `roll` (B turned 90 degrees about `N`, sign sampled) on any edge, gap 0.30 x `hg`. Pivot point `P` is the point on A's exit edge at the centre of the overlap between A's last cluster and B's first cluster.
    18.2. Motion: the camera rolls 90 degrees about the axis `N` through `P`. The old word swings to vertical and stays in frame beside the new one.
    18.3. Words carried as in 16.4. `D`: k = 0.75, clamp 10 to 15, floor 9. `land` only.
19. `fold-down` (inside a plaque or across a flat boundary, object). Source: Jefferson's hinge description applied to one word; no Pulp Fiction example.
    19.1. Geometry: the hinge line is the guest's near edge (the edge facing the host). The guest starts turned 90 degrees up out of the plane on the camera side, standing on the host's edge like a raised drawbridge with its face towards the host, and falls flat to rest. Rotation axis `a = N x d`, sign chosen so that a +90 degree turn carries `d` onto `N`; angle 90 to 0.
    19.2. Why only from the front: behind the plane the invisible panel would hide it.
    19.3. Eligibility: adjacency (item 11), and `ext_d(G)` no more than half the camera distance during the move.
    19.4. `D`: k = 0.4, clamp 5 to 9. Camera: follows to the guest's landing over the same frames, or stays still in a stack.
20. `swing-in` (inside a plaque or across a flat boundary, object). Source: the same Pulp Fiction rolls as item 18, applied to one word.
    20.1. Geometry: pivot `c` is one of the two corners of the guest's near edge. The guest starts turned 90 degrees in the plane about `N` through `c`, standing on end away from the host like a raised gate, and swings down to lie along the host's edge. Take the sign for which the turned box has its centre on the `d` side of the host edge and does not overlap the host.
    20.2. Eligibility: the swept quarter disc must not touch any other visible word (margin 0.05 cap) and the turned start box must be at least half in frame. If both corners pass, the seed picks.
    20.3. `D`: k = 0.4, clamp 5 to 9. No clip. Camera as 19.4.

### Flip

21. `flip` (boundary, camera). Source: Jefferson's note of 22 November ("the second phrase is already on the back") and the existing fold 8.7. The next phrase is on the back face of the current slab and both turn together.
    21.1. Geometry: the existing `flip` fold, plus a second axis. Axis `U` (revolving door): `R' = -R`, `N' = -N`, as now. Axis `R` (tumble): `U' = -U`, `N' = -N`. Weights 65 and 35. Sign sampled.
    21.2. Motion: camera pivot of 180 degrees about that axis through K, the centre of A's last cluster.
    21.3. Words of B's first landing group are carried. This moves the rule now in `apply_jefferson_notes.mjs` into the engine.
    21.4. `D`: k = 1.0, clamp 15 to 21, floor 15. `land` only. The old word needs 12 still frames first.
    21.5. A flip of one word inside a plaque (a tile with the next word on its back) is deferred to stage 2. It needs a new layout class in which two words share one slot, and a rule for which of them the reveal shows.

### Hide family (the new word comes from behind something)

22. Three primitives.
    22.1. `slide-out` (object). Source: Jefferson, "words sliding from behind each other". Nearest measured reference: Pulp Fiction's seam masks at about 28.4 s and 33.4 s (log only, the first marked uncertain).
        22.1.1. Geometry: the guest starts shifted by `-(ext_d(G) + g) x d`, so its leading edge lies on the host's edge line, and moves along `d` to rest.
        22.1.2. Occluder: a clip plane through the host's edge with normal `d`. The guest is drawn only beyond the host's edge. A clip is used instead of real depth because word textures are transparent between letters.
        22.1.3. `D`: k = 0.33, clamp 5 to 8. Camera: follows in the direction of `d` over the same frames, so the old word leaves towards the frame edge as the new one emerges. Stays still in a stack.
    22.2. `uncover` (object). Source: Pulp Fiction 32.4 to 32.75 s, where TIME is hidden by the GO ON panel sliding across it (log only); here it runs the other way round.
        22.2.1. Geometry: the guest never moves. Everything already entered on the plaque was staged (item 27) shifted by `(ext_d(G) + g) x d`, so the host sits over the guest's slot with its far edge on the slot's far edge. At the joint the staged words slide back by that amount to rest.
        22.2.2. Occluder: a clip plane on the guest, through the host's trailing edge with normal `d`, that rides with the host.
        22.2.3. `D`: k = 0.4, clamp 6 to 9. Camera: still, or a small follow.
    22.3. `pass-through` (boundary, camera). The existing `depth` fold 8.6, unchanged in geometry: B's first cluster sits behind A's last cluster, A is an open plaque, and the camera dives through A. New: B's first landing group is carried from `f0`, so it is seen through A's letters before the dive. `D`: k = 0.75, clamp 10 to 15, floor 10. `land` only.

### Push family

23. `shove` (object). Source: Pulp Fiction 9.1 to 10.9 s. On the 6 s strip each new word (AINT, NO, COUNTRY, I, EVER, HEARD, OF) arrives above the last and the last sits one line lower, cut off by the frame. The survey logs these as snap cuts, so the continuous push is my design on that layout. Also the YES YOU DID lines pushing lower words down at about 47 to 49 s (log only).
    23.1. Geometry: everything already entered on the plaque was staged shifted by `s = (ext_d(G) + g) x d`. The guest starts at rest plus `s`. At the joint the guest and the staged words all move by `-s` together, in contact, and end at rest.
    23.2. Occluder: a clip plane fixed in the world at the far edge of the guest's rest slot, normal `-d`. At the first frame that seam lies on the host's far edge, so the new word emerges from the old word's edge and drives it home.
    23.3. `D`: k = 0.4, clamp 6 to 9. Camera: still when the from and to landings match; otherwise a follow.
    23.4. This is the primitive for a still camera with words moving through one framing.

### Slide family (in the open, along or onto a shared edge)

24. Three primitives.
    24.1. `rail` (object). Source: Pulp Fiction 32.375 to 32.75 s, the GO ON panel whipping in from the right (log only).
        24.1.1. Geometry: the guest starts off frame, displaced along `t` (the direction along the host's edge), and slides along the edge to rest. Start offset = the distance needed to put its whole box outside the frame at the camera poses of `f0` and `f1`, plus 10% of the frame size. The seed picks the sign of `t` among directions whose swept box misses every other visible word.
        24.1.2. `D`: k = 0.33, clamp 5 to 8. No clip. Motion blur from item 43.5.
    24.2. `dock` (object). Source: the Pulp Fiction study, "AINT drops in on top of WHAT" at about 9.1 s (the frames I saw are consistent with a cut, so the motion is my design). The same as `rail`, but the guest travels along `-d`, straight at the host's edge, and stops at the gap.
    24.3. `tick` (object, riders only). A 4-frame `slide-out`, or a 4-frame `rail` when no host passes the 40% test.

### Grow family

25. Two primitives.
    25.1. `extrude` (object). Source: skill section 0 item 8 ("clean edges to extrude from"); Pulp Fiction 37.75 to 38.1 s, AAAAUGH scaling out (log only). The guest scales along `d` only, from 0.02 to 1, anchored on its near edge. `D`: k = 0.25, clamp 4 to 6, kept short so the stretched letters never sit still.
    25.2. `sprout` (object). Source: Pulp Fiction 8.6 to 9.0 s, the small "wha" and "what" appearing inside the O of FROM and YOU (seen on the 6 s strip), and the YES YOU DID punch scales at about 47 s (log only).
        25.2.1. Geometry: uniform scale from 0.10 to 1 about point `Q` on the guest's near edge. `Q` is the projection onto that edge of the centre of the host letter nearest the guest's centre along `t`. Letter extents come from the advance widths in the metrics file; fall back to the host box centre.
        25.2.2. It reads as the new word growing out of one letter. It needs only item 11's weakest test, so a big anchor can sprout from a tiny rider.
        25.2.3. `D`: k = 0.33, clamp 5 to 7.
    25.3. Insets inside letter counters stay deferred (rulebook 15.3).

### Base

26. `pop`: unchanged (switch on at `L`, 3-frame stamp for anchors, none for riders), always at the fitted, attached rest position. `travel`: the old detached folds with the old gap ranges and the verbs cut, whip, sweep and glide.

### Staging, used by `shove` and `uncover`

27. A staged word enters and is read at a shifted position, then is moved to rest by a later joint. The whole plaque-so-far moves as one rigid body, so hosts and guests already on it stay attached.
    27.1. A word's shift at frame `f` is the sum, over every later `shove` or `uncover` on its plaque, of that joint's `s x (1 - e(f))`, where `e` is 0 before the joint and 1 after.
    27.2. Entrance geometry (hinge lines, clip planes, start offsets) is computed at rest and then shifted with the word.
    27.3. Landings use shifted positions: the camera frames a word where it is.
    27.4. A plaque may be staged when (a) it is the first plaque of the clip, or it was entered by `travel`, `pass-through` or `flip`, and tests 9.6.2 (d) and (e) still pass with the shifted landings; or (b) the shift is parallel to the plaque's entry edge and the adjacency test of its first word across the boundary still passes at the shifted position.
    27.5. A staged word needs 8 readable still frames at its staged position before it is moved.
    27.6. The staged boxes must not overlap any visible word of another plaque.
    27.7. Every shift is zero before the plaque's window hide and before the reveal.

## D. Selection and variety

28. Two tracks are checked: the full track (every joint, riders included) and the anchor track (joints whose guest is an anchor or pickup).
29. V1, hard: on both tracks, consecutive joints never use the same primitive. `pop` counts as a primitive, so two pops never run back to back.
30. V2, hard: on the anchor track, consecutive joints never share both family and edge.
31. V3: consecutive boundaries never use the same boundary kind, except `butt` (item 36), which may run twice.
32. The deliberate repeat.
    32.1. A repeat run is 2 or more consecutive new sung tokens with the same normalised text, each within 2 beats of the last, inside one shot. Example: RING RING RING RING.
    32.2. Joints 2 to n of the run all use one primitive, drawn once at joint 2 by the normal weights, with the same `D` and timing mode. Edges follow the layout.
    32.3. A run is one landing group: the camera holds one still framing of the whole run (rulebook 10.4), provided the smallest word passes the 65 px floor. If it fails, the run is framed word by word and the run primitive must fit that timing.
    32.4. At most 4 joints in a row share a treatment. A longer run draws a new primitive for joint 5.
    32.5. The first joint after the run uses a different primitive and a different family. The run primitive also differs from the joint before the run.
    32.6. Echo shots (the same phrase twice, such as THE KING! THE KING!) keep the existing rule: `flip` 55, `cube-roll` 45.
    32.7. Parallel shots (`parallelOf`) copy the reference shot's joint primitives where eligible, edges mirrored. V1 still holds inside each shot.
33. The chant pulse (skill item 13.1). Words already on screen that are sung again pulse; they do not get a new entrance. Pulses are not joints, do not count on either track and do not reset V1. A pulse may start no earlier than 2 frames after the word's last motion segment ends; an earlier one is dropped and logged. The pulse is never the treatment for a repeat run of new words.
34. Forced repeats. If V1 leaves nothing eligible, take `pop` when the previous joint was not `pop`; otherwise take the least recently used eligible primitive and log `forced_repeat`. More than 2 forced repeats per 30 joints fails the build.
35. Weights inside a plaque and at `butt` boundaries. Weight = base x eligibility (0 or 1) x cooldown (`cooldownFactor`, tau 3 joints for the same primitive) x 0.5 if the previous anchor joint was in the same family x an energy factor (hinge and push x 1.3 above the shot-energy median; hide, slide and `pop` x 1.2 below it).
    35.1. Anchors: `pop` 20, `slide-out` 18, `fold-down` 16, `shove` 14, `uncover` 10, `swing-in` 9, `rail` 7, `dock` 7, `sprout` 6, `extrude` 5.
    35.2. Riders: `pop` 50, `tick` 50. Riders never use anything else.
    35.3. The first word of a plaque entered by a `butt` boundary uses 35.1 without `shove` and `uncover`, with the host across the boundary.
    35.4. A word whose gap to the previous onset is under 8 frames may use only `pop`, `tick`, or an `attack` entrance of 4 to 6 frames whose host does not move.
36. Boundary kinds replace the fold table `FOLD_BASE`. `butt` is fold `flat` with gap 0.30 x `hg` and alignment `match`; its first word's entrance is drawn by item 35.

    | Kind | Fold | Gap | B2 | B3 | B4 |
    |---|---|---|---:|---:|---:|
    | `butt` | flat | 0.30 x hg | 34 | 20 | 8 |
    | `cube-roll` | corner-out, tip-out | 0 | 22 | 28 | 24 |
    | `pivot-roll` | roll | 0.30 x hg | 18 | 14 | 8 |
    | `room-corner` | corner-in, tip-in | 0 | 14 | 16 | 10 |
    | `pass-through` | depth | as 8.6 | 6 | 10 | 18 |
    | `flip` | flip | as 8.7 | 4 | 8 | 12 |
    | `travel` | any, old gaps | old ranges | 2 | 4 | 20 |

    36.1. The existing family multipliers, energy factor, axis cooldown, peaks and set pieces, edge weights, balance, corkscrew and hairpin rules stay, applied to the kind's fold.
    36.2. Rule 9.5.3 (the random streak that locks one fold for 2 or 3 boundaries) is deleted. Repeats now come only from the lyric (item 32).
    36.3. `cube-roll`, `room-corner`, `pivot-roll`, `flip` and `pass-through` are eligible only when the gap between A's last anchor and B's first anchor is at least 12 frames plus the kind's floor. Shorter gaps get `butt` or `travel`.
    36.4. The fallback ladder 9.7 tries kinds in weighted order; `travel` and then `jump` are last.
37. Target mix over the anchor joints of a clip. Bands are mine and unvalidated; they are scored, not hard.
    37.1. Hinge 25 to 35%. Hide 10 to 20%. Slide 8 to 20%. Push 8 to 17%. Grow 5 to 17%. Flip 0 to 8%. `pop` 12 to 25%. `travel` at most 10%.
    37.2. Attached share (everything except `pop` and `travel`): at least 60%.
    37.3. Why not the survey's 63% pops. Jefferson asked for more than the reference does. What I keep from the survey: turns of 90 degrees only, a still camera most of the time, crisp pops and hard cuts still present, no fades.
38. How often the old camera travel still appears.
    38.1. Detached travel through empty space: at most 10% of anchor joints, at B4 or as a fallback, never twice running.
    38.2. Cut and whip remain the carriers for `pop` joints inside a plaque. Sweep and glide timings remain for the pivots. Every other object entrance gets a `follow` move or a still camera.
    38.3. Report the share of pre-reveal frames with the camera dead still. Target 45% or more (the reference measures 60%). Not a hard check.

## E. Integration

39. Pipeline order: `planWords`, `assignStyles`, `composePlaques`, `planTrail`, new `planJoints`, `planCameraAndVisibility`, assemble, `evaluateScene`. Then the notes post-pass, as now. Best of 200 is unchanged.
40. `compose_plaques.mjs`:
    40.1. Panel pad becomes 0.15 x mean anchor cap (line 717, now 0.35). Panels are invisible, so the pad is only spacing, and 0.35 on both sides of a boundary would leave words 0.7 cap apart.
    40.2. Export a helper `adjacent(wordA, wordB)` implementing item 11 in plaque coordinates, and per-letter x extents for `sprout`.
    40.3. No change to layouts.
41. `plan_trail.mjs`:
    41.1. Replace the fold draw with the boundary-kind draw of item 36. Keep `intendedFold` and friends for provenance and add `kind`.
    41.2. Gaps by kind as in the table. `placeFold` is unchanged apart from the second flip axis (item 21.1).
    41.3. Test 9.6.2 (a) for the adjacent pair of an attached kind: treat both slabs as 1 unit thick and shrink the candidate box by 1 unit on each axis, because a zero-gap hinge makes the two 50-unit slabs overlap along the edge. All other pairs keep the growth of 60.
    41.4. Apply V3 and item 36.3 when building the kind order.
42. New `plan_joints.mjs`, run after the trail, in song order, one greedy pass.
    42.1. Input: shots, placed plaques, boundaries, local landings, the song map, the seed. RNG stream `stream(seed, 'joint', wordIndex, attempt)`.
    42.2. For each new word: build the eligible list (adjacency, host in frame, timing fit by item 15, collision tests, staging rules), apply V1, V2 and the run rules, draw by item 35.
    42.3. A candidate `shove` or `uncover` is validated by recomputing the shifts of the plaque-so-far (item 27) and re-running that plaque's 9.6.2 (d) and (e) tests with the shifted landings. On failure take the next candidate.
    42.4. Output per word: the `joint` record, `motion`, `clip` and `on` (item 43). Output per landing: the local target adjusted for staging at that frame.
    42.5. Pins: `pinnedShots[si].joints = [{word, prim, edge, mode, D}]` forces a choice. An ineligible pin falls to the normal draw and is logged as a divergence.
43. Scene format and `viewer.html`.
    43.1. New word fields:
        43.1.1. `joint: {prim, family, host, edge, mode, f0, f1, run, forced_repeat}`. For logs and checks; the viewer ignores it.
        43.1.2. `motion`: a list of segments `{f0, f1, ease, kind, from, to, ...}` in world coordinates at rest.
            - `kind: 'shift'`: `from` and `to` are world vectors.
            - `kind: 'hinge'`: `P`, `axis`, and `from` and `to` in degrees.
            - `kind: 'scale'`: `P`, optional `axis` (scale along that axis only; uniform when absent), and `from` and `to` as factors.
        43.1.3. `clip`: a list of `{f0, f1, P, n, ride}`. The word is drawn only where `(x - P) . n >= 0`, for frames `f0 <= f < f1`. `ride` is null or a word id whose current shift is added to `P`.
        43.1.4. `on` is the first motion frame, or `L` for `pop`. `stamp` is true only for `pop` anchors.
    43.2. Evaluation. Each kind is a channel. Its value at frame `f` is the `from` of its first segment before that starts, the eased blend inside a segment, and the `to` of the latest finished segment otherwise. World point = shift + hinge(scale(rest point)). Hinge and scale geometry are given at rest, so the shift carries them.
    43.3. Viewer: apply the pose to the front mesh, the ripple mesh and the pulse scale (the pulse multiplies after the pose). Clips are `THREE.Plane` objects on that word's material; `localClippingEnabled` is already on. Back copies are for the reveal only, at rest.
    43.4. New camera key fields: `pivot: {P, axis, deg}` (replaces `flip` and `flipAxis`; keep reading the old fields), `verb: 'follow'`, and `joint` (the primitive name).
    43.5. Motion blur: `renderAt` must re-apply word poses at every sub-sample, not just the camera pose. `sampleCount` takes the larger of the camera figure and the largest projected corner movement of any moving word over half a frame, divided by 10, clamped 1 to 12.
    43.6. Panel trim fix: in the panel loop, the test `dot(n, sub(c, q.C)) < 0` becomes `< -1`. With a zero-gap hinge the shared corners lie exactly on the neighbour's plane, and rounding would otherwise skip the trim and leave an invisible flap covering the new word.
44. `interp.js`, the `pivot` key. With `e` the eased progress:
    44.1. Rotate the `from` pose (target, R, U, N) rigidly about the line (`P`, `axis`) by `deg x e`. Call the fully rotated pose `from'`.
    44.2. Add `(to.target - from'.target) x e` to the target.
    44.3. Blend distance in log space from `from.dist` to `to.dist`.
    44.4. Blend any leftover roll between `from'` and `to` as the `flip` branch does now.
    44.5. At `e = 1` the pose equals `to` exactly. Unit-test that for all four edges and both signs.
45. `camera.mjs`:
    45.1. Transit into a landing whose first new word has an object entrance: the key takes the entrance's `f0`, `f1` and ease and the verb `follow`. If the from and to poses are equal, emit no key.
    45.2. Transit for a pivot kind: a `pivot` key, timed by items 16 to 22.
    45.3. `pop` and `travel` joints: verbs drawn as now.
    45.4. Word timings come from `planJoints`; the old `wordTimings` loop stays as the `pop` case.
    45.5. Accents (10.8) must end 8 frames before any entrance or pivot starts; otherwise drop the accent.
    45.6. Plaque `on` for a pivot kind is the pivot's `f0`.
46. Jefferson's notes post-pass keeps working:
    46.1. Colour, style, `stripes` and the `24!` to `24` text change do not touch boxes, so motion and clips are unaffected.
    46.2. The pulse block is unchanged. It finds ONE MORE RING! by array order, which `build_best` must keep. Item 33 adds the guard that a pulse waits for the word's motion to finish; in Clip A the last motion ends near frame 613 and the first pulse is at about 631.
    46.3. The flip block in `apply_jefferson_notes.mjs` (set `on` to the key's `f0`, clear `stamp`) is now done by the engine. Change its filter to `c.fold === 'flip' && !s.meta.joints_version` so it only touches old scenes. Set `meta.joints_version = 1` in new scenes.
    46.4. Invisible panels are compatible with every primitive: slides, shoves and uncovers stay in the word plane 0.5 in front of the panel; `fold-down` and `swing-in` stay on the camera side; clips are per word and never touch panel materials. Panels still switch off for the reveal, by which time every motion has ended.
47. Checks to add (`checks.mjs`):
    47.1. `13.1.13_protected_reading`: item 15, counted with animated poses and clips. Replaces the 8-frame part of 13.1.1 for words with entrances.
    47.2. `13.1.14_variety`: V1, V2, V3, the run rules of item 32 and the forced-repeat cap.
    47.3. `13.1.15_attachment`: for every attached joint, at `f0` the hinge line or clip plane lies within 0.35 x min cap of the host's edge, the overlap rule holds, and the host is at least 60% in frame from `f0` to `f1`.
    47.4. `13.1.16_clean_motion`: no moving word's box overlaps any visible word other than its host (margin 0.05 cap); no two entrances overlap in time unless carried; every segment ends before its plaque's window hide and before the reveal; a `fold-down` never comes within half the camera distance.
    47.5. `13.1.17_families`: each of slide, hide, push and hinge is used at least once in a clip with 12 or more anchor joints, and at least twice with 40 or more.
48. Checks to change:
    48.1. 13.1.5 no blank transit: count word ink boxes only, not panels (item 5.5).
    48.2. 13.1.7: `follow` keys have a floor of 4 frames; pivot keys keep their fold's floor; any word motion counts as activity for the stillness limit.
    48.3. 13.1.8: the pair exemption of item 41.3.
    48.4. 13.1.9 sync: a `land` or carried word is settled by its onset frame; an `attack` word is at least half revealed by onset plus 2 and settled by onset plus 5. A landing tied to an `attack` entrance may complete up to onset plus 5.
    48.5. 13.1.3, 13.1.4, 13.1.6 and 13.1.10: use animated boxes and clipped areas.
49. Score: replace `variety` with `joint_variety` = distinct primitives used / 10, capped at 1. Add `attach` = min(1, attached share / 0.6), weight 1.5. Add `mix` = share of the eight bands of 37.1 that are met, weight 1.0. Add `forced_repeats`, weight -2 each. Add `pivot_purity` = share of pivot frames on which plaques other than A and B cover under 4% of the frame, weight 0.5, because other plaques swinging past make a pivot read as a camera move again. `verb_mix` counts `follow` with the moving verbs.
50. Provenance: the render provenance file lists every joint (word, primitive, host, edge, mode, frames, the candidates rejected and why).
51. If fewer than 3 of 200 builds survive after this change, do not relax a check quietly. Report the failure counts per check.

## F. Test plan

52. Build in two milestones, in a new sibling folder (a copy or worktree of J; leave J as it is).
    52.1. Milestone 1: items 43 and 44 plus `Clip P primitive gallery`. Two block words (OLD, NEW) on a hand-written scene, one primitive after another with 20 still frames between: all 15 non-base primitives, `cube-roll` and `fold-down` on all four edges, `flip` on both axes. This shows each primitive alone before any song is involved.
    52.2. Milestone 2: items 40 to 42 and 45 to 51, then three clips of the h1 hook: `Clip F attached transitions pinned example` (item 53), `Clip G attached transitions free selection` (best of 200, no joint pins), and one seed variant of G.
    52.3. Add unit tests to `test_rules.mjs`: the pivot key's end pose; each primitive's start pose fully hidden or off frame where the catalogue says so; V1 and the run rule on a synthetic word list; staging returns every word to rest.
    52.4. Neon does not launch a browser. Deliver the scene files and the viewer; the main agent renders.
53. Worked example for Clip A (pins for Clip F). Frames are nominal, computed from the onsets in `h1 words.json` with item 15 and landing frames `L`. The exact frames come from the build log's `joint.f0` and `joint.f1`. Where the engine finds a pin ineligible it must say so in the log, not force it.

    | Word | L | Primitive | Family | Nominal frames | Note |
    |---|---:|---|---|---|---|
    | RING (1) | 24 | pop | base | 24 | opening word, staged |
    | RING (2) | 43 | shove | push | 37 to 43 | run: same treatment three times |
    | RING (3) | 62 | shove | push | 56 to 62 | run |
    | RING (4) | 81 | shove | push | 75 to 81 | run; camera still for the whole run |
    | FOUR | 97 | slide-out from RING (4), butt boundary | hide | 97 to 102 | attack; leaves the run's family |
    | RINGS | 117 | swing-in on FOUR's corner | hinge | 117 to 122 | attack |
    | ON | 128 | tick | rider | 128 to 132 | |
    | HIS | 137 | pop | rider | 137 | |
    | HAND! | 144 | sprout from HIS | grow | 144 to 149 | attack |
    | ROOM | 184 | pivot-roll | hinge | 170 to 184 | carried; HAND! swings to vertical and stays |
    | FOR | 202 | tick | rider | 198 to 202 | |
    | ONE! | 212 | pop | base | 212 | |
    | YEAR | 261 | cube-roll over ONE!'s exit edge | hinge | 247 to 261 | carried |
    | 24 | 280 | rail along YEAR's edge | slide | 280 to 285 | attack |
    | STILL | 332 | room-corner | hinge | 318 to 332 | carried |
    | NOT | 351 | dock under STILL | slide | 351 to 356 | attack |
    | DONE! | 364 | extrude from the STILL and NOT stack | grow | 364 to 368 | attack; compound host |
    | WHO'S | 391 | slide-out from DONE!, butt boundary | hide | 383 to 391 | land |
    | STILL | 404 | pop | base | 404 | |
    | CHASING? | 419 | fold-down from the WHO'S STILL row | hinge | 419 to 424 | attack; compound host |
    | THE | 450 | tick from CHASING?, butt boundary | rider | 446 to 450 | |
    | KING! | 454 | sprout from THE | grow | 454 to 459 | attack |
    | THE KING! | 493 | flip (echo) | flip | 474 to 493 | carried, as in v12 |
    | WHAT'S | 544 | cube-roll on a top or bottom edge | hinge | 530 to 544 | carried |
    | HE | 559 | pop | rider | 559 | |
    | CHASING? | 571 | fold-down from WHAT'S | hinge | 563 to 571 | parallel to the earlier CHASING? |
    | ONE | 594 | pass-through | hide | 584 to 594 | carried; seen through CHASING? first |
    | MORE | 600 | extrude from ONE | grow | 600 to 604 | attack |
    | RING! | 608 | fold-down from the ONE MORE row | hinge | 608 to 613 | attack; then the chant pulses near 631, 641, 650 |

    53.1. Counts over the 24 anchor joints: hinge 8, grow 4, push 3, hide 3, pop 3, slide 2, flip 1, travel 0. Attached share 21 of 24. No primitive repeats back to back on either track, outside the RING run.
    53.2. Predictions I am least sure of: whether the four RINGs pass the 65 px floor as one still framing (if not, the run falls back to a shorter primitive); whether the 60% edge rule passes for FOUR against RING (4) and for the two compound hosts after the pad change; and whether ONE's dive leaves CHASING? its 15 readable frames (the gap is only 23 frames).
54. Frames to check in the render, with what should be seen:
    54.1. 37 to 43, 56 to 62, 75 to 81: each new RING comes out of a line on the previous RING's edge and drives the group along. Identical motion three times. The camera does not move.
    54.2. 97 to 102: FOUR slides out from behind the last RING's edge. This must look different from the three before it.
    54.3. 117 to 122: RINGS swings down like a gate from FOUR's corner.
    54.4. 170 to 184: no blank frame. In v12 about eight frames here are empty. HAND! turns to vertical and stays beside ROOM.
    54.5. 247 to 261: one shared edge crosses the frame. ONE! thins to nothing on one side while YEAR opens from the same line. In v12 this is a hard cut at 261.
    54.6. 280 to 285: 24 whips in along YEAR's edge with motion blur and stops dead.
    54.7. 318 to 332: 24 becomes a wall or floor along one frame edge while STILL lands.
    54.8. 364 to 368: DONE! grows out of the edge of the STILL and NOT stack in four frames. Judge whether the stretched letters look acceptable.
    54.9. 419 to 424 and 563 to 571: CHASING? falls flat from the row above it, the same way both times (parallel lines).
    54.10. 454 to 459: KING! grows out of one letter of THE.
    54.11. 474 to 493: the flip, unchanged from v12 apart from the pivot.
    54.12. 530 to 544: the second cube turn, on a top or bottom edge this time.
    54.13. 584 to 594: ONE is visible through CHASING? before the dive.
    54.14. 608 to 613, then 631 onward: RING! slams down; the chant pulses still fire and no pulse overlaps a motion.
    54.15. Whole clip: no two consecutive words arrive the same way except the RINGs; no frame without type between the first word and the reveal; the reveal shows every word at rest.
55. In the gallery clip, check for each primitive: the guest is invisible or off frame on the frame before `f0`; it is touching the host on every frame it is visible (except `rail` and `dock` before contact); it stops dead with no overshoot; the blur appears only while it moves.

## G. What I verified and what I inferred

56. Read in full: `plan_trail.mjs`, `build_best.mjs`, `interp.js`, `viewer.html`, `apply_jefferson_notes.mjs`, `h1 words.json`, the Pulp Fiction study, the survey summary, prior-art file 3, and skill section 0.
57. Read in part: `camera.mjs` (constants, verb durations, the transition pass, visibility and word timings; not the accent and reveal code in detail), `compose_plaques.mjs` (the start of `composePlaques` and the gap and pad lines; not the three enumerators), `checks.mjs` (the check list and checks 13.1.5 to 13.1.12; not the landing checks or score terms in detail), `plan_words.mjs` (boundaries and clusters; not the grouping into stacks), and rulebook sections 1, 8, 11, 13, 14 and 15. The survey event log and prior-art files 7, 9, 10 and 11 were searched by keyword, not read through. The folder's `build_scene.mjs` is the older path-first builder and is not in the `build_best` pipeline.
58. Seen as images: five contact sheets I cut from the v12 render (frames 92 to 120, 166 to 194, 256 to 284, 470 to 498, 530 to 600), and the Pulp Fiction dense strips from 6 s and 11 s. Not viewed: the Pulp Fiction video itself, its three 4 fps contact sheets, the 16 s strip, and the reference-frame sheets in this folder. Pulp Fiction timestamps marked "log only" come from the survey log, which was made at 8 fps and 320 x 240 and flags its own doubts.
59. Summarised from data: scene v12 (plaque positions, word boxes, on frames, camera keys).
60. Not run: no build, no check, no render. Every frame number in section F is arithmetic from the onsets, and every eligibility claim about Clip A is a prediction from the v12 layout, which will shift when the pad and gaps change.
61. Guesses that need his one watch: all durations, the weights in items 35 and 36, the bands in item 37, the 40 degree readable angle, and whether `extrude` (stretched letters for 4 to 6 frames) is to his taste at all.
62. Known risks: staging is the most intricate part and limits `shove` and `uncover` to the plaques item 27.4 allows, so push and uncover will be the rarest families; tighter plaques may fail focus dominance (13.1.3) and wall of lines (13.1.4) more often and thin the survivors; `pivot_purity` is scored, not enforced, so a pivot with a third plaque in view can still read as a camera move.
