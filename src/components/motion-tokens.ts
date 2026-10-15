export const motion = {
  duration: {
    feedback: 140,
    fast: 160,
    standard: 240,
    navigation: 380,
    deliberate: 360,
    onboarding: 600,
    illustrationLoop: 2200,
    onboardingFeedback: 90,
    state: 280,
    stateChange: 280,
    screen: 360,
    contentEntrance: 480,
    contentReconciliation: 280,
    tabContent: 240,
    tabContentReducedMotion: 120,
    profileSheet: 320,
    profileSheetReducedMotion: 120,
    loaderTransition: 400,
    majorHandoff: 850,
    contentUpdate: 320,
    skeletonRevealDelay: 300,
    skeletonMinVisible: 300,
    skeletonCrossfade: 280,
    reducedMotionTransition: 220,
    loaderPulse: 1000,
    skeletonPulse: 1100,
    firstRunReducedTransition: 220,
    firstRunScreenExit: 360,
    firstRunPrimerEntrance: 480,
  },
  easing: {
    standard: [0.2, 0, 0, 1],
    enter: [0, 0, 0.2, 1],
    exit: [0.4, 0, 1, 1],
    emphasized: [0.2, 0, 0, 1],
  },
} as const;

export type MotionDuration = keyof typeof motion.duration;
export type MotionEasing = keyof typeof motion.easing;

/** Use for optional visual transitions only; business state must update immediately. */
export function getMotionDuration(name: MotionDuration, reduceMotion: boolean): number {
  return reduceMotion ? 0 : motion.duration[name];
}
