# Adversarial review and fixes: Kinetic Type Engine (Gemini Neon)

You are reviewing and then fixing the Kinetic Type Engine, a Remotion 4 / TypeScript engine for kinetic-typography lyric videos, in the current folder (a git repo). Review adversarially: assume there are bugs and waste, and hunt for them. Then implement the fixes you recommend.

Scope: the changes made today, `git diff 4d564cf..HEAD` (commits deae96a, 434c439, 6fcd10e, 3cf2317: `kte render --final`, score staging controls and timed ground fade, and the Pulp Fiction motion work: crisp camera holds, X/Y turns, Z dives, pushes, letter tumble, the new wobble and pop hard checks in `engine/validateCrisp.ts`, `effects/choreography.ts`). Read code those changes call or are called by when needed. Reports explaining the design are in `reviews/Engine Build - 21 November 2026/` and `reviews/Pulp Fiction Study - 21 November 2026/`.

Optimize for, in this order of weight:
1. Reliability and error handling: wrong results, crashes, silent failures, unchecked inputs, edge cases (empty or one-word lines, words at frame edges, overlapping sung timings, zero-length moves, 0 or 360 degree rolls, portrait format, last frame of the film, films without scansion or audio).
2. Output quality: anything that would render wrongly or contradict the owner's rules (each element either moving decisively or exactly still; no word appears or vanishes without a move, except a burst with fragments; no wobble; every sung word readable at its sung moment).
3. Code efficiency and system resources: per-frame work in render paths (allocation, repeated layout or measurement, O(n^2) loops over words or frames), validator run time, memory, render time.
4. Inference efficiency: places where builders (AI agents) must write long or repetitive score code that a helper or a default could shorten, and error messages that would make an agent guess.

Rules:
1. Keep behaviour for legacy films: `node check/golden.mjs` must still print "Matched 170 SSR frame hashes." Also keep `npx tsc --noEmit -p .` clean and `bin/kte check "/Users/jeffersonmoss/Experiments/Room for One Music Video/film"` at 0 errors. Do not run them yourself: you have no shell in this run. The supervisor runs all three after you finish and will send you any failures. You may read but must not edit `/Users/jeffersonmoss/Experiments/Room for One Music Video`.
2. Do not run any shell or terminal command at all (any attempt aborts this headless run). Use only your file read, search and edit tools. Reason carefully about types so tsc stays clean.
3. Do not commit or change git state. Leave your edits in the working tree.
4. Your temp folder already exists: /private/tmp/kte-neon-review (with its TEMP_README.md). Write scratch notes there with your file tools if needed. Delete only inside it; list anything else you think should go.
5. Write `reviews/Neon Adversarial Review - 21 November 2026/Report - review and fixes.md`: numbered findings (severity, file and line, the failure scenario, whether you fixed it and how), findings you chose not to fix and why, and which checks the supervisor should watch most closely. Be honest in your response.
6. Work only inside this folder (a git worktree on branch neon-review). Do not touch the main engine folder at /Users/jeffersonmoss/Experiments/Kinetic Type Engine.
