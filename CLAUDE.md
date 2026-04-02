# Moodboard Maker — Figma Plugin

## Files
- `code.js` — plugin sandbox (`var`, no DOM, `figma` global)
- `ui.html` — plugin UI (iframe, `postMessage` to/from code.js)
- `manifest.json` — plugin metadata

## Skills (load on demand)
- Scattered Pack layout algorithm: `.claude/skills/scattered-pack-layout.md`

## Code style
- `code.js`: `var`, traditional functions
- `ui.html`: `const`/`let`, arrow functions
- No TypeScript, no framework, no bundler

## Key lines (code.js)
- `layoutEditorial18` (custom n=18): ~459
- `layoutEditorial`: ~510
- `layoutMasonry`: ~1400
- `layoutMosaic`: ~1450
- Message handler: search `onmessage`

## Git history
| Date | Commit | Summary |
|------|--------|---------|
| 2026-03-10 | c5e1bbf | Initial commit |
| 2026-03-16 | c517841 | Mosaic: MaxRects v2 with compositional scoring (3rd iteration) |
| 2026-03-16 | 5835005 | Mosaic: MaxRects v1 — variance [0.75–1.35], candidates A/B/C/D/E (2nd iteration) |
| 2026-03-16 | e8716b3 | Mosaic: MaxRects v2 with compositional scoring — restored from refinement prompt (3rd iteration) |
| 2026-03-16 | c21bc5f | Mosaic: fill full frame, consistent gaps, scale ±25%, fill-rect candidate |
| 2026-03-16 | a2f6185 | Mosaic: restore padding, flip scoring to prefer fill over waste, better crop/scale candidates |
| 2026-03-16 | 392ee60 | Mosaic: cluster-first layout — dense interior, organic edges, centered |
| 2026-03-16 | a967973 | Mosaic: center-seeded frontier growth — true cluster-based placement |

## Rules
- Minimal diffs — no unrelated refactors
- `code.js` ↔ `ui.html` via `figma.ui.postMessage` / `parent.postMessage` only
- Ask before major changes

## Session protocol
- Read `state.md` first — go directly to the file/line it specifies
- Do NOT explore the repo unless state.md is missing
- Before any edit: one sentence on cause and fix
- After progress: update state.md
