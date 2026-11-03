// A self-rescheduling timer loop that can only ever have one pending timeout.
// The NCA worker wakes it from several places (visibility, damage, reset, and
// reset from inside a tick when the pattern dies); all of them go through
// `wake`, so re-entrant wakes can't start a second chain.

export interface Ticker {
  /** Schedules the next tick unless one is already pending. */
  wake(): void;
  readonly pending: boolean;
}

/** `tick` returns whether the loop should continue. */
export function createTicker(
  tick: () => boolean,
  intervalMs: number,
  schedule: (fn: () => void, ms: number) => unknown = setTimeout
): Ticker {
  let timer: unknown;
  const fire = () => {
    timer = undefined;
    if (tick()) wake();
  };
  function wake(): void {
    if (timer === undefined) timer = schedule(fire, intervalMs);
  }
  return {
    wake,
    get pending() {
      return timer !== undefined;
    },
  };
}
