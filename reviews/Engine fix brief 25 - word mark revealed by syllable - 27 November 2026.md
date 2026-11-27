# Engine fix brief 25: word mark revealed by syllable (27 November 2026)

Written by Claude (Opus 5.5) for the Detroit Basketball film.

Jefferson, on rough cut 1, where the chanted DETROIT was split into two words (DE and TROIT, each with its own image):
"you need to have both halves of the wordmark at the same scale, and have them positioned so that once the second
half comes in, it looks identical to the complete undivided word mark, not with the two different parts shifted apart
like this."

Fix: keep the word whole and swap its drawn image at song times.

1. `word_overrides.<index>.image_steps: [{ at_s, image }]` (song_appearance.mjs). Each step image shares the base
   image's canvas (a mismatch throws). The word box and ink come from the last step (the whole mark), so every partial
   image sits at the final scale and position from the first frame.
2. viewer.html draws a texture per step and switches the front face to the latest step whose frame has been reached.
3. Song input: the partial image is the whole wordmark with the later letters made transparent (same canvas).
