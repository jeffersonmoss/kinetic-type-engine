// Machine-wide build lock (Jefferson, 22 November 2026): every song build runs at full parallelism, and builds from
// different chats queue to run one at a time instead of sharing cores.
//   The lock is a file in a fixed place (~/Experiments/Kinetic Type Engine/.build-lock, git-ignored; KTE_BUILD_LOCK
//   overrides it for tests) holding the PID, song title and start time. A second build prints "queued behind <song>"
//   and waits. A lock whose PID is dead, or no longer a node process, is cleared. The lock is released on exit and error,
//   and on Ctrl-C or SIGTERM while section builds run (their child processes are killed first). Ctrl-C during the
//   synchronous join kills the build at once; its lock is then cleared as stale by the next build.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const LOCK_PATH = process.env.KTE_BUILD_LOCK ?? path.join(os.homedir(), 'Experiments', 'Kinetic Type Engine', '.build-lock');
const POLL_MS = 2000;
const children = new Set();
export const trackChild = c => { children.add(c); c.on('exit', () => children.delete(c)); return c; };

function holderAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); } catch (e) { if (e.code === 'ESRCH') return false; }
  try { return /\bnode\b/.test(execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' })); } catch { return false; }
}

function readLock() {
  try { return JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8')); } catch (e) {
    if (e.code === 'ENOENT') return null;
    // Half-written or unreadable: treat it as held unless it is old (a writer finishes in milliseconds).
    try { return Date.now() - fs.statSync(LOCK_PATH).mtimeMs > 10_000 ? { pid: -1, song: '(unreadable lock)' } : { pid: process.pid, song: '(being written)', pending: true }; } catch { return null; }
  }
}

let held = false;
function release() {
  if (!held) return;
  held = false;
  try { if (readLock()?.pid === process.pid) fs.unlinkSync(LOCK_PATH); } catch {}
}

export async function acquireBuildLock(song) {
  fs.mkdirSync(path.dirname(LOCK_PATH), { recursive: true });
  const body = JSON.stringify({ pid: process.pid, song, started: new Date().toISOString() }) + '\n';
  let announced = null;
  for (;;) {
    try {
      fs.writeFileSync(LOCK_PATH, body, { flag: 'wx' });
      held = true;
      break;
    } catch (e) { if (e.code !== 'EEXIST') throw e; }
    const cur = readLock();
    if (cur && !cur.pending && !holderAlive(cur.pid)) {
      console.log(`build lock: clearing a stale lock (PID ${cur.pid} is not a running node process, ${cur.song ?? 'unknown song'}${cur.started ? `, from ${cur.started}` : ''})`);
      try { fs.unlinkSync(LOCK_PATH); } catch {}
      continue;
    }
    const key = cur ? `${cur.pid}` : '';
    if (cur && !cur.pending && announced !== key) { console.log(`queued behind ${cur.song} (PID ${cur.pid}, started ${cur.started})`); announced = key; }
    await new Promise(r => setTimeout(r, POLL_MS));
  }
  if (announced) console.log('build lock: our turn');
  process.on('exit', release);
  for (const [sig, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) {
    const h = () => { for (const c of children) { try { c.kill('SIGTERM'); } catch {} } release(); process.exit(code); };
    handlers.push([sig, h]);
    process.on(sig, h);
  }
}

// Node runs a signal handler only when the event loop is free, so during long synchronous work (the join) a handler
// would hold Ctrl-C until the work ends. Before such work, give the signals back their default (kill at once); the lock
// file then names a dead PID and the next build clears it as stale.
const handlers = [];
export function defaultSignalsForSyncWork() { for (const [sig, h] of handlers.splice(0)) process.off(sig, h); }
