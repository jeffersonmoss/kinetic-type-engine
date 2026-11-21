import {spawnSync} from 'node:child_process';
import {copyFileSync, mkdirSync, statSync, symlinkSync, writeFileSync} from 'node:fs';
import {dirname, extname, join, resolve} from 'node:path';
import type {CompiledFilm, InspectionFrame} from '../compile';
import type {Format} from '../score';
import {inspectionPath, priorVerdicts, updateVerdicts} from './check';
import {compileFolder, prelude, readFilm, readJson, type FilmFolder} from './film';
import {bundleSource, withScratch, type Runtime} from './runtime';

const fonts = `
import {loadFont as anton} from '@remotion/google-fonts/Anton';
import {loadFont as barlow} from '@remotion/google-fonts/BarlowCondensed';
import {loadFont as accent} from '@remotion/google-fonts/DMSerifDisplay';
anton('normal', {weights: ['400'], subsets: ['latin']});
barlow('normal', {weights: ['700'], subsets: ['latin']});
accent('italic', {weights: ['400'], subsets: ['latin']});
`;

export function sectionFrames(film: CompiledFilm, section?: string): [number, number] {
  if (!section) return [0, Math.max(0, film.duration - 1)];
  const board = film.boards.find(({id}) => id === section);
  if (!board) throw new Error(`No section "${section}"; choose ${film.boards.map(({id}) => id).join(', ')}`);
  const start = Math.max(0, Math.min(film.duration - 1, Math.round(board.start * film.ctx.fps)));
  const end = Math.max(start, Math.min(film.duration - 1, Math.max(Math.ceil(board.end * film.ctx.fps) - 1,
    ...film.readings.filter((reading) => reading.board === section).map((reading) => reading.interval?.end ?? reading.landing))));
  return [start, end];
}

export async function prepareHost(runtime: Runtime, folder: FilmFolder, scratch: string, requireAudio = true) {
  const hasAudio = !!folder.audio && !!statSync(folder.audio, {throwIfNoEntry: false})?.isFile();
  if (requireAudio && !hasAudio) throw new Error(`Audio is missing: ${folder.audio ?? '(not configured in film.json)'}`);
  const publicDir = join(scratch, 'public');
  mkdirSync(publicDir);
  let audio: string | null = null;
  if (hasAudio && folder.audio) {
    audio = 'Film audio' + (extname(folder.audio) || '.mp3');
    copyFileSync(folder.audio, join(publicDir, audio));
  }
  symlinkSync(join(runtime.root, 'node_modules'), join(scratch, 'node_modules'), 'junction');
  const entry = join(scratch, 'Film host.mjs');
  await bundleSource(`${prelude(folder)}
${fonts}
import {mountFilm} from 'kte/host';
mountFilm(score, map, formats, ${JSON.stringify(audio)}, options);`, runtime.root, entry);
  return {entry, publicDir};
}

async function withBrowser<T>(runtime: Runtime, folder: FilmFolder, action: (setup: {
  renderer: typeof import('@remotion/renderer'); serveUrl: string;
  browser: Awaited<ReturnType<typeof import('@remotion/renderer').openBrowser>>;
  scratch: string;
  cancelSignal: ReturnType<typeof import('@remotion/renderer').makeCancelSignal>['cancelSignal'];
}) => Promise<T>, requireAudio = true) {
  return withScratch('remotion', async (scratch, stop) => {
    const {entry, publicDir} = await prepareHost(runtime, folder, scratch, requireAudio);
    const {bundle} = await import('@remotion/bundler');
    const renderer = await import('@remotion/renderer');
    const serveUrl = await bundle({entryPoint: entry, rootDir: runtime.root, publicDir, outDir: join(scratch, 'Remotion bundle'),
      enableCaching: false, ignoreRegisterRootWarning: true});
    stop.throwIfAborted();
    const browser = await renderer.openBrowser('chrome');
    const {cancelSignal, cancel} = renderer.makeCancelSignal();
    let closing: ReturnType<typeof browser.close> | undefined;
    const close = () => closing ??= browser.close({silent: true});
    const cancelRender = () => {cancel(); void close().catch(() => {});};
    stop.addEventListener('abort', cancelRender, {once: true});
    try {
      stop.throwIfAborted();
      return await action({renderer, serveUrl, browser, scratch, cancelSignal});
    } finally {
      stop.removeEventListener('abort', cancelRender);
      await close();
    }
  });
}

interface RenderOptions {
  mode: 'draft' | 'final';
  format?: string;
  section?: string;
  output?: string;
}

export async function renderFilm(folder: string, {mode, format, section, output}: RenderOptions, runtime: Runtime) {
  const draft = mode === 'draft';
  const base = readFilm(folder, format ?? (draft ? undefined : 'wide'));
  const chosen: Format = base.formats.includes('wide') ? 'wide' : base.formats[0];
  const input = format ? base : {...base, formats: [chosen]};
  input.options.draft = draft;
  if (!input.audio || !statSync(input.audio, {throwIfNoEntry: false})?.isFile()) {
    throw new Error(`Audio is missing: ${input.audio ?? '(not configured in film.json)'}`);
  }
  const [{film, result}] = await compileFolder(runtime, input, !draft);
  const path = output ? resolve(output) : join(input.path, 'renders', `${section ?? 'Film'} - ${film.format} ${mode}.mp4`);
  const diagnostics = [...(result ? result.diagnostics : film.diagnostics)];
  if (!draft) {
    for (const {frame, reason} of priorVerdicts(input.path).filter((row) => row.format === film.format && row.verdict === 'fail')) {
      diagnostics.push({severity: 'error', code: 'inspection-fail', frame, message: reason});
    }
  }
  const errors = diagnostics.filter(({severity}) => severity === 'error');
  if (errors.length) {
    if (!draft) {
      const first = errors[0];
      const where = [first.line, first.token, first.frame === undefined ? undefined : `frame ${first.frame}`].filter(Boolean).join(' / ');
      throw new Error(`${film.format}: ${errors.length} check errors. First: [${first.code}] ${where ? where + ': ' : ''}${first.message}. Run kte check for details.`);
    }
    console.warn(`${film.format}: ${errors.length} compiler errors across the film. This draft remains available for inspection. Run kte check for details.`);
  }
  const frameRange = draft ? sectionFrames(film, section) : undefined;
  const id = draft ? `${film.format}-draft` : film.format;
  mkdirSync(dirname(path), {recursive: true});
  await withBrowser(runtime, input, async ({renderer, serveUrl, browser, cancelSignal}) => {
    const composition = await renderer.selectComposition({serveUrl, id, puppeteerInstance: browser, timeoutInMilliseconds: 120_000});
    await renderer.renderMedia({serveUrl, composition, codec: 'h264', audioCodec: 'aac', enforceAudioTrack: true,
      frameRange, outputLocation: path, puppeteerInstance: browser, overwrite: true, cancelSignal, timeoutInMilliseconds: 120_000});
  });
  console.log(path);
}

export function contactSheet(folder: string, count: number, format: Format, output: string) {
  const cols = Math.min(count, 6);
  const rows = Math.ceil(count / cols);
  const size = format === 'wide' ? '240:135' : '135:240';
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', '1', '-start_number', '1',
    '-f', 'image2', '-i', join(folder, 'Still %06d.png'), '-vf', `scale=${size},tile=${cols}x${rows}:margin=8:padding=6:color=0x222222`, '-frames:v', '1', '-update', '1', output],
  {encoding: 'utf8', timeout: 120_000});
  if (result.error || result.status !== 0) throw new Error(`ffmpeg contact sheet failed: ${result.error?.message ?? result.stderr.trim()}`);
}

export async function sheet(folder: string, format: string | undefined, runtime: Runtime) {
  const input = readFilm(folder, format);
  const entries = await compileFolder(runtime, input);
  const plans = entries.map(({film}) => {
    const path = inspectionPath(input.path, film.format);
    const samples = readJson<InspectionFrame[]>(path);
    if (!Array.isArray(samples) || !samples.length || samples.some((s) =>
      s.format !== film.format || !Number.isSafeInteger(s.frame) || s.frame < 0 || s.frame >= film.duration || typeof s.reason !== 'string') ||
      new Set(samples.map(({frame}) => frame)).size !== samples.length) {
      throw new Error(`Invalid inspection samples in ${path}. Run kte check again.`);
    }
    return {film, samples};
  });
  await withBrowser(runtime, input, async ({renderer, serveUrl, browser, scratch, cancelSignal}) => {
    for (const {film, samples} of plans) {
      const directory = join(input.path, 'renders', 'inspection', film.format);
      mkdirSync(directory, {recursive: true});
      const contact = join(directory, 'Contact sheet.png');
      const stage = join(scratch, film.format);
      mkdirSync(stage);
      const composition = await renderer.selectComposition({serveUrl, id: film.format, puppeteerInstance: browser, timeoutInMilliseconds: 120_000});
      const sequence = new Map(samples.map(({frame}, i) => [frame, i + 1]));
      await renderer.renderFrames({serveUrl, composition, inputProps: {}, outputDir: null,
        frames: samples.map(({frame}) => frame), imageFormat: 'png', muted: true,
        puppeteerInstance: browser, cancelSignal, timeoutInMilliseconds: 120_000, concurrency: 2,
        onStart: () => {}, onFrameUpdate: () => {},
        onFrameBuffer(buffer, frame) {
          const path = join(stage, `Still ${String(sequence.get(frame)).padStart(6, '0')}.png`);
          writeFileSync(path, buffer);
        },
      });
      for (const [i, {frame}] of samples.entries()) {
        copyFileSync(join(stage, `Still ${String(i + 1).padStart(6, '0')}.png`), join(directory, `Frame ${frame}.png`));
      }
      contactSheet(stage, samples.length, film.format, contact);
      updateVerdicts(input.path, film.format, samples);
      console.log(`${samples.length} stills and contact sheet: ${directory}`);
    }
  }, false);
}
