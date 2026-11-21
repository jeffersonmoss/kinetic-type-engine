# Build: scansion in song import (Jefferson's request, 21 November 2026)

You are building in the Kinetic Type Engine repo on main. Read `git log v0.9.0..HEAD` and the reports in `reviews/Engine Build - 21 November 2026/` first (step 5 song import, step 7, storyboard features).

Jefferson asked that every video map the lyrics' scansion so accents and per-syllable motion land on the syllables the singer stresses. Build:
1. In `song/` and `kte ingest`: split each sung token into syllables with estimated onsets inside Suno's word times (proportional to vowel nuclei; keep the word's own start and end exact); mark dictionary stress (CMU pronouncing dictionary if available offline in the repo or the librosa Python env; otherwise a documented heuristic, never a network call at ingest time); flag syllables whose estimated onset is within a small tolerance of a beat or downbeat from the existing beat map; mark a line `uncertain` where these disagree.
2. An author-owned `film/analysis/scansion.json` (per token id: syllables, stress 0/1/2, sung-stress override, source, verified flag), written on first ingest and preserved on re-ingest exactly like `ear-check.json`; it may be seeded from a set-to-the-tune-of scansion template file if one is given with `--scansion <file>`.
3. Compiler hooks: an `onStress()` selector usable in `accents` (for example `beatPunch`) and a `cascade` `by: 'syllable'` that uses the stress-timed syllable onsets; `kte check` lists accents placed on unstressed syllables as warnings.
4. Tests: a fixture with known stress (for example "TWENTY-FOUR", "CHASING", "EMBIID"), the Room for One real-input ingest (`KTE_ROOM_FOR_ONE=~/Experiments/Room for One Music Video`) producing scansion for all 319 tokens, and re-ingest preserving a hand-edited entry.

Git commits are blocked in your sandbox: write an ordered patch series to `reviews/Engine Build - 21 November 2026/Commit Series - Scansion.patch` that replays cleanly on HEAD, each commit passing tsc, the example validator and `node check/golden.mjs --self-test`. Full report to `reviews/Engine Build - 21 November 2026/Report - Scansion (Sol, full).md`.

## Common rules
1. The design is `reviews/Engine Council Audit - 21 November 2026/6. Target Design v2.md` plus `8. Target Design v3 - Amendments to v2.md` (amendments replace the v2 items they name) plus the clarifications in `10. Consensus - 21 November 2026.md`. Read all three in full before writing code. Where the design is wrong or impossible, do not comply silently: document the evidence and your deviation in your report.
2. Never launch Chrome, Remotion render, or any browser. Use node, esbuild, tsc and react-dom/server only. List any browser check the main agent must run.
3. One commit (in the patch series) per sub-step, with a clear message ending in the line `Co-Authored-By: Codex (gpt-6.2-sol) <noreply@openai.com>`. Run `npx tsc --noEmit` and `npm run -s validate:example` before each commit; both must pass.
4. Temp data goes in a folder under the system temp dir with prefix `kte-build-`, with a TEMP_README.md (owner, shared: no, purpose, date, until when), removed in a finally/trap. Delete only inside your own temp folder; list anything else you think should go in your report. Do not use `sed -i` (it leaves debris).
5. Do not touch `props/` or the finished films outside this repo. No drop shadows anywhere new.
6. Report: per step, what was built, the done-test evidence (commands and outputs), what failed or was skipped, deviations from the design, and open questions. Be honest in your response.
