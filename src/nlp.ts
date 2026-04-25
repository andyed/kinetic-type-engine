import nlp from 'compromise';
import type { Chunk, VisualOverrides } from './chunking';
import { FONTS } from './fonts';

/**
 * NLP-enhanced text processing.
 * Uses 'compromise' to split text into semantic phrases (clauses, sentence fragments)
 * rather than arbitrary word counts.
 */

// Define overrides for basic NLP tagging to better suit our visual needs
// e.g., ensure "New York" is one chunk.
nlp.plugin({
    words: {
        'i ching': 'Noun', // cluster this
        'et cetera': 'Condition'
    }
});


const processClause = (text: string, chunks: Chunk[]) => {
    // 1. Clean trim
    let cleanText = text.trim();
    if (!cleanText) return;

    const visualOverrides: VisualOverrides = {};
    let durationScale = 1.0;

    // 2. Analyze Content using NLP
    const doc = nlp(cleanText);

    // KEYWORD DETECTION
    // If it's a Question?
    if (doc.questions().found) {
        visualOverrides.transition = 'orbit';
        durationScale = 1.2;
    }
    // If it's an Imperative (Command)? e.g. "Do it now"
    else if (doc.match('#Imperative').found) {
        visualOverrides.isLoud = true; // Bold/Large
        visualOverrides.transition = 'zoom_in';
        durationScale = 1.3;
    }

    // ENTITY RECOGNITION (Person, Place, Organization)
    // We can give them a distinct color or font?
    if (doc.people().found || doc.places().found || doc.organizations().found) {
        // visualOverrides.color = '#ffcc00'; // Maybe? Or too opinionated?
        // Let's just slightly zoom
        visualOverrides.zoom = 1.1;
    }

    // EMOTION / SENTIMENT (Rudimentary)
    // Compromise doesn't do deep sentiment, but we can look for "adverbs" or specific patterns.

    // TEXT CLEANUP (Quotes, etc) - Reuse logic from basic chunking?
    // For now, simple quote stripping
    if (/^[“"']/.test(cleanText) || /[”"']$/.test(cleanText)) {
        if (/^[“"']/.test(cleanText)) visualOverrides.quoteStart = true;
        if (/[”"']$/.test(cleanText)) visualOverrides.quoteEnd = true;

        cleanText = cleanText.replace(/^[“"']/, '').replace(/[”"']$/, '');
    }

    // Smart-Quote asterisk handling (*I Ching*)
    if (cleanText.startsWith('*') && cleanText.endsWith('*')) {
        visualOverrides.fontUrl = FONTS.LORA_ITALIC;
        visualOverrides.zoom = 0.85;
        cleanText = cleanText.slice(1, -1);
    }

    // Duration Logic based on length
    // NLP gave us a clause, so it's a natural duration unit.
    // Just add base time per word.
    const terms = doc.terms().length;
    durationScale = 0.5 + (terms * 0.2);
    if (terms === 1) durationScale = 0.8; // Single word emphasis

    chunks.push({
        id: crypto.randomUUID(),
        text: cleanText,
        durationScale,
        visualOverrides
    });
};


export const smartChunkWithNLP = (text: string, maxWordsPerFrame?: number): Chunk[] => {
    const doc = nlp(text);
    const chunks: Chunk[] = [];

    // Respect explicit low-density settings (1-2 words per frame)
    // These should NOT use semantic chunking - they need strict word limits
    const useLowDensityMode = maxWordsPerFrame !== undefined && maxWordsPerFrame <= 2;

    // For density > 3, fill toward that target across clause boundaries
    const useMaxWordLimit = maxWordsPerFrame !== undefined && maxWordsPerFrame > 3;

    // Target words: explicit low (1-2), high (4+), or default semantic (3)
    const targetWords = useLowDensityMode
        ? maxWordsPerFrame
        : (useMaxWordLimit ? maxWordsPerFrame : 3);

    // LOW DENSITY MODE (1-2 words): Strict word splitting, bypass semantic chunking
    // Still apply NLP analysis for visual overrides
    if (useLowDensityMode) {
        // Respect manual newlines as hard frame breaks
        const lines = text.split(/\n+/);

        for (const line of lines) {
            const words = line.trim().split(/\s+/).filter(w => w.length > 0);
            if (words.length === 0) continue;

            let buffer: string[] = [];

            for (let i = 0; i < words.length; i++) {
                const word = words[i];
                buffer.push(word);

                // Flush condition
                if (buffer.length >= targetWords) {
                    // Optimization: Avoid orphaned short words IF they are on the same line
                    // If the buffer text is <= 3 chars, try to grab one more word.
                    const currentText = buffer.join(' ');
                    const isShort = currentText.length <= 3;
                    const hasMoreWordsInLine = i < words.length - 1;

                    if (isShort && hasMoreWordsInLine) {
                        const nextWord = words[i + 1];
                        // Only group if the NEXT word is also short (<= 3 chars).
                        // Prevents "to iBlipper" (Short + Long) but allows "to add" (Short + Short).
                        if (nextWord.length <= 3) {
                            continue; // Skip flush, keep accumulating
                        }
                    }

                    processClause(currentText, chunks);
                    buffer = [];
                }
            }
            // Flush remaining for this line
            if (buffer.length > 0) {
                processClause(buffer.join(' '), chunks);
            }
        }
        return chunks;
    }

    // When density > 3, we want to fill up to that limit across clause boundaries
    if (useMaxWordLimit) {
        // More aggressive: Try to fill frames with multiple clauses to reach target
        const clauses = doc.clauses().out('array');
        let buffer: string[] = [];

        for (let idx = 0; idx < clauses.length; idx++) {
            const clauseText = clauses[idx];
            // Use consistent word counting (split by whitespace, not NLP terms)
            const clauseWords = clauseText.split(/\s+/).filter((w: string) => w.length > 0).length;
            const isLastClause = idx === clauses.length - 1;

            // If this clause alone exceeds target, try to split it at natural break points
            if (clauseWords > targetWords) {
                // Flush current buffer first
                if (buffer.length > 0) {
                    processClause(buffer.join(' '), chunks);
                    buffer = [];
                }

                // Try to split at conjunctions and other natural break points
                // Split before: and, but, or, to, there, then, when, where, while, that, which
                const parts = clauseText.split(/\s+(?=and\b|but\b|or\b|to\b|there\b|then\b|when\b|where\b|while\b|that\b|which\b)/i);
                let subBuffer: string[] = [];

                for (let i = 0; i < parts.length; i++) {
                    const part = parts[i].trim();
                    if (!part) continue;

                    const partWords = part.split(/\s+/).filter((w: string) => w.length > 0).length;
                    const currentSubWords = subBuffer.join(' ').split(/\s+/).filter((w: string) => w.length > 0).length;

                    // Would adding this part exceed target significantly?
                    if (subBuffer.length > 0 && currentSubWords + partWords > targetWords * 1.2) {
                        // Flush what we have
                        processClause(subBuffer.join(' '), chunks);
                        subBuffer = [part];
                    } else {
                        subBuffer.push(part);
                    }

                    // Also flush if we've reached target or this is the last part
                    const subWords = subBuffer.join(' ').split(/\s+/).filter(w => w.length > 0).length;
                    if (subWords >= targetWords || i === parts.length - 1) {
                        if (subBuffer.length > 0 && subBuffer.join(' ').trim()) {
                            processClause(subBuffer.join(' '), chunks);
                            subBuffer = [];
                        }
                    }
                }
                continue;
            }

            // Try to add this clause to buffer
            buffer.push(clauseText);
            const newBufferWords = buffer.join(' ').split(/\s+/).filter(w => w.length > 0).length;

            // Should we flush? Only if:
            // 1. We've reached/exceeded target, OR
            // 2. Adding the NEXT clause would push us way over, OR  
            // 3. This is the last clause
            let shouldFlush = false;

            if (newBufferWords >= targetWords) {
                shouldFlush = true;
            } else if (isLastClause) {
                shouldFlush = true;
            } else {
                // Peek at next clause - would adding it exceed target by too much?
                const nextClause = clauses[idx + 1];
                if (nextClause) {
                    const nextClauseWords = nextClause.split(/\s+/).filter((w: string) => w.length > 0).length;
                    // If adding next would go more than 50% over target, flush now
                    if (newBufferWords + nextClauseWords > targetWords * 1.5) {
                        shouldFlush = true;
                    }
                }
            }

            if (shouldFlush && buffer.length > 0) {
                processClause(buffer.join(' '), chunks);
                buffer = [];
            }
        }

        // Flush any remaining
        if (buffer.length > 0) {
            processClause(buffer.join(' '), chunks);
        }
    } else {
        // Original semantic chunking for density <= 3
        const clauses = doc.clauses().out('array');

        clauses.forEach((clauseText: string) => {
            const subDoc = nlp(clauseText);
            const termCount = subDoc.terms().length;

            // If clause is short (<= 3 words) or is a special clustered entity, keep it whole
            if (termCount <= targetWords || (clauseText.startsWith('*') && clauseText.endsWith('*'))) {
                processClause(clauseText, chunks);
            } else {
                // Micro-Chunking: Break down longer clauses by Phrase (NP/VP)
                const phrases = subDoc.chunks().out('array');
                let buffer: string[] = [];

                phrases.forEach((phrase: string) => {
                    const pDoc = nlp(phrase);
                    const pLen = pDoc.terms().length;
                    const currentBufferLen = buffer.join(' ').split(/\s+/).filter(w => w.length > 0).length;

                    // Check if we should flush buffer
                    if (buffer.length > 0 && (currentBufferLen + pLen > targetWords)) {
                        processClause(buffer.join(' '), chunks);
                        buffer = [];
                    }

                    buffer.push(phrase);

                    // Flush if at target
                    if (buffer.join(' ').split(/\s+/).filter(w => w.length > 0).length >= targetWords) {
                        processClause(buffer.join(' '), chunks);
                        buffer = [];
                    }
                });

                // Flush remaining
                if (buffer.length > 0) {
                    processClause(buffer.join(' '), chunks);
                }
            }
        });
    }

    return chunks;
};

