// HINGE, modes 'swing' and 'leaf' (rule 60), extending the K9 hinge (unchanged in other modes). The new block is
// attached to the old one along a rule and swings through 90 degrees about that rule in 10 to 16 frames, whole and at
// full opacity throughout (ruling 194.4). 'swing' turns it in the picture plane about the rule's end, like a gate seen
// from above; 'leaf' opens it about the rule's line like a page or a gate seen face on; with params.panel the block is
// printed on a board panel whose open op does the swing. It is usually timed with a ROLL in the opposite sense so that on screen the new block stays still and the old
// one swings away; the validator's speed check then passes it because its screen speed stays under the cap.
// params: mode 'swing', angle (start angle relative to rest, default -90), frames (10), pivot (an AnchorRef; default the
// emergence anchor).
import {FPS} from '../config';
import {resolveAnchor} from '../letters';
import type {AnchorRef} from '../types';
import {clamp, easeInOutCubic, rot} from '../util';
import {getVerb, registerVerb, type VerbDef} from '../verbRegistry';
import {PC, centreOf, firstSf, toLocal, wordsOfCue, type VerbWordCtx} from './common';

const old = getVerb('hinge') as VerbDef;
/** Mode 'leaf': the block swings about the rule like a page or a gate seen face on. Its extent across the rule scales
 *  from 0 to 1 about the rule's line in `frames` (10 to 16, cubic), darkening by up to 40 percent while it turns, whole
 *  and at full opacity throughout. The rule must run along the block's x or y axis. */
const leaf = (c: VerbWordCtx) => {
  const F = Math.min(16, Math.max(10, PC(c.cue, 'frames', 10)));
  if (c.df >= F) return null;
  if (c.df < 0) return {hidden: true, opacity: 0};
  const e = Math.max(0.001, easeInOutCubic(clamp(c.df / F)));
  const ref = (c.cue.params?.pivot ?? c.cue.params?.from) as AnchorRef | undefined;
  const a = ref ? resolveAnchor(c.L, ref, c.t) : null;
  const piv = a ? toLocal(c.block, a.p) : {x: 0, y: 0};
  const along = a ? Math.abs(((a.dir - c.block.angle) % 180 + 180) % 180) : 0; // rule direction in the block frame
  const ce = centreOf(c.geom);
  const vertical = along > 45 && along < 135; // the rule runs up the block: the leaf opens sideways
  return vertical ? {sx: e, dx: (piv.x - ce.x) * (1 - e)} : {sy: e, dy: (piv.y - ce.y) * (1 - e)};
};
registerVerb('hinge', {
  ...old,
  early: true,
  replacesEnter: false,
  gradual: true,
  affects: (cue, L) => (cue.params?.mode === 'swing' || cue.params?.mode === 'leaf' || cue.params?.panel !== undefined ? wordsOfCue(cue, L) : (old.affects?.(cue, L) ?? cue.words ?? [cue.word])),
  defaultAt: (cue, L) => (cue.params?.mode === 'swing' || cue.params?.mode === 'leaf' ? (firstSf(cue, L) - PC(cue, 'frames', 10)) / FPS : (old.defaultAt?.(cue, L) ?? (L.words.get(cue.word)?.start ?? 0) + 10 / FPS)),
  modify: (c) => {
    if (c.cue.params?.panel !== undefined) return null; // the panel's open op swings the block (panels.ts)
    if (c.cue.params?.mode === 'leaf') return leaf(c);
    if (c.cue.params?.mode !== 'swing') return old.modify!(c);
    const F = Math.max(10, PC(c.cue, 'frames', 10));
    const p = clamp(c.df / F);
    if (p >= 1) return null;
    const a0 = PC(c.cue, 'angle', -90);
    const a = a0 * (1 - easeInOutCubic(p));
    const ref = (c.cue.params?.pivot ?? c.cue.params?.from) as AnchorRef | undefined;
    const piv = ref ? toLocal(c.block, resolveAnchor(c.L, ref, c.t).p) : {x: 0, y: 0};
    const ce = centreOf(c.geom);
    const r = rot({x: ce.x - piv.x, y: ce.y - piv.y}, a);
    // whole and at full opacity for the whole swing (ruling 194.4): it does not fade in beside its rule
    const before = c.df < 0 && c.cue.params?.showFrom === undefined;
    return before ? {hidden: true, opacity: 0} : {dx: piv.x + r.x - ce.x, dy: piv.y + r.y - ce.y, rot: a};
  },
});
