import type {Palette} from '../engine/config';

export interface EngineLook {
  readonly palette: Palette;
  readonly shadow?: boolean;
}
