# @andyed/kinetic-type-engine

Composable physics primitives for kinetic typography — text segmentation, line breaking, optimal-recognition-point math, per-chunk timing, trail kinematics, layout-safety zoom limits, font metrics. Brand-neutral by design.

Extracted from [iBlipper](https://iblipper.com), the motion-type synthesizer. The engine ships the math that any kinetic-typography system needs; **named emotion recipes** (`emphatic`, `hurry`, `playful`, …) live in consumers, not here, because rehearsed rhetorical vocabulary is brand IP, not public-good math.

## Status

**v0.1.0** — first publish. Public surface is the union of every module's exports; expect refinement in 0.2 once consumers hit the API in production.

## Install

```bash
npm install @andyed/kinetic-type-engine
```

## Use

```ts
import {
  processText,           // text → presentation chunks
  applySmartLineBreaks,  // text → multi-line layout under width budget
  calculateFrameDuration,// per-chunk display duration
  getSafeZoom,           // max zoom that keeps text on screen
  smartChunkWithNLP,     // chunk text using grammatical phrase boundaries
} from '@andyed/kinetic-type-engine';

// RSVP: split a passage into chunks for serial presentation
const chunks = processText('The quick brown fox jumps over the lazy dog.', 2);

// For each chunk, compute display duration at 600 WPM
const durations = chunks.map(c => calculateFrameDuration(c, 600));

// Multi-line layout: break a long line under a max-width budget
const wrapped = applySmartLineBreaks(
  'EXPRESSION',
  /* maxWidth */ 720,
  /* fontSize */ 96,
);
```

## Modules

| Module | Role |
|---|---|
| `chunking` | Text → chunk segmentation. Density-aware, emoji-safe, preserves visual overrides. |
| `constants` | Shared timing/normalization constants. |
| `fonts` | Font-stack metrics + per-font character-width factors. |
| `layoutSafety` | `getSafeZoom()` — geometric + motion-overhead zoom limits. |
| `lineBreaking` | `applySmartLineBreaks`, `willTextWrap`, `calculateTargetCharsPerLine`. |
| `nlp` | `smartChunkWithNLP` — phrase-boundary chunking via [compromise](https://github.com/spencermountain/compromise). |
| `timingModel` | `calculateFrameDuration`, `getAnimationPhases`. |
| `trailModes` | Trail/blur kinematics primitives. |

## What's not here

- **Optimal-recognition-point (ORP) and Bouma-offset math** are RSVP-specific (rapid serial visual presentation — the iBlipper reader's core technique) and stay in [iBlipper](https://github.com/andyed/iblipper2025) as proprietary. The engine ships the kinetic-typography primitives shared across all consumers; ORP is an iBlipper-specific reading optimization.
- **Named emotion recipes** (`emphatic`, `hurry`, `playful`, …) are curated rhetorical vocabulary and live in iBlipper. Compose your own from the primitives here.

## License

MIT. See [LICENSE](LICENSE).

## Lineage

Carved out of iBlipper's `src/engine/` per the [extraction spec](https://github.com/andyed/iblipper2025/blob/main/docs/kinetic_type_engine_extraction_spec.md). The product (React + Capacitor + IAP + share-by-URL viral loop + curated emotion vocabulary + RSVP/ORP reader) stays at [iblipper2025](https://github.com/andyed/iblipper2025). The shared math is here.
