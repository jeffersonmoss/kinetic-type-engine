import fs from 'node:fs';
import path from 'node:path';
import { fullyShown } from './shown_gate.mjs';
import { pngAlphaBox } from './png_alpha.mjs';

const asset = (file, resolve, types) => {
  const filename = resolve(file), type = types[path.extname(filename).toLowerCase()];
  if (!type) throw Error(`Unsupported song appearance asset: ${filename}`);
  return `data:${type};base64,${fs.readFileSync(filename).toString('base64')}`;
};

// Natural size of a PNG (its IHDR, plus its alpha box when it has transparency) or an SVG (width and height attributes).
function imageSize(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.png') {
    const b = fs.readFileSync(file), width = b.readUInt32BE(16), height = b.readUInt32BE(20);
    const a = pngAlphaBox(file);
    return { width, height, alpha: a && (a.y1 - a.y0 < 0.999 || a.x1 - a.x0 < 0.999) ? a : null };
  }
  if (ext === '.svg') {
    const t = fs.readFileSync(file, 'utf8'), wm = t.match(/<svg[^>]*\swidth="([\d.]+)/), hm = t.match(/<svg[^>]*\sheight="([\d.]+)/);
    return wm && hm ? { width: +wm[1], height: +hm[1], alpha: null } : null;
  }
  return null;
}
export const WORDMARK_MARGIN = 0.25; // brief 12: even margin round a wordmark on a block, as a share of its ink height
export function songAppearance(scene, song, resolve, firstOnset) {
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
        src: asset(image, resolve, { '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.svg':'image/svg+xml' }) };
      start = transition;
      return record;
    });
    scene.intro_motion = { push_per_s: song.intro_push_per_s ?? 0.045, drift: song.intro_drift ?? 0.06 };
    intro = `${scene.intro.length} song images from frame 0 through frame ${introEnd - 1}, sized and centred on their opaque content (${scene.intro.map(x => x.box ? `${(100 * (x.box.x1 - x.box.x0)).toFixed(0)}% x ${(100 * (x.box.y1 - x.box.y0)).toFixed(0)}% of the image` : 'whole image').join('; ')}), one shared push of ${(100 * scene.intro_motion.push_per_s).toFixed(1)}% per second (${(100 * (Math.exp(Math.log1p(scene.intro_motion.push_per_s) * firstOnset) - 1)).toFixed(0)}% over the ${firstOnset.toFixed(1)} s intro) and a ${(100 * scene.intro_motion.drift).toFixed(0)}% frame-width drift.`;
  } else if (introEnd > 0) {
    scene.intro = [{ start:0, end:introEnd, fade:0, fadeIn:0, exit:'cut', title:song.title.trim() }];
    intro = `Title fallback from frame 0 through frame ${introEnd - 1}.`;
  }
  // Team wordmarks: a word that names a team (or its nickname) is drawn in that team's own lettering. `image` (the
  // official wordmark as a PNG, JPEG, WebP or SVG, ideally on a transparent background) wins over `font`; with
  // neither, the existing lettering is kept with the supplied colours and the report says so plainly.
  const wordmarks = [], fonts = {}, images = {};
  const IMAGE_TYPES = { '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.svg':'image/svg+xml' };
  for (const [name, style] of Object.entries(song.team_wordmarks ?? {})) {
    const matched = scene.words.filter(w => w.text.toUpperCase().replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g,'') === name.toUpperCase());
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
      w.wordmark = { family: !image && style.font ? family : null, image, colours: style.colours ?? {}, ...(image ? { letter_share: share } : {}) };
      // Brief 13: per-wordmark ripple style (e.g. ghost ripple for an image wordmark); a per-word override wins.
      if (style.ripple && w.ripple === undefined) w.ripple = structuredClone(style.ripple);
      if (dims) {
        const k = Math.min(w.w * 0.94 / dims.width, w.h * 0.9 / dims.height);
        w.cap = dims.height * k * share;
        w.wordmark.pre_cap = w.cap; // letter height before any block cut, for the wordmark growth pass (brief 12/14)
        // Brief 12 item 1.1: a wordmark image on a block sits centred with an even margin on all four sides, measured
        // from the artwork's ink (its alpha box, else the whole image), not its file box. The box is cut to the ink's
        // shape plus WORDMARK_MARGIN x the ink height on every side, about its centre, and never grows (so it adds no
        // overlap); the viewer draws the ink into that inner rectangle.
        const bg = style.colours?.background ?? w.colours?.background;
        if (bg) {
          const ink = dims.alpha ?? { x0: 0, y0: 0, x1: 1, y1: 1 };
          const aspect = (dims.width * (ink.x1 - ink.x0)) / (dims.height * (ink.y1 - ink.y0));
          let inkH = dims.height * k * (ink.y1 - ink.y0);
          const fit = Math.min(1, w.w / (inkH * aspect + 2 * WORDMARK_MARGIN * inkH), w.h / (inkH * (1 + 2 * WORDMARK_MARGIN)));
          inkH *= fit;
          w.w = inkH * aspect + 2 * WORDMARK_MARGIN * inkH; w.h = inkH * (1 + 2 * WORDMARK_MARGIN); w.pad = WORDMARK_MARGIN * inkH;
          w.cap = inkH * (style.letter_share ?? 1);
          w.wordmark.ink = ink; w.wordmark.margin = WORDMARK_MARGIN;
        }
      }
    }
    const kinds = [...new Set(matched.map(w => (w.echo ? 'sung echo' : w.reveal_copy_of ? 'reveal copy' : 'lyric')))].join(', ');
    const used = image ? `IMAGE ${style.image}` : style.font ? `FONT ${style.font}` : 'NEITHER: no wordmark image or font supplied; existing lettering retained with supplied colours';
    wordmarks.push({ name, used: image ? 'image' : style.font ? 'font' : 'neither', words: matched.length,
      line: `${name} (${matched.length} scene words${kinds ? `: ${kinds}` : ''}): ${used}` });
  }
  if (Object.keys(fonts).length) scene.wordmarkFonts = fonts;
  if (Object.keys(images).length) scene.wordmarkImages = images;
  let blank = 0;
  for (let f = 0; f < scene.meta.frames; f++) {
    if (scene.intro?.some(item => item.start <= f && f < item.end && (item.src || item.title))) break;
    if (scene.words.some(w => !w.replaced_by && fullyShown(w, f, globalThis.KT_INTERP.poseAt(scene.cams,f), scene.meta.vfov ?? 40))) break;
    blank++;
  }
  return { intro, blank, pass: blank <= fps, wordmarks: wordmarks.map(x => x.line), wordmarkUse: wordmarks };
}
