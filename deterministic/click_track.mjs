// Click track for the sung events the lyric map lacks (amendment 10, Fable 18, 22 November 2026). Generic.
// Writes the song with a click on every repeat and ad-lib event, so a listener can confirm the times by ear in a
// minute before any render. Each event is snapped to a vocal-stem onset within SNAP_S when a vocal stem is given;
// without one every event is marked unconfirmed (they are beat-grid estimates until heard).
// Usage (as a module): writeClickTrack({ events, songPath, outPath, stemPath? }) -> [{ text, t, status }]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const RATE = 44100, CLICK_S = 0.012, CLICK_HZ = 1800, SNAP_S = 0.06;

function wavPcm16(samples) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(RATE, 24); buf.writeUInt32LE(RATE * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  return buf;
}

// Onsets of a vocal stem: frames (10 ms) where the RMS rises by half again over the previous 50 ms.
function stemOnsets(stemPath) {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', stemPath, '-ac', '1', '-ar', String(RATE), '-f', 's16le', '-'], { maxBuffer: 1 << 30 });
  const n = raw.length / 2, hop = RATE / 100, rms = [];
  for (let i = 0; i + hop <= n; i += hop) { let s = 0; for (let j = 0; j < hop; j++) { const v = raw.readInt16LE((i + j) * 2) / 32768; s += v * v; } rms.push(Math.sqrt(s / hop)); }
  const on = [];
  for (let k = 5; k < rms.length; k++) { const prev = Math.max(...rms.slice(k - 5, k)); if (rms[k] > 0.02 && rms[k] > 1.5 * prev) on.push(k / 100); }
  return on;
}

export function writeClickTrack({ events, songPath, outPath, stemPath = null }) {
  const onsets = stemPath && fs.existsSync(stemPath) ? stemOnsets(stemPath) : null;
  const out = events.map(e => {
    if (!onsets) return { text: e.display ?? e.text, t: e.t, status: 'unconfirmed (no vocal stem)' };
    const near = onsets.reduce((b, o) => (Math.abs(o - e.t) < Math.abs(b - e.t) ? o : b), Infinity);
    return Math.abs(near - e.t) <= SNAP_S ? { text: e.display ?? e.text, t: +near.toFixed(3), status: `snapped ${((near - e.t) * 1000).toFixed(0)} ms` } : { text: e.display ?? e.text, t: e.t, status: 'unconfirmed (no stem onset within 60 ms)' };
  });
  const len = Math.ceil((Math.max(...out.map(e => e.t)) + 1) * RATE);
  const clicks = new Float32Array(len);
  for (const e of out) {
    const s0 = Math.round(e.t * RATE);
    for (let i = 0; i < CLICK_S * RATE && s0 + i < len; i++) clicks[s0 + i] += 0.8 * Math.sin(2 * Math.PI * CLICK_HZ * i / RATE) * (1 - i / (CLICK_S * RATE));
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'click-track-'));
  try {
    const clickWav = path.join(tmp, 'clicks.wav');
    fs.writeFileSync(clickWav, wavPcm16(clicks));
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', songPath, '-i', clickWav, '-filter_complex', '[0:a]aresample=44100,volume=0.6[a];[1:a]volume=1.0[b];[a][b]amix=inputs=2:duration=first:normalize=0', '-vn', '-ac', '2', '-c:a', 'aac', '-b:a', '160k', outPath]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return out;
}
