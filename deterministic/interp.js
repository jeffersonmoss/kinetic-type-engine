// Shared camera interpolation and perspective projection for Node and viewer.
// Input times are frames. Pose axes R, U, N form a right-handed basis.
(() => {
  const add = (a, b) => a.map((x, i) => x + b[i]);
  const sub = (a, b) => a.map((x, i) => x - b[i]);
  const mul = (a, k) => a.map(x => x * k);
  const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const unit = a => {
    const l = Math.hypot(...a);
    return l > 0 ? mul(a, 1 / l) : [0, 0, 0];
  };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  function ease(u, spec) {
    u = clamp(u, 0, 1);
    if (spec.p !== undefined) return u < 0.5 ? (2 * u) ** spec.p / 2 : 1 - (2 - 2 * u) ** spec.p / 2;
    const { a, b, x0 } = spec;
    const y0 = (b * x0) / (a * (1 - x0) + b * x0);
    return u <= x0 ? y0 * (u / x0) ** a : 1 - (1 - y0) * ((1 - u) / (1 - x0)) ** b;
  }

  // Matrix-to-quaternion conversion, with [x, y, z, w] representation.
  function quaternion({ R, U, N }) {
    const m00 = R[0], m01 = U[0], m02 = N[0];
    const m10 = R[1], m11 = U[1], m12 = N[1];
    const m20 = R[2], m21 = U[2], m22 = N[2];
    const tr = m00 + m11 + m22;
    let x, y, z, w, s;
    if (tr > 0) {
      s = Math.sqrt(tr + 1) * 2;
      w = s / 4; x = (m21 - m12) / s; y = (m02 - m20) / s; z = (m10 - m01) / s;
    } else if (m00 > m11 && m00 > m22) {
      s = Math.sqrt(1 + m00 - m11 - m22) * 2;
      w = (m21 - m12) / s; x = s / 4; y = (m01 + m10) / s; z = (m02 + m20) / s;
    } else if (m11 > m22) {
      s = Math.sqrt(1 + m11 - m00 - m22) * 2;
      w = (m02 - m20) / s; x = (m01 + m10) / s; y = s / 4; z = (m12 + m21) / s;
    } else {
      s = Math.sqrt(1 + m22 - m00 - m11) * 2;
      w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = s / 4;
    }
    return unit([x, y, z, w]);
  }

  function slerp(a, b, t) {
    let d = dot(a, b);
    if (d < 0) { b = mul(b, -1); d = -d; }
    if (d > 0.9995) return unit(a.map((x, i) => x + t * (b[i] - x)));
    const angle = Math.acos(clamp(d, -1, 1));
    const s = Math.sin(angle);
    return a.map((x, i) => (x * Math.sin((1 - t) * angle) + b[i] * Math.sin(t * angle)) / s);
  }

  function rotate(q, v) {
    const qv = q.slice(0, 3);
    const t = mul(cross(qv, v), 2);
    return add(v, add(mul(t, q[3]), cross(qv, t)));
  }

  const qmul = (a, b) => [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
  const qconj = q => [-q[0], -q[1], -q[2], q[3]];

  function rotateAxis(v, axis, angle) {
    const c = Math.cos(angle), s = Math.sin(angle), a = unit(axis);
    return add(add(mul(v, c), mul(cross(a, v), s)), mul(a, dot(a, v) * (1 - c)));
  }

  function complete(p) {
    return { ...p, position: add(p.target, mul(p.N, p.dist)) };
  }

  function movePose(key, frame) {
    const { from, to } = key;
    if (key.verb === 'cut' || key.f1 === key.f0) return complete(frame < key.f0 ? from : to);
    // key.hold [[a, b], ...]: the camera holds the pose of frame a - 1 over frames a..b (brief 4: no empty frame mid-song).
    for (const [ha, hb] of key.hold ?? []) if (frame >= ha && frame <= hb) { frame = Math.max(key.f0, ha - 1); break; }
    if (frame <= key.f0) return complete(from);
    if (frame >= key.f1) return complete(to);
    const u = (frame - key.f0) / (key.f1 - key.f0);
    const e = ease(u, key.ease);
    let R, U, N;
    if (key.pivot) {
      // Pivot (spec 44): rotate the from pose rigidly about the line (P, axis) by deg * e, then blend the
      // remaining target offset, distance (log) and any leftover orientation so that e = 1 lands exactly on `to`.
      const { P, axis, deg } = key.pivot;
      const ang = (deg * Math.PI) / 180;
      const rotAbout = (pt, a) => add(P, rotateAxis(sub(pt, P), axis, a));
      const endR = rotateAxis(from.R, axis, ang), endU = rotateAxis(from.U, axis, ang), endN = rotateAxis(from.N, axis, ang);
      const qEnd = quaternion({ R: endR, U: endU, N: endN });
      const qTo = quaternion(to);
      const qRes = qmul(qTo, qconj(qEnd)); // leftover rotation applied after the pivot
      const qPart = slerp([0, 0, 0, 1], qRes, e);
      R = rotate(qPart, rotateAxis(from.R, axis, ang * e));
      U = rotate(qPart, rotateAxis(from.U, axis, ang * e));
      N = rotate(qPart, rotateAxis(from.N, axis, ang * e));
      const fromTargetFull = rotAbout(from.target, ang);
      const target = add(rotAbout(from.target, ang * e), mul(sub(to.target, fromTargetFull), e));
      const dist = Math.exp(Math.log(from.dist) * (1 - e) + Math.log(to.dist) * e);
      return complete({ target, R, U, N, dist });
    }
    if (key.flip) {
      const axis = key.flipAxis ?? from.U;
      const angle = (key.flip === -1 ? -1 : 1) * Math.PI * e;
      R = rotateAxis(from.R, axis, angle);
      U = rotateAxis(from.U, axis, angle);
      N = rotateAxis(from.N, axis, angle);
      // If destination has an in-plane roll relative to the 180-deg orbit endpoint (e.g., perp word), blend it cleanly.
      const endR = rotateAxis(from.R, axis, (key.flip === -1 ? -1 : 1) * Math.PI);
      const endU = rotateAxis(from.U, axis, (key.flip === -1 ? -1 : 1) * Math.PI);
      const rollDelta = Math.atan2(dot(to.R, endU), dot(to.R, endR));
      if (Math.abs(rollDelta) > 1e-4) {
        R = rotateAxis(R, N, rollDelta * e);
        U = rotateAxis(U, N, rollDelta * e);
      }
    } else {
      const q = slerp(quaternion(from), quaternion(to), e);
      R = rotate(q, [1, 0, 0]);
      U = rotate(q, [0, 1, 0]);
      N = rotate(q, [0, 0, 1]);
    }
    let et = e;
    if (key.hold_target_until) {
      et = u <= key.hold_target_until
        ? 0
        : ease(clamp((u - key.hold_target_until) / (1 - key.hold_target_until), 0, 1), key.ease);
    }
    const target = from.target.map((x, i) => x + (to.target[i] - x) * et);
    let ed = e;
    if (key.stagger && Math.max(from.dist, to.dist) / Math.min(from.dist, to.dist) >= 2) {
      ed = ease(to.dist < from.dist ? clamp((u - 0.3) / 0.7, 0, 1) : clamp(u / 0.7, 0, 1), key.ease);
    }
    let dist = Math.exp(Math.log(from.dist) * (1 - ed) + Math.log(to.dist) * ed);
    if (key.bow) dist *= 1 + 0.25 * Math.sin(Math.PI * e);
    return complete({ target, R, U, N, dist });
  }

  function poseAt(keys, frame) {
    if (!keys.length) throw Error('No camera keys');
    let pose = keys[0].from;
    for (const key of keys) {
      if (frame < key.f0) break;
      if (frame <= key.f1) return movePose(key, frame);
      pose = key.to;
    }
    return complete(pose);
  }

  function project(point, pose, vfov = 40, aspect = 16 / 9) {
    const delta = sub(point, pose.position);
    const depth = -dot(delta, pose.N);
    const tv = Math.tan((vfov * Math.PI) / 360);
    if (depth <= 0) return null;
    return { x: dot(delta, pose.R) / (depth * tv * aspect), y: dot(delta, pose.U) / (depth * tv), depth };
  }

  // ---- Word motion (spec 43.1.2, 43.2) ----
  // A word's motion is a list of segments {f0, f1, ease, kind, from, to, P?, axis?}. Each kind is a channel.
  // Channel value: `from` of its first segment before that starts, the eased blend inside a segment,
  // and the `to` of the latest finished segment otherwise. World point = shift + hinge(scale(rest point)).
  function channel(segs, frame) {
    if (!segs.length) return null;
    let cur = { seg: segs[0], v: segs[0].from };
    for (const s of segs) {
      if (frame < s.f0) break;
      if (frame >= s.f1) { cur = { seg: s, v: s.to }; continue; }
      const u = (frame - s.f0) / Math.max(1e-9, s.f1 - s.f0);
      const e = ease(u, s.ease ?? { a: 2, b: 4, x0: 0.34 });
      const v = Array.isArray(s.from) ? s.from.map((x, i) => x + (s.to[i] - x) * e) : s.from + (s.to - s.from) * e;
      return { seg: s, v };
    }
    return cur;
  }
  function wordState(w, frame) {
    const m = w.motion ?? [];
    const byKind = k => m.filter(s => s.kind === k).sort((a, b) => a.f0 - b.f0);
    return { shift: channel(byKind('shift'), frame), hinge: channel(byKind('hinge'), frame), scale: channel(byKind('scale'), frame) };
  }
  function wordShift(w, frame) {
    const st = channel((w.motion ?? []).filter(s => s.kind === 'shift').sort((a, b) => a.f0 - b.f0), frame);
    return st ? st.v : [0, 0, 0];
  }
  // Returns a function mapping a rest-world point to its posed world point at `frame`.
  function wordXform(w, frame) {
    const st = wordState(w, frame);
    const shift = st.shift ? st.shift.v : [0, 0, 0];
    const hz = st.hinge && Math.abs(st.hinge.v) > 1e-9 ? st.hinge : null;
    const sc = st.scale && Math.abs(st.scale.v - 1) > 1e-9 ? st.scale : null;
    return pt => {
      let p = pt;
      if (sc) {
        const P = sc.seg.P, d = sub(p, P);
        if (sc.seg.axis) { const a = unit(sc.seg.axis); p = add(P, add(d, mul(a, (sc.v - 1) * dot(d, a)))); }
        else p = add(P, mul(d, sc.v));
      }
      if (hz) p = add(hz.seg.P, rotateAxis(sub(p, hz.seg.P), hz.seg.axis, (hz.v * Math.PI) / 180));
      return add(p, shift);
    };
  }
  function wordMoving(w, frame) {
    return (w.motion ?? []).some(s => frame >= s.f0 && frame < s.f1);
  }
  // Active clip half-spaces {P, n} at `frame`; keep points where (x - P) . n >= 0. `byId` resolves `ride`.
  function wordClips(w, frame, byId) {
    const out = [];
    for (const c of w.clip ?? []) {
      if (frame < c.f0 || frame >= c.f1) continue;
      const rideShift = c.ride && byId && byId.get(c.ride) ? wordShift(byId.get(c.ride), frame) : [0, 0, 0];
      out.push({ P: add(c.P, rideShift), n: unit(c.n) });
    }
    return out;
  }

  // ---- Screen-space backdrops and hoisted props (engine fix brief 17, 23 November 2026) ----
  const SHARP_EASE = Object.freeze({ a: 2, b: 4, x0: 0.34 });

  // Maps backdrop pixel coordinates (bx, by) to screen pixels (sx, sy) for a W x H frame.
  function backdropRect(b, W = 1280, H = 720) {
    const bw = b.w || W, bh = b.h || H, fit = b.fit ?? 'cover';
    if (fit === 'stretch') return { ox: 0, oy: 0, sx: W / bw, sy: H / bh, dw: W, dh: H };
    const s = fit === 'contain' ? Math.min(W / bw, H / bh) : Math.max(W / bw, H / bh);
    const dw = bw * s, dh = bh * s;
    return { ox: (W - dw) / 2, oy: (H - dh) / 2, sx: s, sy: s, dw, dh };
  }

  function windowAlpha(win, frame) {
    if (frame < win.start || frame >= win.end) return 0;
    const fin = win.fadeIn > 0 ? clamp((frame - win.start) / win.fadeIn, 0, 1) : 1;
    const fout = win.fadeOut > 0 ? clamp((win.end - frame) / win.fadeOut, 0, 1) : 1;
    return fin * fout;
  }

  function backdropOpacity(b, frame) {
    return (b.opacity ?? 1) * windowAlpha(b, frame);
  }

  function propOpacityAt(p, frame) {
    let best = 0, refIndex = -1;
    for (const win of p.windows ?? []) {
      const a = windowAlpha(win, frame);
      if (a > best) { best = a; refIndex = win.refIndex ?? -1; }
    }
    return { opacity: (p.opacity ?? 1) * best, refIndex };
  }

  // Keyframed prop pose in backdrop (or screen) pixels: sharp-eased along segments, held still between them.
  function propPoseAt(p, frame) {
    let x = p.x0 ?? 0, y = p.y0 ?? 0;
    for (const s of p.segments ?? []) {
      if (frame < s.f0) break;
      if (frame >= s.f1) { x = s.x1; y = s.y1; continue; }
      const u = (frame - s.f0) / Math.max(1e-9, s.f1 - s.f0);
      const e = ease(u, s.ease ?? SHARP_EASE);
      return { x: s.x0 + (s.x1 - s.x0) * e, y: s.y0 + (s.y1 - s.y0) * e, moving: s.x0 !== s.x1 || s.y0 !== s.y1 };
    }
    return { x, y, moving: false };
  }

  // Screen-space draw, collision (hit) and ripple rectangles of prop `p` at `frame`, or null when inactive.
  function propScreenRects(p, frame, backdrops = [], W = 1280, H = 720) {
    const { opacity, refIndex } = propOpacityAt(p, frame);
    if (!(opacity > 0)) return null;
    const B = refIndex >= 0 && backdrops[refIndex]
      ? backdropRect(backdrops[refIndex], W, H)
      : { ox: 0, oy: 0, sx: 1, sy: 1, dw: W, dh: H };
    const pose = propPoseAt(p, frame);
    const ps = p.scale ?? 1;
    const bx0 = pose.x - (p.anchorX ?? 0) * ps;
    const by0 = pose.y - (p.anchorY ?? 0) * ps;
    const draw = { x: B.ox + bx0 * B.sx, y: B.oy + by0 * B.sy, w: p.w * ps * B.sx, h: p.h * ps * B.sy };
    const hb = p.hitBox ?? { x0: 0, y0: p.anchorY ?? 0, x1: p.w, y1: p.h };
    const hit = {
      x0: B.ox + (bx0 + hb.x0 * ps) * B.sx,
      y0: B.oy + (by0 + hb.y0 * ps) * B.sy,
      x1: B.ox + (bx0 + hb.x1 * ps) * B.sx,
      y1: B.oy + (by0 + hb.y1 * ps) * B.sy,
    };
    const rb = p.rippleBox ?? { x0: 0, y0: p.anchorY ?? 0, x1: p.w, y1: p.h };
    const rip = {
      x: B.ox + (bx0 + rb.x0 * ps) * B.sx,
      y: B.oy + (by0 + rb.y0 * ps) * B.sy,
      w: (rb.x1 - rb.x0) * ps * B.sx,
      h: (rb.y1 - rb.y0) * ps * B.sy,
    };
    return { opacity, moving: pose.moving, draw, hit, rip, x: pose.x, y: pose.y, refIndex };
  }

  // True when any photographic backdrop or on-screen prop is visibly drawn at `frame` (brief 17: not a dead screen).
  function stageVisible(scene, frame, W = 1280, H = 720) {
    const bds = scene.backdrops ?? [];
    for (const b of bds) if (backdropOpacity(b, frame) > 0.05) return true;
    for (const p of scene.props ?? []) {
      const st = propScreenRects(p, frame, bds, W, H);
      if (st && st.opacity > 0.05 && st.hit.x1 > 0 && st.hit.x0 < W && st.hit.y1 > 0 && st.hit.y0 < H) return true;
    }
    return false;
  }

  globalThis.KT_INTERP = Object.freeze({
    ease, movePose, poseAt, project, quaternion, slerp, rotateAxis, wordState, wordShift, wordXform, wordMoving, wordClips,
    SHARP_EASE, backdropRect, backdropOpacity, propOpacityAt, propPoseAt, propScreenRects, stageVisible,
  });
})();
