// Entrance counts per section of a whole-song scene (Jefferson, 22 November 2026: pops should be at most about 15%).
// Usage: node entrance_counts.mjs <scene.json>   prints JSON { section: { total, pop, share, byPrim } }
import fs from 'node:fs';
export function entranceCounts(scene) {
  const secOf = new Map();
  (scene.meta.sections ?? [{ label: 'all', plaques: scene.plaques.map(p => p.id) }]).forEach(s => s.plaques.forEach(id => secOf.set(id, s.label)));
  const out = {};
  // Amendment 3 (all three reviewers): echoes pop into place, so they count as pops in the share.
  for (const w of scene.words.filter(x => !x.reveal_copy_of)) {
    const label = secOf.get(w.plaque) ?? 'unknown', prim = w.echo ? 'pop' : (w.joint?.prim ?? 'none');
    const r = (out[label] ??= { total: 0, pop: 0, byPrim: {} });
    if (prim === 'travel') { r.byPrim.travel = (r.byPrim.travel ?? 0) + 1; continue; }
    r.total++; if (prim === 'pop') r.pop++;
    const key = w.echo ? 'echo' : prim;
    r.byPrim[key] = (r.byPrim[key] ?? 0) + 1;
  }
  const all = { total: 0, pop: 0 };
  for (const r of Object.values(out)) { r.share = +(r.pop / Math.max(1, r.total)).toFixed(3); all.total += r.total; all.pop += r.pop; }
  out['Whole song'] = { ...all, share: +(all.pop / Math.max(1, all.total)).toFixed(3) };
  return out;
}
if (process.argv[1] && process.argv[1].endsWith('entrance_counts.mjs')) console.log(JSON.stringify(entranceCounts(JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))), null, 1));
