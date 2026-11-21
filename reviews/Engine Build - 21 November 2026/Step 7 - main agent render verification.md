# Step 7 main-agent render verification, 21 November 2026

Organized notes by the supervising Claude session. Ran the commands in the step 7 report from a host shell (Remotion and headless Chrome allowed).

1. `kte new` built a Room for One film folder from the Suno alignment, song.json and mp3 with KTE_PYTHON unset (found the Buy This IPO venv).
2. Draft renders with audio: h1 and v1, wide and portrait, all four produced. h1 wide is 18.4 s. Contact sheet shows the draft fallbacks working: block capitals (Anton, Barlow caps connectives), sung-clock type-on, reply rows under the call, retiring blur on exit. As expected for an unauthored draft, type is small and top-heavy; the score has to be authored (storyboard v2).
3. `kte check` on the draft exits 1 with its listed errors (expected for an unauthored scaffold); Frames to inspect.json written for both formats; `kte sheet` produced stills and contact sheets.
4. Edge fixture: clean version passes in both formats; clipped version fails as designed (wide: ENTER outside the safe box at frame 55 during protected reading, plus fast-move errors).
5. Not yet done: a human listen for sync; per-frame human verdicts in Inspection.json. These move to the step 8 pilot.
