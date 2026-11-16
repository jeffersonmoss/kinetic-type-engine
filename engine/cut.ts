/** Half-open, ordered song frame ranges; no retiming occurs inside a range. */
export interface SectionRange {start: number; end: number}
export const sectionCut = (ranges: SectionRange[]) => {
  if (!ranges.length || ranges.some((r, i) => !Number.isInteger(r.start) || !Number.isInteger(r.end) || r.start < 0 || r.end <= r.start || (i > 0 && r.start < ranges[i - 1].end))) throw new Error('invalid song ranges');
  let cursor = 0;
  const sections = ranges.map((r) => {const shortStart = cursor; cursor += r.end - r.start; return {...r, shortStart, shortEnd: cursor, offset: r.start - shortStart};});
  return {sections, duration: cursor,
    songFrame: (frame: number) => {const s = sections.find((x) => frame >= x.shortStart && frame < x.shortEnd); if (!s) throw new RangeError('frame outside cut'); return frame + s.offset;},
    sequenceFrom: (songFrame: number, section: number) => {const s = sections[section]; if (!s) throw new RangeError('unknown section'); return songFrame - s.offset;}};
};
