# Visual and tech direction (2026-11-07)

TL;DR: React + CSS holds up, no canvas needed yet. One fix: navy buttons on the dark grey-green are only 1.23:1, so they sit on the cream panel or get a light border.

## Defaults we're taking

1. Vite + React 19 + plain CSS. Revisit PixiJS (`@pixi/react`, scoped to the scene area only) only for a specific effect like particles or shader flicker.
2. Fonts: IBM Plex Sans (variable) for dialogue, IBM Plex Mono for official records, self-hosted with `@fontsource`. Both cover latin, latin-ext, cyrillic, cyrillic-ext ([Fontsource](https://api.fontsource.org/v1/fonts/ibm-plex-sans)). IBM Plex Sans Arabic later. Self-hosting because Chrome partitions its HTTP cache, so Google Fonts gets no shared cache hit, and the PWA can precache them.
3. Tokens (WCAG ratios computed):

| Token | Hex | Use | Ratio |
|---|---|---|---|
| `--bg` | `#2F3A35` | grey-green surroundings | - |
| `--bg-2` | `#3E4A44` | raised dark surface | - |
| `--paper` | `#F2EBDD` | cards, documents | - |
| `--ink` | `#1F2328` | text on paper | 13.3 |
| `--muted` | `#5B6660` | secondary text on paper | 5.0 |
| `--navy` | `#1E2A3A` | buttons (on paper), paper text 12.2 | - |
| `--amber` | `#D9A441` on dark / `#8A5A00` on paper | warning | 5.3 / 5.0 |
| `--danger` | `#FF8A7A` on dark / `#A3262A` on paper | danger | 5.2 / 6.2 |

Red `#C0392B` on the dark bg fails (2.2), so dark surfaces use coral. Every status also gets a word and a shape (scrutiny pips + "Calm / Watchful / Suspicious"), never colour alone.

4. Animate only `transform` and `opacity` ([web.dev](https://web.dev/articles/animations-guide)). Fluorescent flicker = opacity of a tint overlay, at most 2 dips a second, under 5% opacity change, never red, so it stays well under the WCAG 2.3.1 flash threshold ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html)). Decorative motion sits behind `prefers-reduced-motion: no-preference` plus an in-game toggle.
5. Shell `height: 100svh`, `viewport-fit=cover` + `env(safe-area-inset-*)`, `touch-action: manipulation` (kills double-tap zoom, keeps pinch). Answer buttons 56px+ with 8px gaps, wrapping to 2 lines, never truncated.
6. Evidence bottom sheet on `<dialog>` with `showModal()`: focus trap, Esc, inert background, a visible close button, focus back to the Evidence button.
7. Translation room: German and Russian run ~35-40% longer, short strings far more ([W3C](https://www.w3.org/International/articles/article-text-size/index.en)). The question panel is the only flexible region, the scene image shrinks first. Test with a +40% pseudo-locale. CSS logical properties so RTL works later.

## Art (later stage)

- One approved master officer portrait, then attentive/concerned expressions as edits of it (FLUX.1 Kontext, or gpt-image-1 edits with `input_fidelity="high"`), not fresh generations ([Kontext paper](https://arxiv.org/html/2506.15742v2), [OpenAI cookbook](https://developers.openai.com/cookbook/examples/generate_images_with_high_input_fidelity)).
- One fixed style block in every prompt (palette hexes, "overhead fluorescent, cold", grain), one approved background as style reference, officers on flat backgrounds composited by us, one final colour-grade pass.
- Backgrounds 2:3 around 1080x1620, AVIF + WebP via `<picture>` and `srcset` 720w/1080w. Officers as transparent cut-outs.
- Copyright: prompts alone don't make you an author under the US Copyright Office Part 2 report (Jan 2025), compositing and editing can ([Copyright Alliance](https://copyrightalliance.org/ai-report-part-2-copyrightability/)). Assume raw images aren't protectable, check each tool's commercial terms.
- The strongest visual moment is the empty tray where your passport used to be.

Not checked: official Apple HIG / Material pages, official Midjourney docs, real file sizes.
