// Toy service simulator for the self-healing policy (issue #10). Not implemented yet: tests/policy.test.ts is red first.
const todo = (): never => {
  throw new Error('not implemented');
};
export const ACTIONS = [] as readonly string[];
export const FAULTS = [] as readonly string[];
export type Fault = 'latency' | 'node_down' | 'bad_deploy' | 'broken_test' | 'surge';
export type Scenario = Fault | 'overload';
export type ServiceState = any;
export type ServiceOutcome = 'caught' | 'recovered' | 'shipped' | 'failed';
export const OBS_SIZE = 0;
export const createService = (_seed: number, _o: { judge: boolean }): ServiceState => todo();
export const inject = (_s: ServiceState, _f: Scenario): ServiceState => todo();
export const step = (_s: ServiceState, _a: number): { state: ServiceState; reward: number } => todo();
export const observe = (_s: ServiceState): Float32Array => todo();
export const outcome = (_s: ServiceState): ServiceOutcome | null => todo();
