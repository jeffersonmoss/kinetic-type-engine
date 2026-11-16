#!/usr/bin/env node
// Draw platform zones onto a still or video without altering the input.
import {spawnSync} from 'node:child_process';
const [input, output] = process.argv.slice(2);
if (!input || !output || input === output) {console.error('usage: node tools/overlay-zones.mjs INPUT OUTPUT'); process.exit(2);}
const filter = 'drawbox=x=0:y=0:w=iw:h=ih*0.08:color=red@0.25:t=fill,drawbox=x=iw*0.85:y=0:w=iw*0.15:h=ih:color=blue@0.25:t=fill,drawbox=x=0:y=ih*0.8:w=iw:h=ih*0.2:color=yellow@0.25:t=fill,drawbox=x=iw/15:y=ih*0.08:w=iw*(0.85-1/15):h=ih*0.72:color=white@0.9:t=2';
const r = spawnSync('ffmpeg', ['-hide_banner', '-nostdin', '-n', '-i', input, '-vf', filter, '-c:a', 'copy', output], {stdio: 'inherit'});
if (r.error) throw r.error; process.exit(r.status ?? 1);
