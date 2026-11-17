# Vertical Short workflow (from the Right Chip Wrong Huang Short, 16 November 2026)

Organized notes for any chat making a 9:16 YouTube Short from a finished lyric video. Specs, advice and the order of work are below; reuse the tooling listed, do not rebuild it.

## Specs and decisions for a Short

Items 1, 3 (his approval of the cut), 4 and 8 trace to Jefferson's own requests for the Huang Short; the rest were compiled by the Huang chat. Weigh them with judgment.

1. Format: 9:16, 1080x1920, 30 fps, H.264, yuv420p, AAC at 48 kHz.
2. Length: the Huang chat aimed for over 1 minute and under 3 minutes (agent default; no source from Jefferson found).
3. Cut: built from the song's hook plus the strongest verse (Huang used opening Hook, Verse 3, final Hook). Propose the cut; he approves it.
4. Recompose the layout for vertical. No cropping the 16:9 master, no letterbox.
5. Safe zones: an agent estimate of where YouTube's Shorts interface covers the frame (top 8%, right 15%, bottom 20%). Keep important type and props clear of it.
6. Carry over whichever of the full video's own choices suit the Short (for Huang, for example, the "Huang" spelling and the readability work).
7. Vertical support lives in the shared engine as a reusable mode (already done, below).
8. Save to the repo's `YouTube upload - FINAL/` folder as `<Song> - VERTICAL SHORT (<sections>).mp4`, add a README line. Do not upload.

## Context and craft suggestions (agents' advice, not Jefferson's requirements)

9. Opening a Short on strong hook text tends to help retention. This came from an agent, not from Jefferson (he said so on 16 November 2026); weigh it with judgment like any other craft idea, alongside what suits the song.

## Order of work

1. Audio first. Propose the cut, then measure the splice points from drum transients (cross-correlation), not from the song map's beat grid: on Huang the grid ran about 40 ms late. Build the full Short audio (trim, resample to 48 kHz, 20 ms equal-power crossfade, `acrossfade d=0.02 c1=qsin c2=qsin`) and have Jefferson approve it by ear before any picture work. Picture timing depends on it.
2. Plumbing: Terra (`gpt-6.1-terra`, Codex build profile). A Short entry point and composition, the chunks mounted with Sequence offsets for the cut, the approved WAV as the audio, frame 0 check render.
3. Layout: Sol (`gpt-6.1-sol`), Jefferson's choice for the Huang Short; a Claude pass only if Sol's layout falls short. Recompose each board for the 720x1280 logical frame inside the safe box.
4. Fable gates review stills and short clips (rendered by the main agent; delegates never launch Chrome). Mechanical faults and things he raised block; the rest is polish.
5. Main agent renders the final, opens it locally for Jefferson, and sounds off.

## Reusable tooling (in this repo, commit 2c0bd94)

1. `engine/format.ts`: `WIDE` and `SHORT_916` presets. `SHORT_916` is logical 720x1280 rendered at scale 1.5, safe box x 48 to 612, y 102.4 to 1024. Pass it with `configureEngine({format})`; word, caption and framing checks then use its safe box.
2. `engine/cut.ts`: maps cut segments of song time onto Short frames.
3. `tools/splice-audio.mjs`: builds the spliced Short audio.
4. `tools/overlay-zones.mjs INPUT OUTPUT`: draws the platform zones on review stills or video.
5. `KIT.md`, section "Vertical Shorts".

## Reference implementation (Right Chip Wrong Huang repo, ~/Experiments/Right Chip Wrong Huang Music Video)

1. `reviews/Fable plan - vertical Short - 16 November 2026.md`: the plan (cut, audio method, layout rules, gate).
2. Commit c99781a: Terra plumbing. `video/src/short-index.ts`, composition `RightChipWrongHuangShort`, a frame module in the video's own kit that reads the format. Copy this pattern for a video that runs on its own kit rather than the shared engine.
3. Commit 731d632: the approved audio wired in.
4. Status as of this note: Sol's Huang layout is still running and has not been gated, so treat its picture approach as unproven.

## Routing for the DOGEfather and Buy This IPO Shorts

Jefferson, 16 November 2026: do not wait for Sol's Huang result. Build these two the way the original videos were built: Opus subagents build (plumbing and layout), Fable directs and gates, the main agent renders. Terra and Sol in the steps above describe the Huang Short only.
