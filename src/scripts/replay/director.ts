// Film timing for the topology replay. Not implemented yet: tests/topology-replay.test.ts is red first.
const todo = (): never => {
  throw new Error('not implemented');
};
export const film = (_replay: unknown): any => todo();
export const shotAt = (_film: unknown, _t: number): { index: number; progress: number } => todo();
