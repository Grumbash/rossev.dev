// Guided story for the hero topology. Not implemented yet: tests/topology-story.test.ts is red first.
export type Step = 1 | 2 | 3;
export interface StoryState {
  step: Step;
  healing: boolean;
  healed: boolean;
}

const todo = (): never => {
  throw new Error('not implemented');
};

export const START: StoryState = { step: 1, healing: true, healed: true };
export const go = (_s: StoryState, _dir: 1 | -1): StoryState => todo();
export const breakAndHeal = (_s: StoryState, _reducedMotion: boolean): StoryState => todo();
export const healed = (_s: StoryState): StoryState => todo();
export const caseVisible = (_s: StoryState): boolean => todo();
export const arrivalAction = (_from: StoryState, _to: StoryState): 'step2' | 'step3' | null => todo();
