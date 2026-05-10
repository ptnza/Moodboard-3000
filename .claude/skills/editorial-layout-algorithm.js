// ============================================================
// EDITORIAL LAYOUT — Recursive Subdivision (v14)
// Tested and validated in interactive sandbox.
// Drop into Figma plugin code.js as layoutEditorial replacement.
// ============================================================

// --- CONSTANTS ---
var EDITORIAL_MIN_AR = 0.45;   // no item narrower than ~1:2.2
var EDITORIAL_MAX_AR = 2.2;    // no item wider than ~2.2:1
var EDITORIAL_MIN_DIM = 40;    // no dimension smaller than 40px

// --- HELPERS ---
function editorialRectOk(r) {
  if (r.w < EDITORIAL_MIN_DIM || r.h < EDITORIAL_MIN_DIM) return false;
  var ar = r.w / r.h;
  if (ar < EDITORIAL_MIN_AR || ar > EDITORIAL_MAX_AR) return false;
  return true;
}

// --- CORE: Recursive Subdivision ---
// rect: { x, y, w, h }
// items: [{ id, ar, weight }]  (ar = aspect ratio, weight = relative size importance)
// Returns: [{ id, x, y, w, h }]
function editorialSubdivide(rect, items, depth) {
  if (items.length === 0) return [];
  if (items.length === 1) {
    return [{ id: items[0].id, x: rect.x, y: rect.y, w: rect.w, h: rect.h }];
  }

  var bestScore = -Infinity;
  var bestResult = null;

  // Try multiple split points
  var attempts = Math.min(items.length - 1, depth < 3 ? 7 : 4);
  var splits = [];
  for (var a = 0; a < attempts; a++) {
    splits.push(Math.max(1, Math.min(items.length - 1,
      Math.round((a + 1) * items.length / (attempts + 1)))));
  }

  for (var si = 0; si < splits.length; si++) {
    var splitIdx = splits[si];
    var left = items.slice(0, splitIdx);
    var right = items.slice(splitIdx);

    // Compute weight ratio
    var leftWeight = 0, rightWeight = 0;
    for (var i = 0; i < left.length; i++) leftWeight += left[i].weight;
    for (var i = 0; i < right.length; i++) rightWeight += right[i].weight;
    var ratio = leftWeight / (leftWeight + rightWeight);
    ratio = Math.max(0.2, Math.min(0.8, ratio)); // clamp to prevent slivers

    // Try both split directions
    for (var dir = 0; dir < 2; dir++) {
      var r1, r2;
      if (dir === 0) { // vertical split
        var sx = Math.round(rect.x + rect.w * ratio);
        r1 = { x: rect.x, y: rect.y, w: sx - rect.x, h: rect.h };
        r2 = { x: sx, y: rect.y, w: rect.x + rect.w - sx, h: rect.h };
      } else { // horizontal split
        var sy = Math.round(rect.y + rect.h * ratio);
        r1 = { x: rect.x, y: rect.y, w: rect.w, h: sy - rect.y };
        r2 = { x: rect.x, y: sy, w: rect.w, h: rect.y + rect.h - sy };
      }

      // Reject splits that create bad regions
      if (!editorialRectOk(r1) || !editorialRectOk(r2)) continue;

      // Score: how well do the sub-regions match the items' aspect ratios?
      var leftAvgAr = 0, rightAvgAr = 0;
      for (var i = 0; i < left.length; i++) leftAvgAr += left[i].ar;
      leftAvgAr /= left.length;
      for (var i = 0; i < right.length; i++) rightAvgAr += right[i].ar;
      rightAvgAr /= right.length;

      var fit1 = 1 - Math.abs(Math.log((r1.w / r1.h) /
        Math.max(EDITORIAL_MIN_AR, Math.min(EDITORIAL_MAX_AR, leftAvgAr))));
      var fit2 = 1 - Math.abs(Math.log((r2.w / r2.h) /
        Math.max(EDITORIAL_MIN_AR, Math.min(EDITORIAL_MAX_AR, rightAvgAr))));

      // Penalize single-item regions with bad aspect ratios
      var penalty = 0;
      if (left.length === 1) {
        var la = r1.w / r1.h;
        if (la < EDITORIAL_MIN_AR || la > EDITORIAL_MAX_AR) penalty -= 10;
      }
      if (right.length === 1) {
        var ra = r2.w / r2.h;
        if (ra < EDITORIAL_MIN_AR || ra > EDITORIAL_MAX_AR) penalty -= 10;
      }

      var score = fit1 + fit2 + penalty;
      if (score > bestScore) {
        bestScore = score;
        bestResult = { r1: r1, r2: r2, left: left, right: right };
      }
    }
  }

  // Fallback: split in half along longer axis
  if (!bestResult) {
    var half = Math.floor(items.length / 2);
    var li = items.slice(0, half), ri = items.slice(half);
    if (rect.w >= rect.h) {
      var sx = Math.round(rect.x + rect.w * 0.5);
      bestResult = {
        r1: { x: rect.x, y: rect.y, w: sx - rect.x, h: rect.h },
        r2: { x: sx, y: rect.y, w: rect.x + rect.w - sx, h: rect.h },
        left: li, right: ri
      };
    } else {
      var sy = Math.round(rect.y + rect.h * 0.5);
      bestResult = {
        r1: { x: rect.x, y: rect.y, w: rect.w, h: sy - rect.y },
        r2: { x: rect.x, y: sy, w: rect.w, h: rect.y + rect.h - sy },
        left: li, right: ri
      };
    }
  }

  return editorialSubdivide(bestResult.r1, bestResult.left, depth + 1)
    .concat(editorialSubdivide(bestResult.r2, bestResult.right, depth + 1));
}

// --- MAIN ENTRY POINT ---
// images: [{ imgIdx, ar }]  (ar = original aspect ratio w/h)
// W, H: frame dimensions
// P: padding from frame edge
// G: gap between items
// Returns: [{ x, y, width, height, imgIdx, scaleMode }]
function layoutEditorial(images, W, H, P, G) {
  var availW = W - P * 2;
  var availH = H - P * 2;
  var n = images.length;

  // Assign weights: random but seeded from index for determinism
  var items = images.map(function(img, i) {
    // Simple deterministic weight based on index
    var weight = 0.5 + ((i * 7 + 3) % 10) / 5;
    return { id: i, ar: img.ar, weight: weight, imgIdx: img.imgIdx };
  });

  // Sort: big items first, then interleave medium + small
  var sorted = items.slice().sort(function(a, b) { return b.weight - a.weight; });
  var big = sorted.slice(0, Math.ceil(n * 0.3));
  var med = sorted.slice(Math.ceil(n * 0.3), Math.ceil(n * 0.7));
  var small = sorted.slice(Math.ceil(n * 0.7));

  var ordered = [];
  for (var i = 0; i < big.length; i++) ordered.push(big[i]);
  var mi = 0, si = 0;
  while (mi < med.length || si < small.length) {
    if (mi < med.length) ordered.push(med[mi++]);
    if (si < small.length) ordered.push(small[si++]);
  }

  // Subdivide the full available area
  var placed = editorialSubdivide(
    { x: 0, y: 0, w: availW, h: availH }, ordered, 0
  );

  // Apply uniform gap: shrink each item inward by halfGap
  var halfGap = G / 2;

  // Build a lookup from id to imgIdx
  var idToImgIdx = {};
  for (var i = 0; i < ordered.length; i++) {
    idToImgIdx[ordered[i].id] = ordered[i].imgIdx;
  }

  var results = [];
  for (var i = 0; i < placed.length; i++) {
    var p = placed[i];
    results.push({
      x: P + p.x + halfGap,
      y: P + p.y + halfGap,
      width: p.w - G,
      height: p.h - G,
      imgIdx: idToImgIdx[p.id] !== undefined ? idToImgIdx[p.id] : p.id,
      scaleMode: 'FILL'
    });
  }

  return results;
}
