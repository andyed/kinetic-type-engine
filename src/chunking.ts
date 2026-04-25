import { SPEED_NORMALIZATION_CONFIG } from './constants';
import { FONTS } from './fonts';

// Shared Transition Types
export type TransitionType = 'cut' | 'fade' | 'slide' | 'zoom' | 'orbit' | 'glitch' | 'slide_up' | 'slide_down' | 'slide_left' | 'slide_right' | 'spin_in' | 'glitch_reveal' | 'zoom_in' | 'none';

export interface VisualOverrides {
    zoom?: number;       // Extra zoom strength (0.0 - 2.0)
    trails?: number;     // Number of trail copies (0 - 5)
    repeat?: number;     // Number of stacked repeats (0 - 5)
    color?: string;      // Hex override
    isLoud?: boolean;    // "Loud" word (caps/bold effect)
    positionOffset?: { x: number; y: number }; // X/Y offset from center
    transition?: TransitionType; // Manual transition override
    fontUrl?: string;    // Font override (e.g. for Emojis)
    durationScale?: number; // Override calculated duration (0.5x - 3.0x)
    effect?: 'important' | 'exciting' | 'dramatic' | 'flowing'; // Semantic visual effect
    quoteStart?: boolean; // Show opening quote decoration
    quoteEnd?: boolean;   // Show closing quote decoration
    isAttribution?: boolean; // Style as attribution (smaller, bottom-aligned)
    isBoumaDiversity?: boolean; // Enable Bouma Anti-Masking Diversity (even if not in static list)
    verticalScale?: number; // Manual vertical scaling (e.g. for boosting big words after small words)
}

export interface Chunk {
    id: string;
    text: string;
    durationScale: number; // 1.0 = standard, >1.0 = longer pause
    isLineBreak?: boolean;
    isInterpolated?: boolean; // True if this is a sliding window frame (not editable)
    visualOverrides?: VisualOverrides;
}

// Regex for Emojis
// Matches standard emojis, including composite ranges, variation selectors, and ZWJ sequences
// Note: We deliberately exclude Text Punctuation (2010-2027) from the broad Miscellaneous Symbols range
// to prevent smart quotes/dashes from being treated as emojis. 
const BASE_EMOJI_RANGES = '(?:[\\u2700-\\u27BF]|[\\uE000-\\uF8FF]|\\uD83C[\\uDC00-\\uDFFF]|\\uD83D[\\uDC00-\\uDFFF]|[\\u2300-\\u23FF]|[\\u2460-\\u26FF]|\\uD83E[\\uDD10-\\uDDFF])';
export const EMOJI_REGEX = new RegExp(`(${BASE_EMOJI_RANGES}[\\uFE00-\\uFE0F]?(?:\\u200D${BASE_EMOJI_RANGES}[\\uFE00-\\uFE0F]?)*)`, 'g');

// Heuristic: Longer words or punctuation should stay on screen longer
const calculateDuration = (text: string): number => {
    let scale = 1.0;
    // Emojis shouldn't be too fast, they are dense visual info
    if (EMOJI_REGEX.test(text)) return 1.5;

    // Add time for length
    if (text.length > 6) scale += 0.2;
    if (text.length > 10) scale += 0.3;

    // Add significant time for punctuation (Pause)
    if (/[.!?]$/.test(text)) scale += 0.8; // Strong pause for full stops
    else if (/[,;:]$/.test(text)) scale += 0.4; // Moderate breath for commas

    return scale;
};


/**
 * Helper to split a line into tokens.
 * Handles:
 * 1. Padding emojis with spaces
 * 2. Padding dashes (--, —, –) with spaces to treat them as tokens
 * 3. Splitting by whitespace
 */
const tokenizeLine = (line: string): string[] => {
    // 1. Pad Emojis
    let processed = line.replace(EMOJI_REGEX, ' $1 ');

    // 2. Pad Dashes (Em dash, En dash, Double hyphen)
    // We treat these as separate tokens.
    processed = processed.replace(/(--+|—|–)/g, ' $1 ');

    // 3. Split by whitespace
    return processed.split(/\s+/).filter(w => w.length > 0);
};

// Check if a word is a standalone dash token
const isDashToken = (w: string): boolean => /^(?:--+|—|–|-)$/.test(w);


/**
 * For density > 50 ("All" mode — every word on a single frame), construct
 * the single Chunk directly. Two contracts:
 *
 *   (a) Explicit \n breaks survive into chunk.text, where the renderer's
 *       paragraph splitter treats them as hard line breaks. This is the
 *       documented muriel-style escape hatch: callers who want specific
 *       phrase boundaries pass them in.
 *   (b) No explicit breaks → text becomes a single space-joined paragraph
 *       and the renderer's break-finder (bestBreaksForParagraph) decides
 *       where to wrap. The PretextRenderer disparity cap + stopword
 *       anchor prevent function-word amplification regardless of which
 *       break arrangement wins.
 *
 * We deliberately do NOT pre-process through smartChunkWithNLP here:
 * NLP phrase boundaries are too granular for a single-frame layout
 * decision (it can yield one phrase per word, which then sizes each
 * word independently and re-introduces the disparity bug). The break-
 * finder + cap is the right layer for this decision.
 */
const buildAllModeChunk = (text: string): Chunk => {
    const cleanedText = text.includes('\n')
        ? text.split(/\n+/).map(s => s.trim()).filter(Boolean).join('\n')
        : text.replace(/\n+/g, ' ').trim();

    const isEmojiChunk = cleanedText.replace(EMOJI_REGEX, '').trim().length === 0;
    const visualOverrides: VisualOverrides = {};
    let durationScale = calculateDuration(cleanedText);
    if (isEmojiChunk) {
        visualOverrides.fontUrl = FONTS.NOTO_EMOJI;
        visualOverrides.zoom = 1.3;
        durationScale = 1.8;
    }

    return {
        id: crypto.randomUUID(),
        text: cleanedText,
        durationScale,
        isLineBreak: false,
        visualOverrides,
    };
};

/**
 * Splits text based on "Target Distance" (Information Density).
 * @param density Target words per chunk (1-10)
 */
export const processText = (text: string, density: number = 2): Chunk[] => {
    // High-density "All" mode (density > 50): everything goes onto a single
    // frame. Bypass the per-line buffer/join machinery entirely — that path
    // strips \n during tokenizeLine and then joins on spaces, which loses
    // the phrase structure. Build the single Chunk directly instead.
    //
    //   (a) Caller supplied explicit \n breaks → respect them as phrase
    //       boundaries. They survive into chunk.text and the renderer's
    //       paragraph splitter treats them as hard line breaks.
    //   (b) No explicit breaks → route through the NLP phrase chunker so
    //       function words ride with their phrases instead of getting
    //       stranded on their own line. Pairs with the disparity cap and
    //       stopword anchor in PretextRenderer to prevent function-word
    //       amplification.
    if (density > 50) {
        return [buildAllModeChunk(text)];
    }

    // 1. First, split by single newlines to track line boundaries.
    const lines = text.split(/\n+/).filter(line => line.trim().length > 0);
    const chunks: Chunk[] = [];

    // Density directly maps to max words (1..10).
    // (Density > 50 is handled above via buildAllModeChunk.)
    const maxWords = Math.max(1, Math.floor(density));

    // DETECT MIXED CONTENT: If message has both emojis AND regular text, 
    // emojis count as words and flow with text. If ONLY emojis, show one at a time.
    const fullText = lines.join(' ');

    // --- REPETITION ANALYSIS (Anti-Masking Lookback) ---
    // Count word frequencies to identify repeated terms for Bouma diversity
    const wordCounts = new Map<string, number>();
    const normalizedTokens = fullText.toLowerCase().replace(/[^\w\s]|_/g, "").split(/\s+/);
    normalizedTokens.forEach(t => {
        if (t.length > 0) {
            wordCounts.set(t, (wordCounts.get(t) || 0) + 1);
        }
    });

    const textWithoutEmojis = fullText.replace(EMOJI_REGEX, '').trim();
    const treatEmojisAsWords = textWithoutEmojis.length > 0; // Mixed content: emojis flow with text

    lines.forEach((line, lineIndex) => {
        const rawWords = tokenizeLine(line);

        let buffer: string[] = [];
        const isLastLine = lineIndex === lines.length - 1;
        let pendingVerticalScale = 1.0;

        rawWords.forEach((w, wordIndex) => {

            // Check if this specific word is an emoji
            const isEmoji = w.match(EMOJI_REGEX);
            const isDash = isDashToken(w);

            // --- EMPHASIS CLUSTERING ---
            const isSelfContained = w.startsWith('*') && w.endsWith('*') && w.length > 1;
            const isStartEmphasis = w.startsWith('*') && !isSelfContained;
            const isEndEmphasis = w.endsWith('*') && !isSelfContained;

            // 1. If starting new multi-word emphasis, force flush previous content
            if (isStartEmphasis && buffer.length > 0) {
                flushBuffer(buffer, chunks, false, wordCounts, { verticalScale: pendingVerticalScale });
                buffer = [];
                pendingVerticalScale = 1.0;
            }
            // 2. Dash Grouper Logic
            else if (isDash && buffer.length > 0) {
                // Check if we are mid-emphasis? 
                // If mid-emphasis, do NOT flush dash separately, treat as part of title?
                // E.g. *The - Book* -> Dash inside.
                const isTrackingEmphasis = buffer.length > 0 && buffer[0].startsWith('*') && !buffer[buffer.length - 1].endsWith('*');
                if (!isTrackingEmphasis) {
                    flushBuffer(buffer, chunks, false, wordCounts, { verticalScale: pendingVerticalScale });
                    buffer = [];
                    pendingVerticalScale = 1.0;
                }
            }

            // MIXED CONTENT: Emojis count as words, no special flushing
            if (treatEmojisAsWords) {
                buffer.push(w);

                const endsInPunctuation = /[.!?]$/.test(w);
                const isLastWordInLine = wordIndex === rawWords.length - 1;

                // 3. Logic: Should we flush?
                let shouldFlush = false;

                // Check if we are currently tracking a multi-word emphasis
                // Condition: Buffer start is 'StartEmphasis'
                const isTrackingEmphasis = buffer.length > 0 && buffer[0].startsWith('*') && !isSelfContained;

                if (isTrackingEmphasis) {
                    // If we just hit the end, FLUSH IMMEDIATELY (Isolate the phrase)
                    if (isEndEmphasis) {
                        shouldFlush = true;
                    }
                    // Use safety limit for unfinished emphasis
                    else if (isLastWordInLine || buffer.length >= 6) {
                        shouldFlush = true;
                    }
                    // Else: Hold (shouldFlush = false)
                }
                else {
                    // Normal Logic
                    // High density mode (e.g. for "All" or large slabs) should ignore punctuation breaks
                    const ignorePunctuation = maxWords > 15;
                    const stopAtPunctuation = endsInPunctuation && !ignorePunctuation;

                    if (buffer.length >= maxWords || stopAtPunctuation || isLastWordInLine) {
                        shouldFlush = true;

                        // Low Density Short Word Override (Parity with NLP logic)
                        // If density is low (1-2), group tiny words ("to", "is", "a") with the next word
                        // unless it's the end of the line or punctuation.
                        if (maxWords <= 2 && !endsInPunctuation && !isLastWordInLine) {
                            const currentLen = buffer.reduce((acc, s) => acc + s.length, 0) + (buffer.length - 1);
                            if (currentLen <= 3) {
                                const nextWord = rawWords[wordIndex + 1];
                                if (nextWord && nextWord.length <= 3) {
                                    shouldFlush = false;
                                }
                            }
                        }
                    }
                }

                if (shouldFlush) {
                    // Success Word Optimization: Small -> Big
                    const currentLen = buffer.reduce((acc, s) => acc + s.length, 0);
                    let nextScale = 1.0;
                    if (currentLen <= 3) {
                        const nextWord = rawWords[wordIndex + 1];
                        if (nextWord && nextWord.length > 6) {
                            nextScale = 1.35;
                        }
                    }

                    flushBuffer(buffer, chunks, isLastLine && isLastWordInLine, wordCounts, { verticalScale: pendingVerticalScale });
                    buffer = [];
                    pendingVerticalScale = nextScale;
                }
            } else {
                // EMOJI-ONLY: Each emoji stands alone (original behavior)
                const bufferHasEmoji = buffer.some(bw => bw.match(EMOJI_REGEX));

                if (isEmoji && buffer.length > 0) {
                    flushBuffer(buffer, chunks, isLastLine && wordIndex === rawWords.length - 1, wordCounts, { verticalScale: pendingVerticalScale });
                    buffer = [];
                    pendingVerticalScale = 1.0;
                }

                if (bufferHasEmoji) {
                    flushBuffer(buffer, chunks, isLastLine && wordIndex === rawWords.length - 1, wordCounts, { verticalScale: pendingVerticalScale });
                    buffer = [];
                    pendingVerticalScale = 1.0;
                }

                buffer.push(w);

                const endsInPunctuation = /[.!?]$/.test(w);
                const isLastWordInLine = wordIndex === rawWords.length - 1;

                if (isEmoji) {
                    flushBuffer(buffer, chunks, isLastLine && isLastWordInLine, wordCounts, { verticalScale: pendingVerticalScale });
                    buffer = [];
                    pendingVerticalScale = 1.0;
                }
                else if (buffer.length >= maxWords || endsInPunctuation || isLastWordInLine) {
                    let shouldFlush = true;
                    // Low Density Short Word Override
                    if (maxWords <= 2 && !endsInPunctuation && !isLastWordInLine) {
                        const currentLen = buffer.reduce((acc, s) => acc + s.length, 0) + (buffer.length - 1);
                        if (currentLen <= 3) {
                            const nextWord = rawWords[wordIndex + 1];
                            if (nextWord && nextWord.length <= 3) {
                                shouldFlush = false;
                            }
                        }
                    }

                    if (shouldFlush) {
                        flushBuffer(buffer, chunks, isLastLine && isLastWordInLine, wordCounts, { verticalScale: pendingVerticalScale });
                        buffer = [];
                        pendingVerticalScale = 1.0;
                    }
                }
            }
        });
    });

    // Optional: normalize per-chunk duration
    if (SPEED_NORMALIZATION_CONFIG.enabled && chunks.length > 0) {
        const nonBreakChunks = chunks.filter(c => !c.isLineBreak && c.text.trim().length > 0);
        if (nonBreakChunks.length > 0) {
            const avgLen = nonBreakChunks.reduce((sum, c) => sum + c.text.length, 0) / nonBreakChunks.length;

            for (const chunk of chunks) {
                const baseScale = chunk.durationScale;
                const len = Math.max(chunk.text.length, 1);
                const lengthRatio = len / avgLen;

                // Ideal scale that would equalize lengths: inverse proportional
                const targetScale = baseScale / lengthRatio;
                const blend = SPEED_NORMALIZATION_CONFIG.strength;
                const normalized = baseScale + (targetScale - baseScale) * blend;

                // Clamp to safe range
                const clamped = Math.min(
                    SPEED_NORMALIZATION_CONFIG.maxScale,
                    Math.max(SPEED_NORMALIZATION_CONFIG.minScale, normalized)
                );

                chunk.durationScale = clamped;
            }
        }
    }

    return chunks;
};

// Helper to construct and push chunk
const flushBuffer = (buffer: string[], chunks: Chunk[], _isTotalLast: boolean, wordCounts?: Map<string, number>, extraOverrides?: VisualOverrides) => {
    if (buffer.length === 0) return;

    const joined = buffer.join(' ');
    // Check for ONLY Emoji
    // Strict check: string consists only of whitespace and emojis
    const isEmojiChunk = joined.replace(EMOJI_REGEX, '').trim().length === 0;

    let durationScale = calculateDuration(joined);

    const visualOverrides: VisualOverrides = { ...extraOverrides };

    // Also enable for repeat emojis? Using a separate heuristic?
    // If it's pure emoji, we might want diversity too?
    if (isEmojiChunk && joined.length < 5) {
        // Emojis should probably also benefit from diversity if repeated
        // But need to check if we want that. Assuming yes for "RESIST ✊ RESIST ✊"
        // visualOverrides.isBoumaDiversity = true; 
    }

    if (isEmojiChunk) {
        visualOverrides.fontUrl = FONTS.NOTO_EMOJI;
        visualOverrides.zoom = 1.3; // Make emojis slightly larger
        durationScale = 1.8; // Give them time to shine
    } else {

        // Normal heuristic

        // --- 0. Italic/Emphasis Handling (New) ---
        // Check if text is wrapped in asterisks (*I Ching*)
        // Regex: Starts with *, Ends with *, and length > 2 (to avoid just "*")
        if (joined.length > 2 && joined.startsWith('*') && joined.endsWith('*')) {
            visualOverrides.fontUrl = FONTS.LORA_ITALIC;
            // Reduce size slightly to prevent vertical cropping on short titles
            visualOverrides.zoom = 0.85;
        }

        // 1. "Loud" words
        const isAllCaps = joined.length > 3 && joined === joined.toUpperCase() && /[A-Z]/.test(joined);
        if (isAllCaps) {
            visualOverrides.isLoud = true;
            visualOverrides.zoom = 1.5;
            visualOverrides.repeat = 3;
        }
        // 2. Long words
        if (joined.length > 10) {
            visualOverrides.trails = 3;
        }
        // 3. Punctuation
        const lastChar = joined.slice(-1);
        if (lastChar === '?') visualOverrides.transition = 'orbit';
        else if (lastChar === '!') {
            visualOverrides.transition = 'zoom';
            visualOverrides.isLoud = true;
        }

        // 4. Dash Handling
        if (isDashToken(buffer[0])) {
            visualOverrides.transition = 'slide';
            // Slightly reduce duration if it's just a connector
            if (buffer.length < 3) durationScale *= 0.9;

            // 5. Attribution Detection (New)
            if (buffer.length > 1) {
                const nextWord = buffer[1];
                if (/^[A-Z*“]/.test(nextWord)) {
                    visualOverrides.isAttribution = true;
                    visualOverrides.transition = 'slide_up';
                    visualOverrides.zoom = 0.85;
                }
            }
        }
    }

    // 6. Quote Handling (New)
    // Check start
    if (/^[“"']/.test(joined)) {
        visualOverrides.quoteStart = true;
    }

    // Check end
    if (/[”"']$/.test(joined)) {
        visualOverrides.quoteEnd = true;
    }

    // --- FINAL TEXT CLEANUP ---
    let finalText = joined;

    // Strip smart quotes
    if (visualOverrides.quoteStart) finalText = finalText.replace(/^[“"']/, '');
    if (visualOverrides.quoteEnd) finalText = finalText.replace(/[”"']$/, '');

    // Strip Emphasis Asterisks
    if (finalText.length > 2 && finalText.startsWith('*') && finalText.endsWith('*')) {
        finalText = finalText.slice(1, -1);
    }

    finalText = finalText.trim();

    // Safety: If stripping resulted in empty string (e.g. quote was just ""), revert to show the punctuation
    if (finalText.length === 0 && joined.length > 0) {
        finalText = joined;
        visualOverrides.quoteStart = false;
        visualOverrides.quoteEnd = false;
    }

    // --- REPETITION CHECK for BOUMA DIVERSITY ---
    // If this chunk is a single word (or very short phrase) that appears frequently in the text,
    // apply Bouma diversity even if it's not in the hardcoded list.
    // NOTE: We check this AFTER cleanup so "*Hello*" and "Hello" match.
    if (wordCounts && !isEmojiChunk) {
        const normalized = finalText.toLowerCase().replace(/[^\w\s]|_/g, "");
        if (normalized.length > 0) {
            const count = wordCounts.get(normalized) || 0;
            if (count > 1) {
                visualOverrides.isBoumaDiversity = true;
            }
        }
    }

    chunks.push({
        id: crypto.randomUUID(),
        text: finalText,
        durationScale,
        isLineBreak: false,
        visualOverrides
    });
};

/**
 * Process text with History (Sliding Window) mode.
 * Creates overlapping frames for smoother reading.
 * 
 * @param text Raw input text
 * @param density Words per frame (window size)
 * @param historyStep Slide step (0 = no history, 1 = slide by 1 word, etc.)
 */
export const processTextWithHistory = (
    text: string,
    density: number,
    historyStep: number
): Chunk[] => {
    // If history is off or density < 3, use standard processing
    if (historyStep === 0 || density < 3) {
        return processText(text, density);
    }

    // 1. Split text into all words (respecting line breaks minimally)
    const lines = text.split(/\n+/).filter(line => line.trim().length > 0);
    const allWords: string[] = [];

    lines.forEach(line => {
        const words = tokenizeLine(line);
        allWords.push(...words);
    });

    if (allWords.length === 0) return [];

    // 2. Generate sliding window chunks
    const chunks: Chunk[] = [];
    const windowSize = Math.max(1, Math.floor(density));
    const step = Math.max(1, Math.min(historyStep, windowSize - 1)); // Ensure at least 1 word overlap

    // Track which positions are "source" frames (the original chunk boundaries)
    // Source frames: 0, windowSize, 2*windowSize, ...
    // Interpolated frames: everything else

    for (let i = 0; i < allWords.length; i += step) {
        const windowEnd = Math.min(i + windowSize, allWords.length);
        const windowWords = allWords.slice(i, windowEnd);

        if (windowWords.length === 0) continue;

        const joined = windowWords.join(' ');
        const isEmojiChunk = joined.replace(EMOJI_REGEX, '').trim().length === 0;

        // Determine if this is an interpolated (in-between) frame
        const isInterpolated = (i % windowSize) !== 0;

        let durationScale = 1.0;
        const visualOverrides: VisualOverrides = {};

        if (isEmojiChunk) {
            visualOverrides.fontUrl = FONTS.NOTO_EMOJI;
            visualOverrides.zoom = 1.3;
            durationScale = 1.8;
        } else {
            // Apply emphasis logic (All Caps) to ALL frames to prevent "size popping" between source/interpolated
            const isAllCaps = joined.length > 3 && joined === joined.toUpperCase() && /[A-Z]/.test(joined);
            if (isAllCaps) {
                visualOverrides.isLoud = true;
                visualOverrides.zoom = 1.5;
                visualOverrides.repeat = 3;
            }

            // Apply punctuation-based duration
            if (/[.!?]$/.test(joined)) {
                durationScale += 0.8;
                // Add zoom for exclamations akin to standard mode
                if (joined.endsWith('!')) {
                    visualOverrides.zoom = 1.5;
                    visualOverrides.isLoud = true;
                }
            }
            else if (/[,;:]$/.test(joined)) durationScale += 0.4;
            if (joined.length > 10) durationScale += 0.2;

            // Apply Dash transition logic for history frames too
            if (isDashToken(windowWords[0])) {
                visualOverrides.transition = 'slide';
            }

            // Note: Quote handling for sliding window is complex because we chop words.
            // For now we don't apply the quote decoration logic here to avoid "open quote" traveling weirdly across frames
            // unless we do sophisticated context tracking. 
            // We'll leave it simple for history mode.
        }

        chunks.push({
            id: crypto.randomUUID(),
            text: joined,
            durationScale,
            isLineBreak: false,
            isInterpolated,
            visualOverrides // Always apply overrides so interpolated frames match effective size
        });

        // Stop if we've covered all words
        if (windowEnd >= allWords.length) break;
    }

    return chunks;
};
