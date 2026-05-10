# Backlog

Living doc for Moodboard 3000. Tracks what's shipping next, what's still being figured out, and what's been deliberately set aside. All items target Season 2 unless noted.

**Status:** `Confirmed` · `Looking into` · `Suggested` · `Won't do`
**Priority:** `High` · `Medium` · `Low`

---

## Headliners

The four backbone items. These reshape what the plugin *is*. Everything else rides on top.

- [ ] **Bring your own frame** — pick any frame, fit the layout inside
- [ ] **Re-flow existing frame contents** — point at a frame, redistribute
- [ ] **Figma auto-layout integration** — output as auto-layout for post-gen editing
- [ ] **Contextual primary button** — "Engage 3000" relabels by selection state

---

## Confirmed

### Bring your own frame
**Priority:** High · **Type:** Feature

Pick an existing frame, fit the layout inside. The most-requested limitation fix. Reframe from fixed presets to Figma-native selection.

### Re-roll current layout
**Priority:** High · **Type:** Feature

Shuffle in place. Same images, same frame, new arrangement. No new frame spawned.

### Re-flow existing frame contents
**Priority:** High · **Type:** Feature

Point the plugin at a frame (yours or someone else's) and let it redistribute the contents.

> **Open question:** should it also accept images that already live inside a frame, not just selection? Probably yes — same mental model.

### Contextual primary button
**Priority:** High · **Type:** UX

"Engage 3000" relabels based on selection state: Generate / Fit to frame / Re-flow / Shuffle. Connective tissue for everything else in S2.

### Feedback intake system
**Priority:** High · **Type:** Infrastructure

Tally form, dedicated email, or public board. Not a plugin feature — but the backlog needs to stop living in tweet replies.

---

## Looking into

### Figma auto-layout integration
**Priority:** High · **Type:** Feature

Generate output as auto-layout frames so users can tweak gaps, padding, and resize without breaking the layout. Big UX win for post-generation editing.

> **Open question:** how well does auto-layout handle the more freeform modes (Editorial, Cluster)? Grid and Masonry are the easy wins.

### Per-image overrides (system)
**Priority:** High · **Type:** System

Once any per-image setting exists (aspect ratio, locked cells), add a small overrides panel: select an image, set properties.

Initial set:
- Preserve aspect ratio
- Set as hero (force largest cell)
- Lock position
- Exclude from re-roll

Builds the plumbing once, adds switches as needed.

> **Open question:** UI lives where? Right-click context menu, sidebar inspector, or modifier key + click?

### Locked cells
**Priority:** Medium · **Type:** Feature

Pin specific images in place while re-rolling the rest. Pairs naturally with re-roll. Requires per-cell state. Functionally a constraint on re-roll, not a separate feature.

---

## Suggested

### Preserve original aspect ratio
**Priority:** Medium · **Type:** Feature

Per-image opt-in. Tension with grid modes — needs UX thought for how it interacts with cell sizing. See Per-image overrides for the broader pattern.

### Content-weight balancing
**Priority:** Medium · **Type:** Algorithm

Plugin currently only understands geometry (aspect ratio). This adds awareness of *visual mass* — dark, dense, high-contrast images = heavy; light, airy, minimal = light. Layout engine uses weight as a placement constraint so heavy images anchor the composition instead of clumping.

- Cheap version: per-image average luminance
- Smarter version: luminance + contrast + edge density combined into a single weight score

> **Open question:** start cheap and see if the balancing actually reads visually before investing in the smarter version. May also want a manual "this one's the hero" override independent of the auto-balance pass.

### Change layout mode on existing output
**Priority:** Medium · **Type:** Feature

Swap Grid → Editorial on the same frame without regenerating from scratch. Pairs with Re-flow and Contextual button.

### Video support
**Priority:** Low · **Type:** Feature

Treat video frames as image equivalents. Figma supports video fills, so technically feasible. Question is whether it bloats scope.

---

## Won't do (yet)

*Empty for now. Reserved for requests that get declined, with reasoning attached, so they don't get re-litigated every two months.*

---

## S2 scope discipline

12 items is a lot for one release. Pick the 3–4 headliners (above), let the rest land in S2.x point releases. The headliners reshape the plugin's structure; everything else is a feature that rides on top of that new structure.
