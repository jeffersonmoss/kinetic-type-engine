// Render the viewer frame by frame in headless Chrome (throwaway profile) and mux with the song.
// Usage: node capture.mjs scene.json out.mp4 [fps] [startSec] [endSec] [--blur on|off] [--audio song.mp3] [--swell]
// Runs headless Chrome: run it outside any agent sandbox (the main agent renders).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [sceneFile, outFile, fpsArg, t0Arg, t1Arg, ...options] = process.argv.slice(2);
const blurIndex = options.indexOf('--blur');
const blur = blurIndex < 0 ? 'on' : options[blurIndex + 1];
if (!['on', 'off'].includes(blur)) throw new Error('--blur must be on or off');
const fps = +(fpsArg || 30);
const scene = JSON.parse(fs.readFileSync(sceneFile, 'utf8'));
const t0 = +(t0Arg || 0), t1 = +(t1Arg || scene.end || (scene.meta.frames / scene.meta.fps));
// The song: --audio <file>, else the scene's meta.audio (build_song.mjs writes it from the song's song.json).
const audioIndex = options.indexOf('--audio');
const audio = audioIndex >= 0 ? options[audioIndex + 1] : scene.meta.audio;
if (!audio || !fs.existsSync(audio)) throw new Error(`no song audio: pass --audio <file> or set meta.audio in the scene (got ${audio})`);
const PREFIX = 'path-first-capture-';
const tmpRoot = os.tmpdir();

// remove stale leftovers from crashed runs
for (const d of fs.readdirSync(tmpRoot)) if (d.startsWith(PREFIX)) {
  const lock = path.join(tmpRoot, d, 'pid');
  let alive = false;
  try { process.kill(+fs.readFileSync(lock, 'utf8'), 0); alive = true; } catch {}
  if (!alive) fs.rmSync(path.join(tmpRoot, d), {recursive: true, force: true});
}
const tmp = fs.mkdtempSync(path.join(tmpRoot, PREFIX));
fs.writeFileSync(path.join(tmp, 'pid'), String(process.pid));
fs.writeFileSync(path.join(tmp, 'TEMP_README.md'), `owner: capture.mjs (Kinetic Type Engine deterministic engine)\nshared: no\npurpose: throwaway Chrome profile and page for frame capture\nmade: capture.mjs run on this Mac, ${new Date().toISOString()}\nneeded until: this capture run ends\ncostly to recreate: no\n`);
const html = fs.readFileSync(path.join(here, 'viewer.html'), 'utf8')
  .replace('/*SCENE*/null', JSON.stringify(scene))
  .replace('/*INTERP*/', fs.readFileSync(path.join(here, 'interp.js'), 'utf8'))
  .replace('/*BLUR*/true', blur === 'on' ? 'true' : 'false')
  .replace('/*RIPPLE*/true', process.argv.includes('--swell') ? 'false' : 'true'); // Jefferson 22 Nov: ripple is the chosen chant echo; --swell for the old variant
const page = path.join(tmp, 'page.html');
fs.writeFileSync(page, html);

let chrome, ff;
const cleanup = () => {
  try { chrome && chrome.kill('SIGKILL'); } catch {}
  try { ff && ff.kill('SIGKILL'); } catch {}
  fs.rmSync(tmp, {recursive: true, force: true});
};
process.on('SIGINT', () => { cleanup(); process.exit(130); });
process.on('SIGTERM', () => { cleanup(); process.exit(143); });

try {
  const port = 9300 + Math.floor(Math.random() * 400);
  chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(tmp, 'profile')}`,
    '--no-first-run', '--no-default-browser-check', '--window-size=1280,720', '--use-angle=metal',
    '--enable-unsafe-swiftshader', '--allow-file-access-from-files', '--hide-scrollbars', 'about:blank'], {stdio: 'ignore'});
  let tgt;
  for (let i = 0; i < 100 && !tgt; i++) {
    await new Promise(r => setTimeout(r, 150));
    try { tgt = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); } catch {}
  }
  if (!tgt) throw new Error('Chrome did not start');
  const ws = new WebSocket(tgt.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pend = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({id: i, method, params})); });
  const ev = async expr => {
    const r = await send('Runtime.evaluate', {expression: expr, awaitPromise: true, returnByValue: true});
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 800));
    return r.result?.result?.value;
  };
  await send('Runtime.enable');
  await send('Page.navigate', {url: 'file://' + page});
  for (let i = 0; i < 200; i++) { if (await ev('window.READY === true')) break; await new Promise(r => setTimeout(r, 100)); }
  if (!(await ev('window.READY === true'))) throw new Error('viewer never became ready: ' + await ev('document.body.innerText.slice(0,300)'));

  ff = spawn('/opt/homebrew/bin/ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
    '-ss', String(t0), '-t', String(t1 - t0), '-i', audio, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-crf', '18', '-preset', 'medium', '-c:a', 'aac', '-b:a', '192k', '-shortest', outFile], {stdio: ['pipe', 'inherit', 'inherit']});
  const n = Math.round((t1 - t0) * fps);
  for (let f = 0; f < n; f++) {
    const url = await ev(`renderAt(${t0 + f / fps}), frameJPEG()`);
    const buf = Buffer.from(url.split(',')[1], 'base64');
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (f % 150 === 0) process.stdout.write(`frame ${f}/${n}\n`);
  }
  ff.stdin.end();
  await new Promise((res, rej) => ff.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg exit ' + c))));
  ff = null;
  ws.close();
  console.log('wrote', outFile);
} finally {
  cleanup();
}
