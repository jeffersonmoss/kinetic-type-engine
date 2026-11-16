// The example composition: the board drawn by SmearStage (TypeStage plus true motion blur on the rig's transits). No
// audio. Pure function of the frame.
import React from 'react';
import {AbsoluteFill} from 'remotion';
import {SmearStage, useSongTime} from '../engine';
import {BOARDS, START} from './boards';
import {NIGHT} from './song';

export const Example: React.FC = () => {
  const t = useSongTime(START);
  return (
    <AbsoluteFill style={{backgroundColor: NIGHT}}>
      <SmearStage boards={BOARDS} t={t} uid="example" />
    </AbsoluteFill>
  );
};
