// Engine-owned font URL table.
//
// The kinetic-type-engine ships a fixed set of font URLs and the chunker /
// timing primitives reach into this table directly. Brand vocabulary
// ('emphatic', 'hurry', ...) lives on the recipe side, but the underlying
// URLs are engine data — the engine knows which font to use for emoji-only
// text, italic-emphasized text, etc., and downstream recipes compose those
// choices into named emotions.
//
// The BASE prefix lets the engine work both inside Vite (where
// import.meta.env.BASE_URL resolves to the deployment base path) and in
// other contexts (Node, tests, direct imports — falls back to the iBlipper
// asset path so existing /public/fonts entries continue to resolve).
//
// Consumers outside iBlipper may want to override these URLs entirely;
// in v0.1 the table is constant and consumers should treat the URLs as
// defaults rather than canonical paths. A runtime override hook is
// planned for v0.2.

interface ImportMetaEnv {
    BASE_URL?: string;
}
const importMetaEnv: ImportMetaEnv | undefined =
    typeof import.meta !== 'undefined' ? (import.meta as { env?: ImportMetaEnv }).env : undefined;
const BASE = importMetaEnv?.BASE_URL ?? '/iblipper2025/';

export const FONTS = {
    INTER: `${BASE}fonts/Inter.woff`,
    ROBOTO_CONDENSED_ITALIC: `${BASE}fonts/RobotoCondensed-Italic.woff`,
    PLAYFAIR_DISPLAY: `${BASE}fonts/PlayfairDisplay.woff`,
    LORA_ITALIC: `${BASE}fonts/Lora-Italic.woff`,
    QUICKSAND: `${BASE}fonts/Quicksand-Regular.woff`,
    QUICKSAND_MEDIUM: `${BASE}fonts/Quicksand-Medium.woff`,
    ANTON: `${BASE}fonts/Anton.woff`,
    FREDOKA_ONE: `${BASE}fonts/FredokaOne.woff`,
    CHEWY: `${BASE}fonts/Chewy.woff`,
    RUBIK_MONO_ONE: `${BASE}fonts/RubikMonoOne.woff`,
    PATRICK_HAND: `${BASE}fonts/PatrickHand.woff`,
    // Monochrome Emoji font for 3D rendering
    NOTO_EMOJI: `${BASE}fonts/NotoEmoji-Regular.ttf`,
    SHARE_TECH_MONO: `${BASE}fonts/ShareTechMono-Regular.ttf`,
};
