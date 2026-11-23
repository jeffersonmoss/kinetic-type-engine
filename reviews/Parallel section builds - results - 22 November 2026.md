# Parallel section builds: results (22 November 2026)

Builder: the T2 engine chat (Claude, Opus 5.5). Request: `Raise the Flagg Music Video/reviews/Engine feature request - parallel section builds - 22 November 2026.md`, plus Jefferson's addition of a machine-wide build lock. Nothing was rendered.

## 1. Outcome first

1. **Output is byte-identical** to a serial build. In a full Big Toothy Grins build (N 200, sections rebuilt), all 65 files match the old serial engine (commit c000216) at `--jobs 6` and at `--jobs 3`. The only difference is one line in the provenance report naming the engine's own folder (the serial run used a separate copy of the engine), and each run's own output path.
2. **At 6 jobs it was slower than serial on Thing 2.** Thing 2 is a fanless M1 MacBook Air (4 performance and 4 efficiency cores, 16 GB). Under 6 busy cores, kernel_task rose to about 128% CPU, a sign of thermal throttling, and single sections ran 2 to 5 times slower.

   | Run | Section builds | Whole build |
   |---|---|---|
   | Serial (old engine) | about 614 s | 692 s |
   | `--jobs 6` (the default) | 715 s | 855 s |
   | `--jobs 3` | 439 s | 521 s (25% faster than serial) |

   These are single runs while other chats were also busy on the machine (load average 36 to 160), so they are rough. The ordering was clear, though.
3. **The default stays at 6, as instructed.** On this machine I recommend 3 (see part 4).
4. **Splitting one section's candidates across workers was not built.** It would need build_best's candidate loop and winner selection split and merged. Given that 6 processes already throttle this machine, it would not help here.

## 2. What changed

1. `build_song.mjs`: section builds run as a pool of child processes, `--jobs N`, defaulting to 6, with `--jobs 1` for serial. I confirmed that nothing from one section's build feeds the next: each build_best reads only its own words file and window and writes only its own folder. "First section" is decided up front, as before. Results are joined in section order exactly as before. A section that fails stops the queue and fails the build.
2. `build_lock.mjs` (new): a machine-wide lock at `~/Experiments/Kinetic Type Engine/.build-lock` (git-ignored), holding the PID, song title and start time. Every build takes it, `--jobs 1` included.
   1. A second build prints `queued behind <song> (PID, started ...)` and waits, checking every 2 s.
   2. A lock whose PID is dead, or is not a node process (PID reuse), is cleared with a message.
   3. The lock is released on normal exit and on error.
   4. On Ctrl-C or SIGTERM while sections build, the child processes are killed and the lock is released (exit 130).
   5. On Ctrl-C during the join, the build stops at once (Node cannot run a handler during long synchronous work). Its lock is left naming a dead PID, and the next build clears it. That build prints the clearing, so the lock is not removed at the moment of Ctrl-C in this one phase.
   6. `KTE_BUILD_LOCK` overrides the path (used for the tests).
3. `KIT.md` documents `--jobs` and the lock.
4. Builds run from older engine copies (for example the Raise the Flagg chat's snapshot) do not take the lock until they use this engine.

## 3. Tests (all in my temp folder)

1. **Queueing:** build A (6 jobs) started. B (`--jobs 1`) started 3 s later, printed "queued behind Big Toothy Grins", and began only after A exited. A exited 1, from low-candidate gate failures at N 2 (expected), and the lock was still released. A and B outputs were identical.
2. **Stale lock:** a lock naming a dead PID was cleared, and so was one naming PID 1 (alive but not node). The build then ran.
3. **Ctrl-C during section builds:** 6 children were running. After SIGINT, 0 children remained, the lock was gone, and the exit code was 130.
4. **Ctrl-C during the join:** the process stopped within 1 s. The next build cleared the leftover lock.

## 4. Decision for Jefferson

At 6 jobs, this fanless MacBook Air throttles and builds take longer than serial. At 3 they are about 25% faster. Options:
1. Keep 6.
2. Make 3 the default on this machine.
3. Default to half the cores (4 here, 4 on an 8-core iMac) and time it.

## 5. Files and cleanup

1. Engine: `deterministic/build_song.mjs`, `deterministic/build_lock.mjs`, `deterministic/KIT.md`, `.gitignore`.
2. My test builds, the engine copy (git worktree) and logs were in my temp folder and are removed.
