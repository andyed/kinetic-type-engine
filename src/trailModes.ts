/**
 * Trail Modes — Pure function module for computing trail transforms.
 *
 * Each emotion maps to a named trail mode with purposeful spatial behavior.
 * Trails travel, recede, mirror, or blur — never oscillate.
 *
 * No React, no Three.js. Fully unit-testable.
 */

// --- Types ---

export type TrailMode = 'none' | 'echo' | 'reflection' | 'drift' | 'blur' | 'rgb_split' | 'foreshadow';

/** Base fields shared by all trail configs */
interface TrailConfigBase {
    count: number;          // 0-3 trail copies
    baseOpacity: number;    // opacity of the first trail copy
    opacityDecay: number;   // multiplier per subsequent copy (e.g. 0.5 = halves each time)
    scaleDecay: number;     // scale multiplier per copy (e.g. 0.95)
    zStep: number;          // z-offset step per copy (negative = behind)
}

export interface TrailConfigNone {
    mode: 'none';
    count: 0;
}

export interface TrailConfigEcho extends TrailConfigBase {
    mode: 'echo';
    direction: { x: number; y: number };   // unit-ish direction vector
    distancePerTrail: number;               // world-space distance between copies
    timeDelayPerTrail: number;              // seconds of animation delay per copy
}

export interface TrailConfigReflection extends TrailConfigBase {
    mode: 'reflection';
    gap: number;            // vertical distance below text to reflection
    flipAxis: 'y';         // always Y for now
    fadeGradient: number;   // 0-1, how much the reflection fades toward bottom
}

export interface TrailConfigDrift extends TrailConfigBase {
    mode: 'drift';
    direction: { x: number; y: number };   // center direction of fan
    spreadAngle: number;                    // radians, total spread of fan (0 = parallel)
    travelDistance: number;                 // max distance traveled over word duration
    easing: 'linear' | 'easeOut';          // how position interpolates
}

export interface TrailConfigBlur extends TrailConfigBase {
    mode: 'blur';
    direction: { x: number; y: number };   // direction of blur (e.g. left = -1, 0)
    spacing: number;                        // distance between each blur copy
}

export interface TrailConfigRgbSplit extends TrailConfigBase {
    mode: 'rgb_split';
    colors: [string, string, string];       // RGB channel colors
    splitDistance: number;                   // distance between each channel
    blending: 'additive';
}

export interface TrailConfigForeshadow extends TrailConfigBase {
    mode: 'foreshadow';
    appearAtProgress: number;   // 0-1, when in word duration the preview appears
    maxOpacity: number;         // peak opacity of the foreshadow
    positionOffset: { x: number; y: number }; // offset from main text
}

export type TrailConfig =
    | TrailConfigNone
    | TrailConfigEcho
    | TrailConfigReflection
    | TrailConfigDrift
    | TrailConfigBlur
    | TrailConfigRgbSplit
    | TrailConfigForeshadow;

/** Output of computeTrailTransform — everything needed to render one trail copy */
export interface TrailTransform {
    positionOffset: { x: number; y: number };
    zOffset: number;
    opacity: number;
    scale: number;
    timeOffset: number;
    rotation: number;               // z-axis rotation in radians
    colorOverride?: string;
    blending?: 'additive' | 'normal';
    groupScaleY?: number;           // -1 for reflection flip, undefined otherwise
}

// --- Easing ---

function easeOutQuad(t: number): number {
    return t * (2 - t);
}

// --- Core Function ---

/**
 * Compute the transform for a single trail copy.
 *
 * @param config - The trail config for this emotion
 * @param trailIndex - Which copy (0-based)
 * @param progress - 0-1, how far through the word duration (for drift/foreshadow)
 * @param _elapsedTime - Global clock time (reserved for future use)
 * @returns TrailTransform with position, opacity, scale, etc.
 */
export function computeTrailTransform(
    config: TrailConfig,
    trailIndex: number,
    progress: number,
    _elapsedTime: number
): TrailTransform {
    // 'none' should never be called with trailIndex, but handle gracefully
    if (config.mode === 'none') {
        return {
            positionOffset: { x: 0, y: 0 },
            zOffset: 0,
            opacity: 0,
            scale: 1,
            timeOffset: 0,
            rotation: 0,
        };
    }

    const i = trailIndex;
    const mult = i + 1; // 1-based multiplier for distance calculations

    switch (config.mode) {
        case 'echo': {
            // Copies recede along direction vector, each fainter/smaller/time-delayed
            const opacity = config.baseOpacity * Math.pow(config.opacityDecay, i);
            const scale = Math.pow(config.scaleDecay, mult);
            return {
                positionOffset: {
                    x: config.direction.x * config.distancePerTrail * mult,
                    y: config.direction.y * config.distancePerTrail * mult,
                },
                zOffset: config.zStep * mult,
                opacity,
                scale,
                timeOffset: config.timeDelayPerTrail * mult,
                rotation: 0,
            };
        }

        case 'reflection': {
            // Single Y-flipped copy below text at a gap distance
            const opacity = config.baseOpacity * Math.pow(config.opacityDecay, i);
            // Reflection fades more with fadeGradient (applied per-copy for multi-copy reflections)
            const fadeMod = 1.0 - (config.fadeGradient * (mult / Math.max(config.count, 1)));
            return {
                positionOffset: {
                    x: 0,
                    y: -config.gap * mult,  // negative = below, parent group flips
                },
                zOffset: config.zStep * mult,
                opacity: opacity * Math.max(0, fadeMod),
                scale: Math.pow(config.scaleDecay, i),
                timeOffset: 0,
                rotation: 0,
                groupScaleY: -1,
            };
        }

        case 'drift': {
            // Copies fan outward from text, traveling one-way over word duration
            // Calculate fan angle for this copy
            const angleStep = config.count > 1
                ? config.spreadAngle / (config.count - 1)
                : 0;
            const angle = config.count > 1
                ? -config.spreadAngle / 2 + angleStep * i
                : 0;

            // Rotate direction by fan angle
            const baseAngle = Math.atan2(config.direction.y, config.direction.x);
            const finalAngle = baseAngle + angle;

            // One-way travel: position grows with progress, never resets
            const easedProgress = config.easing === 'easeOut'
                ? easeOutQuad(progress)
                : progress;
            const distance = config.travelDistance * easedProgress * mult;

            // Fade as it travels — fully visible at start, fading toward end
            const fadeProgress = 1.0 - (easedProgress * 0.7); // retain 30% at full travel
            const opacity = config.baseOpacity * Math.pow(config.opacityDecay, i) * fadeProgress;

            return {
                positionOffset: {
                    x: Math.cos(finalAngle) * distance,
                    y: Math.sin(finalAngle) * distance,
                },
                zOffset: config.zStep * mult,
                opacity,
                scale: Math.pow(config.scaleDecay, mult),
                timeOffset: 0,
                rotation: 0,
            };
        }

        case 'blur': {
            // Tight static copies behind reading direction — no dynamics
            const opacity = config.baseOpacity * Math.pow(config.opacityDecay, i);
            return {
                positionOffset: {
                    x: config.direction.x * config.spacing * mult,
                    y: config.direction.y * config.spacing * mult,
                },
                zOffset: config.zStep * mult,
                opacity,
                scale: Math.pow(config.scaleDecay, i),
                timeOffset: 0,
                rotation: 0,
            };
        }

        case 'rgb_split': {
            // 3 color-channel copies with additive blending
            const colorIndex = Math.min(i, 2);
            // Offset pattern: [-1, 0, 1] for left/center/right split
            const splitMult = i === 0 ? -1 : i === 1 ? 0 : 1;
            return {
                positionOffset: {
                    x: config.splitDistance * splitMult,
                    y: 0,
                },
                zOffset: config.zStep * mult,
                opacity: config.baseOpacity,
                scale: 1.0,
                timeOffset: 0,
                rotation: 0,
                colorOverride: config.colors[colorIndex],
                blending: 'additive',
            };
        }

        case 'foreshadow': {
            // Faint preview of NEXT word appearing late in current word (Phase 3)
            const appear = progress >= config.appearAtProgress;
            const fadeIn = appear
                ? Math.min(1.0, (progress - config.appearAtProgress) / (1.0 - config.appearAtProgress))
                : 0;
            return {
                positionOffset: {
                    x: config.positionOffset.x,
                    y: config.positionOffset.y,
                },
                zOffset: config.zStep * mult,
                opacity: config.maxOpacity * fadeIn,
                scale: Math.pow(config.scaleDecay, i),
                timeOffset: 0,
                rotation: 0,
            };
        }
    }
}
