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
  camera?: LineCard['camera'];
}
export interface BoundLine {id: string; card: LineCard; lead: BoundBlock; blocks: BoundBlock[]}
export interface BoundScene {scene: Scene; lines: BoundLine[]}

const draftRise = () => cascade(rise(), {by: 'word', clock: 'sung'});
export const key = (s: string) => s.normalize('NFKC').toUpperCase().replace(/[^\p{L}\p{N}]/gu, '');
const matches = (ref: string, token: SongToken) => ref === token.id || key(ref) === key(token.text);
const presetFor = (card: ReplyCard, token: SongToken) =>
  card.preset === true || (Array.isArray(card.preset) && card.preset.some((ref) => matches(ref, token)));
interface PhraseBinding {tokens: SongToken[]; cursor: number; last: boolean}
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
  function orderBlocks(id: string, blocks: BoundBlock[]): BoundBlock[] {
    const pending = new Map(blocks.map((block) => [block.id, block]));
    const first = blocks[0].card.from;
    if (blocks[0].id === id && 'line' in first && pending.has(first.line)) {
      fail(id, 'a primary phrase cannot take its landmark from its own line');
    }
    const ordered: BoundBlock[] = [];
    while (pending.size) {
      const next = [...pending.values()].find(({card: {from}}) => !('line' in from) || !pending.has(from.line));
      if (!next) return fail(id, `cyclic landmarks among ${[...pending.keys()].join(', ')}`);
      ordered.push(next);
      pending.delete(next.id);
    }
    return ordered;
  }

  function block(id: string, card: BoundBlock['card'], tokens: Vocal[], reply: boolean, phrase?: PhraseBinding): BoundBlock | undefined {
    const auto = card.rows === undefined || card.rows === 'auto';
    const omitted = new Set<Vocal>();
    for (const ref of card.omit ?? []) {
      const found = tokens.filter(({token}) => token.id === ref || key(token.text) === key(ref));
      if (found.length !== 1) fail(id, `omit "${ref}" needs one token; candidates: ${found.map(({token}) => token.id).join(', ') || 'none'}`);
      omitted.add(found[0]);
    }
    const active = tokens.filter((token) => !omitted.has(token));
    const candidates = phrase?.tokens ?? active.map(({token}) => token);
    const mapped = new Map(active.map((vocal) => [vocal.token.id, vocal]));
    const size = card.size ?? (reply ? 'second' : 'body');
    let rows: RowCard[] = auto ? [{text: active.map(({token}) => token.text), size}]
      : (card.rows as Exclude<typeof card.rows, 'auto' | undefined>).map((entry) => typeof entry === 'string' ? {text: entry} :
        'kind' in entry ? {text: [entry]} : entry);
    if (isUnit(card.enter) && card.enter.def.bindsRepeats && !auto) {
      if (rows.length !== 1 || typeof rows[0].text !== 'string') fail(id, 'repeatStack requires one explicit phrase row');
      const count = (rows[0].text as string).trim().split(/\s+/u).length;
      if (phrase || !count || !active.length || active.length % count !== 0) fail(id, 'repeatStack requires complete sung copies of the phrase');
      rows = Array.from({length: active.length / count}, () => rows[0]);
    }
    const start = phrase?.cursor ?? 0;
    let cursor = start, rest = '';
    // Bind the full lyric before dropping runs outside an edit. This keeps authored part IDs stable.
    const matched = rows.map((entry) => {
      const items = typeof entry.text === 'string' ? entry.text.trim().split(/\s+/u).filter(Boolean) : entry.text;
      return {size: entry.size ?? size, items: items.map((item) => {
        const source = typeof item === 'string' ? item : item.text;
        if (!source.trim() || /[()]/u.test(source)) fail(id, `invalid displayed text "${source}"`);
        let vocal: Vocal | undefined;
        if (typeof item === 'string') {
          const current = candidates[cursor];
          if (!current) fail(id, `unbound text "${source}"; use echo() for unsung text`);
          vocal = mapped.get(current.id);
          const wanted = rest || key(current.text);
          const part = key(source);
          if (wanted === part) { cursor++; rest = ''; }
          else if (part && wanted.startsWith(part) && (rest || /[-‐‑]/u.test(current.text))) rest = wanted.slice(part.length);
          else fail(id, `cannot bind "${source}" to ${current.id} "${current.text}"; use echo() for unsung text`);
        }
        return {source, vocal, skipped: typeof item === 'string' && !vocal};
      })};
    });
    if (rest || ((!phrase || phrase.last) && cursor < candidates.length)) {
      fail(id, `missing sung tokens: ${candidates.slice(cursor).map((token) => `${token.id} "${token.text}"`).join(', ')}`);
    }
    if (phrase) {
      if (cursor === start) fail(id, 'a lead phrase needs sung tokens');
      phrase.cursor = cursor;
      if (!candidates.slice(start, cursor).some(({id}) => mapped.has(id))) return undefined;
    }
    const runs: Run[] = [];
    const boundRows = matched.map(({size, items}): BoundRow => ({
      size, runs: items.flatMap(({source, vocal, skipped}) => {
        if (skipped) return [];
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
        return [run];
      }),
    })).filter(({runs}) => runs.length);
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
      const tokens = record.tokenIds.map((tokenId) => songTokens.get(tokenId) ?? fail(id, `unknown token ${tokenId}`));
      const vocals = tokens.flatMap((token) => {
        const timing = mapVocal(token, clock, fps);
        const preset = presetFor(card, token);
        return timing ? [{token, ...timing, preset}] : [];
      });
      if (!vocals.length) continue;
      const calls = vocals.filter(({token}) => token.role === 'lead');
      const replies = (card.parts?.length ? tokens.some(({role}) => role === 'lead') : calls.length)
        ? vocals.filter(({token}) => token.role === 'adlib') : [];
      const previous = bound.at(-1);
      const sceneOpener = n === 0 || !previous;
      const from = card.from ?? (sceneOpener && index === 0 ? opening() : fallback(id, 'from',
        sceneOpener ? opening() : row(previous!.id, -1)));
      const enter = card.enter ?? fallback(id, 'enter', sceneOpener ? cascade(typeOn(), {by: 'word', clock: 'sung'}) : draftRise());
      if (sceneOpener && card.old) fail(id, 'a scene opener cannot declare old');
      if (!sceneOpener && !card.old && !(isPair(enter) && enter.def.dismissesOld)) card.old = fallback(id, 'old', clear(fade()));
      if (!sceneOpener && from.kind === 'opening') fail(id, 'opening() requires a scene opener');
      const parts = card.parts ?? [];
      if (!Array.isArray(parts) || parts.length > 2 || [...parts].some((part) => !part)) fail(id, 'expected at most two ordered lead parts');
      const hasParts = parts.length > 0;
      const blocks: BoundBlock[] = [];
      const add = (item: BoundBlock | undefined, camera?: LineCard['camera']) => {
        if (item) blocks.push({...item, camera});
      };
      for (const ref of card.omit ?? []) {
        const found = (hasParts ? tokens : vocals.map(({token}) => token)).filter((token) => matches(ref, token));
        if (found.length !== 1) fail(id, `omit "${ref}" needs one token; candidates: ${found.map(({id}) => id).join(', ') || 'none'}`);
      }
      if (hasParts) {
        if (!Array.isArray(card.rows)) fail(id, 'a split lead needs explicit rows for its primary phrase');
        const leads = tokens.filter(({role}) => role === 'lead');
        if (!leads.length) fail(id, 'parts require lead vocals');
        const phrase: PhraseBinding = {tokens: leads.filter((token) => !card.omit?.some((ref) => matches(ref, token))), cursor: 0, last: false};
        add(block(id, {...card, from, enter, omit: undefined}, calls, false, phrase), card.camera);
        parts.forEach((part, i) => {
          const partId = `${id}.p${i + 1}`;
          if (!part || !Array.isArray(part.rows)) return fail(partId, 'a part needs explicit rows');
          const from = part.from ?? fallback(partId, 'from', row(id, -1));
          if (from.kind === 'opening') fail(partId, 'a part cannot use opening()');
          const enter = part.enter ?? fallback(partId, 'enter', draftRise());
          phrase.last = i === parts.length - 1;
          add(block(partId, {...part, from, enter, omit: undefined}, calls.map((vocal) =>
            ({...vocal, preset: vocal.preset || presetFor(part, vocal.token)})), false, phrase), part.camera);
        });
      } else {
        const lead = calls.length ? calls : vocals;
        add(block(id, {...card, from, enter, omit: card.omit?.filter((ref) => lead.some(({token}) => matches(ref, token)))},
          lead, false), card.camera);
      }
      let reply: BoundBlock | undefined;
      const replyId = id + '.reply';
      if (replies.length && (card.reply || draft)) {
        const authored = card.reply ?? fallback<ReplyCard>(replyId, 'reply', {});
        const from = authored.from ?? fallback(replyId, 'from', row(id, -1));
        const enter = authored.enter ?? fallback(replyId, 'enter', draftRise());
        const replyVocals = replies.map((vocal) => ({...vocal, preset: vocal.preset || presetFor(authored, vocal.token)}));
        const replyOmitted = [...(authored.omit ?? []), ...(card.omit ?? []).filter((ref) => replies.some(({token}) => ref === token.id || key(ref) === key(token.text)))];
        const allOmitted = replies.every(({token}) => replyOmitted.some((ref) => ref === token.id || key(ref) === key(token.text)));
        if (!allOmitted) reply = block(replyId, {...authored, from, enter, omit: replyOmitted}, replyVocals, true);
      } else if (replies.length) {
        const missing = replies.filter(({token}) => !card.omit?.some((ref) => ref === token.id || key(ref) === key(token.text)));
        if (missing.length) fail(id, `missing ad-lib tokens ${missing.map(({token}) => token.id).join(', ')}; use reply or omit`);
      } else if (card.reply && vocals.length === record.tokenIds.length) fail(replyId, 'no ad-lib tokens to bind');
      if (reply) add(reply);
      if (blocks.length) bound.push({id, card, lead: blocks[0], blocks: orderBlocks(id, blocks)});
    }
    if (bound.length) scenes.push({scene: resolved, lines: bound});
  }
  return {diagnostics, words, lines, scenes};
}
