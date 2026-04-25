import { describe, test, expect } from 'vitest';
import { computeTrailTransform, type TrailConfig, type TrailConfigEcho, type TrailConfigReflection, type TrailConfigDrift, type TrailConfigBlur, type TrailConfigRgbSplit, type TrailConfigForeshadow } from '../trailModes';

// --- Helpers ---

const echoConfig: TrailConfigEcho = {
    mode: 'echo',
    count: 2,
    baseOpacity: 0.3,
    opacityDecay: 0.5,
    scaleDecay: 0.9,
    zStep: -0.25,
    direction: { x: -0.3, y: 0.5 },
    distancePerTrail: 0.15,
    timeDelayPerTrail: 0.1,
};

const reflectionConfig: TrailConfigReflection = {
    mode: 'reflection',
    count: 1,
    baseOpacity: 0.25,
    opacityDecay: 0.5,
    scaleDecay: 1.0,
    zStep: -0.1,
    gap: 0.4,
    flipAxis: 'y',
    fadeGradient: 0.3,
};

const driftConfig: TrailConfigDrift = {
    mode: 'drift',
    count: 2,
    baseOpacity: 0.4,
    opacityDecay: 0.6,
    scaleDecay: 0.9,
    zStep: -0.2,
    direction: { x: 1, y: 0.5 },
    spreadAngle: 0.0,
    travelDistance: 0.5,
    easing: 'easeOut',
};

const driftFanConfig: TrailConfigDrift = {
    mode: 'drift',
    count: 3,
    baseOpacity: 0.5,
    opacityDecay: 0.6,
    scaleDecay: 0.85,
    zStep: -0.2,
    direction: { x: 0, y: 1 },
    spreadAngle: 0.8,
    travelDistance: 0.6,
    easing: 'linear',
};

const blurConfig: TrailConfigBlur = {
    mode: 'blur',
    count: 3,
    baseOpacity: 0.2,
    opacityDecay: 0.6,
    scaleDecay: 1.0,
    zStep: -0.05,
    direction: { x: -1, y: 0 },
    spacing: 0.02,
};

const rgbSplitConfig: TrailConfigRgbSplit = {
    mode: 'rgb_split',
    count: 3,
    baseOpacity: 0.7,
    opacityDecay: 1.0,
    scaleDecay: 1.0,
    zStep: -0.05,
    colors: ['#ff0000', '#00ff00', '#0000ff'],
    splitDistance: 0.03,
    blending: 'additive',
};

const foreshadowConfig: TrailConfigForeshadow = {
    mode: 'foreshadow',
    count: 1,
    baseOpacity: 0.3,
    opacityDecay: 1.0,
    scaleDecay: 1.0,
    zStep: -0.1,
    appearAtProgress: 0.7,
    maxOpacity: 0.3,
    positionOffset: { x: 0.5, y: 0 },
};


// --- Tests ---

describe('computeTrailTransform', () => {

    describe('none mode', () => {
        test('returns zero transform', () => {
            const config: TrailConfig = { mode: 'none', count: 0 };
            const result = computeTrailTransform(config, 0, 0.5, 1.0);
            expect(result.opacity).toBe(0);
            expect(result.positionOffset.x).toBe(0);
            expect(result.positionOffset.y).toBe(0);
            expect(result.scale).toBe(1);
        });
    });

    describe('echo mode', () => {
        test('positions recede along direction vector', () => {
            const t0 = computeTrailTransform(echoConfig, 0, 0.5, 1.0);
            const t1 = computeTrailTransform(echoConfig, 1, 0.5, 1.0);

            // First copy at 1x distance, second at 2x
            expect(t0.positionOffset.x).toBeCloseTo(echoConfig.direction.x * echoConfig.distancePerTrail * 1);
            expect(t1.positionOffset.x).toBeCloseTo(echoConfig.direction.x * echoConfig.distancePerTrail * 2);

            // Second copy is further away
            const dist0 = Math.hypot(t0.positionOffset.x, t0.positionOffset.y);
            const dist1 = Math.hypot(t1.positionOffset.x, t1.positionOffset.y);
            expect(dist1).toBeGreaterThan(dist0);
        });

        test('opacity decays with each copy', () => {
            const t0 = computeTrailTransform(echoConfig, 0, 0.5, 1.0);
            const t1 = computeTrailTransform(echoConfig, 1, 0.5, 1.0);

            expect(t0.opacity).toBeCloseTo(0.3); // baseOpacity * 0.5^0
            expect(t1.opacity).toBeCloseTo(0.15); // baseOpacity * 0.5^1
            expect(t1.opacity).toBeLessThan(t0.opacity);
        });

        test('scale decays with each copy', () => {
            const t0 = computeTrailTransform(echoConfig, 0, 0.5, 1.0);
            const t1 = computeTrailTransform(echoConfig, 1, 0.5, 1.0);

            expect(t0.scale).toBeCloseTo(0.9);   // 0.9^1
            expect(t1.scale).toBeCloseTo(0.81);  // 0.9^2
            expect(t1.scale).toBeLessThan(t0.scale);
        });

        test('time delay increases per copy', () => {
            const t0 = computeTrailTransform(echoConfig, 0, 0.5, 1.0);
            const t1 = computeTrailTransform(echoConfig, 1, 0.5, 1.0);

            expect(t0.timeOffset).toBeCloseTo(0.1);
            expect(t1.timeOffset).toBeCloseTo(0.2);
        });

        test('z-offset steps back per copy', () => {
            const t0 = computeTrailTransform(echoConfig, 0, 0.5, 1.0);
            const t1 = computeTrailTransform(echoConfig, 1, 0.5, 1.0);

            expect(t0.zOffset).toBeCloseTo(-0.25);
            expect(t1.zOffset).toBeCloseTo(-0.5);
        });

        test('no groupScaleY set', () => {
            const t0 = computeTrailTransform(echoConfig, 0, 0.5, 1.0);
            expect(t0.groupScaleY).toBeUndefined();
        });
    });

    describe('reflection mode', () => {
        test('sets groupScaleY to -1', () => {
            const t = computeTrailTransform(reflectionConfig, 0, 0.5, 1.0);
            expect(t.groupScaleY).toBe(-1);
        });

        test('positions below with gap', () => {
            const t = computeTrailTransform(reflectionConfig, 0, 0.5, 1.0);
            // y should be negative (below), magnitude = gap * mult
            expect(t.positionOffset.y).toBeCloseTo(-0.4);
            expect(t.positionOffset.x).toBe(0);
        });

        test('opacity includes fade gradient', () => {
            const t = computeTrailTransform(reflectionConfig, 0, 0.5, 1.0);
            // fadeMod = 1.0 - (0.3 * (1 / 1)) = 0.7
            // opacity = 0.25 * 0.5^0 * 0.7 = 0.175
            expect(t.opacity).toBeCloseTo(0.175);
        });

        test('no rotation', () => {
            const t = computeTrailTransform(reflectionConfig, 0, 0.5, 1.0);
            expect(t.rotation).toBe(0);
        });
    });

    describe('drift mode', () => {
        test('position grows with progress (one-way travel)', () => {
            const t_start = computeTrailTransform(driftConfig, 0, 0.0, 1.0);
            const t_mid = computeTrailTransform(driftConfig, 0, 0.5, 1.0);
            const t_end = computeTrailTransform(driftConfig, 0, 1.0, 1.0);

            const dist_start = Math.hypot(t_start.positionOffset.x, t_start.positionOffset.y);
            const dist_mid = Math.hypot(t_mid.positionOffset.x, t_mid.positionOffset.y);
            const dist_end = Math.hypot(t_end.positionOffset.x, t_end.positionOffset.y);

            expect(dist_start).toBeCloseTo(0);
            expect(dist_mid).toBeGreaterThan(0);
            expect(dist_end).toBeGreaterThan(dist_mid);
        });

        test('opacity fades as it travels', () => {
            const t_start = computeTrailTransform(driftConfig, 0, 0.0, 1.0);
            const t_end = computeTrailTransform(driftConfig, 0, 1.0, 1.0);

            expect(t_start.opacity).toBeGreaterThan(t_end.opacity);
        });

        test('fan spread separates multiple copies', () => {
            const t0 = computeTrailTransform(driftFanConfig, 0, 0.5, 1.0);
            const t1 = computeTrailTransform(driftFanConfig, 1, 0.5, 1.0);
            const t2 = computeTrailTransform(driftFanConfig, 2, 0.5, 1.0);

            // With a spread of 0.8rad and direction (0,1), copies should fan differently
            // Copy 0 is leftmost, copy 1 is center, copy 2 is rightmost
            expect(t0.positionOffset.x).not.toBeCloseTo(t2.positionOffset.x, 1);
            // Center copy should be between the outer two
            expect(t1.positionOffset.x).toBeCloseTo(0, 0); // center of fan aligns with direction
        });

        test('easeOut decelerates', () => {
            // At progress=0.5, easeOut should be further along than linear 0.5
            const easeOutResult = computeTrailTransform(driftConfig, 0, 0.5, 1.0);
            const linearConfig = { ...driftConfig, easing: 'linear' as const };
            const linearResult = computeTrailTransform(linearConfig, 0, 0.5, 1.0);

            const easeOutDist = Math.hypot(easeOutResult.positionOffset.x, easeOutResult.positionOffset.y);
            const linearDist = Math.hypot(linearResult.positionOffset.x, linearResult.positionOffset.y);

            // easeOut at 0.5 = 0.75, linear at 0.5 = 0.5
            expect(easeOutDist).toBeGreaterThan(linearDist);
        });

        test('no groupScaleY set', () => {
            const t = computeTrailTransform(driftConfig, 0, 0.5, 1.0);
            expect(t.groupScaleY).toBeUndefined();
        });
    });

    describe('blur mode', () => {
        test('positions are static (independent of progress)', () => {
            const t_start = computeTrailTransform(blurConfig, 0, 0.0, 0.0);
            const t_mid = computeTrailTransform(blurConfig, 0, 0.5, 5.0);
            const t_end = computeTrailTransform(blurConfig, 0, 1.0, 10.0);

            expect(t_start.positionOffset.x).toBeCloseTo(t_mid.positionOffset.x);
            expect(t_mid.positionOffset.x).toBeCloseTo(t_end.positionOffset.x);
        });

        test('copies stack along direction with spacing', () => {
            const t0 = computeTrailTransform(blurConfig, 0, 0.5, 1.0);
            const t1 = computeTrailTransform(blurConfig, 1, 0.5, 1.0);
            const t2 = computeTrailTransform(blurConfig, 2, 0.5, 1.0);

            // direction is (-1, 0), spacing 0.02
            expect(t0.positionOffset.x).toBeCloseTo(-0.02);
            expect(t1.positionOffset.x).toBeCloseTo(-0.04);
            expect(t2.positionOffset.x).toBeCloseTo(-0.06);
            expect(t0.positionOffset.y).toBeCloseTo(0);
        });

        test('opacity decays per copy', () => {
            const t0 = computeTrailTransform(blurConfig, 0, 0.5, 1.0);
            const t1 = computeTrailTransform(blurConfig, 1, 0.5, 1.0);

            expect(t0.opacity).toBeCloseTo(0.2);     // 0.2 * 0.6^0
            expect(t1.opacity).toBeCloseTo(0.12);    // 0.2 * 0.6^1
        });

        test('no timeOffset', () => {
            const t = computeTrailTransform(blurConfig, 0, 0.5, 1.0);
            expect(t.timeOffset).toBe(0);
        });
    });

    describe('rgb_split mode', () => {
        test('assigns correct color per channel', () => {
            const t0 = computeTrailTransform(rgbSplitConfig, 0, 0.5, 1.0);
            const t1 = computeTrailTransform(rgbSplitConfig, 1, 0.5, 1.0);
            const t2 = computeTrailTransform(rgbSplitConfig, 2, 0.5, 1.0);

            expect(t0.colorOverride).toBe('#ff0000');
            expect(t1.colorOverride).toBe('#00ff00');
            expect(t2.colorOverride).toBe('#0000ff');
        });

        test('sets additive blending', () => {
            const t = computeTrailTransform(rgbSplitConfig, 0, 0.5, 1.0);
            expect(t.blending).toBe('additive');
        });

        test('positions split symmetrically', () => {
            const t0 = computeTrailTransform(rgbSplitConfig, 0, 0.5, 1.0);
            const t1 = computeTrailTransform(rgbSplitConfig, 1, 0.5, 1.0);
            const t2 = computeTrailTransform(rgbSplitConfig, 2, 0.5, 1.0);

            // [-1, 0, 1] * splitDistance
            expect(t0.positionOffset.x).toBeCloseTo(-0.03);
            expect(t1.positionOffset.x).toBeCloseTo(0);
            expect(t2.positionOffset.x).toBeCloseTo(0.03);
        });

        test('all copies have same opacity', () => {
            const t0 = computeTrailTransform(rgbSplitConfig, 0, 0.5, 1.0);
            const t1 = computeTrailTransform(rgbSplitConfig, 1, 0.5, 1.0);
            const t2 = computeTrailTransform(rgbSplitConfig, 2, 0.5, 1.0);

            expect(t0.opacity).toBe(t1.opacity);
            expect(t1.opacity).toBe(t2.opacity);
        });

        test('scale is 1.0 (no decay)', () => {
            const t = computeTrailTransform(rgbSplitConfig, 0, 0.5, 1.0);
            expect(t.scale).toBe(1.0);
        });
    });

    describe('foreshadow mode', () => {
        test('invisible before appearAtProgress', () => {
            const t = computeTrailTransform(foreshadowConfig, 0, 0.5, 1.0);
            expect(t.opacity).toBe(0);
        });

        test('fades in after appearAtProgress', () => {
            const t_just = computeTrailTransform(foreshadowConfig, 0, 0.75, 1.0);
            const t_full = computeTrailTransform(foreshadowConfig, 0, 1.0, 1.0);

            expect(t_just.opacity).toBeGreaterThan(0);
            expect(t_full.opacity).toBeCloseTo(0.3); // maxOpacity at progress=1
        });

        test('uses position offset from config', () => {
            const t = computeTrailTransform(foreshadowConfig, 0, 1.0, 1.0);
            expect(t.positionOffset.x).toBeCloseTo(0.5);
            expect(t.positionOffset.y).toBeCloseTo(0);
        });
    });

    describe('edge cases', () => {
        test('progress=0 for drift produces zero distance', () => {
            const t = computeTrailTransform(driftConfig, 0, 0.0, 0.0);
            expect(t.positionOffset.x).toBeCloseTo(0);
            expect(t.positionOffset.y).toBeCloseTo(0);
        });

        test('progress=1 for drift at max travel', () => {
            const t = computeTrailTransform(driftConfig, 0, 1.0, 0.0);
            const dist = Math.hypot(t.positionOffset.x, t.positionOffset.y);
            // easeOut(1.0) = 1.0, so distance = travelDistance * 1.0 * mult(1)
            expect(dist).toBeCloseTo(driftConfig.travelDistance);
        });

        test('echo with zero direction produces zero position', () => {
            const zeroDir: TrailConfigEcho = { ...echoConfig, direction: { x: 0, y: 0 } };
            const t = computeTrailTransform(zeroDir, 0, 0.5, 1.0);
            expect(t.positionOffset.x).toBe(0);
            expect(t.positionOffset.y).toBe(0);
            // But opacity and scale should still apply
            expect(t.opacity).toBeGreaterThan(0);
        });
    });
});
