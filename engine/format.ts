/** Frame coordinates are logical pixels; renderScale converts them to output pixels. */
export interface FrameFormat {
  id: string; width: number; height: number; renderScale: number;
  safeInsets: {top: number; right: number; bottom: number; left: number};
  overlayZones: {name: string; x: number; y: number; width: number; height: number}[];
}
export const WIDE: FrameFormat = {id: 'wide', width: 1280, height: 720, renderScale: 1,
  safeInsets: {top: 48, right: 48, bottom: 48, left: 48}, overlayZones: []};
export const SHORT_916: FrameFormat = {id: 'short-9-16', width: 720, height: 1280, renderScale: 1.5,
  safeInsets: {top: 102.4, right: 108, bottom: 256, left: 48},
  overlayZones: [{name: 'top', x: 0, y: 0, width: 720, height: 102.4},
    {name: 'right', x: 612, y: 0, width: 108, height: 1280},
    {name: 'bottom', x: 0, y: 1024, width: 720, height: 256}]};
export const safeBox = (f: FrameFormat) => ({x: f.safeInsets.left, y: f.safeInsets.top,
  width: f.width - f.safeInsets.left - f.safeInsets.right,
  height: f.height - f.safeInsets.top - f.safeInsets.bottom});

export type SafeBox = ReturnType<typeof safeBox>;

const wideSafe = safeBox(WIDE);
const wideShort = Math.min(wideSafe.width, wideSafe.height);

/** Spatial limits use the safe box. Legacy ratios preserve their wide values. */
export const limitsFor = (box: SafeBox) => {
  const short = Math.min(box.width, box.height);
  const length = (px: number) => (short * px) / wideShort;
  const horizontal = (px: number) => (box.width * px) / wideSafe.width;
  return {
    fillWidth: horizontal(1040),
    layoutWidth: horizontal(640),
    blockGap: length(40),
    rowMin: length(70),
    rowMax: length(320),
    rowTargets: Object.freeze([length(115), length(115), length(150), length(320)] as const),
    rowCaps: Object.freeze([length(160), length(160), length(240), length(320)] as const),
    fillHeight: (box.height * 560) / wideSafe.height,
    sungMinCap: short * 0.075,
    capTiers: Object.freeze({hero: short * 0.24, body: short * 0.11, second: short * 0.075}),
    legacySungMinCap: length(56),
    quarterMinCap: length(90),
    marginBigCap: length(200),
    giantCap: length(240),
    giantSpan: horizontal(800),
    quarterGiantSpan: (box.height * 648) / wideSafe.height,
    pictureMinSide: length(180),
    propClear: length(24),
    jointMax: horizontal(213),
    fastTravel: horizontal(400),
    handoffTolerance: length(3),
    speedCap: horizontal(32),
    runSpeed: horizontal(22),
  };
};

export type EngineLimits = ReturnType<typeof limitsFor>;

export const WIDE_LIMITS = Object.freeze(limitsFor(wideSafe));
