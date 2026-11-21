import {constants, copyFileSync, existsSync, mkdirSync, statSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {basename, dirname, extname, join, resolve} from 'node:path';
import {parseArgs} from 'node:util';
import type {SongMap} from '../song';
import {formats, json, readJson, type Manifest} from './film';
import {ingest} from './ingest';
import {readAlignment, readConfig} from './inputs';
import {withScratch, type Runtime} from './runtime';

export const newUsage = 'Usage: kte new "Title" --audio file --alignment file [--song file] [--suno-clip id] [--here folder] [--pointer project-folder]';

function sectionCards(map: SongMap) {
  const first = map.sections.map((section) => map.lines.find(({id}) => id === section.lineIds[0])!.text.toLowerCase());
  let hook = 0, verse = 0;
  return map.sections.map((section, index) => {
    const repeated = first.filter((text) => text === first[index]).length > 1;
    const label = section.name?.toLowerCase() ?? '';
    const isHook = repeated || /hook|chorus/.test(label);
    return {id: isHook ? `h${++hook}` : `v${++verse}`, section};
  });
}

function copyNew(source: string, destination: string) {
  if (!existsSync(destination)) copyFileSync(source, destination, constants.COPYFILE_EXCL);
}
function writeNew(path: string, data: string) {
  if (!existsSync(path)) writeFileSync(path, data, {flag: 'wx'});
}

export async function createFilm(args: string[], runtime: Runtime) {
  const {values, positionals} = parseArgs({args, allowPositionals: true, options: {
    audio: {type: 'string'}, alignment: {type: 'string'}, song: {type: 'string'}, 'suno-clip': {type: 'string'},
    here: {type: 'string'}, pointer: {type: 'string'}, help: {type: 'boolean', short: 'h'},
  }});
  if (values.help) {console.log(newUsage); return;}
  const title = positionals[0]?.trim();
  if (positionals.length !== 1 || !title || title === '.' || title === '..' || /[/\\\r\n]/u.test(title)) throw new Error(newUsage);
  const folder = resolve(values.here ?? join(homedir(), 'Experiments', `${title} Music Video`));
  if (!values.here && existsSync(folder)) throw new Error(`Film folder already exists. Use --here to adopt it: ${folder}`);
  const songSource = values.song ? resolve(values.song) : join(folder, 'song.json');
  const config = existsSync(songSource) ? readConfig(readJson(songSource)) : {song: title};
  const audio = values.audio ? resolve(values.audio) : config.audio ? resolve(dirname(songSource), config.audio) : undefined;
  const alignment = resolve(values.alignment ?? join(folder, 'analysis', 'Suno lyric alignment.json'));
  if (!audio || !statSync(audio, {throwIfNoEntry: false})?.isFile() || !existsSync(alignment)) throw new Error(newUsage);
  const alignmentData = readAlignment(readJson(alignment));
  const clip = values['suno-clip'] ?? alignmentData.audio_id ?? null;
  if (values['suno-clip'] && alignmentData.audio_id && values['suno-clip'] !== alignmentData.audio_id) {
    throw new Error('--suno-clip does not match the alignment audio_id');
  }
  const audioName = `audio/${title}${extname(audio) || '.mp3'}`;
  const analyses = ['song-map.json', 'ear-check.json', 'Ear check list.md'];
  const mapping = join(folder, 'analysis', 'song-map.json');

  await withScratch('new', (scratch) => {
    if (!analyses.every((name) => existsSync(join(folder, 'analysis', name)))) {
      const prior = join(folder, 'analysis', 'ear-check.json');
      if (existsSync(prior)) copyNew(prior, join(scratch, 'ear-check.json'));
      const stagedSong = join(scratch, 'song.json');
      writeFileSync(stagedSong, json({...config, audio: audioName}));
      ingest([folder, '--song', stagedSong, '--audio', audio, '--alignment', alignment, '--out', scratch], runtime.beatWorker);
    }
    const map = readJson<SongMap>(existsSync(mapping) ? mapping : join(scratch, 'song-map.json'));
    const cards = sectionCards(map);
    const files = Object.fromEntries(cards.map(({id, section}) => [id, {songSection: section.id, score: `score/Section ${id}.ts`}]));
    const manifest: Manifest = {engine: 'dev', title, sunoClip: clip, audio: audioName, formats: [...formats],
      edits: [{start: 0, end: Math.max(map.analysis.duration_s ?? 0, ...map.tokens.map(({end_s}) => end_s + 0.55))}], sections: files};

    for (const subfolder of ['audio', 'analysis', 'score', 'renders', 'reviews']) mkdirSync(join(folder, subfolder), {recursive: true});
    copyNew(audio, join(folder, audioName));
    copyNew(alignment, join(folder, 'analysis', 'Suno lyric alignment.json'));
    writeNew(join(folder, 'song.json'), json({...config, audio: audioName}));
    if (!existsSync(mapping)) writeNew(mapping, json({...map, audio: audioName}));
    for (const name of analyses.filter((name) => name !== 'song-map.json')) copyNew(join(scratch, name), join(folder, 'analysis', name));
    writeNew(join(folder, 'film.json'), json(manifest));
    for (const {id, section} of cards) {
      const lines = section.lineIds.map((lineId) => {
        const tokens = map.tokens.filter((token) => token.lineId === lineId);
        const call = tokens.some(({role}) => role === 'lead');
        const reply = call && tokens.some(({role}) => role === 'adlib');
        const comment = tokens.map(({text}) => text.replace(/[\r\n]/gu, ' ')).join(' ');
        return `    // ${comment}\n    line(${JSON.stringify(lineId)}, ${reply ? '{reply: {}}' : '{}'}),`;
      });
      writeNew(join(folder, files[id].score),
        `import {line, scene} from 'kte/score';\n\nexport default scene(${JSON.stringify(id)}, {ground: 'night', lines: [\n${lines.join('\n')}\n]});\n`);
    }
    writeNew(join(folder, 'look.ts'), `// Anton and Barlow Condensed Bold capitals are the score defaults.\nexport default {shadow: false};\n`);
    writeNew(join(folder, 'score', 'index.ts'), `import {film} from 'kte/score';\nimport look from '../look';\n${cards.map(({id}) =>
      `import ${id} from './Section ${id}';`).join('\n')}\n\nexport default film({song: ${JSON.stringify(title)}, look, scenes: [${cards.map(({id}) => id).join(', ')}]});\n`);
    writeNew(join(folder, 'tsconfig.json'), json({compilerOptions: {target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler',
      strict: true, skipLibCheck: true, jsx: 'react-jsx', paths: {'kte/*': [join(runtime.root, '*')]}}, include: ['look.ts', 'score/**/*.ts']}));
    writeNew(join(folder, 'README.md'), `# ${title}\n\nThis film uses the Kinetic Type Engine working tree. From this folder, run \`kte check\` or \`kte render --draft --section ${cards[0].id}\`.\n`);
  });
  if (values.pointer) {
    const target = resolve(values.pointer);
    if (!statSync(target, {throwIfNoEntry: false})?.isDirectory()) throw new Error(`Pointer destination is not a folder: ${target}`);
    writeNew(join(target, `${basename(folder)}.txt`), `${folder}\n`);
  }
  console.log(folder);
}
