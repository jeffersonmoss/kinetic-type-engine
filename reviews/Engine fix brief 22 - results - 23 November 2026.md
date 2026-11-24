# Engine fix brief 22: results (23 November 2026)

Parallel rendering (`--jobs N`) in `deterministic/capture.mjs`, implemented on branch `world-canvas` by Gemini 4 Neon (main agent on Thing 2).

## Summary of changes

1. **`deterministic/capture.mjs`:**
   - Added `--jobs N` (default `6`, matching `build_song.mjs`; `--jobs 1` runs the original serial single-Chrome path) and optional `--timeout sec`, with order-independent flag parsing.
   - Splits `[0, n)` into `Math.min(jobs, n)` contiguous slices, rendering each slice `f = fStart..fEnd-1` at exact global frame times `t0 + f / fps` in its own detached Chrome process group, with its own OS-assigned free TCP debug port (`net.createServer().listen(0)`), throwaway profile, and `path-first-capture-*` temp folder (`pid` + `TEMP_README.md`).
   - Encodes each video-only slice with identical `libx264` flags (`-pix_fmt yuv420p -crf 18 -preset medium -video_track_timescale <fps*512> -an`), joins them losslessly via the `ffmpeg` concat demuxer (`-c:v copy`), and muxes audio once (`-c:a aac -b:a 192k -shortest`).
   - Cleanup runs on normal completion, slice error (aborting sibling slices immediately), timeout (`exit 124`), `SIGINT` (`exit 130`), and `SIGTERM` (`exit 143`): kills each Chrome process group (`process.kill(-pid, 'SIGKILL')`) and `ffmpeg` child, waits for Chrome close before removing temp dirs (`maxRetries: 12, retryDelay: 50`), and sweeps dead-PID `path-first-capture-*` leftovers at startup.
2. **Statelessness verification (`deterministic/viewer.html`):**
   - Inspected `renderAt(seconds)` (lines 531 to 556) in full: every frame clears the output canvas, recomputes camera pose, motion-blur sample count/subframes, word visibility, opacity, ripples, pulses, clip planes, backdrops, props, captions, and intro purely from `t`. Zero state carries between frames, so zero lead-in frames are needed.
3. **`deterministic/KIT.md`:**
   - Updated section 3.3 (Render) item 23 with `--jobs N` and `--timeout sec`.

## Proof on Thing 2 (20 s stretch: Big Toothy Grins Rough cut 6k, `10 s` to `30 s`, 600 frames at 30 fps, `--blur on`)

1. **Wall-clock times (20 s stretch, 600 frames):**
   - Serial (`--jobs 1`): **`15.08 s`** wall (`14.97 s` inside `capture.mjs`).
   - Parallel (`--jobs 6`): **`18.27 s`** wall (`18.18 s` inside `capture.mjs`).
   - Honest note: on a short 20 s clip (100 frames per worker), launching 6 headless Chromes in parallel and building all ~400 scene textures 6 times adds ~13 s of startup overhead, which slightly exceeds the ~12 s rendering time saved on 600 frames. On a full ~175 s song (5,200+ frames), the fixed ~13 s startup amortizes across ~880 frames per worker. Full-song `--jobs 6` wall-clock time will be recorded after This Is Memphis rough cut 1 renders.
2. **Frame match & exactness:**
   - Frame counts & duration (`ffprobe`): both `--jobs 1` and `--jobs 6` produced exact `600` frames at `30/1 fps`, `20.000000 s`.
   - **Raw pre-encode JPEG byte hashes (statelessness proof):** compared SHA-256 hashes of `frameJPEG()` rendered sequentially (`95..101`, `195..201`) vs jumped directly into a fresh Chrome at slice boundaries (`100, 101, 200, 201`). Result: **`4/4` exact byte-for-byte matches** (`f100: 951ef057e7e7b3ec`, `f101: f718a8a7fb8cf55e`, `f200: bf2c85785021a8e0`, `f201: 204c3ae0d35591a1`).
   - **Encoded MP4 `ffmpeg` PSNR across all 600 frames:**
     - Overall: **`PSNR y:56.13 u:58.69 v:57.90 average:56.73 dB`**, `min: 43.62 dB`, `max: inf`.
     - Exact pixel matches (`psnr_avg = inf`): `162 / 600` frames.
     - Non-`inf` frames (`438 / 600`, `46` under `50 dB`): worst frame is `f199` (`n:200`, `psnr_avg: 43.62 dB`, `mse_avg: 2.82`), right at the slice 2/3 boundary (`f200`), caused purely by `libx264` CRF-18 keyframe/rate-control lookahead resetting at slice boundaries (`f100, f200, f300, f400, f500`) rather than any visual difference from Chrome.
3. **Cleanup verification:**
   - Fake stale dir (`path-first-capture-stale-*`, dead PID `999999`): cleared automatically on startup.
   - Leftover `path-first-capture-*` dirs after `--jobs 1`, after `--jobs 6`, and after `SIGINT` (`exit 130`) 3 s into `--jobs 6`: **0 leftovers**, **0 surviving Chrome processes**.
4. **Existing tests:**
   - `node --check capture.mjs`: pass.
   - `node test_stage_layers.mjs`: 21/21 pass.
   - `node --test test_keywords.mjs`: 5/6 pass; test 3 (`he dropped inside the stretch`) has a pre-existing failure unrelated to `capture.mjs` (from brief 10 item 48 pronoun keyword rules; `keywords.mjs` was not touched).

## What was not yet verified

1. Full-song `--jobs 6` wall-clock time (pending This Is Memphis rough cut 1 render; will be appended in a follow-up note or reported alongside rough cut 1).
2. `--timeout` expiry exit path was syntax-checked and inspected in code but not triggered with a live timeout run.
