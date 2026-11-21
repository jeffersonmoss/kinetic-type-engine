import {spawnSync} from 'node:child_process';
import {copyFileSync, mkdirSync, statSync, symlinkSync, writeFileSync} from 'node:fs';
import {extname, join, resolve} from 'node:path';
import type {CompiledFilm, InspectionFrame} from '../compile';
import type {Format} from '../score';
import {inspectionPath, updateVerdicts} from './check';
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
  if (!section) return [0, film.duration - 1];
  const board = film.boards.find(({id}) => id === section);
  if (!board) throw new Error(`No section "${section}"; choose ${film.boards.map(({id}) => id).join(', ')}`);
  const start = Math.round(board.start * film.ctx.fps);
  const end = Math.min(film.duration - 1, Math.max(Math.ceil(board.end * film.ctx.fps) - 1,
    ...film.readings.filter((reading) => reading.board === section).map((reading) => reading.interval?.end ?? reading.landing)));
  return [start, end];
}

export async function prepareHost(runtime: Runtime, folder: FilmFolder, scratch: string) {
  if (!statSync(folder.audio, {throwIfNoEntry: false})?.isFile()) throw new Error(`Audio is missing: ${folder.audio}`);
  const publicDir = join(scratch, 'public');
  mkdirSync(publicDir);
  const audio = 'Film audio' + (extname(folder.audio) || '.mp3');
  copyFileSync(folder.audio, join(publicDir, audio));
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
}) => Promise<T>) {
  return withScratch('remotion', async (scratch, stop) => {
    const {entry, publicDir} = await prepareHost(runtime, folder, scratch);
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

export async function renderDraft(folder: string, format: string | undefined, section: string | undefined,
  output: string | undefined, runtime: Runtime) {
  const input = readFilm(folder, format ?? 'wide');
  const [{film}] = await compileFolder(runtime, input);
  const frameRange = sectionFrames(film, section);
  const path = output ? resolve(output) : join(input.path, 'renders', `${section ?? 'Film'} - ${film.format} draft.mp4`);
  const hard = film.diagnostics.filter(({severity}) => severity === 'error').length;
  if (hard) console.warn(`${film.format}: ${hard} compiler errors across the film. This draft remains available for inspection. Run kte check for details.`);
  await withBrowser(runtime, input, async ({renderer, serveUrl, browser, cancelSignal}) => {
    const composition = await renderer.selectComposition({serveUrl, id: `${film.format}-draft`, puppeteerInstance: browser, timeoutInMilliseconds: 120_000});
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
  });
}
