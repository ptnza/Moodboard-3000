# state.md

## Current version: v3.0 (shipped publicly)

v3.0 = video support + focal-point face-aware cropping + JPG thumbnail strip +
remix-on-frame-contents, layered on top of the V2.1.5 figui3 UI migration.

### Version history reconciliation (done 2026-06-15)
- HEAD `8a23420 checkpoint: pre-portrait-editorial branch` = **V2.1.5** (figui3
  migration committed; no video/focal code).
- The v3.0 feature work shipped publicly but was **never committed** — it lived
  only in the working tree, and state.md was never advanced past V2.1.5.
- This session: stripped the 2 remaining `[MB3K]` diagnostic log prefixes
  (kept the error logging, matched the un-prefixed house style), added
  `.gitignore` for `*.backup*`/`backups-log*` scratch files, and committed the
  working tree as the **v3.0 baseline**.

### What v3.0 added (over V2.1.5)
- **Video support** — detects `VIDEO` fills, stores `videoHash`; video cells
  skip focal detection (center-crop only); re-clones the source node on remix
  (source must remain on canvas — see `code.js` "v3.0 limitation" note).
- **Focal-point face-aware cropping** — pico face cascade (inlined verbatim into
  `ui.html` from `vendor/pico/`; cascade base64-inlined). Stamps normalized
  `focal:{x,y}` per image; builds a CROP `imageTransform` that keeps faces in
  frame. Skipped for user-cropped and video sources.
- **`fillType` in marker schema** (`mb3k_src`) — IMAGE/VIDEO; backward-compat
  default `IMAGE` for pre-v3.0 frames.
- **JPG thumbnail strip** — 80px `exportAsync` panel thumbnails (image + video).
- **Remix-on-frame-contents** + applies panel bg color to MB3K frames.

### vendor/ provenance
- `vendor/fig.css` + `vendor/fig.js` — figui3 (tracked since V2.1.5).
- `vendor/pico/{pico.js, facefinder.b64.js}` — source of the inlined face
  detector. NOT a runtime dependency (manifest `networkAccess: none`, all
  inlined). Tracked for regeneration provenance.

---

## Current task: Slides support — one board → one slide (IMPLEMENTED, uncommitted)

**Goal:** make the plugin run in Figma Slides and drop a single moodboard onto a
slide, sized to the slide. Minimal port — reuses the existing layout engine.

**Slides API verified (developers.figma.com, 2026-06-15):**
- `figma.editorType` → `'slides'` in the Slides editor.
- `figma.createSlide(row?, col?)` → SlideNode (appends to end by default; Slides-only).
- `figma.currentPage.focusedSlide` → `SlideNode | null` (null unless single-slide view).
- SlideNode: fixed **1920×1080**, width/height **read-only** (no `resize()`),
  supports `appendChild`, settable `fills` / `clipsContent`, inherits
  `setPluginData`. `editorType:["figma","slides"]` is fine with `dynamic-page`.

**Architecture (slide is the PAGE, board is a FRAME on it):**
The Slides branch no longer appends cells onto the SlideNode. It ALWAYS adds a new
slide via `createSlide()` (no empty-slide reuse), clears its template children,
then creates a **full-bleed FRAME** at the slide origin sized to the slide and
passes THAT frame through the existing `targetFrame` seam. Consequences:
`buildMoodboard` writes the mb3k marker onto the **frame** (not the slide), so
Remix / Fit-to-Size work in Slides with no special-casing — they operate on a real
frame container.

**Decision (2026-06-15): Slides always creates a new slide — no empty-slide
reuse.** This retired the placeholder-detection problem (Fix 2) entirely — no need
to tell a template placeholder from real content. The `dumpFocusedSlideChildren`
diagnostic and the focused-slide-name readout were removed.

**Changes made (all uncommitted; v3.0 baseline = e33ce6f):**
- `manifest.json` — `editorType: ["figma","slides"]`.
- `code.js:11,60` — init message carries `editorType: figma.editorType`.
- `code.js` `handleGenerate` (Slides branch) — `var slide = figma.createSlide()`
  always; build the board into a full-bleed frame on it (see Architecture).
- `code.js` `getSlideTargetInfo()` + `firstSlideInDeck()` — supply deck dims only
  ({width, height}); sent in `postSelectionState`. Dims read from a real slide via
  `getSlideGrid()` (1920×1080 fallback).
- `code.js` `refresh-selection` — re-posts selection state (manual readout refresh).
- `ui.html` — `slideTarget` from `selection-state`; readout always `New Slide · WxH`.
- `ui.html` — image-strip empty state, two lines (default `var(--spacer-1)` gap),
  both inherit 11px from `.thumb-empty`: line 1 "Select images on canvas, then +"
  in `<fig-shimmer id="empty-shimmer">` (shimmers on thumbStrip hover); line 2
  "or drag images from desktop" is a plain span (no shimmer) with `.subtle`
  (tertiary color) — de-emphasis by contrast only, same size as line 1.
- `ui.html` — status toast (`#status-toast`): hugs text (shrink-to-fit) with
  `max-width: 180px` + `height: auto` so longer messages wrap instead of growing
  wide or clipping. `setStatus(msg, type, duration)` sets per-call dwell (default
  2s); the "Drag-ins scaled to {MAX_COMPRESS_DIM}px max." upload notice uses 3s.

**RESOLVED in-Figma (2026-06-15):** selecting the board frame in single-slide view
DOES surface it as `type === 'FRAME'` in `currentPage.selection` — **Remix/Re-roll
and Fit confirmed working in Slides.** The frame-on-slide architecture is validated.

**Known, accepted behavior:**
- `createSlide()` appends to the END of the deck → the new slide lands last, not
  next to where the user was. Inherent to the API.

**Shipped in ac310d8** — merged to main (Slides Remix/Fit confirmed in-Figma).

## Out of scope (this task)
- Multi-slide deck / one-image-per-slide slideshow generator.
- Export existing canvas moodboard → slides.
