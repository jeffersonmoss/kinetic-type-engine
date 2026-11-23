// Unit check for keywords.mjs: node --test test_keywords.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { keywordPlan, fastWordsOn } from './keywords.mjs';

const line = (texts, t0, step, line) => texts.map((text, k) => ({ text, start_s: t0 + k * step, end_s: t0 + (k + 1) * step, line }));

test('on by default; all_words and enabled:false switch it off', () => {
  assert.equal(fastWordsOn(undefined), true);
  assert.equal(fastWordsOn({ mode: 'all_words' }), false);
  assert.equal(fastWordsOn({ enabled: false }), false);
  const words = line('he can score he can pass he can shut you down'.split(' '), 0, 0.15, 0);
  assert.equal(keywordPlan(words, { mode: 'all_words' }).dropped.size, 0);
});

test('slow lines (about 3.5 words per second) are left whole', () => {
  const words = line('from a little town in maine to the dallas lights tonight'.split(' '), 0, 0.29, 0);
  const p = keywordPlan(words);
  assert.equal(p.stretches.length, 0);
  assert.equal(p.dropped.size, 0);
});

test('a fast line is detected, function words dropped, kept words spaced, rhyme word kept', () => {
  // 7 words per second for about 1.9 s
  const words = [...line('He can score, he can pass, he can shut you down'.split(' '), 10, 1 / 7, 3),
    ...line('Sing it for the Mavs, let me hear you loud'.split(' '), 10 + 11 / 7, 1 / 6, 4)];
  const p = keywordPlan(words);
  assert.equal(p.stretches.length, 1);
  assert.ok(p.stretches[0].peak > 4.5);
  const kept = words.filter((w, i) => !p.dropped.has(i)).map(w => w.text);
  const s0 = p.stretches[0];
  const keptInside = words.slice(s0.from, s0.to + 1).filter((w, k) => !p.dropped.has(s0.from + k)).map(w => w.text.toLowerCase().replace(/[^a-z']/g, ''));
  for (const w of ['he', 'you', 'it', 'the', 'for']) assert.ok(!keptInside.includes(w), `${w} dropped inside the stretch`);
  assert.ok(kept.includes('down'), 'the line-end rhyme word stays');
  assert.ok(kept.includes('loud'), 'the second line-end rhyme word stays');
  assert.ok(kept.includes('Mavs,'), 'a name stays');
  const keptT = words.map((w, i) => i).filter(i => i >= s0.from && i <= s0.to && !p.dropped.has(i)).map(i => words[i].start_s);
  for (let k = 1; k < keptT.length; k++) assert.ok(keptT[k] - keptT[k - 1] >= 0.4 - 1e-9, 'kept words at least 0.4 s apart');
});

test('names, numbers and keep-list words outrank others in a clash', () => {
  const words = line(['score', 'Mavs', 'and', 'run', '43', 'loud'], 0, 0.15, 0).map((w, i) => ({ ...w, line: i < 3 ? 0 : 1 }));
  // pad with fast filler so the stretch is long enough
  const fast = [...line(['go', 'go', 'go', 'go', 'go', 'go'], -0.9, 0.15, -1), ...words, ...line(['go', 'go', 'go', 'go', 'go', 'go'], 0.9, 0.15, 2)];
  const p = keywordPlan(fast, { keep: ['run'] });
  const kept = fast.map((w, i) => (p.dropped.has(i) ? null : w.text)).filter(Boolean);
  assert.ok(kept.includes('Mavs'));
  assert.ok(kept.includes('43'));
});

test('short bursts under 1.5 s are ignored', () => {
  const words = [...line(['a', 'b', 'c', 'd', 'e', 'f', 'g'], 0, 0.15, 0), ...line(['h', 'i'], 3, 0.6, 1)];
  assert.equal(keywordPlan(words).stretches.length, 0);
});

test('every line keeps at least one word', () => {
  const words = line(['and', 'the', 'of', 'to', 'in', 'on', 'at', 'a', 'an', 'it', 'so', 'just', 'or'], 0, 0.14, 0);
  const p = keywordPlan(words, { drop: ['and', 'the', 'of', 'to', 'in', 'on', 'at', 'a', 'an', 'it', 'so', 'just', 'or'] });
  assert.ok(words.some((w, i) => !p.dropped.has(i)));
});
