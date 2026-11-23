# Engine fix brief 11: results (23 November 2026)

Builder: the T2 engine chat (Claude, Opus 5.5). No builds or joins, as asked.

1. **Done.** New song setting `team_colours.block_text`: the letter colour on name and jersey-number blocks (`word_roles.mjs` `teamColourNames`). Default white, the same value as before, so Big Toothy Grins and other songs do not change.
2. **Per player or team:** `player_teams` { "NAME": { "block_text": "#..." } }, or { "NAME": "TEAM", "TEAM": { "block_text": "#...", "dark": "#..." } }. A player entry may set only `block_text`; the rest comes from the song's team colours.
3. **Scope:** the engine sets white letters only on these name and jersey-number blocks, so that is all the setting changes. Other words on team-colour blocks keep their palette style's text colour (set in palette.json), and letters on the black ground are unaffected.
4. **Type rules check:** the song's `block_text` colours (song-wide and per player) count as allowed text colours.
5. **KIT.md:** a process note in the "Engine fix brief 10, items 39 to 47" section. Type rules text untouched. Rule 4 says "white letters on the darker team colour"; a grey-silver setting goes beyond that wording, so rule 4 may need Jefferson's approval to mention it.
6. **Tested:** the colour resolution only (default, song-wide, explicit team colours), on Big Toothy Grins' palette. Not tested in a join or render; Flagg's rebuild (Cooper) will be the first real use. For Flagg, Cooper adds for example `"team_colours": { "block_text": "#9A9FA6" }` (a greyish silver; the exact value is his choice) to its song settings.
7. Cosmetic: the provenance report will now print the hex value ("#FFFFFF on a #0C2340 block") instead of "white" at the next join.
8. No temp files left.
