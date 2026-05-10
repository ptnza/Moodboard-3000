# Scattered Pack Layout — Figma Plugin Algorithm Spec
## `.claude/skills/scattered-pack-layout.md`

---

## Overview

This layout places variable-sized Figma nodes into a compact, organic arrangement with uniform gaps. No grid. No rows. No columns. Items nestle into available space like a tightly packed collage.

**Visual result:** Dense packing, uniform gutters, organic silhouette, largest items anchor the composition, smaller items fill gaps.

---

## Figma Plugin Architecture

Figma plugins have TWO execution contexts that communicate via message passing:

### `code.ts` (Plugin Sandbox)
- Has access to `figma.*` API (nodes, canvas, selection)
- Runs the layout algorithm
- Reads child node dimensions
- Sets node positions (`node.x`, `node.y`)
- Resizes parent frame
- NO DOM access

### `ui.html` (UI iframe)
- Standard HTML/CSS/JS (or framework)
- Renders plugin controls (gap slider, layout mode picker, etc.)
- NO access to `figma.*` API
- Communicates with code.ts via `parent.postMessage` / `figma.ui.onmessage`

### Message Flow for Scattered Pack

```
UI                                  CODE.TS
 │                                     │
 │  { type: 'run-layout',             │
 │    layout: 'scattered-pack',       │
 │    gap: 16 }                       │
 │ ──────────────────────────────────> │
 │                                     │  1. Read children from selected frame
 │                                     │  2. Extract { id, width, height } for each
 │                                     │  3. Run scatteredPackLayout(items, config)
 │                                     │  4. Apply positions: node.x = result.x, node.y = result.y
 │                                     │  5. Resize parent frame to fit
 │                                     │
 │  { type: 'layout-complete',        │
 │    itemCount: 35,                  │
 │    bounds: { w, h } }             │
 │ <────────────────────────────────── │
 │                                     │
```

---

## Data Structures (code.ts)

```typescript
// Input: extracted from Figma SceneNodes
interface LayoutItem {
  id: string;        // node.id
  width: number;     // node.width
  height: number;    // node.height
}

// Output: positions to apply back to nodes
interface PlacedItem {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// Internal: tracks empty space available for placement
interface FreeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Config from UI
interface ScatteredPackConfig {
  gap: number;          // uniform spacing (default: 16)
  canvasWidth: number;  // parent frame width constraint
}
```

---

## Algorithm: Maximal Rectangles with Best Short Side Fit

### Why This Algorithm

Claude Code has likely been trying physics simulations, force-directed layouts, or random-placement-with-collision-detection. Those all produce inconsistent spacing and are slow.

This algorithm is deterministic, fast, and produces the exact visual result needed: tight organic packing with uniform gaps.

### Step-by-Step

```
FUNCTION scatteredPackLayout(items: LayoutItem[], config: ScatteredPackConfig): PlacedItem[]

  STEP 1 — SORT BY AREA (DESCENDING)
    sorted = items.sort((a, b) => (b.width * b.height) - (a.width * a.height))
    
    WHY: Large items placed first create structural anchors.
    Small items then fill remaining gaps, producing the organic look.

  STEP 2 — INITIALIZE FREE SPACE
    freeRects = [{ x: 0, y: 0, width: config.canvasWidth, height: Infinity }]
    
    One giant free rectangle representing the entire available canvas.

  STEP 3 — FOR EACH ITEM IN SORTED ORDER:

    a) Calculate effective dimensions (item + gap padding):
       effW = item.width + config.gap
       effH = item.height + config.gap

    b) Score every free rectangle using BEST SHORT SIDE FIT:
       For each freeRect where effW <= freeRect.width AND effH <= freeRect.height:
         score = min(freeRect.width - effW, freeRect.height - effH)
       
       Pick the freeRect with the LOWEST score.
       
       WHY: This makes items gravitate toward spaces that closely 
       match their proportions — producing the "nestled" look.

    c) Place item at:
       x = bestFreeRect.x + (config.gap / 2)
       y = bestFreeRect.y + (config.gap / 2)
       
       The gap/2 offset centers the item within its effective footprint.

    d) Split the used free rectangle into remainders:
       
       The placed item (with effective dims) carves a hole in the free rect.
       This creates up to 2 new free rects: RIGHT and BOTTOM remainders.
       
       ┌──────────────────────┐
       │  ┌────────┐          │
       │  │ PLACED │  RIGHT   │
       │  │  ITEM  │ REMAINS  │
       │  └────────┘          │
       │                      │
       │   BOTTOM REMAINS     │
       └──────────────────────┘
       
       Choose split direction that maximizes the larger remaining area:
       
       OPTION A (horizontal split):
         RIGHT:  { x: itemRight, y: free.y, w: free.right - itemRight, h: free.height }
         BOTTOM: { x: free.x, y: itemBottom, w: free.width, h: free.bottom - itemBottom }
       
       OPTION B (vertical split):
         RIGHT:  { x: itemRight, y: free.y, w: free.right - itemRight, h: effH }
         BOTTOM: { x: free.x, y: itemBottom, w: free.width, h: free.bottom - itemBottom }
       
       Use whichever option produces the larger max(rightArea, bottomArea).

    e) Clip all existing free rects against the placed item's effective footprint:
       Any free rect that overlaps the placed item gets split into up to 4 
       non-overlapping sub-rects (left/right/top/bottom portions).
       
       Free rects fully inside the placed item are removed entirely.

    f) Prune degenerate free rects:
       Remove any with width < gap or height < gap (too small to place anything).
       Remove any fully contained within another free rect (redundant).

    g) If NO free rect fits the item:
       Expand: add new free rect at the bottom of all placed items.
       { x: 0, y: maxPlacedBottom + gap, w: canvasWidth, h: Infinity }
       Retry placement.

  STEP 4 — RETURN placed items array

END FUNCTION
```

---

## code.ts Implementation Structure

```typescript
// ============================================================
// SCATTERED PACK LAYOUT — code.ts
// ============================================================

// 1. ALGORITHM (pure function, no Figma API dependency)
//    This makes it testable independently.

function scatteredPackLayout(
  items: LayoutItem[],
  config: ScatteredPackConfig
): PlacedItem[] {
  // ... algorithm as specified above ...
}

// Helper: score a free rect for a given item
function scorePlacement(
  freeRect: FreeRect,
  effW: number,
  effH: number
): number {
  const leftoverW = freeRect.width - effW;
  const leftoverH = freeRect.height - effH;
  if (leftoverW < 0 || leftoverH < 0) return Infinity;
  return Math.min(leftoverW, leftoverH); // Best Short Side Fit
}

// Helper: clip a free rect against an occupied rect
// Returns 0-4 non-overlapping sub-rects
function clipFreeRect(
  free: FreeRect,
  occupied: FreeRect
): FreeRect[] {
  // If no overlap, return original
  // Otherwise split into left/right/top/bottom portions
  // ... see algorithm step 3e ...
}


// 2. FIGMA INTEGRATION (reads nodes, applies positions)

function runScatteredPack(gap: number): void {
  const selection = figma.currentPage.selection;
  if (selection.length !== 1 || selection[0].type !== 'FRAME') {
    figma.notify('Select a frame containing your moodboard items');
    return;
  }

  const frame = selection[0] as FrameNode;
  
  // IMPORTANT: Disable auto-layout so we can position freely
  frame.layoutMode = 'NONE';

  // Extract child dimensions
  const items: LayoutItem[] = frame.children
    .filter((node): node is SceneNode & { width: number; height: number } =>
      'width' in node && 'height' in node && node.visible
    )
    .map(node => ({
      id: node.id,
      width: node.width,
      height: node.height,
    }));

  // Run layout
  const config: ScatteredPackConfig = {
    gap,
    canvasWidth: frame.width,
  };
  const placed = scatteredPackLayout(items, config);

  // Apply positions to Figma nodes
  for (const p of placed) {
    const node = figma.getNodeById(p.id) as SceneNode;
    if (node && 'x' in node) {
      node.x = p.x;
      node.y = p.y;
    }
  }

  // Resize frame to fit content
  const maxX = placed.reduce((m, p) => Math.max(m, p.x + p.width), 0);
  const maxY = placed.reduce((m, p) => Math.max(m, p.y + p.height), 0);
  frame.resize(maxX + gap / 2, maxY + gap / 2);

  figma.ui.postMessage({
    type: 'layout-complete',
    itemCount: placed.length,
    bounds: { w: maxX + gap / 2, h: maxY + gap / 2 },
  });
}


// 3. MESSAGE HANDLER (bridge between UI and plugin logic)

figma.showUI(__html__, { width: 320, height: 480 });

figma.ui.onmessage = (msg: { type: string; [key: string]: any }) => {
  if (msg.type === 'run-layout' && msg.layout === 'scattered-pack') {
    runScatteredPack(msg.gap ?? 16);
  }
  // ... other layout modes ...
};
```

---

## ui.html Side (Relevant Parts Only)

The UI just needs to send the message. The algorithm runs entirely in code.ts.

```html
<script>
  // When user clicks "Apply" or changes gap slider:
  function applyLayout() {
    const gap = parseInt(document.getElementById('gap-slider').value);
    parent.postMessage({ 
      pluginMessage: { 
        type: 'run-layout', 
        layout: 'scattered-pack',
        gap: gap 
      } 
    }, '*');
  }

  // Listen for completion
  window.onmessage = (event) => {
    const msg = event.data.pluginMessage;
    if (msg?.type === 'layout-complete') {
      // Update UI with results
    }
  };
</script>
```

NOTE: If using a framework (React, etc.) in the UI, the postMessage pattern
is the same — just wrap it in your event handlers.

---

## Critical Figma API Notes

1. **`node.x` and `node.y` are relative to parent frame** — not absolute page position. This is what we want.

2. **Disable auto-layout first**: If the parent frame has `layoutMode` set to anything other than `'NONE'`, setting `node.x`/`node.y` won't work. Set `frame.layoutMode = 'NONE'` before positioning.

3. **Don't resize children**: The layout only repositions nodes. Never call `node.resize()` — preserve original dimensions.

4. **`node.width` / `node.height` are read-only on some node types** — use them for reading dimensions, never for setting. Use `node.resize(w, h)` only if you intentionally want to change size.

5. **Filter visible nodes only**: Skip `node.visible === false` children.

6. **Node types that have position**: `FrameNode`, `RectangleNode`, `EllipseNode`, `TextNode`, `GroupNode`, `ComponentNode`, `InstanceNode`, `VectorNode`, `StarNode`, `LineNode`, `PolygonNode`, `BooleanOperationNode`. All have `.x` and `.y`.

7. **Frame resize**: Use `frame.resize(newWidth, newHeight)` — not `frame.width = x`.

---

## Testing Checklist

After implementation, verify:

- [ ] No overlaps: for every pair of placed nodes, bounding boxes (including gap) don't intersect
- [ ] Uniform gaps: adjacent items have gap ±2px of config.gap
- [ ] Deterministic: same children + same config = same positions
- [ ] Frame resizes to fit content
- [ ] Works with mixed node types (frames, images, text, groups, components, instances)
- [ ] Works with 1 item, 5 items, 50+ items
- [ ] Handles items wider than canvasWidth gracefully
- [ ] Preserves original node dimensions (no accidental resize)
- [ ] Auto-layout is disabled on parent frame before positioning

---

## Prompt Template for Claude Code

```
Implement the Scattered Pack layout in the Moodboard 3000 plugin 
using the algorithm spec in .claude/skills/scattered-pack-layout.md

Structure:
- Pure layout function in src/layouts/scattered.ts (no Figma API imports)
- Figma integration in code.ts: read children, call layout, apply positions
- UI sends { type: 'run-layout', layout: 'scattered-pack', gap: number }

The layout function signature:
  function scatteredPackLayout(
    items: Array<{ id: string; width: number; height: number }>,
    config: { gap: number; canvasWidth: number }
  ): Array<{ id: string; x: number; y: number; width: number; height: number }>

Algorithm: Maximal Rectangles bin packing with Best Short Side Fit.
Items sorted largest-area-first. Uniform gap between all items.
See the skill file for complete step-by-step algorithm, 
free rectangle splitting logic, and Figma API integration details.
```
