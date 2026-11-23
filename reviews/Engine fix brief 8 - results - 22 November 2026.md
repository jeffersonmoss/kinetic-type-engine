# Engine fix brief 8: results (22 November 2026)

Builder: the T2 engine chat (Claude, Opus 5.5). Nothing was rendered; the stills to check are in part 4. No section was rebuilt and no artwork file was touched.

## 1. Outcome first

1. Big Toothy Grins `engine output/Rough cut 6d - 22 November` was re-joined with `--skip-build` from 6c's sections (copied into the 6d folder). It exits 0: every gate passes, including overlap 0, partly shown 0, static partly on screen 0, no empty stretch over 0.25 s, still ending, and sync (0 late).
2. Type rules check on 6d: 22 failures, all rule 1. They are the same 22 words as in 6c. Dropped by necessity (reported, not failed): 7, down from 8, because IN at 170.4 s is no longer dropped.
3. Item 58 (Raise the Flagg, MAINE twice) is in its own commit, 76ff489. I tested it by re-joining Flagg rough cut 5's sections in my temp folder; Flagg itself was not built.
   1. w2005 MAINE (13.6 to 15.3 s): no slide makes it whole. It is hidden for its partly-on-screen span (frames 409 to 459) as a necessity drop and reported. The shown-whole report lists it as dropped (allowed).
   2. w10016 MAINE (124.1 to 125.2 s): slid along its line by 3 of its widths and is now whole at its onset.
   3. The static-partial gate and the empty-stretch gate now pass on that join. **The join still fails on two things rough cut 5 already failed on**, outside this item. Partly shown: w12041 MAVS-LOGO, 1 frame at 162.3 s. The reveal check fails at coverage 0.036. Cooper's rebuild will meet both.
   4. Side effect: RAISE (w8001, 90.2 s) is dropped by necessity, as it was in rough cut 5. My first version of the longer slide moved it partly into frame, then out of frame. A slide is now kept only if the word ends up whole at its onset.
   5. Candidate choice now sees the check (`13.1.21_static_partly_on_screen_focus`). It ranks candidates right after the shown-whole gate and never fails one by itself. Not tested on a real build: I was told not to build Flagg, and no section is to be rebuilt. On 6c's ten section scenes it took about 0.15 s per candidate (about 30 s per section at N 200) and found only CIRCLE and IN in Section 10.

## 2. Items 49 to 56 in 6d

1. **Item 49, CIRCLE alone:** fixed. IN (w10018) was dropped because a word entering past a clip plane was never slid. Clip words now slide across the plane's normal, up to 3 widths or heights. IN moves down its plaque by half its height and is whole at its onset. It had read 50% visible because the BIG/WOLVES panel (p1003) in front of it, with the 150-unit margin the check adds round panels, covered half its letters. WE (w10016) is still dropped for size. New report: stretches over 30 frames with one word alone are listed in the provenance, flagged when a word dropped by necessity was sung inside. 6d has 10 such stretches (WOLVES, the 43, PACK and others) and none is flagged.
2. **Item 50, HE sliver at 84.5 s:** two parts.
   1. The cause was mine. Brief 7's zoom floor raised HE's flip-in grow from x0.02 to x0.485, so HE sat half-unfolded for 4 frames. Zoom floors no longer apply to these flip-in (one-axis) grows, and HE unfolds again: 0.02, 0.29, 0.84, 0.99 of its width over 4 frames.
   2. New rule: a word drawn at under half its true width for its height (seen nearly edge-on) does not fill the frame. HE's first 2 frames now count as empty; with the empty frames before them that is a 5-frame stretch, under the 0.25 s limit.
3. **Item 51, swell release:** 5 swells were x2 or more.
   1. AND (23.2 s) now shrinks over 12 frames.
   2. IT'S (157.8 s) keeps its swelled size to its end.
   3. YOU (35.2 s), PACK (108.2 s) and THAT (109.3 s) still shrink straight back: every slower release added an overlap, a cut or an empty stretch.
4. **Item 52, sideways IN at 123.9 s:** hidden on frames 3716 to 3728. New rule: outside its focus window, a word of 2 letters or fewer that is turned sideways (60 to 120 degrees) and touches the frame edge is hidden.
5. **Item 53, the 43 reading as 88:** viewer only. Score digits now always sit on a dark navy panel (#0A0F1C), and unlit bulbs are darker (#24252B, was #2E2E30). A block colour, if the word has one, shows as a thin rim. Not seen until rendered.
6. **Item 54, grey largest word:** 5 words made cream: EVERY (132.2 s), OFF (136.5 s), OFF (161.0 s), OF (14.3 s) and ARE (33.9 s).
7. **Item 55, wordmark size:**
   1. An image wordmark is now measured by its letters: the image's fitted height times a letter share. The share comes from the song setting `letter_share`, else from the PNG's transparent margins, else 1. Small wordmarks are then grown.
   2. I set PORTLAND's `letter_share` to 0.714, measured from our SVG (letters 200 of 280 units). Its letters measured 13.3%, against Fable's estimate of 12%, and it was grown x1.05 to just over the 13.5% minimum. That is a small change; if he wants PORTLAND as big as the WOLVES moments, that needs a layout change.
   3. PORTLAND edge: song setting `colours.edge` is "#E03A3E", and the viewer draws a red edge round the black box. Settings and viewer only; the artwork files are untouched. Note: the newer imitation SVG and PNG files in `engine input/` from the lamelo chat were used as they stand. That swap is still held for Jefferson; I did not choose between versions.
8. **Item 56, white flash at 79.8 s:** DAY is hidden on frames 2395 and 2396, when the camera passes through it (letters 97% and 293% of the frame height). New rule: while the camera moves, a word whose letters pass 90% of the frame height, whose box covers over 90% of the frame, or which reaches behind the camera is hidden on those frames, except while it must still be shown whole.
   1. **Side effect, unverified:** the rule hides 146 such moments across the song, mostly 1 to 3 frames each, 300 frames in total. These are other camera push-throughs past words. At the 60% threshold I first tried, it was 223; I raised it to 90% to leave big words that still read mid-move. Please check a few whips in the render.

## 3. Not done

1. Section rebuilds (item 57: sections 2, 5, 6 and 9) and the artwork swaps: held for Jefferson.
2. Nothing rendered, so none of the viewer changes (score panel, PORTLAND edge) and none of the timing changes have been seen.
3. Item 58's candidate check is untested inside a real build (see 1.3.5).
4. The 22 rule 1 failures from 6c remain. Only section rebuilds clear them.

## 4. Stills to render (rough cut 6d)

1. 169.3 to 171.5 s: CIRCLE with IN beside it (item 49).
2. 84.3 to 85.0 s: HE unfolding (item 50).
3. 23.0 to 23.8 s (AND) and 157.6 to 158.6 s (IT'S): swell releases (item 51).
4. 123.7 to 124.4 s: sideways IN gone (item 52).
5. 48.9 to 50.0 s: the 43 on its dark panel (item 53).
6. 132.0 to 133.0 s and 136.4 to 136.7 s: EVERY and OFF in cream (item 54).
7. 129.3 to 130.1 s: PORTLAND, size and red edge (item 55).
8. 79.6 to 80.0 s: no white flash at DAY (item 56); also 16.4 to 16.6 s (HEAR YOU HOWL), 23.4 to 23.6 s (TOOTHY GRINS) and 35.3 to 35.5 s for the fly-through rule's side effect.
9. Flagg (Cooper's chat, after its rebuild): 13.5 to 15.4 s and 124.0 to 125.3 s for both MAINEs.

## 5. Files and cleanup

1. Engine: `composition.mjs`, `build_song.mjs`, `build_best.mjs`, `song_appearance.mjs`, `word_roles.mjs`, `viewer.html`, `KIT.md` (new "Engine fix brief 8" section; Type rules untouched).
2. Song input: Big Toothy Grins `engine input/song settings.json`, PORTLAND `letter_share` and `colours.edge`. The file is not in git.
3. Rough cut 6c is left in place. 6d holds copies of its sections. 6c could go once 6d is accepted; I have not deleted it.
4. My temp folder (the test joins and the Flagg test copy) is deleted.
