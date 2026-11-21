import {parseArgs} from 'node:util';
import {checkCommand} from './check';
import {compileFolder, readFilm} from './film';
import {ingest, ingestUsage} from './ingest';
import {createFilm, newUsage} from './new';
import {renderFilm, sectionFrames, sheet} from './render';
import type {Runtime} from './runtime';

const usage = `${newUsage}
${ingestUsage}
kte check [film-folder] [--format wide|portrait]
kte render [film-folder] --draft [--section scene-id] [--format wide|portrait] [--output path]
kte render [film-folder] --final [--format wide] [--output path]
kte sheet [film-folder] [--format wide|portrait]
kte where TIME [film-folder] [--format wide|portrait] [--section scene-id]`;

function seconds(text: string) {
  const parts = text.split(':');
  if (parts.length > 3 || parts.some((part, i) => !(i === parts.length - 1 ? /^\d+(\.\d+)?$/ : /^\d+$/).test(part)) ||
    parts.slice(1).some((part) => Number(part) >= 60)) throw new Error(`Invalid time "${text}"`);
  return parts.reduce((sum, part) => sum * 60 + Number(part), 0);
}

export async function run([command, ...args]: string[], runtime: Runtime) {
  try {
    if (!command || command === '--help' || command === '-h') {console.log(usage); return;}
    if (command === 'ingest') {ingest(args, runtime.beatWorker); return;}
    if (command === 'new') {await createFilm(args, runtime); return;}
    if (!['check', 'render', 'sheet', 'where'].includes(command)) throw new Error(`Unknown command: ${command}\n${usage}`);
    const {values, positionals} = parseArgs({args, allowPositionals: true, options: {
      format: {type: 'string'}, help: {type: 'boolean', short: 'h'}, film: {type: 'string'},
      ...(command === 'render' || command === 'where' ? {section: {type: 'string' as const}} : {}),
      ...(command === 'render' ? {draft: {type: 'boolean' as const}, final: {type: 'boolean' as const}, output: {type: 'string' as const}} : {}),
    }});
    if (values.help) {console.log(usage); return;}
    const where = command === 'where';
    if (positionals.length > (where ? 2 : 1) || (where && !positionals[0])) throw new Error(usage);
    const folder = values.film ?? positionals[where ? 1 : 0] ?? process.env.KTE_FILM ?? '.';
    const str = (option: keyof typeof values) => typeof values[option] === 'string' ? values[option] as string : undefined;
    const format = str('format');
    if (command === 'check') await checkCommand(folder, format, runtime);
    else if (command === 'sheet') await sheet(folder, format, runtime);
    else if (command === 'render') {
      if (Boolean(values.draft) === Boolean(values.final)) throw new Error('Choose exactly one of --draft and --final');
      const section = str('section');
      if (values.final && section !== undefined) throw new Error('--final renders the full film and does not accept --section');
      if (values.final && format !== undefined && format !== 'wide') throw new Error('--final requires the wide format');
      await renderFilm(folder, {mode: values.final ? 'final' : 'draft', format, section, output: str('output')}, runtime);
    } else {
      const base = readFilm(folder, format);
      const chosen = base.formats.includes('wide') ? 'wide' : base.formats[0];
      const input = format ? base : {...base, formats: [chosen]};
      const [{film}] = await compileFolder(runtime, input);
      const window = sectionFrames(film, str('section'));
      const frame = window[0] + Math.floor(seconds(positionals[0]) * film.ctx.fps);
      if (frame > window[1]) throw new Error(`Time is beyond the selected output (${window[1] - window[0] + 1} frames)`);
      const starts = film.readings.filter((reading) => reading.onset <= frame && (!str('section') || reading.board === str('section')));
      const picked = starts.filter((reading) => frame <= reading.vocalEnd).sort((a, b) => b.onset - a.onset)[0] ??
        starts.sort((a, b) => b.onset - a.onset)[0];
      if (!picked) {console.log(`Frame ${frame}: before the first sung line`); return;}
      const scene = picked.board;
      console.log(`Frame ${frame} · ${picked.line} · scene ${scene} · ${input.manifest.sections?.[scene]?.score ?? 'score/index.ts'}`);
    }
  } catch (error) {
    console.error(`kte: ${error instanceof Error ? error.message : error}`);
    process.exitCode ||= 1;
  }
}
