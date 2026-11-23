# Keyword mode for fast words: results (22 November 2026)

Builder: Opus 5.5, for the T2 LeBron supervisor chat. Spec: `~/Experiments/Raise the Flagg Music Video/reviews/Engine feature request - keyword mode for fast words - 22 November 2026.md`, including Jefferson's appended change: on by default, with a per-song opt-out. Engine commit 45c661b. No render was run, and Raise the Flagg was not built.

1. Default ON. Opt out with `"fast_words": {"mode": "all_words"}`, with `enabled: false`, or for one build with `build_song.mjs --all-words`. The thresholds are the spec's: 4.5 words per second to enter, 3.5 to leave, a 2.0 s window, stretches of at least 1.5 s, and kept words at least 0.40 s apart.
2. Departure from the spec: the spec's drop list gives examples of word classes. I added the rest of those classes (its, it's, that's, can, me, they, be, have, do, will, by, as, and similar; `keywords.mjs` FUNCTION_WORDS). Without them, words like "its" and "can" kept the 0.4 s slot and pushed out content words such as "breath" and "hit".
3. Names: the map is in sentence case, so a word counts as a name only when written in capitals (KCP) or capitalised mid-sentence somewhere in the song. Team wordmark names, display numbers and palette pins also count. Known miss: Jaylen at 42.89 s is dropped (it only ever opens a line) and Brown is kept. A song can add it to `keep`.
4. Disabled, the output is identical: rebuilding the joined scenes from the brief 3 sections with `--all-words` gave byte-identical final scenes, joined scenes, sung-word files and section word lists for both songs. Caveat: the brief 3 finals had already been refreshed with this `build_song.mjs` using `--all-words`. This shows the off path changes nothing given the same sections; it is not an independent re-run of the pre-feature engine.
5. Unit check: `node --test deterministic/test_keywords.mjs`, 6 of 6 pass (on by default and off switches, slow lines untouched, a fast pair of lines detected with function words dropped and kept words 0.4 s apart, rhyme words and names kept, short bursts ignored, every line keeps a word).

## Default-on builds

6. Big Toothy Grins, `Rough cut 5 - 22 November`: 0 stretches, 0 words dropped. The final scene is byte-identical to Rough cut 4, the build exits 0, and every check from brief 3 holds.
7. Room for One, `Engine fix test 4 - 22 November`: 4 stretches, 30 words dropped, all listed in its provenance file.
   7.1. 39.47 to 43.65 s (peak 5.0 words per second): look, you, By, the, you, around, the, through, the, Jaylen.
   7.2. 50.19 to 51.78 s (5.0): That's, a, at, you.
   7.3. 91.36 to 94.22 s (5.0): All, of, holds, its, eyes, on, the, clock.
   7.4. 108.23 to 111.42 s (5.5): the, He, can, a, man, in, from, the.
8. Room for One gates hold: 0 overlap intervals, 0 partly shown focused words, 0 blank opening frames, still ending, 0 late, and 0 lyric words dropped by the sync check (keyword drops are exempt). Dropped focused words went from 3 to 2. Entrances went from 310 to 284, with 77 pops (27.1%, was 25.5%).
9. Worse: Room for One reveal coverage fell from 9.0% to **3.7%**, showing 79 plaques (was 82). Fewer words changed the section layouts and the trail's spread. Jefferson liked this reveal, and brief 3 asked that it not get worse. If he keeps keyword mode on for this song, the reveal needs a look; otherwise Room for One can opt out with `"fast_words": {"mode": "all_words"}`. The build still exits 1, for the same reasons as before (reveal under 20%, 76ers ring 10 of 15 frames).
