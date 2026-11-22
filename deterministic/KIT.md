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
   9.6. Optional: `timing_corrections`, `sung_repeats`, `song_notes`, `picture_elements`, `vocal_stem` (snaps the click track to vocal onsets), `opening` ({label, scene, words, chosen}: an approved scene used as is instead of building the first lines), `display_numbers` ({"twenty-four": "24"}: number words shown as digits), `fps` (30), `seam_gap` (gap at the joins, as a share of the previous plaque's height; default 0.3), `read_tail_s` (0.5), `reveal_pull_s` (4), `reveal_hold_s` (3).
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
