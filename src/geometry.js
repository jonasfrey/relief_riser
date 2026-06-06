// license Jonas Immanuel Frey GPL
// Build an indexed triangle mesh for a relief plate.
//
// Convention: model rests on Z=0, relief rises in +Z, plate spans [0,W] in X
// and [0,H] in Y. The mesh is watertight: every edge is shared by exactly two
// triangles. We use two parallel grids (front + back) of identical XY
// positions so the side walls become regular quad strips.

export function estimateTriangleCount(Nx, Ny) {
  return 4 * (Nx - 1) * (Ny - 1) + 4 * (Nx + Ny - 2);
}

export function estimateCylindricalTriangleCount(Nx, Ny) {
  // outer + inner: 2 × Nx × (Ny−1) each; top + bottom annular caps: 2 × Nx each
  return 4 * Nx * Ny;
}

export function estimateCustomProfileTriangleCount(Nth, Nprofile) {
  // Toroidal grid Nth × Nprofile, both directions wrap closed → 2·Nth·Nprofile triangles.
  return 2 * Nth * Nprofile;
}

export function estimateSTLWrapTriangleCount(Nx, Ny) {
  // Same topology as the regular cylinder: outer + inner shells + top/bottom caps.
  return 4 * Nx * Ny;
}

export function estimateSTLFaceTriangleCount(Nx, Ny) {
  // Just the embossed relief patch (a flat plate's topology). The untouched
  // STL's own triangles are added by the caller, which knows their fixed count.
  return estimateTriangleCount(Nx, Ny);
}

export function estimateEllipseTriangleCount(Nx, Ny) {
  // outer + inner shells: 4·Nx·(Ny−1); top cap (annular): 2·Nx; bottom: up to
  // 6·Nx when a partial hole adds side walls + inner floor. Use the upper
  // bound so the auto/hard limits don't underestimate.
  return 4 * Nx * (Ny - 1) + 8 * Nx;
}

export function estimateRectProfileTriangleCount(Nx, Ny) {
  // outer + inner shells: 4·Nx·(Ny−1); top cap: 2·Nx; bottom + floor fans: 2·Nx
  return 4 * Nx * (Ny - 1) + 4 * Nx;
}

export function estimatePolygonPrismTriangleCount(N, NxPerFace, Ny, hasChamfer) {
  // With shared outer corners the outer is also a single closed ring. Both
  // inner and outer rings have NxRing = N·(Nx−1) vertices around. Surface =
  // 4·NxRing·(Ny−1); top + bottom caps (open) or bottom face + inner floor
  // disc (closed) = 4·NxRing. The optional top chamfer adds 2·NxRing more.
  const NxRing = N * (NxPerFace - 1);
  return 4 * NxRing * Ny + (hasChamfer ? 2 * NxRing : 0);
}

export function buildReliefGeometry(heightmap, opts) {
  // heightmap: { data: Float32Array of mm above the base, width, height }
  // opts: { plateW, plateH, baseThickness }
  const Nx = heightmap.width;
  const Ny = heightmap.height;
  if (Nx < 2 || Ny < 2) {
    throw new Error('Heightmap must be at least 2x2');
  }

  const totalVerts = 2 * Nx * Ny;
  const positions = new Float32Array(totalVerts * 3);

  const W = opts.plateW;
  const H = opts.plateH;
  const base = opts.baseThickness;

  // Plate is centered on the X/Y origin: X spans [-W/2, W/2], Y spans
  // [-H/2, H/2]. Z still rests on 0 so the model sits on the build plate.
  const halfW = W / 2;
  const halfH = H / 2;

  // Front grid (variable Z = base + heightmap[i,j])
  for (let j = 0; j < Ny; j++) {
    for (let i = 0; i < Nx; i++) {
      const vi = (i + j * Nx) * 3;
      const x = (i / (Nx - 1)) * W - halfW;
      // Image rows go top→bottom in pixel order, but in 3D we want pixel row
      // 0 to map to the top of the plate (+Y) so the relief reads upright.
      const y = halfH - (j / (Ny - 1)) * H;
      const z = base + heightmap.data[i + j * Nx];
      positions[vi]     = x;
      positions[vi + 1] = y;
      positions[vi + 2] = z;
    }
  }

  // Back grid (Z = 0)
  const backOffset = Nx * Ny;
  for (let j = 0; j < Ny; j++) {
    for (let i = 0; i < Nx; i++) {
      const vi = (backOffset + i + j * Nx) * 3;
      const x = (i / (Nx - 1)) * W - halfW;
      const y = halfH - (j / (Ny - 1)) * H;
      positions[vi]     = x;
      positions[vi + 1] = y;
      positions[vi + 2] = 0;
    }
  }

  const triCount = estimateTriangleCount(Nx, Ny);
  const indices = new Uint32Array(triCount * 3);
  let p = 0;

  const front = (i, j) => i + j * Nx;
  const back = (i, j) => backOffset + i + j * Nx;

  // Front face — but Y is flipped (j=0 → Y=H), so to keep CCW outward (+Z)
  // we flip the winding compared to a naive (i,j) → (x,y) mapping.
  for (let j = 0; j < Ny - 1; j++) {
    for (let i = 0; i < Nx - 1; i++) {
      const a = front(i, j);
      const b = front(i + 1, j);
      const c = front(i + 1, j + 1);
      const d = front(i, j + 1);
      // For Y-flipped grid, +Z normal requires (a, c, b) and (a, d, c)
      indices[p++] = a; indices[p++] = c; indices[p++] = b;
      indices[p++] = a; indices[p++] = d; indices[p++] = c;
    }
  }

  // Back face — opposite winding for -Z normal
  for (let j = 0; j < Ny - 1; j++) {
    for (let i = 0; i < Nx - 1; i++) {
      const a = back(i, j);
      const b = back(i + 1, j);
      const c = back(i + 1, j + 1);
      const d = back(i, j + 1);
      indices[p++] = a; indices[p++] = b; indices[p++] = c;
      indices[p++] = a; indices[p++] = c; indices[p++] = d;
    }
  }

  // Top wall (j = 0 → Y = H, normal +Y)
  for (let i = 0; i < Nx - 1; i++) {
    const f0 = front(i, 0), f1 = front(i + 1, 0);
    const b0 = back(i, 0),  b1 = back(i + 1, 0);
    indices[p++] = f0; indices[p++] = b1; indices[p++] = b0;
    indices[p++] = f0; indices[p++] = f1; indices[p++] = b1;
  }

  // Bottom wall (j = Ny-1 → Y = 0, normal -Y)
  for (let i = 0; i < Nx - 1; i++) {
    const f0 = front(i, Ny - 1), f1 = front(i + 1, Ny - 1);
    const b0 = back(i, Ny - 1),  b1 = back(i + 1, Ny - 1);
    indices[p++] = f0; indices[p++] = b0; indices[p++] = b1;
    indices[p++] = f0; indices[p++] = b1; indices[p++] = f1;
  }

  // Left wall (i = 0, normal -X)
  for (let j = 0; j < Ny - 1; j++) {
    const f0 = front(0, j), f1 = front(0, j + 1);
    const b0 = back(0, j),  b1 = back(0, j + 1);
    indices[p++] = f0; indices[p++] = b0; indices[p++] = b1;
    indices[p++] = f0; indices[p++] = b1; indices[p++] = f1;
  }

  // Right wall (i = Nx-1, normal +X)
  for (let j = 0; j < Ny - 1; j++) {
    const f0 = front(Nx - 1, j), f1 = front(Nx - 1, j + 1);
    const b0 = back(Nx - 1, j),  b1 = back(Nx - 1, j + 1);
    indices[p++] = f0; indices[p++] = b1; indices[p++] = b0;
    indices[p++] = f0; indices[p++] = f1; indices[p++] = b1;
  }

  return {
    positions,
    indices,
    triCount,
    vertCount: totalVerts,
    Nx,
    Ny
  };
}

// Flood-fill the flat face that contains triangle `startTri`: the connected set
// of triangles whose normal stays within `angleTolDeg` of the seed triangle's
// normal. Comparing every candidate to the SEED (not its neighbour) stops the
// fill from leaking around a gently curved edge (e.g. a rounded top) onto a
// surface that isn't really part of the flat face.
//
// `rotation` (radians) spins the in-plane (u,v) frame around the face normal so
// the relief image can be oriented on the face. Returns null if startTri is out
// of range. The result describes the face well enough to both size the relief
// (bbox) and rebuild it (triangle list, welded ids, basis, origin).
export function extractCoplanarFace(stl, startTri, rotation = 0, angleTolDeg = 12) {
  const pos = stl.positions;
  const triCount = stl.triCount;
  if (!(startTri >= 0) || startTri >= triCount) return null;

  const triNormal = (t) => {
    const o = t * 9;
    const ax = pos[o],     ay = pos[o + 1], az = pos[o + 2];
    const bx = pos[o + 3], by = pos[o + 4], bz = pos[o + 5];
    const cx = pos[o + 6], cy = pos[o + 7], cz = pos[o + 8];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    return [nx / l, ny / l, nz / l];
  };

  // Weld vertices by quantized position so we can build edge adjacency.
  const vmap = new Map();
  const vids = new Int32Array(triCount * 3);
  const q = (v) => Math.round(v * 10000);
  let nextId = 0;
  for (let i = 0; i < triCount * 3; i++) {
    const o = i * 3;
    const key = q(pos[o]) + ',' + q(pos[o + 1]) + ',' + q(pos[o + 2]);
    let id = vmap.get(key);
    if (id === undefined) { id = nextId++; vmap.set(key, id); }
    vids[i] = id;
  }

  const edgeKey = (a, b) => (a < b ? a * 4294967296 + b : b * 4294967296 + a);
  const edgeMap = new Map();
  for (let t = 0; t < triCount; t++) {
    const a = vids[t * 3], b = vids[t * 3 + 1], c = vids[t * 3 + 2];
    const es = [[a, b], [b, c], [c, a]];
    for (const [u, v] of es) {
      const k = edgeKey(u, v);
      let arr = edgeMap.get(k);
      if (!arr) { arr = []; edgeMap.set(k, arr); }
      arr.push(t);
    }
  }

  const n0 = triNormal(startTri);
  const cosTol = Math.cos(angleTolDeg * Math.PI / 180);
  const visited = new Uint8Array(triCount);
  const face = [startTri];
  visited[startTri] = 1;
  const stack = [startTri];
  while (stack.length) {
    const t = stack.pop();
    const a = vids[t * 3], b = vids[t * 3 + 1], c = vids[t * 3 + 2];
    const es = [[a, b], [b, c], [c, a]];
    for (const [u, v] of es) {
      const arr = edgeMap.get(edgeKey(u, v));
      if (!arr) continue;
      for (const nb of arr) {
        if (visited[nb]) continue;
        const nn = triNormal(nb);
        if (n0[0] * nn[0] + n0[1] * nn[1] + n0[2] * nn[2] < cosTol) continue;
        visited[nb] = 1;
        face.push(nb);
        stack.push(nb);
      }
    }
  }

  // In-plane basis (tu, tv) ⟂ n0, optionally spun by `rotation`. Origin is the
  // seed triangle's first vertex.
  const nx = n0[0], ny = n0[1], nz = n0[2];
  let ux = 0, uy = 0, uz = 1;
  if (Math.abs(nz) > 0.9) { ux = 1; uy = 0; uz = 0; }
  let tux = uy * nz - uz * ny, tuy = uz * nx - ux * nz, tuz = ux * ny - uy * nx;
  const tl = Math.hypot(tux, tuy, tuz) || 1;
  tux /= tl; tuy /= tl; tuz /= tl;
  let tvx = ny * tuz - nz * tuy, tvy = nz * tux - nx * tuz, tvz = nx * tuy - ny * tux;
  if (rotation) {
    const c = Math.cos(rotation), s = Math.sin(rotation);
    const u2x = tux * c + tvx * s, u2y = tuy * c + tvy * s, u2z = tuz * c + tvz * s;
    const v2x = -tux * s + tvx * c, v2y = -tuy * s + tvy * c, v2z = -tuz * s + tvz * c;
    tux = u2x; tuy = u2y; tuz = u2z;
    tvx = v2x; tvy = v2y; tvz = v2z;
  }

  const o0 = startTri * 9;
  const origin = [pos[o0], pos[o0 + 1], pos[o0 + 2]];
  let umin = Infinity, umax = -Infinity, vmin = Infinity, vmax = -Infinity;
  for (const t of face) {
    for (let k = 0; k < 3; k++) {
      const o = (t * 3 + k) * 3;
      const dx = pos[o] - origin[0], dy = pos[o + 1] - origin[1], dz = pos[o + 2] - origin[2];
      const u = dx * tux + dy * tuy + dz * tuz;
      const v = dx * tvx + dy * tvy + dz * tvz;
      if (u < umin) umin = u; if (u > umax) umax = u;
      if (v < vmin) vmin = v; if (v > vmax) vmax = v;
    }
  }

  return {
    tris: face,
    vids,
    basis: { tu: [tux, tuy, tuz], tv: [tvx, tvy, tvz], n: n0, origin },
    bbox: { umin, umax, vmin, vmax }
  };
}

// Emboss a relief that automatically conforms to a picked flat face of an STL.
// The whole STL is preserved; on top of the picked face we add a slab whose
// outline matches the face exactly (the face's own triangles form the slab's
// top + bottom), and whose local thickness = baseThickness + heightmap sampled
// across the face's (u,v) bounding box. So the image fills the face's silhouette
// (e.g. a semicircular arch), not just a rectangle.
//
// opts: {
//   stl,                         // { positions, triCount }
//   region,                      // result of extractCoplanarFace, or null
//   baseThickness                // minimum slab thickness over the whole face
// }
// With region === null the STL alone is returned so the user can see it and
// click a face. faceTopVertCount + faceTopUV let the caller color the relief
// surface from the image and leave the rest of the model neutral.
export function buildSTLFaceGeometry(heightmap, opts) {
  const stl = opts.stl;
  if (!stl || !stl.positions || !stl.triCount) {
    throw new Error('STL face mode needs a loaded STL');
  }
  const stlVertCount = stl.triCount * 3;

  const stlOnly = () => {
    const positions = stl.positions.slice();
    const indices = new Uint32Array(stlVertCount);
    for (let i = 0; i < stlVertCount; i++) indices[i] = i;
    return {
      positions, indices,
      triCount: stl.triCount,
      vertCount: stlVertCount,
      faceTopVertCount: 0, faceTopUV: null, reliefVertCount: 0
    };
  };

  const region = opts.region;
  if (!region || !region.tris.length) return stlOnly();

  const pos = stl.positions;
  const { tris, vids, basis, bbox } = region;
  const { tu, tv, n, origin } = basis;
  const base = opts.baseThickness || 0;
  const W = heightmap.width, H = heightmap.height;
  const data = heightmap.data;
  const uSpan = (bbox.umax - bbox.umin) || 1;
  const vSpan = (bbox.vmax - bbox.vmin) || 1;

  // Bilinear height sample at face coordinate (u, v). Image row 0 maps to the
  // top of the face (+v) so the relief reads upright.
  const sampleH = (u, v) => {
    const fx = (u - bbox.umin) / uSpan;
    const fy = (v - bbox.vmin) / vSpan;
    let px = fx * (W - 1);
    let py = (1 - fy) * (H - 1);
    if (px < 0) px = 0; else if (px > W - 1) px = W - 1;
    if (py < 0) py = 0; else if (py > H - 1) py = H - 1;
    const x0 = px | 0, y0 = py | 0;
    const x1 = x0 + 1 < W ? x0 + 1 : x0;
    const y1 = y0 + 1 < H ? y0 + 1 : y0;
    const dx = px - x0, dy = py - y0;
    const h00 = data[y0 * W + x0], h10 = data[y0 * W + x1];
    const h01 = data[y1 * W + x0], h11 = data[y1 * W + x1];
    return (h00 * (1 - dx) + h10 * dx) * (1 - dy) + (h01 * (1 - dx) + h11 * dx) * dy;
  };

  const F = tris.length;
  // Vertices: top (displaced) then bottom (original face) — each F*3.
  const topCount = F * 3;
  const botCount = F * 3;

  // Boundary edges (used by exactly one face triangle) get a side wall.
  const edgeKey = (a, b) => (a < b ? a * 4294967296 + b : b * 4294967296 + a);
  const edgeUse = new Map(); // key -> [count, f, k]
  for (let f = 0; f < F; f++) {
    const t = tris[f];
    const ids = [vids[t * 3], vids[t * 3 + 1], vids[t * 3 + 2]];
    for (let k = 0; k < 3; k++) {
      const key = edgeKey(ids[k], ids[(k + 1) % 3]);
      const e = edgeUse.get(key);
      if (e) e[0]++; else edgeUse.set(key, [1, f, k]);
    }
  }
  const boundary = [];
  for (const e of edgeUse.values()) if (e[0] === 1) boundary.push([e[1], e[2]]);

  const reliefVertCount = topCount + botCount;
  const totalVerts = reliefVertCount + stlVertCount;
  const positions = new Float32Array(totalVerts * 3);
  const faceTopUV = new Float32Array(topCount * 2);

  // Face centroid (for orienting side walls outward).
  let ccx = 0, ccy = 0, ccz = 0;
  for (let f = 0; f < F; f++) {
    const t = tris[f];
    for (let k = 0; k < 3; k++) {
      const o = (t * 3 + k) * 3;
      ccx += pos[o]; ccy += pos[o + 1]; ccz += pos[o + 2];
    }
  }
  ccx /= topCount; ccy /= topCount; ccz /= topCount;

  // Fill top + bottom vertices.
  const botBase = topCount;
  for (let f = 0; f < F; f++) {
    const t = tris[f];
    for (let k = 0; k < 3; k++) {
      const o = (t * 3 + k) * 3;
      const x = pos[o], y = pos[o + 1], z = pos[o + 2];
      const dx = x - origin[0], dy = y - origin[1], dz = z - origin[2];
      const u = dx * tu[0] + dy * tu[1] + dz * tu[2];
      const v = dx * tv[0] + dy * tv[1] + dz * tv[2];
      const h = base + sampleH(u, v);
      const ti = f * 3 + k;
      positions[ti * 3]     = x + n[0] * h;
      positions[ti * 3 + 1] = y + n[1] * h;
      positions[ti * 3 + 2] = z + n[2] * h;
      faceTopUV[ti * 2]     = (u - bbox.umin) / uSpan;
      faceTopUV[ti * 2 + 1] = (v - bbox.vmin) / vSpan;
      const bi = botBase + f * 3 + k;
      positions[bi * 3]     = x;
      positions[bi * 3 + 1] = y;
      positions[bi * 3 + 2] = z;
    }
  }
  // STL vertices appended after the relief slab.
  positions.set(stl.positions, reliefVertCount * 3);

  // Index buffer: top (CCW, +n out) + bottom (reversed, −n out) + side walls + STL.
  const triTotal = F + F + boundary.length * 2 + stl.triCount;
  const indices = new Uint32Array(triTotal * 3);
  let p = 0;
  for (let f = 0; f < F; f++) {
    const a = f * 3, b = f * 3 + 1, c = f * 3 + 2;
    indices[p++] = a; indices[p++] = b; indices[p++] = c;        // top
    const ba = botBase + a, bb = botBase + b, bc = botBase + c;
    indices[p++] = ba; indices[p++] = bc; indices[p++] = bb;     // bottom (reversed)
  }
  // Side walls: for each boundary edge connect bottom→top. Pick the winding
  // whose normal points away from the face centroid.
  for (const [f, k] of boundary) {
    const tA = f * 3 + k, tB = f * 3 + (k + 1) % 3;       // top verts
    const bA = botBase + tA, bB = botBase + tB;           // bottom verts
    const ax = positions[bA * 3], ay = positions[bA * 3 + 1], az = positions[bA * 3 + 2];
    const bx = positions[bB * 3], by = positions[bB * 3 + 1], bz = positions[bB * 3 + 2];
    // Edge dir × n gives the wall normal candidate.
    const ex = bx - ax, ey = by - ay, ez = bz - az;
    const wnx = ey * n[2] - ez * n[1];
    const wny = ez * n[0] - ex * n[2];
    const wnz = ex * n[1] - ey * n[0];
    // Outward = away from the face centroid (measured at the edge midpoint).
    const mx = (ax + bx) / 2 - ccx, my = (ay + by) / 2 - ccy, mz = (az + bz) / 2 - ccz;
    const outward = wnx * mx + wny * my + wnz * mz >= 0;
    if (outward) {
      indices[p++] = bA; indices[p++] = bB; indices[p++] = tB;
      indices[p++] = bA; indices[p++] = tB; indices[p++] = tA;
    } else {
      indices[p++] = bA; indices[p++] = tB; indices[p++] = bB;
      indices[p++] = bA; indices[p++] = tA; indices[p++] = tB;
    }
  }
  // STL triangles.
  for (let i = 0; i < stlVertCount; i++) indices[p++] = reliefVertCount + i;

  return {
    positions, indices,
    triCount: triTotal,
    vertCount: totalVerts,
    faceTopVertCount: topCount,
    faceTopUV,
    reliefVertCount
  };
}

// Build a thick-walled cylinder where the outer surface carries the relief
// mapped via polar coordinates and the inner surface is smooth at radius
// D/2 − baseThickness.
//
// The cylinder axis is the Z axis. The model rests on Z=0 and rises to Z=H.
// The image's pixel column 0 corresponds to angle θ=0 and increases CCW
// (looking from +Z); pixel row 0 corresponds to z=H.
//
// closedBottom (default true): inner surface stops at z=B; the bottom is a
// solid disc at z=0 plus an inner floor disc at z=B sealing the inner void
// (sphere topology). Open mode keeps the original annular bottom cap and
// both ends open through the central axis (torus topology).
export function buildCylindricalGeometry(heightmap, opts) {
  const Nx = heightmap.width;
  const Ny = heightmap.height;
  if (Nx < 3 || Ny < 2) {
    throw new Error('Cylindrical mesh requires Nx >= 3 and Ny >= 2');
  }

  const D = opts.diameter;
  const H = opts.height;
  const B = opts.baseThickness;
  const closedBottom = opts.closedBottom !== false;
  const Rbase = D / 2;
  const Rinner = Rbase - B;
  if (Rinner <= 0) {
    throw new Error(`Base thickness (${B}) must be smaller than D/2 (${Rbase})`);
  }
  if (closedBottom && B >= H) {
    throw new Error('Base thickness must be smaller than height for closed bottom');
  }

  const innerZBottom = closedBottom ? B : 0;
  const extraVerts = closedBottom ? 2 : 0;
  const totalVerts = 2 * Nx * Ny + extraVerts;
  const positions = new Float32Array(totalVerts * 3);
  const innerOffset = Nx * Ny;

  const cosT = new Float32Array(Nx);
  const sinT = new Float32Array(Nx);
  for (let i = 0; i < Nx; i++) {
    const t = (i / Nx) * 2 * Math.PI;
    cosT[i] = Math.cos(t);
    sinT[i] = Math.sin(t);
  }

  // Outer surface (variable radius)
  for (let j = 0; j < Ny; j++) {
    const z = H - (j / (Ny - 1)) * H;
    for (let i = 0; i < Nx; i++) {
      const r = Rbase + heightmap.data[i + j * Nx];
      const vi = (i + j * Nx) * 3;
      positions[vi]     = r * cosT[i];
      positions[vi + 1] = r * sinT[i];
      positions[vi + 2] = z;
    }
  }
  // Inner surface (constant radius). z range is [innerZBottom, H] so the
  // closed-bottom case has the inner surface stop at the top of the floor.
  for (let j = 0; j < Ny; j++) {
    const z = H - (j / (Ny - 1)) * (H - innerZBottom);
    for (let i = 0; i < Nx; i++) {
      const vi = (innerOffset + i + j * Nx) * 3;
      positions[vi]     = Rinner * cosT[i];
      positions[vi + 1] = Rinner * sinT[i];
      positions[vi + 2] = z;
    }
  }

  // Center vertices for closed-bottom mode
  const centerBase = 2 * Nx * Ny;
  const bottomCenter = closedBottom ? centerBase : -1;
  const floorCenter  = closedBottom ? centerBase + 1 : -1;
  if (closedBottom) {
    positions[bottomCenter * 3]     = 0;
    positions[bottomCenter * 3 + 1] = 0;
    positions[bottomCenter * 3 + 2] = 0;
    positions[floorCenter * 3]      = 0;
    positions[floorCenter * 3 + 1]  = 0;
    positions[floorCenter * 3 + 2]  = B;
  }

  const triCount = estimateCylindricalTriangleCount(Nx, Ny);
  const indices = new Uint32Array(triCount * 3);
  let p = 0;

  const wrap = (i) => (i === Nx ? 0 : i);
  const outer = (i, j) => wrap(i) + j * Nx;
  const inner = (i, j) => innerOffset + wrap(i) + j * Nx;

  // Outer surface: outward radial normals
  // Cell (i,j): a=(i,j) top-left, b=(i+1,j) top-right, c=(i+1,j+1), d=(i,j+1)
  for (let j = 0; j < Ny - 1; j++) {
    for (let i = 0; i < Nx; i++) {
      const a = outer(i, j), b = outer(i + 1, j);
      const c = outer(i + 1, j + 1), d = outer(i, j + 1);
      indices[p++] = a; indices[p++] = d; indices[p++] = c;
      indices[p++] = a; indices[p++] = c; indices[p++] = b;
    }
  }
  // Inner surface: inward radial normals (reverse winding)
  for (let j = 0; j < Ny - 1; j++) {
    for (let i = 0; i < Nx; i++) {
      const a = inner(i, j), b = inner(i + 1, j);
      const c = inner(i + 1, j + 1), d = inner(i, j + 1);
      indices[p++] = a; indices[p++] = c; indices[p++] = d;
      indices[p++] = a; indices[p++] = b; indices[p++] = c;
    }
  }
  // Top cap (j=0, z=H, normal +Z): annular ring outer→inner
  for (let i = 0; i < Nx; i++) {
    const a = outer(i, 0),     b = outer(i + 1, 0);
    const c = inner(i + 1, 0), d = inner(i, 0);
    indices[p++] = a; indices[p++] = b; indices[p++] = c;
    indices[p++] = a; indices[p++] = c; indices[p++] = d;
  }
  if (!closedBottom) {
    // Bottom cap (j=Ny-1, z=0, normal -Z): reverse winding annular ring.
    for (let i = 0; i < Nx; i++) {
      const a = outer(i, Ny - 1),     b = outer(i + 1, Ny - 1);
      const c = inner(i + 1, Ny - 1), d = inner(i, Ny - 1);
      indices[p++] = a; indices[p++] = c; indices[p++] = b;
      indices[p++] = a; indices[p++] = d; indices[p++] = c;
    }
  } else {
    // Closed bottom: solid disc at z=0 (normal -Z) + inner floor disc at z=B
    // (normal +Z) sealing the inner void.
    for (let i = 0; i < Nx; i++) {
      const a = outer(i,     Ny - 1);
      const b = outer(i + 1, Ny - 1);
      indices[p++] = bottomCenter; indices[p++] = b; indices[p++] = a;
    }
    for (let i = 0; i < Nx; i++) {
      const i0 = inner(i,     Ny - 1);
      const i1 = inner(i + 1, Ny - 1);
      indices[p++] = floorCenter; indices[p++] = i0; indices[p++] = i1;
    }
  }

  return {
    positions,
    indices,
    triCount,
    vertCount: totalVerts,
    Nx,
    Ny
  };
}

// Build an N-sided polygon prism ("hollow box") where each flat outer face
// carries the same relief image. Both inner and outer surfaces are a
// SINGLE shared closed ring of N·(Nx−1) vertices around — adjacent faces
// share the polygon-corner vertex, so the outer surface meets at sharp
// polygon edges with no protrusion / bevel. The relief at the corner
// vertices is forced to 0 so the corner sits exactly on the polygon
// outer corner; image content right at column 0 / column Nx−1 fades to
// flat there. Use the *Margin X* control if you want a wider clean
// transition than a single column at the corner.
//
// Convention: `sideWidth` is the OUTER side length. Wall thickness B sits
// inward, so the inner side length = 2·(W/(2·tan(π/N)) − B)·tan(π/N).
//
// closedBottom (default true): the inner surface stops at z=B and a flat
// floor seals the bottom. Open mode = annular bottom cap, like the cylinder.
export function buildPolygonPrismGeometry(heightmap, opts) {
  const Nx = heightmap.width;        // vertices per face along the side width
  const Ny = heightmap.height;       // vertices along Z
  if (Nx < 2 || Ny < 2) {
    throw new Error('Polygon prism heightmap must be at least 2x2');
  }
  const N = Math.max(3, Math.min(64, opts.sides | 0));
  const W = opts.sideWidth;        // OUTER side length
  const H = opts.height;
  const B = opts.baseThickness;
  const closedBottom = opts.closedBottom !== false;

  const tanHalfAngle = Math.tan(Math.PI / N);
  const outerApothem = W / (2 * tanHalfAngle);
  const innerApothem = outerApothem - B;
  if (!(innerApothem > 0)) {
    throw new Error('Base thickness must be smaller than apothem (W / (2·tan(π/N)))');
  }
  if (closedBottom && B >= H) {
    throw new Error('Base thickness must be smaller than height for closed bottom');
  }
  const Winner = 2 * innerApothem * tanHalfAngle;

  // Optional 45° top chamfer: cuts back the perpendicular distance by
  // `chamferTop` (mm) and lowers the top of the relief surface by the same
  // amount. Constrained so the chamfer can't punch through to the inner
  // surface or eat the whole relief height.
  const innerZBottom = closedBottom ? B : 0;
  const chamferRaw = Math.max(0, Number(opts.chamferTop) || 0);
  const chamferTop = Math.min(chamferRaw, B * 0.95, (H - innerZBottom) * 0.4);
  const hasChamfer = chamferTop > 0;
  const outerZTop = H - chamferTop;

  const NxRing = N * (Nx - 1);            // shared ring vertex count (both rings)
  const innerCount = NxRing * Ny;
  const outerCount = NxRing * Ny;
  const chamferCount = hasChamfer ? NxRing : 0;
  const extraVerts = closedBottom ? 2 : 0;
  const totalVerts = innerCount + outerCount + chamferCount + extraVerts;
  const positions = new Float32Array(totalVerts * 3);

  const cosT = new Float32Array(N);
  const sinT = new Float32Array(N);
  for (let k = 0; k < N; k++) {
    const t = (k * 2 * Math.PI) / N;
    cosT[k] = Math.cos(t);
    sinT[k] = Math.sin(t);
  }

  // Inner ring (shared closed loop, inner side length, inner apothem).
  for (let j = 0; j < Ny; j++) {
    const z = H - (j / (Ny - 1)) * (H - innerZBottom);
    for (let i = 0; i < NxRing; i++) {
      const k = Math.floor(i / (Nx - 1));
      const col = i - k * (Nx - 1);
      const s = (col / (Nx - 1)) * Winner - Winner / 2;
      const cT = cosT[k], sT = sinT[k];
      const x = innerApothem * cT - s * sT;
      const y = innerApothem * sT + s * cT;
      const vi = (i + j * NxRing) * 3;
      positions[vi]     = x;
      positions[vi + 1] = y;
      positions[vi + 2] = z;
    }
  }

  // Outer ring (shared closed loop, outer side length, outer apothem).
  // Corner vertices (col == 0) get relief = 0 so they sit exactly on the
  // polygon's natural outer corner; the same vertex is the right corner of
  // face k−1 and the left corner of face k. Image cols 0 and Nx−1 effectively
  // contribute the same physical vertex, with relief clamped to 0 there.
  // The relief surface tops out at z = H − chamferTop so the chamfer band
  // (when enabled) sits between this row and z = H.
  for (let j = 0; j < Ny; j++) {
    const z = outerZTop - (j / (Ny - 1)) * outerZTop;
    for (let i = 0; i < NxRing; i++) {
      const k = Math.floor(i / (Nx - 1));
      const col = i - k * (Nx - 1);
      const s = (col / (Nx - 1)) * W - W / 2;
      const relief = (col === 0) ? 0 : heightmap.data[col + j * Nx];
      const r = outerApothem + relief;
      const cT = cosT[k], sT = sinT[k];
      const x = r * cT - s * sT;
      const y = r * sT + s * cT;
      const vi = (innerCount + i + j * NxRing) * 3;
      positions[vi]     = x;
      positions[vi + 1] = y;
      positions[vi + 2] = z;
    }
  }

  // Chamfer ring (only when chamferTop > 0): one vertex per outer ring index
  // at z = H. Interior columns are inset by chamferTop in face k's normal
  // direction. Shared polygon-corner vertices (col == 0) are inset along
  // the outward corner bisector instead, so the chamfer wraps the corner
  // symmetrically and stays watertight with both adjacent faces' chamfer
  // bands meeting at the same vertex.
  const chamferStart = innerCount + outerCount;
  if (hasChamfer) {
    for (let i = 0; i < NxRing; i++) {
      const k = Math.floor(i / (Nx - 1));
      const col = i - k * (Nx - 1);
      const cTk = cosT[k], sTk = sinT[k];
      let x, y;
      if (col === 0) {
        // Outward bisector of face k and face k−1 (the polygon corner direction).
        const kPrev = (k + N - 1) % N;
        let bx = cosT[k] + cosT[kPrev];
        let by = sinT[k] + sinT[kPrev];
        const blen = Math.sqrt(bx * bx + by * by) || 1;
        bx /= blen; by /= blen;
        // Outer-corner position (relief=0 at corner): face-k formula at s=−W/2.
        const cx = outerApothem * cTk - (-W / 2) * sTk;
        const cy = outerApothem * sTk + (-W / 2) * cTk;
        x = cx - chamferTop * bx;
        y = cy - chamferTop * by;
      } else {
        const s = (col / (Nx - 1)) * W - W / 2;
        const relief = heightmap.data[col + 0 * Nx];
        const r = outerApothem + relief - chamferTop;
        x = r * cTk - s * sTk;
        y = r * sTk + s * cTk;
      }
      const vi = (chamferStart + i) * 3;
      positions[vi]     = x;
      positions[vi + 1] = y;
      positions[vi + 2] = H;
    }
  }

  // Center vertices (closed-bottom only)
  const centerBase = innerCount + outerCount + chamferCount;
  const bottomCenter = closedBottom ? centerBase : -1;
  const floorCenter  = closedBottom ? centerBase + 1 : -1;
  if (closedBottom) {
    positions[bottomCenter * 3]     = 0;
    positions[bottomCenter * 3 + 1] = 0;
    positions[bottomCenter * 3 + 2] = 0;
    positions[floorCenter * 3]      = 0;
    positions[floorCenter * 3 + 1]  = 0;
    positions[floorCenter * 3 + 2]  = B;
  }

  const triCount = estimatePolygonPrismTriangleCount(N, Nx, Ny, hasChamfer);
  const indices = new Uint32Array(triCount * 3);
  let p = 0;

  const inner = (i, j) => (((i % NxRing) + NxRing) % NxRing) + j * NxRing;
  const outer = (i, j) => innerCount + (((i % NxRing) + NxRing) % NxRing) + j * NxRing;
  const chamfer = (i) => chamferStart + (((i % NxRing) + NxRing) % NxRing);
  // Top ring used by the top edge wall (z=H): chamfer ring if present, else outer j=0.
  const topRing = hasChamfer ? chamfer : (i) => outer(i, 0);

  // Outer surface (outward normal). Shared closed ring like the cylinder.
  for (let j = 0; j < Ny - 1; j++) {
    for (let i = 0; i < NxRing; i++) {
      const a = outer(i, j);
      const b = outer(i + 1, j);
      const c = outer(i + 1, j + 1);
      const d = outer(i, j + 1);
      indices[p++] = a; indices[p++] = d; indices[p++] = c;
      indices[p++] = a; indices[p++] = c; indices[p++] = b;
    }
  }

  // Inner surface (inward radial normal toward the axis).
  for (let j = 0; j < Ny - 1; j++) {
    for (let i = 0; i < NxRing; i++) {
      const a = inner(i, j);
      const b = inner(i + 1, j);
      const c = inner(i + 1, j + 1);
      const d = inner(i, j + 1);
      indices[p++] = a; indices[p++] = c; indices[p++] = d;
      indices[p++] = a; indices[p++] = b; indices[p++] = c;
    }
  }

  // Optional chamfer band: between outer ring j=0 (z=H−chamferTop) and the
  // chamfer ring (z=H, perpendicular distance reduced by chamferTop). Normal
  // tilts outward and upward.
  if (hasChamfer) {
    for (let i = 0; i < NxRing; i++) {
      const a = outer(i, 0);
      const b = outer(i + 1, 0);
      const c = chamfer(i + 1);
      const d = chamfer(i);
      indices[p++] = a; indices[p++] = b; indices[p++] = c;
      indices[p++] = a; indices[p++] = c; indices[p++] = d;
    }
  }

  // Top edge wall (z=H annular ring, +Z normal). Connects whichever ring is
  // currently the top of the outer mesh (chamfer ring if enabled, else
  // outer j=0) to the inner top.
  for (let i = 0; i < NxRing; i++) {
    const o0 = topRing(i);
    const o1 = topRing(i + 1);
    const i0 = inner(i, 0);
    const i1 = inner(i + 1, 0);
    indices[p++] = o0; indices[p++] = o1; indices[p++] = i1;
    indices[p++] = o0; indices[p++] = i1; indices[p++] = i0;
  }

  if (!closedBottom) {
    // Bottom edge wall (z=0 annular ring, −Z normal).
    for (let i = 0; i < NxRing; i++) {
      const o0 = outer(i, Ny - 1);
      const o1 = outer(i + 1, Ny - 1);
      const i0 = inner(i, Ny - 1);
      const i1 = inner(i + 1, Ny - 1);
      indices[p++] = o0; indices[p++] = i1; indices[p++] = o1;
      indices[p++] = o0; indices[p++] = i0; indices[p++] = i1;
    }
  } else {
    // Closed mode: solid bottom face + inner floor disc at z=B.
    for (let i = 0; i < NxRing; i++) {
      const a = outer(i,     Ny - 1);
      const b = outer(i + 1, Ny - 1);
      indices[p++] = bottomCenter; indices[p++] = b; indices[p++] = a;
    }
    for (let i = 0; i < NxRing; i++) {
      const i0 = inner(i,     Ny - 1);
      const i1 = inner(i + 1, Ny - 1);
      indices[p++] = floorCenter; indices[p++] = i0; indices[p++] = i1;
    }
  }

  return {
    positions,
    indices,
    triCount,
    vertCount: totalVerts,
    Nx,
    Ny,
    sides: N,
    innerCount,
    NxRing,
    chamferCount
  };
}

// Revolve a closed 2D profile around the Z (vertical) axis to form a torus-
// topology solid. The "outer band" of the profile (a contiguous slice
// already resampled to exactly Ny points = heightmap height) is offset
// outward, vertex by vertex, by relief sampled from the heightmap.
//
// Coordinate convention
//   - Profile X (horizontal) = radial distance from the rotation axis.
//   - Profile Y (vertical)   = axial coord, mapped to world Z.
//   - The profile must already be in real mm (apply your radius/height
//     factors before passing it in).
//   - Image columns wrap around the full 2π circumference; image rows
//     map onto outer-band points in order, with row 0 → outerStart and
//     row Ny−1 → outerStart+Ny−1.
//
// Inputs
//   heightmap:  { data: Float32Array(Nx*Ny), width: Nx, height: Ny } — relief in mm
//   opts.profile:    Array of [r, z] pairs, closed loop, no duplicate end vertex.
//   opts.outerStart: index of first outer-band point in `profile`.
//   opts.outerLength: number of consecutive outer-band points (must equal Ny).
//
// Topology: torus (V − E + F = 0) — both the angular ring (Nθ = Nx) and
// the profile loop (Nprofile = profile.length) wrap closed, so the mesh
// has no boundary edges and no caps are needed.
export function buildCustomProfileGeometry(heightmap, opts) {
  const Nx = heightmap.width;
  const Ny = heightmap.height;
  if (Nx < 3 || Ny < 2) {
    throw new Error('Custom-profile mesh requires Nx >= 3 and Ny >= 2');
  }
  const profile = opts.profile;
  if (!Array.isArray(profile) || profile.length < 3) {
    throw new Error('Custom profile must be a closed loop of at least 3 points');
  }
  const Np = profile.length;
  const outerStart  = opts.outerStart | 0;
  const outerLength = opts.outerLength | 0;
  if (outerLength !== Ny) {
    throw new Error(`Custom profile: outer band length (${outerLength}) must equal Ny (${Ny})`);
  }
  if (outerLength > Np) {
    throw new Error('Custom profile: outer band longer than profile');
  }

  // Mark which profile indices are outer band, and their image row 0..Ny−1.
  // Image row 0 = top of the plate (max Z) by convention everywhere else in
  // this codebase, so we orient the band so its high-Z end gets row 0.
  const bandStartZ = profile[outerStart][1];
  const bandEndZ   = profile[(outerStart + outerLength - 1) % Np][1];
  const bandGoesDown = bandStartZ >= bandEndZ;   // start is the top (or tied)
  const outerRow = new Int32Array(Np).fill(-1);
  for (let k = 0; k < outerLength; k++) {
    const row = bandGoesDown ? k : (outerLength - 1 - k);
    outerRow[(outerStart + k) % Np] = row;
  }

  // Reject profiles that punch through the rotation axis. Points exactly
  // ON the axis (r = 0) are allowed and intentional: they collapse to a
  // single 3D point as the profile revolves, which is how a closed bottom
  // (or top) forms — e.g. the inner-bottom corner of a cup-shaped L profile.
  // The resulting triangles around that point are degenerate (zero area)
  // but harmless for STL output and rendering.
  //
  // CAD-emitted DXF files routinely store axis-coincident vertices as tiny
  // negative numbers (~1e-15 mm) from floating-point round-trips. Clamp
  // anything within `AXIS_TOL` of the axis to exactly 0, and only error if
  // the profile is meaningfully on the wrong side.
  const AXIS_TOL = 1e-3;   // 1 µm — well below any meaningful print precision
  let minR = Infinity;
  for (let i = 0; i < profile.length; i++) {
    const r = profile[i][0];
    if (r < 0 && r > -AXIS_TOL) {
      profile[i] = [0, profile[i][1]];
    } else if (r < minR) {
      minR = r;
    }
  }
  if (minR < 0) {
    throw new Error('Custom profile: radial coords must be ≥ 0 (profile must not cross the axis). Points exactly on the axis are allowed and form a closed cap.');
  }

  const totalVerts = Nx * Np;
  const positions = new Float32Array(totalVerts * 3);

  const cosT = new Float32Array(Nx);
  const sinT = new Float32Array(Nx);
  for (let k = 0; k < Nx; k++) {
    const t = (k / Nx) * 2 * Math.PI;
    cosT[k] = Math.cos(t);
    sinT[k] = Math.sin(t);
  }

  // Build vertex grid. Vertex (k, i) at world index k * Np + i.
  for (let i = 0; i < Np; i++) {
    const r0 = profile[i][0];
    const z  = profile[i][1];
    const row = outerRow[i];
    const isOuter = row >= 0;
    for (let k = 0; k < Nx; k++) {
      let r = r0;
      if (isOuter) {
        // Image row 0 sits at the TOP of the plate elsewhere in this app, so
        // flip row so image row 0 maps to the outer-band point with the
        // largest Z (top). We pick the orientation by checking which end of
        // the band has the higher Z; if the band is approximately horizontal
        // we fall back to mapping row 0 → outerStart.
        r += heightmap.data[k + row * Nx];
      }
      const vi = (k * Np + i) * 3;
      positions[vi]     = r * cosT[k];
      positions[vi + 1] = r * sinT[k];
      positions[vi + 2] = z;
    }
  }

  const triCount = estimateCustomProfileTriangleCount(Nx, Np);
  const indices = new Uint32Array(triCount * 3);
  let p = 0;

  // Determine winding direction so triangles face OUTWARD from the solid.
  // The signed area of the profile (in the radial-axial plane) tells us
  // whether the loop runs CCW or CW. Combined with our angular winding
  // (CCW around +Z), CCW profile → standard winding; CW profile → flip.
  let signedArea = 0;
  for (let i = 0; i < Np; i++) {
    const a = profile[i], b = profile[(i + 1) % Np];
    signedArea += (b[0] - a[0]) * (b[1] + a[1]) * 0.5;
  }
  // Profile traversed CCW (positive area in standard math convention).
  // Note: our area sum uses (Δx)·(y₁+y₂)/2 which is the trapezoid rule and
  // gives the *negative* of the standard CCW area. So area > 0 ⇒ profile
  // is CW in math convention ⇒ outward normal of the (k,k+1)×(i,i+1) quad
  // points in the +radial direction with the standard winding below.
  const flip = signedArea < 0;

  // Each cell (k, i) → quad (k,i), (k+1,i), (k+1,i+1), (k,i+1) — both
  // axes wrap (toroidal). Standard CCW winding for the +outward normal.
  const idx = (k, i) => ((k % Nx + Nx) % Nx) * Np + ((i % Np + Np) % Np);
  for (let k = 0; k < Nx; k++) {
    for (let i = 0; i < Np; i++) {
      const a = idx(k,     i);
      const b = idx(k + 1, i);
      const c = idx(k + 1, i + 1);
      const d = idx(k,     i + 1);
      if (flip) {
        indices[p++] = a; indices[p++] = b; indices[p++] = c;
        indices[p++] = a; indices[p++] = c; indices[p++] = d;
      } else {
        indices[p++] = a; indices[p++] = c; indices[p++] = b;
        indices[p++] = a; indices[p++] = d; indices[p++] = c;
      }
    }
  }

  return {
    positions,
    indices,
    triCount,
    vertCount: totalVerts,
    Nx,
    Ny,
    Np,
    outerStart,
    outerLength
  };
}

// Compute R(θ, z) — for every (angular, axial) sample, the largest radius
// at which the ray from (0, 0, z) in direction (cos θ, sin θ, 0) hits the
// STL. Cells with no hit are left at 0.
//
// Algorithm: for each triangle, find the Z-grid lines it spans; for each
// such line, intersect the triangle with that plane to get a line segment
// in XY; then iterate the θ-grid samples covered by that segment's angular
// arc (viewed from the Z axis) and update the max radius. This is much
// faster than brute-force ray-triangle (each triangle's angular footprint
// is typically a small slice of the full 2π).
//
// Robustness: vertices exactly on the slicing plane are treated as
// "above" (>=) so a triangle touching the plane at a single vertex
// contributes no slice, while an in-plane edge gives a 1-point segment.
// Pure horizontal triangles (all three vertices at zs) are skipped.
export function computeSTLRadiusField(stl, Nx, Ny, zmin, zmax) {
  const R = new Float32Array(Nx * Ny);
  const positions = stl.positions;
  const triCount = stl.triCount;
  if (Ny < 2 || !(zmax > zmin) || Nx < 3) return R;

  const dz = (zmax - zmin) / (Ny - 1);
  const TWO_PI = 2 * Math.PI;
  const dTheta = TWO_PI / Nx;

  // Pre-cache θ-sample sines/cosines.
  const cosT = new Float64Array(Nx);
  const sinT = new Float64Array(Nx);
  for (let i = 0; i < Nx; i++) {
    const t = i * dTheta;
    cosT[i] = Math.cos(t);
    sinT[i] = Math.sin(t);
  }

  for (let t = 0; t < triCount; t++) {
    const o = t * 9;
    const ax = positions[o],     ay = positions[o + 1], az = positions[o + 2];
    const bx = positions[o + 3], by = positions[o + 4], bz = positions[o + 5];
    const cx = positions[o + 6], cy = positions[o + 7], cz = positions[o + 8];

    const trizmin = az < bz ? (az < cz ? az : cz) : (bz < cz ? bz : cz);
    const trizmax = az > bz ? (az > cz ? az : cz) : (bz > cz ? bz : cz);

    const jMin = Math.max(0, Math.ceil((trizmin - zmin) / dz));
    const jMax = Math.min(Ny - 1, Math.floor((trizmax - zmin) / dz));
    if (jMin > jMax) continue;

    for (let j = jMin; j <= jMax; j++) {
      const zs = zmin + j * dz;

      // Slice the triangle at z = zs. Use the "≥ counts as above" rule so
      // each crossing is counted exactly once even when a vertex sits on
      // the slicing plane.
      let x1 = 0, y1 = 0, x2 = 0, y2 = 0, n = 0;
      // edge a→b
      {
        const pAbove = az >= zs, qAbove = bz >= zs;
        if (pAbove !== qAbove) {
          const tt = (zs - az) / (bz - az);
          const ex = ax + tt * (bx - ax);
          const ey = ay + tt * (by - ay);
          if (n === 0) { x1 = ex; y1 = ey; n = 1; }
          else { x2 = ex; y2 = ey; n = 2; }
        }
      }
      // edge b→c
      if (n < 2) {
        const pAbove = bz >= zs, qAbove = cz >= zs;
        if (pAbove !== qAbove) {
          const tt = (zs - bz) / (cz - bz);
          const ex = bx + tt * (cx - bx);
          const ey = by + tt * (cy - by);
          if (n === 0) { x1 = ex; y1 = ey; n = 1; }
          else { x2 = ex; y2 = ey; n = 2; }
        }
      }
      // edge c→a
      if (n < 2) {
        const pAbove = cz >= zs, qAbove = az >= zs;
        if (pAbove !== qAbove) {
          const tt = (zs - cz) / (az - cz);
          const ex = cx + tt * (ax - cx);
          const ey = cy + tt * (ay - cy);
          if (n === 0) { x1 = ex; y1 = ey; n = 1; }
          else { x2 = ex; y2 = ey; n = 2; }
        }
      }
      if (n < 2) continue;

      // Angular arc of the segment, viewed from the Z-axis.
      const r1sq = x1 * x1 + y1 * y1;
      const r2sq = x2 * x2 + y2 * y2;
      if (r1sq < 1e-18 && r2sq < 1e-18) continue;   // segment on the axis

      const theta1 = Math.atan2(y1, x1);
      const theta2 = Math.atan2(y2, x2);
      let dTh = theta2 - theta1;
      if (dTh > Math.PI) dTh -= TWO_PI;
      else if (dTh < -Math.PI) dTh += TWO_PI;

      const thStart = theta1;
      const thEnd = theta1 + dTh;
      const thLo = thStart < thEnd ? thStart : thEnd;
      const thHi = thStart < thEnd ? thEnd : thStart;

      const iLo = Math.ceil(thLo / dTheta);
      const iHi = Math.floor(thHi / dTheta);
      if (iLo > iHi) continue;

      const A0 = -y1;     // x1·sin(0) − y1·cos(0) = -y1; will be re-derived per θ below
      const dx = x2 - x1;
      const dy = y2 - y1;

      for (let ii = iLo; ii <= iHi; ii++) {
        const i = ((ii % Nx) + Nx) % Nx;
        const c = cosT[i], s = sinT[i];

        // Find segment parameter where (P(s_param) − origin) is on the ray.
        // P(s_param) lies on the ray line ⇔ P.x·sinθ − P.y·cosθ = 0.
        // Let A = x1 sinθ − y1 cosθ, B = x2 sinθ − y2 cosθ; s = A / (A − B).
        const A = x1 * s - y1 * c;
        const B = x2 * s - y2 * c;
        const denom = A - B;
        if (denom === 0) continue;
        const sp = A / denom;
        if (sp < 0 || sp > 1) continue;
        const xh = x1 + sp * dx;
        const yh = y1 + sp * dy;
        const r = xh * c + yh * s;
        if (r <= 0) continue;

        const idx = i + j * Nx;
        if (r > R[idx]) R[idx] = r;
        // Suppress unused-var warning for the rare path; A0 is intentionally
        // unused (kept above only as documentation).
        void A0;
      }
    }
  }

  return R;
}

// Cylindrical wrap around a custom STL's outer surface. The STL is centered
// on the Z axis (XY bounding-box centroid → origin) and rests on z = 0. The
// outer shell follows the STL surface (sampled radially at each θ, z grid
// cell) plus the relief; the inner shell is a constant inset of
// `baseThickness` from the outer.
//
// Topology matches buildCylindricalGeometry: outer ring × Ny + inner ring ×
// Ny vertices, plus optional closed bottom. The mesh is watertight by
// construction the same way.
//
// closedBottom (default true): inner surface stops at z = B, solid floor at
// z = 0, inner-cap disc at z = B seals the void. Open mode = annular bottom.
//
// Inputs
//   heightmap.data: Float32Array(Nx · Ny) — relief in mm at each (θ, z) cell
//   opts.stl:         { positions, triCount } — target STL
//   opts.baseThickness: wall thickness (mm) of the inner shell offset
//   opts.closedBottom:  boolean (default true)
//   opts.fallbackRadius: radius to use for cells the STL doesn't cover
//                        (e.g. axisymmetry holes). Defaults to the row's max.
export function buildSTLWrapGeometry(heightmap, opts) {
  const Nx = heightmap.width;
  const Ny = heightmap.height;
  if (Nx < 3 || Ny < 2) {
    throw new Error('STL wrap mesh requires Nx >= 3 and Ny >= 2');
  }
  const stl = opts.stl;
  if (!stl || !stl.positions || !stl.triCount) {
    throw new Error('STL wrap: missing or empty target STL');
  }
  const B = opts.baseThickness;
  const closedBottom = opts.closedBottom !== false;

  // XY-center + Z-zero the STL so the rotation axis passes through the XY
  // centroid and the model rests on z = 0.
  let xmin = Infinity, xmax = -Infinity;
  let ymin = Infinity, ymax = -Infinity;
  let zmin = Infinity, zmax = -Infinity;
  for (let i = 0; i < stl.positions.length; i += 3) {
    const x = stl.positions[i], y = stl.positions[i + 1], z = stl.positions[i + 2];
    if (x < xmin) xmin = x; if (x > xmax) xmax = x;
    if (y < ymin) ymin = y; if (y > ymax) ymax = y;
    if (z < zmin) zmin = z; if (z > zmax) zmax = z;
  }
  if (!(zmax > zmin)) throw new Error('STL wrap: target STL has zero Z extent');
  const H = zmax - zmin;
  const cxX = (xmin + xmax) / 2;
  const cyY = (ymin + ymax) / 2;

  const centered = {
    positions: new Float32Array(stl.positions.length),
    triCount: stl.triCount
  };
  for (let i = 0; i < stl.positions.length; i += 3) {
    centered.positions[i]     = stl.positions[i]     - cxX;
    centered.positions[i + 1] = stl.positions[i + 1] - cyY;
    centered.positions[i + 2] = stl.positions[i + 2] - zmin;
  }

  // Sample slightly inside [0, H] so that the very top / bottom rings —
  // where STL triangles may have a vertex exactly on the plane — don't
  // degenerate to "no hit" rows. The relief surface still spans 0…H.
  const eps = H * 1e-4;
  const zSampleMin = eps;
  const zSampleMax = H - eps;

  const R = computeSTLRadiusField(centered, Nx, Ny, zSampleMin, zSampleMax);

  // Fill rays that missed the STL. For each row, use circular-nearest
  // interpolation (well-defined since θ wraps) to fill gaps. If a whole
  // row missed, fall back to the global max.
  let globalMax = 0;
  for (let i = 0; i < R.length; i++) if (R[i] > globalMax) globalMax = R[i];
  if (globalMax === 0) {
    throw new Error('STL wrap: no rays hit the STL. Check that the STL encloses its Z axis (it should sit roughly centered on its own XY bounding box).');
  }
  for (let j = 0; j < Ny; j++) {
    const row = j * Nx;
    // Find first nonzero in the row to seed circular fill.
    let firstHit = -1;
    for (let i = 0; i < Nx; i++) if (R[row + i] > 0) { firstHit = i; break; }
    if (firstHit < 0) {
      for (let i = 0; i < Nx; i++) R[row + i] = globalMax;
      continue;
    }
    // Fill any zeros by walking forward and linearly interpolating between
    // the surrounding hits (going around the ring).
    for (let k = 0; k < Nx; k++) {
      const i = (firstHit + k) % Nx;
      if (R[row + i] > 0) continue;
      // Find next hit going forward.
      let nextK = -1, nextR = 0;
      for (let m = 1; m < Nx; m++) {
        const ni = (i + m) % Nx;
        if (R[row + ni] > 0) { nextK = m; nextR = R[row + ni]; break; }
      }
      // Find previous hit going backward.
      let prevK = -1, prevR = 0;
      for (let m = 1; m < Nx; m++) {
        const pi = (i - m + Nx) % Nx;
        if (R[row + pi] > 0) { prevK = m; prevR = R[row + pi]; break; }
      }
      const total = (nextK >= 0 ? nextK : 0) + (prevK >= 0 ? prevK : 0);
      R[row + i] = total > 0
        ? (prevR * (nextK || 0) + nextR * (prevK || 0)) / total
        : globalMax;
    }
  }

  if (closedBottom && B >= H) {
    throw new Error('Base thickness must be smaller than STL height for closed bottom');
  }

  // Inner shell at R - B; refuse if that would punch through the rotation axis.
  let minR = Infinity;
  for (let i = 0; i < R.length; i++) if (R[i] < minR) minR = R[i];
  if (!(minR > B)) {
    throw new Error(`Base thickness (${B} mm) must be smaller than the STL's smallest cross-section radius (${minR.toFixed(2)} mm). Try a thinner wall or a wider STL.`);
  }

  const innerZBottom = closedBottom ? B : 0;
  const extraVerts = closedBottom ? 2 : 0;
  const totalVerts = 2 * Nx * Ny + extraVerts;
  const positions = new Float32Array(totalVerts * 3);
  const innerOffset = Nx * Ny;

  const cosT = new Float32Array(Nx);
  const sinT = new Float32Array(Nx);
  for (let i = 0; i < Nx; i++) {
    const t = (i / Nx) * 2 * Math.PI;
    cosT[i] = Math.cos(t);
    sinT[i] = Math.sin(t);
  }

  // Outer surface (per-vertex radius from R(θ, z), plus relief from heightmap).
  for (let j = 0; j < Ny; j++) {
    const z = H - (j / (Ny - 1)) * H;
    for (let i = 0; i < Nx; i++) {
      const idx = i + j * Nx;
      const r = R[idx] + heightmap.data[idx];
      const vi = idx * 3;
      positions[vi]     = r * cosT[i];
      positions[vi + 1] = r * sinT[i];
      positions[vi + 2] = z;
    }
  }
  // Inner surface (R - B, constant inset). Z range: [innerZBottom, H] —
  // shrunk for closedBottom so the inner shell sits above the floor.
  for (let j = 0; j < Ny; j++) {
    const z = H - (j / (Ny - 1)) * (H - innerZBottom);
    for (let i = 0; i < Nx; i++) {
      const idx = i + j * Nx;
      const rInner = R[idx] - B;
      const vi = (innerOffset + idx) * 3;
      positions[vi]     = rInner * cosT[i];
      positions[vi + 1] = rInner * sinT[i];
      positions[vi + 2] = z;
    }
  }

  const centerBase = 2 * Nx * Ny;
  const bottomCenter = closedBottom ? centerBase : -1;
  const floorCenter  = closedBottom ? centerBase + 1 : -1;
  if (closedBottom) {
    positions[bottomCenter * 3]     = 0;
    positions[bottomCenter * 3 + 1] = 0;
    positions[bottomCenter * 3 + 2] = 0;
    positions[floorCenter * 3]      = 0;
    positions[floorCenter * 3 + 1]  = 0;
    positions[floorCenter * 3 + 2]  = B;
  }

  const triCount = estimateSTLWrapTriangleCount(Nx, Ny);
  const indices = new Uint32Array(triCount * 3);
  let p = 0;

  const wrap = (i) => (i === Nx ? 0 : i);
  const outer = (i, j) => wrap(i) + j * Nx;
  const inner = (i, j) => innerOffset + wrap(i) + j * Nx;

  // Outer surface (outward normal).
  for (let j = 0; j < Ny - 1; j++) {
    for (let i = 0; i < Nx; i++) {
      const a = outer(i, j), b = outer(i + 1, j);
      const c = outer(i + 1, j + 1), d = outer(i, j + 1);
      indices[p++] = a; indices[p++] = d; indices[p++] = c;
      indices[p++] = a; indices[p++] = c; indices[p++] = b;
    }
  }
  // Inner surface (inward normal — reverse winding).
  for (let j = 0; j < Ny - 1; j++) {
    for (let i = 0; i < Nx; i++) {
      const a = inner(i, j), b = inner(i + 1, j);
      const c = inner(i + 1, j + 1), d = inner(i, j + 1);
      indices[p++] = a; indices[p++] = c; indices[p++] = d;
      indices[p++] = a; indices[p++] = b; indices[p++] = c;
    }
  }
  // Top cap (z = H, +Z normal): annular ring outer→inner.
  for (let i = 0; i < Nx; i++) {
    const a = outer(i, 0),     b = outer(i + 1, 0);
    const c = inner(i + 1, 0), d = inner(i, 0);
    indices[p++] = a; indices[p++] = b; indices[p++] = c;
    indices[p++] = a; indices[p++] = c; indices[p++] = d;
  }
  if (!closedBottom) {
    for (let i = 0; i < Nx; i++) {
      const a = outer(i, Ny - 1),     b = outer(i + 1, Ny - 1);
      const c = inner(i + 1, Ny - 1), d = inner(i, Ny - 1);
      indices[p++] = a; indices[p++] = c; indices[p++] = b;
      indices[p++] = a; indices[p++] = d; indices[p++] = c;
    }
  } else {
    for (let i = 0; i < Nx; i++) {
      const a = outer(i,     Ny - 1);
      const b = outer(i + 1, Ny - 1);
      indices[p++] = bottomCenter; indices[p++] = b; indices[p++] = a;
    }
    for (let i = 0; i < Nx; i++) {
      const i0 = inner(i,     Ny - 1);
      const i1 = inner(i + 1, Ny - 1);
      indices[p++] = floorCenter; indices[p++] = i0; indices[p++] = i1;
    }
  }

  return {
    positions,
    indices,
    triCount,
    vertCount: totalVerts,
    Nx,
    Ny,
    stlHeight: H,
    stlMaxR: globalMax
  };
}

// Build a thick-walled elliptical tube. xSize/ySize define the INNER cavity
// dimensions; the outer perimeter is inner + thickness on each side, so
// half-axes: aIn = xSize/2, bIn = ySize/2, a = aIn+B, b = bIn+B.
// Heightmap pixels push their outer vertex further from the origin along
// the polar radial direction. Pixel column 0 → θ=0 (+X), columns wrap CCW.
// Image rows go top→bottom and map to Z=H → Z=0 (like the cylinder).
//
// opts.bottomThickness (BF): Z height of the inner floor (separate from the
// side-wall thickness B). p=0 gives a closed floor (solid disc at z=0 plus a
// sealed inner-floor disc at z=BF). p=100 gives a fully open bottom (annular
// outer→inner ring at z=0). Intermediate p creates an actual hole: annular
// outer→hole at z=0, vertical hole walls from z=0 to z=BF, annular
// hole→inner floor at z=BF sealing the cavity around the hole.
//
// Columns are spaced by arc length, not angle, so the image wraps the
// perimeter at uniform stretch even when xSize ≠ ySize.
export function buildEllipseGeometry(heightmap, opts) {
  const Nx = heightmap.width;
  const Ny = heightmap.height;
  if (Nx < 3 || Ny < 2) {
    throw new Error('Ellipse mesh requires Nx >= 3 and Ny >= 2');
  }
  const xSize = opts.xSize;
  const ySize = opts.ySize;
  const B = opts.thickness;
  const H = opts.height;
  const BF = opts.bottomThickness !== undefined ? opts.bottomThickness : B;
  const holePct = Math.max(0, Math.min(100, opts.bottomHolePct || 0));
  const aIn = xSize / 2;   // inner cavity half-axes (user's x/y)
  const bIn = ySize / 2;
  const a = aIn + B;        // outer half-axes = inner + wall thickness
  const b = bIn + B;
  if (!(B > 0)) {
    throw new Error('Outside thickness must be positive');
  }
  if (B >= H) {
    throw new Error('Outside thickness must be smaller than extrusion height');
  }
  if (!(BF > 0)) {
    throw new Error('Bottom thickness must be positive');
  }
  if (BF >= H) {
    throw new Error('Bottom thickness must be smaller than extrusion height');
  }

  // Arc-length parameterization: integrate |dP/dθ| = √(a²sin²θ + b²cos²θ)
  // around the perimeter, then invert to find the θ at each evenly-spaced
  // arc-length step. 4096 samples gives sub-mm error at typical sizes.
  const STEPS = 4096;
  const arcLens = new Float32Array(STEPS + 1);
  let total = 0;
  for (let k = 1; k <= STEPS; k++) {
    const tMid = ((k - 0.5) / STEPS) * 2 * Math.PI;
    const ds = Math.hypot(a * Math.sin(tMid), b * Math.cos(tMid)) * (2 * Math.PI / STEPS);
    total += ds;
    arcLens[k] = total;
  }
  const circumference = total;

  const cosT = new Float32Array(Nx);
  const sinT = new Float32Array(Nx);
  for (let i = 0; i < Nx; i++) {
    const target = (i / Nx) * circumference;
    let lo = 1, hi = STEPS;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arcLens[mid] < target) lo = mid + 1; else hi = mid;
    }
    const k = lo;
    const span = arcLens[k] - arcLens[k - 1];
    const f = span > 0 ? (target - arcLens[k - 1]) / span : 0;
    const theta = ((k - 1 + f) / STEPS) * 2 * Math.PI;
    cosT[i] = Math.cos(theta);
    sinT[i] = Math.sin(theta);
  }

  const hasHole = holePct > 0;
  const fullHole = holePct >= 99.999;
  const holeAx = aIn * (holePct / 100);
  const holeBx = bIn * (holePct / 100);
  // Inner-surface Z range: when the bottom is fully open the inner cavity
  // continues all the way down to z=0 (no floor); otherwise it stops at z=BF
  // where the floor (or hole floor annulus) seals it.
  const innerZBottom = fullHole ? 0 : BF;

  let extraVerts = 0;
  if (!hasHole) extraVerts += 2;             // disc center + floor center
  else if (!fullHole) extraVerts += 2 * Nx;  // hole ring at z=0 and z=B

  const totalVerts = 2 * Nx * Ny + extraVerts;
  const positions = new Float32Array(totalVerts * 3);
  const innerOffset = Nx * Ny;

  // Outer surface — relief pushes the vertex away from the origin along the
  // polar radial direction so |new| = |orig| + h.
  for (let j = 0; j < Ny; j++) {
    const z = H - (j / (Ny - 1)) * H;
    for (let i = 0; i < Nx; i++) {
      const cx = a * cosT[i];
      const cy = b * sinT[i];
      const r = Math.hypot(cx, cy);
      const h = heightmap.data[i + j * Nx];
      const scale = r > 1e-12 ? (r + h) / r : 1;
      const vi = (i + j * Nx) * 3;
      positions[vi]     = cx * scale;
      positions[vi + 1] = cy * scale;
      positions[vi + 2] = z;
    }
  }
  // Inner surface (smooth, no relief).
  for (let j = 0; j < Ny; j++) {
    const z = H - (j / (Ny - 1)) * (H - innerZBottom);
    for (let i = 0; i < Nx; i++) {
      const vi = (innerOffset + i + j * Nx) * 3;
      positions[vi]     = aIn * cosT[i];
      positions[vi + 1] = bIn * sinT[i];
      positions[vi + 2] = z;
    }
  }

  let bottomCenter = -1, floorCenter = -1;
  let holeBotOff = -1, holeTopOff = -1;
  const centerBase = 2 * Nx * Ny;
  if (!hasHole) {
    bottomCenter = centerBase;
    floorCenter = centerBase + 1;
    positions[bottomCenter * 3]     = 0;
    positions[bottomCenter * 3 + 1] = 0;
    positions[bottomCenter * 3 + 2] = 0;
    positions[floorCenter * 3]      = 0;
    positions[floorCenter * 3 + 1]  = 0;
    positions[floorCenter * 3 + 2]  = BF;
  } else if (!fullHole) {
    holeBotOff = centerBase;
    holeTopOff = centerBase + Nx;
    for (let i = 0; i < Nx; i++) {
      const vi = (holeBotOff + i) * 3;
      positions[vi]     = holeAx * cosT[i];
      positions[vi + 1] = holeBx * sinT[i];
      positions[vi + 2] = 0;
    }
    for (let i = 0; i < Nx; i++) {
      const vi = (holeTopOff + i) * 3;
      positions[vi]     = holeAx * cosT[i];
      positions[vi + 1] = holeBx * sinT[i];
      positions[vi + 2] = BF;
    }
  }

  let triCount = 4 * Nx * (Ny - 1) + 2 * Nx; // outer + inner shells + top cap
  if (!hasHole) triCount += 2 * Nx;          // disc + sealed floor
  else if (fullHole) triCount += 2 * Nx;     // annular outer→inner at z=0
  else triCount += 6 * Nx;                   // outer→hole + hole walls + hole→inner

  const indices = new Uint32Array(triCount * 3);
  let p = 0;
  const wrap = (i) => (i === Nx ? 0 : i);
  const outer = (i, j) => wrap(i) + j * Nx;
  const inner = (i, j) => innerOffset + wrap(i) + j * Nx;
  const holeB = (i) => holeBotOff + wrap(i);
  const holeT = (i) => holeTopOff + wrap(i);

  // Outer surface — same winding as the cylinder's outer ring (outward
  // radial normals; j=0 at top, i CCW from +X).
  for (let j = 0; j < Ny - 1; j++) {
    for (let i = 0; i < Nx; i++) {
      const A = outer(i, j),     B_ = outer(i + 1, j);
      const C = outer(i + 1, j + 1), D = outer(i, j + 1);
      indices[p++] = A; indices[p++] = D; indices[p++] = C;
      indices[p++] = A; indices[p++] = C; indices[p++] = B_;
    }
  }
  // Inner surface — inward radial normals (reverse winding).
  for (let j = 0; j < Ny - 1; j++) {
    for (let i = 0; i < Nx; i++) {
      const A = inner(i, j),     B_ = inner(i + 1, j);
      const C = inner(i + 1, j + 1), D = inner(i, j + 1);
      indices[p++] = A; indices[p++] = C; indices[p++] = D;
      indices[p++] = A; indices[p++] = B_; indices[p++] = C;
    }
  }
  // Top cap (annular outer→inner at z=H, normal +Z).
  for (let i = 0; i < Nx; i++) {
    const A = outer(i, 0),     B_ = outer(i + 1, 0);
    const C = inner(i + 1, 0), D = inner(i, 0);
    indices[p++] = A; indices[p++] = B_; indices[p++] = C;
    indices[p++] = A; indices[p++] = C;  indices[p++] = D;
  }

  if (!hasHole) {
    // Solid disc at z=0 (normal −Z) and sealed inner-floor disc at z=B
    // (normal +Z), matching the closed cylinder topology.
    for (let i = 0; i < Nx; i++) {
      const A = outer(i,     Ny - 1);
      const B_ = outer(i + 1, Ny - 1);
      indices[p++] = bottomCenter; indices[p++] = B_; indices[p++] = A;
    }
    for (let i = 0; i < Nx; i++) {
      const i0 = inner(i,     Ny - 1);
      const i1 = inner(i + 1, Ny - 1);
      indices[p++] = floorCenter; indices[p++] = i0; indices[p++] = i1;
    }
  } else if (fullHole) {
    // Hole = inner cavity, so the bottom is an annular ring from outer to
    // inner at z=0 (normal −Z, reverse winding vs. top cap).
    for (let i = 0; i < Nx; i++) {
      const A = outer(i, Ny - 1),     B_ = outer(i + 1, Ny - 1);
      const C = inner(i + 1, Ny - 1), D = inner(i, Ny - 1);
      indices[p++] = A; indices[p++] = C; indices[p++] = B_;
      indices[p++] = A; indices[p++] = D; indices[p++] = C;
    }
  } else {
    // Bottom annular ring outer→hole at z=0 (normal −Z).
    for (let i = 0; i < Nx; i++) {
      const A = outer(i, Ny - 1),     B_ = outer(i + 1, Ny - 1);
      const C = holeB(i + 1),          D = holeB(i);
      indices[p++] = A; indices[p++] = C; indices[p++] = B_;
      indices[p++] = A; indices[p++] = D; indices[p++] = C;
    }
    // Hole side wall from z=0 (holeB) up to z=B (holeT). Wall material is
    // outside the hole, so the surface normal points inward (toward origin),
    // away from the wall material into the hole void.
    for (let i = 0; i < Nx; i++) {
      const A = holeB(i),     B_ = holeB(i + 1);
      const C = holeT(i + 1), D = holeT(i);
      indices[p++] = A; indices[p++] = D; indices[p++] = C;
      indices[p++] = A; indices[p++] = C; indices[p++] = B_;
    }
    // Inner-floor annular ring hole→inner at z=B (normal +Z), sealing the
    // cavity around the hole.
    for (let i = 0; i < Nx; i++) {
      const A = holeT(i),         B_ = holeT(i + 1);
      const C = inner(i + 1, Ny - 1), D = inner(i, Ny - 1);
      indices[p++] = A; indices[p++] = C; indices[p++] = B_;
      indices[p++] = A; indices[p++] = D; indices[p++] = C;
    }
  }

  return {
    positions,
    indices,
    triCount,
    vertCount: totalVerts,
    Nx,
    Ny,
    circumference
  };
}

// Build a hollow rectangular tube whose outer face receives the relief.
//
// opts: { xSize, ySize, thickness, bottomThickness, height }
//   xSize / ySize  — inner cavity dimensions (mm); outer = inner + 2·thickness
//   thickness      — wall thickness (mm), grows outward
//   bottomThickness— floor slab height (mm); defaults to thickness.
//                    Set to 0 for a fully open bottom (cavity all the way
//                    through, producing a rectangular through-hole).
//   height         — extrusion height (mm)
//
// Perimeter parameterization: Nx columns spaced evenly by arc length around
// the outer rectangle, starting at (+outerHalfX, −outerHalfY) going CCW:
//   Face 0: right (+X face)   Face 1: top (+Y face)
//   Face 2: left  (−X face)   Face 3: bottom (−Y face)
// The corresponding inner column is at the same relative position on the
// same face of the inner rectangle, so the wall thickness is uniform on
// each face. Relief pushes each outer vertex outward along the face normal.
export function buildRectProfileGeometry(heightmap, opts) {
  const Nx = heightmap.width;
  const Ny = heightmap.height;
  if (Nx < 4 || Ny < 2) {
    throw new Error('RectProfile mesh requires Nx >= 4 and Ny >= 2');
  }
  const xSize = opts.xSize;
  const ySize = opts.ySize;
  const B  = opts.thickness;
  const H  = opts.height;
  const BF = opts.bottomThickness !== undefined ? opts.bottomThickness : B;
  if (!(B > 0))  throw new Error('Outside thickness must be positive');
  if (B >= H)    throw new Error('Outside thickness must be smaller than extrusion height');
  if (BF < 0)    throw new Error('Bottom thickness must be ≥ 0');
  if (BF >= H)   throw new Error('Bottom thickness must be smaller than extrusion height');
  const openBottom = BF < 1e-9;

  const innerHalfX = xSize / 2;
  const innerHalfY = ySize / 2;
  const outerHalfX = innerHalfX + B;
  const outerHalfY = innerHalfY + B;
  const outerX = xSize + 2 * B;
  const outerY = ySize + 2 * B;
  const innerX = xSize;
  const innerY = ySize;

  // Cumulative arc lengths at each corner of the outer rectangle
  const P = 2 * (outerX + outerY);
  const outerCumLen = [0, outerY, outerY + outerX, 2 * outerY + outerX, P];

  // Precompute per-column positions and outward normals
  const outXArr  = new Float32Array(Nx);
  const outYArr  = new Float32Array(Nx);
  const inXArr   = new Float32Array(Nx);
  const inYArr   = new Float32Array(Nx);
  const normXArr = new Float32Array(Nx);
  const normYArr = new Float32Array(Nx);

  for (let i = 0; i < Nx; i++) {
    const s = (i / Nx) * P;
    let face = 0;
    while (face < 3 && s >= outerCumLen[face + 1]) face++;
    const faceLen = outerCumLen[face + 1] - outerCumLen[face];
    const f = faceLen > 0 ? (s - outerCumLen[face]) / faceLen : 0;
    switch (face) {
      case 0: // right face: x=+outerHalfX, y from -outerHalfY to +outerHalfY
        outXArr[i] = outerHalfX; outYArr[i] = -outerHalfY + f * outerY;
        inXArr[i]  = innerHalfX; inYArr[i]  = -innerHalfY + f * innerY;
        normXArr[i] = 1; normYArr[i] = 0; break;
      case 1: // top face: y=+outerHalfY, x from +outerHalfX to -outerHalfX
        outXArr[i] = outerHalfX - f * outerX; outYArr[i] = outerHalfY;
        inXArr[i]  = innerHalfX - f * innerX; inYArr[i]  = innerHalfY;
        normXArr[i] = 0; normYArr[i] = 1; break;
      case 2: // left face: x=-outerHalfX, y from +outerHalfY to -outerHalfY
        outXArr[i] = -outerHalfX; outYArr[i] = outerHalfY - f * outerY;
        inXArr[i]  = -innerHalfX; inYArr[i]  = innerHalfY - f * innerY;
        normXArr[i] = -1; normYArr[i] = 0; break;
      default: // bottom face: y=-outerHalfY, x from -outerHalfX to +outerHalfX
        outXArr[i] = -outerHalfX + f * outerX; outYArr[i] = -outerHalfY;
        inXArr[i]  = -innerHalfX + f * innerX; inYArr[i]  = -innerHalfY;
        normXArr[i] = 0; normYArr[i] = -1; break;
    }
  }

  // openBottom skips the two fan centers — bottom becomes an annular ring.
  const extraVerts = openBottom ? 0 : 2;
  const totalVerts = 2 * Nx * Ny + extraVerts;
  const positions  = new Float32Array(totalVerts * 3);
  const innerOffset = Nx * Ny;
  // Inner cavity z bottom: floor at z=BF normally; z=0 when bottom is open.
  const innerZBottom = openBottom ? 0 : BF;

  // Outer surface: relief pushes each vertex outward along the face normal
  for (let j = 0; j < Ny; j++) {
    const z = H - (j / (Ny - 1)) * H;
    for (let i = 0; i < Nx; i++) {
      const h  = heightmap.data[i + j * Nx];
      const vi = (i + j * Nx) * 3;
      positions[vi]     = outXArr[i] + normXArr[i] * h;
      positions[vi + 1] = outYArr[i] + normYArr[i] * h;
      positions[vi + 2] = z;
    }
  }

  // Inner surface: smooth, z from H down to innerZBottom (floor or 0).
  for (let j = 0; j < Ny; j++) {
    const z = H - (j / (Ny - 1)) * (H - innerZBottom);
    for (let i = 0; i < Nx; i++) {
      const vi = (innerOffset + i + j * Nx) * 3;
      positions[vi]     = inXArr[i];
      positions[vi + 1] = inYArr[i];
      positions[vi + 2] = z;
    }
  }

  let bottomCenter = -1, floorCenter = -1;
  if (!openBottom) {
    // Bottom center (outer fan at z=0) and floor center (inner fan at z=BF)
    const centerBase = 2 * Nx * Ny;
    bottomCenter = centerBase;
    floorCenter  = centerBase + 1;
    positions[bottomCenter * 3] = 0; positions[bottomCenter * 3 + 1] = 0; positions[bottomCenter * 3 + 2] = 0;
    positions[floorCenter  * 3] = 0; positions[floorCenter  * 3 + 1] = 0; positions[floorCenter  * 3 + 2] = BF;
  }

  // Same total either way: 2 fan tris/i (sealed) ≡ 2 ring tris/i (open).
  const triCount = 4 * Nx * (Ny - 1) + 4 * Nx;
  const indices  = new Uint32Array(triCount * 3);
  let p = 0;

  const wrap  = (i) => (i === Nx ? 0 : i);
  const outer = (i, j) => wrap(i) + j * Nx;
  const inner = (i, j) => innerOffset + wrap(i) + j * Nx;

  // Outer surface — outward normals (same winding as ellipse/cylinder)
  for (let j = 0; j < Ny - 1; j++) {
    for (let i = 0; i < Nx; i++) {
      const A = outer(i, j), B_ = outer(i + 1, j);
      const C = outer(i + 1, j + 1), D = outer(i, j + 1);
      indices[p++] = A; indices[p++] = D; indices[p++] = C;
      indices[p++] = A; indices[p++] = C; indices[p++] = B_;
    }
  }

  // Inner surface — inward normals (reversed winding)
  for (let j = 0; j < Ny - 1; j++) {
    for (let i = 0; i < Nx; i++) {
      const A = inner(i, j), B_ = inner(i + 1, j);
      const C = inner(i + 1, j + 1), D = inner(i, j + 1);
      indices[p++] = A; indices[p++] = C; indices[p++] = D;
      indices[p++] = A; indices[p++] = B_; indices[p++] = C;
    }
  }

  // Top cap — annular outer→inner at z=H, normal +Z
  for (let i = 0; i < Nx; i++) {
    const A = outer(i, 0), B_ = outer(i + 1, 0);
    const C = inner(i + 1, 0), D = inner(i, 0);
    indices[p++] = A; indices[p++] = B_; indices[p++] = C;
    indices[p++] = A; indices[p++] = C;  indices[p++] = D;
  }

  if (openBottom) {
    // Open bottom: annular outer→inner ring at z=0 (normal −Z, reverse
    // winding vs. top cap). The cavity becomes a through-hole.
    for (let i = 0; i < Nx; i++) {
      const A = outer(i, Ny - 1),     B_ = outer(i + 1, Ny - 1);
      const C = inner(i + 1, Ny - 1), D = inner(i, Ny - 1);
      indices[p++] = A; indices[p++] = C; indices[p++] = B_;
      indices[p++] = A; indices[p++] = D; indices[p++] = C;
    }
  } else {
    // Bottom disc — outer fan at z=0, normal −Z
    for (let i = 0; i < Nx; i++) {
      const A = outer(i, Ny - 1), B_ = outer(i + 1, Ny - 1);
      indices[p++] = bottomCenter; indices[p++] = B_; indices[p++] = A;
    }
    // Floor disc — inner fan at z=BF, normal +Z
    for (let i = 0; i < Nx; i++) {
      const i0 = inner(i, Ny - 1), i1 = inner(i + 1, Ny - 1);
      indices[p++] = floorCenter; indices[p++] = i0; indices[p++] = i1;
    }
  }

  return { positions, indices, triCount, vertCount: totalVerts, Nx, Ny, perimeter: P };
}

// Tile a finished geometry along the given world axis. Each copy is shifted
// by step = bbox(axis) + offsetMm, and the whole assembly is recentered so
// the original center on that axis is preserved. vertexColors are
export function estimatePolyProfileTriangleCount(Nface, Np) {
  // Outer surface: 2·Nface·(Ny−1) + Inner surface: 2·Nface·(Ni−1)
  // + top/bottom caps: 4·Nface. Total = 2·Nface·(Ny+Ni) = 2·Nface·Np.
  return 2 * Nface * Np;
}

// Sweep a closed 2D profile along a regular-polygon path using cylinder-like
// topology (angular direction wraps closed; profile direction is split into
// outer and inner bands with caps, like PolygonPrismGeometry).
//
// Coordinate convention
//   - Profile X = distance outward from the polygon face (face sits at r=0).
//   - Profile Y = axial coord → world Z.
//   - Image columns wrap once around the full polygon perimeter; image rows
//     map onto outer-band points (row 0 → top/high-Z end of the band).
//
// Inputs
//   heightmap:       { data: Float32Array(Nx*Ny), width: Nx, height: Ny }
//   opts.radius:      polygon circumradius R (mm) — distance from center to vertices
//   opts.sides:       number of polygon sides (N)
//   opts.profile:     Array of [r, z] pairs, closed loop, no duplicate end.
//                     After splicing, indices 0..Ny−1 = outer band (resampled),
//                     indices Ny..Np−1 = inner band.
//   opts.outerStart:  index of first outer-band point (always 0 after splice)
//   opts.outerLength: number of outer-band points (must equal Ny)
//
// Topology: cylinder-like — outer surface (Nface × Ny) + inner surface
// (Nface × Ni) + top/bottom annular caps, where Nface = N·(Nx−1).
export function buildPolyProfileGeometry(heightmap, opts) {
  const Nx = heightmap.width;
  const Ny = heightmap.height;
  if (Nx < 3 || Ny < 2) {
    throw new Error('PolyProfile mesh requires Nx >= 3 and Ny >= 2');
  }
  const profile = opts.profile;
  if (!Array.isArray(profile) || profile.length < 3) {
    throw new Error('PolyProfile: profile must be a closed loop of at least 3 points');
  }
  const Np = profile.length;
  const N = Math.max(3, Math.min(64, opts.sides | 0));
  const R = opts.radius;                // circumradius
  if (!(R > 0)) throw new Error('PolyProfile: radius must be > 0');

  const outerStart  = opts.outerStart | 0;
  const outerLength = opts.outerLength | 0;
  if (outerLength !== Ny) {
    throw new Error(`PolyProfile: outer band length (${outerLength}) must equal Ny (${Ny})`);
  }
  const NyInner = Np - Ny;              // inner-band point count

  // Polygon geometry from circumradius R
  const apothem = R * Math.cos(Math.PI / N);
  const sideWidth = 2 * R * Math.sin(Math.PI / N);
  const Nface = N * (Nx - 1);           // angular vertices around polygon (corners shared)

  // Mark outer-band profile indices and their image row 0..Ny−1.
  const bandStartZ = profile[outerStart][1];
  const bandEndZ   = profile[(outerStart + outerLength - 1) % Np][1];
  const bandGoesDown = bandStartZ >= bandEndZ;
  const outerRow = new Int32Array(Np).fill(-1);
  for (let k = 0; k < outerLength; k++) {
    const row = bandGoesDown ? k : (outerLength - 1 - k);
    outerRow[(outerStart + k) % Np] = row;
  }

  // Clamp tiny-negative r (CAD round-trip noise) to 0; reject real negatives
  // that would punch through the polygon center.
  const AXIS_TOL = 1e-3;
  let minR = Infinity;
  for (let i = 0; i < profile.length; i++) {
    const r = profile[i][0];
    if (r < 0 && r > -AXIS_TOL) {
      profile[i] = [0, profile[i][1]];
    } else if (r < minR) {
      minR = r;
    }
  }
  if (minR < -apothem + AXIS_TOL) {
    throw new Error('PolyProfile: profile extends inward past the polygon center. Increase radius or reduce profile depth.');
  }

  // Map ring index → heightmap column (Nx columns wrap full perimeter)
  const ringToCol = (ring) => {
    const f = (ring / Nface) * Nx;
    return Math.round(f) % Nx;
  };

  // Face normals / tangents
  const cosT = new Float32Array(N);
  const sinT = new Float32Array(N);
  for (let k = 0; k < N; k++) {
    const t = (k * 2 * Math.PI) / N;
    cosT[k] = Math.cos(t);
    sinT[k] = Math.sin(t);
  }

  // Helper: compute world XY for a given (ring, r, s) — ring determines the
  // face and position along it; r = distance from face; s = param along face.
  const facePos = (ring, r) => {
    const k = Math.floor(ring / (Nx - 1));
    const seg = ring - k * (Nx - 1);
    const s = (seg / (Nx - 1)) * sideWidth - sideWidth / 2;
    const cT = cosT[k], sT = sinT[k];
    return {
      x: (apothem + r) * cT - s * sT,
      y: (apothem + r) * sT + s * cT
    };
  };

  // Polygon corner position at offset r (perpendicular to both adjacent faces).
  // The offset-by-r polygon's corner is the intersection of face (k−1)'s and
  // face k's lines pushed outward by r; that intersection lies along the
  // outward bisector at distance (apothem + r)/cos(π/N) from center.
  // Without this, placing the corner in just one face's frame puts it at
  // (apothem + r) along that face's normal — which is "inside" the true
  // offset corner and creates a visible chamfer strip at every corner
  // (the bug that turned an N=4 prism into an octagon).
  const cosHalfAngle = Math.cos(Math.PI / N);
  const cornerPos = (kc, r) => {
    const a = (kc * 2 * Math.PI) / N - Math.PI / N;
    const dist = (apothem + r) / cosHalfAngle;
    return { x: dist * Math.cos(a), y: dist * Math.sin(a) };
  };

  const outerCount = Nface * Ny;
  const innerCount = Nface * NyInner;
  const totalVerts = outerCount + innerCount;
  const positions = new Float32Array(totalVerts * 3);

  // --- Outer surface vertices (Nface × Ny) ---
  // At polygon-corner rings (ring % (Nx-1) === 0) place the vertex on the
  // outward bisector at the offset corner of the (apothem + r0)-polygon, with
  // relief forced to 0 — matches PolygonPrism's "col 0 → flat corner" rule
  // and keeps the corner sharp regardless of r0 or relief.
  for (let j = 0; j < Ny; j++) {
    const i = outerStart + j;   // profile index for outer-band row j
    const r0 = profile[i][0];
    const z  = profile[i][1];
    for (let ring = 0; ring < Nface; ring++) {
      let x, y;
      if (ring % (Nx - 1) === 0) {
        const kc = ring / (Nx - 1);
        ({ x, y } = cornerPos(kc, r0));
      } else {
        const col = ringToCol(ring);
        const relief = heightmap.data[col + j * Nx];
        ({ x, y } = facePos(ring, r0 + relief));
      }
      const vi = (ring + j * Nface) * 3;
      positions[vi]     = x;
      positions[vi + 1] = y;
      positions[vi + 2] = z;
    }
  }

  // --- Inner surface vertices (Nface × NyInner) ---
  // Inner band goes from bottom (after outer band) back to top, completing the
  // closed profile loop. inner row 0 = bottom (meets outer row Ny−1),
  // inner row NyInner−1 = top (meets outer row 0). Corner rings use the
  // bisector formula so the inner surface follows the same offset polygon as
  // the outer at every row.
  for (let j = 0; j < NyInner; j++) {
    const i = (outerStart + outerLength + j) % Np;
    const r0 = profile[i][0];
    const z  = profile[i][1];
    for (let ring = 0; ring < Nface; ring++) {
      let x, y;
      if (ring % (Nx - 1) === 0) {
        const kc = ring / (Nx - 1);
        ({ x, y } = cornerPos(kc, r0));
      } else {
        ({ x, y } = facePos(ring, r0));
      }
      const vi = (outerCount + ring + j * Nface) * 3;
      positions[vi]     = x;
      positions[vi + 1] = y;
      positions[vi + 2] = z;
    }
  }

  // --- Indices ---
  const triCount = estimatePolyProfileTriangleCount(Nface, Np);
  const indices = new Uint32Array(triCount * 3);
  let p = 0;

  const outer = (ring, row) => ((ring % Nface + Nface) % Nface) + row * Nface;
  const inner = (ring, row) => outerCount + ((ring % Nface + Nface) % Nface) + row * Nface;

  // Outer surface (outward normal)
  for (let j = 0; j < Ny - 1; j++) {
    for (let ring = 0; ring < Nface; ring++) {
      const a = outer(ring,     j);
      const b = outer(ring + 1, j);
      const c = outer(ring + 1, j + 1);
      const d = outer(ring,     j + 1);
      indices[p++] = a; indices[p++] = d; indices[p++] = c;
      indices[p++] = a; indices[p++] = c; indices[p++] = b;
    }
  }

  // Inner-band surface. Each strip of the inner band traces one segment of
  // the profile's interior loop (e.g. for a rectangular profile: bottom
  // floor → inner wall → top ceiling). For the result to be a closed solid,
  // every triangle's normal has to point AWAY from the wall material — into
  // empty space — which means outward-facing for the bottom/top sub-strips
  // and inward-toward-polygon-center for the side sub-strip. All three
  // come out correctly with the SAME winding the outer surface uses
  // (a→d→c, a→c→b); reversing the winding here (the prior version) put
  // every inner-band triangle facing into the wall material instead, so
  // back-face culling rendered them invisible and the front wall of the
  // prism looked transparent.
  for (let j = 0; j < NyInner - 1; j++) {
    for (let ring = 0; ring < Nface; ring++) {
      const a = inner(ring,     j);
      const b = inner(ring + 1, j);
      const c = inner(ring + 1, j + 1);
      const d = inner(ring,     j + 1);
      indices[p++] = a; indices[p++] = d; indices[p++] = c;
      indices[p++] = a; indices[p++] = c; indices[p++] = b;
    }
  }

  // Top cap: outer row 0 ↔ inner row NyInner−1 (both at profile top / max Z)
  for (let ring = 0; ring < Nface; ring++) {
    const o0 = outer(ring,     0);
    const o1 = outer(ring + 1, 0);
    const i0 = inner(ring,     NyInner - 1);
    const i1 = inner(ring + 1, NyInner - 1);
    indices[p++] = o0; indices[p++] = o1; indices[p++] = i1;
    indices[p++] = o0; indices[p++] = i1; indices[p++] = i0;
  }

  // Bottom cap: outer row Ny−1 ↔ inner row 0 (both at profile bottom / min Z)
  for (let ring = 0; ring < Nface; ring++) {
    const o0 = outer(ring,     Ny - 1);
    const o1 = outer(ring + 1, Ny - 1);
    const i0 = inner(ring,     0);
    const i1 = inner(ring + 1, 0);
    indices[p++] = o0; indices[p++] = i1; indices[p++] = o1;
    indices[p++] = o0; indices[p++] = i0; indices[p++] = i1;
  }

  return {
    positions,
    indices,
    triCount,
    vertCount: totalVerts,
    Nx,
    Ny,
    Np,
    Nface,
    outerCount,
    outerStart,
    outerLength
  };
}

// replicated alongside positions/indices. count <= 1 returns inputs as-is.
// axis: 'x' | 'y' | 'z' (default 'y').
export function replicateGeometry(geom, vertexColors, count, offsetMm, axis = 'y') {
  if (!geom || count <= 1) return { geom, vertexColors };
  const ax = axis === 'x' ? 0 : axis === 'z' ? 2 : 1;
  const verts = geom.positions.length / 3;
  const idxLen = geom.indices.length;
  let lo = Infinity, hi = -Infinity;
  for (let v = 0; v < verts; v++) {
    const c = geom.positions[v * 3 + ax];
    if (c < lo) lo = c;
    if (c > hi) hi = c;
  }
  const bbox = hi - lo;
  const step = bbox + (offsetMm || 0);
  const cOff = (count - 1) / 2;

  const newPositions = new Float32Array(geom.positions.length * count);
  const newIndices   = new Uint32Array(idxLen * count);
  const newColors    = vertexColors ? new Float32Array(vertexColors.length * count) : null;

  for (let k = 0; k < count; k++) {
    const vBase = k * verts;
    const pBase = vBase * 3;
    const delta = (k - cOff) * step;
    for (let v = 0; v < verts; v++) {
      newPositions[pBase + v * 3]     = geom.positions[v * 3];
      newPositions[pBase + v * 3 + 1] = geom.positions[v * 3 + 1];
      newPositions[pBase + v * 3 + 2] = geom.positions[v * 3 + 2];
      newPositions[pBase + v * 3 + ax] += delta;
    }
    const iBase = k * idxLen;
    for (let t = 0; t < idxLen; t++) {
      newIndices[iBase + t] = geom.indices[t] + vBase;
    }
    if (newColors) newColors.set(vertexColors, vBase * 3);
  }

  const newGeom = {
    ...geom,
    positions: newPositions,
    indices: newIndices,
    triCount: (geom.triCount || idxLen / 3) * count,
    vertCount: verts * count,
    repeatCount: count,
    repeatAxis: axis,
    repeatStep: step
  };
  return { geom: newGeom, vertexColors: newColors };
}
