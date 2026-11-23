import { inkOk, repairShown, gateFailures } from './shown_gate.mjs';

export const OVERLAP_GATE = '13.1.19_projected_word_overlap';
const I = globalThis.KT_INTERP;
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const rectangle = (w, margin = 0) => [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y]) =>
  w.C.map((c,i) => c + x * w.R[i] * (w.w/2 + margin) + y * w.U[i] * (w.h/2 + margin)));

function clip(poly, distance) {
  return poly.flatMap((a, i) => {
    const b = poly[(i + 1) % poly.length], da = distance(a), db = distance(b);
    const points = da >= 0 ? [a] : [];
    if ((da < 0) !== (db < 0)) points.push(a.map((x,j) => x + (b[j]-x)*da/(da-db)));
    return points;
  });
}

function intersects(a, b) {
  return [a,b].every(poly => poly.every((p,i) => {
    const [x,y] = sub(poly[(i+1)%poly.length],p);
    const axis = [-y,x], length = Math.hypot(x,y);
    if (length < 1e-9) return true;
    const aa = a.map(q => dot(q,axis)), bb = b.map(q => dot(q,axis));
    return Math.min(Math.max(...aa),Math.max(...bb)) - Math.max(Math.min(...aa),Math.min(...bb)) > .002 * length;
  }));
}

const visible = (w,f) => w.on <= f && (w.off == null || f < w.off);

export function scanOverlap(scene, { from = 0, until = scene.meta.frames, repair = false, retireOccluded = false } = {}) {
  const fps = scene.meta.fps ?? 30, words = scene.words.filter(w => !w.replaced_by && !w.reveal_copy_of);
  const byId = new Map(scene.words.map(w => [w.id,w]));
  const entries = words.map(w => ({ w, corners: rectangle(w), ink: inkOk(w), onset: Math.round((w.t ?? w.on/fps)*fps) }));
  const panels = scene.plaques.filter(p => p.surface === 'panel').map(p => {
    const margin = Math.max(150,.3*Math.min(p.w,p.h));
    let corners = rectangle(p,margin);
    for (const q of scene.plaques) {
      if (q === p || q.surface !== 'panel' || Math.abs(dot(p.N,q.N)) > .5) continue;
      if (Math.hypot(...sub(p.C,q.C)) > (p.w+p.h+q.w+q.h)/2+2*margin) continue;
      const sign = Math.sign(dot(q.N,sub(p.C,q.C))) || 1;
      const side = x => sign*dot(q.N,sub(x,q.C));
      if (rectangle(p).every(x => side(x) >= -1)) corners = clip(corners,side);
    }
    return {p,corners};
  });
  const remaining = new Map(), retired = [];
  for (let f = Math.max(0,Math.floor(from)); f < until; f++) {
    const pose = I.poseAt(scene.cams,f);
    const project = corners => {
      const depth = p => -dot(sub(p,pose.position),pose.N);
      let poly = clip(corners,p => depth(p)-20).map(p => I.project(p,pose,scene.meta.vfov ?? 40));
      poly = poly.map(p => [p.x,p.y]);
      for (const axis of [0,1]) for (const sign of [-1,1]) poly = clip(poly,p => 1+sign*p[axis]);
      return poly;
    };
    const drawn = [];
    for (const {w,corners,ink,onset} of entries) {
      if (!ink || !visible(w,f) || (w.opacity ?? []).filter(([k]) => k <= f).at(-1)?.[1] <= .05) continue;
      const X = I.wordXform(w,f);
      const normal = sub(X(w.C.map((c,i) => c+w.N[i])),X(w.C));
      if (dot(normal,sub(pose.position,X(w.C))) <= 0) continue;
      let shape = corners.map(X);
      for (const plane of I.wordClips(w,f,byId)) shape = clip(shape,p => dot(plane.n,sub(p,plane.P)));
      const poly = project(shape);
      if (poly.length >= 3) drawn.push({w,onset,poly});
    }
    function hit(a,id,label) {
      const key = [a.w.id,id].sort().join('/');
      const last = remaining.get(key);
      if (last?.end === f-1) last.end = f;
      else remaining.set(key,{start:f,end:f,text:`${a.w.id} ${a.w.text} / ${label}`,previous:last});
    }
    for (let i=0;i<drawn.length;i++) for (let j=i+1;j<drawn.length;j++) {
      const a = drawn[i], b = drawn[j];
      if (!visible(a.w,f) || !visible(b.w,f) || !intersects(a.poly,b.poly)) continue;
      const [old,next] = a.onset <= b.onset ? [a,b] : [b,a];
      // An echo never retires a sung word (engine fix brief 4): the held word it sits beside may carry later re-sung
      // pulses, and retiring it left Room for One's outro chant black for 16 s. The echo is delayed or goes instead.
      if (repair && old.onset + Math.ceil(fps*.3) < f && old.onset < next.onset && !old.w.echo && !next.w.echo) {
        // Retire the old word's line group (its plaque's words) together (engine fix brief 3, Fable rough cut 3 items
        // 13 and 14): a punchline never leaves before its lesser neighbours, and a phrase never loses a middle word.
        // Group words still inside their own reading moment, and the incoming word's own plaque, stay.
        const group = entries.filter(x => x.w === old.w || (x.w.plaque === old.w.plaque && x.w.plaque !== next.w.plaque &&
          !x.w.echo && visible(x.w,f) && x.onset + Math.ceil(fps*.3) < f && x.onset < next.onset));
        for (const x of group) x.w.off = f;
        retired.push(`${old.w.id} ${old.w.text} retired at frame ${f} for ${next.w.id} ${next.w.text}${group.length > 1 ? ` with its line group (${group.filter(x => x.w !== old.w).map(x => x.w.text).join(' ')})` : ''}`);
      } else if (repair && retireOccluded && next.w.echo && f === next.w.on &&
          f < Math.round(next.w.echo_of_events?.[0] * fps) + 3 && f + 1 < next.w.off) {
        next.w.on = f + 1;
        if (next.w.joint) next.w.joint.f0 = next.w.joint.f1 = next.w.on;
        const event = scene.meta.sung_pulses?.added?.find(x => x.id === next.w.id);
        if (event) {
          event.frame = next.w.on;
          event.treatment = `echo, ${next.w.off - next.w.on} frames after overlap repair`;
        }
        retired.push(`${next.w.id} ${next.w.text} delayed to frame ${next.w.on} to clear ${old.w.id} ${old.w.text}`);
      } else if (repair && next.w.echo && next.w.id.startsWith(`${old.w.id}e`) && next.w.off > f) {
        // An echo may float over its own held word (sung_pulses addEcho): the held word steps back while the echo
        // shows and returns after it.
        const at = k => { let v = 1; for (const [g, x] of old.w.opacity ?? []) if (g <= k) v = x; return v; };
        const back = at(next.w.off);
        old.w.opacity = [...(old.w.opacity ?? []).filter(([k]) => k < f || k >= next.w.off), [f, 0], [next.w.off, back]].sort((x, y) => x[0] - y[0]);
        retired.push(`${old.w.id} ${old.w.text} hidden over frames ${f}-${next.w.off - 1} under its echo ${next.w.id} ${next.w.text}`);
      } else if (repair && next.w.echo && !old.w.echo && old.onset < next.onset) {
        next.w.off = f;
        const event = scene.meta.sung_pulses?.added?.find(x => x.id === next.w.id);
        if (event) event.treatment = f > next.w.on ? `echo, ${f - next.w.on} frames, cut short to clear ${old.w.text}` : `echo dropped to clear ${old.w.text}`;
        retired.push(`${next.w.id} ${next.w.text} (echo) ${f > next.w.on ? 'cut short' : 'dropped'} at frame ${f} to clear ${old.w.id} ${old.w.text}`);
      } else hit(a,b.w.id,`${b.w.id} ${b.w.text}`);
    }
    for (const {p,corners} of panels) {
      if (!visible(p,f)) continue;
      const opposite = dot(p.N,sub(pose.position,p.C));
      const affected = drawn.filter(a => visible(a.w,f) && a.w.plaque !== p.id &&
        opposite * dot(p.N,sub(I.wordXform(a.w,f)(a.w.C),p.C)) < 0);
      if (!affected.length) continue;
      const poly = project(corners);
      if (poly.length < 3) continue;
      for (const a of affected) {
        if (!intersects(a.poly,poly)) continue;
        const owners = entries.filter(x => x.w.plaque === p.id);
        if (repair && owners.length && owners.every(x => x.onset + Math.ceil(fps*.3) < f && x.onset < a.onset)) {
          p.off = f;
          for (const {w} of owners) if (visible(w,f)) w.off = f;
          retired.push(`${p.id} retired at frame ${f} for ${a.w.id} ${a.w.text}`);
          break;
        }
        if (repair && retireOccluded && !a.w.echo && a.onset + Math.ceil(fps*.3) < f &&
            owners.some(x => x.w.on <= f && x.onset > a.onset)) {
          a.w.off = f;
          retired.push(`${a.w.id} ${a.w.text} retired at frame ${f} behind ${p.id}`);
          continue;
        }
        hit(a,`panel:${p.id}`,`plaque ${p.id} (${owners.map(x => x.w.text).join(' ')})`);
      }
    }
  }
  const overlaps = [];
  for (let item of remaining.values()) while (item) {
    overlaps.push(`${(item.start/fps).toFixed(3)}–${(item.end/fps).toFixed(3)} s: ${item.text}`);
    item = item.previous;
  }
  return { overlaps, retired };
}

// Both whole-scene rules together (engine fix brief 2, 22 November 2026): the shown-whole repair moves the camera,
// which can create projected overlaps; the overlap repair retires and delays words, which the shown-whole check must
// see. Alternate the two until neither changes anything, then report the final state of both. The focused word shown
// partly is Jefferson's absolute rule; no fallback waives it, so the result names every remaining partial.
export function repairShownAndOverlap(scene, onsetOf, { from = 0, until, retireOccluded = false, rounds = 4 } = {}) {
  const shownLog = [], overlapLog = [];
  let shown, overlap;
  for (let round = 0; round < rounds; round++) {
    shown = repairShown(scene, onsetOf, { until });
    overlap = scanOverlap(scene, { from, until, repair: true, retireOccluded });
    shownLog.push(...shown.log.map(x => `round ${round + 1}: ${x}`));
    overlapLog.push(...overlap.retired.map(x => `round ${round + 1}: ${x}`));
    if (!shown.log.length && !overlap.retired.length) break;
  }
  const partial = gateFailures(scene, onsetOf, { until }).filter(x => x.kind === 'partial');
  const remaining = scanOverlap(scene, { from, until }).overlaps;
  return { shownLog, overlapLog, partial, overlaps: remaining };
}
