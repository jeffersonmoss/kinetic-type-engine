# Engine fix brief 9: results (23 November 2026)

Builder: the T2 engine chat (Claude, Opus 5.5). Nothing was rendered; the stills to check are in part 4. No section was rebuilt and the logo swap was not touched.

## 1. Outcome first

1. Big Toothy Grins `engine output/Rough cut 6e - 23 November` was re-joined with `--skip-build` from 6d's sections (copied into the 6e folder). It exits 0: every gate passes, including overlap 0, partly shown 0, static partly on screen 0, no empty stretch over 0.25 s, still ending, and sync (0 late).
2. Type rules check: 22 failures, all rule 1, the same 22 words as in 6c and 6d. Dropped by necessity (reported, not failed): 7, unchanged.
3. **The WOLVES regression is fixed.** WOLVES at 120.6 s slides out of frame again (frames 3615 to 3618: 96%, 79%, 47%, 9% in frame) and is not hidden.
4. **Item 27 is only partly done.** The near-empty check runs, but as a report and as a limit on hides, not as a failing gate. The lone WE at 120.67 to 121.07 s is still on screen and is now listed, not fixed (see 2.2).
5. Correction to my brief 8 results and reply: CIRCLE and IN show one after the other (169.6 to 171.3 s), not side by side. The brief 8 results file is corrected.

## 2. Items 26 to 29

1. **Item 26, fly-through only on a true pass-through.** A word is hidden only while the line of sight through the frame centre meets its box, the camera moves and the word itself is still. It must also either reach behind the camera's near plane, or have letters over 90% of the frame height with under half of them in frame. WOLVES failed the first test: the camera pivots past its edge, and it is 9% in frame at the side. Hides in 6e:
   1. DAY at frames 2395 to 2396 (79.83 to 79.9 s), the white flash.
   2. TODAY twice, at 154.0 to 154.2 s and 154.9 to 155.1 s. These two hides are new since 6d; I have not checked why the old rule missed them.
   Applied to the 6c scene, the new rule hides DAY alone.
2. **Item 27, a hide must not leave a near-empty stretch.** A lone word turned sideways (60 to 120 degrees) now counts as empty unless its letters reach 1.5 times the minimum (20% with room). My threshold is a guess.
   1. **What it does:** a fly-through hide that would leave such a stretch over 0.25 s is undone and reported. None was undone in 6e.
   2. **What it does not do:** it is not a failing gate. I tried it as one first, and the join failed on YOU at 11.30 to 11.57 s, a sideways 13.9% word alone. No fill could clear it; swelling YOU would push it past the frame edge. Six such stretches exist, none made by a hide; they are listed in the provenance report:
      1. 11.30 to 11.57 s
      2. 17.93 to 18.43 s
      3. 73.60 to 74.00 s
      4. 114.00 to 114.40 s
      5. 120.67 to 121.07 s (Fable's WE)
      6. 174.93 to 175.27 s
   3. Making them fail needs either section rebuilds (held) or a rule decision. This touches the open question on whether sideways words are measured by their on-screen height.
3. **Item 28, swells stay in frame.** A swell, and a slower swell release, is now kept only if the swelled word loses no in-frame share on any frame. AND (23.2 to 23.7 s) stays 100% in frame. It no longer gets the slow 12-frame release, which had run it off the left edge, and it shrinks straight back. IT'S (157.8 s) now settles at x1.83 instead of holding x3.34. YOU, PACK and THAT shrink straight back, as in 6d.
4. **Item 29, hide report.** Each fly-through hide now says whether it changes visible pixels (some of the word in frame and unoccluded on those frames). 6e: 3 hides, all 3 visible.
   1. Correction to my brief 8 numbers: 6d reported 146 hides (300 frames), and Fable counted about 12 visible. Most of the 146 were words beside the camera's path, out of frame or barely in frame. The new rule drops them.

## 3. Not done

1. Item 27 as a failing gate (see 2.2).
2. Section rebuilds and the logo swap: held for Jefferson.
3. Nothing rendered, so the WOLVES slide-out, DAY, TODAY and AND are unseen.
4. The 22 rule 1 failures remain; only section rebuilds clear them.

## 4. Stills to render (rough cut 6e)

1. 120.3 to 121.1 s: WOLVES sliding out, then WE alone (items 26 and 27).
2. 79.6 to 80.0 s: DAY, no white flash (item 26).
3. 153.9 to 155.2 s: TODAY's two hides (new).
4. 23.0 to 23.8 s: AND swelling, whole in frame (item 28).
5. 157.6 to 158.6 s: IT'S settling at x1.83.
6. 11.2 to 11.6 s: the sideways YOU alone (the case that blocks item 27 as a gate).

## 5. Files and cleanup

1. Engine: `composition.mjs`, `build_song.mjs`, `KIT.md` (brief 8 section updated; Type rules untouched).
2. Rough cuts 6c and 6d are left in place; 6e holds copies of 6d's sections. Older cuts could go once 6e is accepted; I have not deleted them.
3. My temp folder is deleted.
