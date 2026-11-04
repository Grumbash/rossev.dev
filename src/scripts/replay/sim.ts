// Simulation rules for taking over the topology replay. Not implemented yet: tests/topology-replay.test.ts is red first.
const todo = (): never => {
  throw new Error('not implemented');
};
export const RESUME_PROMPT_MS = 0;
export const AUTO_RESUME_MS = 0;
export const START: any = {};
export const tick = (_s: any, _dt: number, _length: number): any => todo();
export const takeover = (_s: any): any => todo();
export const toggleJudge = (_s: any): any => todo();
export const injectFault = (_s: any, _kind: 'logic' | 'test'): any => todo();
export const cutResult = (_s: any, _mse: number): any => todo();
export const resume = (_s: any): any => todo();
export const showResumePrompt = (_s: any): boolean => todo();
export const analyticsFor = (_from: any, _to: any): any => todo();
