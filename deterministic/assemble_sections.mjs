// Whole-song assembly from section scenes (Fable's rule audit ruling, 22 November 2026, B14, B24, B25, D31, D36 to D42).
// Generic: nothing here knows about any particular song. Each section is built on its own (build_best.mjs) in its own
// world frame; assembly renames its ids, turns and moves it rigidly so its first plaque continues on from the previous
// section's last plaque (same heading, one gap to the right), joins the cameras with a short sweep (or a cut when there
// is no room), hides earlier plaques once they are wholly out of frame (never plaque i or i-1 of the current shot), and
// builds one reveal at the end over the longest conflict-free tail of the real trail (ruling 42.2; the re-fold of 38.2
// is not built).
import './interp.js';

const add = (a, b) => a.map((x, i) => x + b[i]);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const mul = (a, k) => a.map(x => x * k);
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const mat = (R, U, N) => [R, U, N]; // rows are the frame's axes
const apply = (M, v) => [0, 1, 2].map(i => M[0][i] * v[0] + M[1][i] * v[1] + M[2][i] * v[2]); // v in the frame's coords -> world
const toLocal = (M, v) => [dot(M[0], v), dot(M[1], v), dot(M[2], v)];

const POINT_KEYS = new Set(['C', 'target', 'P', 'position']);
const DIR_KEYS = new Set(['R', 'U', 'N', 'axis', 'n', 'flipAxis', 'v']);
const isVec = a => Array.isArray(a) && a.length === 3 && a.every(x => typeof x === 'number');

// Rigid motion: p -> T + B_to(B_from^-1 (p - O)); directions turn the same way.
export function rigidTransform(scene, from, to) {
  // Snapshot both frames first: `from` is usually one of the scene's own plaques, which this walk moves. (Bug fixed
  // 22 November 2026: without the copy, every plaque after the first one was moved by a half-updated frame, scattering
  // each section's trail across about 100,000 units and leaving the reveal a speck.)
  from = structuredClone({ C: from.C, R: from.R, U: from.U, N: from.N });
  to = structuredClone({ C: to.C, R: to.R, U: to.U, N: to.N });
  const Mf = mat(from.R, from.U, from.N), Mt = mat(to.R, to.U, to.N);
  const dir = v => apply(Mt, toLocal(Mf, v));
  const pt = p => add(to.C, dir(sub(p, from.C)));
  const walk = (o, parentKind) => {
    if (Array.isArray(o)) { o.forEach(x => walk(x, parentKind)); return; }
    if (!o || typeof o !== 'object') return;
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (isVec(v)) {
        if (POINT_KEYS.has(k)) o[k] = pt(v);
        else if (DIR_KEYS.has(k)) o[k] = dir(v);
        else if ((k === 'from' || k === 'to') && o.kind === 'shift') o[k] = dir(v);
      } else walk(v, k);
    }
  };
  walk(scene.plaques); walk(scene.words); walk(scene.cams);
}

// Rename word and plaque ids (exact string values only).
export function renameIds(scene, map) {
  const walk = o => {
    if (Array.isArray(o)) { for (let i = 0; i < o.length; i++) { if (typeof o[i] === 'string' && map.has(o[i])) o[i] = map.get(o[i]); else walk(o[i]); } return; }
    if (!o || typeof o !== 'object') return;
    for (const k of Object.keys(o)) { const v = o[k]; if (typeof v === 'string' && map.has(v)) o[k] = map.get(v); else walk(v); }
  };
  walk(scene.plaques); walk(scene.words); walk(scene.cams);
}

// Remove a section's own reveal: its reveal key, every key from there on, and every reveal_on.
export function stripReveal(scene) {
  const rev = scene.cams.find(c => c.kind === 'reveal');
  const revF0 = rev ? rev.f0 : null;
  if (rev) scene.cams = scene.cams.filter(c => c.f0 < revF0);
  for (const v of [...scene.plaques, ...scene.words]) { v.reveal_on = null; }
  return { revealKey: rev ?? null };
}

const firstWord = scene => [...scene.words].sort((a, b) => a.on - b.on)[0];
const lastWord = scene => [...scene.words].sort((a, b) => b.on - a.on)[0];

// Join section scenes (already built, in song order, frames absolute). parts: [{ scene, label, startFrame }].
// Returns { scene, log, seams }.
export function assemble(parts, { fps, frames, end, seamFrames = 8, gapFrac = 0.3 }) {
  const I = globalThis.KT_INTERP;
  const log = [], seams = [];
  const out = structuredClone(parts[0].scene);
  out.meta = { ...out.meta, frames, sections: [] };
  out.end = end;
  stripReveal(out);
  out.meta.sections.push({ label: parts[0].label, from: 0, plaques: out.plaques.map(p => p.id), words: out.words.length });
  let partReveal = null;
  for (let k = 1; k < parts.length; k++) {
    const sc = structuredClone(parts[k].scene);
    const { revealKey } = stripReveal(sc);
    if (k === parts.length - 1) partReveal = revealKey;
    // ids: words w<k><nnn>, plaques p<k><nn> (sung order stays numeric order)
    const map = new Map();
    [...sc.words].sort((a, b) => Number(a.id.replace(/\D/g, '')) - Number(b.id.replace(/\D/g, ''))).forEach((w, i) => map.set(w.id, `w${parts[k].number}${String(i + 1).padStart(3, '0')}`));
    sc.plaques.forEach((p, i) => map.set(p.id, `p${parts[k].number}${String(i + 1).padStart(2, '0')}`));
    renameIds(sc, map);
    // place: the section's first plaque continues to the right of the previous part's last plaque, same heading
    const prevLastW = lastWord(out), prevP = out.plaques.find(p => p.id === prevLastW.plaque);
    const fw = firstWord(sc), firstP = sc.plaques.find(p => p.id === fw.plaque);
    const gap = gapFrac * Math.max(prevP.h, 1);
    const targetC = add(prevP.C, mul(prevP.R, prevP.w / 2 + gap + firstP.w / 2));
    rigidTransform(sc, firstP, { C: targetC, R: prevP.R, U: prevP.U, N: prevP.N });
    // camera seam: from the previous part's last pose to this section's opening pose, ending on its first onset
    const sf = parts[k].startFrame;
    out.cams = out.cams.filter(c => c.f0 < sf).map(c => (c.f1 > sf ? { ...c, f1: sf } : c));
    const firstKeyF0 = Math.min(sf, ...sc.cams.map(c => c.f0));
    const prevKeyEnd = Math.max(0, ...out.cams.map(c => c.f1));
    const readEnd = prevLastW.on + 15;
    const room = firstKeyF0 - Math.max(prevKeyEnd, readEnd);
    const d = Math.max(0, Math.min(seamFrames, room));
    const fromPose = I.poseAt(out.cams, firstKeyF0 - d);
    const toPose = sc.cams.length ? sc.cams[0].from : null;
    if (toPose) {
      const strip = p => ({ target: p.target, R: p.R, U: p.U, N: p.N, dist: p.dist });
      const verb = d >= 4 && parts[k].seam !== 'cut' ? 'sweep' : 'cut';
      const f0 = verb === 'cut' ? firstKeyF0 : firstKeyF0 - d;
      out.cams.push({ f0, f1: firstKeyF0, kind: 'transit', verb, fold: 'flat', ease: { a: 2, b: 3, x0: 0.4 }, from: strip(fromPose), to: strip(toPose), seam: parts[k].label });
      seams.push({ section: parts[k].label, frame: firstKeyF0, verb, frames: firstKeyF0 - f0, previousLastWord: `${prevLastW.id} ${prevLastW.text}`, readingFramesBeforeSeam: f0 - prevLastW.on });
    }
    out.cams.push(...sc.cams);
    out.cams.sort((a, b) => a.f0 - b.f0 || a.f1 - b.f1);
    out.plaques.push(...sc.plaques);
    out.words.push(...sc.words);
    out.meta.sections.push({ label: parts[k].label, from: sf, plaques: sc.plaques.map(p => p.id), words: sc.words.length });
  }
  return { scene: out, log, seams, partReveal };
}

// Vanishing rule (D31): a plaque with no switch-off is switched off at the first frame it is wholly out of frame,
// counted from the on-frame of the plaque two after it in song order (so plaques i and i-1 stay on, D32). The last
// `keepLast` plaques are never hidden. Words follow their plaque.
export function hideWhenGone(scene, { until, keepLast = 2 }) {
  const I = globalThis.KT_INTERP, vfov = scene.meta.vfov;
  const order = [...scene.plaques].sort((a, b) => a.on - b.on);
  const log = [];
  const corners = p => { const r = mul(p.R, p.w / 2), u = mul(p.U, p.h / 2); return [add(add(p.C, r), u), add(sub(p.C, r), u), sub(sub(p.C, r), u), sub(add(p.C, r), u)]; };
  const outOfFrame = (p, pose) => {
    const q = corners(p).map(c => I.project(c, pose, vfov));
    if (q.every(x => !x)) return true;
    if (q.some(x => !x)) return false;
    const xs = q.map(t => t.x), ys = q.map(t => t.y);
    return Math.max(...xs) < -1 || Math.min(...xs) > 1 || Math.max(...ys) < -1 || Math.min(...ys) > 1;
  };
  order.forEach((p, i) => {
    if (p.off != null || i >= order.length - keepLast) return;
    const from = order[i + 2]?.on ?? until;
    for (let f = from; f < until; f++) {
      if (outOfFrame(p, I.poseAt(scene.cams, f))) {
        p.off = f;
        for (const w of scene.words) if (w.plaque === p.id && (w.off == null || w.off > f)) w.off = f;
        log.push(`${p.id} hidden from ${f}`);
        return;
      }
    }
    log.push(`${p.id} never wholly out of frame before ${until}; stays on`);
  });
  return log;
}

// Slab boxes (axis-aligned bounds of the 8 corners), grown by `gap`.
function slabBox(p, gap) {
  const t = p.thickness ?? 50, pts = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [0, -1]) pts.push(add(add(add(p.C, mul(p.R, (a * p.w) / 2)), mul(p.U, (b * p.h) / 2)), mul(p.N, c * t)));
  const lo = [0, 1, 2].map(i => Math.min(...pts.map(q => q[i])) - gap), hi = [0, 1, 2].map(i => Math.max(...pts.map(q => q[i])) + gap);
  return { lo, hi };
}
const boxesMeet = (A, B) => [0, 1, 2].every(i => A.lo[i] < B.hi[i] && B.lo[i] < A.hi[i]);

// Reveal (D36 to D42, with the 42.2 fallback): the longest tail of the real trail (plaques at their recorded poses,
// newest backwards) with no two slabs meeting or closer than `gap`; everything in it switches on at the reveal; the
// camera pulls back along `view` until every tail plaque's corners are inside 86% of the frame, then holds.
const cornersOf = p => { const r = mul(p.R, p.w / 2), u = mul(p.U, p.h / 2); return [add(add(p.C, r), u), add(sub(p.C, r), u), sub(sub(p.C, r), u), sub(add(p.C, r), u)]; };
const keyOf = v => v.map(x => Math.round(x * 100) / 100).join(',');
// Share of the frame (0..1) covered by the given plaques seen from a pose: each plaque's projected quad is rasterised on
// a 192 x 108 grid over the frame. Plaques behind the camera count for nothing.
export function frameCoverage(plaques, pose, vfov, aspect = 16 / 9) {
  const I = globalThis.KT_INTERP, GW = 192, GH = 108, grid = new Uint8Array(GW * GH);
  for (const p of plaques) {
    const q = cornersOf(p).map(c => I.project(c, pose, vfov, aspect));
    if (q.some(v => !v || !(v.depth > 0))) continue;
    const xs = q.map(v => v.x), ys = q.map(v => v.y);
    const i0 = Math.max(0, Math.floor((Math.min(...xs) + 1) / 2 * GW)), i1 = Math.min(GW - 1, Math.ceil((Math.max(...xs) + 1) / 2 * GW));
    const j0 = Math.max(0, Math.floor((Math.min(...ys) + 1) / 2 * GH)), j1 = Math.min(GH - 1, Math.ceil((Math.max(...ys) + 1) / 2 * GH));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = (i + 0.5) / GW * 2 - 1, y = (j + 0.5) / GH * 2 - 1;
      let pos = 0, neg = 0;
      for (let k = 0; k < 4; k++) { const A = q[k], B = q[(k + 1) % 4]; const c = (B.x - A.x) * (y - A.y) - (B.y - A.y) * (x - A.x); if (c > 0) pos++; else if (c < 0) neg++; }
      if (!(pos && neg)) grid[j * GW + i] = 1;
    }
  }
  let n = 0; for (const v of grid) n += v;
  return n / grid.length;
}
// Plaques the viewer shows on frame f (same rule as viewer.html's visible()).
export const plaquesShownAt = (scene, f) => scene.plaques.filter(p => (f >= p.on && (p.off == null || f < p.off)) || (p.reveal_on != null && f >= p.reveal_on));

// ---- Reveal layout (Jefferson, rough cut 2, 22 November 2026): "fictionalise" the trail so it reads as one shape. ----
// The true layout has long jumps (travel joints and section seams), so the pull-back showed about three clusters with
// big empty gaps. The trail (plaques in the order they came on) is cut into chains wherever two consecutive plaques'
// boxes are more than CHAIN_BREAK plaque sizes apart. The newest chain stays where it is (the shot before the reveal
// continues); each earlier chain moves rigidly so its newest plaque sits beside the next chain's oldest plaque, one gap
// apart, keeping its own shape. Placements are tried in order: no turn first, then a 90 degree bend about each axis of
// the neighbouring plaque, each on the side nearest the chain's true direction; the first that meets no placed plaque
// wins. A chain no placement fits is dropped (and logged). Accuracy is not the goal; reading as one connected shape is.
const CHAIN_BREAK = 0.5;
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const turn90 = (axis, sgn) => v => add(mul(cross3(axis, v), sgn), mul(axis, dot(axis, v))); // rotate v by sgn*90 deg about unit axis
const boxGap = (A, B) => Math.hypot(...[0, 1, 2].map(i => Math.max(0, A.lo[i] - B.hi[i], B.lo[i] - A.hi[i])));
const extentAlong = (p, dir) => Math.abs(dot(dir, p.R)) * p.w / 2 + Math.abs(dot(dir, p.U)) * p.h / 2 + Math.abs(dot(dir, p.N)) * (p.thickness ?? 50) / 2;
export function compactLayout(plaques, { gapFrac = 0.3 } = {}) {
  const order = [...plaques].sort((a, b) => a.on - b.on);
  const chains = [[order[0]]], gapsBefore = [];
  for (let i = 1; i < order.length; i++) {
    const a = order[i - 1], b = order[i], g = boxGap(slabBox(a, 0), slabBox(b, 0));
    if (g > CHAIN_BREAK * Math.max(a.w, a.h, b.w, b.h)) { chains.push([b]); gapsBefore.push(Math.round(g)); } else chains.at(-1).push(b);
  }
  const pose = new Map(); // id -> moved plaque (copy)
  const copy = p => ({ ...p, C: [...p.C], R: [...p.R], U: [...p.U], N: [...p.N] });
  for (const p of chains.at(-1)) pose.set(p.id, copy(p));
  const transforms = new Map(chains.at(-1).map(p => [p.id, { M: v => v, A: [0, 0, 0], T: [0, 0, 0] }]));
  const log = [], dropped = [];
  let anchorChain = chains.at(-1);
  for (let k = chains.length - 2; k >= 0; k--) {
    const ch = chains[k], A = ch.at(-1), B = pose.get(anchorChain[0].id);
    const want = sub(A.C, anchorChain[0].C); // the chain's true direction from its neighbour
    const turns = [{ name: 'none', M: v => v }];
    for (const [ax, nm] of [[B.N, 'N'], [B.R, 'R'], [B.U, 'U']]) for (const sg of [1, -1]) turns.push({ name: `${sg > 0 ? '+' : '-'}90 about ${nm}`, M: turn90(ax, sg) });
    const dirs = [B.R, mul(B.R, -1), B.U, mul(B.U, -1)].sort((d1, d2) => dot(d2, want) - dot(d1, want));
    const placed = [...pose.values()];
    let ok = null;
    for (const t of turns) {
      for (const d of dirs) {
        const A2 = { ...A, R: t.M(A.R), U: t.M(A.U), N: t.M(A.N) };
        const gap = gapFrac * Math.min(A.h, B.h);
        const newAC = add(B.C, mul(d, extentAlong(B, d) + gap + extentAlong(A2, d)));
        const tr = p => ({ ...p, C: add(newAC, t.M(sub(p.C, A.C))), R: t.M(p.R), U: t.M(p.U), N: t.M(p.N) });
        const moved = ch.map(tr);
        const clear = moved.every(m => { const bx = slabBox(m, 0.1 * Math.min(m.w, m.h)); return placed.every(q => !boxesMeet(bx, slabBox(q, 0))); });
        if (clear) { ok = { t, d, moved, newAC }; break; }
      }
      if (ok) break;
    }
    if (!ok) { dropped.push(...ch.map(p => p.id)); log.push(`chain ${k + 1} (${ch[0].id} to ${A.id}): no placement fits; dropped`); continue; }
    ok.moved.forEach(m => pose.set(m.id, m));
    for (const p of ch) transforms.set(p.id, { M: ok.t.M, A: A.C, T: ok.newAC });
    log.push(`chain ${k + 1} (${ch[0].id} to ${A.id}, ${ch.length} plaques): beside ${B.id}, turn ${ok.t.name}`);
    anchorChain = ch;
  }
  // Gaps between consecutive kept plaques after compaction.
  const kept = order.filter(p => pose.has(p.id)).map(p => pose.get(p.id));
  const gapsAfter = [];
  for (let i = 1; i < kept.length; i++) gapsAfter.push(boxGap(slabBox(kept[i - 1], 0), slabBox(kept[i], 0)));
  return { pose, transforms, chains: chains.length, gapsBefore, largestGapAfter: Math.round(Math.max(0, ...gapsAfter)), dropped, log };
}

// The reveal (ruling 41 with the 42.2 fallback). Candidate trails are the most recent n plaques of the longest
// conflict-free tail; for each, the camera faces the plaques' main facing direction (area-weighted), looks at the centre
// of their bounding box, and backs off until every corner sits within 86% of the frame. The longest candidate whose last
// frame covers at least minCoverage of the frame wins (or the best-covering one if none does). The pull-back ends
// maxHoldFrames before endFrame (and lasts at least pullFrames), so the still hold at the end stays short.
export function buildReveal(scene, { f0, pullFrames, endFrame, maxHoldFrames = 90, minHoldFrames = 15, gapFrac = 0.1, minCoverage = 0.2, fill = 0.86, compact = true }) {
  const I = globalThis.KT_INTERP, vfov = scene.meta.vfov;
  const order = [...scene.plaques].sort((a, b) => b.on - a.on);
  // Plaques of one section already obey that section's trail rules (joined plaques touch by design), so conflicts are
  // looked for only between plaques of different sections.
  const groupOf = new Map();
  (scene.meta.sections ?? []).forEach((sec, i) => sec.plaques.forEach(id => groupOf.set(id, i)));
  const tail = [];
  let cut = null, compaction = null;
  if (compact) {
    // Reveal copies at the compacted layout; the originals switch off at f0 (they are already off screen or replaced in
    // place by their copies, since the newest chain does not move).
    compaction = compactLayout(scene.plaques);
    const copies = [];
    for (const p of [...scene.plaques].sort((a, b) => b.on - a.on)) {
      const m = compaction.pose.get(p.id);
      if (!m) continue;
      const tr = compaction.transforms.get(p.id);
      const id = `${p.id}r`;
      const cp = { ...structuredClone(p), ...{ C: m.C, R: m.R, U: m.U, N: m.N }, id, on: 1e9, off: null, reveal_copy_of: p.id };
      copies.push(cp);
      for (const w of scene.words.filter(x => x.plaque === p.id)) {
        const cw = structuredClone(w);
        Object.assign(cw, { id: `${w.id}r`, plaque: id, reveal_copy_of: w.id, on: 1e9, off: null, stamp: false, motion: [], clip: [], C: add(tr.T, tr.M(sub(w.C, tr.A))), R: tr.M(w.R), U: tr.M(w.U), N: tr.M(w.N) });
        for (const k of ['pulses', 'opacity', 'pre_offset', 'joint']) delete cw[k];
        scene.words.push(cw);
      }
    }
    scene.plaques.push(...copies);
    for (const p of scene.plaques) if (!p.reveal_copy_of) { p.reveal_on = null; if (p.off == null || p.off > f0) p.off = f0; }
    for (const w of scene.words) if (!w.reveal_copy_of) { w.reveal_on = null; if (w.off == null || w.off > f0) w.off = f0; }
    tail.push(...copies);
  }
  for (const p of compact ? [] : order) {
    const gap = gapFrac * Math.min(p.h, p.w);
    const B = slabBox(p, gap);
    const hit = tail.find(q => groupOf.get(q.id) !== groupOf.get(p.id) && boxesMeet(B, slabBox(q, 0)));
    if (hit) { cut = { at: p.id, conflictsWith: hit.id }; break; }
    tail.push(p);
  }
  const fit = set => {
    const area = new Map();
    for (const p of set) { const k = keyOf(p.N); area.set(k, (area.get(k) ?? 0) + p.w * p.h); }
    const mainN = [...area.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const face = set.find(p => keyOf(p.N) === mainN); // most recent plaque facing that way gives R and U
    // Views tried: face-on to the main facing direction, and the eight three-quarter diagonals (which see plaques of
    // all three facings at once); the one whose last frame is most covered wins.
    const norm = v => mul(v, 1 / Math.hypot(...v));
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const views = [{ R: face.R, U: face.U, N: face.N }];
    for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) {
      const N = norm([sx, sy, sz]);
      const R = norm(cross(face.U, N)); const U = cross(N, R);
      views.push({ R, U, N });
    }
    let bestV = null;
    for (const view of views) { const r = fitView(set, view); if (!bestV || r.coverage > bestV.coverage) bestV = r; }
    return bestV;
  };
  const fitView = (set, view) => {
    const pts = set.flatMap(cornersOf);
    const lo = [0, 1, 2].map(i => Math.min(...pts.map(q => q[i]))), hi = [0, 1, 2].map(i => Math.max(...pts.map(q => q[i])));
    const target = mul(add(lo, hi), 0.5);
    const poseOf = dist => I.poseAt([{ f0: -2, f1: -1, from: { target, ...view, dist }, to: { target, ...view, dist } }], 0);
    const fits = dist => { const pose = poseOf(dist); return pts.every(c => { const q = I.project(c, pose, vfov); return q && q.depth > 0 && Math.abs(q.x) <= fill && Math.abs(q.y) <= fill; }); };
    let hiD = Math.max(100, Math.hypot(...sub(hi, lo)));
    while (!fits(hiD)) hiD *= 1.5;
    let loD = 1;
    for (let i = 0; i < 40; i++) { const m = (loD + hiD) / 2; if (fits(m)) hiD = m; else loD = m; }
    return { view, target, dist: hiD, coverage: frameCoverage(set, poseOf(hiD), vfov) };
  };
  let best = null, bestN = 0;
  // With the compacted layout every plaque is shown (Jefferson: all of them, as one shape); coverage is only reported.
  for (let n = tail.length; n >= 1; n--) {
    const r = fit(tail.slice(0, n));
    if (compact) { best = r; bestN = n; break; }
    if (process.env.KT_REVEAL_CURVE) console.log('reveal curve', n, r.coverage.toFixed(3));
    if (!best || r.coverage > best.coverage + 1e-9) { best = r; bestN = n; }
    if (r.coverage >= minCoverage) { best = r; bestN = n; break; }
  }
  // Stop the pull-back at the coverage floor (engine fix brief 3, item 1.2): when showing the whole compacted layout
  // would cover less than minCoverage of the frame, the camera stops closer, centred on the layout, at the farthest
  // distance that still covers minCoverage.
  let stoppedAt = null;
  if (best.coverage < minCoverage) {
    const tailSet = tail.slice(0, bestN);
    const poseOf = dist => I.poseAt([{ f0: -2, f1: -1, from: { target: best.target, ...best.view, dist }, to: { target: best.target, ...best.view, dist } }], 0);
    let lo = best.dist * 0.02, hi = best.dist;
    if (frameCoverage(tailSet, poseOf(lo), vfov) >= minCoverage) {
      for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (frameCoverage(tailSet, poseOf(m), vfov) >= minCoverage) lo = m; else hi = m; }
      stoppedAt = { from: best.dist, to: lo, coverageWhole: best.coverage };
      best = { ...best, dist: lo, coverage: frameCoverage(tailSet, poseOf(lo), vfov) };
    }
  }
  const shown = tail.slice(0, bestN);
  const tailIds = new Set(shown.map(p => p.id));
  // every revealed plaque (and its words) is switched on for the reveal, whatever the vanishing rule did earlier
  for (const p of scene.plaques) if (tailIds.has(p.id)) { p.reveal_on = f0; p.reveal_stamp = false; }
  for (const w of scene.words) if (tailIds.has(w.plaque)) { w.reveal_on = f0; w.reveal_stamp = false; }
  // everything else switches off for good at the reveal if still on
  for (const p of scene.plaques) if (!tailIds.has(p.id)) { p.reveal_on = null; if (p.off == null || p.off > f0) p.off = f0; }
  for (const w of scene.words) if (!tailIds.has(w.plaque)) { w.reveal_on = null; if (w.off == null || w.off > f0) w.off = f0; }
  // Never end mid-move (item 1.3): the pull-back lands at least minHoldFrames before the end (build_song starts the
  // reveal early enough for that); a still hold of at most maxHoldFrames follows.
  let f1 = Math.max(f0 + pullFrames, (endFrame ?? f0 + pullFrames) - maxHoldFrames);
  if (endFrame != null) f1 = Math.max(f0 + 1, Math.min(f1, endFrame - minHoldFrames));
  const from = I.poseAt(scene.cams, f0);
  scene.cams = scene.cams.filter(c => c.f0 < f0).map(c => (c.f1 > f0 ? { ...c, f1: f0 } : c));
  scene.cams.push({ f0, f1, kind: 'reveal', verb: 'sweep', fold: 'reveal', ease: { a: 2, b: 3, x0: 0.4 }, hold_target_until: 0.3,
    from: { target: from.target, R: from.R, U: from.U, N: from.N, dist: from.dist }, to: { target: best.target, ...best.view, dist: best.dist } });
  if (compact) { // copies outside the chosen run are removed
    const keep = new Set(shown.map(p => p.id));
    scene.plaques = scene.plaques.filter(p => !p.reveal_copy_of || keep.has(p.id));
    scene.words = scene.words.filter(w => !w.reveal_copy_of || keep.has(w.plaque));
  }
  const originals = scene.plaques.filter(p => !p.reveal_copy_of).length;
  return { conflictFreeTail: tail.length, tail: bestN, of: originals, cut, dist: best.dist, plannedCoverage: best.coverage, f0, f1, stoppedAt,
    compaction: compaction && { chains: compaction.chains, gapsBefore: compaction.gapsBefore, largestGapAfter: compaction.largestGapAfter, dropped: compaction.dropped, log: compaction.log } };
}

// Reveal check: on the scene's last frame, the plaques actually shown must cover at least minCoverage of the frame.
export function checkReveal(scene, { frame = scene.meta.frames - 1, minCoverage = 0.2 } = {}) {
  const I = globalThis.KT_INTERP;
  const pose = I.poseAt(scene.cams, frame);
  const shown = plaquesShownAt(scene, frame);
  const coverage = frameCoverage(shown, pose, scene.meta.vfov);
  const inFrame = shown.filter(p => cornersOf(p).some(c => { const q = I.project(c, pose, scene.meta.vfov); return q && q.depth > 0 && Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1; })).length;
  return { frame, coverage, plaquesShown: shown.length, plaquesInFrame: inFrame, pass: coverage >= minCoverage };
}

// Ending without a reveal (engine fix brief 3, item 1.1): the song ends on one word held still to the last frame.
// `hold` is a word's text (its last sung occurrence; case and surrounding punctuation ignored) or "last" (the last sung
// word). Camera keys that start after the held word has come to rest are dropped, and so the camera holds still on it.
// If words are sung after the held word, the camera keeps playing through them and then cuts back to the held framing
// at least minHoldFrames before the end. The held word and its plaque stay on to the end.
export function endOnWord(scene, { hold = 'last', endFrame, fps = 30, minHoldFrames = 15, settle = 6 }) {
  const I = globalThis.KT_INTERP;
  const norm = t => String(t).toUpperCase().replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, '');
  const sung = scene.words.filter(w => w.t != null && !w.echo && !w.reveal_copy_of).sort((a, b) => a.t - b.t);
  const pick = hold === 'last' ? sung.at(-1) : sung.filter(w => norm(w.text) === norm(hold)).at(-1);
  if (!pick) throw Error(`ending.hold "${hold}": no sung word matches`);
  const j = pick.joint, rest = !j || ['pop', 'travel', 'echo'].includes(j.prim) || !(j.f1 > pick.on) ? pick.on : j.f1;
  const after = sung.filter(w => w.t > pick.t);
  const lastOnset = after.length ? Math.round(after.at(-1).t * fps) : null;
  const holdPose = I.poseAt(scene.cams, rest + settle);
  const strip = p => ({ target: p.target, R: p.R, U: p.U, N: p.N, dist: p.dist });
  let cutBack = null;
  if (after.length) {
    const keepUntil = Math.min(lastOnset + 15, endFrame - minHoldFrames);
    scene.cams = scene.cams.filter(c => c.f0 < keepUntil).map(c => (c.f1 > keepUntil ? { ...c, f1: keepUntil } : c));
    const from = I.poseAt(scene.cams, keepUntil);
    scene.cams.push({ f0: keepUntil, f1: keepUntil, kind: 'ending', verb: 'cut', fold: 'flat', from: strip(from), to: strip(holdPose) });
    cutBack = keepUntil;
  } else {
    scene.cams = scene.cams.filter(c => c.f0 <= rest); // a move already under way when the word rests finishes as planned
  }
  pick.off = null;
  const plaque = scene.plaques.find(p => p.id === pick.plaque);
  if (plaque) plaque.off = null;
  for (const v of [...scene.plaques, ...scene.words]) v.reveal_on = null;
  return { word: `${pick.id} ${pick.text}`, restFrame: rest, sungAfter: after.map(w => `${w.id} ${w.text}`), cutBack, f0: endFrame, f1: endFrame };
}

// Never end mid-move (item 1.3): the camera is still over the last minHoldFrames frames and no shown word is moving
// on the last frame.
export function checkStillEnding(scene, { minHoldFrames = 15 } = {}) {
  const I = globalThis.KT_INTERP, last = scene.meta.frames - 1, problems = [];
  for (const k of scene.cams) if (k.f1 > k.f0 && k.f1 > last - minHoldFrames + 1 && k.f0 < scene.meta.frames) problems.push(`camera ${k.verb} ${k.f0}-${k.f1} moves within the last ${minHoldFrames} frames`);
  const shown = w => (w.on <= last && (w.off == null || last < w.off)) || (w.reveal_on != null && last >= w.reveal_on);
  for (const w of scene.words) if (shown(w) && I.wordMoving(w, last)) problems.push(`${w.id} ${w.text} is moving on the last frame`);
  return { pass: !problems.length, problems };
}
