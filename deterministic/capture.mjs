// Render the viewer frame by frame in headless Chrome (throwaway profile) and mux with the song.
// Usage: node capture.mjs scene.json out.mp4 [fps] [startSec] [endSec] [--blur on|off] [--audio song.mp3] [--swell] [--jobs N] [--timeout sec]
// Runs headless Chrome: run it outside any agent sandbox (the main agent renders).
// Brief 22 (23 November 2026): --jobs N (default 6, matching build_song.mjs; --jobs 1 keeps the serial path) splits
// the frame range into N contiguous slices, renders each in its own headless Chrome with its own throwaway profile
// and temp folder, encodes each slice with identical libx264 settings, and joins them via ffmpeg concat (-c:v copy).
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const rawArgs = process.argv.slice(2);
const VALUE_FLAGS = new Set(['--blur', '--audio', '--jobs', '--timeout']);
const BOOL_FLAGS = new Set(['--swell']);
const opts = {};
const positional = [];
for (let i = 0; i < rawArgs.length; i++) {
  const a = rawArgs[i];
  if (VALUE_FLAGS.has(a)) {
    if (i + 1 >= rawArgs.length) throw new Error(`${a} requires a value`);
    opts[a] = rawArgs[++i];
  } else if (BOOL_FLAGS.has(a)) {
    opts[a] = true;
  } else if (a.startsWith('--')) {
    throw new Error(`Unknown option: ${a}`);
  } else {
    positional.push(a);
  }
}

const [sceneFile, outFile, fpsArg, t0Arg, t1Arg] = positional;
if (!sceneFile || !outFile) {
  console.error('Usage: node capture.mjs scene.json out.mp4 [fps] [startSec] [endSec] [--blur on|off] [--audio song.mp3] [--swell] [--jobs N] [--timeout sec]');
  process.exit(2);
}

const blur = opts['--blur'] ?? 'on';
if (!['on', 'off'].includes(blur)) throw new Error('--blur must be on or off');
const jobs = opts['--jobs'] != null ? Number(opts['--jobs']) : 6;
if (!Number.isInteger(jobs) || jobs < 1) throw new Error(`--jobs must be an integer >= 1 (got ${opts['--jobs']})`);
const timeoutSec = opts['--timeout'] != null ? Number(opts['--timeout']) : 0;
if (!Number.isFinite(timeoutSec) || timeoutSec < 0) throw new Error(`--timeout must be >= 0 (got ${opts['--timeout']})`);

const scene = JSON.parse(fs.readFileSync(sceneFile, 'utf8'));
const fps = +(fpsArg || scene.meta?.fps || 30);
const t0 = +(t0Arg || 0);
const t1 = +(t1Arg || scene.end || (scene.meta.frames / scene.meta.fps));
const audio = opts['--audio'] ?? scene.meta.audio;
if (!audio || !fs.existsSync(audio)) throw new Error(`no song audio: pass --audio <file> or set meta.audio in the scene (got ${audio})`);

const PREFIX = 'path-first-capture-';
const tmpRoot = os.tmpdir();
const CHROME_BIN = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FFMPEG_BIN = '/opt/homebrew/bin/ffmpeg';
const VIDEO_TIMESCALE = String(Math.round(fps * 512));

// Remove stale leftovers from crashed runs (same prefix, no live owner process).
for (const d of fs.readdirSync(tmpRoot)) {
  if (!d.startsWith(PREFIX)) continue;
  const full = path.join(tmpRoot, d);
  const lock = path.join(full, 'pid');
  let alive = false;
  try {
    const pid = Number(fs.readFileSync(lock, 'utf8').trim());
    if (Number.isInteger(pid) && pid > 0) {
      process.kill(pid, 0);
      alive = true;
    }
  } catch {}
  if (!alive) {
    try { fs.rmSync(full, { recursive: true, force: true }); } catch {}
  }
}

const html = fs.readFileSync(path.join(here, 'viewer.html'), 'utf8')
  .replace('/*SCENE*/null', JSON.stringify(scene))
  .replace('/*INTERP*/', fs.readFileSync(path.join(here, 'interp.js'), 'utf8'))
  .replace('/*BLUR*/true', blur === 'on' ? 'true' : 'false')
  .replace('/*RIPPLE*/true', opts['--swell'] ? 'false' : 'true'); // Jefferson 22 Nov: ripple is the chosen chant echo; --swell for the old variant

const activeProcs = new Set();
const activeWs = new Set();
const tempDirs = new Set();
let cleaned = false;
let aborted = false;
let watchdog = null;

function makeTempDir(purpose) {
  const dir = fs.mkdtempSync(path.join(tmpRoot, PREFIX));
  tempDirs.add(dir);
  fs.writeFileSync(path.join(dir, 'pid'), String(process.pid));
  fs.writeFileSync(
    path.join(dir, 'TEMP_README.md'),
    `owner: capture.mjs (Kinetic Type Engine deterministic engine)\nshared: no\npurpose: ${purpose}\nmade: capture.mjs run on this Mac, ${new Date().toISOString()}\nneeded until: this capture run ends\ncostly to recreate: no\n`
  );
  return dir;
}

function trackProc(proc, isGroup = false) {
  const entry = { proc, isGroup };
  activeProcs.add(entry);
  proc.once('exit', () => activeProcs.delete(entry));
  proc.once('error', () => activeProcs.delete(entry));
  return proc;
}

function killEntry({ proc, isGroup }) {
  try {
    if (isGroup && process.platform !== 'win32' && proc.pid) process.kill(-proc.pid, 'SIGKILL');
    else proc.kill('SIGKILL');
  } catch {
    try { proc.kill('SIGKILL'); } catch {}
  }
}

function removeDirSync(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 12, retryDelay: 50 });
  } catch {}
}

function cleanup() {
  if (cleaned) return;
  cleaned = true;
  if (watchdog) { clearTimeout(watchdog); watchdog = null; }
  for (const ws of activeWs) {
    try { ws.close(); } catch {}
  }
  activeWs.clear();
  for (const entry of activeProcs) killEntry(entry);
  activeProcs.clear();
  for (const d of tempDirs) removeDirSync(d);
  tempDirs.clear();
}

function handleSignal(sig, code) {
  aborted = true;
  cleanup();
  process.exit(code);
}
process.on('SIGINT', () => handleSignal('SIGINT', 130));
process.on('SIGTERM', () => handleSignal('SIGTERM', 143));
process.on('exit', () => cleanup());

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(err => (err ? reject(err) : resolve(port)));
    });
  });
}

function runFfmpeg(args, label) {
  return new Promise((resolve, reject) => {
    const ff = trackProc(spawn(FFMPEG_BIN, args, { stdio: ['ignore', 'inherit', 'inherit'] }));
    ff.on('error', err => reject(new Error(`${label} failed to start: ${err.message}`)));
    ff.on('close', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} exit ${code ?? signal}`));
    });
  });
}

// Render frames [fStart, fEnd) in one dedicated Chrome instance + ffmpeg encoder.
// viewer.html renderAt(seconds) is purely stateless per frame (clears canvas, sets camera, word transforms,
// clip planes, opacity, ripples, blur sub-samples, backdrops, props and intro strictly from t), so slices
// require zero lead-in frames and reproduce serial frame times t0 + f / fps identically.
async function renderSlice({ fStart, fEnd, sliceOut, muxAudio, onFrame, label }) {
  const dir = makeTempDir(`throwaway Chrome profile and page for ${label}`);
  const page = path.join(dir, 'page.html');
  fs.writeFileSync(page, html);

  let chrome = null;
  let ff = null;
  let ws = null;
  try {
    const port = await freePort();
    chrome = trackProc(spawn(CHROME_BIN, [
      '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(dir, 'profile')}`,
      '--no-first-run', '--no-default-browser-check', '--window-size=1280,720', '--use-angle=metal',
      '--enable-unsafe-swiftshader', '--allow-file-access-from-files', '--hide-scrollbars', 'about:blank'
    ], { stdio: 'ignore', detached: process.platform !== 'win32' }), true);

    let tgt = null;
    for (let i = 0; i < 150 && !tgt; i++) {
      if (aborted) throw new Error('aborted');
      if (chrome.exitCode != null) throw new Error(`Chrome exited early (${chrome.exitCode}) for ${label}`);
      await new Promise(r => setTimeout(r, 150));
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        tgt = list.find(t => t.type === 'page');
      } catch {}
    }
    if (!tgt) throw new Error(`Chrome did not start for ${label}`);

    ws = new WebSocket(tgt.webSocketDebuggerUrl);
    activeWs.add(ws);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0;
    const pend = new Map();
    ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.id && pend.has(m.id)) {
        pend.get(m.id)(m);
        pend.delete(m.id);
      }
    };
    ws.onclose = () => {
      activeWs.delete(ws);
      for (const [, resolve] of pend) resolve({ error: { message: `WebSocket closed during ${label}` } });
      pend.clear();
    };
    const send = (method, params = {}) => new Promise((res, rej) => {
      if (aborted) return rej(new Error('aborted'));
      const i = ++id;
      pend.set(i, m => (m.error ? rej(new Error(m.error.message)) : res(m)));
      ws.send(JSON.stringify({ id: i, method, params }));
    });
    const ev = async expr => {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 800));
      return r.result?.result?.value;
    };

    await send('Runtime.enable');
    await send('Page.navigate', { url: 'file://' + page });
    for (let i = 0; i < 200; i++) {
      if (aborted) throw new Error('aborted');
      if (await ev('window.READY === true')) break;
      await new Promise(r => setTimeout(r, 100));
    }
    if (!(await ev('window.READY === true'))) {
      throw new Error(`viewer never became ready (${label}): ` + await ev('document.body.innerText.slice(0,300)'));
    }

    const ffArgs = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-'];
    if (muxAudio) {
      ffArgs.push(
        '-ss', String(t0), '-t', String(t1 - t0), '-i', audio,
        '-map', '0:v', '-map', '1:a',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium',
        '-c:a', 'aac', '-b:a', '192k', '-shortest', sliceOut
      );
    } else {
      ffArgs.push(
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium',
        '-video_track_timescale', VIDEO_TIMESCALE, '-an', sliceOut
      );
    }

    ff = trackProc(spawn(FFMPEG_BIN, ffArgs, { stdio: ['pipe', 'inherit', 'inherit'] }));
    const ffDone = new Promise((res, rej) => {
      ff.on('error', err => rej(new Error(`ffmpeg start error (${label}): ${err.message}`)));
      ff.on('close', (c, sig) => (c === 0 ? res() : rej(new Error(`ffmpeg exit ${c ?? sig} (${label})`))));
    });

    for (let f = fStart; f < fEnd; f++) {
      if (aborted) throw new Error('aborted');
      const url = await ev(`renderAt(${t0 + f / fps}), frameJPEG()`);
      const buf = Buffer.from(url.split(',')[1], 'base64');
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if (onFrame) onFrame(f);
    }
    ff.stdin.end();
    await ffDone;
    ff = null;
  } finally {
    if (ws) { try { ws.close(); } catch {} activeWs.delete(ws); }
    if (ff) { try { ff.kill('SIGKILL'); } catch {} }
    if (chrome) {
      const closed = chrome.exitCode != null
        ? Promise.resolve()
        : new Promise(res => {
            const t = setTimeout(res, 2000);
            chrome.once('close', () => { clearTimeout(t); res(); });
          });
      killEntry({ proc: chrome, isGroup: process.platform !== 'win32' });
      await closed;
    }
    removeDirSync(dir);
    tempDirs.delete(dir);
  }
}

const startedMs = Date.now();
const n = Math.round((t1 - t0) * fps);
if (!(n > 0)) throw new Error(`empty frame range: t0=${t0}, t1=${t1}, fps=${fps}`);
fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });

if (timeoutSec > 0) {
  watchdog = setTimeout(() => {
    aborted = true;
    console.error(`capture.mjs timed out after ${timeoutSec}s`);
    cleanup();
    process.exit(124);
  }, timeoutSec * 1000);
  watchdog.unref();
}

try {
  const workers = Math.min(jobs, n);
  if (workers === 1) {
    let done = 0;
    await renderSlice({
      fStart: 0,
      fEnd: n,
      sliceOut: outFile,
      muxAudio: true,
      label: 'serial capture',
      onFrame: f => {
        if (f % 150 === 0) process.stdout.write(`frame ${f}/${n}\n`);
        done++;
      },
    });
    const elapsedS = ((Date.now() - startedMs) / 1000).toFixed(2);
    console.log(`wrote ${outFile} (${done} frames, jobs=1, ${elapsedS}s)`);
  } else {
    const coordDir = makeTempDir(`parallel capture coordinator (${workers} slices)`);
    const slices = [];
    for (let i = 0; i < workers; i++) {
      const fStart = Math.floor((i * n) / workers);
      const fEnd = Math.floor(((i + 1) * n) / workers);
      if (fEnd > fStart) {
        slices.push({
          idx: i,
          fStart,
          fEnd,
          file: path.join(coordDir, `slice-${String(i).padStart(2, '0')}.mp4`),
        });
      }
    }
    console.log(`parallel capture: ${n} frames across ${slices.length} workers (${slices.map(s => `${s.fStart}..${s.fEnd - 1}`).join(', ')})`);

    let rendered = 0;
    let nextReport = 0;
    try {
      await Promise.all(slices.map(s => renderSlice({
        fStart: s.fStart,
        fEnd: s.fEnd,
        sliceOut: s.file,
        muxAudio: false,
        label: `slice ${s.idx + 1}/${slices.length} (frames ${s.fStart}-${s.fEnd - 1})`,
        onFrame: () => {
          rendered++;
          if (rendered >= nextReport || rendered === n) {
            process.stdout.write(`frame ${rendered}/${n}\n`);
            nextReport = Math.min(n, rendered + 150);
          }
        },
      })));
    } catch (err) {
      aborted = true;
      for (const entry of activeProcs) killEntry(entry);
      throw err;
    }

    const concatList = path.join(coordDir, 'concat.txt');
    const esc = p => p.replace(/'/g, "'\\''");
    fs.writeFileSync(concatList, slices.map(s => `file '${esc(s.file)}'`).join('\n') + '\n');

    await runFfmpeg([
      '-y', '-loglevel', 'error',
      '-f', 'concat', '-safe', '0', '-i', concatList,
      '-ss', String(t0), '-t', String(t1 - t0), '-i', audio,
      '-map', '0:v', '-map', '1:a',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', outFile
    ], 'ffmpeg concat+mux');

    const elapsedS = ((Date.now() - startedMs) / 1000).toFixed(2);
    console.log(`wrote ${outFile} (${n} frames, jobs=${slices.length}, ${elapsedS}s)`);
  }
} finally {
  cleanup();
}
