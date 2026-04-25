import { type Chunk, EMOJI_REGEX } from './chunking';
import { RECOGNITION_WINDOW_MS, EXPRESSION_RAMP_MS } from './constants';

// A small set of extremely common English words (Stopwords) that can be processed faster.
// These are words that proficient readers recognize "by sight" without phonological decoding.
const COMMON_WORDS = new Set([
    'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
    'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
    'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
    'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what',
    'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me',
    'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take',
    'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other'
]);

/**
 * Calculates the display duration for a chunk based on a sophisticated reading model.
 * 
 * Model Factors:
 * 1. Base WPM: The user's target conversation speed.
 * 2. Word Frequency: Common words (stopwords) are faster.
 * 3. Word Length: Longer words require more processing (saccades/fixations).
 * 4. Punctuation: Adds significant pauses for cognitive wrapping.
 * 5. Content Density: processing multiple words in parallel (chunks) is slightly more efficient per-word.
 * 
 * @param chunk The text chunk to calculate duration for.
 * @param wpm The target words per minute.
 * @returns The duration in milliseconds.
 */
export const calculateFrameDuration = (chunk: Chunk, wpm: number): number => {
    // 1. Calculate Base Time per "Standard" Word based on WPM
    // Standard word is usually defined as ~5 characters + 1 space.
    // For 300 WPM, this is 200ms per word.
    const msPerWord = 60000 / wpm;

    // 2. Decompose Chunk into Words
    // We treat the chunk text as a sequence of words.
    // We treat emojis as words.
    // We split by whitespace.
    const text = chunk.text.trim();
    if (!text) return msPerWord; // Safety for empty chunks

    // Check if it's purely Emoji
    const isEmojiOnly = text.replace(EMOJI_REGEX, '').trim().length === 0;
    if (isEmojiOnly) {
        // Emojis are dense visual information.
        // They take longer to parse conceptually than a simple word.
        // We give them a multiplier.
        // If there are multiple emojis, we sum them up.
        // (Rough count by splitting on known emoji boundaries or just length/2 if surrogate pairs?)
        // Let's rely on the regex match count.
        const emojiCount = (text.match(EMOJI_REGEX) || []).length;
        return msPerWord * 1.5 * Math.max(1, emojiCount);
    }

    const words = text.split(/\s+/);
    let totalDuration = 0;

    words.forEach(word => {
        // Strip punctuation for analysis to get the "root" word
        const cleanWord = word.replace(/[^\w]/g, '').toLowerCase();
        const length = cleanWord.length;

        // --- FACTOR 1: FREQUENCY (Sight Word Bonus) ---
        let freqFactor = 1.0;
        if (COMMON_WORDS.has(cleanWord)) {
            freqFactor = 0.85; // Reduced bonus (was 0.7) to keep short words readable
        }

        // --- FACTOR 2: LENGTH ---
        // Saccade and processing time increases with length.
        // Short words (< 4) are often skipped or processed in parafovea -> Fast
        // Long words (> 8) require multiple fixations -> Slower
        let lengthFactor = 1.0;
        if (length <= 3) lengthFactor = 1.0; // REMOVED discount (was 0.8) to prevent "fly by"
        else if (length > 8) lengthFactor = 1.3;
        else if (length > 12) lengthFactor = 1.6;

        // Combine base factors
        let wordDuration = msPerWord * freqFactor * lengthFactor;

        // --- FACTOR 3: PUNCTUATION (Cognitive Pause) ---
        // Punctuation is conceptually separate from the word reading time.
        // It represents the pause AFTER the word.
        // We relate this to the base speed (msPerWord) so it scales with WPM.
        // LATENCY FIX: Clamp the max pause to avoid 1.5s waits at low speeds.
        const MAX_PAUSE_MS = 500;

        if (/[.!?]$/.test(word)) {
            wordDuration += Math.min(msPerWord * 1.5, MAX_PAUSE_MS * 1.2); // Strong pause
        } else if (/[;:]$/.test(word)) {
            wordDuration += Math.min(msPerWord * 1.0, MAX_PAUSE_MS * 0.8); // Medium pause
        } else if (/[,]$/.test(word)) {
            wordDuration += Math.min(msPerWord * 0.5, MAX_PAUSE_MS * 0.5); // Comma breath
        } else if (/[-–—]$/.test(word)) {
            wordDuration += Math.min(msPerWord * 0.5, MAX_PAUSE_MS * 0.5); // Dash pause
        }

        totalDuration += wordDuration;
    });

    // --- FACTOR 4: WORD COUNT (Primary Driver) ---
    // User Feedback: "the biggest drive of longer frame exposure time should be # of words"
    // Word count directly drives duration - no discount for "efficiency"

    // Only apply penalties for multi-line wrapping (vertical saccades required)
    if (words.length > 1) {
        let densityMultiplier = 1.0; // No discount - word count is additive

        // --- ROW COUNT PENALTY ---
        // Multi-line text slows reading (vertical saccades required)
        if (text.length > 25) {
            densityMultiplier += 0.10; // 2 rows - 10% slower
        }
        if (text.length > 50) {
            densityMultiplier += 0.10; // 3+ rows - additional 10% slower
        }

        totalDuration *= densityMultiplier;
    }

    // --- APPLY OVERRIDES ---
    // Specific overrides from the chunker (e.g. "Loud" words, manual tweaks)
    if (chunk.visualOverrides?.durationScale) {
        // NOTE: The legacy durationScale might imply factors we've already calculated (like length).
        // If durationScale is exactly 1.0 (default), we ignore it.
        // If it's different, we treat it as an intentional modifier (e.g. importance).
        // However, chunking.ts calculates a default durationScale based on length/punct.
        // We should usually IGNORE the automated durationScale if we are using this new model,
        // UNLESS it's an explicit visual override (like a "Loud" word which has zoom=1.5).
        // Checking for visual overrides existence might be safer.

        // Let's trust the override if it's significant (> 1.2 or < 0.8) which usually implies special handling?
        // Or assume the caller (App.tsx) decides whether to pass the override?
        // Actually, chunk.visualOverrides.durationScale is set manually in `visualOverrides` interface.
        // The *base* durationScale on the Chunk object is the calculated one.
        // See chunking.ts: `chunk.durationScale` vs `chunk.visualOverrides?.durationScale`.

        // We should apply `chunk.visualOverrides.durationScale` (Manual/Specific).
        // We should IGNORE `chunk.durationScale` (Legacy Calculated).
        const override = chunk.visualOverrides.durationScale;
        if (override !== undefined) {
            totalDuration *= override;
        }
    }

    // --- RECOGNITION WINDOW FLOOR ---
    // Enforce minimum display time for Letter Identity Lock
    // Even at extreme WPM, the word must be visible long enough for recognition
    totalDuration = Math.max(totalDuration, RECOGNITION_WINDOW_MS);

    return totalDuration;
};

/**
 * Returns the phase boundaries for a given chunk duration.
 * Used by animation code to gate effects during the recognition window.
 * 
 * @param totalDurationMs Total display time for the chunk
 * @returns Object with phase boundaries as 0-1 progress values
 */
export const getAnimationPhases = (totalDurationMs: number): {
    recognitionEnd: number;   // Progress (0-1) when recognition phase ends
    expressionStart: number;  // Progress (0-1) when expression effects begin ramping
    expressionFull: number;   // Progress (0-1) when expression effects reach full intensity
} => {
    // Recognition window is the shorter of: configured duration OR 60% of total time
    // (ensures very short durations still have proportional recognition time)
    const recognitionMs = Math.min(RECOGNITION_WINDOW_MS, totalDurationMs * 0.6);
    const recognitionEnd = recognitionMs / totalDurationMs;

    // Expression ramps from recognitionEnd to (recognitionEnd + EXPRESSION_RAMP_MS)
    const expressionStart = recognitionEnd;
    const expressionFull = Math.min(1.0, (recognitionMs + EXPRESSION_RAMP_MS) / totalDurationMs);

    return { recognitionEnd, expressionStart, expressionFull };
};
