# Build: storyboard-driven features for Room for One (design step 9, first batch)

You are building in the Kinetic Type Engine repo on main. Steps 1 to 7 are done and committed. Read `git log v0.9.0..HEAD`, the step 6 and step 7 full reports in `reviews/Engine Build - 21 November 2026/`, and the design.

The Room for One storyboard (`~/Experiments/Room for One Music Video/storyboard/Storyboard v2.md`, Section 9 for the specs, and `reviews/Fable ruling on Astra - Storyboard v1.md` there) needs exactly three new features. Build them as typed, tested score and compiler features, following the design's rules (one reading interval per sung token, block-capital defaults, import rules):
1. `parts`: a line card may split its lead vocal into at most two phrases, each with its own from, place and enter, distinct landmarks, one protected interval per sung token. Acceptance shot: storyboard line 20 (EMBIID drawing two while FREE opens across the frame).
2. `ink`: per-word or per-row colour role assignment (call cream, reply gold, red accent) with the design's contrast checks.
3. A narrow `interlude`: echo-only, beat-timed rows for instrumental breaks (opening, year counter, ring stack, title), preserving landmark identity at the vocal handoffs. No general instrumental-scene editor.
Also check the storyboard's other claims against the code and report mismatches (for example whether `rise({dir})` travels far enough to read as travel, and the 9 registered legacy verbs it uses). Do not build the deferred or cut features.

Node tests only; list browser checks for the main agent. Git commits are blocked in your sandbox: write an ordered patch series that replays cleanly on the current HEAD to `reviews/Engine Build - 21 November 2026/Commit Series - Storyboard features.patch`, each commit passing tsc, the example validator and `node check/golden.mjs --self-test`. Full report to `reviews/Engine Build - 21 November 2026/Report - Storyboard features (Sol, full).md`.

## Common rules
1. The design is `reviews/Engine Council Audit - 21 November 2026/6. Target Design v2.md` plus `8. Target Design v3 - Amendments to v2.md` (amendments replace the v2 items they name) plus the clarifications in `10. Consensus - 21 November 2026.md`. Read all three in full before writing code. Where the design is wrong or impossible, do not comply silently: document the evidence and your deviation in your report.
2. Never launch Chrome, Remotion render, or any browser. Use node, esbuild, tsc and react-dom/server only. List any browser check the main agent must run.
3. One commit (in the patch series) per sub-step, with a clear message ending in the line `Co-Authored-By: Codex (gpt-6.2-sol) <noreply@openai.com>`. Run `npx tsc --noEmit` and `npm run -s validate:example` before each commit; both must pass.
4. Temp data goes in a folder under the system temp dir with prefix `kte-build-`, with a TEMP_README.md (owner, shared: no, purpose, date, until when), removed in a finally/trap. Delete only inside your own temp folder; list anything else you think should go in your report. Do not use `sed -i` (it leaves debris).
5. Do not touch `props/` or the finished films outside this repo. No drop shadows anywhere new.
6. Report: per step, what was built, the done-test evidence (commands and outputs), what failed or was skipped, deviations from the design, and open questions. Be honest in your response.
