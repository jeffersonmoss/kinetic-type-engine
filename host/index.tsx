import React from 'react';
import {AbsoluteFill, Audio, Composition, Sequence, registerRoot, staticFile, useCurrentFrame} from 'remotion';
import {EngineScope} from '../context';
import {SmearStage} from '../engine/smear';
import {compileScore, scoreContext, type CompiledFilm, type CompileOptions} from '../compile';
import type {Film, Format} from '../score';
import type {SongMap} from '../song';

export const compositionId = (format: Format, draft = false) => draft ? `${format}-draft` : format;
export const sizes = {
  wide: {width: 1280, height: 720, draftWidth: 854, draftHeight: 480},
  portrait: {width: 1080, height: 1920, draftWidth: 480, draftHeight: 854},
};

export function FilmFrame({film, frame, width, height}: {film: CompiledFilm; frame: number; width: number; height: number}) {
  const {format, fps, look} = film.ctx;
  return <AbsoluteFill style={{backgroundColor: look.palette.ground}}>
    <div style={{position: 'absolute', top: 0, left: 0, width: format.width, height: format.height,
      transform: `scale(${width / format.width}, ${height / format.height})`, transformOrigin: 'top left'}}>
      <EngineScope ctx={film.ctx}><SmearStage boards={[...film.boards]} t={frame / fps} uid={film.format} /></EngineScope>
    </div>
  </AbsoluteFill>;
}

function FilmVideo({film, width, height, audio}: {film: CompiledFilm; width: number; height: number; audio?: string | null}) {
  const frame = useCurrentFrame();
  return <>
    <FilmFrame film={film} frame={frame} width={width} height={height}/>
    {audio && film.clock.map(({start, output, frames}) => <Sequence key={output} from={output} durationInFrames={frames} layout="none">
      <Audio src={staticFile(audio)} trimBefore={Math.round(start * film.ctx.fps)} durationInFrames={frames}/>
    </Sequence>)}
  </>;
}

/** Called by the film-folder entry produced by the CLI. Each requested format compiles once. */
export function mountFilm(score: Film, map: SongMap, formats: readonly Format[], audio: string | null | undefined, options: CompileOptions) {
  const films = formats.map((format) => compileScore(scoreContext(format, score.look), score, map, options));
  const Root = () => <>{films.flatMap((film) => [false, true].map((draft) => {
    const id = compositionId(film.format, draft);
    const size = sizes[film.format];
    const width = draft ? size.draftWidth : size.width;
    const height = draft ? size.draftHeight : size.height;
    const Video = () => <FilmVideo film={film} width={width} height={height} audio={audio}/>;
    return <Composition key={id} id={id} component={Video} width={width} height={height}
      fps={film.ctx.fps} durationInFrames={film.duration}/>;
  }))}</>;
  registerRoot(Root);
}
