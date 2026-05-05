import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class Viewer {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x16171b);

    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;

    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 5000);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(60, -60, 60);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    const key = new THREE.DirectionalLight(0xffffff, 0.85);
    key.position.set(80, -60, 120);
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0xffffff, 0.35);
    fill.position.set(-60, 80, 70);
    this.scene.add(fill);

    this.grid = new THREE.GridHelper(200, 20, 0x4a4d57, 0x2c2e35);
    this.grid.rotation.x = Math.PI / 2;
    this.scene.add(this.grid);

    const axis = new THREE.AxesHelper(20);
    axis.position.set(0, 0, 0.01);
    this.scene.add(axis);

    // Display toggles. Defaults match the UI's initial state.
    this.show = { solid: true, wireframe: false, vertices: false };

    // Reusable materials. polygonOffset on the solid pushes its faces back so
    // the wireframe overlay renders cleanly on top without z-fighting.
    this.solidMaterial = new THREE.MeshStandardMaterial({
      color: 0xd4d6dc,
      roughness: 0.65,
      metalness: 0.05,
      flatShading: false,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1
    });
    this.wireMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ddaa,
      wireframe: true,
      transparent: true,
      opacity: 0.65,
      depthWrite: false
    });
    this.pointsMaterial = new THREE.PointsMaterial({
      color: 0xff8a44,
      size: 3,
      sizeAttenuation: false,
      depthWrite: false
    });

    this.solidMesh = null;
    this.wireMesh = null;
    this.pointsObj = null;
    this._sharedGeometry = null;

    this._onResize = this._onResize.bind(this);
    this._animate = this._animate.bind(this);

    this._ro = new ResizeObserver(this._onResize);
    this._ro.observe(container);

    this._animate();
  }

  _onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  setMesh(positions, indices) {
    this._disposeMeshes();

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setIndex(new THREE.BufferAttribute(indices, 1));
    geom.computeVertexNormals();
    geom.computeBoundingBox();
    this._sharedGeometry = geom;

    this.solidMesh = new THREE.Mesh(geom, this.solidMaterial);
    this.solidMesh.visible = this.show.solid;
    this.scene.add(this.solidMesh);

    this.wireMesh = new THREE.Mesh(geom, this.wireMaterial);
    this.wireMesh.visible = this.show.wireframe;
    this.wireMesh.renderOrder = 1;
    this.scene.add(this.wireMesh);

    this.pointsObj = new THREE.Points(geom, this.pointsMaterial);
    this.pointsObj.visible = this.show.vertices;
    this.pointsObj.renderOrder = 2;
    this.scene.add(this.pointsObj);

    this.frame();
  }

  setVisibility(key, visible) {
    this.show[key] = !!visible;
    const obj = key === 'solid' ? this.solidMesh
              : key === 'wireframe' ? this.wireMesh
              : key === 'vertices' ? this.pointsObj
              : null;
    if (obj) obj.visible = !!visible;
  }

  _disposeMeshes() {
    if (this.solidMesh)  { this.scene.remove(this.solidMesh);  this.solidMesh  = null; }
    if (this.wireMesh)   { this.scene.remove(this.wireMesh);   this.wireMesh   = null; }
    if (this.pointsObj)  { this.scene.remove(this.pointsObj);  this.pointsObj  = null; }
    if (this._sharedGeometry) { this._sharedGeometry.dispose(); this._sharedGeometry = null; }
  }

  frame() {
    if (!this._sharedGeometry) return;
    const box = this._sharedGeometry.boundingBox;
    if (!box) return;
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim === 0) return;
    const fov = (this.camera.fov * Math.PI) / 180;
    const dist = (maxDim / 2) / Math.tan(fov / 2) * 1.6;

    const dir = new THREE.Vector3(0.9, -0.9, 0.7).normalize();
    this.camera.position.copy(center).addScaledVector(dir, dist);
    this.controls.target.copy(center);
    this.camera.near = Math.max(0.01, dist / 1000);
    this.camera.far = dist * 20;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  _animate() {
    this._raf = requestAnimationFrame(this._animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    this._ro.disconnect();
    this._disposeMeshes();
    this.solidMaterial.dispose();
    this.wireMaterial.dispose();
    this.pointsMaterial.dispose();
    this.renderer.dispose();
  }
}
