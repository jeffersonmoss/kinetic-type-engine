// Alpha bounds of a PNG, with Node built-ins only (engine fix brief 2, item 4, 22 November 2026): the box of pixels
// with alpha over half, as fractions of the image, so the intro can match one badge's size and centre to the next.
// 8-bit greyscale, grey+alpha, RGB and RGBA, palette with tRNS; not interlaced. Anything else returns null (the
// caller then uses the whole image).
import fs from 'node:fs';
import zlib from 'node:zlib';

export function pngAlphaBox(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32BE(0) !== 0x89504e47) return null;
  let o = 8, W, H, depth, type, interlace, idat = [], trns = null;
  while (o < b.length) {
    const len = b.readUInt32BE(o), kind = b.toString('ascii', o + 4, o + 8), d = b.subarray(o + 8, o + 8 + len);
    if (kind === 'IHDR') { W = d.readUInt32BE(0); H = d.readUInt32BE(4); depth = d[8]; type = d[9]; interlace = d[12]; }
    else if (kind === 'IDAT') idat.push(d);
    else if (kind === 'tRNS') trns = d;
    else if (kind === 'IEND') break;
    o += 12 + len;
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (depth !== 8 || interlace || !channels) return null;
  const alphaOf = (row, x) => type === 6 ? row[x * 4 + 3] : type === 4 ? row[x * 2 + 1] : type === 3 ? (trns && row[x] < trns.length ? trns[row[x]] : 255) : 255;
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = W * channels;
  let prev = Buffer.alloc(stride), x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let y = 0; y < H; y++) {
    const f = raw[y * (stride + 1)], row = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? row[i - channels] : 0, up = prev[i], c = i >= channels ? prev[i - channels] : 0;
      const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c);
      row[i] = (row[i] + [0, a, up, (a + up) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? up : c][f]) & 255;
    }
    for (let x = 0; x < W; x++) if (alphaOf(row, x) > 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y; }
    prev = row;
  }
  if (x1 < 0) return null;
  return { width: W, height: H, x0: x0 / W, y0: y0 / H, x1: (x1 + 1) / W, y1: (y1 + 1) / H };
}
