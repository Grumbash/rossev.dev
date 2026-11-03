// Guided story for the hero topology: plan → sandbox → break & heal → the YAGNI case.
// Pure state only (the DOM side is topology-story-dom.ts), so tests/topology-story.test.ts can run it in bun.
export type Step = 1 | 2 | 3;
export interface StoryState {
  step: Step;
  // A fault is running and the guard has not finished healing it yet.
  healing: boolean;
  // The guard healed the run: the story's punchline, the case link shows.
  healed: boolean;
}

export const START: StoryState = { step: 1, healing: false, healed: false };

// What the canvas shows on each step (indexes into the yagni domain's nodes).
// 1: 01 PLAN & GITHUB, 2: 05 SANDBOX + a trace packet, 3: 03 BUILDER, the fault target.
export const STEP_FOCUS: Record<Step, { node: number; trace: boolean }> = {
  1: { node: 0, trace: false },
  2: { node: 4, trace: true },
  3: { node: 2, trace: false },
};

// Moving always clears the fault, so stepping back from 3 and forward again replays it.
export function go(s: StoryState, dir: 1 | -1): StoryState {
  const step = Math.min(3, Math.max(1, s.step + dir)) as Step;
  if (step === s.step) return s;
  return { step, healing: false, healed: false };
}

// Only on step 3, once at a time. Reduced motion skips the animation and lands healed.
export function breakAndHeal(s: StoryState, reducedMotion: boolean): StoryState {
  if (s.step !== 3 || s.healing) return s;
  return reducedMotion ? { ...s, healing: false, healed: true } : { ...s, healing: true, healed: false };
}

// The engine finished its fault run. A heal with nothing broken changes nothing.
export function healed(s: StoryState): StoryState {
  return s.healing ? { ...s, healing: false, healed: true } : s;
}

// The fault run was cut short (domain switch, stepping away): back to "break it", nothing healed.
export function aborted(s: StoryState): StoryState {
  return s.healing ? { ...s, healing: false, healed: false } : s;
}

export const caseVisible = (s: StoryState): boolean => s.step === 3 && s.healed;

// Funnel event for a forward arrival at steps 2 and 3 (sent once per page view by the caller).
export function arrivalAction(from: StoryState, to: StoryState): 'step2' | 'step3' | null {
  if (to.step <= from.step) return null;
  return to.step === 2 ? 'step2' : 'step3';
}
