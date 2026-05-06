// Minimal DXF reader for 2D closed profiles. Parses a small subset of
// entities (LINE, ARC, CIRCLE, ELLIPSE, LWPOLYLINE) from the ENTITIES
// section, discretizes curves to a chord-error tolerance, and stitches the
// resulting segments end-to-end into a single closed polyline.
//
// Output coordinate convention: profile X is the radial distance from the
// rotation axis, profile Y is the axial (vertical) coordinate. The polyline
// is returned without the closing duplicate vertex (last point != first
// point), CCW order is not enforced — callers may reorder.

export async function loadDxfFromFile(file) {
  const text = await file.text();
  return parseDxfProfile(text);
}

export async function loadDxfFromUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch DXF (${res.status} ${res.statusText})`);
  const text = await res.text();
  return parseDxfProfile(text);
}

const DEFAULT_CHORD_TOL = 0.05;   // mm
const STITCH_TOL = 1e-3;          // mm — endpoint match tolerance
const CLOSE_TOL = 1e-3;           // mm — closed-loop end-to-start tolerance

export function parseDxfProfile(text, opts = {}) {
  const chordTol = Math.max(1e-4, opts.chordTol || DEFAULT_CHORD_TOL);
  const groups = parseGroupCodes(text);
  const entities = extractEntities(groups);
  if (!entities.length) throw new Error('DXF contains no supported entities');

  // Each entity → array of polyline points (with start + end vertex).
  // For closed entities (CIRCLE, closed LWPOLYLINE) we return the loop directly.
  let segments = [];
  for (const ent of entities) {
    const pts = discretizeEntity(ent, chordTol);
    if (!pts || pts.length < 2) continue;
    if (ent.closed) {
      // Self-contained loop. If it's the only segment, return it; otherwise
      // ignore additional disjoint loops (we only support a single closed
      // outline per file in v1).
      if (segments.length === 0 && entities.length === 1) {
        return { points: dedupeClosed(pts) };
      }
      // Treat the closed loop as one segment with the same start/end so
      // stitching can still attempt to join — but since both endpoints are
      // identical, only this loop alone is valid. Skip other entities.
      throw new Error('DXF: closed entity (CIRCLE / closed polyline) must be the only entity');
    }
    segments.push(pts);
  }
  if (!segments.length) throw new Error('DXF: no usable open entities found');

  const loop = stitchSegments(segments);
  return { points: dedupeClosed(loop) };
}

// ---------- DXF group-code parser ----------

function parseGroupCodes(text) {
  const lines = text.split(/\r?\n/);
  const groups = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    if (!Number.isFinite(code)) continue;
    groups.push([code, lines[i + 1]]);
  }
  return groups;
}

function extractEntities(groups) {
  const entities = [];
  let inEntities = false;
  let pendingSection = false;
  let current = null;

  const finishCurrent = () => {
    if (current) {
      entities.push(current);
      current = null;
    }
  };

  for (let g = 0; g < groups.length; g++) {
    const [code, value] = groups[g];
    if (code === 0) {
      finishCurrent();
      const v = String(value).trim();
      if (v === 'SECTION') {
        pendingSection = true;
      } else if (v === 'ENDSEC') {
        inEntities = false;
        pendingSection = false;
      } else if (inEntities) {
        current = { type: v, raw: [] };
      }
    } else if (code === 2 && pendingSection) {
      inEntities = String(value).trim() === 'ENTITIES';
      pendingSection = false;
    } else if (current) {
      current.raw.push([code, value]);
    }
  }
  finishCurrent();
  return entities;
}

// ---------- entity → polyline ----------

function getNum(raw, code) {
  for (const [c, v] of raw) if (c === code) return parseFloat(v);
  return undefined;
}

function getNums(raw, code) {
  const out = [];
  for (const [c, v] of raw) if (c === code) out.push(parseFloat(v));
  return out;
}

function getInt(raw, code) {
  for (const [c, v] of raw) if (c === code) return parseInt(v, 10);
  return undefined;
}

function discretizeEntity(ent, chordTol) {
  switch (ent.type) {
    case 'LINE': {
      const x1 = getNum(ent.raw, 10), y1 = getNum(ent.raw, 20);
      const x2 = getNum(ent.raw, 11), y2 = getNum(ent.raw, 21);
      if ([x1, y1, x2, y2].some(v => !Number.isFinite(v))) return null;
      return [[x1, y1], [x2, y2]];
    }
    case 'CIRCLE': {
      const cx = getNum(ent.raw, 10), cy = getNum(ent.raw, 20);
      const r  = getNum(ent.raw, 40);
      if ([cx, cy, r].some(v => !Number.isFinite(v)) || r <= 0) return null;
      const segs = arcSegments(r, 2 * Math.PI, chordTol);
      const pts = [];
      for (let k = 0; k < segs; k++) {
        const t = (k / segs) * 2 * Math.PI;
        pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
      }
      return Object.assign(pts, { closed: true });
    }
    case 'ARC': {
      const cx = getNum(ent.raw, 10), cy = getNum(ent.raw, 20);
      const r  = getNum(ent.raw, 40);
      const a0 = getNum(ent.raw, 50) * Math.PI / 180;
      let a1 = getNum(ent.raw, 51) * Math.PI / 180;
      if ([cx, cy, r, a0, a1].some(v => !Number.isFinite(v)) || r <= 0) return null;
      // ARC goes CCW from a0 to a1; normalize so a1 > a0.
      while (a1 < a0) a1 += 2 * Math.PI;
      const sweep = a1 - a0;
      const segs = Math.max(1, arcSegments(r, sweep, chordTol));
      const pts = [];
      for (let k = 0; k <= segs; k++) {
        const t = a0 + (k / segs) * sweep;
        pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
      }
      return pts;
    }
    case 'ELLIPSE': {
      // 10/20: center, 11/21: major axis endpoint *relative to center*,
      // 40: ratio (minor/major), 41: start param (rad), 42: end param (rad).
      // Param sweeps CCW from 41 to 42. Point on ellipse:
      //   p = center + cos(t)·majorVec + sin(t)·minorVec
      // where minorVec is majorVec rotated +90° and scaled by ratio.
      const cx = getNum(ent.raw, 10), cy = getNum(ent.raw, 20);
      const mx = getNum(ent.raw, 11), my = getNum(ent.raw, 21);
      const ratio = getNum(ent.raw, 40);
      const t0 = getNum(ent.raw, 41) ?? 0;
      let t1 = getNum(ent.raw, 42) ?? 2 * Math.PI;
      if ([cx, cy, mx, my, ratio].some(v => !Number.isFinite(v))) return null;
      const majorLen = Math.hypot(mx, my);
      if (!(majorLen > 0) || !(ratio > 0)) return null;
      // minor = perpendicular (rotated +90°) × ratio
      const nx = -my * ratio, ny = mx * ratio;
      while (t1 < t0) t1 += 2 * Math.PI;
      const sweep = t1 - t0;
      // Use chord error against the larger semi-axis as a worst-case bound.
      const rEff = majorLen;
      const segs = Math.max(1, arcSegments(rEff, sweep, chordTol));
      const pts = [];
      for (let k = 0; k <= segs; k++) {
        const t = t0 + (k / segs) * sweep;
        const c = Math.cos(t), s = Math.sin(t);
        pts.push([cx + c * mx + s * nx, cy + c * my + s * ny]);
      }
      return pts;
    }
    case 'LWPOLYLINE': {
      // Vertex coords: 10/20 pairs (in order). 42 = bulge (skipped — straight
      // segments between vertices). 70 = flags (bit 1 = closed).
      const xs = getNums(ent.raw, 10);
      const ys = getNums(ent.raw, 20);
      const flags = getInt(ent.raw, 70) ?? 0;
      const closed = (flags & 1) === 1;
      if (xs.length !== ys.length || xs.length < 2) return null;
      const pts = xs.map((x, i) => [x, ys[i]]);
      return closed ? Object.assign(pts, { closed: true }) : pts;
    }
    default:
      return null;
  }
}

// Segments needed to discretize a circular arc of radius r through angular
// sweep `sweep` (rad) so the maximum chord-to-arc deviation ≤ tol.
// chord error e = r · (1 − cos(Δ/2)) ⇒ Δ = 2·acos(1 − e/r)
function arcSegments(r, sweep, tol) {
  if (sweep <= 0) return 1;
  const arg = 1 - Math.min(1, tol / Math.max(r, 1e-9));
  const dMax = 2 * Math.acos(Math.max(-1, Math.min(1, arg)));
  if (!(dMax > 0)) return 64;
  return Math.max(1, Math.ceil(sweep / dMax));
}

// ---------- stitching ----------

function ptDist(a, b) {
  const dx = a[0] - b[0], dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
}

// Stitch open segments end-to-end into a single closed polyline. Greedy:
// take the first segment, repeatedly find a segment whose start (or, after
// reverse, whose end) matches the running tail.
function stitchSegments(segments) {
  const pool = segments.map(s => s.slice());
  const used = new Array(pool.length).fill(false);
  const loop = pool[0].slice();
  used[0] = true;

  while (true) {
    const tail = loop[loop.length - 1];
    const head = loop[0];
    let found = -1;
    let reverse = false;
    let appendToTail = true;

    for (let i = 0; i < pool.length; i++) {
      if (used[i]) continue;
      const seg = pool[i];
      const sStart = seg[0], sEnd = seg[seg.length - 1];
      if (ptDist(tail, sStart) < STITCH_TOL) { found = i; reverse = false; appendToTail = true; break; }
      if (ptDist(tail, sEnd)   < STITCH_TOL) { found = i; reverse = true;  appendToTail = true; break; }
      if (ptDist(head, sEnd)   < STITCH_TOL) { found = i; reverse = false; appendToTail = false; break; }
      if (ptDist(head, sStart) < STITCH_TOL) { found = i; reverse = true;  appendToTail = false; break; }
    }

    if (found < 0) break;
    used[found] = true;
    let seg = pool[found];
    if (reverse) seg = seg.slice().reverse();
    if (appendToTail) {
      // skip duplicate join vertex
      for (let k = 1; k < seg.length; k++) loop.push(seg[k]);
    } else {
      // prepend (in reverse order) — skip duplicate join vertex
      for (let k = seg.length - 2; k >= 0; k--) loop.unshift(seg[k]);
    }
  }

  const unusedCount = used.filter(u => !u).length;
  if (unusedCount > 0) {
    throw new Error(
      `DXF: profile is not a single connected loop — ${unusedCount} segment(s) ` +
      `could not be stitched within ${STITCH_TOL} mm`
    );
  }
  if (ptDist(loop[0], loop[loop.length - 1]) > CLOSE_TOL) {
    throw new Error('DXF: stitched polyline is not closed (start ≠ end)');
  }
  return loop;
}

// Drop the last vertex if it duplicates the first (closed-loop convention:
// vertex 0 implicitly connects to vertex n-1).
function dedupeClosed(pts) {
  const out = pts.slice();
  while (out.length >= 2 && ptDist(out[0], out[out.length - 1]) < CLOSE_TOL) {
    out.pop();
  }
  return out;
}

// ---------- profile analysis (used by geometry builder) ----------

// Identify the contiguous run of profile points whose X is within `eps`
// of the maximum X across the whole profile. Returns { startIdx, length }
// where indices wrap around the closed loop. If multiple disjoint runs
// exist, the longest one wins (most natural choice for typical profiles
// where the outer band is one connected arc).
export function findOuterBand(points, eps) {
  const n = points.length;
  if (n < 2) return { startIdx: 0, length: 0 };
  let maxX = -Infinity;
  for (const p of points) if (p[0] > maxX) maxX = p[0];
  const threshold = maxX - eps;

  // Mark each point as outer / not, then find longest contiguous run on
  // the closed loop.
  const isOuter = points.map(p => p[0] >= threshold - 1e-9);
  if (isOuter.every(v => v)) return { startIdx: 0, length: n };
  if (isOuter.every(v => !v)) return { startIdx: 0, length: 0 };

  // Find any non-outer index to anchor a linear scan.
  let anchor = 0;
  while (isOuter[anchor]) anchor++;

  let bestStart = -1, bestLen = 0;
  let i = 0;
  while (i < n) {
    const idx = (anchor + i) % n;
    if (isOuter[idx]) {
      let len = 0;
      while (len < n && isOuter[(anchor + i + len) % n]) len++;
      if (len > bestLen) { bestLen = len; bestStart = idx; }
      i += len;
    } else {
      i++;
    }
  }
  return { startIdx: bestStart, length: bestLen };
}

// Resample a contiguous slice of the profile (described by startIdx + length,
// indices wrap around the closed loop) to exactly `target` points, evenly
// spaced along arc length. The first output point coincides with the
// original start; the last with the original end.
export function resampleSlice(points, startIdx, length, target) {
  if (length < 2 || target < 2) return [];
  const n = points.length;
  const slice = [];
  for (let k = 0; k < length; k++) slice.push(points[(startIdx + k) % n]);
  // Cumulative arc lengths
  const cum = new Float64Array(slice.length);
  for (let k = 1; k < slice.length; k++) {
    cum[k] = cum[k - 1] + ptDist(slice[k - 1], slice[k]);
  }
  const total = cum[cum.length - 1];
  if (!(total > 0)) return slice.slice(0, target);
  const out = [slice[0]];
  let j = 1;
  for (let i = 1; i < target - 1; i++) {
    const s = (i / (target - 1)) * total;
    while (j < cum.length - 1 && cum[j] < s) j++;
    const t = (s - cum[j - 1]) / (cum[j] - cum[j - 1] || 1);
    const a = slice[j - 1], b = slice[j];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  out.push(slice[slice.length - 1]);
  return out;
}

// Replace the slice [startIdx, startIdx+length) (length consecutive points,
// wrapping the closed loop) with `replacement`. `replacement[0]` and
// `replacement[Ny-1]` are expected to coincide with the original slice's
// first and last point so the loop stays geometrically continuous. Returns
// a new closed-loop array `[...replacement, ...rest-of-loop]` where each
// physical vertex appears exactly once.
export function spliceSlice(points, startIdx, length, replacement) {
  const n = points.length;
  const out = replacement.slice();
  const tailStart = (startIdx + length) % n;
  const restLen = n - length;
  for (let k = 0; k < restLen; k++) {
    out.push(points[(tailStart + k) % n]);
  }
  return out;
}
