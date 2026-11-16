// The parity fixture's compositions.
import React from 'react';
import {Composition} from 'remotion';
import './fonts';
import {ProofV3} from './ProofV3';
import {PROOF_END, PROOF_START} from './boards';

export const Root: React.FC = () => (
  <Composition id="IpoProofV3" component={ProofV3} durationInFrames={Math.round((PROOF_END - PROOF_START) * 30)} fps={30} width={1280} height={720}
    defaultProps={{chunkStart: PROOF_START}} />
);
