// GLB (binary glTF) reader. Uses three.js's GLTFLoader, then walks the
// resulting scene graph and flattens every Mesh's triangles (with world
// transforms applied) into the same {positions, triCount} shape the STL
// projector expects. .gltf with external resources isn't supported here —
// only self-contained .glb.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export async function loadGLBFromFile(file) {
  const buffer = await file.arrayBuffer();
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.parse(
      buffer,
      '',
      (gltf) => {
        try {
          resolve(extractTriangles(gltf.scene));
        } catch (e) { reject(e); }
      },
      (err) => reject(new Error(`GLB parse failed: ${err && err.message || err}`))
    );
  });
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

  if (out.length === 0) throw new Error('GLB contains no mesh data');
  if (out.length % 9 !== 0) {
    throw new Error('GLB has non-triangle primitives (lines/points/strips not supported)');
  }
  return {
    positions: new Float32Array(out),
    triCount: out.length / 9
  };
}
