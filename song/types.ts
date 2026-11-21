/** All times in the song map and ear-check file are song-clock seconds. */
export interface SongTime {
  start_s: number;
  end_s: number;
}

export interface AlignmentWord extends SongTime {
  word: string;
  success?: boolean;
}

export interface Alignment {
  audio_id?: string;
  words: AlignmentWord[];
}

export interface SongConfig {
  song: string;
  audio?: string;
  start_bpm?: number;
  display?: [pattern: string, replacement: string][];
  merge?: [first: string, second: string, display: string][];
  /** Legacy zero-based line/word onset hints, imported as open ear checks. */
  fix?: Record<string, Record<string, number>>;
}

export type Voice = 'lead' | 'adlib';
export type ReviewStatus = 'open' | 'verified' | 'corrected';

export interface EarCheck {
  id: string;
  tokenId: string;
  issue: string;
  status: ReviewStatus;
  /** A proposal while open, the accepted timing when corrected. */
  start: number;
  end: number;
  by: string | null;
  date: string | null;
  evidence: string;
}

export interface SourceFragment extends SongTime {
  index: number;
  offset: number;
  text: string;
}

export type SongRepair = 'glued-chant' | 'glued-closing-punctuation';

export interface SongToken extends SongTime {
  id: string;
  lineId: string;
  text: string;
  rawText: string;
  raw: SongTime;
  source: SourceFragment[];
  memberIds: string[];
  role: Voice;
  voice: Voice;
  repairs: SongRepair[];
  reviewIds: string[];
  reviewStatus: ReviewStatus | null;
}

export interface SongLine extends SongTime {
  id: string;
  sectionId: string;
  text: string;
  rawText: string;
  tokenIds: string[];
  /** Zero-based index of the first tracked beat at or after onset minus 50 ms. */
  start_beat: number | null;
}

export interface SongSection extends SongTime {
  id: string;
  name: string | null;
  lineIds: string[];
}

export interface Beat {
  t: number;
  index: number;
  bar: number;
  beat_in_bar: number;
  energy: number;
}

export type BeatAnalysis = {
  status: 'measured';
  duration_s: number;
  tempo_bpm: number;
  downbeat_phase: number;
  beats: Beat[];
} | {
  status: 'unavailable';
  reason: string;
  duration_s: null;
  tempo_bpm: null;
  downbeat_phase: null;
  beats: [];
};

export interface SongMap {
  schema: 2;
  song: string;
  suno_id: string | null;
  audio: string;
  analysis: BeatAnalysis;
  sections: SongSection[];
  lines: SongLine[];
  tokens: SongToken[];
}
