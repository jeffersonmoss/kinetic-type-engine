import {beatPunch, cascade, fade, follow, legacy, matchCut, rise, slotRoll, stamp, turnIn, type as typeOn} from '../../effects';
import {clear, echo, edge, film, interlude, line, motif, opening, row, scene, stay, word, type LineCard} from '../../score';
import {fixtureSong} from '../step-seven/score';

const typeWords = cascade(typeOn({gap: 0, fade: 1}), {by: 'word', clock: 'sung'});

// Song-clock timings from storyboard line 20, keyed to the compiler's stable line ID.
export const embiidMap = fixtureSong([
  ['line-21', [['Joel', 2502, 2511], ['Embiid', 2511, 2523], ['draws', 2522, 2533], ['two.', 2533, 2555],
    ["somebody's", 2554, 2570], ['free.', 2570, 2581]]],
  ['line-22', [['THREE', 2606, 2615]]],
]);
export const embiidCard: LineCard = {
  rows: [{text: 'Joel Embiid', size: 'hero'}],
  from: opening(),
  enter: cascade(stamp(), {by: 'word', clock: 'sung'}),
  parts: [
    {rows: ['draws two'], preset: ['two'], from: row('line-21', 1), place: 'below', enter: legacy('converge')},
    {rows: ["somebody's", {text: 'free', size: 'hero'}], from: row('line-21', 1), place: 'right',
      enter: cascade(rise({dir: 'right'}), {by: 'word', clock: 'sung'}), camera: follow({fill: 0.5, frames: 8})},
  ],
  camera: follow(),
};
export const tunedEmbiidCard: LineCard = {
  ...embiidCard,
  rows: [{text: 'Joel', size: 'body'}, {text: 'Embiid', size: 'hero'}],
  enter: typeWords,
  camera: follow({fill: 0.67}),
  parts: [
    {...embiidCard.parts![0]!, from: row('line-21', 2)},
    {...embiidCard.parts![1]!, rows: [{text: "somebody's", size: 'hero'}, {text: 'free', size: 'hero'}],
      from: row('line-21', 2), camera: follow({fill: 0.9, frames: 8})},
  ],
};
export const embiidScore = (card: LineCard = embiidCard) => film({scenes: [scene('verse2', {lines: [
  line('line-21', card), line('line-22', {from: word('line-21.p2', 'FREE'), place: 'below', enter: typeWords, old: stay()}),
]})]});

export const splitMap = fixtureSong([['h1.1', [['ONE', 50, 59], ['FORTY-ONE', 75, 87], ['ONE', 95, 103, 'adlib']]]]);
const phrase = {rows: ['FORTY-', 'ONE'], from: row('h.1', 1), enter: typeWords} as const;
export const splitScore = film({scenes: [scene('hook', {lines: motif('h', {lines: {
  1: line('h.1', {
    rows: ['ONE'], enter: typeWords,
    parts: [{...phrase, rows: ['FORTY-ONE']}],
    portrait: {parts: [phrase]},
    reply: {from: row('h.1.p1', 2), enter: typeWords, place: 'right'},
  }),
}}, {occurrences: {1: {1: {reply: {from: word('h.1.p1', 'FORTY-ONE')}}}}}).occurrence(1)})]});

export const editPartsScore = film({scenes: [scene('hook', {lines: [
  line('h1.1', {rows: ['ONE'], enter: typeWords, omit: ['h1.1.token-3'],
    parts: [{rows: ['FORTY-', 'ONE'], from: {kind: 'edge', side: 'L'}, enter: typeWords}]}),
]})]});

export const inkMap = fixtureSong([['inks', [['Bite', 50, 59], ['and', 67, 76], ['Run', 84, 93],
  ['Again', 102, 111], ['Okay', 122, 131, 'adlib']]]]);

export const inkScore = (ground: string, markHit = true) => film({
  look: {ink: {call: '#F4EFE2'}},
  scenes: [scene('colours', {ground, lines: [
    line('inks', {rows: [{text: 'Bite and', ink: 'reply'}], enter: typeWords, words: {
      BITE: {ink: 'call'},
      'inks.token-1': {ink: markHit ? 'hit' : 'call'},
    }, parts: [{rows: ['Run', {text: 'Again', ink: 'call'}], from: row('inks', 1), enter: typeWords, ink: 'reply'}],
    reply: {from: row('inks.p1', 2), enter: typeWords, size: 'body'}}),
  ]})],
});

export const interludeMap = fixtureSong([
  ['hook', [['FOUR', 103, 112], ['RING!', 124, 181, 'adlib']]],
  ['out', [['PHILLY', 495, 505], ['ONE', 520, 531, 'adlib']]],
]);
interludeMap.analysis = {status: 'measured', duration_s: 630 / 30, tempo_bpm: 1800 / 19, downbeat_phase: 0,
  beats: Array.from({length: 32}, (_, index) => ({t: (18 + 19 * index) / 30, index, bar: Math.floor(index / 4), beat_in_bar: index % 4 + 1, energy: 1}))};
const rings = Array.from({length: 4}, () => echo('ring'));
const yearNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 12, 16, 20, 24];
export const interludeScore = film({scenes: [
  scene('first', {exit: fade(), lines: [
    interlude('open', {start: {beat: 0}}, {rows: rings, enter: cascade(stamp({frames: 8}), {by: 'row', gap: 19})}),
    line('hook', {from: row('open', 4), enter: typeWords, old: stay(),
      reply: {from: row('hook', 1), enter: typeWords, size: 'body'}}),
    ...yearNumbers.map((number, i) => interlude(`year-${number}`, {start: {beat: i + 7}}, {
      rows: [{text: echo(`year ${number}`), size: 'body'}],
      ...(i ? {from: row(`year-${yearNumbers[i - 1]}`, 1), enter: slotRoll({keep: 'YEAR'}), place: 'overlay' as const}
        : {from: word('hook.reply', 'RING!'), enter: typeOn({gap: 0, fade: 1}), old: stay()}),
    })),
  ]}),
  scene('final', {lines: [
    interlude('last', {start: {beat: 20}}, {rows: rings, from: opening(), enter: cascade(stamp({frames: 8}), {by: 'row', clock: 19})}),
    line('out', {from: row('last', 1), place: 'left', enter: typeWords, old: stay(),
      reply: {from: row('out', 1), enter: typeWords, size: 'body'}}),
    interlude('title', {start: {seconds: 560 / 30}}, {rows: [{text: echo('Room for One'), size: 'hero'}],
      from: word('out.reply', 'ONE'), enter: matchCut({keep: 'ONE', pin: 'board'}), old: clear(fade()), ink: 'reply',
      accents: [beatPunch('ONE')]}),
  ]}),
]});
export const standingScore = film({scenes: [scene('stands', {lines: [
  interlude('stand', {start: {beat: 1}}, {rows: rings, from: edge('B'), enter: turnIn({axis: 'x', pivot: 'bottom', frames: 14})}),
]})]});
export const echoCrossMap = fixtureSong([['sung', [['ONE', 84, 92]]]]);
export const echoCrossScore = film({scenes: [
  scene('echo', {exit: fade(), lines: [
    interlude('one', {start: {seconds: 1}}, {rows: [echo('one')], enter: stamp({frames: 8})}),
  ]}),
  scene('vocal', {lines: [
    line('sung', {from: word('one', 'ONE'), enter: matchCut({keep: 'ONE', pin: 'screen'}), preset: true}),
  ]}),
]});
