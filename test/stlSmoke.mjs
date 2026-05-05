// Smoke test for STL reader + depth projector. Synthesises a binary STL of
// a unit cube and verifies that:
//   - the parser reads the right triangle count
//   - each side renders a non-empty depth image with the expected aspect
//   - the rendered range matches the cube extent on the depth axis
//
// Run with: node test/stlSmoke.mjs
//
// We have to stub a tiny canvas/document/ImageData so the projector code
// (written for the browser) can run under Node. This stub is *only* used to
// expose pixel data; we don't actually render anywhere.

import { parseSTL } from '../src/stlReader.js';

class FakeImageData {
  constructor(w, h) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4); }
}
class FakeCtx {
  constructor(c) { this.canvas = c; }
  createImageData(w, h) { return new FakeImageData(w, h); }
  putImageData(img) { this.canvas._img = img; }
}
class FakeCanvas {
  constructor() { this.width = 0; this.height = 0; this._img = null; }
  getContext() { return new FakeCtx(this); }
}
globalThis.document = { createElement: (tag) => tag === 'canvas' ? new FakeCanvas() : null };

const { projectSTLToCanvas } = await import('../src/stlProjector.js');

// Build a binary STL of a unit cube (12 triangles), bbox [0,1]^3
function buildCubeBinary() {
  const tris = [
    // bottom (-Z) at z=0
    [[0,0,0],[1,0,0],[1,1,0]], [[0,0,0],[1,1,0],[0,1,0]],
    // top (+Z) at z=1
    [[0,0,1],[1,1,1],[1,0,1]], [[0,0,1],[0,1,1],[1,1,1]],
    // front (+Y) at y=1
    [[0,1,0],[1,1,0],[1,1,1]], [[0,1,0],[1,1,1],[0,1,1]],
    // back (-Y) at y=0
    [[0,0,0],[1,0,1],[1,0,0]], [[0,0,0],[0,0,1],[1,0,1]],
    // right (+X) at x=1
    [[1,0,0],[1,0,1],[1,1,1]], [[1,0,0],[1,1,1],[1,1,0]],
    // left (-X) at x=0
    [[0,0,0],[0,1,0],[0,1,1]], [[0,0,0],[0,1,1],[0,0,1]]
  ];
  const triCount = tris.length;
  const buf = new ArrayBuffer(84 + triCount * 50);
  const v = new DataView(buf);
  v.setUint32(80, triCount, true);
  let off = 84;
  for (const tri of tris) {
    off += 12; // normal
    for (const p of tri) for (const c of p) { v.setFloat32(off, c, true); off += 4; }
    off += 2;
  }
  return buf;
}

function getNonZeroBounds(canvas) {
  const data = canvas._img.data;
  const w = canvas._img.width, h = canvas._img.height;
  let minG = 256, maxG = -1, count = 0;
  for (let i = 0; i < w * h; i++) {
    const g = data[i * 4];
    if (g > 0) { count++; if (g < minG) minG = g; if (g > maxG) maxG = g; }
  }
  return { count, minG, maxG, w, h };
}

const buf = buildCubeBinary();
const stl = parseSTL(buf);
console.log(`parseSTL: triCount=${stl.triCount}`);
if (stl.triCount !== 12) throw new Error(`expected 12 triangles, got ${stl.triCount}`);

for (const side of ['front', 'back', 'left', 'right', 'top', 'bottom']) {
  const canvas = projectSTLToCanvas(stl, side, 64);
  const r = getNonZeroBounds(canvas);
  console.log(`side=${side}: ${canvas.width}x${canvas.height} non-zero=${r.count} grayRange=[${r.minG},${r.maxG}]`);
  if (canvas.width !== 64 || canvas.height !== 64) throw new Error(`expected 64x64 for unit cube view, got ${canvas.width}x${canvas.height}`);
  // For a solid cube, every pixel of the projection should be covered.
  if (r.count !== 64 * 64) throw new Error(`${side}: expected full coverage (4096), got ${r.count}`);
  // For a flat face, the depth across the visible face is constant → grayRange collapses to a single value (255).
  if (r.minG !== 255 || r.maxG !== 255) {
    throw new Error(`${side}: expected uniform white face for unit cube, got [${r.minG},${r.maxG}]`);
  }
}

console.log('OK — STL reader + projector pass');
