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
