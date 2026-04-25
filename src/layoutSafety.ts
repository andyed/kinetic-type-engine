import type { VisualOverrides } from './chunking';

/**
 * Calculates a safe maximum zoom level for a given text chunk and its visual effects.
 * This prevents "expressive" settings from pushing content off-screen (cropping).
 */
export const getSafeZoom = (text: string, overrides: VisualOverrides = {}): number => {
    const length = text.length;
    let safeLimit = 1.35; // Base Safe Limit

    // 1. Geometric Risk (Aspect Ratio)
    // Short words (4 chars) are square-ish or tall in many fonts, filling vertical height quickly.
    // Long words (10+ chars) are wide, filling horizontal width.

    if (length <= 4) {
        // High vertical risk. 
        // 4-letter words at 3.0x are massive blocks.
        // Cap at ~1.25x to be safe.
        safeLimit = 1.25;
    } else if (length >= 10) {
        // High horizontal risk. 
        safeLimit = 1.30;
    }
    // Medium words (5-9) are usually safest (2.5-3.0 range).

    // 2. Motion Overhead (Budgeting)
    // If the text moves, we need to reserve screen space for that motion.

    // Orbit: Rotates text, effectively increasing its bounding box width/height by sqrt(2) at peak (45 deg)
    // plus lateral displacement.
    if (overrides.transition === 'orbit') {
        safeLimit *= 0.70; // Reserve ~30% for rotation/swing
    }

    // Glitch/Exciting: Jitter adds random offset.
    if (overrides.transition === 'glitch' || overrides.effect === 'exciting' || overrides.effect === 'important') {
        safeLimit *= 0.85; // Reserve 15% for shake/pulse
    }

    // Dramatic: Often implies a slow zoom-in (looming). 
    // Note: The shader adds *extra* zoom on top of this prop. 
    // We must clamp the base so the peak doesn't clip.
    if (overrides.effect === 'dramatic') {
        safeLimit *= 0.80; // Reserve 20% for the Looming effect
    }

    // 3. User Requested Shrinkage
    // Allow the calculated safe limit to drop below 1.0 if the math demands it.
    // e.g. 1.25 (Base) * 0.85 (Orbit) * 0.9 (Effect) = 0.95 (Shrinkage)
    // We set a hard floor at 0.5 to prevent invisibility.
    return Math.max(0.5, safeLimit);
};
