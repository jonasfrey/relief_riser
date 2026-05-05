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

export function estimatePolygonPrismTriangleCount(N, NxPerFace, Ny) {
  // Per face outer + shared inner: 4N(Nx-1)(Ny-1)
  // Top + bottom edge walls per face: 4N(Nx-1)
  // Outer seam wall per corner: 2N(Ny-1)
  // Top + bottom corner closing triangles: 2N
  return 2 * N * Ny * (2 * NxPerFace - 1);
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

// Build an open-ended thick-walled cylinder ("vase / lantern" shape) where
// the outer surface carries the relief mapped via polar coordinates and the
// inner surface is a smooth cylinder at radius D/2 - baseThickness.
//
// The cylinder axis is the Z axis. The model rests on Z=0 and rises to Z=H.
// The image's pixel column 0 corresponds to angle θ=0 and increases CCW
// (looking from +Z); pixel row 0 corresponds to z=H. The two ends are open
// annular caps (top + bottom rings between R_inner and R_base+relief).
export function buildCylindricalGeometry(heightmap, opts) {
  const Nx = heightmap.width;
  const Ny = heightmap.height;
  if (Nx < 3 || Ny < 2) {
    throw new Error('Cylindrical mesh requires Nx >= 3 and Ny >= 2');
  }

  const D = opts.diameter;
  const H = opts.height;
  const B = opts.baseThickness;
  const Rbase = D / 2;
  const Rinner = Rbase - B;
  if (Rinner <= 0) {
    throw new Error(`Base thickness (${B}) must be smaller than D/2 (${Rbase})`);
  }

  const totalVerts = 2 * Nx * Ny;
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
  // Inner surface (constant radius)
  for (let j = 0; j < Ny; j++) {
    const z = H - (j / (Ny - 1)) * H;
    for (let i = 0; i < Nx; i++) {
      const vi = (innerOffset + i + j * Nx) * 3;
      positions[vi]     = Rinner * cosT[i];
      positions[vi + 1] = Rinner * sinT[i];
      positions[vi + 2] = z;
    }
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
  // Bottom cap (j=Ny-1, z=0, normal -Z): reverse winding
  for (let i = 0; i < Nx; i++) {
    const a = outer(i, Ny - 1),     b = outer(i + 1, Ny - 1);
    const c = inner(i + 1, Ny - 1), d = inner(i, Ny - 1);
    indices[p++] = a; indices[p++] = c; indices[p++] = b;
    indices[p++] = a; indices[p++] = d; indices[p++] = c;
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

// Build an open-ended N-sided polygon prism ("hollow box") where each of the
// N flat outer faces carries the SAME relief image. Inner is a smooth N-gon
// at perpendicular distance `apothem` from the axis; outer face k is at
// distance `apothem + baseThickness + relief(face-local i, j)` along its own
// normal. The mesh is watertight (torus topology, like the cylinder mode).
//
// Per face the outer grid is independent so each face can show the full
// image. The inner ring is a single shared closed loop — its corners
// coincide geometrically (no relief there), so sharing avoids degenerate
// triangles. The outer seam at each polygon corner is closed by a quad
// strip (joining the two adjacent outer right/left edges) plus one corner
// triangle at the top and one at the bottom that bridges the inner corner
// vertex to the two outer corner vertices.
export function buildPolygonPrismGeometry(heightmap, opts) {
  const Nx = heightmap.width;        // vertices per face along the side width
  const Ny = heightmap.height;       // vertices along Z
  if (Nx < 2 || Ny < 2) {
    throw new Error('Polygon prism heightmap must be at least 2x2');
  }
  const N = Math.max(3, Math.min(64, opts.sides | 0));
  const W = opts.sideWidth;
  const H = opts.height;
  const B = opts.baseThickness;
  // Default closed (sealed floor of thickness B). When false, the bottom is
  // an annular cap like the cylinder mode.
  const closedBottom = opts.closedBottom !== false;
  const apothem = W / (2 * Math.tan(Math.PI / N));
  if (!(apothem > 0)) throw new Error('Invalid polygon parameters');
  if (closedBottom && B >= H) throw new Error('Base thickness must be smaller than height for closed bottom');

  const NxInner = N * (Nx - 1);            // shared inner ring vertex count
  const innerCount = NxInner * Ny;
  const outerCount = N * Nx * Ny;
  // Closed bottom adds 2 vertices: bottom-face center at (0,0,0) and inner-
  // floor-disc center at (0,0,B).
  const extraVerts = closedBottom ? 2 : 0;
  const totalVerts = innerCount + outerCount + extraVerts;
  const positions = new Float32Array(totalVerts * 3);

  const cosT = new Float32Array(N);
  const sinT = new Float32Array(N);
  for (let k = 0; k < N; k++) {
    const t = (k * 2 * Math.PI) / N;
    cosT[k] = Math.cos(t);
    sinT[k] = Math.sin(t);
  }

  // Inner ring vertices. Each global ring index maps to (face, face-local col).
  // For closed bottom the inner surface stops at z=B (top of the floor) so
  // the bottom B mm is solid material.
  const innerZBottom = closedBottom ? B : 0;
  for (let j = 0; j < Ny; j++) {
    const z = H - (j / (Ny - 1)) * (H - innerZBottom);
    for (let i = 0; i < NxInner; i++) {
      const k = Math.floor(i / (Nx - 1));
      const col = i - k * (Nx - 1);
      const s = (col / (Nx - 1)) * W - W / 2;
      const cT = cosT[k], sT = sinT[k];
      const x = apothem * cT + s * (-sT);
      const y = apothem * sT + s * cT;
      const vi = (i + j * NxInner) * 3;
      positions[vi]     = x;
      positions[vi + 1] = y;
      positions[vi + 2] = z;
    }
  }

  // Center vertices for closed-bottom mode
  const bottomCenter = closedBottom ? innerCount + outerCount : -1;
  const floorCenter  = closedBottom ? innerCount + outerCount + 1 : -1;
  if (closedBottom) {
    positions[bottomCenter * 3]     = 0;
    positions[bottomCenter * 3 + 1] = 0;
    positions[bottomCenter * 3 + 2] = 0;
    positions[floorCenter * 3]      = 0;
    positions[floorCenter * 3 + 1]  = 0;
    positions[floorCenter * 3 + 2]  = B;
  }

  // Outer per-face grids
  const outerStart = new Array(N);
  for (let k = 0; k < N; k++) {
    outerStart[k] = innerCount + k * Nx * Ny;
    const cT = cosT[k], sT = sinT[k];
    for (let j = 0; j < Ny; j++) {
      const z = H - (j / (Ny - 1)) * H;
      for (let i = 0; i < Nx; i++) {
        const s = (i / (Nx - 1)) * W - W / 2;
        const r = apothem + B + heightmap.data[i + j * Nx];
        const x = r * cT + s * (-sT);
        const y = r * sT + s * cT;
        const vi = (outerStart[k] + i + j * Nx) * 3;
        positions[vi]     = x;
        positions[vi + 1] = y;
        positions[vi + 2] = z;
      }
    }
  }

  const triCount = estimatePolygonPrismTriangleCount(N, Nx, Ny);
  const indices = new Uint32Array(triCount * 3);
  let p = 0;

  const inner = (i, j) => (((i % NxInner) + NxInner) % NxInner) + j * NxInner;
  const outerK = (k, i, j) => outerStart[k] + i + j * Nx;
  // Inner ring index for face k, face-local column col.
  const innerForFace = (k, col, j) => inner(k * (Nx - 1) + col, j);

  // Inner surface: closed ring with inward (toward-axis) normals
  for (let j = 0; j < Ny - 1; j++) {
    for (let i = 0; i < NxInner; i++) {
      const a = inner(i, j);
      const b = inner(i + 1, j);
      const c = inner(i + 1, j + 1);
      const d = inner(i, j + 1);
      indices[p++] = a; indices[p++] = c; indices[p++] = d;
      indices[p++] = a; indices[p++] = b; indices[p++] = c;
    }
  }

  // Outer surface per face: outward normal along face-k normal direction
  for (let k = 0; k < N; k++) {
    for (let j = 0; j < Ny - 1; j++) {
      for (let i = 0; i < Nx - 1; i++) {
        const a = outerK(k, i, j);
        const b = outerK(k, i + 1, j);
        const c = outerK(k, i + 1, j + 1);
        const d = outerK(k, i, j + 1);
        indices[p++] = a; indices[p++] = d; indices[p++] = c;
        indices[p++] = a; indices[p++] = c; indices[p++] = b;
      }
    }
  }

  // Top edge wall per face (z=H, normal +Z)
  for (let k = 0; k < N; k++) {
    for (let i = 0; i < Nx - 1; i++) {
      const o0 = outerK(k, i, 0);
      const o1 = outerK(k, i + 1, 0);
      const i0 = innerForFace(k, i, 0);
      const i1 = innerForFace(k, i + 1, 0);
      indices[p++] = o0; indices[p++] = o1; indices[p++] = i1;
      indices[p++] = o0; indices[p++] = i1; indices[p++] = i0;
    }
  }

  if (!closedBottom) {
    // Bottom edge wall per face (annular cap at z=0, normal -Z)
    for (let k = 0; k < N; k++) {
      for (let i = 0; i < Nx - 1; i++) {
        const o0 = outerK(k, i, Ny - 1);
        const o1 = outerK(k, i + 1, Ny - 1);
        const i0 = innerForFace(k, i, Ny - 1);
        const i1 = innerForFace(k, i + 1, Ny - 1);
        indices[p++] = o0; indices[p++] = i1; indices[p++] = o1;
        indices[p++] = o0; indices[p++] = i0; indices[p++] = i1;
      }
    }
  }

  // Outer seam walls: between face k right outer edge and face (k+1) left
  // outer edge. Even with zero relief these have width because the outer
  // planes are offset by B from the inner planes.
  for (let k = 0; k < N; k++) {
    const kn = (k + 1) % N;
    for (let j = 0; j < Ny - 1; j++) {
      const a = outerK(k,  Nx - 1, j);     // top, face-k side
      const b = outerK(kn, 0,      j);     // top, face-(k+1) side
      const c = outerK(kn, 0,      j + 1); // bottom, face-(k+1) side
      const d = outerK(k,  Nx - 1, j + 1); // bottom, face-k side
      indices[p++] = a; indices[p++] = d; indices[p++] = c;
      indices[p++] = a; indices[p++] = c; indices[p++] = b;
    }
  }

  // Top corner triangles: close the gap above each seam wall (normal +Z)
  for (let k = 0; k < N; k++) {
    const kn = (k + 1) % N;
    const tInner = innerForFace(kn, 0, 0); // shared inner top corner
    const tkR = outerK(k,  Nx - 1, 0);
    const tknL = outerK(kn, 0,     0);
    indices[p++] = tInner; indices[p++] = tkR; indices[p++] = tknL;
  }

  if (!closedBottom) {
    // Bottom corner triangles (normal -Z) close the gap below each seam wall
    for (let k = 0; k < N; k++) {
      const kn = (k + 1) % N;
      const bInner = innerForFace(kn, 0, Ny - 1);
      const bkR = outerK(k,  Nx - 1, Ny - 1);
      const bknL = outerK(kn, 0,     Ny - 1);
      indices[p++] = bInner; indices[p++] = bknL; indices[p++] = bkR;
    }
  } else {
    // Closed bottom: replace the annular bottom + bottom corners with two
    // solid faces (a flat bottom at z=0 spanning the full outer perimeter
    // and an inner floor disc at z=B sealing the inner void).

    // Bottom face at z=0 (normal -Z): triangle fan from bottomCenter to the
    // outer perimeter walking each face's bottom row plus the seam edges
    // between adjacent faces.
    for (let k = 0; k < N; k++) {
      for (let i = 0; i < Nx - 1; i++) {
        const a = outerK(k, i,     Ny - 1);
        const b = outerK(k, i + 1, Ny - 1);
        // (center, b, a) ⇒ −Z normal
        indices[p++] = bottomCenter; indices[p++] = b; indices[p++] = a;
      }
      const kn = (k + 1) % N;
      const a = outerK(k,  Nx - 1, Ny - 1);
      const b = outerK(kn, 0,      Ny - 1);
      indices[p++] = bottomCenter; indices[p++] = b; indices[p++] = a;
    }

    // Inner floor disc at z=B (normal +Z): triangle fan from floorCenter to
    // the inner ring at j=Ny-1 (which now sits at z=B).
    for (let i = 0; i < NxInner; i++) {
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
    outerStart
  };
}
