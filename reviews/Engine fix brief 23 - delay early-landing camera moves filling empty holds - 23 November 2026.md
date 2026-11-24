# Engine fix brief 23: delay early-landing camera moves into empty holds (23 November 2026)

Discovered during the first build of `!This Is Memphis (final)` Rough cut 1 (23 November 2026).

## Observed failure

`build_song.mjs` exited 1 on two identical 8-frame empty stretches (1 frame over the 7-frame / 0.25 s limit):
1. Frames `890-897` (29.67 to 29.90 s, Section 2 Chorus 1): `accent whip` `f887-893` leaves `MEMPHIS` and lands 5 frames before `w2010 WE` (`on: 898`, `t: 29.959 s`), leaving 3 whip frames + 5 dead black hold frames.
2. Frames `4631-4638` (154.37 to 154.60 s, Section 11 Final chorus): `accent whip` `f4628-4634` leaves `NO MYSTERY` and lands 5 frames before `w11007 THIS` (`on: 4639`, `t: 154.655 s`), leaving 3 whip frames + 5 dead black hold frames.

## Root cause

In `deterministic/composition.mjs` `fillEmptyFrames`:
- Try (1) cannot extend outgoing words because the camera already whipped off them.
- Try (2) attempts to move `w.on` to the first frame `run.start` where `inFrameShare > 0` (mid-whip sliver), which trips `partials() > basePartial` and rolls back.
- Try (3) only runs when `run.end - run.start < 3`.
- Try (4) requires `K4.f1 >= run.end`, whereas `K` landed at `run.end - 4`.
- Try (5) refuses to skip `K` because the incoming word is sung in the landed hold (`sungIn === true`).

## Fix

In `deterministic/composition.mjs` `fillEmptyFrames`, add Try (5b) right after Try (5) (so any song whose empty stretches already cleared in Tries 1 to 5 is completely unaffected):
1. When a non-cut camera move `K` starts before `run.start` and lands inside `[run.start, run.end]`, leaving an empty pre-word hold before the next visible content at `run.end + 1`, try shifting `K` later (`K.f0 += s`, `K.f1 += s`) for `s` from `Math.min(maxDelay, run.end + 1 - K.f1)` down to `1` (staying clear of the next camera move `Kn.f0` and respecting `until`), while keeping outgoing words visible on `K.f0 - 1` through the delayed departure.
2. Accept the first shift that passes `accept()` (fewer empty frames, no new overlap frames, no new partly shown focused words), adds no new static partly-on-screen words in the local window, and clears the long stretch (or shrinks it).
3. Also keep existing gates green (`test_stage_layers.mjs`, `build_song.mjs` exit 0 on This Is Memphis rough cut 1).
