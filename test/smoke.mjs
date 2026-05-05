// Smoke test: verify the relief geometry is watertight (every undirected
// edge shared by exactly two triangles) and that triangle normals are
// consistently outward. Run with: node test/smoke.mjs

import {
  buildReliefGeometry,
  buildCylindricalGeometry,
  buildPolygonPrismGeometry,
  estimateTriangleCount,
  estimateCylindricalTriangleCount,
  estimatePolygonPrismTriangleCount
} from '../src/geometry.js';

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

    const aIn = ia >= innerOffset, bIn = ib >= innerOffset, cIn = ic >= innerOffset;
    const allOut = !aIn && !bIn && !cIn;
    const allIn = aIn && bIn && cIn;

    let comp;
    if (allOut || allIn) {
      const tcx = (ax + bx + ccx) / 3, tcy = (ay + by + ccy) / 3;
      const len = Math.sqrt(tcx * tcx + tcy * tcy) || 1;
      const radial = (nx * tcx + ny * tcy) / len;
      comp = allOut ? radial : -radial;
    } else {
      const minZ = Math.min(az, bz, ccz);
      const maxZ = Math.max(az, bz, ccz);
      if (maxZ - minZ > eps) { bad++; continue; }
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
  console.log(
    `cyl ${Nx}x${Ny}: tris=${m.triCount} edges=${m.uniqueEdges} ` +
    `nonManifold=${m.nonManifold} boundary=${m.boundary} inwardNormals=${bad}`
  );
  if (m.nonManifold !== 0) throw new Error('cyl: non-manifold edges');
  if (m.boundary !== 0) throw new Error('cyl: boundary edges (not watertight)');
  if (bad !== 0) throw new Error('cyl: wrong-direction normals');
}

const cylOpts = { diameter: 30, height: 40, baseThickness: 1.5 };
checkCyl(4, 2, cylOpts);
checkCyl(8, 6, cylOpts);
checkCyl(16, 12, cylOpts);
checkCyl(64, 32, cylOpts, (i, j) => 0.6 * Math.sin(i * 0.5) * Math.cos(j * 0.3));

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
  const { positions, indices, Nx, Ny, sides, innerCount, outerStart } = geom;
  const N = sides;
  const triCount = indices.length / 3;
  const eps = 1e-3;
  const H = opts.height;

  const cosT = new Float32Array(N), sinT = new Float32Array(N);
  for (let k = 0; k < N; k++) {
    cosT[k] = Math.cos((k * 2 * Math.PI) / N);
    sinT[k] = Math.sin((k * 2 * Math.PI) / N);
  }

  const outerEnd = outerStart[N - 1] + Nx * Ny;
  function faceFor(idx) {
    if (idx < innerCount) return -1;
    if (idx >= outerEnd) return -3;       // closed-bottom center vertex
    for (let k = 0; k < N; k++) {
      if (idx >= outerStart[k] && idx < outerStart[k] + Nx * Ny) return k;
    }
    return -2;
  }

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

    const fa = faceFor(ia), fb = faceFor(ib), fc = faceFor(ic);
    const hasCenter = fa === -3 || fb === -3 || fc === -3;
    const allInner = !hasCenter && fa < 0 && fb < 0 && fc < 0;
    const allOuter = fa >= 0 && fb >= 0 && fc >= 0;
    const sameFace = allOuter && fa === fb && fb === fc;

    let comp;
    if (hasCenter) {
      // Bottom face (z=0, −Z) or inner floor disc (z=B, +Z)
      const minZ = Math.min(az, bz, ccz);
      const maxZ = Math.max(az, bz, ccz);
      if (maxZ - minZ > eps) { bad++; continue; }
      comp = (Math.abs(maxZ) < eps) ? -nz : nz;
    } else if (allInner) {
      const tcx = (ax + bx + ccx) / 3, tcy = (ay + by + ccy) / 3;
      const len = Math.sqrt(tcx * tcx + tcy * tcy) || 1;
      comp = -(nx * tcx + ny * tcy) / len;  // expect inward
    } else if (sameFace) {
      // outer face surface — normal should point along +n_k
      comp = nx * cosT[fa] + ny * sinT[fa];
    } else {
      // mix of inner/outer or different outer faces — must be a cap (top/bottom z),
      // an edge wall, a seam wall (between adjacent outer faces), or a corner triangle.
      const minZ = Math.min(az, bz, ccz);
      const maxZ = Math.max(az, bz, ccz);
      if (maxZ - minZ < eps) {
        // planar-in-z triangle: top cap (+Z), bottom face (−Z), or the inner
        // floor disc at z=B which faces +Z into the inner void above it.
        if (Math.abs(maxZ - H) < eps) comp = nz;
        else if (Math.abs(maxZ) < eps) comp = -nz;
        else comp = nz; // mid-height planar => inner floor disc, expects +Z
      } else if (allOuter && (fa !== fb || fa !== fc)) {
        // seam wall — vertices span ≥2 adjacent faces; outward normal is in
        // the corner-bisector direction (positive radial component).
        const tcx = (ax + bx + ccx) / 3, tcy = (ay + by + ccy) / 3;
        const len = Math.sqrt(tcx * tcx + tcy * tcy) || 1;
        comp = (nx * tcx + ny * tcy) / len;
      } else {
        bad++; continue;
      }
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
  const expected = estimatePolygonPrismTriangleCount(N, Nx, Ny);
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

console.log('OK — all geometry checks passed');
