// STL exporters for indexed triangle meshes.
// Both binary and ASCII output. Triangle normals are computed flat per
// triangle from the vertex positions.

export function estimateBinarySTLBytes(triCount) {
  return 84 + triCount * 50;
}

export function exportSTLBinary(positions, indices) {
  const triCount = indices.length / 3;
  const buffer = new ArrayBuffer(84 + triCount * 50);
  const view = new DataView(buffer);

  // Header (80 bytes left as zero) + triangle count
  view.setUint32(80, triCount, true);

  let off = 84;
  for (let t = 0; t < triCount; t++) {
    const i0 = indices[t * 3]     * 3;
    const i1 = indices[t * 3 + 1] * 3;
    const i2 = indices[t * 3 + 2] * 3;

    const ax = positions[i0],     ay = positions[i0 + 1], az = positions[i0 + 2];
    const bx = positions[i1],     by = positions[i1 + 1], bz = positions[i1 + 2];
    const cx = positions[i2],     cy = positions[i2 + 1], cz = positions[i2 + 2];

    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 0) { nx /= len; ny /= len; nz /= len; }

    view.setFloat32(off, nx, true); off += 4;
    view.setFloat32(off, ny, true); off += 4;
    view.setFloat32(off, nz, true); off += 4;
    view.setFloat32(off, ax, true); off += 4;
    view.setFloat32(off, ay, true); off += 4;
    view.setFloat32(off, az, true); off += 4;
    view.setFloat32(off, bx, true); off += 4;
    view.setFloat32(off, by, true); off += 4;
    view.setFloat32(off, bz, true); off += 4;
    view.setFloat32(off, cx, true); off += 4;
    view.setFloat32(off, cy, true); off += 4;
    view.setFloat32(off, cz, true); off += 4;
    view.setUint16(off, 0, true);  off += 2;
  }

  return new Blob([buffer], { type: 'model/stl' });
}

export function exportSTLAscii(positions, indices, name = 'relief') {
  const triCount = indices.length / 3;
  const lines = [];
  lines.push(`solid ${name}`);
  for (let t = 0; t < triCount; t++) {
    const i0 = indices[t * 3]     * 3;
    const i1 = indices[t * 3 + 1] * 3;
    const i2 = indices[t * 3 + 2] * 3;

    const ax = positions[i0],     ay = positions[i0 + 1], az = positions[i0 + 2];
    const bx = positions[i1],     by = positions[i1 + 1], bz = positions[i1 + 2];
    const cx = positions[i2],     cy = positions[i2 + 1], cz = positions[i2 + 2];

    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 0) { nx /= len; ny /= len; nz /= len; }

    lines.push(`facet normal ${nx.toExponential(6)} ${ny.toExponential(6)} ${nz.toExponential(6)}`);
    lines.push('  outer loop');
    lines.push(`    vertex ${ax.toExponential(6)} ${ay.toExponential(6)} ${az.toExponential(6)}`);
    lines.push(`    vertex ${bx.toExponential(6)} ${by.toExponential(6)} ${bz.toExponential(6)}`);
    lines.push(`    vertex ${cx.toExponential(6)} ${cy.toExponential(6)} ${cz.toExponential(6)}`);
    lines.push('  endloop');
    lines.push('endfacet');
  }
  lines.push(`endsolid ${name}`);
  return new Blob([lines.join('\n')], { type: 'model/stl' });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
