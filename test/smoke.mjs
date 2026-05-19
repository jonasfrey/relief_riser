// Smoke test: verify the relief geometry is watertight (every undirected
// edge shared by exactly two triangles) and that triangle normals are
// consistently outward. Run with: node test/smoke.mjs

import {
  buildReliefGeometry,
  buildCylindricalGeometry,
  buildPolygonPrismGeometry,
  buildCustomProfileGeometry,
  buildSTLWrapGeometry,
  computeSTLRadiusField,
  estimateTriangleCount,
  estimateCylindricalTriangleCount,
  estimatePolygonPrismTriangleCount,
  estimateCustomProfileTriangleCount,
  estimateSTLWrapTriangleCount
} from '../src/geometry.js';
import { findOuterBand, resampleSlice, spliceSlice, parseDxfProfile } from '../src/dxfReader.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

function makeHeightmap(w, h, factor = 0.4) {
  const data = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      // Some non-trivial pattern so heights vary along edges, in mm.
      const v = ((i * 13 + j * 7 + (i ^ j) * 3) & 0xff) / 255;
      data[i + j * w] = v * factor;
    }
  }
  return { data, width: w, height: h };
}

function checkManifold(geom) {
  const { indices } = geom;
  const triCount = indices.length / 3;
  const edges = new Map();
  const key = (a, b) => a < b ? `${a}-${b}` : `${b}-${a}`;

  for (let t = 0; t < triCount; t++) {
    const a = indices[t * 3], b = indices[t * 3 + 1], c = indices[t * 3 + 2];
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const k = key(u, v);
      edges.set(k, (edges.get(k) || 0) + 1);
    }
  }

  let nonManifold = 0;
  let boundary = 0;
  for (const count of edges.values()) {
    if (count === 1) boundary++;
    else if (count !== 2) nonManifold++;
  }
  return { uniqueEdges: edges.size, nonManifold, boundary, triCount };
}

// Classify each triangle by its face (front/back/top/bottom/left/right wall)
// using vertex indices and positions, then verify the normal points the
// expected outward direction. The naive "centroid-from-center" heuristic
// fails for non-convex relief surfaces, so we use face classification.
function checkOutwardNormals(geom, opts) {
  const { positions, indices, Nx, Ny } = geom;
  const triCount = indices.length / 3;
  const backStart = Nx * Ny;
  const eps = 1e-4;
  const W = opts.plateW, H = opts.plateH;
  let bad = 0;

  for (let t = 0; t < triCount; t++) {
    const ia = indices[t * 3], ib = indices[t * 3 + 1], ic = indices[t * 3 + 2];
    const i0 = ia * 3, i1 = ib * 3, i2 = ic * 3;
    const ax = positions[i0],  ay = positions[i0 + 1], az = positions[i0 + 2];
    const bx = positions[i1],  by = positions[i1 + 1], bz = positions[i1 + 2];
    const ccx = positions[i2], ccy = positions[i2 + 1], ccz = positions[i2 + 2];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = ccx - ax, vy = ccy - ay, vz = ccz - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;

    const aBack = ia >= backStart, bBack = ib >= backStart, cBack = ic >= backStart;
    const allFront = !aBack && !bBack && !cBack;
    const allBack = aBack && bBack && cBack;

    let expected; // 'x+'|'x-'|'y+'|'y-'|'z+'|'z-'
    if (allFront) {
      expected = 'z+';
    } else if (allBack) {
      expected = 'z-';
    } else {
      // wall: classify by shared coordinate
      const minX = Math.min(ax, bx, ccx), maxX = Math.max(ax, bx, ccx);
      const minY = Math.min(ay, by, ccy), maxY = Math.max(ay, by, ccy);
      const halfW = W / 2, halfH = H / 2;
      if (maxX - minX < eps && minX < -halfW + eps) expected = 'x-';
      else if (maxX - minX < eps && maxX > halfW - eps) expected = 'x+';
      else if (maxY - minY < eps && minY < -halfH + eps) expected = 'y-';
      else if (maxY - minY < eps && maxY > halfH - eps) expected = 'y+';
      else { bad++; continue; }
    }

    let comp;
    if (expected === 'x+') comp = nx;
    else if (expected === 'x-') comp = -nx;
    else if (expected === 'y+') comp = ny;
    else if (expected === 'y-') comp = -ny;
    else if (expected === 'z+') comp = nz;
    else comp = -nz;
    if (comp <= 0) bad++;
  }
  return bad;
}

function check(w, h, opts, factor = 0.4) {
  const heightmap = makeHeightmap(w, h, factor);
  const geom = buildReliefGeometry(heightmap, opts);
  const expected = estimateTriangleCount(w, h);
  if (geom.triCount !== expected) {
    throw new Error(`tri count mismatch: ${geom.triCount} vs estimate ${expected}`);
  }
  const m = checkManifold(geom);
  const badNormals = checkOutwardNormals(geom, opts);
  console.log(
    `${w}x${h}: tris=${m.triCount} edges=${m.uniqueEdges} ` +
    `nonManifold=${m.nonManifold} boundary=${m.boundary} ` +
    `inwardNormals=${badNormals}`
  );
  if (m.nonManifold !== 0) throw new Error('non-manifold edges found');
  if (m.boundary !== 0) throw new Error('mesh has boundary edges (not watertight)');
  if (badNormals !== 0) throw new Error('inward-facing normals found');
}

const opts = { plateW: 18, plateH: 18, baseThickness: 1.5 };
check(2, 2, opts);
check(3, 4, opts);
check(8, 8, opts);
check(10, 6, opts);
check(20, 20, opts);
check(50, 30, { ...opts, plateW: 30, plateH: 18 });
// stepped multi-color heights: every other row at 0, others at 0.6mm
{
  const w = 8, h = 8;
  const data = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) data[i + j * w] = (j % 2) ? 0.6 : 0;
  const geom = buildReliefGeometry({ data, width: w, height: h }, opts);
  const m = checkManifold(geom);
  const bad = checkOutwardNormals(geom, opts);
  console.log(`stepped 8x8: tris=${m.triCount} nonManifold=${m.nonManifold} boundary=${m.boundary} inwardNormals=${bad}`);
  if (m.nonManifold !== 0 || m.boundary !== 0 || bad !== 0) throw new Error('stepped mesh failed checks');
}

// ---- cylindrical mesh checks ----

function checkCylinderNormals(geom, opts) {
  const { positions, indices, Nx, Ny } = geom;
  const triCount = indices.length / 3;
  const innerOffset = Nx * Ny;
  const centerStart = 2 * Nx * Ny;
  const eps = 1e-3;
  const H = opts.height;
  let bad = 0;

  for (let t = 0; t < triCount; t++) {
    const ia = indices[t * 3], ib = indices[t * 3 + 1], ic = indices[t * 3 + 2];
    const i0 = ia * 3, i1 = ib * 3, i2 = ic * 3;
    const ax = positions[i0],  ay = positions[i0 + 1], az = positions[i0 + 2];
    const bx = positions[i1],  by = positions[i1 + 1], bz = positions[i1 + 2];
    const ccx = positions[i2], ccy = positions[i2 + 1], ccz = positions[i2 + 2];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = ccx - ax, vy = ccy - ay, vz = ccz - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;

    const isOuter = (idx) => idx < innerOffset;
    const isInner = (idx) => idx >= innerOffset && idx < centerStart;
    const isCenter = (idx) => idx >= centerStart;
    const ouN  = (isOuter(ia)  ? 1 : 0) + (isOuter(ib)  ? 1 : 0) + (isOuter(ic)  ? 1 : 0);
    const inN  = (isInner(ia)  ? 1 : 0) + (isInner(ib)  ? 1 : 0) + (isInner(ic)  ? 1 : 0);
    const cN   = (isCenter(ia) ? 1 : 0) + (isCenter(ib) ? 1 : 0) + (isCenter(ic) ? 1 : 0);

    const minZ = Math.min(az, bz, ccz);
    const maxZ = Math.max(az, bz, ccz);
    const planar = maxZ - minZ < eps;

    let comp;
    if (cN === 1 && ouN === 2) {
      // Bottom face (closed mode): expect −Z at z=0
      if (!planar || Math.abs(maxZ) > eps) { bad++; continue; }
      comp = -nz;
    } else if (cN === 1 && inN === 2) {
      // Inner floor disc (closed mode): expect +Z at z=B
      if (!planar) { bad++; continue; }
      comp = nz;
    } else if (ouN === 3 || inN === 3) {
      const tcx = (ax + bx + ccx) / 3, tcy = (ay + by + ccy) / 3;
      const len = Math.sqrt(tcx * tcx + tcy * tcy) || 1;
      const radial = (nx * tcx + ny * tcy) / len;
      comp = (ouN === 3) ? radial : -radial;
    } else {
      // mixed inner+outer = annular cap (top at z=H +Z, bottom at z=0 −Z)
      if (!planar) { bad++; continue; }
      if (Math.abs(maxZ - H) < eps) comp = nz;
      else if (Math.abs(maxZ) < eps) comp = -nz;
      else { bad++; continue; }
    }
    if (comp <= 0) bad++;
  }
  return bad;
}

function checkCyl(Nx, Ny, opts, fillFn) {
  const data = new Float32Array(Nx * Ny);
  for (let j = 0; j < Ny; j++) for (let i = 0; i < Nx; i++) {
    data[i + j * Nx] = fillFn ? fillFn(i, j) : 0.4 * (((i + j) & 1) ? 1 : 0);
  }
  const geom = buildCylindricalGeometry({ data, width: Nx, height: Ny }, opts);
  const expected = estimateCylindricalTriangleCount(Nx, Ny);
  if (geom.triCount !== expected) {
    throw new Error(`cyl tri count mismatch: ${geom.triCount} vs ${expected}`);
  }
  const m = checkManifold(geom);
  const bad = checkCylinderNormals(geom, opts);
  const euler = geom.vertCount - m.uniqueEdges + m.triCount;
  const expectedEuler = opts.closedBottom === false ? 0 : 2;
  const tag = opts.closedBottom === false ? 'open' : 'closed';
  console.log(
    `cyl ${tag} ${Nx}x${Ny}: V=${geom.vertCount} E=${m.uniqueEdges} F=${m.triCount} ` +
    `nonManifold=${m.nonManifold} boundary=${m.boundary} χ=${euler} badNormals=${bad}`
  );
  if (m.nonManifold !== 0) throw new Error('cyl: non-manifold edges');
  if (m.boundary !== 0) throw new Error('cyl: boundary edges (not watertight)');
  if (euler !== expectedEuler) throw new Error(`cyl: expected χ=${expectedEuler} got ${euler}`);
  if (bad !== 0) throw new Error('cyl: wrong-direction normals');
}

const cylOpenOpts = { diameter: 30, height: 40, baseThickness: 1.5, closedBottom: false };
checkCyl(4, 2, cylOpenOpts);
checkCyl(8, 6, cylOpenOpts);
checkCyl(16, 12, cylOpenOpts);
checkCyl(64, 32, cylOpenOpts, (i, j) => 0.6 * Math.sin(i * 0.5) * Math.cos(j * 0.3));

const cylClosedOpts = { diameter: 30, height: 40, baseThickness: 1.5 };
checkCyl(4, 2, cylClosedOpts);
checkCyl(8, 6, cylClosedOpts);
checkCyl(16, 12, cylClosedOpts);
checkCyl(64, 32, cylClosedOpts, (i, j) => 0.6 * Math.sin(i * 0.5) * Math.cos(j * 0.3));

// Closed bottom with B >= H must error
try {
  buildCylindricalGeometry({ data: new Float32Array(8), width: 4, height: 2 }, { diameter: 10, height: 5, baseThickness: 5 });
  throw new Error('expected throw for B >= H with closed bottom');
} catch (e) {
  if (!/Base thickness/.test(e.message)) throw e;
  console.log('cyl: rejects B >= H with closed bottom ✓');
}

// Reject impossible geometry
try {
  buildCylindricalGeometry({ data: new Float32Array(16), width: 4, height: 4 }, { diameter: 2, height: 10, baseThickness: 5 });
  throw new Error('expected throw for B >= D/2');
} catch (e) {
  if (!/Base thickness/.test(e.message)) throw e;
  console.log('cyl: rejects B >= D/2 ✓');
}

// ---- polygon prism mesh checks ----

function checkPolyNormals(geom, opts) {
  const { positions, indices, innerCount, NxRing, Ny, chamferCount = 0 } = geom;
  const triCount = indices.length / 3;
  const eps = 1e-3;
  const H = opts.height;
  const outerStart = innerCount;
  const outerEnd = innerCount + NxRing * Ny;
  const chamferStart = outerEnd;
  const chamferEnd = chamferStart + chamferCount;
  const centerBase = chamferEnd;

  let bad = 0;
  for (let t = 0; t < triCount; t++) {
    const ia = indices[t * 3], ib = indices[t * 3 + 1], ic = indices[t * 3 + 2];
    const i0 = ia * 3, i1 = ib * 3, i2 = ic * 3;
    const ax = positions[i0],  ay = positions[i0 + 1], az = positions[i0 + 2];
    const bx = positions[i1],  by = positions[i1 + 1], bz = positions[i1 + 2];
    const ccx = positions[i2], ccy = positions[i2 + 1], ccz = positions[i2 + 2];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = ccx - ax, vy = ccy - ay, vz = ccz - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;

    const isInner = (idx) => idx < outerStart;
    const isOuter = (idx) => idx >= outerStart && idx < outerEnd;
    const isChamfer = (idx) => idx >= chamferStart && idx < chamferEnd;
    const isCenter = (idx) => idx >= centerBase;
    const inN  = (isInner(ia) ? 1 : 0)   + (isInner(ib) ? 1 : 0)   + (isInner(ic) ? 1 : 0);
    const ouN  = (isOuter(ia) ? 1 : 0)   + (isOuter(ib) ? 1 : 0)   + (isOuter(ic) ? 1 : 0);
    const cmN  = (isChamfer(ia) ? 1 : 0) + (isChamfer(ib) ? 1 : 0) + (isChamfer(ic) ? 1 : 0);
    const cN   = (isCenter(ia) ? 1 : 0)  + (isCenter(ib) ? 1 : 0)  + (isCenter(ic) ? 1 : 0);

    const minZ = Math.min(az, bz, ccz);
    const maxZ = Math.max(az, bz, ccz);
    const planar = maxZ - minZ < eps;

    let comp;
    if (cN === 1 && ouN === 2) {
      if (!planar || Math.abs(maxZ) > eps) { bad++; continue; }
      comp = -nz;                             // bottom face, expect −Z
    } else if (cN === 1 && inN === 2) {
      if (!planar) { bad++; continue; }
      comp = nz;                              // inner floor disc, expect +Z
    } else if (inN === 3) {
      const tcx = (ax + bx + ccx) / 3, tcy = (ay + by + ccy) / 3;
      const len = Math.sqrt(tcx * tcx + tcy * tcy) || 1;
      comp = -(nx * tcx + ny * tcy) / len;    // inner surface, inward radial
    } else if (ouN === 3) {
      const tcx = (ax + bx + ccx) / 3, tcy = (ay + by + ccy) / 3;
      const len = Math.sqrt(tcx * tcx + tcy * tcy) || 1;
      comp = (nx * tcx + ny * tcy) / len;     // outer surface, outward radial
    } else if (cmN > 0 && cmN + ouN === 3) {
      // Chamfer band: outward radial AND +Z (slope tilts outward and up).
      const tcx = (ax + bx + ccx) / 3, tcy = (ay + by + ccy) / 3;
      const len = Math.sqrt(tcx * tcx + tcy * tcy) || 1;
      const radial = (nx * tcx + ny * tcy) / len;
      if (radial <= 0 || nz <= 0) { bad++; continue; }
      comp = Math.min(radial, nz);
    } else if (cmN > 0 && cmN + inN === 3) {
      // Top edge wall when chamfer is enabled (chamfer ring → inner top, +Z).
      if (!planar || Math.abs(maxZ - H) > eps) { bad++; continue; }
      comp = nz;
    } else {
      // Mixed inner+outer = annular edge wall at z=H (+Z) or z=0 (−Z).
      if (!planar) { bad++; continue; }
      if (Math.abs(maxZ - H) < eps) comp = nz;
      else if (Math.abs(maxZ) < eps) comp = -nz;
      else { bad++; continue; }
    }
    if (comp <= 0) bad++;
  }
  return bad;
}

function checkPoly(N, Nx, Ny, opts, fillFn) {
  const data = new Float32Array(Nx * Ny);
  for (let j = 0; j < Ny; j++) for (let i = 0; i < Nx; i++) {
    data[i + j * Nx] = fillFn ? fillFn(i, j) : 0.4 * (((i + j) & 1) ? 1 : 0);
  }
  const geom = buildPolygonPrismGeometry({ data, width: Nx, height: Ny }, { ...opts, sides: N });
  const expected = estimatePolygonPrismTriangleCount(N, Nx, Ny, (opts.chamferTop || 0) > 0);
  if (geom.triCount !== expected) {
    throw new Error(`poly tri count mismatch: ${geom.triCount} vs ${expected}`);
  }
  const m = checkManifold(geom);
  const bad = checkPolyNormals(geom, opts);
  // Euler χ: torus (0) for open prism, sphere (2) for closed-bottom prism.
  const euler = geom.vertCount - m.uniqueEdges + m.triCount;
  const expectedEuler = opts.closedBottom === false ? 0 : 2;
  const tag = opts.closedBottom === false ? 'open' : 'closed';
  console.log(
    `poly ${tag} N=${N} ${Nx}x${Ny}: V=${geom.vertCount} E=${m.uniqueEdges} F=${m.triCount} ` +
    `nonManifold=${m.nonManifold} boundary=${m.boundary} χ=${euler} badNormals=${bad}`
  );
  if (m.nonManifold !== 0) throw new Error('poly: non-manifold edges');
  if (m.boundary !== 0) throw new Error('poly: boundary edges (not watertight)');
  if (euler !== expectedEuler) throw new Error(`poly: expected χ=${expectedEuler} got ${euler}`);
  if (bad !== 0) throw new Error('poly: wrong-direction normals');
}

const polyOpenOpts = { sideWidth: 20, height: 20, baseThickness: 1.5, closedBottom: false };
checkPoly(3, 2, 2, polyOpenOpts);
checkPoly(4, 2, 2, polyOpenOpts);
checkPoly(4, 6, 6, polyOpenOpts);
checkPoly(5, 8, 4, polyOpenOpts);
checkPoly(8, 12, 8, polyOpenOpts);
checkPoly(4, 30, 30, polyOpenOpts, (i, j) => 0.6 * Math.sin(i * 0.4) * Math.cos(j * 0.5));

const polyClosedOpts = { sideWidth: 20, height: 20, baseThickness: 1.5 }; // closedBottom default true
checkPoly(3, 2, 2, polyClosedOpts);
checkPoly(4, 2, 2, polyClosedOpts);
checkPoly(4, 6, 6, polyClosedOpts);
checkPoly(5, 8, 4, polyClosedOpts);
checkPoly(8, 12, 8, polyClosedOpts);
checkPoly(4, 30, 30, polyClosedOpts, (i, j) => 0.6 * Math.sin(i * 0.4) * Math.cos(j * 0.5));

// Closed bottom with B >= H must error
try {
  buildPolygonPrismGeometry({ data: new Float32Array(4), width: 2, height: 2 }, { sideWidth: 10, height: 5, baseThickness: 5, sides: 4 });
  throw new Error('expected throw for B >= H with closed bottom');
} catch (e) {
  if (!/Base thickness/.test(e.message)) throw e;
  console.log('poly: rejects B >= H with closed bottom ✓');
}

// Chamfered top: triangle count grows by 2·NxRing, mesh stays watertight,
// Euler χ unchanged (sphere when closed, torus when open).
const polyChamferOpts = { sideWidth: 20, height: 20, baseThickness: 1.5, chamferTop: 0.8 };
checkPoly(4, 6, 6, polyChamferOpts);
checkPoly(6, 8, 8, polyChamferOpts);
checkPoly(4, 12, 12, { ...polyChamferOpts, closedBottom: false });
checkPoly(8, 16, 12, polyChamferOpts, (i, j) => 0.4 * Math.sin(i * 0.3) * Math.cos(j * 0.4));

// ---- STL wrap mesh checks (cylindrical wrap around a custom STL) ----

// Build a synthetic cylindrical STL of radius R and height H, axis = Z,
// centered on origin in XY, z from 0..H. Returns { positions, triCount }.
// Triangulation: Nside vertical strips on the side wall + one triangle-fan
// disc on each cap. Closed by construction.
function makeCylinderSTL(R, H, Nside) {
  const tris = [];
  const ring = (z) => {
    const out = [];
    for (let k = 0; k < Nside; k++) {
      const t = (k / Nside) * 2 * Math.PI;
      out.push([R * Math.cos(t), R * Math.sin(t), z]);
    }
    return out;
  };
  const bottom = ring(0);
  const top = ring(H);
  for (let k = 0; k < Nside; k++) {
    const k1 = (k + 1) % Nside;
    tris.push([bottom[k], bottom[k1], top[k1]]);
    tris.push([bottom[k], top[k1], top[k]]);
  }
  const bc = [0, 0, 0];
  for (let k = 0; k < Nside; k++) {
    const k1 = (k + 1) % Nside;
    tris.push([bc, bottom[k1], bottom[k]]);
  }
  const tc = [0, 0, H];
  for (let k = 0; k < Nside; k++) {
    const k1 = (k + 1) % Nside;
    tris.push([tc, top[k], top[k1]]);
  }
  const positions = new Float32Array(tris.length * 9);
  for (let t = 0; t < tris.length; t++) {
    for (let v = 0; v < 3; v++) {
      const p = tris[t][v];
      positions[t * 9 + v * 3]     = p[0];
      positions[t * 9 + v * 3 + 1] = p[1];
      positions[t * 9 + v * 3 + 2] = p[2];
    }
  }
  return { positions, triCount: tris.length };
}

// Sanity check the radius field on a perfect cylinder: R(θ, z) ≈ R for all
// (θ, z) samples in the body.
{
  const Rcyl = 12, Hcyl = 30;
  const stl = makeCylinderSTL(Rcyl, Hcyl, 60);
  const Nx = 48, Ny = 16;
  const eps = Hcyl * 1e-4;
  const field = computeSTLRadiusField(stl, Nx, Ny, eps, Hcyl - eps);
  let minR = Infinity, maxR = -Infinity, sumR = 0, hits = 0;
  for (let i = 0; i < field.length; i++) {
    if (field[i] > 0) { sumR += field[i]; hits++; if (field[i] < minR) minR = field[i]; if (field[i] > maxR) maxR = field[i]; }
  }
  const meanR = hits > 0 ? sumR / hits : 0;
  const cov = hits / field.length;
  console.log(`stlwrap field cylinder: hits=${hits}/${field.length} cov=${(cov*100).toFixed(1)}% R∈[${minR.toFixed(3)}, ${maxR.toFixed(3)}] mean=${meanR.toFixed(3)} (expected ${Rcyl})`);
  if (cov < 0.99) throw new Error(`radius field coverage too low: ${(cov*100).toFixed(1)}%`);
  if (Math.abs(meanR - Rcyl) > Rcyl * 0.005) {
    throw new Error(`radius field mean drifted: got ${meanR.toFixed(3)}, expected ${Rcyl}`);
  }
}

function checkSTLWrapNormals(geom, opts) {
  return checkCylinderNormals(geom, { height: geom.stlHeight, ...opts });
}

function checkSTLWrap(Nx, Ny, stl, opts, fillFn) {
  const data = new Float32Array(Nx * Ny);
  for (let j = 0; j < Ny; j++) for (let i = 0; i < Nx; i++) {
    data[i + j * Nx] = fillFn ? fillFn(i, j) : 0.3 * (((i + j) & 1) ? 1 : 0);
  }
  const geom = buildSTLWrapGeometry({ data, width: Nx, height: Ny }, { ...opts, stl });
  const expected = estimateSTLWrapTriangleCount(Nx, Ny);
  if (geom.triCount !== expected) {
    throw new Error(`stlwrap tri count mismatch: ${geom.triCount} vs ${expected}`);
  }
  const m = checkManifold(geom);
  const bad = checkSTLWrapNormals(geom, opts);
  const euler = geom.vertCount - m.uniqueEdges + m.triCount;
  const expectedEuler = opts.closedBottom === false ? 0 : 2;
  const tag = opts.closedBottom === false ? 'open' : 'closed';
  console.log(
    `stlwrap ${tag} ${Nx}x${Ny}: V=${geom.vertCount} E=${m.uniqueEdges} F=${m.triCount} ` +
    `nonManifold=${m.nonManifold} boundary=${m.boundary} χ=${euler} badNormals=${bad} ` +
    `maxR=${geom.stlMaxR.toFixed(3)} H=${geom.stlHeight.toFixed(3)}`
  );
  if (m.nonManifold !== 0) throw new Error('stlwrap: non-manifold edges');
  if (m.boundary !== 0) throw new Error('stlwrap: boundary edges (not watertight)');
  if (euler !== expectedEuler) throw new Error(`stlwrap: expected χ=${expectedEuler} got ${euler}`);
  if (bad !== 0) throw new Error('stlwrap: wrong-direction normals');
}

{
  const stl = makeCylinderSTL(15, 40, 80);
  const baseOpts = { baseThickness: 1.5 };
  checkSTLWrap(16, 8,  stl, { ...baseOpts });
  checkSTLWrap(32, 12, stl, { ...baseOpts });
  checkSTLWrap(64, 16, stl, { ...baseOpts }, (i, j) => 0.5 * Math.sin(i * 0.3) * Math.cos(j * 0.4));
  checkSTLWrap(16, 8,  stl, { ...baseOpts, closedBottom: false });
  checkSTLWrap(64, 16, stl, { ...baseOpts, closedBottom: false });
}

// Off-center STL: cylinder centered at (10, 5). The wrap mode should center
// it on the Z axis automatically before sampling, so it still wraps cleanly.
{
  const stl = makeCylinderSTL(12, 25, 60);
  for (let i = 0; i < stl.positions.length; i += 3) {
    stl.positions[i]     += 10;
    stl.positions[i + 1] += 5;
  }
  checkSTLWrap(48, 12, stl, { baseThickness: 1.0 });
}

// Reject wrap target whose smallest cross-section is thinner than baseThickness.
try {
  const stl = makeCylinderSTL(2, 20, 40);
  buildSTLWrapGeometry({ data: new Float32Array(16 * 6), width: 16, height: 6 }, {
    stl, baseThickness: 5
  });
  throw new Error('expected throw for B >= min STL radius');
} catch (e) {
  if (!/Base thickness/.test(e.message)) throw e;
  console.log('stlwrap: rejects B >= min STL radius ✓');
}

// ---- custom-profile (revolved DXF) mesh checks ----

function checkCustomNormals(geom) {
  // Toroidal mesh: every triangle should have outward normal in the +radial
  // direction relative to the rotation axis (Z). Inner faces of the profile
  // (those with x < axis-side max) face inward, but in a torus all triangles
  // bound a single connected solid — so outward = pointing away from the
  // *solid interior*, not the rotation axis.
  // We don't have a clean per-triangle expected direction without knowing
  // the profile orientation, so we check global manifoldness + Euler χ = 0
  // (torus topology) only.
  return 0;
}

function checkCustom(profile, outerStart, outerLength, Nx, Ny, fillFn) {
  const data = new Float32Array(Nx * Ny);
  for (let j = 0; j < Ny; j++) for (let i = 0; i < Nx; i++) {
    data[i + j * Nx] = fillFn ? fillFn(i, j) : 0.4 * (((i + j) & 1) ? 1 : 0);
  }
  // Resample band to Ny + splice — same flow as main.js
  const resampled = resampleSlice(profile, outerStart, outerLength, Ny);
  const profilePts = spliceSlice(profile, outerStart, outerLength, resampled);
  const geom = buildCustomProfileGeometry({ data, width: Nx, height: Ny }, {
    profile: profilePts,
    outerStart: 0,
    outerLength: Ny
  });
  const expected = estimateCustomProfileTriangleCount(Nx, profilePts.length);
  if (geom.triCount !== expected) {
    throw new Error(`custom tri count mismatch: ${geom.triCount} vs ${expected}`);
  }
  const m = checkManifold(geom);
  const euler = geom.vertCount - m.uniqueEdges + m.triCount;
  console.log(
    `custom Np=${profilePts.length} Nx=${Nx} Ny=${Ny}: V=${geom.vertCount} E=${m.uniqueEdges} ` +
    `F=${m.triCount} nonManifold=${m.nonManifold} boundary=${m.boundary} χ=${euler}`
  );
  if (m.nonManifold !== 0) throw new Error('custom: non-manifold edges');
  if (m.boundary !== 0) throw new Error('custom: boundary edges (not watertight)');
  if (euler !== 0) throw new Error(`custom: expected χ=0 (torus) got ${euler}`);
  return { geom, profilePts };
}

// Synthetic rectangular profile: simple closed rectangle [10..14] × [0..6].
// Outer band = right side (x = 14). Walking CCW: bottom-left → bottom-right →
// top-right → top-left → close. The right side is two points (br, tr).
{
  const profile = [
    [10, 0],   // bottom-left
    [14, 0],   // bottom-right
    [14, 6],   // top-right
    [10, 6]    // top-left
  ];
  // Outer band detection with 50% width threshold: x > 12 → indices 1, 2 (br, tr)
  const band = findOuterBand(profile, 2);
  if (band.length !== 2 || band.startIdx !== 1) {
    throw new Error(`rect band: got start=${band.startIdx} len=${band.length}, expected start=1 len=2`);
  }
  console.log(`custom: rectangle band detection ✓ (start=${band.startIdx} len=${band.length})`);
  checkCustom(profile, band.startIdx, band.length, 8, 4);
  checkCustom(profile, band.startIdx, band.length, 16, 8, (i, j) => 0.3 * Math.sin(i) * Math.cos(j));
  checkCustom(profile, band.startIdx, band.length, 32, 12);
}

// Real DXF: parse the bundled default ring profile.
{
  const here = dirname(fileURLToPath(import.meta.url));
  const dxfPath = resolve(here, '..', 'public', 'default_ring_profile.dxf');
  const text = readFileSync(dxfPath, 'utf-8');
  const { points } = parseDxfProfile(text);
  console.log(`custom: parsed default DXF — ${points.length} points`);
  if (points.length < 10) throw new Error('custom: default DXF parsed too few points');

  // Width-based outer-band detection (50% of span)
  let minX = Infinity, maxX = -Infinity;
  for (const p of points) { if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0]; }
  const eps = (maxX - minX) * 0.5;
  const band = findOuterBand(points, eps);
  if (band.length < 2) throw new Error('custom: DXF outer band too short');
  console.log(`custom: DXF band start=${band.startIdx} len=${band.length}/${points.length}`);

  checkCustom(points, band.startIdx, band.length, 24, 8);
  checkCustom(points, band.startIdx, band.length, 64, 16, (i, j) => 0.2 * (((i + j) & 1) ? 1 : 0));
}

// Reject profiles that touch / cross the axis
try {
  buildCustomProfileGeometry({ data: new Float32Array(8), width: 4, height: 2 }, {
    profile: [[0, 0], [1, 0], [1, 1], [0, 1]], outerStart: 1, outerLength: 2
  });
  throw new Error('expected throw for profile touching axis');
} catch (e) {
  if (!/strictly outside the axis/.test(e.message)) throw e;
  console.log('custom: rejects profile touching rotation axis ✓');
}

console.log('OK — all geometry checks passed');
