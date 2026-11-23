import fs from 'node:fs';
import path from 'node:path';
import { fullyShown } from './shown_gate.mjs';

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
      const record = { start, end, fade, exit, fadeIn: frames(list[i-1]?.dissolve_s ?? 0),
        src: asset(image, resolve, { '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.svg':'image/svg+xml' }) };
      start = transition;
      return record;
    });
    intro = `${scene.intro.length} song images from frame 0 through frame ${introEnd - 1}.`;
  } else if (introEnd > 0) {
    scene.intro = [{ start:0, end:introEnd, fade:0, fadeIn:0, exit:'cut', title:song.title.trim() }];
    intro = `Title fallback from frame 0 through frame ${introEnd - 1}.`;
  }
  const wordmarks = [], fonts = {};
  for (const [name, style] of Object.entries(song.team_wordmarks ?? {})) {
    const matched = scene.words.filter(w => w.text.toUpperCase().replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g,'') === name.toUpperCase());
    const family = `SongWordmark${wordmarks.length + 1}`;
    if (style.font) fonts[family] = asset(style.font, resolve, {
      '.ttf':'font/ttf', '.otf':'font/otf', '.woff':'font/woff', '.woff2':'font/woff2',
    });
    for (const w of matched) {
      w.wordmark = { family: style.font ? family : null, colours: style.colours ?? {} };
    }
    wordmarks.push(`${name} (${matched.length} scene words): ${style.font ?? 'MISSING wordmark font; existing lettering retained with supplied colours'}`);
  }
  if (Object.keys(fonts).length) scene.wordmarkFonts = fonts;
  let blank = 0;
  for (let f = 0; f < scene.meta.frames; f++) {
    if (scene.intro?.some(item => item.start <= f && f < item.end && (item.src || item.title))) break;
    if (scene.words.some(w => !w.replaced_by && fullyShown(w, f, globalThis.KT_INTERP.poseAt(scene.cams,f), scene.meta.vfov ?? 40))) break;
    blank++;
  }
  return { intro, blank, pass: blank <= fps, wordmarks };
}
