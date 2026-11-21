import type {EngineContext} from '../context';
import {lowerUnit, scheduleUnit, unitCues, type UnitCall, type WordSchedule} from '../effects';
import {key, type BoundLine, type Diagnostic} from './bind';
import type {BlockWork, BoundTarget, SceneWork} from './entrance';
import type {SyllableTarget} from './syllables';

export interface AccentSample {frame: number; reason: string}

export function lowerAccents(ctx: EngineContext, work: SceneWork, authored: BoundLine,
  diagnostics: Diagnostic[], samples: AccentSample[]) {
  const owners = work.blocks.filter(block => block.authored === authored);
  for (const [n, call] of (authored.card.accents ?? []).entries()) {
    if (call.def.kind !== 'accent') throw new Error(`${authored.id}: ${call.name} is not an accent`);
    const warned = new Set<string>();
    const record = (block: BlockWork, target: BoundTarget, syllable: SyllableTarget, frame: number) => {
      const token = block.item.runs.find(run => run.i === target.word)?.vocal?.token.id;
      const label = `${call.name} on syllable "${syllable.text}"`;
      samples.push({frame, reason: `${block.item.id} · ${label}`});
      const id = `${token}/${syllable.index}/${frame}`;
      if (syllable.stress === 0 && !warned.has(id)) {
        warned.add(id);
        diagnostics.push({severity: 'warn', code: 'unstressed-accent', line: block.item.id, token,
          frame, message: `${label} (unstressed)`});
      }
    };
    const add = (block: BlockWork, schedule: WordSchedule[], suffix = '', activeGlyphs?: ReadonlyMap<number, readonly number[]>) => {
      const name = `${call.name} · ${block.item.id} · ${n + 1}${suffix}`;
      work.entries.push([name, lowerUnit(call, ctx, {schedule, activeGlyphs})]);
      (work.board.blocks[block.index].verb ??= []).push(...unitCues(name, schedule, ctx.fps));
    };
    const hitFrame = (span: NonNullable<WordSchedule['span']>) =>
      span.start + Math.round((span.end - span.start) * (call.def.hit ?? 0));

    if (call.stressTarget) {
      if (authored.lead.start !== undefined) throw new Error(`${authored.id}: onStress() requires sung lyrics`);
      if (call.cascade) throw new Error(`${authored.id}: onStress() supplies its own syllable schedule`);
      const {word, level, voice = 'lead'} = call.stressTarget;
      const scheduled: UnitCall<any> = {...call, cascade: {by: 'glyph', clock: 'sung'}};
      for (const block of owners) for (const target of block.targets) {
        const vocal = block.item.runs.find(run => run.i === target.word)?.vocal;
        if (!vocal || vocal.token.voice !== voice ||
            (word !== undefined && word !== vocal.token.id && key(word) !== key(vocal.token.text))) continue;
        if (!target.stressSyllables) {
          diagnostics.push({severity: 'warn', code: 'missing-scansion', line: block.item.id, token: vocal.token.id,
            message: `${call.name} onStress() needs scansion for "${vocal.token.text}"; run kte ingest`});
          continue;
        }
        for (const syllable of target.stressSyllables) {
          if (!syllable.stress || (level !== undefined && level !== syllable.stress) || syllable.sungFrame === undefined) continue;
          const frame = syllable.sungFrame;
          const schedule = scheduleUnit(scheduled, ctx, [{...target,
            glyphFrames: Array.from({length: target.glyphs}, () => frame)}], frame);
          add(block, schedule, ` · ${target.word}.${syllable.index + 1}`, new Map([[target.word, syllable.glyphs]]));
          record(block, target, syllable, frame);
        }
      }
      continue;
    }

    const {word} = call.params as {word?: string};
    const bySyllable = call.cascade?.by === 'syllable';
    const selection = word ? owners.filter(({item}) => !item.reply) : owners.slice(0, 1);
    const identities = new Set<string>();
    const matches = selection.map(block => ({block, targets: block.targets.filter(target => {
      const run = block.item.runs.find(run => run.i === target.word)!;
      const token = run.vocal?.token;
      const namedSyllables = bySyllable && token && (token.id === word || key(token.text) === key(word ?? ''));
      if (word && !namedSyllables && run.text.toUpperCase() !== word.toUpperCase()) return false;
      identities.add(bySyllable && token ? token.id : String(run.i));
      return true;
    })}));
    if (!identities.size) throw new Error(`${authored.id}: ${call.name} has no matching target "${word}"`);
    if (word && identities.size !== 1) throw new Error(`${authored.id}: ${call.name} has an ambiguous target "${word}"`);
    for (const {block, targets} of matches) {
      if (!targets.length) continue;
      const start = block.item.start !== undefined ? block.landing : Math.min(...targets.map(({sungFrame}) => sungFrame!));
      const schedule = scheduleUnit(call, ctx, targets, start);
      const active = new Map<number, readonly number[]>();
      for (const entry of schedule) {
        const target = targets.find(({word}) => word === entry.word)!;
        const syllables = target.stressSyllables?.filter(syllable => syllable.sungFrame !== undefined);
        if (!syllables?.length) continue;
        if (bySyllable && entry.glyphs) {
          active.set(entry.word, syllables.flatMap(({glyphs}) => glyphs));
          for (const syllable of syllables) record(block, target, syllable, hitFrame(entry.glyphs[syllable.glyphs[0]]));
        } else {
          const starts = new Set(entry.span ? [entry.span.start] : entry.glyphs!.map(span => span.start));
          for (const frame of starts) {
            const at = syllables.filter(syllable => syllable.sungFrame! <= frame).at(-1);
            if (at) record(block, target, at, frame);
          }
        }
      }
      add(block, schedule, '', active);
    }
  }
}
