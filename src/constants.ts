// Engine-level constants. Pure data; no DOM, no React, no FEATURE_FLAGS.
//
// These are the timing and normalization knobs the layout/timing primitives
// need to operate. They are deliberately NOT bundled with the product-side
// FEATURE_FLAGS object: feature flags toggle iBlipper-product behaviors
// (debug overlays, store URLs, motion-system mode), while these constants
// are properties of the engine itself.

export interface SpeedNormalizationConfig {
    enabled: boolean;
    /**
     * Strength of normalization toward average chunk length.
     * 0.0 = disabled; 1.0 = full normalization (all chunks converge).
     */
    strength: number;
    /** Minimum/maximum allowed duration scale after normalization. */
    minScale: number;
    maxScale: number;
}

export const SPEED_NORMALIZATION_CONFIG: SpeedNormalizationConfig = {
    enabled: true,
    // Keep this subtle: nudge extremes toward the mean but preserve punctuation pauses.
    strength: 0.35,
    minScale: 0.5,
    maxScale: 3.0,
};

// =============================================================================
// RECOGNITION WINDOW TIMING (Neuroscience-Backed)
// =============================================================================
// Visual word recognition requires ~100-150ms of stable input for "Letter Identity Lock"
// (Ref: Stanislas Dehaene's "Reading in the Brain", Spritz research)

/** Minimum time (ms) a word must be stable and visible before effects intensify */
export const RECOGNITION_WINDOW_MS = 120;

/** Time (ms) to ramp from 0% to 100% expression intensity after recognition window */
export const EXPRESSION_RAMP_MS = 80;
