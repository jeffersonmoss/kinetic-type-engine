import {cascade, follow, legacy, rise, stamp, type as typeOn} from '../../effects';
import {film, line, motif, opening, row, scene, stay, word, type LineCard} from '../../score';
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
