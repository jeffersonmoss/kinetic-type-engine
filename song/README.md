# Song import

Run `bin/kte ingest [film-folder]`. By default it reads `song.json` and
`analysis/Suno lyric alignment.json` from the film folder, and resolves the
configured audio path beside `song.json`. Use `--song`, `--alignment`,
`--audio`, or `--out` to supply explicit paths. The output directory holds
`song-map.json`, `ear-check.json`, `scansion.json`, and the generated `Ear check list.md`.
Atomic publication uses the system temporary directory, so the output and
temporary directories must be on the same filesystem.

The CLI tries `KTE_PYTHON`, `python3`, then `~/Experiments/*/.venv/bin/python`
and prints the first interpreter that can import librosa. It measures
beats from the separated percussive track using the legacy HPSS method.
When Python or librosa is missing, the map records the reason and leaves beat
data empty. Re-ingest with the working environment to populate it.

## Timing and identity

- `SongToken.start_s` and `end_s` are the effective vocal bounds on the song
  clock. The compiler maps them through the film edit list and computes
  Amendment 1's protected interval from the accepted readable frame. The
  importer needs no engine context or frame rate.
- `raw` records the lexical alignment span. `source` keeps each original
  fragment's text, chunk index, offset, and full timing, including detached
  punctuation. A detached closing mark contributes no vocal duration.
- IDs follow source lyric boundaries before display rules. Timing edits and
  spelling changes leave them stable. A display merge uses the first token's
  ID and lists all original IDs in `memberIds`. If lyrics or line breaks in
  the source alignment change, reconcile IDs before reusing author decisions.
- Explicit lyrics section tags supply names. Without tags, blank lines give
  unnamed stanza sections. Their bounds cover the vocals in that stanza.

## Ear checks

Ear-check `start` and `end` are seconds. Keep a proposal `open` until a
listener checks it or local Whisper word timing agrees within 150 ms.
Set `verified` to close a check with the alignment timing. Set `corrected`
with the accepted bounds to override it, and record the reviewer, date, and
evidence. Ingest keeps existing entries and appends new issues.
Count-in words recovered from one source chunk share that chunk's timing
until corrected. The Room for One fixture supplies the open onset estimates
from the comparison map, including the legacy Philly proposal.

## Scansion

Ingest estimates one span per pronounced vowel nucleus. It divides each
word's effective vocal duration equally across those nuclei and preserves
both endpoints exactly. Raw Suno spans remain available in `raw`. The
importer marks beats and downbeats within 40 ms of each estimated onset.
A line is `uncertain` when any syllable's lexical stress and beat proximity
disagree. With no beat grid, beat flags are false and this comparison is
skipped. A syncopated delivery can produce a disagreement.

Ingest checks for `cmudict.dict` or `cmudict-0.7b` at the repository root
or in `song/`, then for locally installed CMU dictionary data. It uses the
first pronunciation and reads its vowel stress digits. For words outside
the dictionary, it counts vowel groups in the sung spelling, accounts for
common silent endings, and estimates stress from weak function words,
explicitly capitalized components, and a few name pronunciations. Otherwise
it stresses the first syllable and gives later compound components secondary
stress. Display glyph boundaries are estimated from spelling in either case.
Ingest reads local data only.

Edit `analysis/scansion.json` by token ID. Each entry has `syllables`,
`source` and `verified`. A syllable has `text`, lexical `stress` and a
`sungStress` override. Use 0 for unstressed, 1 for primary, and 2 for
secondary stress. Use `null` in `sungStress` to follow lexical stress.
Keep the syllable letters in display order. For a listened correction,
set the override and record `source: "author"` and `verified: true`.
Re-ingest keeps author entries and adds new token IDs. It recalculates
time and beat flags from the accepted vocal bounds. Check, preview, and
render read the author file directly.

To seed a new author file, pass `--scansion <file>` to `kte ingest` or
`kte new`. The file can contain token entries in the author format or a
tune pattern such as `{"lines":[[1,0,2],[0,1]]}`. Supply one array per
lyric line and one stress value per syllable, in lyric order. A tune
pattern fills `sungStress` and keeps the lexical stresses.

```ts
import {beatPunch, cascade, onStress, type} from 'kte/effects';

const accents = [beatPunch(onStress({word: 'EMBIID', level: 1}))];
const enter = cascade(type(), {by: 'syllable'});
```

`onStress()` selects all stressed lead syllables. Use `word` with display
text or a stable token ID, `level` to select primary or secondary stress,
and `voice: 'adlib'` to target the reply. `beatPunch` peaks at the selected
syllable onset. A syllable cascade uses the sung clock by default and
still accepts a fixed gap. A syllable entrance must meet the existing
whole-word reading and landing deadlines. For a sustained word, use a
whole-word entrance with a separate syllable accent. `kte check` includes
unstressed-accent warnings, scansion in the sync rows, and accent frames
in the inspection list.

## Verification

`npm run -s check:song-import` type-checks the CLI and song module.
`npm run -s test:song-import` runs the repair, overlap, and display fixtures.
On macOS, supply the Room for One folder in `KTE_ROOM_FOR_ONE` and the librosa
interpreter in `KTE_PYTHON` to include the real-input comparison and correction
rerun. The test seeds both author files and writes its outputs in system
temp. Run `node fixtures/scansion/test.mjs` for compiler and SSR checks.
