# Engine fix brief 26: split contractions shown as one word (27 November 2026)

Written by Claude (Opus 5.5) for the Detroit Basketball film.

Jefferson, on rough cut 2 at 2:04, where THEY and 'RE sat apart as two words: "When two elements are parts of a single
word, they need to be shown in line as a single word."

Cause: Suno's aligner returned "They" and "'re" as two tokens, and the map kept them as two sung words.

Fix:
1. Skill script `build_song_map.py` merges a token that is a bare contraction suffix ('re, 's, 'll, 've, 'd, 'm, 't,
   n't) into the word before it on the same line. "'Cause" and "'round" are whole words and stay.
2. `build_song.mjs` refuses to build from a map that still has a split contraction, listing each one.
3. Detroit Basketball: `tools/merge_split_contractions.py` merged THEY'RE and shifted the index-keyed inputs.
