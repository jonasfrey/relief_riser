// Project an STL onto a grayscale depth image. Software Z-buffer rasterizer:
// for each pixel in the chosen view, keep the depth of the surface point
// closest to the camera. Output: a canvas where bright pixels = closest to
// the viewer (highest relief), black = no surface (or the back of the bbox).

const AXIS_INDEX = { x: 0, y: 1, z: 2 };

const SIDE_AXES = {
  // For each side, define which world axis maps to image-U (right), image-V
  // (up), and depth (toward viewer). uSign / vSign / dSign flip the axis if
  // needed so the result reads naturally from the named side.
  front:  { uAxis: 'x', uSign: +1, vAxis: 'z', vSign: +1, dAxis: 'y', dSign: +1 },
  back:   { uAxis: 'x', uSign: -1, vAxis: 'z', vSign: +1, dAxis: 'y', dSign: -1 },
  right:  { uAxis: 'y', uSign: -1, vAxis: 'z', vSign: +1, dAxis: 'x', dSign: +1 },
  left:   { uAxis: 'y', uSign: +1, vAxis: 'z', vSign: +1, dAxis: 'x', dSign: -1 },
  top:    { uAxis: 'x', uSign: +1, vAxis: 'y', vSign: +1, dAxis: 'z', dSign: +1 },
  bottom: { uAxis: 'x', uSign: +1, vAxis: 'y', vSign: -1, dAxis: 'z', dSign: -1 }
};

export const STL_SIDES = Object.keys(SIDE_AXES);

export function projectSTLToCanvas(stl, side, maxDim = 512) {
  const sideDef = SIDE_AXES[side] || SIDE_AXES.front;
  const positions = stl.positions;
  const triCount = stl.triCount;
  if (triCount === 0) throw new Error('STL has no triangles');

  const ui = AXIS_INDEX[sideDef.uAxis];
  const vi = AXIS_INDEX[sideDef.vAxis];
  const di = AXIS_INDEX[sideDef.dAxis];

  // Pass 1: transform every vertex to (U, V, D) and find bounding box.
  const tv = new Float32Array(triCount * 9);
  let umin = Infinity, umax = -Infinity;
  let vmin = Infinity, vmax = -Infinity;
  let dmin = Infinity, dmax = -Infinity;

  const totalVerts = triCount * 3;
  for (let i = 0; i < totalVerts; i++) {
    const ax = i * 3;
    const xyz = [positions[ax], positions[ax + 1], positions[ax + 2]];
    const u = sideDef.uSign * xyz[ui];
    const v = sideDef.vSign * xyz[vi];
    const d = sideDef.dSign * xyz[di];
    tv[ax]     = u;
    tv[ax + 1] = v;
    tv[ax + 2] = d;
    if (u < umin) umin = u; if (u > umax) umax = u;
    if (v < vmin) vmin = v; if (v > vmax) vmax = v;
    if (d < dmin) dmin = d; if (d > dmax) dmax = d;
  }

  const ur = umax - umin;
  const vr = vmax - vmin;
  if (ur <= 0 || vr <= 0) throw new Error('STL bounding box has zero area on this view');

  // Choose output resolution preserving the projected aspect, capped at maxDim
  let Nx, Ny;
  if (ur >= vr) {
    Nx = Math.max(2, Math.min(maxDim, Math.round(maxDim)));
    Ny = Math.max(2, Math.round(Nx * vr / ur));
  } else {
    Ny = Math.max(2, Math.min(maxDim, Math.round(maxDim)));
    Nx = Math.max(2, Math.round(Ny * ur / vr));
  }

  const depth = new Float32Array(Nx * Ny);
  depth.fill(-Infinity);

  // Map world bbox corners to *pixel-grid corners* so each pixel center sits
  // inside the bbox: ax=umin → pAx=0, ax=umax → pAx=Nx. With this, pixels
  // iterated 0..Nx-1 (centers 0.5..Nx-0.5) cover the full projected area.
  const xToI = Nx / ur;
  const yToJ = Ny / vr;
  const NyTop = Ny;

  // Pass 2: rasterize each triangle into the depth buffer using barycentric
  // edge functions. Works regardless of triangle winding because we divide
  // by the (signed) area2.
  for (let t = 0; t < triCount; t++) {
    const off = t * 9;
    const ax = tv[off],     ay = tv[off + 1], az = tv[off + 2];
    const bx = tv[off + 3], by = tv[off + 4], bz = tv[off + 5];
    const cx = tv[off + 6], cy = tv[off + 7], cz = tv[off + 8];

    const pAx = (ax - umin) * xToI;
    const pAy = NyTop - (ay - vmin) * yToJ;
    const pBx = (bx - umin) * xToI;
    const pBy = NyTop - (by - vmin) * yToJ;
    const pCx = (cx - umin) * xToI;
    const pCy = NyTop - (cy - vmin) * yToJ;

    let minX = Math.floor(Math.min(pAx, pBx, pCx));
    let maxX = Math.ceil(Math.max(pAx, pBx, pCx));
    let minY = Math.floor(Math.min(pAy, pBy, pCy));
    let maxY = Math.ceil(Math.max(pAy, pBy, pCy));
    if (minX < 0) minX = 0; if (maxX > Nx - 1) maxX = Nx - 1;
    if (minY < 0) minY = 0; if (maxY > Ny - 1) maxY = Ny - 1;
    if (minX > maxX || minY > maxY) continue;

    const ex = pBx - pAx, ey = pBy - pAy;
    const fx = pCx - pAx, fy = pCy - pAy;
    const area2 = ex * fy - ey * fx;
    if (area2 === 0) continue;
    const inv = 1 / area2;

    for (let py = minY; py <= maxY; py++) {
      const rowBase = py * Nx;
      for (let px = minX; px <= maxX; px++) {
        const dxp = px + 0.5 - pAx;
        const dyp = py + 0.5 - pAy;
        const wB = (dxp * fy - dyp * fx) * inv;
        const wC = (ex * dyp - ey * dxp) * inv;
        const wA = 1 - wB - wC;
        if (wA < 0 || wB < 0 || wC < 0) continue;
        const d = wA * az + wB * bz + wC * cz;
        const idx = rowBase + px;
        if (d > depth[idx]) depth[idx] = d;
      }
    }
  }

  // Convert depth → grayscale canvas. Pixels with no surface get 0 (black).
  const canvas = document.createElement('canvas');
  canvas.width = Nx;
  canvas.height = Ny;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(Nx, Ny);
  const data = imgData.data;
  const range = dmax - dmin;
  for (let i = 0; i < Nx * Ny; i++) {
    let g;
    if (depth[i] === -Infinity || range === 0) {
      g = 0;
    } else {
      g = Math.round((depth[i] - dmin) / range * 255);
      if (g < 0) g = 0; else if (g > 255) g = 255;
    }
    const j = i * 4;
    data[j] = data[j + 1] = data[j + 2] = g;
    data[j + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}
