import type {Alignment, SongTime, SourceFragment, Voice} from './types';

interface AlignedToken {
  id: string;
  lineId: string;
  voice: Voice;
  source: SourceFragment[];
  vocal: SourceFragment[];
  rawText: string;
  raw: SongTime;
}

export interface AlignedLine {
  id: string;
  sectionId: string;
  tokens: AlignedToken[];
}

export interface AlignedSection {
  id: string;
  name: string | null;
  lineIds: string[];
}

export function tokenizeAlignment(alignment: Alignment) {
  const lines: AlignedLine[] = [];
  const sections: AlignedSection[] = [];
  const hasSectionTags = alignment.words.some(chunk => /\[[^\]\r\n]+\]/u.test(chunk.word));
  let line: AlignedLine | undefined;
  let token: AlignedToken | undefined;
  let section: AlignedSection | undefined;
  let sectionName: string | null = null;
  let newSection = true;
  let breaks = 0;
  let separated = true;
  let depth = 0;
  let prefix: SourceFragment[] = [];

  for (const [index, chunk] of alignment.words.entries()) {
    const {start_s, end_s} = chunk;
    for (const match of chunk.word.matchAll(/\[[^\]\r\n]+\]|\s+|[()]|[^\s()[\[]+|\[/gu)) {
      const text = match[0];
      const part = {index, offset: match.index, text, start_s, end_s};
      if (/^\s/u.test(text)) {
        separated = true;
        breaks += (text.match(/\r\n|[\r\n]/g) ?? []).length;
        continue;
      }
      if (text.startsWith('[') && text.endsWith(']')) {
        newSection = true;
        sectionName = text.slice(1, -1).trim();
        separated = true;
        prefix = [];
        depth = 0;
        continue;
      }
      if (text === '(') {
        depth++;
        separated = true;
        prefix.push(part);
        continue;
      }
      if (text === ')') {
        if (token && !breaks && !newSection && prefix.length === 0) token.source.push(part);
        else prefix.push(part);
        depth = Math.max(depth - 1, 0);
        separated = true;
        continue;
      }
      if (!/[\p{L}\p{N}]/u.test(text)) {
        if (token && !breaks && !newSection && prefix.length === 0) token.source.push(part);
        else prefix.push(part);
        continue;
      }

      if (newSection || (!hasSectionTags && breaks >= 2)) {
        section = {id: `section-${sections.length + 1}`, name: sectionName, lineIds: []};
        sections.push(section);
        sectionName = null;
      }
      if (newSection || breaks || !line) {
        if (!section) throw new Error('Lyric line has no section');
        line = {id: `line-${lines.length + 1}`, sectionId: section.id, tokens: []};
        lines.push(line);
        section.lineIds.push(line.id);
        separated = true;
      }
      const voice: Voice = depth > 0 ? 'adlib' : 'lead';
      if (!token || separated || token.voice !== voice) {
        token = {
          id: `${line.id}.token-${line.tokens.length + 1}`,
          lineId: line.id, voice, source: prefix, vocal: [],
          rawText: '', raw: {start_s, end_s},
        };
        line.tokens.push(token);
      }
      token.source.push(part);
      token.vocal.push(part);
      token.raw.start_s = Math.min(token.raw.start_s, start_s);
      token.raw.end_s = Math.max(token.raw.end_s, end_s);
      prefix = [];
      separated = false;
      breaks = 0;
      newSection = false;
    }
  }

  for (const {tokens} of lines) {
    for (const token of tokens) token.rawText = token.source.map(part => part.text).join('');
  }
  return {lines, sections};
}
