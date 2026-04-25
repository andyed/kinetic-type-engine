// @andyed/kinetic-type-engine — public API
//
// Composable physics primitives for kinetic typography. Text segmentation,
// line breaking, optimal-recognition-point math, per-chunk timing, trail
// kinematics, layout-safety zoom limits, font metrics. Brand-neutral by
// design — named recipes ('emphatic', 'hurry', etc.) live in consumers,
// not here.
//
// See https://github.com/andyed/kinetic-type-engine#readme.

export * from './chunking';
export * from './constants';
export * from './fonts';
export * from './layoutSafety';
export * from './lineBreaking';
export * from './nlp';
export * from './timingModel';
export * from './trailModes';

// NOTE: orpCalculation (Optimal Recognition Point + Bouma offset math)
// stays in iBlipper as proprietary RSVP-specific code. Not exported here.
