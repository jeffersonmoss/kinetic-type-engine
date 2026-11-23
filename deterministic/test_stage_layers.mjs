import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import './interp.js';
import { pngAlphaBox } from './png_alpha.mjs';
import { songAppearance, imageSize } from './song_appearance.mjs';
import { emptyFrames, placeInRoom, enforceMinSize, staticPartials } from './composition.mjs';
import { checkPropWordOverlap, scanOverlap } from './overlap_gate.mjs';
import { fullyShown, fitPoseInBox, fitPoseInClearArea, letterHeight, gateFailures } from './shown_gate.mjs';
import { frameClearOfProps, resolvePropOverlaps } from './keep_clear.mjs';

const I = globalThis.KT_INTERP;

// Minimal pure-Node RGBA PNG writer for self-contained tests (no external packages).
function makeRgbaPng(width, height, pixelFn) {
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[n] = c >>> 0;
  }
  const crc32 = buf => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const t = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 4);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelFn(x, y);
      raw[row + 1 + x * 4] = r;
      raw[row + 1 + x * 4 + 1] = g;
      raw[row + 1 + x * 4 + 2] = b;
      raw[row + 1 + x * 4 + 3] = a;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Minimal 1-plaque, 1-word 3D scene looking straight down -Z so screen projection is exact and easy to verify.
function makeTestScene({ frames = 180, fps = 30, wordX = 0, wordY = 0, wordW = 100, wordH = 60, onsetF = 60, wordOn = 55, wordOff = 120 } = {}) {
  const dist = 500; // at vfov=40, halfH = 500 * tan(20 deg) = 181.985 world units; halfW = halfH * 16/9 = 323.529
  const pose = { target: [0, 0, 0], R: [1, 0, 0], U: [0, 1, 0], N: [0, 0, 1], dist };
  return {
    meta: { fps, frames, vfov: 40 },
    cams: [{ f0: 0, f1: 0, verb: 'cut', from: pose, to: pose }],
    plaques: [{ id: 'p1', C: [0, 0, 0], R: [1, 0, 0], U: [0, 1, 0], N: [0, 0, 1], w: 600, h: 300, surface: 'panel', on: 0, off: null }],
    words: [{
      id: 'w01', text: 'RAISE', plaque: 'p1',
      C: [wordX, wordY, 0], R: [1, 0, 0], U: [0, 1, 0], N: [0, 0, 1],
      w: wordW, h: wordH, cap: wordH * 0.8, font: 'anton', fontPx: 1,
      style: 'cream', on: wordOn, off: wordOff, t: onsetF / fps,
      joint: { prim: 'pop', f0: wordOn, f1: wordOn },
    }],
  };
}

let tmpDir, backdropFile, propFile;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kte-brief17-test-'));
  fs.writeFileSync(path.join(tmpDir, 'TEMP_README.md'), 'owner: test_stage_layers.mjs\npurpose: synthetic PNG fixtures for brief 17 unit tests\nneeded until: test run ends\n');
  // 160x90 opaque backdrop (exact 16:9; scales x8 onto 1280x720)
  backdropFile = path.join(tmpDir, 'backdrop.png');
  fs.writeFileSync(backdropFile, makeRgbaPng(160, 90, () => [20, 30, 50, 255]));
  // 40x160 cable-hung prop: two 2px cables at x=4..5 and x=34..35 for y=0..99; solid banner at x=4..35, y=100..155
  propFile = path.join(tmpDir, 'prop.png');
  fs.writeFileSync(propFile, makeRgbaPng(40, 160, (x, y) => {
    if (y >= 100 && y <= 155 && x >= 4 && x <= 35) return [240, 240, 240, 255];
    if (y < 100 && ((x >= 4 && x <= 5) || (x >= 34 && x <= 35))) return [120, 120, 120, 200];
    return [0, 0, 0, 0];
  }));
});

after(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('brief 17: photographic backdrops and hoisted props', () => {
  it('pngAlphaBox supports minY to measure banner body below suspension cables', () => {
    const full = pngAlphaBox(propFile);
    assert.equal(full.y0, 0);
    const body = pngAlphaBox(propFile, { minY: 100, alphaMin: 64 });
    assert.equal(Math.round(body.x0 * 40), 4);
    assert.equal(Math.round(body.x1 * 40), 36);
    assert.equal(Math.round(body.y0 * 160), 100);
    assert.equal(Math.round(body.y1 * 160), 156);
    assert.deepEqual(imageSize(backdropFile), { width: 160, height: 90, alpha: null });
  });

  it('leaves scenes completely untouched when no backdrops or props are configured', () => {
    const scene = makeTestScene();
    const res = songAppearance(scene, { title: 'Plain Song' }, f => path.resolve(tmpDir, f), 1.0);
    assert.equal(scene.backdrops, undefined);
    assert.equal(scene.props, undefined);
    assert.equal(scene.stageImages, undefined);
    assert.deepEqual(res.backdrops, []);
    assert.deepEqual(res.props, []);
    assert.equal(I.stageVisible(scene, 0), false);
    assert.deepEqual(checkPropWordOverlap(scene, w => Math.round(w.t * 30)), { violations: [], pass: true });
  });

  it('compiles backdrops and props, deduplicates stageImages, and evaluates sharp-eased step keys + stay end move', () => {
    const scene = makeTestScene({ frames: 300, fps: 30 }); // 10 s
    const song = {
      title: 'Hoist Test',
      backdrops: [
        { id: 'ch1', image: 'backdrop.png', from_s: 1.0, to_s: 4.0, fit: 'cover', fade_in_s: 0.2, fade_out_s: 0.2 },
        { id: 'ch2', image: 'backdrop.png', from_s: 6.0, to_s: 9.0, fit: 'cover', fade_in_s: 0.2, fade_out_s: 1.0 },
      ],
      props: [
        {
          id: 'banner',
          image: 'prop.png',
          ref: ['ch1', 'ch2'],
          x: 100,
          anchor_y: 100,
          move_s: 0.4,
          keys: [
            { t: 1.0, y: 60 },
            { t: 2.0, y: 40 },
            { t: 7.0, y: 10, dur_s: 0.5 },
          ],
          stay: true,
          ripple: { kind: 'ghost', edge: '#D8DCDF', fill: '#00538C', edge_opacity: 0.9, fill_opacity: 0.6, behind: true },
          pulses: [2.0, 7.0],
          layer: 'under_words',
        },
      ],
    };
    const res = songAppearance(scene, song, f => path.resolve(tmpDir, f), 0);
    assert.equal(scene.backdrops.length, 2);
    assert.equal(scene.props.length, 1);
    // Two backdrop entries share the same file -> only 2 unique stageImages (backdrop + prop)
    assert.equal(Object.keys(scene.stageImages).length, 2);
    assert.equal(scene.backdrops[0].image, scene.backdrops[1].image);
    assert.equal(res.backdrops.length, 2);
    assert.equal(res.props.length, 1);

    const p = scene.props[0];
    // Hit box is trimmed to the banner body (y=100..156), excluding cables above y=100
    assert.equal(Math.round(p.hitBox.y0), 100);
    assert.equal(Math.round(p.hitBox.y1), 156);
    assert.equal(Math.round(p.hitBox.x0), 4);
    assert.equal(Math.round(p.hitBox.x1), 36);
    // Ripple box crops from anchor_y down
    assert.deepEqual(p.rippleBox, { x0: 0, y0: 100, x1: 40, y1: 160 });

    // Keyframe step motion: holds at y=60 until t=2.0 (f=60), sharp-eases to y=40 over f=60..72, holds still until f=210
    assert.equal(I.propPoseAt(p, 30).y, 60);
    assert.equal(I.propPoseAt(p, 59).y, 60);
    assert.equal(I.propPoseAt(p, 59).moving, false);
    const mid = I.propPoseAt(p, 64); // u = 4/12 = 0.333, sharp ease accelerates fast early
    assert.equal(mid.moving, true);
    assert.ok(mid.y < 52 && mid.y > 40, `expected sharp-eased y between 40 and 52, got ${mid.y}`);
    assert.equal(I.propPoseAt(p, 72).y, 40);
    assert.equal(I.propPoseAt(p, 150).y, 40);
    assert.equal(I.propPoseAt(p, 150).moving, false);
    // Final lift at t=7.0 (f=210) over 0.5 s (15 frames -> f=225) to y=10
    assert.equal(I.propPoseAt(p, 225).y, 10);

    // Backdrop-to-screen registration: 160x90 cover onto 1280x720 = exact x8 scale, ox=0, oy=0
    const st = I.propScreenRects(p, 225, scene.backdrops, 1280, 720);
    assert.ok(st);
    assert.equal(st.opacity, 1);
    assert.equal(st.draw.x, 800); // x=100 * 8
    assert.equal(st.draw.y, (10 - 100) * 8); // rod (prop y=100) lands at backdrop y=10 -> screen y=80
    assert.equal(st.hit.y0, 80); // rod top at screen y=80
    assert.equal(st.hit.y1, (10 + 56) * 8); // banner bottom at screen y=528

    // Between choruses (f=150, t=5.0 s): neither backdrop nor prop is visible
    assert.equal(I.backdropOpacity(scene.backdrops[0], 150), 0);
    assert.equal(I.backdropOpacity(scene.backdrops[1], 150), 0);
    assert.equal(I.propScreenRects(p, 150, scene.backdrops), null);

    // End move with stay: true: during backdrop 2 fade-out (t=8.0..9.0, f=240..270) and after (f=270..299),
    // backdrop fades to 0 while prop stays at opacity 1.0 all the way to the last frame!
    assert.ok(I.backdropOpacity(scene.backdrops[1], 255) < 0.6 && I.backdropOpacity(scene.backdrops[1], 255) > 0.4);
    assert.equal(I.backdropOpacity(scene.backdrops[1], 280), 0);
    assert.equal(I.propOpacityAt(p, 255).opacity, 1);
    assert.equal(I.propOpacityAt(p, 299).opacity, 1);
  });

  it('existing gates treat backdrop (and stayed prop) as non-dead screen, and backdrop does not trigger word overlap', () => {
    // Word only shown on frames 10..20, leaving frames 0..9 and 21..179 with no words.
    const scene = makeTestScene({ frames: 180, fps: 30, wordOn: 10, wordOff: 20, onsetF: 12 });
    const song = {
      title: 'Empty Gate Test',
      backdrops: [
        { image: 'backdrop.png', from_s: 1.0, to_s: 4.0, fit: 'cover', fade_in_s: 0, fade_out_s: 0.5 },
      ],
      props: [
        { image: 'prop.png', ref: 0, x: 100, anchor_y: 100, keys: [{ t: 1.0, y: 10 }], stay: true },
      ],
    };
    songAppearance(scene, song, f => path.resolve(tmpDir, f), 0);

    // Frames 30..119 have backdrop alone -> NOT empty!
    assert.deepEqual(emptyFrames(scene, { from: 30, until: 120 }), []);
    // Frames 120..179 have backdrop gone, stayed prop alone -> NOT empty!
    assert.deepEqual(emptyFrames(scene, { from: 120, until: 180 }), []);
    // Frames 20..29 have neither word nor backdrop nor prop -> STILL detected as empty!
    const gap = emptyFrames(scene, { from: 20, until: 30 });
    assert.deepEqual(gap, [{ start: 20, end: 29 }]);

    // Existing word overlap gate treats backdrop as background (0 overlaps)
    assert.deepEqual(scanOverlap(scene, { until: 180 }).overlaps, []);
  });

  it('prop-covers-sung-word gate fails when prop body overlaps focused word, reports word/frames/overlap, and ignores cables and clear regions', () => {
    // Word centred on screen (640, 360), approx 198x119 px box -> screen x ~ 541..739, y ~ 300..420
    const sceneOverlap = makeTestScene({ frames: 150, fps: 30, wordX: 0, wordY: 0, wordW: 100, wordH: 60, onsetF: 60, wordOn: 55, wordOff: 120 });
    // Prop body at x=80..112 -> screen x=640..896; rod at y=35 -> screen y=280..728 (clearly overlaps right half of centred word!)
    songAppearance(sceneOverlap, {
      title: 'Overlap Fail Test',
      backdrops: [{ image: 'backdrop.png', from_s: 0, to_s: 5.0 }],
      props: [{ id: 'banner', image: 'prop.png', ref: 0, x: 76, anchor_y: 100, keys: [{ t: 0, y: 35 }] }],
    }, f => path.resolve(tmpDir, f), 0);

    const failRes = checkPropWordOverlap(sceneOverlap, w => Math.round(w.t * 30));
    assert.equal(failRes.pass, false);
    assert.equal(failRes.violations.length, 1);
    const v = failRes.violations[0];
    assert.equal(v.wordId, 'w01');
    assert.equal(v.word, 'RAISE');
    assert.equal(v.propId, 'banner');
    assert.equal(v.start, 55);
    assert.equal(v.end, 74); // focus window [min(55,60), max(55,60)+15) = [55, 75) -> frames 55..74
    assert.ok(v.maxShare > 0.3 && v.maxShare <= 1, `expected substantial overlap share, got ${v.maxShare}`);
    assert.ok(v.maxAreaPx > 1000, `expected overlap px^2 > 1000, got ${v.maxAreaPx}`);
    assert.match(v.summary, /w01 RAISE/);
    assert.match(v.summary, /frames 55-74/);

    // Same word, but banner is lowered to backdrop y=65 (screen y=520..968): ONLY cables pass behind the word -> PASS!
    const sceneCablesOnly = makeTestScene({ frames: 150, fps: 30, wordX: 0, wordY: 0, wordW: 100, wordH: 60, onsetF: 60, wordOn: 55, wordOff: 120 });
    songAppearance(sceneCablesOnly, {
      title: 'Cables Only Pass Test',
      backdrops: [{ image: 'backdrop.png', from_s: 0, to_s: 5.0 }],
      props: [{ id: 'banner', image: 'prop.png', ref: 0, x: 76, anchor_y: 100, keys: [{ t: 0, y: 65 }] }],
    }, f => path.resolve(tmpDir, f), 0);
    const cablesRes = checkPropWordOverlap(sceneCablesOnly, w => Math.round(w.t * 30));
    assert.equal(cablesRes.pass, true);
    assert.equal(cablesRes.violations.length, 0);

    // Same word, prop hoists into word's spot ONLY AFTER focus window ends (at t=3.0, frame 90 > focusEnd 74) -> PASS!
    const sceneAfterFocus = makeTestScene({ frames: 150, fps: 30, wordX: 0, wordY: 0, wordW: 100, wordH: 60, onsetF: 60, wordOn: 55, wordOff: 120 });
    songAppearance(sceneAfterFocus, {
      title: 'After Focus Pass Test',
      backdrops: [{ image: 'backdrop.png', from_s: 0, to_s: 5.0 }],
      props: [{ id: 'banner', image: 'prop.png', ref: 0, x: 76, anchor_y: 100, keys: [{ t: 0, y: 65 }, { t: 3.0, y: 35 }] }],
    }, f => path.resolve(tmpDir, f), 0);
    const afterRes = checkPropWordOverlap(sceneAfterFocus, w => Math.round(w.t * 30));
    assert.equal(afterRes.pass, true);
  });
});

describe('brief 18: words keep clear of screen-space props', () => {
  it('computes keep-clear rects with keep_clear_margin_px, honours keep_clear: false opt-out, and follows keyed motion', () => {
    const scene = makeTestScene({ frames: 180, fps: 30, wordX: 0, wordY: 0, wordW: 100, wordH: 60, onsetF: 60, wordOn: 55, wordOff: 120 });
    songAppearance(scene, {
      title: 'Keep Clear Geometry',
      keep_clear_margin_px: 30,
      backdrops: [{ image: 'backdrop.png', from_s: 0, to_s: 6.0 }],
      props: [
        // Active keep-clear prop: moves from y=55 (screen y=440) up to y=15 (screen y=120) at t=3.0 (f=90)
        { id: 'hoist', image: 'prop.png', ref: 0, x: 80, anchor_y: 100, keys: [{ t: 0, y: 55 }, { t: 3.0, y: 15, dur_s: 0.2 }] },
        // Opt-out prop sitting right over the centre: must be ignored by keep-clear and checkPropWordOverlap
        { id: 'overlay', image: 'prop.png', ref: 0, x: 60, anchor_y: 100, keep_clear: false, keys: [{ t: 0, y: 20 }] },
      ],
    }, f => path.resolve(tmpDir, f), 0);

    assert.equal(scene.props[0].keepClear, true);
    assert.equal(scene.props[0].keepClearMarginPx, 30);
    assert.equal(scene.props[1].keepClear, false);

    // At f=30 (low hoist): hit x=[672..928], y=[440..888] -> with 30 px margin: x=[642..958], y=[410..720]
    const obsLow = I.propKeepClearRects(scene, 30, 1280, 720, { useMargin: true });
    assert.equal(obsLow.length, 1);
    assert.equal(obsLow[0].p.id, 'hoist');
    assert.equal(Math.round(obsLow[0].x0), 642);
    assert.equal(Math.round(obsLow[0].y0), 410);

    // At f=120 (high hoist): y=15 -> screen y=120 -> with 30 px margin: y0=90
    const obsHigh = I.propKeepClearRects(scene, 120, 1280, 720, { useMargin: true });
    assert.equal(obsHigh.length, 1);
    assert.equal(Math.round(obsHigh[0].y0), 90);

    // Maximal clear rectangles: low hoist has big top band AND left band; high hoist's top band shrinks away
    const rectsLow = I.clearRectsFromObstacles(obsLow);
    assert.ok(rectsLow.some(r => r.x1 <= 643 && r.h > 600), 'expected full-height left band');
    assert.ok(rectsLow.some(r => r.y1 <= 411 && r.w > 1100), 'expected wide top band when hoist is low');
    const rectsHigh = I.clearRectsFromObstacles(obsHigh);
    assert.ok(rectsHigh.some(r => r.x1 <= 643 && r.h > 600), 'expected full-height left band when hoist is high');
    assert.ok(!rectsHigh.some(r => r.y1 <= 91 && r.h > 100), 'top band should no longer be tall when hoist is high');

    // Opt-out prop does not fail checkPropWordOverlap even though it covers the centred word
    const optOutScene = makeTestScene({ frames: 150, fps: 30, wordX: 0, wordY: 0, wordW: 100, wordH: 60, onsetF: 60, wordOn: 55, wordOff: 120 });
    songAppearance(optOutScene, {
      title: 'Opt Out Only',
      backdrops: [{ image: 'backdrop.png', from_s: 0, to_s: 5.0 }],
      props: [{ id: 'bg-prop', image: 'prop.png', ref: 0, x: 64, anchor_y: 100, keep_clear: false, keys: [{ t: 0, y: 20 }] }],
    }, f => path.resolve(tmpDir, f), 0);
    assert.equal(I.hasKeepClearProps(optOutScene), false);
    assert.equal(checkPropWordOverlap(optOutScene, w => Math.round(w.t * 30)).pass, true);
    const fr = frameClearOfProps(optOutScene, w => Math.round(w.t * 30));
    assert.equal(fr.holdsReframed, 0);
  });

  it('reframes colliding holds into the clear band without shrinking words, passing both raw hitBox and margin checks', () => {
    const scene = makeTestScene({ frames: 150, fps: 30, wordX: 0, wordY: 0, wordW: 140, wordH: 70, onsetF: 60, wordOn: 55, wordOff: 120 });
    // Prop body at x=80..112 -> screen x=640..896; y=15..71 -> screen y=120..568 (covers right half of centred word)
    songAppearance(scene, {
      title: 'Reframe Clear Test',
      backdrops: [{ image: 'backdrop.png', from_s: 0, to_s: 5.0 }],
      props: [{ id: 'banner', image: 'prop.png', ref: 0, x: 76, anchor_y: 100, keys: [{ t: 0, y: 15 }] }],
    }, f => path.resolve(tmpDir, f), 0);

    const onsetOf = w => Math.round(w.t * 30);
    const before = checkPropWordOverlap(scene, onsetOf);
    assert.equal(before.pass, false);
    const wCapBefore = scene.words[0].cap;

    const res = frameClearOfProps(scene, onsetOf, { until: 150 });
    assert.ok(res.holdsReframed >= 1, 'expected hold to be reframed');
    // Word geometry untouched (camera framing preferred over shrinking word!)
    assert.equal(scene.words[0].cap, wCapBefore);
    // Word stays wholly in frame and clears both raw hitBox and hitBox + 24 px margin
    assert.equal(fullyShown(scene.words[0], 60, I.poseAt(scene.cams, 60), 40), true);
    assert.equal(checkPropWordOverlap(scene, onsetOf, { useMargin: false }).pass, true);
    assert.equal(checkPropWordOverlap(scene, onsetOf, { useMargin: true }).pass, true);
  });

  it('scales down a word that cannot fit in the clear area via framing alone and reports below-min words rather than overlapping', () => {
    // Two props flanking the centre so only a narrow 240 px strip in the middle (x=520..760) is clear, while the
    // camera is locked to a single wide word + another word pinned on the left so camera framing alone cannot fit.
    const scene = makeTestScene({ frames: 150, fps: 30, wordX: 0, wordY: 0, wordW: 520, wordH: 70, onsetF: 60, wordOn: 55, wordOff: 120 });
    // Add a tall prop covering x=360..1240, y=0..720 so only a narrow left strip x=0..336 is clear!
    songAppearance(scene, {
      title: 'Scale Fallback Test',
      keep_clear_margin_px: 12,
      props: [{
        id: 'wall',
        image: 'prop.png',
        x: 360,
        y: 0,
        anchor_y: 100,
        scale: 22,
        hit_box: { x0: 0, y0: 100, x1: 40, y1: 160 },
        keys: [{ t: 0, y: 0 }],
      }],
    }, f => path.resolve(tmpDir, f), 0);

    const onsetOf = w => Math.round(w.t * 30);
    // Skip framing and test resolvePropOverlaps directly on a wide word that must scale down to fit x=0..348
    const res = resolvePropOverlaps(scene, onsetOf, { until: 150, settings: { minH: 0.09 } });
    assert.equal(checkPropWordOverlap(scene, onsetOf, { useMargin: false }).pass, true, 'must clear prop rather than overlap');
    assert.ok(res.log.length > 0, 'expected resolve log entries');
    // Verify word is still shown whole
    assert.equal(fullyShown(scene.words[0], 60, I.poseAt(scene.cams, 60), 40), true);
    const h = letterHeight(scene.words[0], 60, I.poseAt(scene.cams, 60), 40);
    if (h < 0.09) assert.ok(res.belowMin.length > 0, 'words scaled below minimum must be reported in belowMin');
  });

  it('tracks keyed hoist motion across multiple holds (low hoist -> top band, high hoist -> left band)', () => {
    const dist = 500;
    const pose = { target: [0, 0, 0], R: [1, 0, 0], U: [0, 1, 0], N: [0, 0, 1], dist };
    const scene = {
      meta: { fps: 30, frames: 240, vfov: 40 },
      cams: [
        { f0: 0, f1: 0, verb: 'cut', from: pose, to: pose },
        { f0: 100, f1: 108, verb: 'sweep', ease: { a: 2, b: 3, x0: 0.4 }, from: pose, to: { ...pose, target: [400, 0, 0] } },
      ],
      plaques: [
        { id: 'p1', C: [0, 0, 0], R: [1, 0, 0], U: [0, 1, 0], N: [0, 0, 1], w: 600, h: 300, surface: 'panel', on: 0, off: 100 },
        { id: 'p2', C: [400, 0, 0], R: [1, 0, 0], U: [0, 1, 0], N: [0, 0, 1], w: 600, h: 300, surface: 'panel', on: 100, off: null },
      ],
      words: [
        { id: 'w01', text: 'WIDEPHRASE', plaque: 'p1', C: [0, -80, 0], R: [1, 0, 0], U: [0, 1, 0], N: [0, 0, 1], w: 380, h: 80, cap: 64, font: 'anton', fontPx: 1, style: 'cream', on: 20, off: 90, t: 1.0, joint: { prim: 'pop', f0: 20, f1: 20 } },
        { id: 'w02', text: 'HIGH', plaque: 'p2', C: [400, 0, 0], R: [1, 0, 0], U: [0, 1, 0], N: [0, 0, 1], w: 180, h: 90, cap: 72, font: 'anton', fontPx: 1, style: 'cream', on: 130, off: 220, t: 4.5, joint: { prim: 'pop', f0: 130, f1: 130 } },
      ],
    };
    songAppearance(scene, {
      title: 'Two Hold Hoist',
      backdrops: [{ image: 'backdrop.png', from_s: 0, to_s: 8.0 }],
      // Low at y=55 (screen y=440) during hold 1; hoists up to y=10 (screen y=80) at t=3.5 (f=105) for hold 2!
      props: [{ id: 'banner', image: 'prop.png', ref: 0, x: 76, anchor_y: 100, keys: [{ t: 0, y: 55 }, { t: 3.5, y: 10, dur_s: 0.2 }] }],
    }, f => path.resolve(tmpDir, f), 0);

    const onsetOf = w => Math.round(w.t * 30);
    assert.equal(checkPropWordOverlap(scene, onsetOf).pass, false);
    const fr = frameClearOfProps(scene, onsetOf, { until: 240 });
    assert.equal(fr.holdsReframed, 2);
    assert.equal(checkPropWordOverlap(scene, onsetOf, { useMargin: false }).pass, true);
    assert.equal(checkPropWordOverlap(scene, onsetOf, { useMargin: true }).pass, true);
    // Hold 1 (wide word, low hoist) fits top band; Hold 2 (high hoist) fits left band
    assert.match(fr.log[0], /top clear band/);
    assert.match(fr.log[1], /left clear band/);
  });
});

describe('brief 19: room pass priority, beneficiary lock, and whole-life static-partial gate', () => {
  it('never puts back a filler dropped to make room for a keyword while that keyword is still dropped, and tries keywords before fillers', () => {
    const dist = 500;
    const pose = { target: [0, 0, 0], R: [1, 0, 0], U: [0, 1, 0], N: [0, 0, 1], dist };
    // Filler appears BEFORE keyword in scene.words. Keyword cannot fit (too wide to reach min size inside frame),
    // while filler would easily fit in its planned spot. Filler has dropped: 'room', dropped_for: 'w02'.
    const scene = {
      meta: { fps: 30, frames: 120, vfov: 40 },
      cams: [{ f0: 0, f1: 0, verb: 'cut', from: pose, to: pose }],
      plaques: [{ id: 'p1', C: [0, 0, 0], R: [1, 0, 0], U: [0, 1, 0], N: [0, 0, 1], w: 900, h: 300, surface: 'panel', on: 0, off: null }],
      words: [
        {
          id: 'w01', text: 'IT', plaque: 'p1', keyword: false, dropped: 'room', dropped_for: 'w02',
          C: [0, 0, 0], R: [1, 0, 0], U: [0, 1, 0], N: [0, 0, 1],
          w: 60, h: 60, cap: 50, font: 'anton', fontPx: 1, style: 'cream',
          on: 20, off: 100, t: 1.0, opacity: [[0, 0]], joint: { prim: 'pop', f0: 20, f1: 20 },
        },
        {
          id: 'w02', text: 'UNFITTABLYWIDEKEYWORD', plaque: 'p1', keyword: true, dropped: 'size',
          C: [0, 0, 0], R: [1, 0, 0], U: [0, 1, 0], N: [0, 0, 1],
          w: 640, h: 20, cap: 15, font: 'anton', fontPx: 1, style: 'cream',
          on: 20, off: 100, t: 1.0, opacity: [[0, 0]], joint: { prim: 'pop', f0: 20, f1: 20 },
        },
      ],
    };
    const onsetOf = w => Math.round(w.t * 30);
    const res = placeInRoom(scene, onsetOf, { until: 120 });
    // Keyword tried first, then filler skipped because keyword w02 is still dropped
    assert.equal(res[0].w.id, 'w02');
    assert.equal(res[0].room, false);
    assert.equal(res[1].w.id, 'w01');
    assert.equal(res[1].room, false);
    assert.match(res[1].how, /w02 UNFITTABLYWIDEKEYWORD.*still dropped/);
    assert.equal(scene.words[0].dropped, 'room');
    assert.equal(scene.words[1].dropped, 'size');

    // Once the keyword CAN fit (make it normal width), keyword is put back first and filler is now allowed to be put back clear of it!
    scene.words[1].w = 140; scene.words[1].h = 60; scene.words[1].cap = 50;
    const res2 = placeInRoom(scene, onsetOf, { until: 120 });
    assert.equal(res2[0].w.id, 'w02');
    assert.equal(res2[0].room, true);
    assert.equal(scene.words[1].dropped, undefined);
    assert.equal(res2[1].w.id, 'w01');
    assert.equal(res2[1].room, true);
    assert.equal(scene.words[0].dropped, undefined);
    assert.equal(scene.words[0].dropped_for, undefined);
    assert.deepEqual(scanOverlap(scene, { until: 120 }).overlaps, []);
  });

  it('tries keywords before fillers when both compete for the only remaining clear spot', () => {
    const dist = 500; // halfW ~ 323.5, halfH ~ 182.0
    const pose = { target: [0, 0, 0], R: [1, 0, 0], U: [0, 1, 0], N: [0, 0, 1], dist };
    // Two big blockers leave only a single central slot [-110..110, -45..45]; filler appears BEFORE keyword in scene.words.
    const scene = {
      meta: { fps: 30, frames: 120, vfov: 40 },
      cams: [{ f0: 0, f1: 0, verb: 'cut', from: pose, to: pose }],
      plaques: [{ id: 'p1', C: [0, 0, 0], R: [1, 0, 0], U: [0, 1, 0], N: [0, 0, 1], w: 900, h: 400, surface: 'panel', on: 0, off: null }],
      words: [
        { id: 'bTop', text: 'TOP', plaque: 'p1', C: [0, 115, 0], R: [1, 0, 0], U: [0, 1, 0], N: [0, 0, 1], w: 620, h: 120, cap: 96, font: 'anton', fontPx: 1, style: 'cream', on: 0, off: 120, t: 0.1 },
        { id: 'bBot', text: 'BOT', plaque: 'p1', C: [0, -115, 0], R: [1, 0, 0], U: [0, 1, 0], N: [0, 0, 1], w: 620, h: 120, cap: 96, font: 'anton', fontPx: 1, style: 'cream', on: 0, off: 120, t: 0.1 },
        { id: 'bL', text: 'L', plaque: 'p1', C: [-220, 0, 0], R: [1, 0, 0], U: [0, 1, 0], N: [0, 0, 1], w: 190, h: 100, cap: 80, font: 'anton', fontPx: 1, style: 'cream', on: 0, off: 120, t: 0.1 },
        { id: 'bR', text: 'R', plaque: 'p1', C: [220, 0, 0], R: [1, 0, 0], U: [0, 1, 0], N: [0, 0, 1], w: 190, h: 100, cap: 80, font: 'anton', fontPx: 1, style: 'cream', on: 0, off: 120, t: 0.1 },
        { id: 'w01', text: 'IT', plaque: 'p1', keyword: false, dropped: 'size', C: [0, 0, 0], R: [1, 0, 0], U: [0, 1, 0], N: [0, 0, 1], w: 200, h: 80, cap: 64, font: 'anton', fontPx: 1, style: 'cream', on: 20, off: 100, t: 1.0, opacity: [[0, 0]] },
        { id: 'w02', text: 'PROUD', plaque: 'p1', keyword: true, dropped: 'size', C: [0, 0, 0], R: [1, 0, 0], U: [0, 1, 0], N: [0, 0, 1], w: 200, h: 80, cap: 64, font: 'anton', fontPx: 1, style: 'cream', on: 20, off: 100, t: 1.0, opacity: [[0, 0]] },
      ],
    };
    const onsetOf = w => Math.round(w.t * 30);
    const res = placeInRoom(scene, onsetOf, { until: 120 });
    assert.equal(res[0].w.id, 'w02');
    assert.equal(res[0].room, true, 'keyword must claim the sole clear spot first');
    assert.equal(res[1].w.id, 'w01');
    assert.equal(res[1].room, false, 'filler stays dropped once keyword takes the spot');
    assert.equal(scene.words.find(w => w.id === 'w02').dropped, undefined);
    assert.equal(scene.words.find(w => w.id === 'w01').dropped, 'size');
  });

  it('rejects any room placement that would be static and partly on screen later in its life', () => {
    const dist = 500; // halfW ~ 323.5
    const pose1 = { target: [0, 0, 0], R: [1, 0, 0], U: [0, 1, 0], N: [0, 0, 1], dist };
    // At frame 45 (well past onset 30 + SHOWN_FRAMES=6 = 36!), camera cuts right so target.x=300:
    // anything near x=0..60 sits static and partly on screen (left edge of frame at x ~ -23.5)!
    // Put blockers everywhere except right around x=0 so no offset avoids the frame-45 static partial.
    const pose2 = { target: [300, 0, 0], R: [1, 0, 0], U: [0, 1, 0], N: [0, 0, 1], dist };
    const scene = {
      meta: { fps: 30, frames: 90, vfov: 40 },
      cams: [
        { f0: 0, f1: 0, verb: 'cut', from: pose1, to: pose1 },
        { f0: 45, f1: 45, verb: 'cut', from: pose2, to: pose2 },
      ],
      plaques: [{ id: 'p1', C: [0, 0, 0], R: [1, 0, 0], U: [0, 1, 0], N: [0, 0, 1], w: 1200, h: 400, surface: 'panel', on: 0, off: null }],
      words: [
        { id: 'bTop', text: 'TOP', plaque: 'p1', C: [0, 115, 0], R: [1, 0, 0], U: [0, 1, 0], N: [0, 0, 1], w: 620, h: 120, cap: 96, font: 'anton', fontPx: 1, style: 'cream', on: 0, off: 45, t: 0.1 },
        { id: 'bBot', text: 'BOT', plaque: 'p1', C: [0, -115, 0], R: [1, 0, 0], U: [0, 1, 0], N: [0, 0, 1], w: 620, h: 120, cap: 96, font: 'anton', fontPx: 1, style: 'cream', on: 0, off: 45, t: 0.1 },
        { id: 'bL', text: 'L', plaque: 'p1', C: [-180, 0, 0], R: [1, 0, 0], U: [0, 1, 0], N: [0, 0, 1], w: 230, h: 100, cap: 80, font: 'anton', fontPx: 1, style: 'cream', on: 0, off: 45, t: 0.1 },
        { id: 'bR', text: 'R', plaque: 'p1', C: [160, 0, 0], R: [1, 0, 0], U: [0, 1, 0], N: [0, 0, 1], w: 230, h: 100, cap: 80, font: 'anton', fontPx: 1, style: 'cream', on: 0, off: 45, t: 0.1 },
        // Dropped word at x=-10, width 100 (x=-60..40): wholly inside pose1 (frames 25..44),
        // but 63% on screen and static on pose2 (frames 45..89) — past onset + SHOWN_FRAMES!
        {
          id: 'w09', text: 'IT', plaque: 'p1', keyword: false, dropped: 'size',
          C: [-10, 0, 0], R: [1, 0, 0], U: [0, 1, 0], N: [0, 0, 1],
          w: 100, h: 70, cap: 56, font: 'anton', fontPx: 1, style: 'cream',
          on: 25, off: 90, t: 1.0, opacity: [[0, 0]], joint: { prim: 'pop', f0: 25, f1: 25 },
        },
      ],
    };
    const onsetOf = w => Math.round(w.t * 30);
    const res = placeInRoom(scene, onsetOf, { until: 90 });
    assert.equal(res.length, 1);
    assert.equal(res[0].room, false, 'must stay dropped when only available spot causes a later static partial');
    assert.equal(scene.words.find(w => w.id === 'w09').dropped, 'size');
    assert.deepEqual(staticPartials(scene, { until: 90 }), []);
    assert.deepEqual(gateFailures(scene, onsetOf, { until: 90 }).filter(x => x.kind === 'partial'), []);
  });

  it('enforceMinSize records dropped_for on room-dropped fillers so placeInRoom locks them while the keyword stays dropped', () => {
    const dist = 500; // halfW ~ 323.5, halfH ~ 182.0
    const pose1 = { target: [0, 0, 0], R: [1, 0, 0], U: [0, 1, 0], N: [0, 0, 1], dist };
    // Hold 1: 4 words (crowded -> minH 0.09, boxCoverage < 0.30). w02 PROUD (cap=26, ~7.1%) sits at the bottom-right
    // corner hemmed by frame bottom, keyword wC on its right, and keyword wA above, so its ONLY way to grow x1.30
    // is left into filler w01 IT. Dropping w01 IT drops visible words from 4 -> 3 (uncrowded -> min 13.5%), so w02
    // PROUD at ~9.3% still falls short and is dropped as 'size' while w01 IT stays dropped='room', dropped_for='w02'.
    const scene = {
      meta: { fps: 30, frames: 90, vfov: 40 },
      cams: [{ f0: 0, f1: 0, verb: 'cut', from: pose1, to: pose1 }],
      plaques: [{ id: 'p1', C: [0, 0, 0], R: [1, 0, 0], U: [0, 1, 0], N: [0, 0, 1], w: 900, h: 400, surface: 'panel', on: 0, off: null }],
      words: [
        { id: 'wA', text: 'WAVE', plaque: 'p1', keyword: true, C: [40, -100, 0], R: [1, 0, 0], U: [0, 1, 0], N: [0, 0, 1], w: 280, h: 70, cap: 56, font: 'anton', fontPx: 1, style: 'cream', on: 0, off: 90, t: 0.2 },
        { id: 'wC', text: 'FLAG', plaque: 'p1', keyword: true, C: [200, -155, 0], R: [1, 0, 0], U: [0, 1, 0], N: [0, 0, 1], w: 180, h: 50, cap: 40, font: 'anton', fontPx: 1, style: 'cream', on: 0, off: 90, t: 0.3 },
        { id: 'w01', text: 'IT', plaque: 'p1', keyword: false, C: [-100, -158, 0], R: [1, 0, 0], U: [0, 1, 0], N: [0, 0, 1], w: 120, h: 35, cap: 26, font: 'anton', fontPx: 1, style: 'cream', on: 10, off: 90, t: 0.6 },
        { id: 'w02', text: 'PROUD', plaque: 'p1', keyword: true, C: [35, -158, 0], R: [1, 0, 0], U: [0, 1, 0], N: [0, 0, 1], w: 135, h: 35, cap: 26, font: 'anton', fontPx: 1, style: 'cream', on: 10, off: 90, t: 0.65 },
      ],
    };
    const onsetOf = w => Math.round(w.t * 30);
    enforceMinSize(scene, onsetOf, { until: 90 });
    const it = scene.words.find(w => w.id === 'w01');
    const proud = scene.words.find(w => w.id === 'w02');
    assert.equal(it.dropped, 'room');
    assert.equal(it.dropped_for, 'w02');
    assert.equal(proud.dropped, 'size');
  });
});
