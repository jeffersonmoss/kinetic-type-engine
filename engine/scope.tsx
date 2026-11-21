import {createContext, useContext, type ReactNode} from 'react';

export type ScopeRunner = <T>(fn: () => T) => T;
export const ScopeRunnerContext = createContext<ScopeRunner>((fn) => fn());

/** Run each component body under the active engine context as React reaches it. */
export function scoped<Props>(Component: (props: Props) => ReactNode) {
  return function Scoped(props: Props) {
    const run = useContext(ScopeRunnerContext);
    return run(() => Component(props));
  };
}
