#!/usr/bin/env node
// Two half-open ranges, centred 20 ms equal-power overlap. Times are song seconds.
import {spawnSync} from 'node:child_process';
const [input, output, preview, outText, inText] = process.argv.slice(2);
if (!input || !output || !preview || !outText || !inText || !Number.isFinite(+outText) || !Number.isFinite(+inText) || +outText < .01 || +inText <= +outText + .01 || new Set([input, output, preview]).size !== 3) {
  console.error('usage: node tools/splice-audio.mjs INPUT OUTPUT.wav PREVIEW.wav OUT_SECONDS IN_SECONDS'); process.exit(2);
}
const run = (args) => {const r = spawnSync('ffmpeg', ['-hide_banner', '-nostdin', '-n', ...args], {stdio: 'inherit'}); if (r.error) throw r.error; if (r.status !== 0) process.exit(r.status ?? 1);};
const end = (+outText + .02).toFixed(7), start = (+inText - .02).toFixed(7);
// The approved cut uses 20 ms before the incoming point and 20 ms after the outgoing point,
// then overlaps those 20 ms. Preserve that exact convention, including the first 10 ms of the join.
run(['-i', input, '-filter_complex', `[0:a]atrim=start=0:end=${end},asetpts=PTS-STARTPTS,aresample=48000[a];[0:a]atrim=start=${start},asetpts=PTS-STARTPTS,aresample=48000[b];[a][b]acrossfade=d=0.02:c1=qsin:c2=qsin[out]`, '-map', '[out]', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', output]);
run(['-ss', String(Math.max(0, +outText - 8)), '-i', output, '-t', '16', '-c:a', 'pcm_s16le', preview]);
