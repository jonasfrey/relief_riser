// license Jonas Immanuel Frey GPL
// Wavefront .obj reader. Uses three.js's OBJLoader (which already handles
// n-gon triangulation, `v/vt/vn` indices, groups/objects), then flattens every
// Mesh into the same {positions, triCount} shape the projector expects.
// External .mtl references are ignored — we only care about geometry.

import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

export async function loadOBJFromFile(file) {
  const text = await file.text();
  let group;
  try {
    group = new OBJLoader().parse(text);
  } catch (e) {
    throw new Error(`OBJ parse failed: ${e && e.message || e}`);
  }
  return extractTriangles(group);
}

function extractTriangles(root) {
  root.updateMatrixWorld(true);
  const out = [];
  const v = new THREE.Vector3();

  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    const geo = obj.geometry;
    const posAttr = geo.attributes && geo.attributes.position;
    if (!posAttr) return;
    const matrix = obj.matrixWorld;
    const indices = geo.index;

    if (indices) {
      const n = indices.count;
      for (let i = 0; i < n; i++) {
        v.fromBufferAttribute(posAttr, indices.getX(i)).applyMatrix4(matrix);
        out.push(v.x, v.y, v.z);
      }
    } else {
      const n = posAttr.count;
      for (let i = 0; i < n; i++) {
        v.fromBufferAttribute(posAttr, i).applyMatrix4(matrix);
        out.push(v.x, v.y, v.z);
      }
    }
  });

  if (out.length === 0) throw new Error('OBJ contains no mesh data');
  if (out.length % 9 !== 0) {
    throw new Error('OBJ has non-triangle primitives (lines/points not supported)');
  }
  return {
    positions: new Float32Array(out),
    triCount: out.length / 9
  };
}
