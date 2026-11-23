import fs from 'node:fs';
import path from 'node:path';
import { fullyShown } from './shown_gate.mjs';
import { pngAlphaBox } from './png_alpha.mjs';

const asset = (file, resolve, types) => {
  const filename = resolve(file), type = types[path.extname(filename).toLowerCase()];
  if (!type) throw Error(`Unsupported song appearance asset: ${filename}`);
  return `data:${type};base64,${fs.readFileSync(filename).toString('base64')}`;
};

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
    intro = `${scene.intro.length} song images from frame 0 through frame ${introEnd - 1}, sized and centred on their opaque content (${scene.intro.map(x => x.box ? `${(100 * (x.box.x1 - x.box.x0)).toFixed(0)}% x ${(100 * (x.box.y1 - x.box.y0)).toFixed(0)}% of the image` : 'whole image').join('; ')}), one shared push of ${(100 * scene.intro_motion.push_per_s).toFixed(0)}% per second (${(100 * (Math.exp(Math.log1p(scene.intro_motion.push_per_s) * firstOnset) - 1)).toFixed(0)}% over the ${firstOnset.toFixed(1)} s intro) and a ${(100 * scene.intro_motion.drift).toFixed(0)}% frame-width drift.`;
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
    for (const w of matched) {
      w.wordmark = { family: !image && style.font ? family : null, image, colours: style.colours ?? {} };
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
