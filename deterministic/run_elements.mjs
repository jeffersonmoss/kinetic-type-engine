// Apply a song's picture elements to a scene (generic runner, 22 November 2026; the mechanism is elements.mjs).
// The song's module (optional "picture elements.mjs" in its engine input folder) exports plan(scene, { findWord })
// and returns the element plan elements.mjs takes: { artDir, holdRevealUntil, elements, sets, timing }.
// Usage: node run_elements.mjs <picture elements module> <scene in> <scene out>
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import './interp.js';
import { applyElements, checkElements, findWord } from './elements.mjs';

const [modPath, inPath, outPath] = process.argv.slice(2);
if (!modPath || !inPath || !outPath) { console.error('usage: node run_elements.mjs <picture elements.mjs> <scene in> <scene out>'); process.exit(2); }
const mod = await import(pathToFileURL(path.resolve(modPath)).href);
const scene = JSON.parse(fs.readFileSync(inPath, 'utf8'));
const p = mod.plan(scene, { findWord });
const { scene: out, log } = applyElements(scene, p);
out.meta.picture_elements = { by: path.basename(modPath), timing: p.timing, log };
fs.writeFileSync(outPath, JSON.stringify(out));
const chk = checkElements(out);
console.log(log.join('\n'));
console.log('timing', JSON.stringify(p.timing));
for (const el of out.elements) console.log(el.id, 'slot', el.slot ? JSON.stringify(el.slot.read_screen) : '-', 'stats', JSON.stringify(chk.stats[el.id]));
console.log(chk.pass ? 'ELEMENT CHECKS PASS' : `ELEMENT CHECKS FAIL:\n  ${chk.failures.join('\n  ')}`);
