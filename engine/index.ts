// The kinetic type engine's public API, everything except font loading (a video loads its own fonts). Safe to import
// from node: tools/validate-boards.mjs bundles a boards module against it.
export {WORDS as WORDS_FOR_TOOLS} from './config';
export * from './types';
export * from './config';
export {FONT_FAMILY, FONT_STYLE, FONT_INFO, METRICS_MEASURED, METRICS_SOURCE, textWidth, letterAdvances} from './metrics';
export * from './util';
export * from './words';
export {useSongTime, beatIndexAt, energyAt} from './time';
export {layoutBoard, layoutBlock, blockToWorld, worldToBlock, wordCorners, displayText, alignPoint, DEFAULT_W, BLOCK_GAP} from './layout';
export {cameraAt, cameraMoves, camForBlock, toScreen, toWorld, cameraTransform, SCREEN_CAM} from './camera';
export {wordStateAt, boardCues, cueAt, cueAffects, replacesEnterOf, repeatScale, EXIT_FRAMES, emergeCue, retireFrame, cullFrame, lifeStage, RETIRE_OPACITY, RETIRE_FRAMES, RETIRE_AFTER, CULL_DISTANCE, inkOpacity, GONE_OPACITY} from './wordState';
export type {LifeStage} from './wordState';
export {registerVerb, extendVerb, getVerb, verbNames, composeMod, IDENTITY, letterIdentity} from './verbRegistry';
export type {VerbDef, VerbWordCtx, VerbCtxBase, WordMod, LetterMod} from './verbRegistry';
export {carryOffset, hingeTransform} from './verbs';
export {validateBoard, validateBoards, formatReports, checkHandoff, SUNG_MIN_CAP, MARGIN_WHOLE, MARGIN_WHOLE_BIG, MARGIN_BIG_CAP} from './validate';
export type {Violation, BoardReport, LineReport} from './validate';
export {TypeStage, BoardView, BoardRules, boardContext, boardActive, currentWordOn, defaultTypeColour, isLightGround} from './TypeStage';
export {SmearStage, smearSamplesAt, rigDisplacementAt, inRigTransit, SMEAR_MIN, SMEAR_MAX, SMEAR_PX, SMEAR_SHUTTER} from './smear';
export {Burst, burstPaths} from './burst';
export {SPEED_CAP, SPEED_CAP_FRACTION, MIN_TRANSITION_FRAMES, MIN_VISIBLE_FRAMES, BEAT_FRAMES, VISIBLE_THRESHOLD, framesForDistance, maxScaleDelta, rectQuad} from './motion';
export {checkTrack, validateElements, formatMotion} from './motionCheck';
export type {TrackedElement, TrackedSample, MotionRule, MotionViolation} from './motionCheck';
export {rigAt, rigOwnAt, rigMoves, rigNominalRot, rigTransits, toScreenCam, screenAngle, resolveTarget, DRIFT_ROT, DRIFT_ZOOM, HALF_DIAGONAL, RIG_DEFAULT_FRAMES, RIG_FRAME_RANGE, TRANSIT_KINDS} from './rig';
export type {RigMove} from './rig';
export {letterBoxes, letterIndex, partOfBox, resolveAnchor, describeAnchor, hasCounter, findRule} from './letters';
export type {ResolvedAnchor, LetterBox as AnchorLetterBox, AnchorEnv} from './letters';
export {ruleAt, ruleTracks, ruleGrowFrames, RULE_OPACITY, RULE_WIDTH} from './rules';
export {Ground, Vignette, groundAt, wipeFrames, wipeFullAt} from './ground';
export {Panel, panelStateAt, panelQuad, panelTrack, panelSwingExempt, SWING_EXEMPT_FRAMES} from './panel';
export type {PanelDef, PanelOp, PanelKind} from './panel';
export {morph, morphMarker, MORPH_MARKER_DIVE, relight, tip, portal, stackSteps, rigDiveInto, fanTurn, drawer, quarter, quarterClearFrames, runTrack, RUN_SPEED, behind, slideFrom, rise, station, cameraFollow} from './authoring';
export {carryAt, carryCam, carrySpan, carrying, carryStillSpan, carryReadEnd, carryClearSpan, carryClearOpacity, CARRY_CLEAR_FRAMES, CARRY_TAIL, CARRY_LEAD, SLIDE_UP_PX, SLIDE_UP_FROM, SLIDE_UP_FRAMES, QUARTER_FRAMES, QUARTER_END_BEFORE_WORD, SLIDE_UP_OUT_MAX_Y, SLIDE_UP_IN_MIN_Y} from './carry';
export {rays, lineMarks, graphicLife, drawLines, drawGraphics, ownersRetire, LINGER_FRAMES, LINE_EXIT_FRAMES, GRAPHIC_EXIT_FRAMES} from './lines';
export type {LineSeg} from './lines';
export * from './emergence';
// kit pass 21 (Buy This IPO 53ca50b, KIT.md section 16)
export {chainStep, chainFit, marginWindowEnd} from './chain';
export type {ChainStepDef, ChainFitDef, ChainResult} from './chain';
export {caption, captionBoxes} from './caption';
export type {CaptionDef} from './caption';
export {handoffWordSet, handoffClearFrame, handoffGraceEnd, handoffPairsNested, HANDOFF_CLEAR_FRAMES, HANDOFF_GRACE, HANDOFF_SUNG_WINDOW} from './handoffWords';
export {routeAround} from './lines';
export {isSlowSoar, SLOW_SOAR_MIN, SLOW_SOAR_MAX} from './rig';
export {tumbleFallFrames, TUMBLE_FALL_FRAMES} from './verbsSheet';

export * from './format';
export * from './cut';
// Sweet Distillation engine additions K1 to K7 (KIT.md section 20)
export {parenPair} from './paren';
export type {ParenPair, ParenPairDef, ParenRect, BracketState} from './paren';
export {beatPosition, wahStillFrom, WAH_AMP, WAH_PHASE} from './wah';
export {discAt, groundClearSpan, groundClearClip, isClearingDisc} from './groundClear';
export type {GroundClearSpan} from './groundClear';
export {morphKeptDrift, boardMorphDrifts, letterScreenQuad} from './morphPin';
export type {MorphDrift} from './morphPin';
export {hangPunctuation, stripParens} from './layout';
export {PICTURE_MIN_SIDE, PICTURE_FRAMES} from './validate';
// Paper Trail engine addition K2 (KIT.md section 21); importing it registers the `spread` verb
export {spread, spreadAt, SPREAD_SPEED_SHARE, SPREAD_DEFAULT_TO, SPREAD_DEFAULT_FRAMES} from './spread';
export type {SpreadDef, SpreadAnchor} from './spread';
export {scoped} from './scope';
