import fs from 'node:fs';
import path from 'node:path';
import './interp.js';
import { fullyShown } from './shown_gate.mjs';
import { pngAlphaBox } from './png_alpha.mjs';
import { isSongJerseyFont, nonJerseyAccentFont } from './style.mjs';

const IMAGE_TYPES = { '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.svg':'image/svg+xml' };
const SHARP_EASE = { a: 2, b: 4, x0: 0.34 };

const asset = (file, resolve, types) => {
  const filename = resolve(file), type = types[path.extname(filename).toLowerCase()];
  if (!type) throw Error(`Unsupported song appearance asset: ${filename}`);
  return `data:${type};base64,${fs.readFileSync(filename).toString('base64')}`;
};

// Natural size of a PNG (IHDR + alpha box), SVG (viewBox or width/height), JPEG (SOF), or WebP (VP8/VP8L/VP8X).
export function imageSize(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.png') {
    const b = fs.readFileSync(file), width = b.readUInt32BE(16), height = b.readUInt32BE(20);
    const a = pngAlphaBox(file);
    return { width, height, alpha: a && (a.y1 - a.y0 < 0.999 || a.x1 - a.x0 < 0.999) ? a : null };
  }
  if (ext === '.svg') {
    const t = fs.readFileSync(file, 'utf8'), tag = t.match(/<svg\b[^>]*>/i)?.[0] ?? '';
    const vb = tag.match(/\bviewBox\s*=\s*["']\s*[-\d.]+\s*[,\s]\s*[-\d.]+\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*["']/i);
    if (vb && +vb[1] > 0 && +vb[2] > 0) return { width: +vb[1], height: +vb[2], alpha: null };
    const wm = tag.match(/\bwidth\s*=\s*["']\s*([\d.]+)(?:px)?\s*["']/i), hm = tag.match(/\bheight\s*=\s*["']\s*([\d.]+)(?:px)?\s*["']/i);
    return wm && hm && +wm[1] > 0 && +wm[1] > 0 ? { width: +wm[1], height: +hm[1], alpha: null } : null;
  }
  if (ext === '.jpg' || ext === '.jpeg') {
    const b = fs.readFileSync(file);
    if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
    let o = 2;
    while (o + 4 < b.length) {
      while (o < b.length && b[o] === 0xff) o++;
      if (o >= b.length) break;
      const m = b[o++];
      if (m === 0xd9 || m === 0xda) break;
      if (m === 0x01 || (m >= 0xd0 && m <= 0xd8)) continue;
      if (o + 2 > b.length) break;
      const len = b.readUInt16BE(o);
      if (((m >= 0xc0 && m <= 0xc3) || (m >= 0xc5 && m <= 0xc7) || (m >= 0xc9 && m <= 0xcb) || (m >= 0xcd && m <= 0xcf)) && o + 7 < b.length) {
        return { width: b.readUInt16BE(o + 5), height: b.readUInt16BE(o + 3), alpha: null };
      }
      o += len;
    }
    return null;
  }
  if (ext === '.webp') {
    const b = fs.readFileSync(file);
    if (b.length < 30 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null;
    const tag = b.toString('ascii', 12, 16);
    if (tag === 'VP8X') return { width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)), alpha: null };
    if (tag === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff, alpha: null };
    if (tag === 'VP8L') { const bits = b.readUInt32LE(21); return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, alpha: null }; }
    return null;
  }
  return null;
}

export const WORDMARK_MARGIN = 0.25; // brief 12: even margin round a wordmark on a block, as a share of its ink height
export const DEFAULT_KEEP_CLEAR_MARGIN = 24; // brief 18: default screen-pixel keep-clear margin around prop hitBox

// Brief 17/18: compile optional song.backdrops and song.props into scene.backdrops, scene.props, and deduplicated
// scene.stageImages. When a song sets neither backdrops nor props, none of those keys are added to `scene`.
// Set embedImages: false to compile lightweight geometry only (for section-build keep-clear planning).
export function compileStageLayers(scene, song, resolve, { embedImages = true } = {}) {
  const fps = scene.meta.fps ?? 30;
  const frames = seconds => Math.round(seconds * fps);
  const songEndS = scene.meta.frames / fps;
  if (!(song.backdrops?.length) && !(song.props?.length)) return { backdrops: [], props: [] };

  const songMargin = song.keep_clear_margin_px ?? DEFAULT_KEEP_CLEAR_MARGIN;
  if (!Number.isFinite(songMargin) || songMargin < 0) {
    throw Error(`keep_clear_margin_px: must be a finite number >= 0 (got ${song.keep_clear_margin_px})`);
  }

  const stageImages = {}, stageByPath = new Map();
  const stageAsset = file => {
    const filename = resolve(file);
    if (!stageByPath.has(filename)) {
      const key = `stage${stageByPath.size + 1}`;
      if (embedImages) stageImages[key] = asset(file, resolve, IMAGE_TYPES);
      stageByPath.set(filename, key);
    }
    return { key: stageByPath.get(filename), filename };
  };
  const backdrops = [], backdropLines = [];
  for (let i = 0; i < (song.backdrops ?? []).length; i++) {
    const b = song.backdrops[i];
    if (!b?.image) throw Error(`backdrops[${i}]: missing image`);
    const fromS = b.from_s, toS = b.to_s ?? songEndS;
    const fadeInS = b.fade_in_s ?? 0, fadeOutS = b.fade_out_s ?? 0;
    const fit = b.fit ?? 'cover', opacity = b.opacity ?? 1;
    if (!Number.isFinite(fromS) || !Number.isFinite(toS) || fromS < 0 || toS <= fromS) {
      throw Error(`backdrops[${i}] (${b.image}): invalid from_s/to_s (${fromS}..${toS})`);
    }
    if (!Number.isFinite(fadeInS) || fadeInS < 0 || !Number.isFinite(fadeOutS) || fadeOutS < 0) {
      throw Error(`backdrops[${i}] (${b.image}): invalid fade_in_s/fade_out_s`);
    }
    if (!['cover', 'contain', 'stretch'].includes(fit)) throw Error(`backdrops[${i}]: unsupported fit "${fit}"`);
    if (!Number.isFinite(opacity) || opacity <= 0 || opacity > 1) throw Error(`backdrops[${i}]: opacity must be in (0, 1]`);
    const { key, filename } = stageAsset(b.image);
    const dims = imageSize(filename);
    if (!dims) throw Error(`backdrops[${i}]: could not read natural dimensions of ${filename}`);
    const rec = {
      id: b.id != null ? String(b.id) : String(i),
      image: key, label: path.basename(b.image),
      w: dims.width, h: dims.height, fit,
      start: frames(fromS), end: frames(toS),
      fadeIn: frames(fadeInS), fadeOut: frames(fadeOutS),
      opacity,
    };
    backdrops.push(rec);
    backdropLines.push(`[${i}] id=${rec.id} ${b.image} (${dims.width}x${dims.height}, ${fit}): ${fromS.toFixed(2)}-${toS.toFixed(2)} s (frames ${rec.start}-${rec.end - 1}), fade in ${fadeInS} s, fade out ${fadeOutS} s`);
  }
  if (backdrops.length) scene.backdrops = backdrops;

  const resolveBackdropRef = (r, label) => {
    const byId = backdrops.findIndex(b => b.id === String(r));
    if (byId >= 0) return byId;
    if (/^\d+$/.test(String(r))) {
      const idx = Number(r);
      if (idx >= 0 && idx < backdrops.length) return idx;
    }
    throw Error(`${label}: ref "${r}" does not match any backdrop (${backdrops.length} defined)`);
  };

  const props = [], propLines = [];
  for (let i = 0; i < (song.props ?? []).length; i++) {
    const p = song.props[i];
    if (!p?.image) throw Error(`props[${i}]: missing image`);
    const id = p.id != null ? String(p.id) : `prop${i + 1}`;
    const layer = p.layer ?? 'under_words';
    if (!['under_words', 'over_words'].includes(layer)) throw Error(`props[${i}] (${id}): unsupported layer "${layer}"`);
    const scale = p.scale ?? 1, opacity = p.opacity ?? 1;
    const anchorX = p.anchor_x ?? 0, anchorY = p.anchor_y ?? 0;
    const moveS = p.move_s ?? 0.4, keyMode = p.key_mode ?? 'step';
    if (p.keep_clear != null && typeof p.keep_clear !== 'boolean') throw Error(`props[${i}] (${id}): keep_clear must be boolean`);
    const keepClear = p.keep_clear !== false;
    const keepClearMarginPx = p.keep_clear_margin_px ?? songMargin;
    if (!Number.isFinite(keepClearMarginPx) || keepClearMarginPx < 0) {
      throw Error(`props[${i}] (${id}): keep_clear_margin_px must be a finite number >= 0`);
    }
    if (!Number.isFinite(scale) || scale <= 0) throw Error(`props[${i}] (${id}): scale must be > 0`);
    if (!Number.isFinite(opacity) || opacity <= 0 || opacity > 1) throw Error(`props[${i}] (${id}): opacity must be in (0, 1]`);
    if (!['step', 'span'].includes(keyMode)) throw Error(`props[${i}] (${id}): key_mode must be "step" or "span"`);
    const { key, filename } = stageAsset(p.image);
    const dims = imageSize(filename);
    if (!dims) throw Error(`props[${i}] (${id}): could not read natural dimensions of ${filename}`);

    // Resolve backdrop reference(s): index/id, array of indices/ids, "all", or omitted (screen space).
    let refIndices = [];
    if (p.ref === 'all') {
      if (!backdrops.length) throw Error(`props[${i}] (${id}): ref "all" requires at least one backdrop`);
      refIndices = backdrops.map((_, idx) => idx);
    } else if (Array.isArray(p.ref)) {
      refIndices = p.ref.map(r => resolveBackdropRef(r, `props[${i}] (${id})`));
    } else if (p.ref != null) {
      refIndices = [resolveBackdropRef(p.ref, `props[${i}] (${id})`)];
    }

    // Visibility windows: explicit windows, else explicit from_s/to_s, else inherited from ref backdrop(s), else whole song.
    let windows;
    if (Array.isArray(p.windows) && p.windows.length) {
      windows = p.windows.map((w, wi) => {
        const ws = w.from_s, we = w.to_s ?? songEndS;
        if (!Number.isFinite(ws) || !Number.isFinite(we) || ws < 0 || we <= ws) {
          throw Error(`props[${i}] (${id}) windows[${wi}]: invalid from_s/to_s`);
        }
        const ri = w.ref != null ? resolveBackdropRef(w.ref, `props[${i}] (${id}) windows[${wi}]`) : (refIndices[0] ?? -1);
        return { start: frames(ws), end: frames(we), fadeIn: frames(w.fade_in_s ?? 0), fadeOut: frames(w.fade_out_s ?? 0), refIndex: ri };
      });
    } else if (p.from_s != null || p.to_s != null) {
      const ws = p.from_s ?? 0, we = p.to_s ?? songEndS;
      if (!Number.isFinite(ws) || !Number.isFinite(we) || ws < 0 || we <= ws) {
        throw Error(`props[${i}] (${id}): invalid from_s/to_s (${ws}..${we})`);
      }
      windows = [{ start: frames(ws), end: frames(we), fadeIn: frames(p.fade_in_s ?? 0), fadeOut: frames(p.fade_out_s ?? 0), refIndex: refIndices[0] ?? -1 }];
    } else if (refIndices.length) {
      windows = refIndices.map(ri => {
        const b = backdrops[ri];
        return {
          start: b.start, end: b.end,
          fadeIn: p.fade_in_s != null ? frames(p.fade_in_s) : b.fadeIn,
          fadeOut: p.fade_out_s != null ? frames(p.fade_out_s) : b.fadeOut,
          refIndex: ri,
        };
      });
    } else {
      windows = [{ start: 0, end: scene.meta.frames, fadeIn: frames(p.fade_in_s ?? 0), fadeOut: frames(p.fade_out_s ?? 0), refIndex: -1 }];
    }

    // End move stay flag (brief 17 item 9): prop holds solid on its final window while its backdrop fades out underneath.
    if (p.stay && windows.length) {
      const last = windows[windows.length - 1];
      const stayEnd = p.stay_until_s != null ? frames(p.stay_until_s) : scene.meta.frames;
      last.end = Math.max(last.end, stayEnd);
      last.fadeOut = frames(p.fade_out_s ?? 0);
    }

    // Compile keyframes into motion segments. Default key_mode "step": key 0 sets the starting pose, and each later
    // key { t, y, x?, dur_s?, ease? } moves from the previous pose over dur_s (default move_s = 0.4 s) with SHARP_EASE
    // and holds still until the next key. key_mode "span" interpolates across [keys[k-1].t, keys[k].t].
    const rawKeys = (p.keys ?? []).map((k, ki) => {
      if (!Number.isFinite(k?.t) || !Number.isFinite(k?.y)) throw Error(`props[${i}] (${id}) keys[${ki}]: t and y must be finite numbers`);
      return { ...k, idx: ki };
    }).sort((a, b) => a.t - b.t || a.idx - b.idx);
    const baseX = p.x ?? 0;
    let x0 = rawKeys.length ? (rawKeys[0].x ?? baseX) : baseX;
    let y0 = rawKeys.length ? rawKeys[0].y : (p.y ?? 0);
    const segments = [];
    let prevX = x0, prevY = y0;
    for (let ki = 1; ki < rawKeys.length; ki++) {
      const k = rawKeys[ki];
      const nextX = k.x ?? prevX, nextY = k.y;
      const easeSpec = k.ease ?? p.ease ?? SHARP_EASE;
      if (keyMode === 'span') {
        segments.push({ f0: rawKeys[ki - 1].t * fps, f1: k.t * fps, x0: prevX, y0: prevY, x1: nextX, y1: nextY, ease: easeSpec });
      } else {
        const f0 = k.t * fps;
        const durF = Math.max(0, (k.dur_s ?? moveS) * fps);
        const maxF1 = ki + 1 < rawKeys.length ? rawKeys[ki + 1].t * fps : Infinity;
        const f1 = Math.min(f0 + durF, maxF1);
        segments.push({ f0, f1, x0: prevX, y0: prevY, x1: nextX, y1: nextY, ease: easeSpec });
      }
      prevX = nextX; prevY = nextY;
    }

    // Body hit box for the prop-covers-sung-word gate: explicit hit_box, else PNG opaque alpha from anchor_y downward
    // (excluding transparent space and thin suspension cables above anchor_y), else [0..w, anchor_y..h].
    let hitBox;
    if (p.hit_box) {
      hitBox = { x0: p.hit_box.x0, y0: p.hit_box.y0, x1: p.hit_box.x1, y1: p.hit_box.y1 };
    } else if (path.extname(filename).toLowerCase() === '.png') {
      const a = pngAlphaBox(filename, { minY: Math.max(0, Math.floor(anchorY)), alphaMin: 64 });
      hitBox = a
        ? { x0: a.x0 * dims.width, y0: a.y0 * dims.height, x1: a.x1 * dims.width, y1: a.y1 * dims.height }
        : { x0: 0, y0: anchorY, x1: dims.width, y1: dims.height };
    } else {
      hitBox = { x0: 0, y0: anchorY, x1: dims.width, y1: dims.height };
    }

    // Ripple source crop: defaults to the body from anchor_y down so a cable-hung prop ripples symmetrically from the
    // banner's own edge rather than scaling about the cable midpoint.
    const rippleBox = p.ripple_box
      ? { x0: p.ripple_box.x0, y0: p.ripple_box.y0, x1: p.ripple_box.x1, y1: p.ripple_box.y1 }
      : { x0: 0, y0: anchorY > 0 ? anchorY : 0, x1: dims.width, y1: dims.height };

    const pulses = (p.pulses ?? []).map((t, pi) => {
      if (!Number.isFinite(t)) throw Error(`props[${i}] (${id}) pulses[${pi}]: must be a finite number`);
      return t;
    }).sort((a, b) => a - b);

    const rec = {
      id, image: key, label: path.basename(p.image),
      w: dims.width, h: dims.height,
      anchorX, anchorY, scale, layer, opacity,
      keepClear, keepClearMarginPx,
      x0, y0, segments, windows, hitBox, rippleBox,
      ...(p.ripple ? { ripple: structuredClone(p.ripple) } : {}),
      ...(pulses.length ? { pulses } : {}),
    };
    props.push(rec);
    propLines.push(`${id} ${p.image} (${dims.width}x${dims.height}, anchor (${anchorX},${anchorY}), layer ${layer}, keep_clear ${keepClear ? `on (margin ${keepClearMarginPx} px)` : 'off'}, ref ${p.ref != null ? JSON.stringify(p.ref) : 'screen'}${p.stay ? ', stay' : ''}): ${rawKeys.length} keys (${keyMode}), ${pulses.length} pulses, hitBox [${Math.round(hitBox.x0)}..${Math.round(hitBox.x1)}, ${Math.round(hitBox.y0)}..${Math.round(hitBox.y1)}]`);
  }
  if (props.length) scene.props = props;
  if (embedImages && Object.keys(stageImages).length) scene.stageImages = stageImages;
  return { backdrops: backdropLines, props: propLines };
}

export function songAppearance(scene, song, resolve, firstOnset, { stageCompiled = null } = {}) {
  const fps = scene.meta.fps ?? 30;
  const introEnd = Math.round(firstOnset * fps);
  const frames = seconds => Math.round(seconds * fps);
  let intro = 'No pre-vocal introduction needed.';
  if (song.intro?.length && introEnd > 0) {
    let start = 0;
    scene.intro = song.intro.map(({ image, hold_s, dissolve_s = 0, dissolve_at_s, exit = 'cut' }, i, list) => {
      const last = i === list.length - 1;
      const hold = frames(hold_s), fade = frames(dissolve_s);
      const transition = dissolve_at_s == null ? start + hold : frames(dissolve_at_s);
      if (!(transition >= start + hold) || !(hold > 0) || !(fade >= 0) || !['cut','slide'].includes(exit) ||
          (last && (fade || dissolve_at_s != null || transition > introEnd)) || start >= introEnd || (!last && transition + fade >= introEnd)) {
        throw Error(`Invalid intro timing or exit in song settings.json, image ${i + 1}: ${image}`);
      }
      const end = last ? introEnd : transition + fade;
      // box: the image's opaque content (alpha over half) as fractions, so the viewer sizes and centres the badge
      // itself rather than the whole canvas; consecutive images then coincide through their dissolve.
      const box = path.extname(image).toLowerCase() === '.png' ? pngAlphaBox(resolve(image)) : null;
      const record = { start, end, fade, exit, fadeIn: frames(list[i-1]?.dissolve_s ?? 0), ...(box ? { box } : {}),
        src: asset(image, resolve, IMAGE_TYPES) };
      start = transition;
      return record;
    });
    scene.intro_motion = { push_per_s: song.intro_push_per_s ?? 0.045, drift: song.intro_drift ?? 0.06 };
    let rotNote = '';
    if (song.intro_rotation && song.intro_rotation !== false) {
      const r = song.intro_rotation;
      const fromDeg = Number(r.from_deg ?? -90), toDeg = Number(r.to_deg ?? 0), easeName = r.ease ?? 'inOutSine';
      if (!Number.isFinite(fromDeg) || !Number.isFinite(toDeg)) {
        throw Error(`Invalid intro_rotation degrees in song settings.json: ${JSON.stringify(r)}`);
      }
      if (!['inOutSine', 'inOutCubic', 'linear'].includes(easeName)) {
        throw Error(`Unsupported intro_rotation ease "${easeName}" in song settings.json`);
      }
      scene.intro_motion.rotation = { from_deg: fromDeg, to_deg: toDeg, ease: easeName };
      rotNote = ` Continuous rotation ${fromDeg}° -> ${toDeg}° (${easeName}) from frame 0 through frame ${introEnd - 1}, auto-fitted inside the 720 px short side.`;
    }
    intro = `${scene.intro.length} song images from frame 0 through frame ${introEnd - 1}, sized and centred on their opaque content (${scene.intro.map(x => x.box ? `${(100 * (x.box.x1 - x.box.x0)).toFixed(0)}% x ${(100 * (x.box.y1 - x.box.y0)).toFixed(0)}% of the image` : 'whole image').join('; ')}), one shared push of ${(100 * scene.intro_motion.push_per_s).toFixed(1)}% per second (${(100 * (Math.exp(Math.log1p(scene.intro_motion.push_per_s) * firstOnset) - 1)).toFixed(0)}% over the ${firstOnset.toFixed(1)} s intro) and a ${(100 * scene.intro_motion.drift).toFixed(0)}% frame-width drift.${rotNote}`;
  } else if (introEnd > 0) {
    scene.intro = [{ start:0, end:introEnd, fade:0, fadeIn:0, exit:'cut', title:song.title.trim() }];
    intro = `Title fallback from frame 0 through frame ${introEnd - 1}.`;
  }
  // Team wordmarks: a word that names a team (or its nickname) is drawn in that team's own lettering. `image` (the
  // official wordmark as a PNG, JPEG, WebP or SVG, ideally on a transparent background) wins over `font`; with
  // neither, the existing lettering is kept with the supplied colours and the report says so plainly.
  const wordmarks = [], fonts = {}, images = {};
  const overrideImageIndices = new Set(
    Object.entries(song.word_overrides ?? {})
      .filter(([, ov]) => ov && typeof ov === 'object' && ov.image)
      .map(([idx]) => Number(idx)),
  );
  const accentFace = nonJerseyAccentFont(song.jersey_font);
  const applyImageWordmark = (w, imageKey, style, dims, share) => {
    w.wordmark = {
      family: null,
      image: imageKey,
      colours: style.colours ?? {},
      letter_share: share,
      ...(style.target_height != null ? { target_height: style.target_height } : {}),
      ...(style.centre ? { centre: true } : {}),
    };
    if (isSongJerseyFont(w.font, song.jersey_font)) w.font = accentFace;
    if (style.ripple && w.ripple === undefined) w.ripple = structuredClone(style.ripple);
    if (dims) {
      const k = Math.min(w.w * 0.94 / dims.width, w.h * 0.9 / dims.height);
      w.cap = dims.height * k * share;
      w.wordmark.pre_cap = w.cap;
      w.wordmark.size = { w: dims.width, h: dims.height };
      const bg = style.colours?.background ?? w.colours?.background;
      const ink = dims.alpha ?? { x0: 0, y0: 0, x1: 1, y1: 1 };
      const aspect = (dims.width * (ink.x1 - ink.x0)) / (dims.height * (ink.y1 - ink.y0));
      const margin = bg ? WORDMARK_MARGIN : 0;
      let inkH = dims.height * k * (ink.y1 - ink.y0);
      const fit = Math.min(1, w.w / (inkH * (aspect + 2 * margin)), w.h / (inkH * (1 + 2 * margin)));
      inkH *= fit;
      w.w = inkH * (aspect + 2 * margin); w.h = inkH * (1 + 2 * margin); w.pad = margin * inkH;
      w.cap = inkH * (style.letter_share ?? 1);
      w.wordmark.ink = ink; w.wordmark.margin = margin;
    }
  };
  for (const [name, style] of Object.entries(song.team_wordmarks ?? {})) {
    const matched = scene.words.filter(w =>
      w.text.toUpperCase().replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g,'') === name.toUpperCase() &&
      !(w.map_index != null && overrideImageIndices.has(w.map_index)),
    );
    const family = `SongWordmark${wordmarks.length + 1}`;
    const image = style.image ? `wordmark${wordmarks.length + 1}` : null;
    if (image) images[image] = asset(style.image, resolve, IMAGE_TYPES);
    else if (style.font) fonts[family] = asset(style.font, resolve, {
      '.ttf':'font/ttf', '.otf':'font/otf', '.woff':'font/woff', '.woff2':'font/woff2',
    });
    // Brief 8 item 55: an image wordmark's letters are measured, not its box. The viewer fits the image into the box
    // (94% of its width, 90% of its height); the letters are letter_share of the image height (song setting, else the
    // PNG's alpha box for a transparent image, else 1). w.cap becomes that letter height, so Type rule 1 and the size
    // pass judge the lettering.
    const dims = image ? imageSize(resolve(style.image)) : null;
    const share = style.letter_share ?? (dims?.alpha ? dims.alpha.y1 - dims.alpha.y0 : 1);
    for (const w of matched) {
      if (image) {
        applyImageWordmark(w, image, style, dims, share);
      } else {
        w.wordmark = { family: style.font ? family : null, image: null, colours: style.colours ?? {} };
        if (isSongJerseyFont(w.font, song.jersey_font)) w.font = accentFace;
        if (style.ripple && w.ripple === undefined) w.ripple = structuredClone(style.ripple);
      }
    }
    const kinds = [...new Set(matched.map(w => (w.echo ? 'sung echo' : w.reveal_copy_of ? 'reveal copy' : 'lyric')))].join(', ');
    const used = image ? `IMAGE ${style.image}` : style.font ? `FONT ${style.font}` : 'NEITHER: no wordmark image or font supplied; existing lettering retained with supplied colours';
    wordmarks.push({ name, used: image ? 'image' : style.font ? 'font' : 'neither', words: matched.length,
      line: `${name} (${matched.length} scene words${kinds ? `: ${kinds}` : ''}): ${used}` });
  }
  // Brief 24: per-word image overrides in song.word_overrides.<map index>.image (e.g. a bespoke badge for one shout
  // without changing the other occurrences of that word).
  for (const [idxStr, ov] of Object.entries(song.word_overrides ?? {})) {
    if (!ov || typeof ov !== 'object' || !ov.image) continue;
    const idx = Number(idxStr);
    const matched = scene.words.filter(w => w.map_index === idx && !w.reveal_copy_of && !w.echo);
    const image = `wordimg_${idx}`;
    images[image] = asset(ov.image, resolve, IMAGE_TYPES);
    const dims = imageSize(resolve(ov.image));
    const share = ov.letter_share ?? (dims?.alpha ? dims.alpha.y1 - dims.alpha.y0 : 1);
    const style = { colours: ov.colours ?? { background: '' }, letter_share: ov.letter_share, ripple: ov.ripple, target_height: ov.target_height, centre: ov.centre };
    // Brief 25: image_steps [{ at_s, image }] swap the drawn image at those song times (a word mark revealed one
    // syllable at a time). Every step image must share the base image's canvas; the box and ink come from the LAST
    // step (the whole mark), so the parts sit at one scale and in their final places from the first frame.
    const steps = Array.isArray(ov.image_steps) ? ov.image_steps.filter(st => st && st.image && Number.isFinite(st.at_s)) : [];
    let sizeDims = dims, sizeShare = share;
    if (steps.length) {
      const lastFile = steps[steps.length - 1].image, lastDims = imageSize(resolve(lastFile));
      if (lastDims && dims && (lastDims.width !== dims.width || lastDims.height !== dims.height))
        throw Error(`word_overrides[${idx}].image_steps: ${lastFile} is ${lastDims.width}x${lastDims.height}, base ${ov.image} is ${dims.width}x${dims.height}; step images must share one canvas`);
      if (lastDims) { sizeDims = { ...lastDims }; sizeShare = ov.letter_share ?? (lastDims.alpha ? lastDims.alpha.y1 - lastDims.alpha.y0 : 1); }
    }
    for (const w of matched) {
      applyImageWordmark(w, image, style, sizeDims, sizeShare);
      if (steps.length) {
        const fps = scene.meta.fps ?? 30;
        w.wordmark.steps = steps.map((st, k) => {
          const key = `wordimg_${idx}_step${k + 1}`;
          images[key] = asset(st.image, resolve, IMAGE_TYPES);
          return { f: Math.round(st.at_s * fps), image: key };
        });
      }
    }
    const ids = matched.map(w => `${w.id} ${w.text}`).join(', ') || 'none';
    wordmarks.push({ name: `map#${idx}`, used: 'image', words: matched.length,
      line: `word_overrides[${idx}] (${ids}): IMAGE ${ov.image}` });
  }
  if (Object.keys(fonts).length) scene.wordmarkFonts = fonts;
  if (Object.keys(images).length) scene.wordmarkImages = images;

  // Brief 17/18: photographic backdrops and screen-space hoisted props (reuse earlier compileStageLayers if already run).
  const stage = stageCompiled ?? compileStageLayers(scene, song, resolve, { embedImages: true });
  const backdropLines = stage.backdrops, propLines = stage.props;

  let blank = 0;
  for (let f = 0; f < scene.meta.frames; f++) {
    if (scene.intro?.some(item => item.start <= f && f < item.end && (item.src || item.title))) break;
    if (globalThis.KT_INTERP.stageVisible?.(scene, f)) break;
    if (scene.words.some(w => !w.replaced_by && fullyShown(w, f, globalThis.KT_INTERP.poseAt(scene.cams,f), scene.meta.vfov ?? 40))) break;
    blank++;
  }
  return { intro, blank, pass: blank <= fps, wordmarks: wordmarks.map(x => x.line), wordmarkUse: wordmarks, backdrops: backdropLines, props: propLines };
}
