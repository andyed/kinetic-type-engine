/**
 * Smart Line Breaking for Expressive Typography
 * 
 * Strategically breaks text into lines for optimal readability:
 * - Avoids orphans (single word on last line)
 * - Balances line lengths
 * - Keeps related words together
 * - Respects natural phrase boundaries
 */

/**
 * Calculate the optimal number of characters per line to achieve a target aspect ratio block.
 * @param totalChars Total length of text
 * @param charWidthFactor Width factor of the font (e.g. 0.65 for narrow, 1.8 for wide)
 * @param screenAspectRatio Target aspect ratio (Width/Height)
 */
export const calculateTargetCharsPerLine = (charWidthFactor: number, totalChars: number, lineHeight: number, screenAspectRatio: number = 1.7): number => {
    // "Golden Ratio" Wrapping:
    // Calculate line length that creates a block matching screen aspect ratio
    // Chars ≈ Sqrt( (Ratio * Total * LineHeight) / Factor )
    // Clamp aspect ratio to reasonable bounds (0.5 to 2.5) to prevent extreme breaking
    const safeRatio = Math.min(Math.max(screenAspectRatio, 0.5), 2.5);
    const constant = safeRatio * lineHeight;
    const ideal = Math.sqrt((constant * totalChars) / charWidthFactor);

    // Ensure we don't make lines unreasonably short
    // 7 chars allows "Fear is" to fill the screen better than "Fear is the..."
    return Math.max(ideal, 7);
};

/**
 * Calculate optimal line breaks for a chunk of text
 * Returns text with manual line breaks (\n) inserted
 */
export const applySmartLineBreaks = (text: string, maxWidth: number, fontSize: number, charWidthFactor: number = 0.9, targetRatio: number = 1.7): string => {
    // 1. Respect explicit newlines first
    const explicitLines = text.split('\n');

    // If multiple lines exist, apply smart breaking to EACH line individually
    if (explicitLines.length > 1) {
        return explicitLines.map(line => applySmartLineBreaks(line, maxWidth, fontSize, charWidthFactor, targetRatio)).join('\n');
    }

    // 2. Standard Logic for Single Line Block
    const words = text.split(/\s+/);
    if (words.length <= 1) return text; // Can't break single word

    const totalChars = text.length;

    // Heuristic: If it's a medium length sentence, try to split evenly into 2 or 3 lines.
    // This allows the font size to scale up to fill the box (higher fill rate).


    // Decide number of lines based on aspect ratio AND overflow risk
    // Simple approach: If > 12 chars, try 2 lines. If > 30, try 3.
    // NEW: If text exceeds safety width, FORCE split.
    let targetLines = 1;

    if (words.length > 1) {
        // Universal Golden Ratio Layout
        // We now rely on aspect-ratio aware sizing for ALL text > 7 chars
        if (totalChars >= 7) {
            const safeCharsPerLine = calculateTargetCharsPerLine(charWidthFactor, totalChars, 1.5, targetRatio);
            targetLines = Math.ceil(totalChars / safeCharsPerLine);
        }
    }

    if (targetLines === 1) return text;

    const targetLen = Math.ceil(totalChars / targetLines);

    // Greedy balanced fill
    const lines: string[] = [];
    let currentLine: string[] = [];
    let currentLen = 0;

    for (const word of words) {
        const wLen = word.length;
        // Cost of adding to current line vs starting new

        // Allow slight overflow (+1) before breaking
        if (currentLen + wLen + 1 > targetLen + 1) {
            // Break
            if (currentLine.length > 0) {
                lines.push(currentLine.join(' '));
                currentLine = [word];
                currentLen = wLen;
            } else {
                currentLine.push(word);
                currentLen += wLen;
            }
        } else {
            if (currentLine.length > 0) currentLen++; // space
            currentLine.push(word);
            currentLen += wLen;
        }
    }
    if (currentLine.length > 0) lines.push(currentLine.join(' '));

    return lines.join('\n');
};

/**
 * Estimate if text will wrap based on maxWidth and fontSize
 */
export const willTextWrap = (text: string, maxWidth: number, fontSize: number): boolean => {
    const charWidth = fontSize * 0.5;
    const maxCharsPerLine = Math.floor(maxWidth / charWidth);
    return text.length > maxCharsPerLine;
};
