# Deterministic engine: kit

The deterministic engine builds a kinetic-type lyric video for one song as a 3D scene: every sung word is a block of type on a plaque, plaques attach to each other along one trail, and a planned camera flies the trail so each word is read when it is sung. Every choice comes from a seeded random stream (the seed is the song title), so the same input always gives the same scene. Each section is built 200 times with different salts, every candidate is checked against the rulebook, and the best passing one (or, when none passes, the least bad one) is kept. The sections are then joined into one whole-song scene, checked again as a whole, and rendered frame by frame in headless Chrome.

It was built for Room for One (LeBron Glaze) between 21 and 22 November 2026 in the prototype repo `~/Experiments/Room for One Music Video/prototype/Deterministic engine - h1 - word transitions 22 November/` (branch `word-transitions`, commit 4e2d2b0) and moved here, song-agnostic, on 22 November 2026. It lives beside the Remotion engine (`../engine`, `../KIT.md`) and shares nothing with it except the font metrics in `../fonts/`.

## 1. What is in this folder

1. Planning, in pipeline order: `plan_words.mjs` (words into clusters and shots, emphasis), `style.mjs` (palette styles per word), `compose_plaques.mjs` (one fitted plaque per shot), `plan_trail.mjs` (folds: how each plaque attaches to the last), `camera.mjs` (camera keys and visibility), `plan_joints.mjs` (attached word transitions: the entrance of each word), `primitives.mjs` (the entrance primitives), `rng.mjs` (seeded streams), `interp.js` (camera and word interpolation, shared with the viewer).
2. Checks: `checks.mjs` (per-section checks and score), `shown_gate.mjs` (the focused word is shown whole, with camera repair), `whole_song_checks.mjs` (sync and idleness on the joined scene), `entrance_counts.mjs` (pop share), `scene_probe.mjs`.
3. Builders: `build_best.mjs` (one section, best of N), `assemble_sections.mjs` (join sections, hide gone plaques, the reveal), `build_song.mjs` (the whole song from a song's input folder).
4. Post-passes: `apply_notes.mjs` (the song's colour rules, reveal copies, sung and beat pulses through `sung_pulses.mjs`), `run_elements.mjs` with `elements.mjs` (picture elements such as Room for One's hand and rings).
5. Output: `capture.mjs` and `viewer.html` (render), `click_track.mjs` (ear check of repeats and ad-libs), `provenance.mjs` and `debug_svg.mjs` (per-section reports and plaque sheets).
6. `new_song_input.mjs`: drafts a new song's input folder.
7. `palettes/`: `room for one.json` (the original) and `starter - two team colours.json` (template for a new song).
8. `rulebook/`: the rules (section 5).

Font metrics: `../fonts/room-for-one-variety.metrics.json` (fonts loaded by `viewer.html` from Google Fonts: Anton, Graduate, Barlow Condensed, Bebas Neue, League Gothic, Big Shoulders Display, Archivo Black, Saira Stencil One, Teko). `KTE_METRICS=<file>` overrides it.

Node 20 or later. No npm packages: the engine uses only Node built-ins. Rendering needs Google Chrome at `/Applications/Google Chrome.app` and ffmpeg.

## 2. The per-song input folder

Each song keeps its input in its own workspace, in `<song workspace>/engine input/`. Paths inside are relative to that folder.

9. `song settings.json` (required):
   9.1. `title`: seeds every random choice. Changing it changes every build.
   9.2. `audio`: the song mp3 (capture.mjs muxes it; the click track is made from it).
   9.3. `map`: the song map (`Song map.json`, from the kinetic-type-video skill's `scripts/build_song_map.py`): `duration_s`, `lines` [{id, text, start_s, end_s, words}], `words` [{text, start_s, end_s, line}], `beats` [{t, index, bar, beat_in_bar, energy}], and the rest of the skill's map.
   9.4. `palette`: palette file (section 2, item 13).
   9.5. `sections` [{n, name, lines: [first, last], seam?}]: the sections built one by one, cut at the song's own phrase boundaries. `seam: "cut"` makes the join into that section a hard cut.
   9.6. Optional: `fast_words` (keyword mode, ON by default; section "Keyword mode" below), `ending` ({reveal: true|false, hold: "<word>" | "last", min_hold_s: 0.5}; section "Endings" below), `timing_corrections`, `sung_repeats`, `song_notes`, `picture_elements`, `vocal_stem` (snaps the click track to vocal onsets), `opening` ({label, scene, words, chosen}: an approved scene used as is instead of building the first lines), `display_numbers` ({"twenty-four": "24"}: number words shown as digits), `fps` (30), `seam_gap` (gap at the joins, as a share of the previous plaque's height; default 0.3), `read_tail_s` (0.5), `reveal_pull_s` (4), `reveal_hold_s` (3).
10. `timing corrections.json`: `words` [{index, text, start_s, end_s}] (index into the map's words; text must match or the build stops) and `lines` [{id, start_s?, end_s?}].
11. `sung repeats.json`: `events` [{text, t, line, source, display?}]: chants, echoes and ad-libs the lyric map lacks. They become pulses on words already on screen, or echo words, and the click track.
12. `song notes.mjs` (optional): `export function applySongNotes(scene, log)`, run on the joined scene before the generic post-pass. Room for One's holds its colour rules (team colours only on the rings won with each team, 76ers stripes on KING!, the last RING! and 24) and its hook 1 chant pulses.
13. `palette.json`: `ground`, `panel`, `panel_side`, `styles` [{id, kind: block|fill|outline, colours: {background?, text}, role: hero|accent|plain|quiet, group, flat_fill?, outline_twin?, on_panel?}], `voices.adlib`, `pins` ({word id or text: style id}). Every text colour needs 3:1 contrast on its background, panel and ground (`style.mjs` checkPalette throws otherwise). Style ids that `viewer.html` does not know are drawn from these colours.
14. `picture elements.mjs` (optional): `export function plan(scene, { findWord })` returning the plan `elements.mjs` applies ({artDir, holdRevealUntil, elements, sets, timing}). See Room for One's for the hand and rings.

Room for One's input is the worked example: `~/Experiments/Room for One Music Video/engine input/`.

## 3. Commands

### 3.1. New song: draft the input

15. The workspace needs `song.json` and `analysis/Song map.json`, which the kinetic-type-video skill's first steps make from the Suno song: the Suno lyric alignment (Suno MCP `audio-lyrics-alignment`, saved as `analysis/Suno lyric alignment.json`), then `python3 ~/.claude/skills/kinetic-type-video/scripts/build_song_map.py` over it with the display spellings in `song.json`. Room for One also hand-corrected the alignment (`analysis/Suno lyric alignment - corrected for the song map.json`) and listened by ear and with Whisper (`analysis/Ear check by Whisper - 21 November 2026.md`).
16. Then:

```
node "/Users/jeffersonmoss/Experiments/Kinetic Type Engine/deterministic/new_song_input.mjs" "<song workspace>"
```

It writes `<song workspace>/engine input/` with `song settings.json` (title, audio, map, palette, number words shown as digits, and PROPOSED sections cut by length), a copy of the song map, empty timing corrections and sung repeats, and the starter palette. It refuses to overwrite an existing `song settings.json`.
17. Before building, by hand: re-cut and rename the sections at the song's phrase boundaries (verses, hooks, count-ins, outro); put the team colours in `palette.json`; add timing corrections and sung repeats heard by ear; read the map audit (words held over 3 s; the builder stretches a word whose closing punctuation is glued to the next line, see Room for One's `analysis/Song map summary.md` item 14).

### 3.2. Build

```
cd "/Users/jeffersonmoss/Experiments/Kinetic Type Engine/deterministic"
node build_song.mjs "<song workspace>/engine input" --out "<song workspace>/engine output/<run name>"
```

18. Options: `--N 200` (candidates per section), `--skip-build` (reuse the section builds already in the output folder), `--reveal-coverage 0.2` (least share of the last frame the reveal layout aims to cover; the reveal check itself always asks for 20%).
19. Time: Room for One's 8 sections at N 200 take roughly 8 minutes on Thing 2. It needs no browser, so it runs inside an agent sandbox.
20. Output: one folder per section (scene, build log, provenance, plaque sheets), `sections/` (the words files), `Whole song - scene.json` (joined), `Whole song - notes - scene.json`, `Whole song - final - scene.json` (THE SCENE TO RENDER), `Whole song - sung words.json`, the click track, and `Whole song - provenance and flags.md`.
21. Exit code 1 when a whole-song check fails (sync, idleness, a partly shown focused word, the reveal coverage or safety). The scene is still written; the provenance file says which check failed.

### 3.3. Render (main agent only, outside any sandbox)

```
node "/Users/jeffersonmoss/Experiments/Kinetic Type Engine/deterministic/capture.mjs" "<output>/Whole song - final - scene.json" "<out>.mp4" 30 0 <song seconds> --blur on
```

22. It runs headless Chrome with a throwaway profile in the system temp folder (prefix `path-first-capture-`, removed on exit, stale ones removed at start) and muxes the song from the scene's `meta.audio` (or `--audio <file>`). Subagents and Codex sandboxes must never run it: Chrome aborts there. The provenance file ends with the exact command for its scene.
23. Options: `--blur on|off` (motion blur), `--swell` (the old swell variant of chant echoes instead of the ripple). A clip: pass start and end seconds.

## 4. Checks and the provenance report

24. Per section (`checks.mjs`, rulebook sections 13 and the rule changes): reading time, speed caps, overlaps, sync of each word to its onset, the shown-whole gate, entrance caps, and more. A candidate passes when no check fails. When none of the N passes, the severity fallback ranks them: fewest partly shown focused words, then the smallest worst single reading loss (named in the report), then severity, then score.
25. Whole song (`build_song.mjs`):
   25.1. Shown whole: the joined scene is swept with the camera repair; the focused word must never be partly shown at its onset (Jefferson's absolute rule). Words wholly out of frame are dropped and listed.
   25.2. Sync: no word late; lyric words dropped are listed.
   25.3. Idleness: no stretch over 2 s with sung events and no visible activity using them.
   25.4. Entrances: count and pop share (echoes count as pops).
   25.5. Reveal: at least 20% of the last frame covered, no dropped chains, and no plaque teleporting into its compacted place.
   25.6. Picture elements: each element's own checks.
26. Everything that fails is listed loudly in `Whole song - provenance and flags.md`, with the chosen candidate per section, seams, sweep repairs, dropped words, pulses and echoes, the map audit and the click track list. Only Jefferson's own absolutes are absolute (the focused word is never shown only partly); everything else is a strong default whose every exception is reported.

## 5. The rules

27. `rulebook/Rulebook final - Fable.md`: the base system (words, clusters, shots, emphasis, plaques, folds, the trail, camera, visibility, style, checks and score, the reveal, the parameter table).
28. `rulebook/Fable spec - attached word transitions.md`: the entrance of each word (attached transitions, primitives, pops).
29. `rulebook/Engine rule changes - rough cut 2 notes - 22 November 2026.md`: changes 1 to 17 from Jefferson's rough cut notes (animated entrances by default with pops rationed, sync windows, echoes, the reveal shape, the shown-whole gate, idleness gate, readability gate, primitive caps, rail-only off-frame entry, pivot pickups, fallback ranking, click track), and amendments 12 to 16.
30. `rulebook/Opus build report - attached word transitions.md`: how the transitions were built and checked.
31. The rest of the rulebook's history (drafts, briefs, reference frames, run logs) stays in `~/Experiments/Room for One Music Video/prototype/Deterministic rulebook - 22 November 2026/`.

## 6. Click track

32. Every sung repeat and ad-lib (the events in `sung repeats.json`) is clicked over the song in `Whole song - repeats and ad-libs click track.m4a`, so a listener can check the times in a minute before any render. With `vocal_stem` set, each event snaps to a vocal onset within 60 ms ("snapped"); otherwise all are "unconfirmed" beat-grid estimates until heard.

## 7. Known weaknesses (Room for One, 22 November 2026)

33. Severity fallback in 6 of 8 built sections: no candidate of 200 passed every check, so the least bad was used (sections 2 to 7; 8 and 9 passed). Their remaining failures are in the provenance file.
34. Pop share 26.1% (82 of 314 entrances, echoes included). Most pops are "no animated entrance fits" (51).
35. Reveal coverage floor: the compacted reveal of all 82 plaques covers 10.1% of the last frame, under the 20% reveal check, which therefore FAILS (and the build exits 1). Room for One built with `--reveal-coverage 0.05` so the reveal shows the whole tail rather than a closer view of fewer plaques; the failure is reported, not hidden.
36. Sung repeats are beat-grid estimates (all 36 of Room for One's unconfirmed) until heard or snapped to a vocal stem.
37. `viewer.html`'s style table still carries Room for One's team ids (heat, cavs, lakers, sixers, the heat flame gradient); other songs' styles come from their palette and draw plain colours only (no gradient; per-character stripes only when the song notes set `stripes`). `style.mjs` falls back to the palette's first accent outline and to `cream` and `cream-outline` when present.
38. Map quirks pass through: a word whose punctuation is glued to the next line gets a stretched end; long held words are only listed (map audit), not fixed.
39. The prototype's `test_rules.mjs` was not moved (it tests against the prototype's demo outputs).

## 7b. Parity with the prototype

Rebuilt from `~/Experiments/Room for One Music Video/engine input/` on 22 November 2026 into `~/Experiments/Room for One Music Video/engine output/Parity check - 22 November 2026/` (N 200, `--reveal-coverage 0.05`): the final scene's words, plaques, camera keys and picture elements are identical to the prototype's commit 4e2d2b0 (only meta notes differ), and the provenance numbers match: 0 partly shown, 2 dropped (FROM, THREE!), 0 late, 0 idle, 8 echoes, 314 entrances with 82 pops (26.1%), 10 instrumental beat pulses, reveal 82 of 82 plaques at 10.1% (FAIL against 20%), element check FAIL on the imagined 76ers ring (10 readable frames).

## 8. Finishing workflow

40. Full render at 720p (section 3.3) into the song folder, under a new filename each time; never replace a video Jefferson is watching.
41. Dashboard: the song must have an entry in `/Users/jeffersonmoss/Documents/GoogleDrive/CODEX PROJECTS/YouTube Uploader/video_catalog.json` (owner chat, formats, paths); the song-release skill describes the formats and file names (`<Title> - FULL VIDEO 16x9.mp4` in the song folder's `YouTube upload/`) and `set_status.py`.
42. Vertical full-length cut: rotate the horizontal master 90 degrees clockwise:

```
ffmpeg -i "<Title> - FULL VIDEO 16x9.mp4" -vf transpose=1 -c:a copy "<Title> - FULL VERTICAL.mp4"
```

43. Approval: only Jefferson approves, in the dashboard or in a chat. When he approves in a chat, record it so the final moves to `~/Experiments/Completed Renders` and older renders are cleaned up:

```
~/.venvs/youtube-uploader/bin/python "/Users/jeffersonmoss/Documents/GoogleDrive/CODEX PROJECTS/YouTube Uploader/approve_cut.py" <song id> <format id> --his-words "<his words>"
```

44. Cleanup: delete renders, temp folders and test outputs only through `~/.claude/scripts/safe_rm.py --by "<who>" --reason "<why>" PATH...` (7-day undo). Keep the final master, the input folder and the provenance file.

## Keyword mode for fast words (22 November 2026)

- On by default for every song (Jefferson: "If it's a problem, it's a problem"). Where the lyric is sung too fast to read, only the important words are placed; the rest are left out of the scene, the sync check and the sung pulses, and listed in the provenance file ("Keyword mode") with every stretch's start, end and peak rate.
- Turn it off per song with `"fast_words": {"mode": "all_words"}` (or `"enabled": false`), or for one build with `build_song.mjs --all-words`. Off, the build is identical to a build without the feature.
- Detection (`keywords.mjs`): a word's rate is the number of words starting within `window_s` (2.0 s) centred on it, divided by `window_s`. A stretch starts at the first word over `rate_on` (4.5 words per second) and runs while the rate stays at or above `rate_off` (3.5). Stretches shorter than `min_stretch_s` (1.5 s) are ignored.
- Kept: names and nicknames (written in capitals, or capitalised mid-sentence somewhere in the song, plus team wordmark names, display numbers and palette pins), numbers, the rhyme word at each line end, other content words, and `keep`. Dropped: function words (articles, pronouns, auxiliaries, prepositions, conjunctions and their contractions; `keywords.mjs` FUNCTION_WORDS) plus `drop`. Kept words start at least `min_gap_s` (0.40 s) apart; in a clash the higher rank stays (name or number, then rhyme word, then the rest; ties keep the earlier). Every line keeps at least one word. An approved opening scene is never thinned.
- Overrides: `rate_on`, `rate_off`, `window_s`, `min_stretch_s`, `min_gap_s`, `keep` [words], `drop` [words].
- Unit check: `node --test test_keywords.mjs`.

## Endings, readable size and composition (engine fix brief 3, 22 November 2026)

- `ending.reveal: false` switches the final pull-back off: the song ends on `ending.hold` (a word's text, its last sung occurrence, or `"last"`), held still from the moment it comes to rest to the last frame. Big Toothy Grins ends on its last WOLVES wordmark. With the reveal on (the default; Room for One), the reveal starts early enough to land and hold still for `ending.min_hold_s` (0.5 s) before the end, and the pull-back stops at the `--reveal-coverage` floor, centred on the layout, instead of shrinking the whole layout to a strand.
- Never end mid-move: the build fails (exit 1) when the camera moves in the last `min_hold_s` or a shown word is moving on the last frame.
- Readable size (reported and ranked, not a hard gate): a sung word's letters should reach 10% of the frame height by onset + 3 frames. A word under that, which only grows once the camera arrives (1.5 times its onset size within a second) or is under 4% outright, is a speck. The repair lands the arriving move earlier or makes it shorter, else reframes the hold; each change is kept only when it lowers the cost (partly shown 1000, dropped 10, speck or sparse 5). Riders that are small by design in their own framing are not specks.
- Sparse frame: two consecutive words both under 12% letter height, more than a third of the frame apart, with no anchor word (15% or more) whole in view. Specks and sparse frames rank section candidates right after the shown-whole gate (`13.1.20_readable_size_and_sparse_frames`); they do not by themselves fail a candidate.
- Line groups retire together: when the overlap repair retires a word, the other words of its plaque that are past their reading moment go at the same frame, so a punchline never leaves before its neighbours.
- Lone focus words (`composition.mjs` tightenLone): a sung word alone in its hold, with no other word whole in frame, is centred and brought in until its letters are 22% of the frame height (within 80% of the frame width), when the gates and the local overlap count stay as good.
- Edge clutter (`hideEdgeClutter`): during a camera hold, a word outside its focus window (its appearance through onset + 15 frames) that is less than half in frame is hidden for that hold and restored after it.
- Wordmark images are resampled once, at high quality. A 710 px wide source is drawn at about 1.7 times its size in the word texture, so its edges soften at 720p; a sharper wordmark needs a source at least about 1,300 px wide, or an SVG.

## Moving openings and team wordmarks

- `intro` in `song settings.json` is a list of `{image, hold_s, dissolve_s?, dissolve_at_s?, exit?}`. Image paths are relative to the song input. The first starts on frame zero. Each next image begins its dissolve after the preceding minimum hold. Set `dissolve_at_s` to delay that dissolve to an absolute song time. The last image ends at vocal onset. Give the last image a positive hold and omit its dissolve. All images share one motion path: a steady push (`intro_push_per_s`, default 0.045, about 21% scale change over a 4.4 s hold) and a linear drift (`intro_drift`, default 0.06 of the frame width), with no easing or wobble. Each PNG is sized and centred on its opaque content (alpha bounds, `png_alpha.mjs`), not its canvas, so a badge with a transparent margin lands exactly over the previous badge during a dissolve and the motion carries on through it. The last image cuts at the first vocal by default. Set `exit: "slide"` for a lateral exit. PNG, JPEG, WebP and SVG assets are embedded in the final scene. With a pre-vocal gap and no images, the song title fills it. Up to one second of opening blank is allowed to accommodate a short pickup.
- `team_wordmarks` maps individual team names and nicknames to `{image?, font?, colours}`. Matching ignores case and surrounding punctuation, and covers lyric words, sung echoes and reveal copies.
  - `image` (preferred when the team's lettering exists only as artwork): a local PNG, JPEG, WebP or SVG, ideally the official wordmark on a transparent background. The word is drawn as that image, aspect ratio kept, fitted inside the planned word box (94% of its width, 90% of its height) where the lettering would be. Colours: `tint` recolours the image through its alpha (omit it to keep the artwork's own colours); `stroke` draws an outline around the letters' silhouette and `accent` a second, outer outline; `background` fills the word's block. Big Toothy Grins' WOLVES uses the navy jersey lettering with a white stroke, an aurora green accent and a lake blue block.
  - `font`: a local TTF, OTF, WOFF or WOFF2, used when no image is given. Colours may specify `text`, `stroke` and `background`. The viewer fits supplied faces to the planned word box.
  - Neither: the existing lettering is kept with the supplied colours. The provenance file lists every entry as IMAGE, FONT or NEITHER, then a one-line summary of which team words used which.
- The final joined scene is repaired for both whole-scene rules together (`overlap_gate.mjs` `repairShownAndOverlap`): the shown-whole repair and the overlap repair alternate until neither changes anything, so a camera repair cannot leave an overlap and an overlap retirement cannot leave a focused word partly shown. The shown-whole repair can also reframe the opening hold (before the first camera key) and delay a short camera move whole when the focused word would otherwise leave the frame too soon.
- Section selection ranks candidates in tiers: focused words whole and no projected overlap, then focused words whole, then the rest by fewest partly shown words. Overlap never outranks the shown-whole rule, because the joined repair can still clear overlaps. Each candidate's shown-whole result is re-judged after its own overlap repair.
- The projected overlap gate scans the lyric sequence before the pullback. It uses clipped word texture rectangles as a conservative ink envelope and checks projected panel obstruction. It may retire old words and plaques. The selector uses overlap-free variants whenever any exist. Remaining overlaps fail the whole-song build and are listed with times and words. Candidate check frequencies count how many candidates failed each check.
