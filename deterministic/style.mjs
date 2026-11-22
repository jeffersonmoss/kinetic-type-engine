// Palette, measured font checks, and style assignment: rulebook section 12.
import { stream, weightedChoice, cooldownFactor } from './rng.mjs';

export const KIT = Object.freeze({ narrow: 'gothic', standard: 'anton', wide: 'wide', accent: 'collegiate' });

export function contrast(a, b) {
  const luminance = hex => {
    const rgb = hex.replace('#', '').match(/../g).map(x => parseInt(x, 16) / 255);
    const linear = rgb.map(x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const [x, y] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (x + 0.05) / (y + 0.05);
}

export function checkPalette(palette) {
  const check = (a, b, floor, label) => {
    const value = contrast(a, b);
    if (value < floor) throw Error(`${label}: ${value.toFixed(3)} < ${floor}`);
  };
  check(palette.panel, palette.ground, 1.35, 'panel / ground');
  check(palette.panel_side, palette.panel, 1.35, 'panel side / panel');
  for (const style of palette.styles) {
    for (const behind of style.kind === 'block' ? [style.colours.background] : [palette.panel, palette.ground]) {
      const color = style.on_panel && behind === palette.panel ? style.on_panel : style.colours.text;
      check(color, behind, 3, `${style.id} / ${behind}`);
    }
  }
  return true;
}

export function slotWidths(metrics) {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return Object.fromEntries(['narrow', 'standard', 'wide'].map(slot => {
    const f = metrics.fonts[KIT[slot]];
    if (!f) throw Error(`Missing metrics for ${KIT[slot]}`);
    return [slot, [...letters].reduce((sum, ch) => sum + (f.adv[ch] ?? f.fallback), 0) / letters.length / f.cap];
  }));
}

export function checkSlots(metrics) {
  const w = slotWidths(metrics);
  if (!(w.narrow < w.standard && w.standard < w.wide && w.wide >= 1.4 * w.narrow)) {
    throw Error(`Font width assertion failed: ${JSON.stringify(w)}`);
  }
  return w;
}

export function riderStyle(style, palette, surface) {
  const behind = style.kind === 'block' ? style.colours.background : surface === 'panel' ? palette.panel : palette.ground;
  if (style.kind !== 'outline' && contrast(style.colours.text, behind) >= 4.5) return style;
  if (style.kind !== 'outline' && style.on_panel && contrast(style.on_panel, behind) >= 4.5) {
    return { ...style, colours: { ...style.colours, text: style.on_panel } };
  }
  const plain = palette.styles.find(s => s.id === 'cream') ?? palette.styles.find(s => s.role === 'plain');
  if (!plain || contrast(plain.colours.text, surface === 'panel' ? palette.panel : palette.ground) < 4.5) {
    throw Error('No suitable plain rider style');
  }
  return plain;
}

function toOutlineTwin(style, styleById) {
  if (style.kind === 'outline') return style;
  if (style.outline_twin && styleById.has(style.outline_twin)) return styleById.get(style.outline_twin);
  if (style.flat_fill && styleById.has(style.flat_fill)) {
    const flat = styleById.get(style.flat_fill);
    if (flat.outline_twin && styleById.has(flat.outline_twin)) return styleById.get(flat.outline_twin);
  }
  if (style.role === 'hero' || style.role === 'accent') {
    // The palette's first accent outline (Room for One: sixers-outline).
    return [...styleById.values()].find(x => x.kind === 'outline' && x.role === 'accent') ?? style;
  }
  return styleById.get('cream-outline') ?? style;
}

function pinForWord(word, pins) {
  if (!pins) return null;
  if (pins[word.id]) return pins[word.id];
  if (pins[word.text]) return pins[word.text];
  return null;
}

// Assign initial styles per shot and word (rulebook 12.2).
// Surface-dependent contrast adjustments and post-fit block downgrades are resolved in resolveWordStyle.
export function assignStyles(shots, palette, seed, { pinnedShots = null } = {}) {
  const styleById = new Map(palette.styles.map(s => [s.id, s]));
  const primaryPool = palette.styles.filter(s => (s.role === 'hero' || s.role === 'accent') && s.kind !== 'outline');
  const plainStyles = palette.styles.filter(s => s.role === 'plain' && s.kind !== 'outline');
  const quietStyles = palette.styles.filter(s => s.role === 'quiet' && s.kind !== 'outline');
  const adlibStyles = (palette.voices?.adlib ?? ['cream', 'grey']).map(id => styleById.get(id)).filter(Boolean);
  const lastGroupShot = new Map();
  const shotDecisions = [];

  for (let si = 0; si < shots.length; si++) {
    const shot = shots[si];
    const pinned = pinnedShots?.[si]?.styles;
    const rng = stream(seed, 'style', si, 0);
    let primary, secondary, source = 'sampled';

    if (pinned) {
      primary = styleById.get(pinned.primary) ?? primaryPool[0];
      secondary = styleById.get(pinned.secondary) ?? plainStyles[0];
      source = 'pinned';
    } else if (shot.motifOf != null && shotDecisions[shot.motifOf]) {
      primary = styleById.get(shotDecisions[shot.motifOf].primary);
      secondary = styleById.get(shotDecisions[shot.motifOf].secondary);
      source = `motif:${shot.motifOf + 1}`;
    } else if (shot.echo && shotDecisions[si - 1]) {
      primary = styleById.get(shotDecisions[si - 1].primary);
      secondary = styleById.get(shotDecisions[si - 1].secondary);
      source = `echo:${si}`;
    } else {
      if (shot.adlib && adlibStyles.length) {
        const opts = adlibStyles.map(s => ({
          value: s,
          base: 1,
          weight: cooldownFactor(lastGroupShot.get(s.group), si, 2),
        }));
        primary = weightedChoice(opts, rng, adlibStyles[0]);
      } else {
        const opts = primaryPool.map(s => ({
          value: s,
          base: 1,
          weight: cooldownFactor(lastGroupShot.get(s.group), si, 2),
        }));
        primary = weightedChoice(opts, rng, primaryPool[0]);
      }
      const secRole = weightedChoice([
        { value: 'plain', base: 70, weight: 70 },
        { value: 'quiet', base: 30, weight: 30 },
      ], rng, 'plain');
      const secPool = secRole === 'quiet' && quietStyles.length ? quietStyles : plainStyles;
      secondary = secPool[Math.floor(rng() * secPool.length)] ?? plainStyles[0];
    }

    lastGroupShot.set(primary.group, si);

    // Top-tier anchor takes primary, other anchors take secondary; pins win first.
    let heroClusterIdx = 0;
    for (let ci = 1; ci < shot.clusters.length; ci++) {
      if (shot.clusters[ci].E > shot.clusters[heroClusterIdx].E) heroClusterIdx = ci;
    }

    const wordStyles = {};
    for (let ci = 0; ci < shot.clusters.length; ci++) {
      const c = shot.clusters[ci];
      const anchorPinId = pinForWord(c.anchor, palette.pins);
      let aStyle;
      let aPinned = false;
      if (anchorPinId && styleById.has(anchorPinId)) {
        aStyle = styleById.get(anchorPinId);
        aPinned = true;
      } else if (pinned?.words?.[c.anchor.id] && styleById.has(pinned.words[c.anchor.id])) {
        aStyle = styleById.get(pinned.words[c.anchor.id]);
      } else {
        aStyle = ci === heroClusterIdx ? primary : secondary;
        if (shot.isQuestion) aStyle = toOutlineTwin(aStyle, styleById);
      }
      c.anchor.styleObj = aStyle;
      c.anchor.style = aStyle.id;
      c.anchor.kind = aStyle.kind;
      c.anchor.stylePinned = aPinned;
      wordStyles[c.anchor.id] = aStyle.id;

      for (const r of c.riders) {
        const rPinId = pinForWord(r, palette.pins);
        let rStyle;
        if (rPinId && styleById.has(rPinId)) {
          rStyle = styleById.get(rPinId);
        } else if (aStyle.kind === 'block') {
          rStyle = quietStyles[0] ?? plainStyles[0];
        } else if (aStyle.kind === 'outline') {
          // Outline styles never on riders (12.2): take non-outline anchor chord style.
          const nonOutline = (ci === heroClusterIdx ? primary : secondary);
          rStyle = nonOutline.kind === 'outline' ? (plainStyles[0] ?? nonOutline) : nonOutline;
        } else {
          rStyle = aStyle;
        }
        r.styleObj = rStyle;
        r.style = rStyle.id;
        r.kind = rStyle.kind;
        wordStyles[r.id] = rStyle.id;
      }
    }

    shotDecisions.push({
      shot: si,
      primary: primary.id,
      secondary: secondary.id,
      source,
      words: wordStyles,
    });
  }

  return shotDecisions;
}

// Resolve final colours and post-fit block rule (12.1.3, 12.2) once final fitted caps and plaque surface are known.
export function resolvePlaqueWordStyles(plaqueWords, palette, surface) {
  const styleById = new Map(palette.styles.map(s => [s.id, s]));
  const anchorCaps = plaqueWords.filter(w => w.role !== 'rider').map(w => w.cap);
  const minCap = Math.min(...anchorCaps);
  const maxCap = Math.max(...anchorCaps);
  const midCap = (minCap + maxCap) / 2;
  const changes = [];

  for (const w of plaqueWords) {
    let style = styleById.get(w.style) ?? palette.styles[0];
    if (w.role !== 'rider' && style.kind === 'block' && !w.stylePinned && w.cap < midCap - 1e-6 && style.flat_fill && styleById.has(style.flat_fill)) {
      changes.push({ word: w.id, from: style.id, to: style.flat_fill, reason: 'block cap below top half of plaque range (12.2)' });
      style = styleById.get(style.flat_fill);
    }
    if (w.role === 'rider') {
      const checked = riderStyle(style, palette, surface);
      if (checked.id !== style.id || checked.colours.text !== style.colours.text) {
        changes.push({
          word: w.id,
          from: `${style.id}(${style.colours.text})`,
          to: `${checked.id}(${checked.colours.text})`,
          reason: 'rider contrast floor 4.5 (12.1.3)',
        });
      }
      style = checked;
    } else if (surface === 'panel' && style.on_panel) {
      style = { ...style, colours: { ...style.colours, text: style.on_panel } };
    }
    w.style = style.id;
    w.kind = style.kind;
    const cols = { ...style.colours };
    if (style.kind === 'outline') {
      cols.stroke = style.colours.text;
    }
    w.colours = cols;
  }
  return changes;
}
