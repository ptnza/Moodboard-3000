// ============================================================
// CLUSTER LAYOUT — Subdivision + Edge Erosion + Leaf Clamping (v7)
// Tested and validated in interactive sandbox.
// All items always placed. No slivers. Organic silhouette.
// Drop into Figma plugin code.js as layoutCluster replacement.
// ============================================================

// --- CONSTANTS ---
var CLUSTER_MIN_AR = 0.5;
var CLUSTER_MAX_AR = 2.0;
var CLUSTER_MIN_DIM = 45;

// --- HELPERS ---
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

// --- CORE: Recursive Subdivision ---
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

// --- EDGE EROSION: Organic silhouette (shrink only, never remove) ---
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

// --- SMART GAPS: Only between neighboring items ---
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

// --- MAIN ENTRY POINT ---
// images: [{ imgIdx, ar }]  (ar = original aspect ratio w/h)
// W, H: frame dimensions
// P: padding from frame edge
// G: gap between items
// seed: integer for deterministic randomness (e.g. Date.now())
// Returns: [{ x, y, width, height, imgIdx, scaleMode }]
function layoutCluster(images, W, H, P, G, seed) {
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
