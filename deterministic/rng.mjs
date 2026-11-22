// Deterministic named random streams (rulebook 4.3 and 4.5).
export function fnv1a(value) {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(String(value))) { h ^= b; h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const seedFor = (title, salt) => fnv1a(`${title.toLowerCase().replace(/[^a-z0-9]/g, '')}|${salt}`);
export const stream = (seed, stage, shotIndex, attempt = 0) => mulberry32(fnv1a(`${seed}|${stage}|${shotIndex}|${attempt}`));

export function weightedChoice(options, random, fallback = null) {
  const live = options.filter(x => x.weight > 0 && (x.valid ?? true));
  if (!live.length) {
    return options
      .filter(x => x.valid ?? true)
      .sort((a, b) => (b.base ?? 0) - (a.base ?? 0))[0]?.value ?? fallback;
  }
  let draw = random() * live.reduce((s, x) => s + x.weight, 0);
  for (const x of live) { draw -= x.weight; if (draw < 0) return x.value; }
  return live.at(-1).value;
}

// Draw all options into a single weighted order without replacement (rulebook 9.6).
export function weightedOrder(options, random) {
  const pool = options.filter(x => x.valid ?? true).map(x => ({ ...x }));
  const positive = pool.filter(x => x.weight > 0);
  const zero = pool.filter(x => !(x.weight > 0)).sort((a, b) => (b.base ?? 0) - (a.base ?? 0));
  const ordered = [];
  while (positive.length) {
    let total = 0;
    for (const item of positive) total += item.weight;
    let draw = random() * total;
    let pick = positive.length - 1;
    for (let i = 0; i < positive.length; i++) {
      draw -= positive[i].weight;
      if (draw < 0) { pick = i; break; }
    }
    ordered.push(positive.splice(pick, 1)[0].value);
  }
  for (const item of zero) ordered.push(item.value);
  return ordered;
}

// Cooldown factor from rulebook 9.4.3: n = decisions since last use (1 = last time), never used = 1.
export function cooldownFactor(lastUsedIndex, currentIndex, tau) {
  if (lastUsedIndex == null) return 1;
  const n = currentIndex - lastUsedIndex;
  if (n <= 0) return 1;
  return 1 - 0.9 * Math.exp(-n / tau);
}
