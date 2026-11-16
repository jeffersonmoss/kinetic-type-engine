// Proof v3 composition (IPO ruling 196): verse 1, L04 to L10 (song 29.77 to 47.80 s) on one board, rendered through the
// extracted engine for comparison with the first video's own render. No audio. Pure function of the frame.
import React from 'react';
import {AbsoluteFill} from 'remotion';
import {SmearStage, useSongTime} from '../../engine';
import {BOARDS} from './boards';
import {INK} from './palette';

export const ProofV3: React.FC<{chunkStart: number}> = ({chunkStart}) => {
  const t = useSongTime(chunkStart);
  return (
    <AbsoluteFill style={{backgroundColor: INK}}>
      <SmearStage boards={BOARDS} t={t} uid="proofv3" />
    </AbsoluteFill>
  );
};
