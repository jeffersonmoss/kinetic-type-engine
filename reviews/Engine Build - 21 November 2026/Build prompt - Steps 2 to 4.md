# Build: Kinetic Type Engine steps 2 to 4

You are building in the Kinetic Type Engine repo (Remotion 4, TypeScript), on branch main. Step 1 is done: the working tree is committed and tagged v0.9.0.

Build Section 8 steps 2, 3 and 4 of the design, in order, each to its stated done-test:
- Step 2: golden harness (check/golden.mjs), 30-minute time box on SSR debugging with the stated fallback; record which path was used.
- Step 3: frame-core repairs 126.1 to 126.6, one commit each, plus 126.7 as a written investigation report (file and line; no fix unless trivially confirmed) saved to `reviews/Engine Build - 21 November 2026/Step 3 - smear and textLength investigation.md`.
- Step 4: context/, engine/scope.tsx and scoped (per amendment 3), format-relative limits, import-rule script, and done-tests (a) to (d). If SSR failed in step 2, say test (a) moves to the host in step 8.
Amendment 1 (one reading interval per sung token) affects the 0.5 visibility threshold in 126.5; implement 126.5 consistently with it where the frame core is concerned, and leave compiler-side interval logic for step 7.

## Common rules
1. The design is `reviews/Engine Council Audit - 21 November 2026/6. Target Design v2.md` plus `8. Target Design v3 - Amendments to v2.md` (amendments replace the v2 items they name) plus the clarifications in `10. Consensus - 21 November 2026.md`. Read all three in full before writing code. Where the design is wrong or impossible, do not comply silently: document the evidence and your deviation in your report.
2. Never launch Chrome, Remotion render, or any browser. Use node, esbuild, tsc and react-dom/server only. List any browser check the main agent must run.
3. One git commit per numbered sub-step, with a clear message ending in the line `Co-Authored-By: Codex (gpt-6.2-sol) <noreply@openai.com>`. Run `npx tsc --noEmit` and `npm run -s validate:example` before each commit; both must pass.
4. Temp data goes in a folder under the system temp dir with prefix `kte-build-`, with a TEMP_README.md (owner, shared: no, purpose, date, until when), removed in a finally/trap. Delete only inside your own temp folder; list anything else you think should go in your report. Do not use `sed -i` (it leaves debris).
5. Do not touch `props/` or the finished films outside this repo. No drop shadows anywhere new.
6. Report: per step, what was built, the done-test evidence (commands and outputs), what failed or was skipped, deviations from the design, and open questions. Be honest in your response.
