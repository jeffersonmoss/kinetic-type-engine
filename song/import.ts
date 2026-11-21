import {tokenizeAlignment} from './alignment';
import type {Alignment, BeatAnalysis, EarCheck, SongConfig, SongLine, SongMap, SongToken, Voice} from './types';

interface SongInput {
  alignment: Alignment;
  config: SongConfig;
  audio: string;
  analysis: BeatAnalysis;
  earChecks: EarCheck[];
}

export function importSong({alignment, config, audio, analysis, earChecks}: SongInput) {
  const {lines: alignedLines, sections: alignedSections} = tokenizeAlignment(alignment);
  if (alignedLines.length === 0) throw new Error('Alignment contains no lyrics');

  const displayRules = (config.display ?? []).map(([pattern, replacement]) =>
    [new RegExp(pattern, 'gu'), replacement] as const);
  const display = (raw: string) => displayRules.reduce(
    (text, [pattern, spelling]) => text.replace(pattern, () => spelling),
    raw.replace(/[()]/g, ''),
  );

  const entries = new Map(earChecks.map(entry => [entry.id, entry]));
  const corrections = new Map<string, EarCheck>();
  for (const entry of earChecks) {
    if (entry.status !== 'corrected') continue;
    const previous = corrections.get(entry.tokenId);
    if (previous && (previous.start !== entry.start || previous.end !== entry.end)) {
      throw new Error(`Conflicting corrected times for ${entry.tokenId}: ${previous.id}, ${entry.id}`);
    }
    corrections.set(entry.tokenId, entry);
  }

  const flag = (token: SongToken, issue: string, evidence: string, start = token.start_s, end = token.end_s) => {
    const id = `${token.id}.${issue}`;
    if (entries.has(id)) return;
    entries.set(id, {id, tokenId: token.id, issue, status: 'open', start, end, by: null, date: null, evidence});
  };

  const byChunk = new Map<number, Set<SongToken>>();
  const draftLines = alignedLines.map(line => line.tokens.map(aligned => {
    const token: SongToken = {
      id: aligned.id, lineId: aligned.lineId, text: display(aligned.rawText), rawText: aligned.rawText,
      ...aligned.raw, raw: aligned.raw, source: aligned.source, memberIds: [aligned.id],
      role: aligned.voice, voice: aligned.voice, repairs: [], reviewIds: [], reviewStatus: null,
    };
    for (const part of aligned.vocal) {
      const peers = byChunk.get(part.index) ?? new Set();
      peers.add(token);
      byChunk.set(part.index, peers);
    }
    if (aligned.vocal.some(part => alignment.words[part.index].success === false)) {
      flag(token, 'alignment-failed', 'Suno reported a failed alignment for a source fragment.');
    }
    return token;
  }));

  // A standalone parenthesized chant and the next line's first word can share
  // one chunk. Recover their boundary, while retaining its unsplit vocal times.
  for (const [lineIndex, tokens] of draftLines.entries()) {
    const chunk = tokens[0].source[0].index;
    const next = draftLines[lineIndex + 1]?.[0];
    if (tokens.length < 2 || !tokens[0].rawText.startsWith('(') ||
        !tokens.at(-1)?.rawText.endsWith(')') || next?.source[0].index !== chunk ||
        !tokens.every(token => token.role === 'adlib' && token.source.every(part => part.index === chunk))) continue;
    for (const token of tokens) {
      token.repairs.push('glued-chant');
      flag(token, 'glued-chant', `Suno chunk ${chunk} also contains ${next.rawText} on ${next.lineId}. Listen for this chant word's onset and end.`);
    }
  }

  for (const [index, peers] of byChunk) {
    if (peers.size < 2 || [...peers].some(token => token.repairs.includes('glued-chant'))) continue;
    for (const token of peers) {
      flag(token, 'shared-alignment', `Suno chunk ${index} times several words as one span.`);
    }
  }

  const tokens = draftLines.flat();
  const nextInVoice = new Map<Voice, SongToken>();
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i];
    const next = nextInVoice.get(token.voice);
    nextInVoice.set(token.voice, token);
    if (!token.rawText.endsWith('!)') || token.repairs.includes('glued-chant')) continue;

    const closing = token.source.at(-1)!;
    const attachedLater = closing.start_s > token.raw.end_s;
    const clamped = next && next.start_s > token.start_s && token.end_s > next.start_s;
    if (clamped) token.end_s = next.start_s;
    if (!clamped && !attachedLater) continue;
    token.repairs.push('glued-closing-punctuation');
    const evidence = [
      attachedLater && `The closing punctuation starts at ${closing.start_s} s in Suno chunk ${closing.index}; the lexical span ends at ${token.raw.end_s} s.`,
      clamped && `The vocal span ran past the next ${token.voice} onset at ${next.start_s} s.`,
    ].filter(Boolean).join(' ');
    flag(token, 'glued-closing-punctuation', evidence);
  }

  for (const [line, words] of Object.entries(config.fix ?? {})) {
    for (const [word, start] of Object.entries(words)) {
      const token = draftLines[Number(line)]?.[Number(word)];
      if (!token || start > token.end_s) {
        throw new Error(`Invalid legacy onset proposal at line ${line}, word ${word}. Use ear-check.json with both timing endpoints.`);
      }
      flag(token, 'legacy-onset-estimate', 'Proposed onset from song.json fix; confirm against the audio.', start);
    }
  }

  for (const token of tokens) {
    const correction = corrections.get(token.id);
    if (!correction) continue;
    token.start_s = correction.start;
    token.end_s = correction.end;
  }

  // Overlaps can be genuine, especially across voices. Record them without
  // changing either time. Shared source chunks already have their own review.
  let active: SongToken[] = [];
  for (const token of [...tokens].sort((a, b) => a.start_s - b.start_s)) {
    active = active.filter(other => other.end_s > token.start_s);
    if (token.start_s === token.end_s) continue;
    for (const other of active) {
      if (token.source.some(part => byChunk.get(part.index)?.has(token) && byChunk.get(part.index)?.has(other))) continue;
      const issue = `overlap-with-${other.id}`;
      flag(token, issue, `Overlaps ${other.id} (${other.voice}, ${other.start_s}–${other.end_s} s); ${token.id} is ${token.voice}.`);
    }
    active.push(token);
  }

  const byToken = new Map<string, EarCheck[]>();
  for (const entry of entries.values()) {
    const group = byToken.get(entry.tokenId) ?? [];
    group.push(entry);
    byToken.set(entry.tokenId, group);
  }

  const mapTokens: SongToken[] = [];
  const lines: SongLine[] = draftLines.map((lineTokens, index) => {
    const merged: SongToken[] = [];
    for (const token of lineTokens) {
      const previous = merged.at(-1);
      const rule = previous?.voice === token.voice
        ? config.merge?.find(([a, b]) => previous.text === a && token.text === b)
        : undefined;
      if (previous && rule) {
        previous.text = rule[2];
        previous.rawText += ` ${token.rawText}`;
        previous.start_s = Math.min(previous.start_s, token.start_s);
        previous.end_s = Math.max(previous.end_s, token.end_s);
        previous.raw = {
          start_s: Math.min(previous.raw.start_s, token.raw.start_s),
          end_s: Math.max(previous.raw.end_s, token.raw.end_s),
        };
        previous.source.push(...token.source);
        previous.memberIds.push(...token.memberIds);
        previous.repairs = [...new Set([...previous.repairs, ...token.repairs])];
      } else {
        merged.push(token);
      }
    }

    for (const token of merged) {
      if (!token.text.trim() || /[()]/.test(token.text) || display(token.text) !== token.text) {
        throw new Error(`Invalid display text for ${token.id}: ${JSON.stringify(token.text)}`);
      }
      const reviews = token.memberIds.flatMap(id => byToken.get(id) ?? []);
      token.reviewIds = reviews.map(review => review.id);
      token.reviewStatus = (['open', 'corrected', 'verified'] as const)
        .find(status => reviews.some(review => review.status === status)) ?? null;
    }

    const start_s = Math.min(...merged.map(token => token.start_s));
    const beat = analysis.beats.find(beat => beat.t >= start_s - 0.05);
    mapTokens.push(...merged);
    return {
      id: alignedLines[index].id, sectionId: alignedLines[index].sectionId,
      start_s, end_s: Math.max(...merged.map(token => token.end_s)), start_beat: beat?.index ?? null,
      text: merged.map(token => token.text).join(' '),
      rawText: merged.map(token => token.rawText).join(' '),
      tokenIds: merged.map(token => token.id),
    };
  });

  const linesById = new Map(lines.map(line => [line.id, line]));
  const sections = alignedSections.map(section => {
    const members = section.lineIds.map(id => linesById.get(id)!);
    return {...section, start_s: Math.min(...members.map(line => line.start_s)),
      end_s: Math.max(...members.map(line => line.end_s))};
  });
  const map: SongMap = {
    schema: 2, song: config.song, suno_id: alignment.audio_id ?? null, audio, analysis,
    sections, lines, tokens: mapTokens,
  };
  return {map, earChecks: [...entries.values()]};
}
