// Word segmentation and emphasis: sections 5 and 6 of the rulebook.
const functions = new Set(
  "THE A AN OF TO AND IN ON AT FOR BY WITH FROM AS OR BUT SO IF HIS HER ITS MY YOUR OUR HE SHE IT WE YOU I ME HIM THEM THEY IS ARE WAS BE CAN THAT THIS THEN THAN HE'S SHE'S IT'S THAT'S HE'LL".split(' ')
);
const clean = s => s.toUpperCase().replace(/[,.:;"“”()]/g, '');
const norm = s => clean(s).replace(/[!?]/g, '');
const median = a => {
  const b = [...a].sort((x, y) => x - y);
  return b.length ? (b[(b.length - 1) >> 1] + b[b.length >> 1]) / 2 : 0;
};
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const RIDER_FLOOR = 0.20;

function adlibs(input) {
  const result = new Map();
  for (const line of input.lines ?? []) {
    let inside = false, index = 0;
    for (const token of (line.text ?? '').match(/\(|\)|[^\s()]+/g) ?? []) {
      if (token === '(') inside = true;
      else if (token === ')') inside = false;
      else {
        const id = line.words?.[index++];
        if (id !== undefined) result.set(id, inside);
      }
    }
  }
  return result;
}

export function planWords(input, map, clipEnd = input.song_end_of_hook ?? input.duration_s, title = map.song ?? '') {
  const ad = adlibs(input);
  const beat = 60 / map.tempo_bpm;
  const lineById = new Map((input.lines ?? []).map(line => [line.id, line]));
  const words = input.words.map((w, i) => {
    const text = clean(w.text);
    const baseText = norm(w.text);
    return {
      ...w,
      id: w.id ?? `w${String(i + 1).padStart(3, '0')}`,
      index: i,
      t: w.t ?? w.start_s,
      original: w.text,
      text,
      dropped: [...w.text].filter(ch => /[,.:;"“”()]/.test(ch)).join(''),
      section: w.section ?? lineById.get(w.line)?.section ?? null,
      adlib: ad.get(i) ?? false,
      isFunction: functions.has(baseText),
      isDigit: /^\d+$/.test(baseText),
    };
  });
  words.forEach((w, i) => { w.ioi = (words[i + 1]?.t ?? clipEnd) - w.t; });

  const lineMedians = new Map();
  for (const w of words) {
    if (!lineMedians.has(w.line)) lineMedians.set(w.line, []);
    lineMedians.get(w.line).push(w.ioi);
  }
  for (const [k, v] of lineMedians) lineMedians.set(k, median(v));

  words.forEach((w, i) => {
    const n = words[i + 1];
    const lineEnd = !n || n.line !== w.line;
    w.boundary = n && w.ioi < 0.04 ? 'B0'
      : !n ? 'B4'
      : ((w.section != null && n.section != null && w.section !== n.section) || (lineEnd && w.ioi >= 3 * beat) || w.ioi >= 6 * beat) ? 'B4'
      : lineEnd ? 'B3'
      : (w.adlib !== n.adlib
        || /[.!?]["')]*$/.test(w.original)
        || (/[,;:]["')]*$/.test(w.original) && w.ioi >= 0.45)
        || (w.ioi >= 0.9 && w.ioi >= 1.8 * lineMedians.get(w.line))
        || (norm(w.text) === norm(n.text) && w.ioi >= 0.38)) ? 'B2'
      : 'B1';
  });

  let spans = [], current = [];
  for (const w of words) {
    current.push(w);
    if (['B2', 'B3', 'B4'].includes(w.boundary)) { spans.push(current); current = []; }
  }
  if (current.length) spans.push(current);

  const makeClusters = span => {
    const rider = span.map((w, i) =>
      i < span.length - 1 && (
        w.ioi < 0.04 || (
          !/[!?]/.test(w.text)
          && !/^\d+$/.test(w.text)
          && (w.text.replace(/[^A-Z]/g, '').length < 7 || w.ioi < 0.20)
          && (w.ioi < 0.30 || (w.isFunction && w.ioi < 0.45))
        )
      )
    );
    for (let i = 0; i < rider.length;) {
      if (!rider[i]) { i++; continue; }
      let j = i;
      while (rider[j]) j++;
      if (j - i > 3) {
        let options = Array.from({ length: 4 }, (_, k) => i + k);
        const nf = options.filter(k => !span[k].isFunction);
        if (nf.length) options = nf;
        options.sort((a, b) => span[b].ioi - span[a].ioi || b - a);
        rider[options[0]] = false;
        i = options[0] + 1;
      } else i = j;
    }
    for (let i = 0; i < rider.length;) {
      if (!rider[i]) { i++; continue; }
      let j = i;
      while (rider[j]) j++;
      if (j - i >= 2 && j - i <= 3 && span.slice(i, j).every(w => !w.isFunction)) {
        for (let k = i; k < j; k++) { rider[k] = false; span[k].pickup = true; }
      }
      i = j;
    }
    let pending = [], clusters = [];
    span.forEach((w, i) => {
      if (rider[i]) pending.push(w);
      else {
        w.role = w.pickup ? 'pickup' : 'anchor';
        pending.forEach(r => { r.role = 'rider'; });
        clusters.push({ anchor: w, riders: pending });
        pending = [];
      }
    });
    return clusters;
  };

  spans = spans.map(span => ({
    words: span,
    clusters: makeClusters(span),
    boundary: span[0].index ? words[span[0].index - 1].boundary : null,
  }));

  const key = s => s.words.map(w => norm(w.text)).join(' ');
  let shots = [];
  for (let i = 0; i < spans.length;) {
    let j = i + 1;
    while (j < spans.length && key(spans[j]) === key(spans[i])) j++;
    let count = j - i;
    while (count >= 3) {
      const take = count === 6 ? 3 : Math.min(4, count);
      const part = spans.slice(i, i + take);
      shots.push({
        words: part.flatMap(s => s.words),
        clusters: part.flatMap(s => s.clusters),
        boundary: part[0].boundary,
        chant: true,
      });
      i += take;
      count -= take;
    }
    if (count === 2) {
      shots.push({ ...spans[i] }, { ...spans[i + 1], echo: true });
      i += 2;
    } else if (count === 1) {
      shots.push(spans[i]);
      i++;
    }
  }

  let split = [];
  for (const shot of shots) {
    let cs = shot.clusters;
    let firstPiece = true;
    while (cs.length > 5 || cs.reduce((n, c) => n + 1 + c.riders.length, 0) > 9) {
      const candidates = cs.slice(0, -1)
        .map((c, i) => ({ i: i + 1, ioi: c.anchor.ioi }))
        .filter(({ i }) => i <= 5 && cs.slice(0, i).reduce((n, c) => n + 1 + c.riders.length, 0) <= 9);
      candidates.sort((a, b) => b.ioi - a.ioi || Math.abs(a.i - cs.length / 2) - Math.abs(b.i - cs.length / 2));
      const at = candidates[0]?.i ?? 1;
      const part = cs.slice(0, at);
      split.push({
        ...shot,
        boundary: firstPiece ? shot.boundary : 'B2',
        echo: firstPiece ? shot.echo : false,
        clusters: part,
        words: part.flatMap(c => [...c.riders, c.anchor]),
      });
      cs = cs.slice(at);
      firstPiece = false;
    }
    split.push({
      ...shot,
      boundary: firstPiece ? shot.boundary : 'B2',
      echo: firstPiece ? shot.echo : false,
      clusters: cs,
      words: cs.flatMap(c => [...c.riders, c.anchor]),
    });
  }
  shots = split;

  // Tag shot indices, line metadata, adlib flag, question flag, motif and parallel-line links.
  const lineWordsMap = new Map();
  for (const w of words) {
    if (!lineWordsMap.has(w.line)) lineWordsMap.set(w.line, []);
    lineWordsMap.get(w.line).push(w);
  }
  const lineNormText = new Map();
  for (const [lineId, ws] of lineWordsMap) {
    lineNormText.set(lineId, ws.map(w => norm(w.text)).join(' '));
  }
  const lineOccurrences = new Map();
  for (const [lineId, txt] of lineNormText) {
    if (!lineOccurrences.has(txt)) lineOccurrences.set(txt, []);
    lineOccurrences.get(txt).push(lineId);
  }

  // Group shots by line to track shot offset within a repeated line (9.5.1) and opening shot per line (9.5.2).
  const shotsByLine = new Map();
  shots.forEach((shot, si) => {
    shot.index = si;
    shot.line = shot.words[0].line;
    shot.section = shot.words[0].section ?? null;
    shot.adlib = shot.words.every(w => w.adlib);
    shot.isQuestion = shot.words.at(-1).text.includes('?');
    shot.textKey = shot.words.map(w => norm(w.text)).join(' ');
    if (!shotsByLine.has(shot.line)) shotsByLine.set(shot.line, []);
    shot.lineShotOffset = shotsByLine.get(shot.line).length;
    shotsByLine.get(shot.line).push(shot);
  });

  // 9.5.1 Line motifs: a line whose normalised text occurred before replays the first occurrence.
  for (const [txt, lineIds] of lineOccurrences) {
    if (lineIds.length < 2) continue;
    const firstShots = shotsByLine.get(lineIds[0]) ?? [];
    for (let occ = 1; occ < lineIds.length; occ++) {
      const curShots = shotsByLine.get(lineIds[occ]) ?? [];
      const isSecond = occ === 1;
      const isLast = occ === lineIds.length - 1;
      curShots.forEach((shot, k) => {
        const ref = firstShots[k];
        if (ref && ref.textKey === shot.textKey) {
          shot.motifOf = ref.index;
          shot.motifOccurrence = occ + 1;
          shot.motifMirror = isSecond;
          shot.motifScale = isLast ? 1.25 : 1;
        }
      });
    }
  }

  // 9.5.2 Parallel lines: two lines in one section (or clip if no sections) whose opening shot's final anchor matches
  // (implements the rulebook's own example WHO'S STILL CHASING? / WHAT'S HE CHASING?).
  const seenOpeningAnchor = new Map();
  for (const shot of shots) {
    if (shot.lineShotOffset !== 0 || shot.chant || shot.echo || shot.motifOf != null) continue;
    if (shot.boundary == null) continue; // first shot of clip has no entering fold
    const finalAnchorNorm = norm(shot.clusters.at(-1).anchor.text);
    const scopeKey = `${shot.section ?? 'clip'}|${finalAnchorNorm}`;
    if (seenOpeningAnchor.has(scopeKey)) {
      shot.parallelOf = seenOpeningAnchor.get(scopeKey);
    } else {
      seenOpeningAnchor.set(scopeKey, shot.index);
    }
  }

  const clusters = shots.flatMap(s => s.clusters);
  clusters.forEach((c, i) => {
    c.index = i;
    c.owned = (clusters[i + 1]?.anchor.t ?? clipEnd) - c.anchor.t;
  });

  for (const shot of shots) {
    shot.groups = [];
    for (let i = 0; i < shot.clusters.length;) {
      let group = [shot.clusters[i++]];
      while (group.at(-1).owned < 0.467 && group.length < 3 && i < shot.clusters.length) {
        group.push(shot.clusters[i++]);
      }
      shot.groups.push(group);
    }
  }

  const titleWords = norm(title).split(/[^A-Z0-9]+/).filter(Boolean);
  const freq = new Map();
  for (const w of words) if (!w.isFunction) freq.set(norm(w.text), (freq.get(norm(w.text)) ?? 0) + 1);
  const frequent = [...freq].sort((a, b) => b[1] - a[1]).slice(0, 5).map(x => x[0]);
  const energy = c => {
    const e = map.energy_10hz ?? [];
    const s = Math.floor(c.anchor.t * 10);
    const a = e.slice(s, s + 5);
    return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  };
  const ordered = clusters.map(c => energy(c)).sort((a, b) => a - b);
  clusters.forEach((c, i) => {
    const w = c.anchor, next = clusters[i + 1]?.anchor;
    const final = !next || next.line !== w.line ? 1 : shots.some(s => s.clusters.at(-1) === c) ? 0.6 : 0;
    const punct = w.text.includes('!') ? 1 : w.text.includes('?') ? 0.7 : /[.,]/.test(w.original) ? 0.3 : 0;
    const rank = ordered.length > 1 ? ordered.filter(x => x < energy(c)).length / (ordered.length - 1) : 0;
    c.E = 0.30 * clamp((c.owned - 0.3) / 1.2, 0, 1)
      + 0.20 * final
      + 0.15 * punct
      + 0.15 * rank
      + 0.10 * ((map.strong_hits_s ?? []).some(t => Math.abs(t - w.t) <= 0.08) ? 1 : 0)
      + 0.10 * ((titleWords.includes(norm(w.text)) || frequent.includes(norm(w.text))) ? 1 : 0)
      - 0.25 * (w.isFunction ? 1 : 0);
    c.anchor.E = c.E;
  });

  const eligible = clusters.filter(c => !c.anchor.pickup);
  const whole = [...eligible].sort((a, b) => b.E - a.E || b.anchor.index - a.anchor.index);
  const bySection = new Map();
  for (const c of eligible) {
    const section = c.anchor.section;
    if (section !== null) {
      if (!bySection.has(section)) bySection.set(section, []);
      bySection.get(section).push(c);
    }
  }
  for (const group of bySection.values()) group.sort((a, b) => b.E - a.E || b.anchor.index - a.anchor.index);
  for (const c of eligible) {
    const section = bySection.get(c.anchor.section);
    const ranked = section?.length >= 4 ? section : whole;
    const p = (ranked.indexOf(c) + 1) / ranked.length;
    c.tier = p <= 0.15 ? 'XL' : p <= 0.45 ? 'L' : p <= 0.70 ? 'M' : 'S';
    c.cap = { XL: 1.5, L: 1, M: 0.68, S: 0.45 }[c.tier];
  }

  for (const shot of shots) {
    if (shot.chant) {
      let cap = Math.max(1, shot.clusters.at(-1).cap);
      for (let i = shot.clusters.length - 1; i >= 0; i--) {
        shot.clusters[i].cap = cap;
        cap = Math.max(0.45, cap / 1.25);
      }
    }
    for (let i = shot.clusters.length - 1; i >= 0; i--) {
      if (shot.clusters[i].anchor.pickup) {
        let j = i;
        while (j < shot.clusters.length && shot.clusters[j].anchor.pickup) j++;
        let target = shot.clusters[j];
        if (!target) {
          // Guard if shot-cap split separated a pickup from its target anchor.
          const gIdx = clusters.indexOf(shot.clusters[i]);
          let k = gIdx + 1;
          while (k < clusters.length && clusters[k].anchor.pickup) k++;
          target = clusters[k] ?? { cap: 1.0, tier: 'L' };
        }
        const dist = j - i;
        shot.clusters[i].cap = target.cap * ([0, 0.70, 0.55, 0.45][dist] ?? 0.45);
        shot.clusters[i].tier = target.tier;
      }
    }
    // Nominal caps on anchor and rider word objects (6.3). Riders never fall under RIDER_FLOOR of the shot's biggest
    // anchor (engine fix brief 4: at 0.13, riders read as specks and as lone small words before their anchor arrived).
    const maxAnchorCap = Math.max(...shot.clusters.map(c => c.cap));
    for (const c of shot.clusters) {
      c.anchor.cap = c.cap;
      c.anchor.tier = c.tier;
      for (const r of c.riders) {
        const ratio = (c.riders.length === 1 && r.ioi < 0.22) ? 0.32 : 0.42;
        r.cap = Math.max(c.cap * ratio, RIDER_FLOOR * maxAnchorCap);
      }
    }
    // Shot top tier (7.3).
    const tierOrder = { S: 0, M: 1, L: 2, XL: 3 };
    let topTier = 'S';
    for (const c of shot.clusters) {
      if (tierOrder[c.tier] > tierOrder[topTier]) topTier = c.tier;
    }
    shot.topTier = topTier;
  }

  return { words, shots, clusters };
}
