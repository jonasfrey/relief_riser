import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class Viewer {
  constructor(container) {
    this.container = container;
    this._broken = false;
    this._raf = 0;
    this.show = { solid: true, wireframe: false, vertices: false };
    // Auto-frame the camera only on the next setMesh, then leave the camera
    // alone so parameter tweaks don't reset the user's orbit. Callers flip
    // this back on via requestFrame() when a new file is loaded or the shape
    // mode changes (both can move the bounding box dramatically).
    this._needsFrame = true;

    // Try to create the WebGL context. The browser can refuse if there are
    // already too many active WebGL contexts on the page or if a previous
    // context loss is still being throttled — fall back to a friendly
    // placeholder instead of crashing the whole app.
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch (err) {
      this._installContextLossPlaceholder(err);
      return;
    }
    this._setupScene();
  }

  _setupScene() {
    const container = this.container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x16171b);

    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;

    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 5000);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(60, -60, 60);

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    container.appendChild(this.renderer.domElement);

    // Listen for runtime context loss / restore so a transient GPU hiccup
    // doesn't permanently break the viewport.
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this._broken = true;
      cancelAnimationFrame(this._raf);
      this._showOverlay('WebGL context lost — usually caused by GPU memory pressure. Reduce the mesh resolution or reload the page.');
    }, false);
    this.renderer.domElement.addEventListener('webglcontextrestored', () => {
      this._broken = false;
      this._hideOverlay();
      this._animate();
    }, false);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    // Surface picking (used by the "stl face" shape mode). The pick target is a
    // standalone mesh kept out of the scene — it exists only for raycasting
    // against the raw STL so a click returns the true surface point + normal.
    this._raycaster = new THREE.Raycaster();
    this._pickMesh = null;
    this._pickGeom = null;
    this._onPick = null;
    this._pickEnabled = false;
    this._pickDown = null;
    this._pickDownHandler = (ev) => { this._pickDown = { x: ev.clientX, y: ev.clientY }; };
    this._pickClickHandler = (ev) => this._handlePickClick(ev);

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

    this.solidMaterial = new THREE.MeshStandardMaterial({
      color: 0xd4d6dc, roughness: 0.65, metalness: 0.05, flatShading: false,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
    });
    this.wireMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ddaa, wireframe: true, transparent: true, opacity: 0.65, depthWrite: false
    });
    this.pointsMaterial = new THREE.PointsMaterial({
      color: 0xff8a44, size: 3, sizeAttenuation: false, depthWrite: false
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

  _installContextLossPlaceholder(err) {
    this._broken = true;
    const msg = (err && err.message) || 'WebGL context could not be created.';
    this._showOverlay(
      `WebGL is unavailable: ${msg}<br><br>` +
      `Common causes: too many WebGL contexts on the page, GPU out of memory ` +
      `from a previous very large mesh, or hardware acceleration disabled.<br><br>` +
      `Try closing other tabs that use 3D / WebGL, then reload this page.`,
      true
    );
  }

  _showOverlay(html, withReload = false) {
    if (!this._overlay) {
      this._overlay = document.createElement('div');
      this._overlay.style.cssText = `
        position: absolute; inset: 0; display: flex; align-items: center;
        justify-content: center; padding: 1rem; text-align: center;
        background: rgba(22, 23, 27, 0.92); color: #ff8a44; z-index: 5;
        pointer-events: auto;`;
      const wrap = document.createElement('div');
      wrap.style.cssText = 'max-width: 460px; font-size: 0.9rem; line-height: 1.5;';
      this._overlay.appendChild(wrap);
      this._overlayBody = wrap;
      // Make sure the parent positions us correctly.
      if (getComputedStyle(this.container).position === 'static') {
        this.container.style.position = 'relative';
      }
      this.container.appendChild(this._overlay);
    }
    let inner = `<div style="font-weight:600; margin-bottom:0.5rem;">3D viewport unavailable</div>` +
                `<div style="color:#d4d6dc;">${html}</div>`;
    if (withReload) {
      inner += `<button id="__reloadBtn" style="margin-top:1rem; padding:0.4rem 0.8rem; ` +
               `background:#6c8cff; color:white; border:0; border-radius:4px; cursor:pointer;">` +
               `Reload page</button>`;
    }
    this._overlayBody.innerHTML = inner;
    const btn = this._overlayBody.querySelector('#__reloadBtn');
    if (btn) btn.addEventListener('click', () => location.reload());
  }

  _hideOverlay() {
    if (this._overlay && this._overlay.parentNode) {
      this._overlay.parentNode.removeChild(this._overlay);
    }
    this._overlay = null;
    this._overlayBody = null;
  }

  _onResize() {
    if (this._broken) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  setMesh(positions, indices, vertexColors = null) {
    if (this._broken) return;
    this._disposeMeshes();

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setIndex(new THREE.BufferAttribute(indices, 1));
    if (vertexColors) {
      geom.setAttribute('color', new THREE.BufferAttribute(vertexColors, 3));
    }
    geom.computeVertexNormals();
    geom.computeBoundingBox();
    this._sharedGeometry = geom;

    const useVC = !!vertexColors;
    if (this.solidMaterial.vertexColors !== useVC) {
      this.solidMaterial.vertexColors = useVC;
      this.solidMaterial.color.set(useVC ? 0xffffff : 0xd4d6dc);
      this.solidMaterial.needsUpdate = true;
    }

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

    if (this._needsFrame) {
      this.frame();
      this._needsFrame = false;
    }
  }

  // Reframe on the NEXT setMesh call. Call after a new file/shape switch so
  // the camera matches the new bounding box; routine param tweaks skip this.
  requestFrame() {
    this._needsFrame = true;
  }

  // Set the geometry that click-picking raycasts against. Pass the raw STL
  // positions (non-indexed: 3 verts per triangle) so a hit returns that
  // triangle's face normal in the same coords the mesh is displayed in.
  setPickTarget(positions) {
    if (this._broken) return;
    if (this._pickGeom) this._pickGeom.dispose();
    this._pickGeom = new THREE.BufferGeometry();
    this._pickGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this._pickGeom.computeBoundingBox();
    this._pickGeom.computeBoundingSphere();
    this._pickMesh = new THREE.Mesh(this._pickGeom);
  }

  enablePicking(onPick) {
    if (this._broken) return;
    this._onPick = onPick;
    if (this._pickEnabled) return;
    this._pickEnabled = true;
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this._pickDownHandler);
    el.addEventListener('click', this._pickClickHandler);
  }

  disablePicking() {
    this._onPick = null;
    if (!this._pickEnabled) return;
    this._pickEnabled = false;
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this._pickDownHandler);
    el.removeEventListener('click', this._pickClickHandler);
  }

  _handlePickClick(ev) {
    if (this._broken || !this._pickMesh || !this._onPick) return;
    // Ignore clicks that were really orbit drags (pointer moved noticeably).
    if (this._pickDown) {
      const dx = ev.clientX - this._pickDown.x;
      const dy = ev.clientY - this._pickDown.y;
      if (dx * dx + dy * dy > 25) return;
    }
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((ev.clientX - rect.left) / rect.width) * 2 - 1,
      -((ev.clientY - rect.top) / rect.height) * 2 + 1
    );
    this._raycaster.setFromCamera(ndc, this.camera);
    const hits = this._raycaster.intersectObject(this._pickMesh, false);
    if (!hits.length) return;
    const h = hits[0];
    const n = h.face ? h.face.normal : new THREE.Vector3(0, 0, 1);
    this._onPick({
      point: [h.point.x, h.point.y, h.point.z],
      normal: [n.x, n.y, n.z],
      faceIndex: h.faceIndex != null ? h.faceIndex : -1
    });
  }

  setVisibility(key, visible) {
    this.show[key] = !!visible;
    if (this._broken) return;
    const obj = key === 'solid' ? this.solidMesh
              : key === 'wireframe' ? this.wireMesh
              : key === 'vertices' ? this.pointsObj
              : null;
    if (obj) obj.visible = !!visible;
  }

  _disposeMeshes() {
    if (!this.scene) return;
    if (this.solidMesh)  { this.scene.remove(this.solidMesh);  this.solidMesh  = null; }
    if (this.wireMesh)   { this.scene.remove(this.wireMesh);   this.wireMesh   = null; }
    if (this.pointsObj)  { this.scene.remove(this.pointsObj);  this.pointsObj  = null; }
    if (this._sharedGeometry) { this._sharedGeometry.dispose(); this._sharedGeometry = null; }
  }

  frame() {
    if (this._broken || !this._sharedGeometry) return;
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
    if (this._broken) return;
    this._raf = requestAnimationFrame(this._animate);
    this.controls.update();
    try {
      this.renderer.render(this.scene, this.camera);
    } catch (err) {
      this._broken = true;
      cancelAnimationFrame(this._raf);
      this._showOverlay(`Render failed: ${err && err.message || err}. Try reducing mesh resolution or reload the page.`, true);
    }
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    if (this._ro) this._ro.disconnect();
    this.disablePicking();
    if (this._pickGeom) { this._pickGeom.dispose(); this._pickGeom = null; }
    this._pickMesh = null;
    this._disposeMeshes();
    if (this.solidMaterial) this.solidMaterial.dispose();
    if (this.wireMaterial) this.wireMaterial.dispose();
    if (this.pointsMaterial) this.pointsMaterial.dispose();
    if (this.renderer) this.renderer.dispose();
    this._hideOverlay();
  }
}
