import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {build, stop} from 'esbuild';

const fixture = name => fileURLToPath(new URL(name, import.meta.url));
const result = await build({
  entryPoints: [fixture('../../song/index.ts')], bundle: true, platform: 'node', format: 'esm', write: false,
});
stop();
const {importSong} = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
const unavailable = {status: 'unavailable', duration_s: null, tempo_bpm: null, downbeat_phase: null, beats: [], reason: 'Unit fixture'};
const words = (...rows) => rows.map(([word, start_s, end_s]) => ({word, start_s, end_s}));
const ingest = (alignment, config = {}, earChecks = []) => importSong({
  alignment: {words: alignment}, config: {song: 'Fixture', ...config},
  audio: 'fixture.mp3', analysis: unavailable, earChecks,
});

test('clamps a joined closing exclamation at the next onset in its own voice', () => {
  const {map, earChecks} = ingest(words(['(ring!)', 1, 3], [' (Again!)', 2, 2.5]));
  const [ring, again] = map.tokens;
  assert.equal(ring.text, 'ring!');
  assert.equal(ring.rawText, '(ring!)');
  assert.equal(ring.end_s, 2);
  assert.deepEqual(ring.raw, {start_s: 1, end_s: 3});
  assert.deepEqual(ring.repairs, ['glued-closing-punctuation']);
  assert.equal(ring.voice, 'adlib');
  assert.equal(again.start_s, 2);
  assert.equal(earChecks[0].status, 'open');
});

test('keeps later punctuation in the source without allocating its silence to the old lyric', () => {
  const {map, earChecks} = ingest(words(['(ring', 1, 1.25], ['!)\nNext', 13.5, 14]));
  const [ring, next] = map.tokens;
  assert.deepEqual([ring.end_s, next.start_s], [1.25, 13.5]);
  assert.deepEqual([ring.raw.end_s, ring.source.at(-1).start_s], [1.25, 13.5]);
  assert.equal(earChecks[0].issue, 'glued-closing-punctuation');
  assert.equal(map.lines[0].end_s, 1.25);
});

test('recovers a glued count-in line without inventing its vocal times', () => {
  const {map, earChecks} = ingest(words(['Ready', 0.5, 0.9], ['!\n\n(One! Two! Three!)\n\nFour', 2, 2.5]));
  assert.deepEqual(map.lines.map(line => line.text), ['Ready!', 'One! Two! Three!', 'Four']);
  const chant = map.tokens.slice(1, 4);
  assert(chant.every(token => token.role === 'adlib' && token.voice === 'adlib'));
  assert(chant.every(token => token.raw.start_s === 2 && token.raw.end_s === 2.5));
  assert(chant.every(token => token.start_s === 2 && token.end_s === 2.5));
  assert(chant.every(token => token.repairs[0] === 'glued-chant'));
  assert.deepEqual(earChecks.map(entry => entry.issue), Array(3).fill('glued-chant'));
  assert.deepEqual([map.tokens[4].start_s, map.tokens[4].end_s], [2, 2.5]);
});

test('preserves a cross-voice overlap even when the ad-lib ends in closing punctuation', () => {
  const {map, earChecks} = ingest(words(['(ring!)', 1, 3], [' lead', 2, 4]));
  const [adlib, lead] = map.tokens;
  assert.deepEqual([adlib.voice, adlib.start_s, adlib.end_s], ['adlib', 1, 3]);
  assert.deepEqual([lead.voice, lead.start_s, lead.end_s], ['lead', 2, 4]);
  assert.deepEqual(adlib.repairs, []);
  assert.equal(earChecks.length, 1);
  assert.equal(earChecks[0].status, 'open');
  assert.match(earChecks[0].evidence, /adlib.+lead/);
});

test('spelling and same-voice merges retain source, stable IDs and corrected member timing', () => {
  const alignment = words(['[Verse]\nDojh', 1, 1.3], [' U', 1.5, 1.6], [' SAID', 1.6, 1.8],
    ['\n\nU', 2, 2.1], [' (SAID)', 2.2, 2.3], ['\nU', 2.4, 2.5], ['\nSAID', 2.6, 2.7]);
  const correction = {
    id: 'editor-onset', tokenId: 'line-1.token-3', issue: 'author timing', status: 'corrected',
    start: 1.7, end: 1.95, by: 'fixture', date: '2026-11-21', evidence: 'Fixture timing.',
  };
  const {map, earChecks} = ingest(alignment, {
    display: [['\\bDojh\\b', 'DOGE']], merge: [['U', 'SAID', 'USAID']],
  }, [correction]);
  assert.equal(map.sections.length, 1);
  assert.equal(map.sections[0].name, 'Verse');
  assert.deepEqual(map.lines.map(line => line.text), ['DOGE USAID', 'U SAID', 'U', 'SAID']);
  const merged = map.tokens[1];
  assert.deepEqual(merged.memberIds, ['line-1.token-2', 'line-1.token-3']);
  assert.equal(merged.id, 'line-1.token-2');
  assert.deepEqual(merged.raw, {start_s: 1.5, end_s: 1.8});
  assert.equal(merged.end_s, 1.95);
  assert.equal(map.lines[0].end_s, 1.95);
  assert.equal(earChecks[0], correction);
});

const room = process.env.KTE_ROOM_FOR_ONE;
const tempRoot = '/private/tmp';
const tempPrefix = 'kte-build-room-for-one-';
const ownerLine = 'owner: Room for One import test';

function processIsRunning(pid) {
  if (!pid) return false;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch (error) {
    return error.code !== 'ESRCH';
  }
}

function cleanStaleRuns() {
  for (const item of fs.readdirSync(tempRoot, {withFileTypes: true})) {
    const pid = item.name.startsWith(tempPrefix) && /^(\d+)-/.exec(item.name.slice(tempPrefix.length))?.[1];
    if (!item.isDirectory() || !pid || processIsRunning(pid)) continue;
    const dir = path.join(tempRoot, item.name);
    const marker = path.join(dir, 'TEMP_README.md');
    if (!fs.existsSync(marker)) continue;
    const label = fs.readFileSync(marker, 'utf8');
    if (label.startsWith(ownerLine + '\n') && !processIsRunning(/^worker: (\d+)$/m.exec(label)?.[1])) {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  }
}

test('Room for One and a re-ingest with author decisions', {skip: !room}, async () => {
  cleanStaleRuns();
  const scratch = fs.mkdtempSync(path.join(tempRoot, `${tempPrefix}${process.pid}-`));
  let child;
  const stopChild = () => {
    if (!child?.pid) return;
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  };
  const cleanup = () => {
    try {
      stopChild();
    } finally {
      fs.rmSync(scratch, {recursive: true, force: true});
    }
  };
  const interrupt = () => { cleanup(); process.exit(130); };
  const terminate = () => { cleanup(); process.exit(143); };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', terminate);

  try {
    const read = (dir, name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    const earPath = path.join(scratch, 'ear-check.json');
    const readme = path.join(scratch, 'TEMP_README.md');
    const label = [
      ownerLine, 'shared: no', 'purpose: verify real song ingest and timing persistence',
      'created by: fixtures/song-import/import.test.mjs', `date: ${new Date().toISOString()}`,
      'needed until: this test exits', 'expensive to recreate: no', '',
    ].join('\n');
    fs.writeFileSync(readme, label);
    fs.copyFileSync(fixture('Room for One Ear Check Estimates.json'), earPath);

    const run = async (python = process.env.KTE_PYTHON) => {
      const profile = '(version 1) (allow default) (deny file-write*) (allow file-write* (subpath (param "SCRATCH")) (literal "/dev/null"))';
      const cli = fixture('../../bin/kte');
      const args = ['ingest', room, '--out', scratch];
      // Delegates with an existing write sandbox cannot nest macOS sandbox-exec.
      const useExistingSandbox = process.env.KTE_TEST_USE_EXISTING_SANDBOX === '1';
      const executable = useExistingSandbox ? cli : 'sandbox-exec';
      const commandArgs = useExistingSandbox ? args : ['-D', `SCRATCH=${scratch}`, '-p', profile, cli, ...args];
      child = spawn(executable, commandArgs, {
        detached: true, env: {...process.env, KTE_PYTHON: python, TMPDIR: scratch},
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8').on('data', data => { stdout += data; });
      child.stderr.setEncoding('utf8').on('data', data => { stderr += data; });
      const timeout = setTimeout(stopChild, 185_000);
      try {
        const exit = new Promise((resolve, reject) => {
          child.once('error', reject);
          child.once('close', (...result) => resolve(result));
        });
        if (child.pid) fs.writeFileSync(readme, label + `worker: ${child.pid}\n`);
        const [code, signal] = await exit;
        assert.equal(code, 0, stderr || signal);
        console.log(stdout.split('\n')[0]);
      } finally {
        clearTimeout(timeout);
        stopChild();
        child = undefined;
      }
      return read(scratch, 'song-map.json');
    };

    const map = await run();
    const old = read(room, 'analysis/Song map.json');
    const ear = read(scratch, 'ear-check.json');
    const config = read(room, 'song.json');
    assert.equal(map.schema, 2);
    assert.equal(map.lines.length, 39);
    assert.equal(map.tokens.length, 319);
    assert.deepEqual(map.tokens.map(x => x.text), old.words.map(x => x.text.replace(/[()]/g, '')));
    assert(map.lines.every(line => !/[()]/.test(line.text)));
    assert(map.tokens.every(token => config.display.every(([pattern]) => !new RegExp(pattern, 'u').test(token.text))));
    const adlibs = map.tokens.filter(token => token.role === 'adlib');
    const legacyAdlibs = old.words.filter(({text}) => /[()]/.test(text));
    assert(adlibs.length > legacyAdlibs.length && adlibs.every(token => token.voice === 'adlib'));
    assert(map.tokens.filter(token => token.repairs.length).every(token =>
      Number.isFinite(token.raw.start_s) && Number.isFinite(token.raw.end_s) && token.source.length > 0));
    assert.deepEqual(map.analysis.beats, old.beats);
    assert.equal(map.analysis.tempo_bpm, old.tempo_bpm);
    assert.equal(map.analysis.duration_s, old.duration_s);

    const count = ear.filter(entry => entry.issue === 'glued-chant');
    assert.deepEqual(count.map(entry => [entry.start, entry.status]), [[118.5, 'open'], [118.82, 'open'], [119.12, 'open']]);
    const philly = ear.find(entry => entry.tokenId === 'line-39.token-1');
    assert.deepEqual([philly.start, philly.end, philly.status], [154.865, 155.265, 'open']);
    const ring = map.tokens.find(token => token.id === 'line-20.token-6');
    assert.equal(ring.end_s, 71.226);
    assert.equal(ring.source.at(-1).start_s, 83.386);
    assert(ear.some(entry => entry.tokenId === ring.id && entry.status === 'open'));
    console.log(`${adlibs.length} voiced ad-lib tokens, ${map.analysis.tempo_bpm} BPM; all display tokens and beat records match the legacy map.`);

    const [target] = count;
    const verified = ear.find(entry => entry.tokenId === 'line-4.token-6');
    for (const [entry, status] of [[target, 'corrected'], [verified, 'verified']]) {
      Object.assign(entry, {status, by: 'test only', date: '2026-11-21', evidence: 'Fixture assertion only.'});
    }
    const edited = JSON.stringify(ear) + '\n';
    fs.writeFileSync(earPath, edited);

    const updated = await run();
    assert.deepEqual(updated.lines.map(line => line.id), map.lines.map(line => line.id));
    assert.deepEqual(updated.tokens.map(token => token.id), map.tokens.map(token => token.id));
    assert.equal(fs.readFileSync(earPath, 'utf8'), edited);
    const token = updated.tokens.find(token => token.id === target.tokenId);
    assert.deepEqual([token.start_s, token.end_s], [118.5, 118.8]);
    assert.deepEqual(token.raw, {start_s: 119.742, end_s: 120.413});
    const line = updated.lines.find(line => line.id === token.lineId);
    assert.equal(line.start_s, 118.5);
    assert.notEqual(line.start_beat, map.lines.find(original => original.id === line.id).start_beat);
    const list = fs.readFileSync(path.join(scratch, 'Ear check list.md'), 'utf8');
    assert.match(list, /\*\*corrected\*\*.*line-34.token-1/);
    assert.match(list, /\*\*verified\*\*.*line-4.token-6/);
    console.log('Correction applied; line and token IDs, raw time, and author file bytes persisted.');

    const missing = await run(path.join(scratch, 'missing-python'));
    assert.equal(missing.analysis.status, 'unavailable');
    assert.deepEqual(missing.analysis.beats, []);
    assert.equal(missing.lines[0].start_beat, null);
  } finally {
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', terminate);
    cleanup();
  }
});
