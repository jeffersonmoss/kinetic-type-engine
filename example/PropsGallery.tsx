// A contact sheet of every prop in props/, each fitted into a cell of an 8 by 6 grid on the example's palette, with
// its working parts cycling over 3 seconds (a squash, an opening, a progress) so the verbs can be checked by eye.
// Not a lyric scene: no board, no validator. Registered in Root.tsx as "PropsGallery".
import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import './song';
import {FONT_FAMILY, type Pt} from '../engine';
import * as P from '../props';
import {CREAM, NIGHT} from './song';

const W = 1280, H = 720, COLS = 8, ROWS = 6;
const CW = W / COLS, CH = H / ROWS;

type Placed = {x: number; y: number; size?: number};
interface Entry {name: string; natural: number; quad: (p: Placed) => Pt[]; draw: (p: Placed) => React.ReactNode}

const bbox = (q: Pt[]) => {
  const xs = q.map((v) => v.x), ys = q.map((v) => v.y);
  return {x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys)};
};

export const PropsGallery: React.FC = () => {
  const f = useCurrentFrame();
  const u = 0.5 - 0.5 * Math.cos((2 * Math.PI * f) / 90); // 0 to 1 and back over 3 s
  const t = f / 30;
  const entries: Entry[] = [
    {name: 'Figure', natural: 150, quad: (p) => P.figureQuad({...p, pose: 'lean', stride: f * 0.25}), draw: (p) => <P.Figure {...p} pose="lean" stride={f * 0.25} />},
    {name: 'Bill', natural: 470, quad: P.billQuad, draw: (p) => <P.Bill {...p} />},
    {name: 'BillFan', natural: 470, quad: (p) => P.billFanQuad({...p, fan: 1}), draw: (p) => <P.BillFan {...p} fan={u} />},
    {name: 'Tie', natural: 132, quad: P.tieQuad, draw: (p) => <P.Tie {...p} swing={8 * Math.sin(f / 9)} />},
    {name: 'Printer', natural: 940, quad: P.printerQuad, draw: (p) => <P.Printer {...p} />},
    {name: 'Phone', natural: 300, quad: P.phoneQuad, draw: (p) => <P.Phone {...p} bubbles={5 * u} badge />},
    {name: 'Monitor', natural: 560, quad: (p) => P.monitorQuad({...p, headset: true}), draw: (p) => <P.Monitor {...p} headset select={u} />},
    {name: 'Dialog', natural: 520, quad: P.dialogQuad, draw: (p) => <P.Dialog {...p} press={u > 0.8 ? 1 : 0} label="OK" />},
    {name: 'Browser', natural: 720, quad: P.browserQuad, draw: (p) => <P.Browser {...p} amounts={8 * u} tapped={2} />},
    {name: 'Cursor', natural: 52, quad: (p) => P.cursorQuad({...p, lanyard: 1}), draw: (p) => <P.Cursor {...p} busy={u > 0.5 ? (u - 0.5) * 2 : 0} spin={f * 12} lanyard={u} tassel={10 * Math.sin(f / 7)} />},
    {name: 'Mug', natural: 160, quad: P.mugQuad, draw: (p) => <P.Mug {...p} />},
    {name: 'Bin', natural: 200, quad: P.binQuad, draw: (p) => <P.Bin {...p} lid={60 * u} />},
    {name: 'Pen', natural: 362, quad: P.penQuad, draw: (p) => <P.Pen {...p} click={u} />},
    {name: 'FileDrawer', natural: 360, quad: P.fileDrawerQuad, draw: (p) => <P.FileDrawer {...p} extension={u} />},
    {name: 'ContractSheet', natural: 300, quad: P.contractQuad, draw: (p) => <P.ContractSheet {...p} />},
    {name: 'PostCard', natural: 440, quad: P.postCardQuad, draw: (p) => <P.PostCard {...p} />},
    {name: 'WitnessChair', natural: 224, quad: P.witnessChairQuad, draw: (p) => <P.WitnessChair {...p} />},
    {name: 'WitnessTable', natural: 520, quad: P.witnessTableQuad, draw: (p) => <P.WitnessTable {...p} />},
    {name: 'Gavel', natural: 322, quad: P.gavelQuad, draw: (p) => <P.Gavel {...p} swing={u} />},
    {name: 'Hemicycle', natural: 600, quad: P.hemicycleQuad, draw: (p) => <P.Hemicycle {...p} p={u} />},
    {name: 'Chainsaw', natural: 655, quad: P.chainsawQuad, draw: (p) => <P.Chainsaw {...p} hero chain={f * 24} puff={(f % 30) / 30} />},
    {name: 'Chipper', natural: 735, quad: P.chipperQuad, draw: (p) => <P.Chipper {...p} hero drum={f * 20} shake={3 * Math.sin(f * 2.1)} />},
    {name: 'TrefoilMark', natural: 56, quad: P.trefoilQuad, draw: (p) => <P.TrefoilMark {...p} />},
    {name: 'Dial', natural: 360, quad: P.dialQuad, draw: (p) => <P.Dial {...p} value={u} />},
    {name: 'IdBadge', natural: 100, quad: P.idBadgeQuad, draw: (p) => <P.IdBadge {...p} clip={u} />},
    {name: 'BadgeRail', natural: 600, quad: P.badgeRailQuad, draw: (p) => <P.BadgeRail {...p} clips={[0, u, 0]} drops={[0, 60 * u, 0]} tilts={[0, 10 * u, 0]} />},
    {name: 'BassDrum', natural: 580, quad: P.bassDrumQuad, draw: (p) => <P.BassDrum {...p} strikes={[u, 1 - u]} flex={1} />},
    {name: 'Spot', natural: 140, quad: P.spotQuad, draw: (p) => <P.Spot {...p} aim={20 * Math.sin(f / 15)} beam={120} on={u} />},
    {name: 'PillBottle', natural: 140, quad: P.pillBottleQuad, draw: (p) => <P.PillBottle {...p} />},
    {name: 'GrainSack', natural: 130, quad: P.grainSackQuad, draw: (p) => <P.GrainSack {...p} />},
    {name: 'CargoShip', natural: 524, quad: P.cargoShipQuad, draw: (p) => <P.CargoShip {...p} rock={3 * Math.sin(f / 12)} />},
    {name: 'Clinic', natural: 236, quad: P.clinicQuad, draw: (p) => <P.Clinic {...p} lit={u} frost={u} />},
    {name: 'Germ', natural: 40, quad: P.germQuad, draw: (p) => <P.Germ {...p} spin={f * 3} />},
    {name: 'Globe', natural: 310, quad: P.globeQuad, draw: (p) => <P.Globe {...p} turn={f * 2} dots={[{lat: 20, lon: 30, lit: u}, {lat: -10, lon: -20, lit: 1}]} />},
    {name: 'Rocket', natural: 124, quad: P.rocketQuad, draw: (p) => <P.Rocket {...p} burn={u} flicker={f * 0.5} />},
    {name: 'HabitatDome', natural: 84, quad: P.habitatDomeQuad, draw: (p) => <P.HabitatDome {...p} draw={u} />},
    {name: 'Mars', natural: 260, quad: P.marsQuad, draw: (p) => <P.Mars {...p} domes={3 * u} />},
    {name: 'PancakeStack', natural: 336, quad: P.pancakeStackQuad, draw: (p) => <P.PancakeStack {...p} />},
    {name: 'ButterPat', natural: 56, quad: P.butterPatQuad, draw: (p) => <P.ButterPat {...p} turn={30 + 20 * u} />},
  ];
  const cells: React.ReactNode[] = entries.map((e, k) => {
    const cx = (k % COLS + 0.5) * CW, cy = (Math.floor(k / COLS) + 0.45) * CH;
    const b = bbox(e.quad({x: 0, y: 0}));
    const s = Math.min((0.8 * CW) / (b.x1 - b.x0), (0.68 * CH) / (b.y1 - b.y0));
    const p = {x: cx - ((b.x0 + b.x1) / 2) * s, y: cy - ((b.y0 + b.y1) / 2) * s, size: e.natural * s};
    return <g key={e.name}>{e.draw(p)}{label(e.name, k)}</g>;
  });
  // the world-px props (no size): strip, paper, truss, wave, spray, speech bubble in the last cells
  const at = (k: number) => ({cx: (k % COLS + 0.5) * CW, cy: (Math.floor(k / COLS) + 0.45) * CH});
  const n = entries.length;
  const c1 = at(n), c2 = at(n + 1), c3 = at(n + 2), c4 = at(n + 3), c5 = at(n + 4), c6 = at(n + 5);
  const strip = {x: c1.cx - 70, y: c1.cy - 30, size: 140, text: '$8,000', width: 490, t, printFrom: 0.3, printTo: 1.6, strikes: [{chars: [1, 5] as [number, number], at: 2}]};
  return (
    <AbsoluteFill style={{backgroundColor: NIGHT}}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {cells}
        <P.Strip {...strip} />{label('Strip', n)}
        <P.ReceiptPaper x={c2.cx - 50} y={c2.cy - 34} w={100} h={68} />{label('ReceiptPaper', n + 1)}
        <P.Truss x0={c3.cx - 70} x1={c3.cx + 70} y={c3.cy} />{label('Truss', n + 2)}
        <P.WaveLine x0={c4.cx - 70} x1={c4.cx + 70} y={c4.cy} phase={f * 3} amplitude={8} wavelength={50} />{label('WaveLine', n + 3)}
        <P.ChipSpray x={c5.cx - 40} y={c5.cy + 20} p={(f % 30) / 30} scale={0.25} angle={-40} />{label('ChipSpray', n + 4)}
        <P.SpeechBubble x={c6.cx - 28} y={c6.cy - 36} w={88} h={52} radius={14} tailTip={{x: c6.cx - 58, y: c6.cy + 12}} tailBase={{side: 'left', from: c6.cy - 8, to: c6.cy + 10}} tailBow={{x: 0, y: 4}} grow={0.3 + 0.7 * u} strokeWidth={3} />{label('SpeechBubble', n + 5)}
      </svg>
    </AbsoluteFill>
  );
};
const label = (name: string, k: number) => (
  <text x={(k % COLS + 0.5) * CW} y={(Math.floor(k / COLS) + 0.93) * CH} textAnchor="middle" fontFamily={FONT_FAMILY.barlow} fontWeight={700} fontSize={15} fill={CREAM} opacity={0.75}>
    {name.toUpperCase()}
  </text>
);
