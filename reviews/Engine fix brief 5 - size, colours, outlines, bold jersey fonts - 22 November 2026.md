# Engine fix brief 5: size, colours, outlines, bold jersey fonts (22 November 2026)

Source: Jefferson's notes on Big Toothy Grins rough cut 5, relayed by the T2 lamelo chat. He said "don't ship it" and asked for these as engine rules: "So let's implement that simplified letter colors policy, the outline policy, the boldness for the fonts, and the size restrictions." Quoted phrases are his; everything else is the supervisor's framing. Build them as engine logic (not hand edits to the cut), then rebuild Big Toothy Grins as `engine output/Rough cut 6 - 22 November`.

Reference scene: rough cut 5, `~/Experiments/Big Toothy Grins Music Video/engine output/Rough cut 5 - 22 November/Whole song - final - scene.json`, at 41 s (HE TURNS / HE THROWS).

## 1. Size
His words: "We should either show a word big enough to be seen or not show it at all." Nothing tiny unless crowding forces it; "if there's room to make it larger, it should be large".
1. Measure from the scene the projected cap height of the larger HE at 41 s (the lamelo chat estimates about 40 px at 720, about 5.6% of frame height; measure, do not trust this estimate). Call it H_ref.
2. Crowded (space is the constraint): minimum projected size is H_ref.
3. Not crowded: minimum is 1.5 x H_ref. Where there is room, grow the word; his example: "just move over the big word, and you could still have plenty of margin padding while increasing the size of he".
4. A word that cannot meet its minimum is dropped (keyword-mode style) rather than shown small. The tiny sideways/mirrored second HE at the lower right at 41 s (about 24 px) is the example of what must not happen.
5. Define "crowded" yourself and document it in KIT.md; these numbers are a best guess, make them song settings with these defaults.

## 2. Colours
Text colours are cream and white, plus optionally a flat grey (about 75% or 50%) for deliberately low-contrast words. Team colours stay for team words as now.

## 3. Outlines
Grey words with a white outline read badly at smaller sizes ("harder to read and busy looking"). Default is the flat word style. Outlines only on team-colour words in a jersey font (team names or numerals in that font), and only if the font is bold. "Literally, only the largest words should be able to be gray with white outline." Pick and document a size threshold for "largest".

## 4. Bold jersey fonts
Jersey letters and numbers use a bold weight, in the ballpark of real jersey lettering thickness; many of our jersey fonts are too thin. His fix: offset the glyph outline outward (a stroke outside the letter, filled with the same colour), which makes the letter bolder rather than adding an inset outline. Keep the offset modest, since large offsets round the corners. Check the result visually against real jersey lettering (list the stills you want the supervisor to render; do not launch Chrome yourself). Account for the extra width in layout and overlap checks.

## 5. Dropped words are allowed (gate clarification, not new code)
"Every word does not have to be seen for the video to pass." Non-important words may be dropped for movement, composition, rhythm, room or speed. The YOU missing at 36.2 s is not a failure in itself. A word shown too small is the fault; dropping it is allowed. If any gate currently fails or reports a dropped non-focused word as a fault, align it with this; the partly-shown gate for words that ARE shown stays.

## Finish
Rebuild Big Toothy Grins rough cut 6 and re-join Room for One to confirm nothing regresses. All existing gates must still pass (overlap 0, partly shown 0, no empty stretch over 0.25 s, first and last frames non-empty, still ending). Update KIT.md and write `Engine fix brief 5 - results - 22 November 2026.md` with what changed, the measured H_ref, counts of words resized or dropped, and the stills/time ranges you want rendered for checking. Commit. Do not render. Delete only inside your own temp folder; list anything else you think should go in your report. Be honest in your response.

## Addendum (same evening): ON HOLD, do nothing for it
A proposed KIT.md item 26 text on dropped words and a change to the readable-size repair costs were added here by mistake: Jefferson has NOT approved that wording yet. Do not add that text to KIT.md and do not change those costs in this pass. If you already wrote either, leave it in place, mark it in KIT.md as "pending Jefferson's approval", and say so in your report. Sections 1 to 5 of this brief are unaffected.

## Change 2 (same evening): no outlines at all (replaces section 3, adjusts section 4)
Jefferson: "Let's keep all letters solid color and just not do outlines." No outline or stroke on any word, team words included.
1. A team-colour word gets its second team colour from a background block in the other team colour, not from an outline. WOLVES: drop the white stroke and green accent; keep navy letters on the lake blue block (or green on navy; builder's call).
2. Team names use the wordmark image; player names and jersey numbers use a bold jersey font.
3. Section 4's outward offset is a tool to use only if the available jersey fonts are not bold enough. He is unsure whether past thin letters came from the font or from our weight choice, so check that first (try the font's bold or black weight before offsetting).
4. Sections 1, 2 and 5 stand. KIT.md rule wording for this comes separately once he approves it; for now document the behaviour plainly.

## Change 3 (same evening): approved Type rules, word for word
Jefferson approved this wording ("I'm fine with all that wording"). Add it to KIT.md as a new section titled "Type rules", word for word, and make the engine follow it for everything built from here on:

1. Letter height is at least 8.4% of the frame height, or 5.6% where space is crowded. A word that won't fit at that size is dropped.
2. Only non-important words are dropped. A dropped word is reported, not failed.
3. Letters are one solid colour, with no outlines: cream, white, flat grey at 75% or 50%, or a team colour. A second team colour goes on the word's background block when a background or strong team identification is needed; a team colour with no background is an acceptable creative choice.
4. Player names and jersey numbers use a bold jersey font. Team names use the team's own wordmark in its own colours, downloaded or traced, as long as it looks close to the real one.

Notes:
1. 5.6% is the lamelo chat's measure of the larger HE at 41 s in rough cut 5; 8.4% is 1.5 times that. If your measurement differs, use the approved 5.6% and 8.4% anyway, and report your measured value in the results so he can decide.
2. This replaces sections 1 to 4 and Change 2 wherever they differ (for example: no outline at any size, so drop the 25%-height hollow-outline exception; only non-important words may be dropped, using keyword mode's ranking).
3. His instructions on work already done (condensed): don't throw away sections already built under the old rules; finish the job. Then list the sections that fail the new rules but passed the old ones (with the time ranges you'd want rendered as screenshots), and he will say which matter. Rebuild a section only after he says so. Concretely for this pass: finish the engine changes and the rough cut 6 build already in progress, but do not rebuild any other song's sections; run the new checks over Big Toothy Grins and Room for One and report the failing sections as that list.
4. The Addendum (dropped-words item 26 text and cost change) stays on hold; Type rule 2 now covers the dropping policy, so the readable-size repair should follow Type rules 1 and 2.

## Change 4 (same evening): which songs the Type-rule check covers
Jefferson: run the new rules only over songs not yet uploaded; for an uploaded song, "don't worry about it".
1. Check Big Toothy Grins (rough cut 6, once built) and Raise the Flagg (its latest built scene under `~/Experiments/Raise the Flagg Music Video/engine output/`; do not rebuild it).
2. Skip Room for One (already posted). Do not re-join or report on it for the Type rules; an engine-regression run on it is not needed this pass.
3. For each failure list: song, time range, what fails and why (which rule, measured values), and what a rebuild of that section would change. List the time ranges you want the supervisor to render as screenshots. He decides which are worth rebuilding.
4. Finish rough cut 6 as it is going.

## Change 5 (same evening): corrected numbers for Type rule 1
Jefferson approved ("Yes, send the right number"): letter height is at least 13.5% of frame height, or 9% where space is crowded, replacing 8.4% and 5.6% everywhere (KIT.md Type rules text, engine checks, rough cut 6, and the Raise the Flagg check list). The 5.6% was an unmeasured estimate; measured at full resolution, the larger HE in rough cut 5 at 40.6 s is 64 px tall (no outline) in a 720 px frame, about 9%; 13.5% is 1.5 times that. Letter height here means cap height of the solid letters. If your own measurement of that HE differs, report it. Already-built sections are still not thrown away unless he says so after seeing the list.
