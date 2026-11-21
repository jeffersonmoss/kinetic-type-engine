# Build: Kinetic Type Engine step 5, song import

You are building in a git worktree of the Kinetic Type Engine repo at `~/Experiments/Kinetic Type Engine - Song Import Build` on branch `song-import` (from tag v0.9.0). Another builder is doing steps 2 to 4 on main at the same time, so stay inside `song/`, `cli/`, `bin/`, `fixtures/song-import/` and package.json script lines; do not edit `engine/`, `context/` or `check/`. If you need a type from step 4's context, define a minimal local interface and note it for the merge.

Build Section 8 step 5 (items 6, 97, 98, 114 and the step 5 done-test in item 128), honouring amendment 1 where it touches song data (tokens carry what the compiler needs to compute reading intervals later) and the ear-check persistence rules.

Room for One inputs (read-only; do not edit that repo):
- Suno alignment: `~/Experiments/Room for One Music Video/analysis/Suno lyric alignment.json`
- Display spellings and merges: `~/Experiments/Room for One Music Video/song.json`
- Current hand-built map for comparison: `~/Experiments/Room for One Music Video/analysis/Song map.json` and `Song map summary.md` (39 lines; hand fixes there: "Philly" moved to 154.865 s, the "One! Two! Three!" count-in split at estimated 118.50, 118.82, 119.12 s; both need an ear check, so they belong in ear-check.json as estimates).
- Audio: `~/Experiments/Room for One Music Video/audio/` (beats via the existing librosa approach in `~/.claude/skills/kinetic-type-music-video/scripts/build_song_map.py`; reuse its method; if librosa is unavailable to you, say so and leave beats as a documented follow-up rather than faking them).
Write ingest output for the test into your temp folder, not into the Room for One repo. Done-test numbers (39 lines, 319 tokens) come from the design; if the real data disagrees, report the real numbers and why rather than forcing them.

## Common rules
1. The design is `reviews/Engine Council Audit - 21 November 2026/6. Target Design v2.md` plus `8. Target Design v3 - Amendments to v2.md` (amendments replace the v2 items they name) plus the clarifications in `10. Consensus - 21 November 2026.md`. Read all three in full before writing code. Where the design is wrong or impossible, do not comply silently: document the evidence and your deviation in your report.
2. Never launch Chrome, Remotion render, or any browser. Use node, esbuild, tsc and react-dom/server only. List any browser check the main agent must run.
3. One git commit per numbered sub-step, with a clear message ending in the line `Co-Authored-By: Codex (gpt-6.2-sol) <noreply@openai.com>`. Run `npx tsc --noEmit` and `npm run -s validate:example` before each commit; both must pass.
4. Temp data goes in a folder under the system temp dir with prefix `kte-build-`, with a TEMP_README.md (owner, shared: no, purpose, date, until when), removed in a finally/trap. Delete only inside your own temp folder; list anything else you think should go in your report. Do not use `sed -i` (it leaves debris).
5. Do not touch `props/` or the finished films outside this repo. No drop shadows anywhere new.
6. Report: per step, what was built, the done-test evidence (commands and outputs), what failed or was skipped, deviations from the design, and open questions. Be honest in your response.
