// Film timing for the topology replay: one shot per event of the run, back to back, then a loop.
// Shots are spaced by what there is to read and watch, never by the run's real clock: five of the
// seven events share one timestamp, and the timeline under the canvas says so.

export interface Shot {
  index: number;
  node: number;
  start: number;
  end: number;
}
export interface Film {
  length: number;
  shots: Shot[];
}

// Milliseconds per event kind. The catch is the point of the film, so it gets the longest shot:
// the cut, the recorded regrowth, the pan to the judge and the stamp all have to land.
const SHOT_MS: Record<string, number> = {
  plan: 3600,
  diff: 4200,
  test: 4000,
  catch: 7000,
  fix: 3600,
  merge: 4200,
};

export function film(replay: { events: { kind: string; node: number }[] }): Film {
  let t = 0;
  const shots = replay.events.map((e, index) => {
    const start = t;
    t += SHOT_MS[e.kind] ?? 3600;
    return { index, node: e.node, start, end: t };
  });
  return { length: t, shots };
}

/** HH:MM of each event on the author's clock (the first event's UTC offset), for the timeline stops.
 * The merge time is recorded in UTC; it is shown on the same clock. */
export function clockTimes(events: { t: string }[]): string[] {
  const m = events[0]?.t.match(/([+-])(\d\d):(\d\d)$/);
  const offset = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  return events.map((e) => new Date(Date.parse(e.t) + offset * 60000).toISOString().slice(11, 16));
}

/** The shot playing at film time `t` (looping) and how far into it we are, 0..1. */
export function shotAt(f: Film, t: number): { index: number; progress: number } {
  const at = ((t % f.length) + f.length) % f.length;
  const s = f.shots.find((sh) => at < sh.end) ?? f.shots[f.shots.length - 1];
  return { index: s.index, progress: (at - s.start) / (s.end - s.start) };
}
