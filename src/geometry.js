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

export function estimateEllipseTriangleCount(Nx, Ny) {
  // outer + inner shells: 4·Nx·(Ny−1); top cap (annular): 2·Nx; bottom: up to
  // 6·Nx when a partial hole adds side walls + inner floor. Use the upper
  // bound so the auto/hard limits don't underestimate.
  return 4 * Nx * (Ny - 1) + 8 * Nx;
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
// Bottom hole: a smaller similar ellipse with axes (aIn·p, bIn·p) where
// p = bottomHolePct/100. p=0 gives a closed floor (solid disc at z=0 plus a
// sealed inner-floor disc at z=B). p=100 gives a fully open bottom (annular
// outer→inner ring at z=0). Intermediate p creates an actual hole: annular
// outer→hole at z=0, vertical hole walls from z=0 to z=B, annular hole→inner
// floor at z=B sealing the cavity around the hole.
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
  // continues all the way down to z=0 (no floor); otherwise it stops at z=B
  // where the floor (or hole floor annulus) seals it.
  const innerZBottom = fullHole ? 0 : B;

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
    positions[floorCenter * 3 + 2]  = B;
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
      positions[vi + 2] = B;
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
