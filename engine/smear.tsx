// True motion blur (engine verdict item 32), ported from the Huang video's `smear.tsx` (amendment A10 there) and driven
// by the rig's transits instead of the sheet camera's `cameraPhase`. It replaces the gaussian whip blur the first engine used
// to draw (rig.ts rigSmearAt, removed).
//
// During a transit (roll, tilt, whip, step, dive, soar) the board is rendered at several sub-frame sample times over a
// 180 degree shutter (half a frame, ending on the frame itself) and the samples are added together (plus-lighter at 1 / n
// each, in an isolated layer), like a film camera's motion blur. Samples = ceil(largest per-frame screen displacement of
// a frame point / 8 px), 4 to 16; under 8 px of displacement the frame is drawn once, sharp. At rest, in drifts, in
// tracks and cranes, and on the frame a move ends the stage is drawn once.
//
// Rule 178 is kept: a word being read (from 3 frames after its sung start until it retires) is never smeared, and a
// word arriving during the shutter is never drawn at the partial opacity of the samples it exists in (Fable round 2
// item 30). Both are drawn once, sharp, at the frame's own time, above the smeared samples, together with everything in
// screen space (screen-pinned blocks, screen graphics, the vignette), which the camera does not move. The pass of each
// word is decided in smearSampling.ts, which the validator also uses to measure what is drawn.
//
// Cost: every sample re-renders the whole board, panels, evenodd panel-cover clips and clip masks included, so a
// transit frame costs up to 17 board renders (16 samples and the sharp pass). Each sample gets its own SVG id prefix.
import React from 'react';
import {FPS, HEIGHT, WIDTH} from './config';
import {TypeStage, type TypeStageProps} from './TypeStage';
import {SMEAR_SPAN, smearSamplesAt} from './smearSampling';

export {SMEAR_MAX, SMEAR_MIN, SMEAR_PX, SMEAR_SHUTTER, SMEAR_SPAN, drawnOpacityAt, inRigTransit, rigDisplacementAt, smearSampleFrames, smearSamplesAt, smearWordPass} from './smearSampling';

/** A TypeStage with true motion blur on rig transits. Same props as TypeStage. */
export const SmearStage: React.FC<TypeStageProps> = (props) => {
  const f = props.t * FPS;
  const n = smearSamplesAt(props.boards, f);
  if (n <= 1) return <TypeStage {...props} />;
  const span = SMEAR_SPAN / FPS;
  const uid = props.uid ?? 'ts';
  return (
    <div style={{position: 'absolute', inset: 0, width: WIDTH, height: HEIGHT}}>
      <div style={{position: 'absolute', inset: 0, isolation: 'isolate'}}>
        {Array.from({length: n}, (_, k) => (
          <div key={k} style={{position: 'absolute', inset: 0, mixBlendMode: 'plus-lighter', filter: `opacity(${1 / n})`}}>
            <TypeStage boards={props.boards} t={props.t - (span * k) / n} uid={`${uid}s${k}`} smearPass="blur" sharpFrame={f} />
          </div>
        ))}
      </div>
      <TypeStage {...props} uid={`${uid}sh`} smearPass="sharp" sharpFrame={f} />
    </div>
  );
};
