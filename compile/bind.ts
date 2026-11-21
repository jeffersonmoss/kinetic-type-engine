import {cascade, fade, rise, type as typeOn} from '../effects';
import {CONNECTIVES, type SongLine as EngineLine, type SongWord} from '../engine/config';
import {clear, opening, portraitCard, row, type Entrance, type Film, type Format, type LineCard,
  type ReplyCard, type RowCard, type Scene, type Size} from '../score';
import {mapVocal, type OutputRange, type SongMap, type SongToken} from '../song';

export interface Diagnostic {
  severity: 'error' | 'warn' | 'info'; code: string; message: string;
  line?: string; token?: string; frame?: number;
}
export interface Vocal {token: SongToken; onset: number; end: number; preset: boolean}
export interface Run {i: number; text: string; vocal?: Vocal; font: string; emphasis: boolean; mixed: boolean; reason?: string}
export interface BoundRow {runs: Run[]; size: Size}
export interface BoundBlock {
  id: string; card: ReplyCard & {from: NonNullable<ReplyCard['from']>; enter: Entrance};
  runs: Run[]; rows: BoundRow[]; auto: boolean; reply: boolean;
}
export interface BoundLine {id: string; card: LineCard; lead: BoundBlock; reply?: BoundBlock}
export interface BoundScene {scene: Scene; lines: BoundLine[]}

const draftRise = () => cascade(rise(), {by: 'word', clock: 'sung'});
export const key = (s: string) => s.normalize('NFKC').toUpperCase().replace(/[^\p{L}\p{N}]/gu, '');
const connectives = new Set(CONNECTIVES.map(key));
const isLegacy = (call: Entrance): call is import('../effects').LegacyCall => 'kind' in call;
export const isPair = (call: Entrance): call is import('../effects').PairCall<any> => !isLegacy(call) && call.def.kind === 'transform';
export const isUnit = (call: Entrance): call is import('../effects').UnitCall<any> => !isLegacy(call) && call.def.kind !== 'transform';

export function bind(film: Film, song: SongMap, format: Format, clock: readonly OutputRange[], fps: number, draft: boolean) {
  if (song.schema !== 2) throw new Error('Expected schema 2 song map');
  if (!film.scenes?.length) throw new Error('Score has no scenes');
  const songLines = new Map(song.lines.map((line) => [line.id, line]));
  const songTokens = new Map(song.tokens.map((token) => [token.id, token]));
  if (songLines.size !== song.lines.length || songTokens.size !== song.tokens.length) throw new Error('Song map contains duplicate IDs');
  const diagnostics: Diagnostic[] = [];
  const words: SongWord[] = [];
  const lines: EngineLine[] = [];
  const scenes: BoundScene[] = [];
  const seenScenes = new Set<string>(), seenLines = new Set<string>();
  const fail = (id: string, message: string): never => {throw new Error(`${id}: ${message}`);};
  function fallback<T>(id: string, field: string, value: T) {
    if (!draft) fail(id, `required field "${field}" is missing`);
    diagnostics.push({severity: 'warn', code: 'draft-fallback', line: id, message: `used draft fallback for ${field}`});
    return value;
  }
  function block(id: string, card: BoundBlock['card'], tokens: Vocal[], reply: boolean): BoundBlock {
    const auto = card.rows === undefined || card.rows === 'auto';
    const omitted = new Set<Vocal>();
    for (const ref of card.omit ?? []) {
      const found = tokens.filter(({token}) => token.id === ref || key(token.text) === key(ref));
      if (found.length !== 1) fail(id, `omit "${ref}" needs one token; candidates: ${found.map(({token}) => token.id).join(', ') || 'none'}`);
      omitted.add(found[0]);
    }
    const active = tokens.filter((token) => !omitted.has(token));
    const size = card.size ?? (reply ? 'second' : 'body');
    let rows: RowCard[] = auto ? [{text: active.map(({token}) => token.text), size}]
      : (card.rows as Exclude<typeof card.rows, 'auto' | undefined>).map((entry) => typeof entry === 'string' ? {text: entry} :
        'kind' in entry ? {text: [entry]} : entry);
    if (isUnit(card.enter) && card.enter.def.bindsRepeats && !auto) {
      if (rows.length !== 1 || typeof rows[0].text !== 'string') fail(id, 'repeatStack requires one explicit phrase row');
      const count = (rows[0].text as string).trim().split(/\s+/u).length;
      if (!active.length || active.length % count !== 0) fail(id, 'repeatStack requires complete sung copies of the phrase');
      rows = Array.from({length: active.length / count}, () => rows[0]);
    }
    let cursor = 0, rest = '';
    const runs: Run[] = [];
    const boundRows = rows.map((entry): BoundRow => {
      const items = typeof entry.text === 'string' ? entry.text.trim().split(/\s+/u).filter(Boolean) : entry.text;
      return {size: entry.size ?? size, runs: items.map((item) => {
        const source = typeof item === 'string' ? item : item.text;
        if (!source.trim() || /[()]/u.test(source)) fail(id, `invalid displayed text "${source}"`);
        let vocal: Vocal | undefined;
        if (typeof item === 'string') {
          const current = active[cursor];
          if (!current) fail(id, `unbound text "${source}"; use echo() for unsung text`);
          vocal = current;
          const wanted = rest || key(current.token.text);
          const part = key(source);
          if (wanted === part) { cursor++; rest = ''; }
          else if (part && wanted.startsWith(part) && (rest || /[-‐‑]/u.test(current.token.text))) rest = wanted.slice(part.length);
          else fail(id, `cannot bind "${source}" to ${current.token.id} "${current.token.text}"; use echo() for unsung text`);
        }
        const wordStyle = (vocal && (card.words?.[vocal.token.id] ?? card.words?.[vocal.token.text])) ?? card.words?.[source];
        const style = {...card, ...wordStyle};
        const font = style.font ?? (connectives.has(key(source)) ? 'barlow' : 'anton');
        const text = style.case === 'mixed' ? source : source.toUpperCase();
        if (vocal && (font !== 'barlow' && font !== 'anton' || text !== text.toUpperCase()) && !style.reason?.trim()) {
          diagnostics.push({severity: 'warn', code: 'emphasis-reason', line: id, token: vocal.token.id,
            message: `"${text}" uses emphasis font or mixed case without a reason`});
        }
        const run = {i: words.length, text, vocal, font, emphasis: font !== 'anton' && font !== 'barlow',
          mixed: style.case === 'mixed', reason: style.reason};
        const timing = vocal ?? active[0] ?? tokens[0];
        if (!timing) fail(id, 'visual echoes require a sung line');
        words.push({text, start_s: timing.onset / fps, end_s: timing.end / fps, line: lines.length});
        runs.push(run);
        return run;
      })};
    });
    if (cursor < active.length) fail(id, `missing sung tokens: ${active.slice(cursor).map(({token}) => `${token.id} "${token.text}"`).join(', ')}`);
    if (!runs.length) fail(id, 'block has no displayed runs');
    const indices = runs.map(({i}) => i);
    lines.push({id: lines.length, text: runs.map(({text}) => text).join(' '), words: indices,
      start_s: Math.min(...indices.map((i) => words[i].start_s)), end_s: Math.max(...indices.map((i) => words[i].end_s))});
    return {id, card, runs, rows: boundRows, auto, reply};
  }

  for (const [index, entry] of film.scenes.entries()) {
    if (!entry.id?.trim() || seenScenes.has(entry.id)) fail(entry.id, 'missing or duplicate scene ID');
    seenScenes.add(entry.id);
    if (entry.kind === 'raw') continue;
    if (entry.kind !== 'scene' || !entry.lines?.length) fail(entry.id, 'scene needs at least one line');
    const resolved = {...entry, exit: entry.exit ?? (index < film.scenes.length - 1 ? fallback(entry.id, 'exit', fade()) : undefined)};
    const bound: BoundLine[] = [];
    for (const [n, item] of entry.lines.entries()) {
      const id = item.id;
      if (item.kind !== 'line' || seenLines.has(id)) fail(id, 'invalid or duplicate line ID');
      seenLines.add(id);
      const record = songLines.get(id) ?? fail(id, 'no corresponding song-map line');
      const card = format === 'portrait' ? portraitCard(item.card) : {...item.card};
      const vocals = record.tokenIds.flatMap((tokenId) => {
        const token = songTokens.get(tokenId) ?? fail(id, `unknown token ${tokenId}`);
        const timing = mapVocal(token, clock, fps);
        const preset = card.preset === true || (Array.isArray(card.preset) && card.preset.some((ref) => ref === token.id || key(ref) === key(token.text)));
        return timing ? [{token, ...timing, preset}] : [];
      });
      if (!vocals.length) continue;
      const calls = vocals.filter(({token}) => token.role === 'lead');
      const replies = calls.length ? vocals.filter(({token}) => token.role === 'adlib') : [];
      const previous = bound.at(-1);
      const sceneOpener = n === 0 || !previous;
      const from = card.from ?? (sceneOpener && index === 0 ? opening() : fallback(id, 'from',
        sceneOpener ? opening() : row(previous!.id, -1)));
      const enter = card.enter ?? fallback(id, 'enter', sceneOpener ? cascade(typeOn(), {by: 'word', clock: 'sung'}) : draftRise());
      if (sceneOpener && card.old) fail(id, 'a scene opener cannot declare old');
      if (!sceneOpener && !card.old && !(isPair(enter) && enter.def.dismissesOld)) card.old = fallback(id, 'old', clear(fade()));
      if (!sceneOpener && from.kind === 'opening') fail(id, 'opening() requires a scene opener');
      const matches = (ref: string, {token}: Vocal) => ref === token.id || key(ref) === key(token.text);
      for (const ref of card.omit ?? []) {
        const found = vocals.filter((vocal) => matches(ref, vocal));
        if (found.length !== 1) fail(id, `omit "${ref}" needs one token; candidates: ${found.map(({token}) => token.id).join(', ') || 'none'}`);
      }
      const lead = block(id, {...card, from, enter, omit: card.omit?.filter((ref) => (calls.length ? calls : vocals).some((vocal) => matches(ref, vocal)))},
        calls.length ? calls : vocals, false);
      let reply: BoundBlock | undefined;
      const replyId = id + '.reply';
      if (replies.length && (card.reply || draft)) {
        const authored = card.reply ?? fallback<ReplyCard>(replyId, 'reply', {});
        const from = authored.from ?? fallback(replyId, 'from', row(id, -1));
        const enter = authored.enter ?? fallback(replyId, 'enter', draftRise());
        const replyVocals = replies.map((vocal) => ({...vocal, preset: vocal.preset || authored.preset === true ||
          (Array.isArray(authored.preset) && authored.preset.some((ref) => ref === vocal.token.id || key(ref) === key(vocal.token.text)))}));
        const replyOmitted = [...(authored.omit ?? []), ...(card.omit ?? []).filter((ref) => replies.some(({token}) => ref === token.id || key(ref) === key(token.text)))];
        const allOmitted = replies.every(({token}) => replyOmitted.some((ref) => ref === token.id || key(ref) === key(token.text)));
        if (!allOmitted) reply = block(replyId, {...authored, from, enter, omit: replyOmitted}, replyVocals, true);
      } else if (replies.length) {
        const missing = replies.filter(({token}) => !card.omit?.some((ref) => ref === token.id || key(ref) === key(token.text)));
        if (missing.length) fail(id, `missing ad-lib tokens ${missing.map(({token}) => token.id).join(', ')}; use reply or omit`);
      } else if (card.reply && vocals.length === record.tokenIds.length) fail(replyId, 'no ad-lib tokens to bind');
      bound.push({id, card, lead, reply});
    }
    if (bound.length) scenes.push({scene: resolved, lines: bound});
  }
  return {diagnostics, words, lines, scenes};
}
