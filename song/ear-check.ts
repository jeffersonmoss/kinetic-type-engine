import type {EarCheck, SongMap} from './types';

export function formatEarCheckList(map: SongMap, entries: EarCheck[]): string {
  const tokensById = new Map(map.tokens.flatMap(token => token.memberIds.map(id => [id, token] as const)));
  const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();
  const open = entries.filter(entry => entry.status === 'open').length;
  const lines = [
    '# Ear check list', '',
    `${open} open of ${entries.length} entries. Times are in seconds.`,
    'Edit analysis/ear-check.json to record listening or local Whisper evidence. Ingest regenerates this list.', '',
    'Open times are proposals. Corrected times are used by the song map.',
  ];
  for (const entry of entries) {
    const token = tokensById.get(entry.tokenId);
    const target = token ? JSON.stringify(token.rawText) : '(token absent from this alignment)';
    lines.push('', `- **${entry.status}** · ${target} · ${entry.tokenId} · ${entry.start.toFixed(3)}–${entry.end.toFixed(3)} s`,
      `  ${entry.issue}. ${oneLine(entry.evidence)}`,
      `  Entry ${entry.id}${entry.by ? ` · ${oneLine(entry.by)}` : ''}${entry.date ? ` · ${oneLine(entry.date)}` : ''}`);
  }
  return lines.join('\n') + '\n';
}
