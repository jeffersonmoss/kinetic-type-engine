# Song import

Run `bin/kte ingest [film-folder]`. By default it reads `song.json` and
`analysis/Suno lyric alignment.json` from the film folder, and resolves the
configured audio path beside `song.json`. Use `--song`, `--alignment`,
`--audio`, or `--out` to supply explicit paths. The output directory holds
`song-map.json`, `ear-check.json`, and the generated `Ear check list.md`.
Atomic publication uses the system temporary directory, so the output and
temporary directories must be on the same filesystem.

Set `KTE_PYTHON` to the Python executable with librosa. The CLI measures
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

## Verification

`npm run -s check:song-import` type-checks the CLI and song module.
`npm run -s test:song-import` runs the repair, overlap, and display fixtures.
On macOS, supply the Room for One folder in `KTE_ROOM_FOR_ONE` and the librosa
interpreter in `KTE_PYTHON` to include the real-input comparison and correction
rerun. The test seeds `ear-check.json` and writes its outputs in system temp.
