# Engine fix brief 15: Timberwolves jersey font (23 November 2026)

From the supervisor (T2 engine chat), relaying the lamelo chat. Builder: Gemini Neon, as the continuation of brief 14 in the same thread. Do this before the final 6h re-join, so 6h carries both.

## Finding (from Neon's jersey sweep, checked by the lamelo chat on one photo)

Sweep: 355 photos across 20 styles (222 backs). Index: `~/Experiments/Big Toothy Grins Music Video/reference/Timberwolves jersey photos - expires 7 December 2026/Index.md`. For Big Toothy Grins use the current Icon / Association / Statement font (2017 to 2026, RARE Design custom): a condensed sans serif with 45-degree chamfered corners on curved letters (B C D G O R S U), flat squared stroke ends, and a crossbar-less A drawn as Λ (EDWΛRDS). Names are white with no outline; numbers are white with a thin lake-blue outline (we draw no letter outlines: KIT Type rule 3, so numbers are plain white).

## REVISED, 23 November 2026 (before this brief started): font choice dropped

Jefferson's direction, relayed by the lamelo chat: for player names, jersey numbers and team names he wants the classic POINTY Timberwolves lettering (flared pointed tips with a small split spur, as on the Classic Edition backs: GARNETT 21, GOBERT 27, EDWARDS 5), not the modern chamfered Icon font. A separate Neon thread is building that as a real font in `~/Experiments/Timberwolves Classic Pointy Font/`. So the original items 1 to 3 below (pick a free Icon look-alike, set it as `jersey_font`, Λ for A) are withdrawn. Do NOT wire any font into Big Toothy Grins.

## What to do now

1. Durable team font record only: add `deterministic/team_fonts.json` plus a short KIT.md process note outside the Type rules, with one Timberwolves entry: chosen look "Classic Edition pointy lettering" (Jefferson, 23 November 2026), font file "pending, being built in ~/Experiments/Timberwolves Classic Pointy Font/", the Icon chamfered font (2017 to 2026, RARE Design) noted as an alternate not chosen, names white with no outline, numbers white, and the reference folder above. Do not point any song at it yet.
2. Then do brief 14's re-join as `Rough cut 6h - 23 November` with brief 14 in (no font change), check exit 0, run the Type rules check, commit, and add a short section to the brief 14 results file.

## Withdrawn original items (kept for the record)


1. Pick the closest free font (Google Fonts or another clearly free-licensed font) to the backs in the "Icon Edition 2017 to 2026" folder. Match the chamfered corners first, then width and stroke ends. Make a comparison sheet in `reviews/` (photo crops of a name and a number beside each candidate set in white on navy) and say why the winner won. If the font needs measuring with the engine's `measure-fonts` tool (it needs a browser), list exactly what to measure and the supervisor will run it.
2. Set it as Big Toothy Grins' per-song `jersey_font` (the setting from brief 12 item 2.3), for player names and jersey numbers.
3. Names: substitute Λ (or the font's crossbar-less A, or a drawn substitute) for A in player names, as on the jerseys. Make it a per-song or per-team setting, display only (song-map text stays as it is).
4. Durable team font note: add a team font record in the engine (for example `deterministic/team_fonts.json` plus a short KIT.md process note outside the Type rules) with: team, edition and years, font chosen and why, the A rule, letter and number colours, and the reference folder. Later songs for this team read it instead of researching again.
5. Then do brief 14's re-join as `Rough cut 6h - 23 November` with both briefs in, check exit 0, run the Type rules check, commit, and add a section to the brief 14 results file (or a short brief 15 results file).

## Rules

1. Do NOT render or launch a browser to render; web fetching fonts is fine. Do not edit KIT.md Type rules text.
2. Delete only inside your own temp folder; list anything else you think should go in your report.
3. Be honest in your response, and correct anything you reported earlier that proves meaningfully wrong.
