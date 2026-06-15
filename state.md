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

## Current task: Slides support — one board → one slide

**Goal:** make the plugin run in Figma Slides and drop a single moodboard onto a
slide, sized to the slide. Minimal port — reuse the existing layout engine.

**Insertion points (confirmed):**
- `manifest.json` — add `"slides"` to `editorType` (currently `["figma"]`).
- `code.js` `buildMoodboard` (~534) — the `targetFrame` path already sizes the
  layout to `Math.round(targetFrame.width/height)` (code.js:544-545) instead of
  the page-size `preset`. Treat the slide as the target container → layout
  engine works unchanged.
- `code.js` ~602-603 — `figma.createFrame()` + `figma.currentPage.appendChild`
  does NOT produce a top-level board in Slides (page children there are
  SlideNodes). Branch container creation on `figma.editorType === 'slides'`.
- UI: page-size preset is **inert** in Slides (slide size is fixed by the deck,
  commonly 1920×1080) — hide/disable it when running in Slides.

**Verify before building (Slides API is newish — confirm, don't trust recall):**
- `figma.createSlide()` exists + signature; whether the focused/selected slide
  is reachable.
- Whether a SlideNode accepts `appendChild` of plain frames, supports `.fills` /
  `.clipsContent`, and whether it's resizable (expected NOT — that's why preset
  is inert; confirm).
- That `editorType: ["figma","slides"]` coexists with
  `documentAccess: "dynamic-page"`.

**Default placement:** new slide (or the focused slide if it's empty).

## Out of scope (this task)
- Multi-slide deck / one-image-per-slide slideshow generator.
- Export existing canvas moodboard → slides.
