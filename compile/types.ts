import type {EngineContext} from '../context';
import type {Board, ReadingInterval} from '../engine/types';
import type {Format} from '../score';
import type {OutputRange} from '../song';
import type {Diagnostic} from './bind';

export interface TokenReading {
  readonly token: string;
  readonly line: string;
  readonly text: string;
  readonly board: string;
  readonly words: readonly number[];
  readonly onset: number;
  readonly vocalEnd: number;
  readonly preset: boolean;
  readonly landing: number;
  readonly interval?: ReadingInterval;
}
export interface LineIndex {
  readonly scene: string;
  readonly block: number;
  readonly first?: number;
  readonly landing: number;
}
export interface Transition {
  readonly line: string;
  readonly board: string;
  readonly start: number;
  readonly landing: number;
  readonly release: number;
  readonly edge?: boolean;
  readonly cut?: boolean;
  readonly handoff?: boolean;
}
export interface InspectionFrame {format: Format; frame: number; reason: string}
export interface CompiledFilm {
  readonly format: Format;
  readonly ctx: EngineContext;
  readonly boards: readonly Board[];
  readonly lineIndex: Readonly<Record<string, LineIndex>>;
  readonly readings: readonly TokenReading[];
  readonly transitions: readonly Transition[];
  readonly diagnostics: readonly Diagnostic[];
  readonly inspection: readonly InspectionFrame[];
  readonly clock: readonly OutputRange[];
  readonly duration: number;
  readonly rawBoards: number;
  readonly emphasisWords: number;
}
