# state.md

## Task
V2.1.5 — five panel-polish items implemented; UI migrated to figui3 (Figma plugin component library). Diagnostic [MB3K] logs still in; strip after sign-off.

## figui3 migration (V2.1.5+)
- Vendored `vendor/fig.css` (~103 KB) + `vendor/fig.js` (~248 KB) from unpkg
  (network-blocked manifest requires local files)
- All custom-styled controls replaced with figui3 web components:
  - `<fig-button>` — primary/secondary/ghost variants
  - `<fig-segmented-control>` + `<fig-segment>` — layout modes
  - `<fig-slider text="true" units="px">` — gap, margin, rounding
  - `<fig-dropdown>` — page size preset
  - `<fig-input-color text="true">` — background color
  - `<fig-header>` — section headings
  - `<dialog is="fig-toast">` — replaces inline snackbar
- Custom CSS reduced to layout-only (panel scroll, image management, thumb strip)
- `settings` state object is the source of truth at click time; updated via component `input`/`change` events
- `applyLayoutLock()` toggles `.locked` class on `fig-segmented-control` and sets its `value` attribute
- Theme follows Figma's `--figma-color-*` tokens automatically

## V2.1.5 changes shipped

### 1. Refresh / Add Selected consolidation
- `↺ Refresh` → `+ Add Selected` (renamed)
- `+ Upload images` → `+ Upload Files` (renamed)
- Both buttons paired below the thumb strip in `.images-actions`
- Top header now: `[count] [Clear]` only

### 2. Image frame controls removed
- "Image Frame" section deleted entirely (Color + Padding rows gone)
- Rounding row moved to the Layout section under Margin
- code.js buildMoodboard hardcodes: `cellPadding = 0`, `cellFrame.fills = []`
- UI no longer sends cellPadding/cellBgColor in config (no dead schema)
- handleReRoll's cfg construction also dropped these fields
- Verified: zero references to cellPadding/cellBgColor in any algorithm file

### 3. Corner Rounding placement
- Now in Layout section, third row under Gap and Margin

### 4. Button color states
- CSS state classes: `.btn-state-fit` (orange), `.btn-state-shuffle` (green)
- Default (no class) = blue (Generate 3000)
- `:disabled` overrides all (gray, "Engage 3000")
- `getButtonState()` returns `cssState`; `updateGenerateBtn()` toggles class

### 5. Frame resize → Fit to Frame
- Marker schema gained `width` + `height` fields (rewritten on every generate / re-roll)
- `isResizedMb3k()` UI helper compares marker w/h to current frame w/h, ±1px tolerance
- `getButtonState()` branches:
  - MB3K + dims match → `Shuffle 3000`, green
  - MB3K + dims differ → `Fit to Frame`, orange
  - Non-MB3K frame → `Fit to Frame`, orange (V2.1 BYO behavior)
  - No frame, panel ≥5 → `Generate 3000`, blue
  - Else → `Engage 3000`, gray, disabled
- `applyLayoutLock()` releases (panel mode wins) when frame is resized
- code.js `figma.on('documentchange', ...)` watches for width/height changes on the selected frame and re-fires `postSelectionState()` so the button flips live during a corner-drag resize
- Fit-on-resized-MB3K dispatch: `re-roll` message with `overrideMode = currentLayout` field
- `handleReRoll` accepts `overrideMode`: skips Fisher-Yates pre-shuffle and gates `buildMoodboard`'s `reroll` flag to false → deterministic re-fit (no Editorial family/seed randomization)
- Old markers without w/h fall through to Shuffle (current behavior)
- Status text differentiated: `Shuffled!` / `Fitted to frame!` / `Moodboard created!`

## Files changed this session
- `ui.html` — button color state CSS, header reorganization, removed Image Frame section, added Rounding to Layout section, removed cell-padding/cell-color JS hooks, `isResizedMb3k`, extended `getButtonState` + `updateGenerateBtn` + `applyLayoutLock`, rewrote generate click handler with three-way dispatch, added "Fitted to frame!" status case
- `code.js` — `documentchange` listener, hardcoded cell defaults in `buildMoodboard`, marker schema +w/h, `handleReRoll` signature gained `overrideMode` param + variance gating, `re-roll` message dispatch forwards `overrideMode`

## Test plan for V2.1.5

For each of the 4 modes (grid / editorial / masonry / cluster):

1. **Generate** — pick mode, ≥5 images, click `Generate 3000` (blue). Frame creates. After done, button auto-flips to `Shuffle 3000` (green). Mode-lock visible.
2. **Shuffle** — click `Shuffle 3000`. Layout varies. Status: "Shuffled!"
3. **Resize-down** — drag a corner of the frame inward. **Live**: button should immediately flip to `Fit to Frame` (orange). Mode-lock should release (control unlocks; active highlight matches panel currentLayout).
4. **Fit** — click `Fit to Frame`. Layout re-flows into new dims. Status: "Fitted to frame!" After done, button flips back to `Shuffle 3000` (green); mode-lock returns at the panel's mode (which becomes the new marker's mode).
5. **Resize-back** — drag frame back to within ±1px of the new "original" dims. Button returns to `Shuffle 3000`.
6. **Mode swap then Fit** — resize MB3K frame, change panel mode in segmented control (now unlocked), click `Fit to Frame`. New layout in new mode. Marker rewritten with new mode + new w/h.
7. **Crop fidelity** — generate with cropped canvas selections, resize, Fit to Frame. Crops still preserved.
8. **Non-MB3K Fit** — select a regular Figma frame (no marker), put ≥5 images in panel, click `Fit to Frame` (orange). Cells append into frame (V2.1 BYO behavior preserved).
9. **Generate fresh** — no frame selected, ≥5 images. Click `Generate 3000` (blue). New frame.
10. **Header buttons** — verify `+ Upload Files` and `+ Add Selected` work as before; `Clear` still in top right.

After all pass, strip `[MB3K]` diagnostic logs and close V2.1.5.

## Out of scope (V2.2+)
- Image area resizing / wrapping
- Snackbar / dialog placement
- Editorial: aspect-aware subdivision strategy (extreme tall canvases still produce strips)
- Frame + canvas selection: auto-import
- Preset library expansion
- Re-flow existing (non-MB3K) frame contents
- Auto-layout integration, per-image overrides, locked cells, content-weight balancing, video, drag-to-import, right-click run
- Multi-file upload regression
