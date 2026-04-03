// Moodboard Maker — code.js
// Plugin sandbox: has access to the figma global, no DOM.

figma.showUI(__html__, { width: 320, height: 620, title: 'Moodboard 3000', themeColors: true });

// Maps UI image IDs → Figma image hashes (populated as uploads are registered)
var imageRegistry = {};
// Holds partial chunk data while multi-chunk uploads are assembling
var chunkBuffers  = {};

figma.ui.postMessage({ type: 'init', images: extractSelectionImages() });
loadThumbsAsync(figma.currentPage.selection);

// ── Message handler ───────────────────────────────────────────────────────────
figma.ui.onmessage = async function(msg) {
  switch (msg.type) {
    case 'generate':
      await handleGenerate(msg.images, msg.config);
      break;
    case 'register-image':
      handleRegisterImage(msg);
      break;
    case 'refresh-selection':
      figma.ui.postMessage({ type: 'init', images: extractSelectionImages() });
      loadThumbsAsync(figma.currentPage.selection);
      break;
    case 'close':
      figma.closePlugin();
      break;
  }
};

// ── Selection image extraction ────────────────────────────────────────────────
// Fully synchronous — uses node dimensions directly, no async API calls.
function extractSelectionImages() {
  var results = [];
  var seen = new Set();
  var selection = figma.currentPage.selection;

  for (var ni = 0; ni < selection.length; ni++) {
    var node = selection[ni];
    if (!('fills' in node) || seen.has(node.id)) continue;
    seen.add(node.id);
    for (var fi = 0; fi < node.fills.length; fi++) {
      var fill = node.fills[fi];
      if (fill.type !== 'IMAGE' || !fill.imageHash) continue;
      results.push({
        hash:   fill.imageHash,
        nodeId: node.id,
        width:  node.width,
        height: node.height,
        name:   node.name,
        thumb:  null,
        imageTransform: fill.imageTransform || null,
        sourceScaleMode: fill.scaleMode || 'FILL',
      });
      break;
    }
  }
  return results;
}

// ── Async thumbnail loader ────────────────────────────────────────────────────
// Fires exportAsync for each selection node independently (fire-and-forget).
// Each thumb is sent to the UI as it resolves — never blocks init.
function loadThumbsAsync(selection) {
  var seen = new Set();
  for (var ni = 0; ni < selection.length; ni++) {
    var node = selection[ni];
    if (!('fills' in node) || seen.has(node.id)) continue;
    seen.add(node.id);
    for (var fi = 0; fi < node.fills.length; fi++) {
      var fill = node.fills[fi];
      if (fill.type !== 'IMAGE' || !fill.imageHash) continue;
      (function(nodeId, n) {
        n.exportAsync({ format: 'JPG', constraint: { type: 'WIDTH', value: 80 } })
          .then(function(bytes) {
            figma.ui.postMessage({ type: 'thumb-update', nodeId: nodeId, thumb: Array.from(bytes) });
          })
          .catch(function() {});
      })(node.id, node);
      break;
    }
  }
}

// ── Image registration (chunked upload from UI) ────────────────────────────────
function handleRegisterImage(msg) {
  var id = msg.id;

  if (msg.totalChunks === 1) {
    try {
      var hash = figma.createImage(new Uint8Array(msg.bytes)).hash;
      imageRegistry[id] = hash;
      figma.ui.postMessage({ type: 'image-registered', id: id, hash: hash });
    } catch (e) {
      figma.ui.postMessage({ type: 'image-register-error', id: id, message: String(e) });
    }
    return;
  }

  if (!chunkBuffers[id]) {
    chunkBuffers[id] = { parts: [], received: 0, total: msg.totalChunks };
  }
  var buf = chunkBuffers[id];
  buf.parts[msg.chunkIndex] = msg.bytes;
  buf.received++;

  if (buf.received === buf.total) {
    try {
      var totalLen = 0;
      for (var pi = 0; pi < buf.parts.length; pi++) totalLen += buf.parts[pi].length;
      var all = new Uint8Array(totalLen);
      var offset = 0;
      for (var pi = 0; pi < buf.parts.length; pi++) {
        var part = new Uint8Array(buf.parts[pi]);
        all.set(part, offset);
        offset += part.length;
      }
      var hash = figma.createImage(all).hash;
      imageRegistry[id] = hash;
      delete chunkBuffers[id];
      figma.ui.postMessage({ type: 'image-registered', id: id, hash: hash });
    } catch (e) {
      delete chunkBuffers[id];
      figma.ui.postMessage({ type: 'image-register-error', id: id, message: String(e) });
    }
  }
}

// ── Generate handler ──────────────────────────────────────────────────────────
async function handleGenerate(images, config) {
  try {
    var resolved = images.map(function(img) {
      var hash = img.hash;
      if (!hash) throw new Error('Image not registered: ' + img.name);
      return Object.assign({}, img, { hash: hash });
    });

    var frame = await buildMoodboard(resolved, config);
    figma.viewport.scrollAndZoomIntoView([frame]);
    figma.ui.postMessage({ type: 'done' });
  } catch (err) {
    console.error('Generation failed:', err);
    figma.ui.postMessage({ type: 'error', message: String(err) });
  }
}

// ── Main builder ──────────────────────────────────────────────────────────────
async function buildMoodboard(images, cfg) {
  var preset       = cfg.preset;
  var layout       = cfg.layout;
  var gap          = cfg.gap;
  var padding      = cfg.padding;
  var bgColor      = cfg.bgColor;
  var cellPadding  = cfg.cellPadding;
  var cellBgColor  = cfg.cellBgColor;
  var cornerRadius = cfg.cornerRadius;

  var W = preset.width;
  var H = preset.height;
  var layoutCfg = { width: W, height: H, padding: padding, gap: gap };

  var layoutFns = {
    grid:       layoutGrid,
    editorial:  layoutEditorial,
    masonry:    layoutMasonry,
    cluster:    layoutCluster,
  };
  var cells = (layoutFns[layout] || layoutGrid)(images, layoutCfg);

  var now = new Date();
  var ts  = pad(now.getHours()) + ':' + pad(now.getMinutes());
  var layoutLabels = {
    grid: 'Grid ' + images.length, editorial: 'Editorial ' + images.length,
    masonry: 'Masonry ' + images.length, cluster: 'Cluster ' + images.length,
  };

  var frame = figma.createFrame();
  figma.currentPage.appendChild(frame);
  frame.name = 'Moodboard 3000 \u2014 ' + (layoutLabels[layout] || layout) + ' \u2014 ' + ts;
  frame.resize(W, H);
  frame.fills  = [{ type: 'SOLID', color: hexToRgb(bgColor.hex), opacity: bgColor.opacity }];
  frame.clipsContent = true;
  frame.x = Math.round(figma.viewport.center.x - W / 2);
  frame.y = Math.round(figma.viewport.center.y - H / 2);

  for (var i = 0; i < cells.length; i++) {
    var cell = cells[i];
    var idx  = pad(i + 1);

    var cellW = Math.max(1, Math.round(cell.width));
    var cellH = Math.max(1, Math.round(cell.height));

    var cellFrame = figma.createFrame();
    frame.appendChild(cellFrame);
    cellFrame.name = 'Cell ' + idx;
    cellFrame.resize(cellW, cellH);
    cellFrame.x = Math.round(cell.x);
    cellFrame.y = Math.round(cell.y);
    cellFrame.fills = [{
      type: 'SOLID',
      color: hexToRgb(cellBgColor.hex),
      opacity: cellBgColor.opacity,
    }];
    cellFrame.cornerRadius = cornerRadius;
    cellFrame.clipsContent = true;

    var img = (cell.imgIdx !== undefined)
      ? images[cell.imgIdx % images.length]
      : images[i % images.length];

    var innerW    = Math.max(1, cellW - 2 * cellPadding);
    var innerH    = Math.max(1, cellH - 2 * cellPadding);
    var scaleMode = cell.scaleMode || 'FILL';

    var rect = figma.createRectangle();
    cellFrame.appendChild(rect);
    rect.name = 'Image ' + idx;
    rect.resize(innerW, innerH);
    rect.x = cellPadding;
    rect.y = cellPadding;
    var imgFill = { type: 'IMAGE', scaleMode: scaleMode, imageHash: img.hash };
    if (img.imageTransform) imgFill.imageTransform = img.imageTransform;
    rect.fills = [imgFill];
  }

  return frame;
}

// ── Layout: Justified Rows (Grid) ─────────────────────────────────────────────
// Uses dynamic programming (linear partition) to split images into R rows that
// minimise row-height variance.  Tries every viable row count; picks the one
// whose scaled heights are most uniform.
function layoutGrid(images, cfg) {
  var W = cfg.width, H = cfg.height, P = cfg.padding, G = cfg.gap;
  var n = images.length;
  if (n === 0) return [];

  var availW = W - 2 * P;
  var availH = H - 2 * P;

  if (n === 1) return [{ x: P, y: P, width: availW, height: availH, scaleMode: 'FILL' }];

  // Aspect ratios and prefix sums
  var ratios = [];
  var sumAR = 0;
  for (var i = 0; i < n; i++) {
    var ar = (images[i].width && images[i].height) ? images[i].width / images[i].height : 1;
    ratios.push(ar);
    sumAR += ar;
  }
  var prefixAR = [0];
  for (var i = 0; i < n; i++) prefixAR.push(prefixAR[i] + ratios[i]);

  // Row height for images [a..b] filling availW
  function rowH(a, b) {
    var cnt = b - a + 1;
    var ar = prefixAR[b + 1] - prefixAR[a];
    return (availW - (cnt - 1) * G) / ar;
  }

  // Ideal row height → estimate ideal row count
  var idealH = Math.sqrt(availW * availH / sumAR);
  var idealR = Math.max(2, Math.round(availH / (idealH + G)));

  // Try a range of row counts around the ideal and pick the best
  var bestPartition = null;
  var bestScore = Infinity;
  var minR = Math.max(2, idealR - 3);
  var maxR = Math.min(n, idealR + 3);

  for (var R = minR; R <= maxR; R++) {
    // Target row height for this R
    var targetRH = (availH - (R - 1) * G) / R;

    // DP: partition n images into R rows, minimising sum of squared deviation
    // from targetRH.  cost[i][k] = best cost for first i images in k rows.
    var cost = [];
    var breaks = [];
    for (var i = 0; i <= n; i++) {
      cost.push([]);
      breaks.push([]);
      for (var k = 0; k <= R; k++) {
        cost[i].push(Infinity);
        breaks[i].push(0);
      }
    }
    cost[0][0] = 0;

    for (var k = 1; k <= R; k++) {
      for (var i = k; i <= n; i++) {
        for (var j = k - 1; j < i; j++) {
          var h = rowH(j, i - 1);
          var dev = h - targetRH;
          var c = cost[j][k - 1] + dev * dev;
          if (c < cost[i][k]) {
            cost[i][k] = c;
            breaks[i][k] = j;
          }
        }
      }
    }

    if (cost[n][R] === Infinity) continue;

    // Reconstruct partition
    var partition = [];
    var pos = n;
    for (var k = R; k >= 1; k--) {
      var start = breaks[pos][k];
      partition.unshift({ start: start, end: pos - 1 });
      pos = start;
    }

    if (cost[n][R] < bestScore) {
      bestScore = cost[n][R];
      bestPartition = partition;
    }
  }

  // Build rowDefs from best partition
  var rowDefs = [];
  for (var r = 0; r < bestPartition.length; r++) {
    var p = bestPartition[r];
    var ar = prefixAR[p.end + 1] - prefixAR[p.start];
    rowDefs.push({ start: p.start, end: p.end, ar: ar, count: p.end - p.start + 1 });
  }

  // Natural height for each row (height that fills availW exactly)
  var naturalH = [];
  var sumNatural = 0;
  for (var r = 0; r < rowDefs.length; r++) {
    var h = (availW - (rowDefs[r].count - 1) * G) / rowDefs[r].ar;
    naturalH.push(h);
    sumNatural += h;
  }

  // Scale so total height (rows + gaps) = availH
  var gapTotal = (rowDefs.length - 1) * G;
  var scale = (availH - gapTotal) / sumNatural;

  // Build cells — width is proportional to each image's share of the row's
  // total aspect ratio, so it always sums to availW regardless of height scaling.
  var cells = [];
  var y = P;
  for (var r = 0; r < rowDefs.length; r++) {
    var rh = naturalH[r] * scale;
    var rowAvailW = availW - (rowDefs[r].count - 1) * G;
    var x = P;
    for (var j = rowDefs[r].start; j <= rowDefs[r].end; j++) {
      var imgW = rowAvailW * (ratios[j] / rowDefs[r].ar);
      // Last image: absorb any sub-pixel rounding remainder
      if (j === rowDefs[r].end) imgW = availW - (x - P);
      cells.push({ x: x, y: y, width: imgW, height: rh, scaleMode: 'FILL' });
      x += imgW + G;
    }
    y += rh + G;
  }
  return cells;
}

// ── Layout: Editorial Mini ────────────────────────────────────────────────────
// Hand-authored template compositions for 2–5 images.
// Each image count has 3 templates; a deterministic seed (derived from the
// actual image dimensions) picks which one so the same n always varies with
// different image sets.
//
// Image role sorting:
//   Slot 0 → hero: the image with the most extreme aspect ratio (most non-square)
//   Remaining slots retain relative selection order.
//
// All templates avoid equal-sized cells, simple columns, and leftover space.
function layoutEditorialMini(images, cfg) {
  var W = cfg.width, H = cfg.height, P = cfg.padding, G = cfg.gap;
  var n = images.length;

  // n=1 fallback: single full-frame image
  if (n <= 1) {
    return n === 0 ? [] : [{
      x: P, y: P, width: W - 2 * P, height: H - 2 * P,
      imgIdx: 0, scaleMode: 'FILL',
    }];
  }

  // ── Template library ───────────────────────────────────────────────────────
  // Templates are spans on a small modular grid (cols × rows).
  // The grid produces the same aligned edges and shared row/column heights
  // as the general editorial engine — mini boards feel like a tighter
  // version of the same system, not a separate collage mode.
  //
  // Slot ordering = image role ordering.  Slot 0 is always the hero and
  // maps to imgIdx 0 (first selected image).  The template controls where
  // on the canvas that slot lands — not which image fills it.
  //
  // Image role assignment: selection order = slot order.
  // The user controls which image is hero by selection order.
  // (No aspect-ratio sorting — that assumption was too opinionated.)
  //
  // Each template is { cols, rows, slots[] } where each slot is
  // { r, c, rs, cs } in grid-cell units.  Hero slot is always first.
  //
  // Grid coverage must be exact (sum of cs*rs == cols*rows) so the full
  // canvas is always filled.

  var TEMPLATES = {
    // ── n=2: 3×2 (T0/T1) · 4×2 (T2) ───────────────────────────────────────
    // hero covers 4 of 6 cells; support fills the remaining rail.
    2: [
      // T0  hero left 2/3 · support right rail
      { cols: 3, rows: 2, slots: [
        { r:0, c:0, cs:2, rs:2 },   // hero  (large left block)
        { r:0, c:2, cs:1, rs:2 },   // support (right rail)
      ]},
      // T1  support left rail · hero right 2/3  (mirror)
      { cols: 3, rows: 2, slots: [
        { r:0, c:1, cs:2, rs:2 },   // hero  (large right block)
        { r:0, c:0, cs:1, rs:2 },   // support (left rail)
      ]},
      // T2  very dominant hero 3/4 · thin right rail
      { cols: 4, rows: 2, slots: [
        { r:0, c:0, cs:3, rs:2 },   // hero  (3/4 width)
        { r:0, c:3, cs:1, rs:2 },   // support (thin rail)
      ]},
    ],

    // ── n=3: 3×2 (T0/T1) · 4×2 (T2) ───────────────────────────────────────
    // hero covers 4 of 6 (or 6 of 8) cells; two stacked smalls fill the rail.
    3: [
      // T0  hero left 2/3 · two stacked smalls right
      { cols: 3, rows: 2, slots: [
        { r:0, c:0, cs:2, rs:2 },   // hero
        { r:0, c:2, cs:1, rs:1 },   // support top
        { r:1, c:2, cs:1, rs:1 },   // support bottom
      ]},
      // T1  two stacked smalls left · hero right 2/3  (mirror)
      { cols: 3, rows: 2, slots: [
        { r:0, c:1, cs:2, rs:2 },   // hero
        { r:0, c:0, cs:1, rs:1 },   // support top
        { r:1, c:0, cs:1, rs:1 },   // support bottom
      ]},
      // T2  wider dominant hero 3/4 · two stacked smalls far-right
      { cols: 4, rows: 2, slots: [
        { r:0, c:0, cs:3, rs:2 },   // hero  (3/4 width)
        { r:0, c:3, cs:1, rs:1 },   // support top
        { r:1, c:3, cs:1, rs:1 },   // support bottom
      ]},
    ],

    // ── n=4: 4×2 ────────────────────────────────────────────────────────────
    // hero 2×2 (half width) + stepped supports filling the remaining 4 cells.
    4: [
      // T0  hero left half · medium inner-right · two stacked far-right
      { cols: 4, rows: 2, slots: [
        { r:0, c:0, cs:2, rs:2 },   // hero  (left block)
        { r:0, c:2, cs:1, rs:2 },   // medium (inner-right column)
        { r:0, c:3, cs:1, rs:1 },   // small  top-right
        { r:1, c:3, cs:1, rs:1 },   // small  bottom-right
      ]},
      // T1  two stacked far-left · medium inner-left · hero right half  (mirror)
      { cols: 4, rows: 2, slots: [
        { r:0, c:2, cs:2, rs:2 },   // hero  (right block)
        { r:0, c:1, cs:1, rs:2 },   // medium (inner-left column)
        { r:0, c:0, cs:1, rs:1 },   // small  top-left
        { r:1, c:0, cs:1, rs:1 },   // small  bottom-left
      ]},
      // T2  hero left half · wide medium top-right · two smalls bottom-right
      { cols: 4, rows: 2, slots: [
        { r:0, c:0, cs:2, rs:2 },   // hero  (left block)
        { r:0, c:2, cs:2, rs:1 },   // medium (wide, top-right)
        { r:1, c:2, cs:1, rs:1 },   // small  bottom-right inner
        { r:1, c:3, cs:1, rs:1 },   // small  bottom-right outer
      ]},
    ],

    // ── n=5: 4×3 ────────────────────────────────────────────────────────────
    // hero 2×2 (top corner) + mediums as tall counterweights + base supports.
    5: [
      // T0  hero top-left · two tall counterweights right · two base strips
      { cols: 4, rows: 3, slots: [
        { r:0, c:0, cs:2, rs:2 },   // hero  (top-left block)
        { r:0, c:2, cs:1, rs:2 },   // medium (tall inner-right)
        { r:0, c:3, cs:1, rs:2 },   // medium (tall outer-right)
        { r:2, c:0, cs:2, rs:1 },   // support base left
        { r:2, c:2, cs:2, rs:1 },   // support base right
      ]},
      // T1  hero top-right · two tall counterweights left · two base strips (mirror)
      { cols: 4, rows: 3, slots: [
        { r:0, c:2, cs:2, rs:2 },   // hero  (top-right block)
        { r:0, c:0, cs:1, rs:2 },   // medium (tall outer-left)
        { r:0, c:1, cs:1, rs:2 },   // medium (tall inner-left)
        { r:2, c:0, cs:2, rs:1 },   // support base left
        { r:2, c:2, cs:2, rs:1 },   // support base right
      ]},
      // T2  hero top-left · wide medium top-right · two smalls mid-right · base strip
      { cols: 4, rows: 3, slots: [
        { r:0, c:0, cs:2, rs:2 },   // hero  (top-left block)
        { r:0, c:2, cs:2, rs:1 },   // medium (wide, top-right)
        { r:1, c:2, cs:1, rs:1 },   // small  mid-right inner
        { r:1, c:3, cs:1, rs:1 },   // small  mid-right outer
        { r:2, c:0, cs:4, rs:1 },   // base strip (full width, anchors composition)
      ]},
    ],
  };

  // ── Select template ────────────────────────────────────────────────────────
  // Deterministic seed: hash of image dimensions so the same n cycles through
  // templates as the image set changes, not locked to one template per count.
  var dimHash = 0;
  for (var j = 0; j < n; j++) dimHash += (images[j].width || 0) + (images[j].height || 0) * 2;

  var tplSet = TEMPLATES[n];
  if (!tplSet || !tplSet.length) return [];
  var tpl = tplSet[(isFinite(dimHash) ? dimHash : 0) % tplSet.length] || tplSet[0];

  // ── Grid cell sizing ───────────────────────────────────────────────────────
  // Same coordinate formula as the full editorial engine: cell position is
  //   x = P + c * (cellW + G),  width  = cs * cellW + (cs-1) * G
  //   y = P + r * (cellH + G),  height = rs * cellH + (rs-1) * G
  var availW = W - 2 * P;
  var availH = H - 2 * P;
  var cellW  = (availW - (tpl.cols - 1) * G) / tpl.cols;
  var cellH  = (availH - (tpl.rows - 1) * G) / tpl.rows;

  return tpl.slots.map(function(slot, si) {
    return {
      x:         P + slot.c * (cellW + G),
      y:         P + slot.r * (cellH + G),
      width:     Math.max(1, Math.round(slot.cs * cellW + (slot.cs - 1) * G)),
      height:    Math.max(1, Math.round(slot.rs * cellH + (slot.rs - 1) * G)),
      imgIdx:    si,        // slot 0 = first image (hero), slot 1 = secondary…
      scaleMode: 'FILL',
    };
  });
}


// ── Layout: Editorial ─────────────────────────────────────────────────────────
// Editorial layout v3.
//
// Five composition families softly bias where the hero and primary support land.
// They act as tendencies, not rigid templates, so layouts feel composed rather
// than obviously grid-templated.
//
// Key design decisions vs earlier versions:
//   - Hero is always 2×2 (n≥9) or 1×2 (n<9). No taller shapes.
//   - Medium count is chosen as the valid option closest to 2 for the specific
//     n/cols combination. Ranges roughly 1–4 in practice.
//   - Three scoring tiers for mediums: primary (family-driven), secondary
//     (half family + half balance), accent (balance + anti-cluster).
//   - A per-n seed (n%3) introduces micro-variation within each family cycle.
// ── Custom layout: n=18 ───────────────────────────────────────────────────────
// Hand-authored template: 10 fine-cols × 5 rows, no orphan cells.
// Grid: fineCellW = (availW - 9G)/10,  cellH = (availH - 4G)/5
//
// Row 0-1: hero(4×2) | portrait(2×2) | landscape(2×1) | portrait(2×2)
// Row 1  :             (cont.)        | landscape(2×1) | (cont.)
// Row 2  : land(2×1) | wide(4×1)     | port(1×2) | land(2×1) | tiny(1×1)
// Row 3  : tiny(1×1) | portrait(2×2) | wide(3×1) | (cont.)   | land(2×1) | tiny
// Row 4  : tiny(1×1) | (cont.)       | wide(4×1)             | wide(3×1)
function layoutEditorial18(images, cfg) {
  var W = cfg.width, H = cfg.height, P = cfg.padding, G = cfg.gap;
  var availW = W - 2 * P;
  var availH = H - 2 * P;
  var FC = 10, FR = 5;
  var cw = (availW - (FC - 1) * G) / FC;
  var ch = (availH - (FR - 1) * G) / FR;
  function cell(fc, fr, fcs, frs, idx) {
    return {
      x:         P + fc * (cw + G),
      y:         P + fr * (ch + G),
      width:     fcs * cw + (fcs - 1) * G,
      height:    frs * ch + (frs - 1) * G,
      imgIdx:    idx,
      scaleMode: 'FILL'
    };
  }
  return [
    // row 0-1
    cell(0, 0, 4, 2,  0),   // hero
    cell(4, 0, 2, 2,  1),   // portrait
    cell(6, 0, 2, 1,  2),   // landscape
    cell(8, 0, 2, 2,  3),   // portrait
    cell(6, 1, 2, 1,  4),   // landscape
    // row 2
    cell(0, 2, 2, 1,  5),   // landscape
    cell(2, 2, 4, 1,  6),   // wide accent
    cell(6, 2, 1, 2,  7),   // portrait (spans rows 2-3)
    cell(7, 2, 2, 1,  8),   // landscape
    cell(9, 2, 1, 1,  9),   // tiny
    // row 3
    cell(0, 3, 1, 1, 10),   // tiny
    cell(1, 3, 2, 2, 11),   // portrait (spans rows 3-4)
    cell(3, 3, 3, 1, 12),   // wide
    // col 6 row 3: img 7 continues
    cell(7, 3, 2, 1, 13),   // landscape
    cell(9, 3, 1, 1, 14),   // tiny
    // row 4
    cell(0, 4, 1, 1, 15),   // tiny
    // cols 1-2 row 4: img 11 continues
    cell(3, 4, 4, 1, 16),   // wide
    cell(7, 4, 3, 1, 17),   // wide
  ];
}

function layoutEditorial(images, cfg) {
  var W = cfg.width, H = cfg.height, P = cfg.padding, G = cfg.gap;
  var n = images.length;
  if (n === 0) return [];

  // ── Hard cap ──────────────────────────────────────────────────────────────
  if (n > 40) { images = images.slice(0, 40); n = 40; }

  // ── Small boards: hand-authored mini templates ─────────────────────────────
  if (n <= 5) return layoutEditorialMini(images, cfg);

  // ── n=18 custom template ──────────────────────────────────────────────────
  if (n === 18) return layoutEditorial18(images, cfg);

  var availW = W - 2 * P;
  var availH = H - 2 * P;

  // ── Column count ──────────────────────────────────────────────────────────
  var cols;
  if      (n <= 8)  cols = 3;
  else if (n <= 15) cols = 4;
  else if (n <= 22) cols = 5;
  else              cols = 6;

  // ── Structural accent ─────────────────────────────────────────────────────
  // For larger boards, a 3×1 (or 1×3) accent tile acts as a second large
  // compositional beat that breaks the small-tile region into something
  // non-grid. It is placed as a scored span just like the hero, consuming
  // Accent width is capped at 2 coarse cols when cols≤4 (prevents 75% canvas span).
  // accentExtra = accentMaxCS×1 − 1 (same formula applies to 1×accentMaxCS vertical).
  var hasAccent    = (n >= 13);
  var accentMaxCS  = (cols <= 5) ? 2 : 3;
  var accentExtra  = hasAccent ? (accentMaxCS - 1) : 0;

  // ── Composition family + within-family seed ───────────────────────────────
  // Family cycles with n%5; seed (n%3) shifts anchor targets slightly within
  // a family so consecutive image counts feel distinct even in the same family.
  var FAMILIES = ['top_left', 'left_rail', 'top_band', 'offset_left', 'right_rail'];
  var family = FAMILIES[n % FAMILIES.length];
  var seed   = n % 3; // 0, 1, 2

  // ── Hero size: 2×2 or 1×2 only. Never taller than 2 rows. ────────────────
  var heroCS    = (n < 9) ? 1 : 2;
  var heroRS    = 2;
  var heroExtra = heroCS * heroRS - 1; // extra cells consumed beyond 1×1

  // ── Grid sizing ───────────────────────────────────────────────────────────
  // Find nMediums closest to wantedMediums such that:
  //   cols × targetRows = n + heroExtra + accentExtra + nMediums  (exactly)
  //   targetRows ≥ ceil(n / cols)
  // Tie-break toward larger wm so big boards get more mediums, fewer raw smalls.
  // When an accent strip already provides a second strong beat, pull back on
  // mediums so the hierarchy stays clear: hero → accent/support → texture.
  var wantedMediums = hasAccent
    ? (n <= 15 ? 2 : n <= 20 ? 3 : 4)
    : 2; // n < 13 (no accent): always target 2
  var totalExtra = heroExtra + accentExtra;
  var targetRows, nMediums;
  var bestDist = Infinity;
  for (var wm = 1; wm <= 2 * cols; wm++) {
    var needed = n + totalExtra + wm;
    if (needed % cols !== 0) continue;
    var tr = needed / cols;
    if (tr < Math.ceil(n / cols)) continue;
    var dist = Math.abs(wm - wantedMediums);
    if (dist < bestDist || (dist === bestDist && wm > nMediums)) {
      bestDist = dist; targetRows = tr; nMediums = wm;
    }
  }
  // Fallback (unreachable for n ≥ 5)
  if (!targetRows) {
    targetRows = Math.ceil(n / cols) + 1;
    nMediums   = Math.max(1, targetRows * cols - n - totalExtra);
  }
  var medOffset = 1 + (hasAccent ? 1 : 0);
  nMediums = Math.min(nMediums, n - medOffset); // leave images for small fill

  // ── Occupancy grid ────────────────────────────────────────────────────────
  var occ = [];
  for (var ri = 0; ri < targetRows; ri++) {
    occ.push([]);
    for (var ci0 = 0; ci0 < cols; ci0++) occ[ri].push(false);
  }

  function canPlace(r, c, cs, rs) {
    if (c + cs > cols || r + rs > targetRows) return false;
    for (var dr = 0; dr < rs; dr++)
      for (var dc = 0; dc < cs; dc++)
        if (occ[r + dr][c + dc]) return false;
    return true;
  }
  function occupy(r, c, cs, rs) {
    for (var dr = 0; dr < rs; dr++)
      for (var dc = 0; dc < cs; dc++)
        occ[r + dr][c + dc] = true;
  }

  var leftW = 0, rightW = 0;
  var halfC = cols / 2;
  var largeTiles = [];

  function addWeight(c, cs, area) {
    if (c + cs / 2 < halfC) leftW += area; else rightW += area;
  }

  function edgeAdjacentToLarge(r, c, cs, rs) {
    for (var k = 0; k < largeTiles.length; k++) {
      var t    = largeTiles[k];
      var hOv  = (c < t.c + t.cs) && (t.c < c + cs);
      var vOv  = (r < t.r + t.rs) && (t.r < r + rs);
      var hTch = (c + cs === t.c) || (t.c + t.cs === c);
      var vTch = (r + rs === t.r) || (t.r + t.rs === r);
      if ((hOv && vTch) || (vOv && hTch)) return true;
    }
    return false;
  }

  var placements = [];
  var heroR = 0, heroC = 0;

  function place(r, c, cs, rs, imgIdx) {
    occupy(r, c, cs, rs);
    addWeight(c, cs, cs * rs);
    if (cs * rs > 1) largeTiles.push({ r: r, c: c, cs: cs, rs: rs });
    placements.push({ r: r, c: c, cs: cs, rs: rs, imgIdx: imgIdx });
  }

  // ── Hero scoring ──────────────────────────────────────────────────────────
  // Moderate weights (2–4 pts/step) so a family bias is felt without being
  // rigid — adjacent positions remain competitive, creating natural variation.
  // seed shifts the preferred target position by a small amount.
  function scoreHero(r, c) {
    var ctr = c + heroCS / 2;
    var sc  = 0;

    if (family === 'top_left') {
      // Prefer top-left; seed 0→strong corner, 1→top only, 2→left only
      sc -= r * (3 + (seed !== 1 ? 1 : 0));
      sc -= c * (2 + (seed !== 2 ? 1 : 0));

    } else if (family === 'left_rail') {
      sc -= r * 3;
      sc -= c * (3 + seed); // seed amplifies leftward pull: 3–5

    } else if (family === 'top_band') {
      sc -= r * 4;
      // Target column shifts with seed: 0→30%, 1→38%, 2→46% across width
      var bandTarget = cols * (0.30 + seed * 0.08);
      sc -= Math.abs(ctr - bandTarget) * 2;

    } else if (family === 'offset_left') {
      sc -= r * 3;
      // seed shifts preferred column: 0→col1, 1→col1, 2→col2
      var prefC = 1.0 + (seed === 2 ? 1.0 : 0.0);
      sc -= Math.abs(ctr - (prefC + heroCS / 2)) * 3;

    } else { // right_rail
      sc -= r * 3;
      sc += c * (2 + seed); // seed amplifies rightward pull: 2–4
    }

    // Universal: avoid dead-centre — boring and symmetrical
    if (Math.abs(ctr - halfC) < 0.6 && r < 2) sc -= 12;
    return sc;
  }

  // ── Place hero ────────────────────────────────────────────────────────────
  var bestHS = -Infinity, bHR = 0, bHC = 0;
  for (var r = 0; r < targetRows; r++) {
    for (var c = 0; c < cols; c++) {
      if (!canPlace(r, c, heroCS, heroRS)) continue;
      var hs = scoreHero(r, c);
      if (hs > bestHS) { bestHS = hs; bHR = r; bHC = c; }
    }
  }
  heroR = bHR; heroC = bHC;
  place(heroR, heroC, heroCS, heroRS, 0);

  var heroEndR = heroR + heroRS;
  var heroEndC = heroC + heroCS;

  // ── Accent placement ──────────────────────────────────────────────────────
  // The accent is a structural element, not merely a long extra tile.
  // It is scored toward one of three compositional roles:
  //
  //   BASE   — 3×1 horizontal at the bottom row: anchors / grounds the board
  //   RAIL   — 1×3 vertical at a side edge: creates a boundary counterpoint
  //   BRIDGE — 3×1 horizontal in the lower-middle zone: spans across regions
  //
  // Family preference biases which role the accent tends to take.
  if (hasAccent) {
    var scoreAccentFn = function(r, c, cs, rs) {
      if (!canPlace(r, c, cs, rs)) return -Infinity;
      var sc  = 0;
      var ctr = c + cs / 2;
      var isV = (rs > cs); // true = 1×3 vertical rail
      var isH = !isV;      // true = 3×1 horizontal (base or bridge)

      // ── Role: BASE — bottom-row horizontal ─────────────────────────────
      if (isH) {
        if (r === targetRows - 1)     sc += 12; // true bottom: strong anchor
        else if (r === targetRows - 2) sc += 5;  // near-bottom: acceptable
      }

      // ── Role: RAIL — side-edge vertical ────────────────────────────────
      if (isV) {
        var atLeft  = (c === 0);
        var atRight = (c + cs === cols);
        if (atLeft || atRight)                    sc += 8; // must be at an edge
        // Prefer the edge opposite to the hero — creates side tension
        if (heroC < halfC  && atRight)            sc += 6;
        if (heroC >= halfC && atLeft)             sc += 6;
      }

      // ── Role: BRIDGE — lower-middle horizontal ──────────────────────────
      if (isH) {
        var lowerMid = targetRows * 0.4;
        if (r >= lowerMid && r < targetRows - 1)  sc += 4; // not bottom, not top
        // Crossing the centre column adds visual tension
        if (c < halfC && c + cs > halfC)          sc += 3;
      }

      // ── Family preference for role ──────────────────────────────────────
      if (family === 'left_rail') {
        if (isV && ctr >= halfC) sc += 5; // right-side rail
      } else if (family === 'right_rail') {
        if (isV && ctr < halfC) sc += 5; // left-side rail
      } else {
        // top_left, top_band, offset_left: prefer base or bridge over rail
        if (isH) sc += 4;
      }

      // ── Universal constraints ───────────────────────────────────────────
      if (isH && r < heroRS)                   sc -= 10; // horizontal: not in hero rows
      if (edgeAdjacentToLarge(r, c, cs, rs))   sc -=  8; // let hero breathe
      return sc;
    };
    var accentOrients = (accentMaxCS === 2) ? [[2, 1], [1, 2]] : [[3, 1], [1, 3]];
    var bestAS = -Infinity, aR = -1, aC = -1, aCS = accentOrients[0][0], aRS = accentOrients[0][1];
    for (var aoi = 0; aoi < accentOrients.length; aoi++) {
      var aoCS = accentOrients[aoi][0], aoRS = accentOrients[aoi][1];
      for (var ar2 = 0; ar2 < targetRows; ar2++) {
        for (var ac2 = 0; ac2 < cols; ac2++) {
          var asc = scoreAccentFn(ar2, ac2, aoCS, aoRS);
          if (asc > bestAS) { bestAS = asc; aR = ar2; aC = ac2; aCS = aoCS; aRS = aoRS; }
        }
      }
    }
    if (aR >= 0) {
      place(aR, aC, aCS, aRS, 1);
    } else {
      var aFbOk = false;
      outerAFB3: for (var afb3r = 0; afb3r < targetRows; afb3r++)
        for (var afb3c = 0; afb3c < cols; afb3c++)
          for (var afbOi = 0; afbOi < accentOrients.length; afbOi++)
            if (canPlace(afb3r, afb3c, accentOrients[afbOi][0], accentOrients[afbOi][1])) {
              place(afb3r, afb3c, accentOrients[afbOi][0], accentOrients[afbOi][1], 1);
              aFbOk = true; break outerAFB3;
            }
      if (!aFbOk) {
        outerAFB: for (var afr = 0; afr < targetRows; afr++)
          for (var afc = 0; afc < cols; afc++)
            if (canPlace(afr, afc, 1, 1)) { place(afr, afc, 1, 1, 1); break outerAFB; }
      }
    }
  }

  // ── Medium scoring ────────────────────────────────────────────────────────
  // Three tiers:
  //   mi=0  primary   — family support zone
  //   mi=1  secondary — half family bias + half global balance
  //   mi≥2  tertiary  — global balance + anti-cluster only
  //
  // When an accent already provides the second strong beat, family-specific
  // bonuses are softened so mediums read as supporting texture, not additional
  // compositional anchors.  Balance/anti-cluster logic is unchanged.
  var medStrength = hasAccent ? 0.55 : 1.0;

  function scoreMedium(r, c, cs, rs, mi) {
    if (!canPlace(r, c, cs, rs)) return -Infinity;
    var sc  = 0;
    var ctr = c + cs / 2;
    var tot = leftW + rightW;

    if (mi === 0) {
      // ── Primary support: family-specific zone ────────────────────────────
      if (family === 'top_left') {
        sc += r * (2 + seed) * medStrength;
        sc += c * 2 * medStrength;
        if (r >= heroEndR && c >= heroEndC) sc += 8 * medStrength;

      } else if (family === 'left_rail') {
        if (ctr > halfC) sc += 8 * medStrength;
        sc -= r * 2 * medStrength;

      } else if (family === 'top_band') {
        sc += r * 2 * medStrength;
        if (heroC < halfC  && ctr > halfC) sc += 6 * medStrength;
        if (heroC >= halfC && ctr < halfC) sc += 6 * medStrength;

      } else if (family === 'offset_left') {
        sc += r * (2 + seed) * medStrength;
        if (cs > rs) sc += 2 * medStrength;

      } else { // right_rail
        if (ctr < halfC) sc += 8 * medStrength;
        sc -= r * 2 * medStrength;
      }
      // Primary support may sit next to hero (shoulder element), so penalty is soft
      if (edgeAdjacentToLarge(r, c, cs, rs)) sc -= 3;

    } else if (mi === 1) {
      // ── Secondary: partial family bias + balance ──────────────────────────
      if (family === 'top_left' || family === 'top_band') {
        if (ctr > halfC) sc += 2; // loosely right side
      } else if (family === 'offset_left') {
        sc += r * 1; // loosely lower
      } else if (family === 'right_rail') {
        if (ctr < halfC) sc += 2; // loosely left side
      }
      if (tot > 0) {
        var lf = leftW / tot;
        if (lf > 0.55 && ctr > halfC) sc += 5;
        if (lf < 0.45 && ctr < halfC) sc += 5;
      }
      if (edgeAdjacentToLarge(r, c, cs, rs)) sc -= 5;

    } else {
      // ── Accent (mi≥2): balance + anti-cluster ────────────────────────────
      if (tot > 0) {
        var lf2 = leftW / tot;
        if (lf2 > 0.55 && ctr > halfC) sc += 7;
        if (lf2 < 0.45 && ctr < halfC) sc += 7;
      }
      if (edgeAdjacentToLarge(r, c, cs, rs)) sc -= 7;
      // Push accents away from the centre band
      var midR = (targetRows - 1) / 2;
      if (Math.abs(r + rs / 2 - midR) < 0.8) sc -= 5;
    }

    // Spread across row bands not already occupied by a large tile
    var rowBusy = false;
    for (var kb = 0; kb < largeTiles.length; kb++) {
      var lt = largeTiles[kb];
      if (r >= lt.r && r < lt.r + lt.rs) { rowBusy = true; break; }
    }
    if (!rowBusy) sc += 3;

    // Penalise stacking two wide tiles in the same row
    if (cs === 2) {
      for (var kw = 0; kw < largeTiles.length; kw++)
        if (largeTiles[kw].cs === 2 && largeTiles[kw].r === r) { sc -= 6; break; }
    }

    // Prefer portrait (1×2) over landscape (2×1) — reduces wide coarse tiles.
    if (rs > cs) sc += 4;

    return sc;
  }

  // ── Place mediums ─────────────────────────────────────────────────────────
  var orients = [[1, 2], [2, 1]];
  for (var mi = 0; mi < nMediums; mi++) {
    var imgIdx = medOffset + mi;
    var bestMS = -Infinity, mR = -1, mC = -1, mCS = 1, mRS = 2;

    for (var oi = 0; oi < orients.length; oi++) {
      var tCS = orients[oi][0], tRS = orients[oi][1];
      for (var r2 = 0; r2 < targetRows; r2++) {
        for (var c2 = 0; c2 < cols; c2++) {
          var sc2 = scoreMedium(r2, c2, tCS, tRS, mi);
          if (sc2 > bestMS) { bestMS = sc2; mR = r2; mC = c2; mCS = tCS; mRS = tRS; }
        }
      }
    }

    if (mR >= 0) {
      place(mR, mC, mCS, mRS, imgIdx);
    } else {
      var mFbOk = false;
      outerFB2: for (var fb2r = 0; fb2r < targetRows; fb2r++)
        for (var fb2c = 0; fb2c < cols; fb2c++)
          for (var fbOi = 0; fbOi < orients.length; fbOi++)
            if (canPlace(fb2r, fb2c, orients[fbOi][0], orients[fbOi][1])) {
              place(fb2r, fb2c, orients[fbOi][0], orients[fbOi][1], imgIdx);
              mFbOk = true; break outerFB2;
            }
      if (!mFbOk) {
        outerFB: for (var r3 = 0; r3 < targetRows; r3++)
          for (var c3 = 0; c3 < cols; c3++)
            if (canPlace(r3, c3, 1, 1)) { place(r3, c3, 1, 1, imgIdx); break outerFB; }
      }
    }
  }

  // ── Fine-grid small fill ───────────────────────────────────────────────────
  // The fill region uses a doubled column grid (fineCols = cols × 2).
  //
  // Key identity: 2·fineCellW + G = coarse cellW (exact), so coarse tiles
  // converted to fine coords produce identical pixel rectangles.
  //
  // Tile vocabulary (fine units × rows):
  //   portrait  1×2   tall portrait  ~0.6:1   ~20 %   (2 cells, natural shapes)
  //   square    2×2   near-square    ~1.1:1   ~18 %   (4 cells, anchor tiles)
  //   small     2×1   landscape      ~2.4:1   ~38 %   (2 cells, standard fill)
  //   tiny      1×1   small square   ~1.1:1   ~12 %   (1 cell, rhythm/stagger)
  //   large     4×2   panoramic      ~2.3:1   ~ 5 %   (8 cells, anchor accent)
  //   wide      3×1   wide accent    ~3.6:1   ~ 7 %   (3 cells, ≤ nWideMax/board)
  // Budget: totalFillCells = 2 × n_fill (from budget equation with fineCols=2×cols).
  var fineCols  = cols * 2;
  var fineCellW = (availW - (fineCols - 1) * G) / fineCols;
  var cellH     = (availH - (targetRows - 1) * G) / targetRows;

  // Build fine occupancy from coarse placements (hero, accent, mediums).
  // Each coarse cell (r, c, cs) → fine cells (r, 2c .. 2c+2cs-1).
  var fineOcc = [];
  for (var fri = 0; fri < targetRows; fri++) {
    fineOcc.push([]);
    for (var fci0 = 0; fci0 < fineCols; fci0++) fineOcc[fri].push(false);
  }
  for (var pli = 0; pli < placements.length; pli++) {
    var pp = placements[pli];
    for (var pdr = 0; pdr < pp.rs; pdr++)
      for (var pdc = 0; pdc < pp.cs * 2; pdc++)
        fineOcc[pp.r + pdr][pp.c * 2 + pdc] = true;
  }

  function canPlaceFine(r, fc, fcs) {
    if (fc + fcs > fineCols) return false;
    for (var fcd = 0; fcd < fcs; fcd++) if (fineOcc[r][fc + fcd]) return false;
    return true;
  }
  function occupyFine(r, fc, fcs) {
    for (var fcd = 0; fcd < fcs; fcd++) fineOcc[r][fc + fcd] = true;
  }

  // ── Best-fit mosaic packing ───────────────────────────────────────────────
  // IMAGE COUNT INVARIANT
  //   totalFillCells = 2 × n_fill  (budget equation with fineCols = cols × 2).
  //   Before every placement: maxCells = remCells − remImgs + 1.
  //   Enforcing tw×th ≤ maxCells guarantees exactly one tile per remaining
  //   image — no image is ever dropped or duplicated.
  //
  // Anti-strip rules (apply only to tw ≥ 3):
  //   – At most ONE wide tile (width ≥ 3) per row.
  //   – Wide tiles may not stack in adjacent rows at overlapping columns.
  //   – Wide tiles may not start flush-left (need ≥1 tile already in row).
  //   – Per-board accent budget: at most nWideMax wide tiles total.
  //
  // Anti-grid rules:
  //   – Every third row (by formula) begins with a leading tiny that shifts
  //     all subsequent tile boundaries one fine unit right ("stagger rows").
  //   – Small boards (n ≤ 12) get higher square/portrait probability.

  // Count total fine cells available for fill (= 2 × n_fill, always).
  var totalFillCells = 0;
  for (var tfi = 0; tfi < targetRows; tfi++)
    for (var tfj = 0; tfj < fineCols; tfj++)
      if (!fineOcc[tfi][tfj]) totalFillCells++;

  var nLargeMax  = Math.max(1, Math.floor(n / 10));
  // Per-board budget for 3×1 accent tiles: very limited, accent-only.
  var nWideMax   = (n <= 12) ? 1 : (n <= 25) ? 2 : 3;
  var nWidePlaced = 0;
  var largeFill  = []; // placed 4×2 fill tiles — adjacency guard

  function adjLargeFill(r, fc, fcs, frs) {
    for (var li = 0; li < largeFill.length; li++) {
      var lt   = largeFill[li];
      var hOv  = fc < lt.fc + lt.fcs && lt.fc < fc + fcs;
      var vOv  = r  < lt.r  + lt.frs && lt.r  < r  + frs;
      var hTch = (fc + fcs === lt.fc) || (lt.fc + lt.fcs === fc);
      var vTch = (r  + frs === lt.r ) || (lt.r  + lt.frs === r );
      if ((hOv && vTch) || (vOv && hTch)) return true;
    }
    return false;
  }

  // Per-row wide tile registry: wideFC[r] = fine col where wide tile starts,
  // wideFCS[r] = its width. -1 means no wide tile in that row.
  var wideFC  = [], wideFCS = [];
  for (var wii = 0; wii < targetRows; wii++) { wideFC.push(-1); wideFCS.push(0); }

  function wideStacksAbove(r, fc, fcs) {
    var pr = r - 1;
    if (pr < 0 || wideFC[pr] < 0) return false;
    return fc < wideFC[pr] + wideFCS[pr] && wideFC[pr] < fc + fcs;
  }

  var sIdx2         = medOffset + nMediums;
  var finePlacements = [];
  var remImgs       = n - sIdx2;       // n_fill images to place in fill stage
  var remCells      = totalFillCells;  // actual free fine cells (always ≥ 2 × remImgs)
  var isSmallBoard  = (n <= 12);

  for (var sfr = 0; sfr < targetRows; sfr++) {
    var wideThisRow = false; // allows exactly one wide/medium tile per row
    var staggerDone = false; // one leading-tiny stagger per row at most
    // Stagger rows: every third row (offset by n so pattern varies per board).
    var isStaggerRow = (sfr > 0 && (sfr + n) % 3 === 0);

    var sfc = 0;
    while (sfc < fineCols) {
      if (fineOcc[sfr][sfc]) { sfc++; continue; }

      // Images exhausted — leave cell free for the closure pass (Stage 2).
      if (remImgs <= 0) { sfc++; continue; }

      // Measure contiguous run width from sfc in this row.
      var aw = 0;
      while (sfc + aw < fineCols && !fineOcc[sfr][sfc + aw]) aw++;

      // IMAGE COUNT INVARIANT: limit cells this tile may consume.
      var maxCells = remCells - remImgs + 1; // always ≥ 1

      // ── Stagger: leading tiny shifts all subsequent tile boundaries ─────
      // Applied once per stagger row, at the first available cell in the row.
      if (isStaggerRow && !staggerDone && aw > 1 && remImgs > 2) {
        staggerDone = true;
        occupyFine(sfr, sfc, 1);
        finePlacements.push({ r: sfr, fc: sfc, fcs: 1, frs: 1, imgIdx: sIdx2++ });
        remCells--; remImgs--;
        sfc++;
        continue;
      }
      staggerDone = true; // suppress stagger for remaining cells in this row

      // ── 4×2 large tile eligibility ─────────────────────────────────────
      var nextRowFree = (sfr + 1 < targetRows);
      // Disable all multi-row tiles when images are running low — prevents
      // isolated orphan cells in lower rows that the closure pass can't
      // cleanly absorb without duplicating images.
      var nearEnd = (remImgs <= fineCols);
      var can4x2 = (!nearEnd &&
                    fineCols > 8 &&
                    aw >= 4 &&
                    maxCells >= 8 &&
                    nextRowFree &&
                    sfr + 2 < targetRows &&
                    sfr >= Math.ceil(targetRows / 3) &&
                    largeFill.length < nLargeMax &&
                    !wideThisRow &&
                    !wideStacksAbove(sfr, sfc, 4) &&
                    !adjLargeFill(sfr, sfc, 4, 2));
      if (can4x2) {
        for (var dhc = 0; dhc < 4; dhc++)
          if (fineOcc[sfr + 1][sfc + dhc]) { can4x2 = false; break; }
      }

      // ── Portrait + square multi-row tile eligibility ────────────────────
      // canPort: 1 fine col × 2 rows (portrait orientation)
      // canSq:   2 fine cols × 2 rows (near-square)
      var canPort = (!nearEnd && nextRowFree && sfr + 2 < targetRows && maxCells >= 2 && !fineOcc[sfr + 1][sfc]);
      var canSq   = (!nearEnd && nextRowFree && sfr + 2 < targetRows && aw >= 2 && maxCells >= 4 &&
                     !fineOcc[sfr + 1][sfc] && !fineOcc[sfr + 1][sfc + 1]);

      // ── Accent-strip eligibility (3×1 wide, accent-only) ───────────────
      // 3×1 tiles need flush-left protection, anti-stack, and per-board budget.
      var notFlushLeft = (sfc > 0);
      var withinBudget = (nWidePlaced < nWideMax);
      var allow3 = (!wideThisRow && aw >= 3 && maxCells >= 3 &&
                    notFlushLeft && withinBudget && !wideStacksAbove(sfr, sfc, 3));

      // ── Probability thresholds (cumulative, sum = 100) ──────────────────
      // Normal:   large 3 | wide 4 | square 18 | portrait 30 | small 33 | tiny 12
      // Small-n:  large 3 | wide 2 | square 22 | portrait 35 | small 26 | tiny 12
      var T_LARGE = 3;
      var T_WIDE  = T_LARGE + (isSmallBoard ?  2 :  4);  //  5 |  7
      var T_SQ    = T_WIDE  + (isSmallBoard ? 22 : 18);  // 27 | 25
      var T_PORT  = T_SQ    + (isSmallBoard ? 35 : 30);  // 62 | 55
      var T_SMALL = T_PORT  + (isSmallBoard ? 26 : 33);  // 88 | 88
      // rnd ≥ T_SMALL → tiny (1×1)

      var rnd = (sfr * 7919 + sfc * 6271 + n * 4973 + sIdx2 * 3571) % 100;
      var tw, th;

      if      (rnd < T_LARGE && can4x2)                    { tw = 4; th = 2; }
      else if (rnd < T_WIDE  && allow3)                    { tw = 3; th = 1; }
      else if (rnd < T_SQ    && canSq)                     { tw = 2; th = 2; }
      else if (rnd < T_PORT  && canPort)                   { tw = 1; th = 2; }
      else if (rnd < T_SMALL && aw >= 2 && maxCells >= 2)  { tw = 2; th = 1; }
      else if (aw >= 2 && maxCells >= 2)                   { tw = 2; th = 1; }
      else                                                  { tw = 1; th = 1; }

      // Safety clamps (invariant should already cover these).
      if (tw > aw)            tw = aw;
      if (tw * th > maxCells) { th = 1; if (tw > maxCells) tw = maxCells; }
      if (tw < 1)             tw = 1;

      // Track wide accent tiles for per-row limit and vertical anti-stacking.
      if (tw >= 3) {
        wideThisRow  = true;
        wideFC[sfr]  = sfc;
        wideFCS[sfr] = tw;
        nWidePlaced++;
      }

      // Place.
      for (var tdr = 0; tdr < th; tdr++) occupyFine(sfr + tdr, sfc, tw);
      if (th > 1 && tw >= 4) largeFill.push({ r: sfr, fc: sfc, fcs: tw, frs: th });
      finePlacements.push({ r: sfr, fc: sfc, fcs: tw, frs: th, imgIdx: sIdx2++ });
      remCells -= tw * th;
      remImgs--;
      sfc += tw;
    }
  }

  // ── Stage 2: Closure Pass ─────────────────────────────────────────────────
  // Deterministically fills every cell left free by the editorial stage.
  //
  // Case A — orphan cells (remImgs = 0, free cells remain):
  //   Created when multi-row tiles (portrait, square, large) consume the image
  //   budget from two rows at once, leaving cells in the lower row uncovered.
  //   Fix: extend the nearest adjacent tile to absorb the orphan cell.
  //   Priority: (1) extend the tile immediately above (full-row extension if
  //   the entire new row is free), (2) extend the tile to the left (full-column
  //   extension if the entire new column is free), (3) partial extension of the
  //   tile directly above as a last resort.
  //
  // Case B — remaining images (remImgs > 0, safety fallback):
  //   Should not normally occur, but handled with the closure vocabulary:
  //   2×2, 2×1, 1×2, 1×1 — no wide accents, always solvable.
  // ── Rect helpers ──────────────────────────────────────────────────────────
  // All coordinates are fine-grid units: fr = fine row, fc = fine col.
  // deltaClear: checks only the NEW cells being added by an extension.
  // Existing tile placements are already non-overlapping, so only the delta
  // needs validation — checking the full new rect causes false rejections
  // when the tile's current area legitimately neighbors other tiles.
  var rectsIntersect = function(a, b) {
    return a.fc < b.fc + b.fcs && a.fc + a.fcs > b.fc &&
           a.fr < b.fr + b.frs && a.fr + a.frs > b.fr;
  };
  var deltaClear = function(delta) {
    var ri, p, fp;
    for (ri = 0; ri < placements.length; ri++) {
      p = placements[ri];
      if (rectsIntersect(delta, { fr: p.r, fc: p.c * 2, frs: p.rs, fcs: p.cs * 2 })) return false;
    }
    for (ri = 0; ri < finePlacements.length; ri++) {
      fp = finePlacements[ri];
      if (rectsIntersect(delta, { fr: fp.r, fc: fp.fc, frs: fp.frs, fcs: fp.fcs })) return false;
    }
    return true;
  };

  for (var cfr = 0; cfr < targetRows; cfr++) {
    for (var cfc = 0; cfc < fineCols; cfc++) {
      if (fineOcc[cfr][cfc]) continue;

      if (remImgs <= 0) {
        // ── Case A: Absorb orphan cell ─────────────────────────────────────
        // Every extension is rect-validated before applying: the tile's full
        // new rect must not overlap any other tile. fineOcc is updated for
        // all newly covered cells after each successful extension.
        var clAbsorbed = false;
        var clI;

        // P1: extend any fine tile ending just above cfr (frs++).
        // Delta: new bottom row slice only.
        for (clI = finePlacements.length - 1; clI >= 0 && !clAbsorbed; clI--) {
          var clT = finePlacements[clI];
          if (clT.r + clT.frs !== cfr) continue;
          if (clT.fc > cfc || clT.fc + clT.fcs <= cfc) continue;
          if (deltaClear({ fr: cfr, fc: clT.fc, frs: 1, fcs: clT.fcs })) {
            for (var clEm = clT.fc; clEm < clT.fc + clT.fcs; clEm++) fineOcc[cfr][clEm] = true;
            clT.frs++;
            clAbsorbed = true;
          }
        }

        // P2: extend fine tile to the right (fcs++) to include column cfc.
        // Delta: new right column slice only.
        if (!clAbsorbed) {
          for (clI = finePlacements.length - 1; clI >= 0 && !clAbsorbed; clI--) {
            var clT2 = finePlacements[clI];
            if (clT2.fc + clT2.fcs !== cfc) continue;
            if (clT2.r > cfr || clT2.r + clT2.frs <= cfr) continue;
            if (deltaClear({ fr: clT2.r, fc: cfc, frs: clT2.frs, fcs: 1 })) {
              for (var clEr2 = clT2.r; clEr2 < clT2.r + clT2.frs; clEr2++) fineOcc[clEr2][cfc] = true;
              clT2.fcs++;
              clAbsorbed = true;
            }
          }
        }

        // P3b: 1-tall fine tile immediately left of cfc, extend right.
        // Delta: single cell (cfr, cfc).
        if (!clAbsorbed) {
          for (clI = finePlacements.length - 1; clI >= 0 && !clAbsorbed; clI--) {
            var clT3b = finePlacements[clI];
            if (clT3b.frs !== 1 || clT3b.r !== cfr || clT3b.fc + clT3b.fcs !== cfc) continue;
            if (deltaClear({ fr: cfr, fc: cfc, frs: 1, fcs: 1 })) {
              fineOcc[cfr][cfc] = true;
              clT3b.fcs++;
              clAbsorbed = true;
            }
          }
        }

        // P3c: 1-tall fine tile immediately right of cfc, extend left.
        // Delta: single cell (cfr, cfc).
        if (!clAbsorbed) {
          for (clI = finePlacements.length - 1; clI >= 0 && !clAbsorbed; clI--) {
            var clT3c = finePlacements[clI];
            if (clT3c.frs !== 1 || clT3c.r !== cfr || clT3c.fc !== cfc + 1) continue;
            if (deltaClear({ fr: cfr, fc: cfc, frs: 1, fcs: 1 })) {
              fineOcc[cfr][cfc] = true;
              clT3c.fc = cfc;
              clT3c.fcs++;
              clAbsorbed = true;
            }
          }
        }

        // P5: fine tile that spans cfr, extend fcs++ into cfc.
        // Delta: new column cfc across the tile's row span.
        if (!clAbsorbed) {
          for (clI = finePlacements.length - 1; clI >= 0 && !clAbsorbed; clI--) {
            var clT5 = finePlacements[clI];
            if (clT5.r > cfr || clT5.r + clT5.frs <= cfr) continue;
            if (clT5.fc + clT5.fcs !== cfc && clT5.fc !== cfc + 1) continue;
            if (deltaClear({ fr: clT5.r, fc: cfc, frs: clT5.frs, fcs: 1 })) {
              for (var p5r2 = clT5.r; p5r2 < clT5.r + clT5.frs; p5r2++) fineOcc[p5r2][cfc] = true;
              if (clT5.fc === cfc + 1) clT5.fc = cfc;
              clT5.fcs++;
              clAbsorbed = true;
            }
          }
        }

        // P4b: coarse tile ending just above cfr, extend rs++.
        // Delta: new bottom row slice only.
        if (!clAbsorbed) {
          for (var p4bi = placements.length - 1; p4bi >= 0 && !clAbsorbed; p4bi--) {
            var p4b = placements[p4bi];
            if (p4b.r + p4b.rs !== cfr) continue;
            var p4bFcS = p4b.c * 2, p4bFcE = (p4b.c + p4b.cs) * 2;
            if (cfc < p4bFcS || cfc >= p4bFcE) continue;
            if (deltaClear({ fr: cfr, fc: p4bFcS, frs: 1, fcs: p4bFcE - p4bFcS })) {
              for (var p4bMark = p4bFcS; p4bMark < p4bFcE; p4bMark++) fineOcc[cfr][p4bMark] = true;
              p4b.rs++;
              clAbsorbed = true;
            }
          }
        }

        // P5b: coarse tile spanning cfr, extend cs++.
        if (!clAbsorbed) {
          for (var p5bi = placements.length - 1; p5bi >= 0 && !clAbsorbed; p5bi--) {
            var p5b = placements[p5bi];
            if (p5b.r > cfr || p5b.r + p5b.rs <= cfr) continue;
            var p5bFcE = (p5b.c + p5b.cs) * 2;
            if (p5bFcE !== cfc) continue;
            if (deltaClear({ fr: p5b.r, fc: p5bFcE, frs: p5b.rs, fcs: 2 })) {
              for (var p5br2 = p5b.r; p5br2 < p5b.r + p5b.rs; p5br2++) {
                fineOcc[p5br2][cfc] = true;
                fineOcc[p5br2][cfc + 1] = true;
              }
              p5b.cs++;
              clAbsorbed = true;
            }
          }
        }

        // Force-extend: lowest-z-order fine tile ending at cfr, rect-validated.
        if (!clAbsorbed) {
          for (clI = 0; clI < finePlacements.length && !clAbsorbed; clI++) {
            var clTZ = finePlacements[clI];
            if (clTZ.r + clTZ.frs !== cfr) continue;
            if (clTZ.fc > cfc || clTZ.fc + clTZ.fcs <= cfc) continue;
            if (deltaClear({ fr: cfr, fc: clTZ.fc, frs: 1, fcs: clTZ.fcs })) {
              for (var fzMark = clTZ.fc; fzMark < clTZ.fc + clTZ.fcs; fzMark++) fineOcc[cfr][fzMark] = true;
              clTZ.frs++;
              clAbsorbed = true;
            }
          }
        }

        // Absolute last resort: mark cell to prevent infinite loop.
        if (!clAbsorbed) fineOcc[cfr][cfc] = true;
        continue;
      }

      // ── Case B: Remaining image — closure vocabulary ────────────────────
      var caw2 = 0;
      while (cfc + caw2 < fineCols && !fineOcc[cfr][cfc + caw2]) caw2++;
      var cMaxCells = remCells - remImgs + 1;
      var cNextRow  = (cfr + 1 < targetRows);
      var ctw, cth;
      if (caw2 >= 2 && cMaxCells >= 4 && cNextRow &&
          !fineOcc[cfr + 1][cfc] && !fineOcc[cfr + 1][cfc + 1]) {
        ctw = 2; cth = 2;
      } else if (caw2 >= 2 && cMaxCells >= 2) {
        ctw = 2; cth = 1;
      } else if (cMaxCells >= 2 && cNextRow && !fineOcc[cfr + 1][cfc]) {
        ctw = 1; cth = 2;
      } else {
        ctw = 1; cth = 1;
      }
      for (var clDr = 0; clDr < cth; clDr++) occupyFine(cfr + clDr, cfc, ctw);
      finePlacements.push({ r: cfr, fc: cfc, fcs: ctw, frs: cth, imgIdx: sIdx2++ });
      remCells -= ctw * cth;
      remImgs--;
    }
  }

  // ── Invariant check ───────────────────────────────────────────────────────
  // sIdx2 must equal n: every image placed exactly once, none skipped.
  // placements.length + finePlacements.length must equal n.
  var expectedTiles = placements.length + finePlacements.length;
  if (sIdx2 !== n || expectedTiles < n) {
    figma.notify('Layout invariant violated: ' + sIdx2 + ' placed, ' + expectedTiles + ' tiles for ' + n + ' images', { error: true });
  }

  // ── Pixel output ──────────────────────────────────────────────────────────
  var result = [];

  // Coarse tiles (hero, accent, mediums) — convert to fine coordinates.
  for (var opi = 0; opi < placements.length; opi++) {
    var op  = placements[opi];
    var fC  = op.c * 2;
    var fCS = op.cs * 2;
    result.push({
      x:      P + fC   * (fineCellW + G),
      y:      P + op.r * (cellH     + G),
      width:  fCS * fineCellW + (fCS - 1) * G,
      height: op.rs * cellH  + (op.rs - 1) * G,
      imgIdx: op.imgIdx, scaleMode: 'FILL',
    });
  }

  // Fine tiles (portrait, tiny, small, square, medium, wide, strip, large).
  for (var fpi = 0; fpi < finePlacements.length; fpi++) {
    var fp = finePlacements[fpi];
    result.push({
      x:      P + fp.fc * (fineCellW + G),
      y:      P + fp.r  * (cellH     + G),
      width:  fp.fcs * fineCellW + (fp.fcs - 1) * G,
      height: fp.frs * cellH    + (fp.frs - 1) * G,
      imgIdx: fp.imgIdx, scaleMode: 'FILL',
    });
  }

  return result;
}

// ── Layout: Masonry ───────────────────────────────────────────────────────────
function layoutMasonry(images, cfg) {
  var W = cfg.width, H = cfg.height, P = cfg.padding, G = cfg.gap;
  var n = images.length;
  if (n === 0) return [];

  var iW = W - 2 * P, iH = H - 2 * P;

  // Don't squish images below 70% of their natural height.
  // If the current column count causes more squishing, add another column.
  var MIN_SF  = 0.70;
  var minColW = Math.max(80, iW / 12);
  var MAX_C   = Math.min(10, n, Math.floor((iW + G) / (minColW + G)));

  // Distribute images across numCols columns (shortest-column-first).
  function distribute(numCols) {
    var cw   = (iW - (numCols - 1) * G) / numCols;
    var cols = [], sumH = [];
    for (var ci = 0; ci < numCols; ci++) { cols.push([]); sumH.push(0); }
    for (var i = 0; i < n; i++) {
      var ar  = images[i].width / images[i].height || 1;
      var col = 0;
      for (var k = 1; k < numCols; k++) if (sumH[k] < sumH[col]) col = k;
      cols[col].push(i);
      sumH[col] += cw / ar;
    }
    return { cols: cols, sumH: sumH, cw: cw };
  }

  // Worst (smallest) scale factor across all non-empty columns.
  function worstSF(d) {
    var sf = 1;
    for (var ci = 0; ci < d.cols.length; ci++) {
      var k = d.cols[ci].length;
      if (k === 0) continue;
      var avail = iH - (k - 1) * G;
      var s = (d.sumH[ci] > 0 && avail > 0) ? avail / d.sumH[ci] : 1;
      if (s < sf) sf = s;
    }
    return sf;
  }

  // Scale column count proportionally to canvas width.
  // Reference inner width ~1872px (1920 canvas, P=24). Narrower canvases get fewer columns.
  // <13 images: ~3 per column. 13+ images: ~5 per column. Both scaled by sqrt(iW/1872).
  var wScale = Math.sqrt(iW / 1872);
  var startC = n < 13 ? Math.round(n / 3 * wScale) : Math.round(n / 5 * wScale);
  var C      = Math.max(2, Math.min(MAX_C, startC));
  var dist = distribute(C);
  while (worstSF(dist) < MIN_SF && C < MAX_C) {
    C++;
    dist = distribute(C);
  }

  var cells = [];
  for (var j = 0; j < C; j++) {
    var colData = dist.cols[j];
    var kj      = colData.length;
    if (kj === 0) continue;
    var avail   = iH - (kj - 1) * G;
    var SF      = (dist.sumH[j] > 0 && avail > 0) ? avail / dist.sumH[j] : 1;
    var y       = P;
    for (var m = 0; m < kj; m++) {
      var imgIdx  = colData[m];
      var ar      = images[imgIdx].width / images[imgIdx].height || 1;
      var scaledH = Math.max(1, dist.cw / ar * SF);
      cells.push({
        x:         P + j * (dist.cw + G),
        y:         y,
        width:     dist.cw,
        height:    scaledH,
        imgIdx:    imgIdx,
        scaleMode: 'FILL',
      });
      y += scaledH + G;
    }
  }
  return cells;
}

// ── Layout: Scattered ─────────────────────────────────────────────────────────
// Grid-based packing shaped to match the canvas aspect ratio.
// Images sorted centre-outward: centre slots get the first (largest) images.
// 3 size tiers: large (25%) fill their slot, medium (50%) at 78%, small (25%) at 50%.
// ── Layout: Cluster ───────────────────────────────────────────────────────────
// Subdivision + Edge Erosion + Leaf Clamping (v7)

var CLUSTER_MIN_AR = 0.5;
var CLUSTER_MAX_AR = 2.0;
var CLUSTER_MIN_DIM = 45;

function clusterRectOk(r) {
  if (r.w < CLUSTER_MIN_DIM || r.h < CLUSTER_MIN_DIM) return false;
  var ar = r.w / r.h;
  return ar >= CLUSTER_MIN_AR && ar <= CLUSTER_MAX_AR;
}

function clusterRng(a) {
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function clusterSubdivide(rect, items, depth) {
  if (!items.length) return [];
  if (items.length === 1) {
    // Clamp leaf to aspect ratio limits — crop and center if needed
    var p = { id: items[0].id, x: rect.x, y: rect.y, w: rect.w, h: rect.h };
    var ar = p.w / p.h;
    if (ar < CLUSTER_MIN_AR) {
      var newH = p.w / CLUSTER_MIN_AR;
      p.y += (p.h - newH) / 2; p.h = newH;
    } else if (ar > CLUSTER_MAX_AR) {
      var newW = p.h * CLUSTER_MAX_AR;
      p.x += (p.w - newW) / 2; p.w = newW;
    }
    return [p];
  }

  var best = -Infinity, br = null;
  var att = Math.min(items.length - 1, depth < 3 ? 8 : 5);
  var sp = [];
  for (var a = 0; a < att; a++) {
    sp.push(Math.max(1, Math.min(items.length - 1,
      Math.round((a + 1) * items.length / (att + 1)))));
  }

  for (var si = 0; si < sp.length; si++) {
    var idx = sp[si];
    var left = items.slice(0, idx), right = items.slice(idx);
    var lw = 0, rw = 0;
    for (var i = 0; i < left.length; i++) lw += left[i].weight;
    for (var i = 0; i < right.length; i++) rw += right[i].weight;
    var ratio = Math.max(0.25, Math.min(0.75, lw / (lw + rw)));

    for (var dir = 0; dir < 2; dir++) {
      var r1, r2;
      if (dir === 0) {
        var sx = Math.round(rect.x + rect.w * ratio);
        r1 = { x: rect.x, y: rect.y, w: sx - rect.x, h: rect.h };
        r2 = { x: sx, y: rect.y, w: rect.x + rect.w - sx, h: rect.h };
      } else {
        var sy = Math.round(rect.y + rect.h * ratio);
        r1 = { x: rect.x, y: rect.y, w: rect.w, h: sy - rect.y };
        r2 = { x: rect.x, y: sy, w: rect.w, h: rect.y + rect.h - sy };
      }
      if (!clusterRectOk(r1) || !clusterRectOk(r2)) continue;

      var la = 0, ra = 0;
      for (var i = 0; i < left.length; i++) la += left[i].ar;
      la /= left.length;
      for (var i = 0; i < right.length; i++) ra += right[i].ar;
      ra /= right.length;

      var f1 = 1 - Math.abs(Math.log((r1.w / r1.h) /
        Math.max(CLUSTER_MIN_AR, Math.min(CLUSTER_MAX_AR, la))));
      var f2 = 1 - Math.abs(Math.log((r2.w / r2.h) /
        Math.max(CLUSTER_MIN_AR, Math.min(CLUSTER_MAX_AR, ra))));

      var pen = 0;
      if (left.length === 1) { var a1 = r1.w / r1.h; if (a1 < CLUSTER_MIN_AR || a1 > CLUSTER_MAX_AR) pen -= 100; }
      if (right.length === 1) { var a2 = r2.w / r2.h; if (a2 < CLUSTER_MIN_AR || a2 > CLUSTER_MAX_AR) pen -= 100; }

      var score = f1 + f2 + pen;
      if (score > best) { best = score; br = { r1: r1, r2: r2, left: left, right: right }; }
    }
  }

  // Fallback: try multiple ratios in both directions
  if (!br) {
    var half = Math.floor(items.length / 2);
    var li = items.slice(0, half), ri = items.slice(half);
    var fallbackRatios = [0.5, 0.4, 0.6, 0.35, 0.65, 0.3, 0.7];
    for (var fi = 0; fi < fallbackRatios.length && !br; fi++) {
      var fr = fallbackRatios[fi];
      var sx = Math.round(rect.x + rect.w * fr);
      var tr1 = { x: rect.x, y: rect.y, w: sx - rect.x, h: rect.h };
      var tr2 = { x: sx, y: rect.y, w: rect.x + rect.w - sx, h: rect.h };
      if (clusterRectOk(tr1) && clusterRectOk(tr2)) { br = { r1: tr1, r2: tr2, left: li, right: ri }; break; }
      var sy = Math.round(rect.y + rect.h * fr);
      tr1 = { x: rect.x, y: rect.y, w: rect.w, h: sy - rect.y };
      tr2 = { x: rect.x, y: sy, w: rect.w, h: rect.y + rect.h - sy };
      if (clusterRectOk(tr1) && clusterRectOk(tr2)) { br = { r1: tr1, r2: tr2, left: li, right: ri }; break; }
    }
    // Absolute last resort
    if (!br) {
      if (rect.w >= rect.h) {
        var sx = Math.round(rect.x + rect.w * 0.5);
        br = { r1: { x: rect.x, y: rect.y, w: sx - rect.x, h: rect.h },
               r2: { x: sx, y: rect.y, w: rect.x + rect.w - sx, h: rect.h },
               left: li, right: ri };
      } else {
        var sy = Math.round(rect.y + rect.h * 0.5);
        br = { r1: { x: rect.x, y: rect.y, w: rect.w, h: sy - rect.y },
               r2: { x: rect.x, y: sy, w: rect.w, h: rect.y + rect.h - sy },
               left: li, right: ri };
      }
    }
  }

  return clusterSubdivide(br.r1, br.left, depth + 1)
    .concat(clusterSubdivide(br.r2, br.right, depth + 1));
}

function clusterErodeEdges(placed, W, H, seed) {
  var noiseRng = clusterRng(seed + 1234);
  var cx = W / 2, cy = H / 2;

  for (var i = 0; i < placed.length; i++) {
    var p = placed[i];
    var noise = noiseRng();
    var pcx = p.x + p.w / 2, pcy = p.y + p.h / 2;
    var dx = (pcx - cx) / cx, dy = (pcy - cy) / cy;
    var norm = Math.sqrt(dx * dx + dy * dy);

    if (norm < 0.35) continue;

    var noiseV = 0.3 + noise * 0.7;
    var ef = ((norm - 0.35) / 0.65);
    ef = ef * ef * noiseV;

    var tL = p.x <= 1, tR = p.x + p.w >= W - 1;
    var tT = p.y <= 1, tB = p.y + p.h >= H - 1;
    if (!tL && !tR && !tT && !tB) continue; // only erode edge items

    var isCorner = (tL || tR) && (tT || tB);
    var shrink = ef + (isCorner ? 0.25 : 0);
    var maxS = 0.45;

    if (tR) { var d = p.w * Math.min(shrink * 0.5, maxS); p.w -= d; }
    if (tL) { var d = p.w * Math.min(shrink * 0.5, maxS); p.x += d; p.w -= d; }
    if (tB) { var d = p.h * Math.min(shrink * 0.5, maxS); p.h -= d; }
    if (tT) { var d = p.h * Math.min(shrink * 0.5, maxS); p.y += d; p.h -= d; }
  }
}

function clusterApplyGaps(placed, gap) {
  var hg = gap / 2;
  for (var i = 0; i < placed.length; i++) {
    var p = placed[i];
    var nL = false, nR = false, nT = false, nB = false;
    for (var j = 0; j < placed.length; j++) {
      if (i === j) continue;
      var q = placed[j];
      var ovY = !(p.y + p.h <= q.y || q.y + q.h <= p.y);
      var ovX = !(p.x + p.w <= q.x || q.x + q.w <= p.x);
      if (ovY && Math.abs((p.x + p.w) - q.x) < 2) nR = true;
      if (ovY && Math.abs(p.x - (q.x + q.w)) < 2) nL = true;
      if (ovX && Math.abs((p.y + p.h) - q.y) < 2) nB = true;
      if (ovX && Math.abs(p.y - (q.y + q.h)) < 2) nT = true;
    }
    if (nL) { p.x += hg; p.w -= hg; }
    if (nR) p.w -= hg;
    if (nT) { p.y += hg; p.h -= hg; }
    if (nB) p.h -= hg;
    if (p.w < 1) p.w = 1;
    if (p.h < 1) p.h = 1;
  }
}

function layoutCluster(images, cfg) {
  var W = cfg.width, H = cfg.height, P = cfg.padding, G = cfg.gap;
  if (!images.length) return [];
  var mapped = images.map(function(img, i) {
    return { imgIdx: i, ar: (img.width / img.height) || 1 };
  });
  return layoutClusterCore(mapped, W, H, P, G, Date.now());
}

function layoutClusterCore(images, W, H, P, G, seed) {
  var availW = W - P * 2;
  var availH = H - P * 2;
  var n = images.length;
  var r = clusterRng(seed + 777);

  // Assign weights
  var items = images.map(function(img, i) {
    var weight = 0.5 + ((i * 7 + 3) % 10) / 5;
    return { id: i, ar: img.ar, weight: weight, imgIdx: img.imgIdx };
  });

  // Sort: big first, interleave medium + small
  var sorted = items.slice().sort(function(a, b) { return b.weight - a.weight; });
  var big = sorted.slice(0, Math.ceil(n * 0.3));
  var med = sorted.slice(Math.ceil(n * 0.3), Math.ceil(n * 0.7));
  var small = sorted.slice(Math.ceil(n * 0.7));
  big.sort(function(a, b) { return b.weight - a.weight; });
  med.sort(function() { return r() - 0.5; });
  small.sort(function() { return r() - 0.5; });

  var ordered = [];
  for (var i = 0; i < big.length; i++) ordered.push(big[i]);
  var mi = 0, si = 0;
  while (mi < med.length || si < small.length) {
    if (mi < med.length) ordered.push(med[mi++]);
    if (si < small.length) ordered.push(small[si++]);
  }

  // Step 1: Subdivide edge-to-edge
  var placed = clusterSubdivide(
    { x: 0, y: 0, w: availW, h: availH }, ordered, 0
  );

  // Step 2: Erode edges for organic silhouette (shrink only)
  clusterErodeEdges(placed, availW, availH, seed);

  // Step 3: Apply gaps only between neighbors
  clusterApplyGaps(placed, G);

  // Step 4: Build output with id-based lookup
  var idToImgIdx = {};
  for (var i = 0; i < ordered.length; i++) {
    idToImgIdx[ordered[i].id] = ordered[i].imgIdx;
  }

  var results = [];
  for (var i = 0; i < placed.length; i++) {
    var p = placed[i];
    results.push({
      x: P + p.x,
      y: P + p.y,
      width: p.w,
      height: p.h,
      imgIdx: idToImgIdx[p.id] !== undefined ? idToImgIdx[p.id] : p.id,
      scaleMode: 'FILL'
    });
  }

  return results;
}


// ── Helpers ───────────────────────────────────────────────────────────────────
function hexToRgb(hex) {
  var h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

function pad(n) { return String(n).padStart(2, '0'); }

