// Runs a controller over seeds and scores it. Not implemented yet.
import type { Scenario, ServiceOutcome, ServiceState } from './service';
export interface Controller {
  name: string;
  decide: (s: ServiceState, obs: Float32Array) => number;
}
export interface Score {
  recoveryRate: number;
  meanReturn: number;
  meanTicksToRecover: number;
  outcomes: Record<ServiceOutcome, number>;
  firstOutcome: Record<ServiceOutcome, number>;
}
export const evaluate = (_c: Controller, _sc: Scenario, _seeds: number[], _o: { judge: boolean }): Score => {
  throw new Error('not implemented');
};
