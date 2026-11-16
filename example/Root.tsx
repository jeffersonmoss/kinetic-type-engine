// The example's compositions.
import React from 'react';
import {Composition} from 'remotion';
import './fonts';
import {Example} from './Example';
import {DURATION_S, FPS} from './song';

export const Root: React.FC = () => (
  <Composition id="KineticTypeExample" component={Example} durationInFrames={DURATION_S * FPS} fps={FPS} width={1280} height={720} />
);
