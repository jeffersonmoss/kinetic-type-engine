# Engine fix brief 22: parallel rendering in capture.mjs (23 November 2026)

Requested by Jefferson (relayed from the T2 engine chat, 23 November 2026), before rendering This Is Memphis rough cut 1.

## Goal

Make multi-core parallel rendering a permanent feature of `deterministic/capture.mjs`.

## Requirements

1. Add `--jobs N` to `deterministic/capture.mjs` (default `6`, matching `build_song.mjs`; `--jobs 1` keeps the serial single-Chrome path).
2. Split the frame range `[0, n)` into `N` contiguous slices (`Math.min(N, n)` active workers), render each slice in its own headless Chrome with its own throwaway profile, own free remote-debugging port, and own temp folder, encode each slice with the exact same `ffmpeg` video settings (`libx264`, `yuv420p`, `crf 18`, `preset medium`), then join them with the `ffmpeg` concat demuxer (`-c:v copy`) and mux the audio once (`aac`, `192k`, `-shortest`) into the requested output.
3. Verify statelessness of `viewer.html` `renderAt(t)`: confirm no state carries across frames (blur, ripples, pulses, opacity, clip planes, backdrops, props, intro). If anything carries over, add lead-in frames and discard them; if purely stateless, confirm and document why zero lead-in frames are needed.
4. Clean up reliably on success, slice failure, timeout, and `SIGINT`/`SIGTERM` (Ctrl-C): kill every Chrome and `ffmpeg` child started, remove every temp folder created by the run, and clear stale `path-first-capture-*` leftovers from crashed runs at startup.
5. Proof on Thing 2: render one 20 s stretch both serially (`--jobs 1`) and with `--jobs 6`, verify exact frame count and frame match (`ffmpeg` PSNR across every frame plus raw rendered JPEG byte-hash comparison across slice boundaries), and report wall-clock times for both plus the full-song render with `--jobs 6`.
6. Update `deterministic/KIT.md` section 3.3 (Render), write the dated results file beside this brief, commit on `world-canvas`, and run `~/Experiments/Kinetic Type Engine Public Mirror/publish.sh`.
