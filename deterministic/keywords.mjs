// Keyword mode for fast words (Raise the Flagg feature request, 22 November 2026; Jefferson: on by default, "If it's a
// problem, it's a problem"). When words are sung too fast to register, only the important ones are shown.
// Song settings: fast_words { mode: "keywords" (default) | "all_words", enabled?, rate_on 4.5, rate_off 3.5,
// window_s 2.0, min_stretch_s 1.5, min_gap_s 0.4, keep [], drop [] }. Generic; no song names.
//
// Detection: a word's rate is the number of sung words starting in a window_s window centred on its start, divided by
// window_s. A stretch starts at the first word over rate_on and runs while the rate stays at or above rate_off
// (hysteresis). Stretches shorter than min_stretch_s (first start to last end) are ignored.
// Keep (inside a stretch): names and nicknames, numbers, the rhyme word at each line end, nouns and main verbs, and
// words the song pins or lists in `keep`. Drop: function words (FUNCTION_WORDS plus `drop`). Spacing: kept words start
// at least min_gap_s apart; when two are closer, the higher-ranked stays (name or number 3, rhyme word 2, other 1;
// ties keep the earlier). Every line keeps at least one word.

export const FUNCTION_WORDS = ['a', 'an', 'the', 'to', 'of', 'in', 'on', 'at', 'and', 'but', 'or', 'is', 'are', 'was',
  'it', 'he', 'his', "he's", 'i', "i'm", 'you', 'we', 'my', 'your', 'that', 'with', 'for', 'from', 'so', 'just',
  // the same classes (pronouns, auxiliaries, prepositions, conjunctions, contractions), beyond the request's examples
  'its', "it's", "that's", 'this', 'me', 'him', 'her', 'she', "she's", 'they', 'them', 'their', "they're", 'our', 'us',
  "we're", "you're", "i'll", "you'll", "he'll", 'be', 'been', 'am', 'were', 'have', 'has', 'had', 'do', 'does', 'did',
  'can', 'will', 'would', 'could', 'should', 'by', 'as', 'if', 'than', 'into', 'onto'];
export const FAST_DEFAULTS = { rate_on: 4.5, rate_off: 3.5, window_s: 2.0, min_stretch_s: 1.5, min_gap_s: 0.4 };

const norm = t => String(t).toLowerCase().replace(/[‘’]/g, "'").replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, '').replace(/^'+|'+$/g, '');

export function fastWordsOn(settings) {
  const f = settings ?? {};
  return f.enabled !== false && (f.mode ?? 'keywords') !== 'all_words';
}

// words: [{text, start_s, end_s, line}] in sung order (the corrected song map's words). names: extra name or number
// texts (team wordmarks, pinned words, display numbers). Returns { on, stretches, dropped: Set of word indexes, log }.
export function keywordPlan(words, settings = {}, { names = [] } = {}) {
  const opt = { ...FAST_DEFAULTS, ...settings };
  const out = { on: fastWordsOn(settings), stretches: [], dropped: new Set(), log: [] };
  if (!out.on || !words.length) return out;
  const half = opt.window_s / 2;
  const rate = words.map(w => words.filter(x => Math.abs(x.start_s - w.start_s) <= half).length / opt.window_s);
  // Stretches with hysteresis.
  for (let i = 0; i < words.length; i++) {
    if (rate[i] <= opt.rate_on) continue;
    let j = i;
    while (j + 1 < words.length && rate[j + 1] >= opt.rate_off) j++;
    const start = words[i].start_s, end = words[j].end_s ?? words[j].start_s;
    if (end - start >= opt.min_stretch_s) out.stretches.push({ from: i, to: j, start, end, peak: Math.max(...rate.slice(i, j + 1)) });
    i = j;
  }
  const keepSet = new Set([...(opt.keep ?? []), ...names].map(norm));
  const dropSet = new Set([...FUNCTION_WORDS, ...(opt.drop ?? [])].map(norm));
  // Names: the map is in sentence case, so a capital at a line start says nothing. A word is a name when it is written
  // in capitals (two letters or more, e.g. KCP), or is capitalised somewhere other than a line start in the song.
  for (let i = 0; i < words.length; i++) {
    const raw = String(words[i].text).replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9']+$/g, ''), t = norm(words[i].text);
    const lineStart = i === 0 || words[i - 1].line !== words[i].line || /[.!?]['")]*$/.test(String(words[i - 1].text));
    if (dropSet.has(t)) continue;
    if ((raw.length >= 2 && /^[A-Z0-9']+$/.test(raw) && /[A-Z]/.test(raw)) || (!lineStart && /^[A-Z]/.test(raw))) keepSet.add(t);
  }
  const lineEnd = new Set();
  for (let i = 0; i < words.length; i++) if (i === words.length - 1 || words[i + 1].line !== words[i].line) lineEnd.add(i);
  const rank = i => {
    const t = norm(words[i].text);
    if (keepSet.has(t) || /\d/.test(t)) return 3;
    if (lineEnd.has(i)) return 2;
    return 1;
  };
  for (const s of out.stretches) {
    const kept = [];
    for (let i = s.from; i <= s.to; i++) {
      const t = norm(words[i].text);
      if (dropSet.has(t) && !keepSet.has(t) && !lineEnd.has(i)) { out.dropped.add(i); out.log.push({ i, text: words[i].text, t: words[i].start_s, why: 'function word' }); continue; }
      const r = rank(i);
      const prev = kept.at(-1);
      if (prev && words[i].start_s - words[prev.i].start_s < opt.min_gap_s) {
        if (r > prev.r) {
          kept.pop(); out.dropped.add(prev.i);
          out.log.push({ i: prev.i, text: words[prev.i].text, t: words[prev.i].start_s, why: `under ${opt.min_gap_s} s before ${words[i].text}, which ranks higher` });
          // the promoted word must also clear the one kept before it
          const before = kept.at(-1);
          if (before && words[i].start_s - words[before.i].start_s < opt.min_gap_s && before.r >= r) {
            out.dropped.add(i); out.log.push({ i, text: words[i].text, t: words[i].start_s, why: `under ${opt.min_gap_s} s after ${words[before.i].text}` }); continue;
          }
          kept.push({ i, r });
        } else {
          out.dropped.add(i);
          out.log.push({ i, text: words[i].text, t: words[i].start_s, why: `under ${opt.min_gap_s} s after ${words[prev.i].text}` });
        }
        continue;
      }
      kept.push({ i, r });
    }
    // Every line keeps at least one word: restore the highest-ranked dropped word of an emptied line.
    const lines = [...new Set(words.slice(s.from, s.to + 1).map(w => w.line))];
    for (const l of lines) {
      const idx = []; for (let i = s.from; i <= s.to; i++) if (words[i].line === l) idx.push(i);
      const lineAll = words.map((w, i) => i).filter(i => words[i].line === l);
      if (lineAll.some(i => !out.dropped.has(i))) continue;
      const best = idx.sort((a, b) => rank(b) - rank(a) || a - b)[0];
      out.dropped.delete(best);
      out.log = out.log.filter(x => x.i !== best);
    }
    s.dropped = [...out.dropped].filter(i => i >= s.from && i <= s.to).length;
  }
  out.log.sort((a, b) => a.t - b.t);
  return out;
}
