// license Jonas Immanuel Frey GPL
// OBJ + MTL export for colored relief models.
// Triangles are grouped by their layer/level so each group gets a distinct
// material. The first vertex of each triangle determines its material — for
// the regular grid topology used by all geometry builders this aligns cleanly
// with the pixel-level quantisation in levelMap.

import { hexToRgb } from './imageProcessor.js';

function toLinear(v) { return (v / 255).toFixed(4); }

export function exportOBJMTL(positions, indices, levelMap, Nx, Ny, layerColors, N, baseName) {
  const surfaceVerts = Nx * Ny;
  const totalVerts = positions.length / 3;
  const triCount = indices.length / 3;

  // Build per-level material strings
  const mtlLines = [];
  for (let k = 0; k < N; k++) {
    const [r, g, b] = hexToRgb(layerColors[k] || '#888888');
    mtlLines.push(`newmtl mat_${k}`);
    mtlLines.push(`Ka ${toLinear(r)} ${toLinear(g)} ${toLinear(b)}`);
    mtlLines.push(`Kd ${toLinear(r)} ${toLinear(g)} ${toLinear(b)}`);
    mtlLines.push('Ks 0.0000 0.0000 0.0000');
    mtlLines.push('d 1.0');
    mtlLines.push('');
  }

  // Group triangle indices by material
  const trisByMat = Array.from({ length: N }, () => []);
  for (let t = 0; t < triCount; t++) {
    const v0 = indices[t * 3];
    let pixelIdx;
    if (v0 < surfaceVerts) {
      pixelIdx = v0;
    } else if (v0 < 2 * surfaceVerts) {
      pixelIdx = v0 - surfaceVerts;
    } else {
      pixelIdx = 0;
    }
    const level = Math.min(levelMap[pixelIdx] ?? 0, N - 1);
    trisByMat[level].push(t);
  }

  const mtlFilename = `${baseName}.mtl`;
  const objLines = [`mtllib ${mtlFilename}`, ''];

  // Vertex positions
  for (let v = 0; v < totalVerts; v++) {
    const x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2];
    objLines.push(`v ${x.toFixed(6)} ${y.toFixed(6)} ${z.toFixed(6)}`);
  }
  objLines.push('');

  // Faces grouped by material
  for (let k = 0; k < N; k++) {
    if (trisByMat[k].length === 0) continue;
    objLines.push(`usemtl mat_${k}`);
    objLines.push(`g layer_${k}`);
    for (const t of trisByMat[k]) {
      const i0 = indices[t * 3] + 1;
      const i1 = indices[t * 3 + 1] + 1;
      const i2 = indices[t * 3 + 2] + 1;
      objLines.push(`f ${i0} ${i1} ${i2}`);
    }
    objLines.push('');
  }

  return {
    objBlob: new Blob([objLines.join('\n')], { type: 'model/obj' }),
    mtlBlob: new Blob([mtlLines.join('\n')], { type: 'text/plain' }),
    objFilename: `${baseName}.obj`,
    mtlFilename,
  };
}
