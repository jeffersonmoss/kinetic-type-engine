import React from 'react';
import {ScopeRunnerContext, type ScopeRunner} from '../engine/scope';
import {withEngine, type EngineContext} from './legacyBridge';

export function EngineScope({ctx, children}: {ctx: EngineContext; children: React.ReactNode}) {
  const run: ScopeRunner = (fn) => withEngine(ctx, fn);
  return <ScopeRunnerContext.Provider value={run}>{children}</ScopeRunnerContext.Provider>;
}
