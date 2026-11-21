import type {SongTime} from './types';

export interface EditRange {start: number; end: number}
export interface OutputRange extends EditRange {output: number; frames: number}

export function editClock(edits: readonly EditRange[], fps: number): OutputRange[] {
  let output = 0;
  let previousEnd = 0;
  return edits.map(({start, end}) => {
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < previousEnd || end <= start) {
      throw new Error('Edit ranges must be finite, positive-length and in song order without overlap');
    }
    const first = Math.round(start * fps);
    const last = Math.round(end * fps);
    const frames = last - first;
    if (!frames) throw new Error('Edit range is shorter than one frame');
    const range = {start: first / fps, end: last / fps, output, frames};
    output += frames;
    previousEnd = end;
    return range;
  });
}

export function mapVocal(time: SongTime, clock: readonly OutputRange[], fps: number) {
  const range = clock.find(({start, end}) => time.start_s >= start && time.start_s < end);
  if (!range) return undefined;
  return {
    onset: range.output + Math.min(range.frames - 1, Math.round((time.start_s - range.start) * fps)),
    end: range.output + Math.min(range.frames - 1, Math.ceil((time.end_s - range.start) * fps - 1e-8)),
  };
}

export function songTimeAt(frame: number, clock: readonly OutputRange[], fps: number) {
  const range = clock.find(({output, frames}) => frame >= output && frame < output + frames);
  return range && range.start + (frame - range.output) / fps;
}
