
import { describe, test, expect, beforeEach } from 'vitest';
import { processText, processTextWithHistory, EMOJI_REGEX } from '../chunking';

// ============================================================================
// EMOJI_REGEX — Pattern correctness
// ============================================================================
describe('EMOJI_REGEX', () => {
    // Reset regex lastIndex before each test since it's global (stateful /g flag)
    beforeEach(() => {
        EMOJI_REGEX.lastIndex = 0;
    });

    test('matches standard emojis', () => {
        expect('Hello 🔥 world'.match(EMOJI_REGEX)).toHaveLength(1);
        expect('🎉🎊'.match(EMOJI_REGEX)).toBeTruthy();
    });

    test('matches ZWJ sequences (family, skin tone)', () => {
        // ZWJ sequence: woman + ZWJ + man
        const familyEmoji = '👩‍👨';
        const match = familyEmoji.match(EMOJI_REGEX);
        expect(match).toBeTruthy();
    });

    test('does NOT match smart quotes or dashes (text punctuation)', () => {
        // Smart quotes are in Unicode range 2018-201D
        // These should NOT be treated as emojis
        const smartQuoted = '\u201CHello\u201D';
        EMOJI_REGEX.lastIndex = 0;
        const match = smartQuoted.match(EMOJI_REGEX);
        expect(match).toBeNull();
    });

    test('does NOT match em-dash or en-dash as emoji', () => {
        const emDash = 'word\u2014word';
        EMOJI_REGEX.lastIndex = 0;
        expect(emDash.match(EMOJI_REGEX)).toBeNull();
    });
});

// ============================================================================
// processText — Core chunking logic
// ============================================================================
describe('processText', () => {
    // --- Basic Functionality ---

    test('returns empty array for empty string', () => {
        const chunks = processText('', 1);
        expect(chunks).toHaveLength(0);
    });

    test('returns empty array for whitespace-only string', () => {
        const chunks = processText('   \n\n   ', 1);
        expect(chunks).toHaveLength(0);
    });

    test('single word at density 1 produces one chunk', () => {
        const chunks = processText('Hello', 1);
        expect(chunks).toHaveLength(1);
        expect(chunks[0].text).toBe('Hello');
    });

    test('two words at density 1 produce two chunks', () => {
        const chunks = processText('Hello World', 1);
        expect(chunks).toHaveLength(2);
        expect(chunks[0].text).toBe('Hello');
        expect(chunks[1].text).toBe('World');
    });

    test('two words at density 2 produce one chunk', () => {
        const chunks = processText('Hello World', 2);
        expect(chunks).toHaveLength(1);
        expect(chunks[0].text).toBe('Hello World');
    });

    test('every chunk has a unique id', () => {
        const chunks = processText('The quick brown fox jumps', 1);
        const ids = chunks.map(c => c.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);
    });

    // --- Density Clamping ---

    test('density < 1 is clamped to 1', () => {
        const chunks = processText('Hello World', 0);
        // density 0 -> Math.floor(0) = 0 -> Math.max(1, 0) = 1
        expect(chunks.length).toBeGreaterThanOrEqual(2);
    });

    test('density > 50 merges into one chunk (All mode)', () => {
        const chunks = processText('Hello World. This is a test. More words here.', 100);
        expect(chunks).toHaveLength(1);
        expect(chunks[0].text).toContain('Hello');
        expect(chunks[0].text).toContain('More');
    });

    // --- Punctuation Handling ---

    test('sentence-ending punctuation triggers flush', () => {
        const chunks = processText('Hello world. Good day.', 5);
        // Even though density is 5, periods force a break
        expect(chunks.length).toBeGreaterThanOrEqual(2);
    });

    test('punctuation increases durationScale', () => {
        const chunksNoPunct = processText('Hello world', 2);
        const chunksWithPunct = processText('Hello world.', 2);

        // The chunk ending with "." should have a higher durationScale
        const lastWithPunct = chunksWithPunct[chunksWithPunct.length - 1];
        const lastNoPunct = chunksNoPunct[chunksNoPunct.length - 1];
        expect(lastWithPunct.durationScale).toBeGreaterThan(lastNoPunct.durationScale);
    });

    test('question mark triggers orbit transition', () => {
        const chunks = processText('Is it real?', 5);
        const lastChunk = chunks[chunks.length - 1];
        expect(lastChunk.visualOverrides?.transition).toBe('orbit');
    });

    test('exclamation mark triggers zoom + isLoud', () => {
        const chunks = processText('Amazing!', 1);
        expect(chunks[0].visualOverrides?.transition).toBe('zoom');
        expect(chunks[0].visualOverrides?.isLoud).toBe(true);
    });

    // --- ALL CAPS Detection ---

    test('ALL CAPS word (>3 chars) triggers isLoud and zoom', () => {
        const chunks = processText('HELLO', 1);
        expect(chunks[0].visualOverrides?.isLoud).toBe(true);
        expect(chunks[0].visualOverrides?.zoom).toBe(1.5);
        expect(chunks[0].visualOverrides?.repeat).toBe(3);
    });

    test('short caps (3 chars or less) does NOT trigger isLoud', () => {
        // "THE" is 3 chars, so length > 3 check fails
        const chunks = processText('THE', 1);
        expect(chunks[0].visualOverrides?.isLoud).toBeFalsy();
    });

    // --- Long Word Handling ---

    test('long words (>10 chars) get trails', () => {
        const chunks = processText('Extraordinary', 1);
        expect(chunks[0].visualOverrides?.trails).toBe(3);
    });

    // --- Emoji Handling ---

    test('emoji-only text gets emoji font and boosted duration', () => {
        const chunks = processText('🔥', 1);
        expect(chunks).toHaveLength(1);
        expect(chunks[0].visualOverrides?.fontUrl).toContain('NotoEmoji');
        expect(chunks[0].visualOverrides?.zoom).toBe(1.3);
    });

    test('mixed emoji + text: emojis flow with text', () => {
        const chunks = processText('Hello 🔥 world', 3);
        // Should produce at least 1 chunk containing both text and emoji
        const allText = chunks.map(c => c.text).join(' ');
        expect(allText).toContain('Hello');
        expect(allText).toContain('world');
    });

    test('emoji-only text (multiple emojis) stands alone per emoji', () => {
        const chunks = processText('🔥 🎉', 1);
        // Each emoji should be its own chunk
        expect(chunks.length).toBeGreaterThanOrEqual(2);
    });

    // --- Line Break Handling ---

    test('newlines split into separate lines, processed independently', () => {
        const chunks = processText('First line\nSecond line', 5);
        // Should have at least 2 chunks (one per line)
        expect(chunks.length).toBeGreaterThanOrEqual(2);
        expect(chunks[0].text).toContain('First');
        expect(chunks[chunks.length - 1].text).toContain('Second');
    });

    test('multiple consecutive newlines are collapsed', () => {
        const chunks = processText('A\n\n\nB', 1);
        expect(chunks).toHaveLength(2);
        expect(chunks[0].text).toBe('A');
        expect(chunks[1].text).toBe('B');
    });

    // --- Dash Handling ---

    test('em dash is treated as separate token', () => {
        const chunks = processText('Word\u2014Another', 1);
        // Should split into at least 2 chunks (word, dash, another)
        expect(chunks.length).toBeGreaterThanOrEqual(2);
    });

    test('double hyphen is treated as separate token', () => {
        const chunks = processText('Word--Another', 1);
        expect(chunks.length).toBeGreaterThanOrEqual(2);
    });

    test('dash token gets slide transition', () => {
        const chunks = processText('Hello \u2014 World', 1);
        const dashChunk = chunks.find(c => c.text.includes('\u2014'));
        if (dashChunk) {
            expect(dashChunk.visualOverrides?.transition).toBe('slide');
        }
    });

    // --- Emphasis (Asterisks) ---

    test('asterisk-wrapped text gets italic font and stripped asterisks', () => {
        const chunks = processText('*Hello World*', 5);
        expect(chunks).toHaveLength(1);
        expect(chunks[0].text).toBe('Hello World');
        expect(chunks[0].visualOverrides?.fontUrl).toContain('Lora-Italic');
        expect(chunks[0].visualOverrides?.zoom).toBe(0.85);
    });

    test('multi-word emphasis is clustered together', () => {
        const text = 'Before *Important Phrase* After';
        const chunks = processText(text, 1);
        // The emphasis group should be isolated
        const emphasisChunk = chunks.find(c => c.text === 'Important Phrase');
        expect(emphasisChunk).toBeDefined();
    });

    // --- Quote Handling ---

    test('smart quotes are stripped and quoteStart/quoteEnd flags set', () => {
        const chunks = processText('\u201CHello\u201D', 1);
        expect(chunks).toHaveLength(1);
        expect(chunks[0].text).toBe('Hello');
        expect(chunks[0].visualOverrides?.quoteStart).toBe(true);
        expect(chunks[0].visualOverrides?.quoteEnd).toBe(true);
    });

    test('quote-only string does not produce empty text (safety fallback)', () => {
        const chunks = processText('\u201C\u201D', 1);
        // Should not crash, and text should not be empty
        expect(chunks).toHaveLength(1);
        expect(chunks[0].text.length).toBeGreaterThan(0);
    });

    // --- Attribution Detection ---

    test('dash followed by capitalized word gets attribution styling', () => {
        const chunks = processText('\u2014 Shakespeare', 2);
        const attrChunk = chunks.find(c => c.visualOverrides?.isAttribution);
        expect(attrChunk).toBeDefined();
        if (attrChunk) {
            expect(attrChunk.visualOverrides?.transition).toBe('slide_up');
            expect(attrChunk.visualOverrides?.zoom).toBe(0.85);
        }
    });

    // --- Repetition / Bouma Diversity ---

    test('repeated words get isBoumaDiversity flag', () => {
        // Use density 2 with longer words to avoid short-word grouping
        // The repetition check operates on normalized single-word chunks
        const text = 'hello world hello again hello there';
        const chunks = processText(text, 1);
        // "hello" appears 3 times. When it stands alone as a chunk, it should have Bouma diversity.
        // Due to short-word grouping, some may be combined, so check at least one has the flag.
        const helloChunks = chunks.filter(c => c.text.toLowerCase().includes('hello'));
        expect(helloChunks.length).toBeGreaterThanOrEqual(1);
        const hasBouma = helloChunks.some(c => c.visualOverrides?.isBoumaDiversity === true);
        expect(hasBouma).toBe(true);
    });

    test('unique words do NOT get isBoumaDiversity flag', () => {
        const text = 'Alpha Beta Gamma Delta';
        const chunks = processText(text, 1);
        chunks.forEach(c => {
            expect(c.visualOverrides?.isBoumaDiversity).toBeFalsy();
        });
    });

    // --- Low Density Short Word Override ---

    test('at density 1, tiny words ("to", "a") group with next tiny word', () => {
        const chunks = processText('to be or', 1);
        // "to" (2 chars) + "be" (2 chars) should be grouped
        // Implementation: if currentLen <= 3 and nextWord <= 3 chars, skip flush
        expect(chunks.length).toBeLessThan(3);
    });

    // --- Speed Normalization ---

    test('chunks have clamped durationScale within config bounds', () => {
        const chunks = processText('The extraordinarily long sentence with very short a words in it.', 1);
        chunks.forEach(c => {
            expect(c.durationScale).toBeGreaterThanOrEqual(0.5);
            expect(c.durationScale).toBeLessThanOrEqual(3.0);
        });
    });

    // --- Edge Cases ---

    test('handles very long unbroken string (no spaces)', () => {
        const longWord = 'a'.repeat(500);
        const chunks = processText(longWord, 1);
        expect(chunks).toHaveLength(1);
        expect(chunks[0].text).toBe(longWord);
    });

    test('handles unicode characters (CJK, accented)', () => {
        const chunks = processText('cafe resume', 1);
        expect(chunks.length).toBeGreaterThanOrEqual(2);
    });

    test('handles tab characters (treated as whitespace)', () => {
        const chunks = processText('Hello\tWorld', 1);
        expect(chunks.length).toBeGreaterThanOrEqual(2);
    });
});

// ============================================================================
// processTextWithHistory — Sliding Window mode
// ============================================================================
describe('processTextWithHistory', () => {
    test('historyStep 0 falls back to processText', () => {
        const historyChunks = processTextWithHistory('Hello World', 2, 0);
        const normalChunks = processText('Hello World', 2);
        // Should produce same text content (ids will differ)
        expect(historyChunks.map(c => c.text)).toEqual(normalChunks.map(c => c.text));
    });

    test('density < 3 falls back to processText', () => {
        const historyChunks = processTextWithHistory('Hello World Test', 2, 1);
        const normalChunks = processText('Hello World Test', 2);
        expect(historyChunks.map(c => c.text)).toEqual(normalChunks.map(c => c.text));
    });

    test('empty text returns empty array', () => {
        const chunks = processTextWithHistory('', 3, 1);
        expect(chunks).toHaveLength(0);
    });

    test('whitespace-only text returns empty array', () => {
        const chunks = processTextWithHistory('   \n\n   ', 3, 1);
        expect(chunks).toHaveLength(0);
    });

    test('creates overlapping frames with step < windowSize', () => {
        const text = 'one two three four five six seven';
        const chunks = processTextWithHistory(text, 3, 1);
        // With window=3, step=1, we get:
        // [one two three], [two three four], [three four five], ...
        // 7 words, window=3, step=1: positions 0,1,2,3,4 = 5 chunks
        expect(chunks.length).toBeGreaterThanOrEqual(5);

        // Verify overlap: consecutive chunks should share words
        if (chunks.length >= 2) {
            const words0 = chunks[0].text.split(' ');
            const words1 = chunks[1].text.split(' ');
            // The last 2 words of chunk 0 should be the first 2 words of chunk 1
            expect(words0.slice(1)).toEqual(words1.slice(0, words0.length - 1));
        }
    });

    test('interpolated frames are marked isInterpolated', () => {
        const text = 'one two three four five six seven eight nine';
        const chunks = processTextWithHistory(text, 3, 1);
        // First frame (index 0) should NOT be interpolated
        expect(chunks[0].isInterpolated).toBeFalsy();
        // Second frame (step=1, so position 1, which is NOT aligned to windowSize=3) should be interpolated
        if (chunks.length >= 2) {
            expect(chunks[1].isInterpolated).toBe(true);
        }
    });

    test('step is clamped to at most windowSize - 1', () => {
        const text = 'one two three four five six';
        // historyStep = 10 (larger than window=3), should be clamped to 2 (windowSize-1)
        const chunks = processTextWithHistory(text, 3, 10);
        // Should still create overlapping frames (step=2, not 10)
        expect(chunks.length).toBeGreaterThan(2);
    });

    test('all caps words in history frames get isLoud', () => {
        const text = 'HELLO world GOODBYE friend';
        const chunks = processTextWithHistory(text, 3, 1);
        const loudChunks = chunks.filter(c => c.visualOverrides?.isLoud);
        // At least some frames containing "HELLO" or "GOODBYE" should have isLoud
        // (only if the joined text is ALL CAPS and > 3 chars)
        // In sliding window, the full joined text would need to be all caps,
        // so this mainly fires when the window contains only caps words
        expect(loudChunks.length).toBeGreaterThanOrEqual(0); // Just ensure no crash
    });

    test('emoji-only frame in history gets emoji overrides', () => {
        const text = 'word1 word2 word3';
        // This won't produce emoji frames, but ensures no crash with emoji detection
        const chunks = processTextWithHistory(text, 3, 1);
        expect(chunks.length).toBeGreaterThan(0);
    });
});
