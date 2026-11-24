[PASTED BY JEFFERSON, drafted in T2 engine chat]

You are building a kinetic-typography lyric music video for one of my Suno songs, on my shared Kinetic Type Engine, from start to rough cut, in this T3 Code thread on Thing 2. I will tell you where the song is. After that, run the whole process yourself. I only review rough cuts and give notes.

## 1. Read first, in this order

1. `~/Experiments/Kinetic Type Engine/deterministic/KIT.md`: the engine manual. Section 0 (who does the work), section 2 (the per-song input folder), section 3 (commands), section 4 (checks), "## Type rules" (my approved rules, binding), and the dated engine-fix sections after it (what the engine already enforces).
2. `~/Experiments/Kinetic Type Engine/deterministic/rulebook/Rulebook final - Fable.md` and the two "Engine rule changes" files beside it.
3. `~/.claude/skills/kinetic-type-video/SKILL.md`: my video skill. Its top paragraph and sections 0 and 3 are current. Sections 1, 2, 4 and later describe an older score engine: skip them except where this prompt points to them.
4. `~/.claude/skills/kinetic-type-video/templates/Jefferson's standing feedback on kinetic type videos.md`: my own words on earlier videos. They are examples of my taste, not rules.
5. The style reference: `~/Experiments/Kinetic Type Engine/reviews/Pulp Fiction Study - 21 November 2026/` and `Pulp Fiction Motion Survey - 21 November 2026/`.
6. Worked examples, all on this engine: `~/Experiments/Room for One Music Video/engine input/` (finished and approved), `~/Experiments/Big Toothy Grins Music Video/` and `~/Experiments/Raise the Flagg Music Video/` (team anthems in progress: settings, palettes, team wordmarks, jersey font, keyword marks).

## 2. What I want

7. Words only: no props, figures or drawings unless I ask. Block capitals by default. The lyrics are the motion graphics: words slide, turn in 3D, push and grow out of earlier words, and the camera moves through them. Crisp motion: things clearly move or hold dead still, with no drift or wobble. Something is always on screen. Every sung word that is shown is shown whole and readable while it is sung.
8. Horizontal 16:9 at 1280x720 and 30 fps unless I say vertical. No vertical or short versions until I sign off the horizontal master.
9. Phonetic Suno spellings show as the real words. Suno ad-lib parentheses never show. Real team logos and wordmarks are fine. Ask me before using anyone's likeness.

## 3. The process

10. Workspace: `~/Experiments/<Song title> Music Video/`, a git repo (never /tmp). Copy the mp3 into `audio/`.
11. Word timings. If a Suno lyric alignment JSON comes with the song, save it as `analysis/Suno lyric alignment.json`. If not, and you have no Suno access, make one: transcribe with whisper-cli on Thing 2 (large-v3-turbo model) against the lyrics, then write it in exactly the format of `~/Experiments/Big Toothy Grins Music Video/analysis/Suno lyric alignment.json`. Spot-check one late verse line by ear (Whisper on a 5 to 6 s window) so the map does not drift.
12. Write `song.json` (format in the docstring of `~/.claude/skills/kinetic-type-video/scripts/build_song_map.py`), then run that script with a Python that has librosa (`~/Experiments/Buy This IPO Music Video/.venv/bin/python`) to make `analysis/Song map.json`.
13. `node "$HOME/Experiments/Kinetic Type Engine/deterministic/new_song_input.mjs" "<workspace>"`, then edit `engine input/` by hand as KIT.md section 3.1 says: real section cuts at phrase boundaries, the palette (team colours where the song has a team), timing corrections, sung repeats, player names, team wordmarks.
14. Build from `~/Experiments/Kinetic Type Engine/deterministic/`: `node build_song.mjs "<workspace>/engine input" --out "<workspace>/engine output/Rough cut 1 - <date with month as a word>"`. One build at a time per machine (the build lock queues it). Exit 0 is required; if a gate fails, fix the input or the engine and rebuild. Also run the Type rules check with `--out` into the run folder.
15. Render: the provenance file in the run folder ends with the exact `capture.mjs` command. Render in the background (it uses a throwaway Chrome profile and cleans it up), then mux the song audio with ffmpeg (`-map 0:v -map 1:a -c copy -shortest`). Name it `renders/<Song> - whole song rough cut 1 - horizontal - <date>.mp4`. If your shell cannot launch Chrome, stop and tell me rather than working around it.
16. Check your own cut before I see it: pull about 12 stills with ffmpeg at the hooks, the busiest verse and the ending, and look at them. Fix what is plainly wrong (a word cut off, empty frames, a wrong spelling) first.
17. When the rough cut is ready: run `bash ~/.claude/skills/sound-off/scripts/play-chime.sh` once, then open the video in QuickTime Player on Thing 2 (close any earlier cut of the same video first), and tell me the full path.
18. My notes come back as text. Turn each note into engine logic or song input, never a hand-patch of one frame, rebuild, render the next numbered rough cut under a new filename, and repeat.

## 4. Engine changes

19. If the song needs something the engine lacks, change the engine in `~/Experiments/Kinetic Type Engine/` on branch `world-canvas`: write a dated fix brief in `reviews/`, implement it, keep every existing gate passing, add a short dated process note to KIT.md, commit, and write a results file beside the brief. Never change the text under "## Type rules" in KIT.md without my word-for-word approval.
20. For side jobs (research, a font, a traced logo), start a sub-agent with T3 Code's `delegate_task` so it nests under this thread. Do not start new top-level threads.
21. After each engine commit, run `~/Experiments/Kinetic Type Engine Public Mirror/publish.sh`.

## 5. House rules

22. Delete files only with `~/.claude/scripts/safe_rm.py --by "<you>" --reason "<why>" <paths>`, and only your own temp files and superseded renders. Put temp work in the system temp folder with a `TEMP_README.md` and remove it when done.
23. Give new files readable descriptive names, with dates written with the month as a word.
24. Keep `reviews/Supervisor state - <Song>.md` in the workspace current: what is done, what is running, my notes and what you did with each.
25. Number every list you show me. No em-dashes in files you write.
26. Be honest in your reports: put failures, skipped steps and anything unchecked first. Be honest in your response, and correct anything you reported earlier that proves meaningfully wrong.

The song is:
