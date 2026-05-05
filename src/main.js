import { Viewer } from './viewer.js';
import {
  computeTargetDimensions,
  rasterize,
  processImage,
  buildHeightmap,
  paintToCanvas,
  loadImageFromFile,
  detectContentBBox,
  cropCanvas
} from './imageProcessor.js';
import { loadSTLFromFile } from './stlReader.js';
import { loadGLBFromFile } from './glbReader.js';
import { projectSTLToCanvas } from './stlProjector.js';
import {
  buildReliefGeometry,
  buildCylindricalGeometry,
  buildPolygonPrismGeometry,
  estimateTriangleCount,
  estimateCylindricalTriangleCount,
  estimatePolygonPrismTriangleCount
} from './geometry.js';
import {
  exportSTLBinary,
  exportSTLAscii,
  estimateBinarySTLBytes,
  downloadBlob
} from './stlExporter.js';

// ---------- DOM lookup ----------

const $ = (id) => document.getElementById(id);

const els = {
  fileInput: $('fileInput'),
  dropZone: $('dropZone'),
  originalCanvas: $('originalCanvas'),
  processedCanvas: $('processedCanvas'),
  stlControls: $('stlControls'),
  stlSide: $('stlSide'),
  stlRenderSize: $('stlRenderSize'),
  stlRenderSizeNum: $('stlRenderSizeNum'),

  brightness: $('brightness'),       brightnessNum: $('brightnessNum'),
  contrast: $('contrast'),           contrastNum: $('contrastNum'),
  blur: $('blur'),                   blurNum: $('blurNum'),
  threshold: $('threshold'),         thresholdNum: $('thresholdNum'),
  thresholdControl: $('thresholdControl'),
  invert: $('invert'),
  colorCount: $('colorCount'),
  resolutionMode: $('resolutionMode'),
  density: $('density'),             densityNum: $('densityNum'),
  densityControl: $('densityControl'),
  maxDim: $('maxDim'),               maxDimNum: $('maxDimNum'),
  maxDimControl: $('maxDimControl'),
  tileX: $('tileX'),                 tileXNum: $('tileXNum'),
  tileY: $('tileY'),                 tileYNum: $('tileYNum'),
  marginX: $('marginX'),             marginXNum: $('marginXNum'),
  marginY: $('marginY'),             marginYNum: $('marginYNum'),

  showSolid: $('showSolid'),
  showWireframe: $('showWireframe'),
  showVertices: $('showVertices'),

  shape: $('shape'),
  sides: $('sides'),                 sidesNum: $('sidesNum'),
  sidesControl: $('sidesControl'),
  closedBottom: $('closedBottom'),
  closedBottomControl: $('closedBottomControl'),
  chamferTop: $('chamferTop'),       chamferTopNum: $('chamferTopNum'),
  chamferTopControl: $('chamferTopControl'),
  plateW: $('plateW'),               plateWNum: $('plateWNum'),
  plateWLabel: $('plateWLabel'),
  plateH: $('plateH'),               plateHNum: $('plateHNum'),
  baseThickness: $('baseThickness'), baseThicknessNum: $('baseThicknessNum'),
  layerHeights: $('layerHeights'),
  autoDistribute: $('autoDistribute'),
  mapDir: $('mapDir'),
  fitMode: $('fitMode'),
  autoCrop: $('autoCrop'),
  cropBadge: $('cropBadge'),

  asciiSTL: $('asciiSTL'),
  downloadSTL: $('downloadSTL'),
  downloadPNG: $('downloadPNG'),
  exportHint: $('exportHint'),

  meshStats: $('meshStats'),
  warningBox: $('warningBox'),
  regenButtonWrap: $('regenButtonWrap'),
  regenBtn: $('regenBtn'),

  viewport: $('viewport')
};

// ---------- linked slider/number pairs ----------

const sliderPairs = [
  ['brightness', 'brightnessNum'],
  ['contrast', 'contrastNum'],
  ['blur', 'blurNum'],
  ['threshold', 'thresholdNum'],
  ['maxDim', 'maxDimNum'],
  ['density', 'densityNum'],
  ['sides', 'sidesNum'],
  ['tileX', 'tileXNum'],
  ['tileY', 'tileYNum'],
  ['marginX', 'marginXNum'],
  ['marginY', 'marginYNum'],
  ['chamferTop', 'chamferTopNum'],
  ['stlRenderSize', 'stlRenderSizeNum'],
  ['plateW', 'plateWNum'],
  ['plateH', 'plateHNum'],
  ['baseThickness', 'baseThicknessNum']
];

function linkPair(rangeEl, numEl) {
  rangeEl.addEventListener('input', () => {
    numEl.value = rangeEl.value;
    onParamChange();
  });
  numEl.addEventListener('input', () => {
    const v = clampToInputRange(numEl, parseFloat(numEl.value));
    if (Number.isFinite(v)) rangeEl.value = String(v);
    onParamChange();
  });
  numEl.addEventListener('blur', () => {
    const v = clampToInputRange(numEl, parseFloat(numEl.value));
    if (Number.isFinite(v)) {
      numEl.value = String(v);
      rangeEl.value = String(v);
    }
  });
}

function clampToInputRange(el, v) {
  const min = parseFloat(el.min);
  const max = parseFloat(el.max);
  if (!Number.isFinite(v)) return NaN;
  if (Number.isFinite(min) && v < min) v = min;
  if (Number.isFinite(max) && v > max) v = max;
  return v;
}

sliderPairs.forEach(([r, n]) => linkPair(els[r], els[n]));

['invert', 'mapDir', 'fitMode', 'closedBottom'].forEach((id) => {
  els[id].addEventListener('change', () => onParamChange());
});

els.shape.addEventListener('change', () => {
  state.shape = els.shape.value;
  updateShapeLabels();
  onParamChange();
});

els.autoCrop.addEventListener('change', () => {
  state.autoCrop = els.autoCrop.checked;
  applyAutoCrop();
  autoFitHeightToImage();
  persist();
  triggerProcessing(true);
});

els.resolutionMode.addEventListener('change', () => {
  state.resolutionMode = els.resolutionMode.value;
  updateResolutionVisibility();
  onParamChange();
});

['showSolid', 'showWireframe', 'showVertices'].forEach((id) => {
  const key = id === 'showSolid' ? 'solid' : id === 'showWireframe' ? 'wireframe' : 'vertices';
  els[id].addEventListener('change', () => {
    state.display[key] = els[id].checked;
    viewer.setVisibility(key, els[id].checked);
    persist();
  });
});

els.colorCount.addEventListener('change', () => {
  const newN = parseInt(els.colorCount.value, 10);
  changeColorCount(newN);
});

els.autoDistribute.addEventListener('click', () => {
  const N = state.colorCount;
  const max = currentMaxLayerHeight() || 0.4;
  state.layerHeights = defaultLayerHeights(N, max);
  renderLayerHeights();
  onParamChange();
});

// ---------- state ----------

const STORAGE_KEY = 'relief-riser-params-v2';
const DEFAULT_MAX_HEIGHT = 0.4;

const state = {
  rawSourceCanvas: null,  // image as loaded (or rendered STL depth)
  sourceCanvas: null,     // possibly cropped, used for processing
  sourceFilename: null,
  inputType: 'image',     // 'image' or 'stl'
  stlData: null,          // { positions, triCount } when inputType === 'stl'
  stlSide: 'front',
  lastStlRenderSize: 0,   // tracks the size we last projected at
  processed: null,        // { displayImageData, levelMap, width, height, colorCount }
  heightmapMm: null,      // Float32Array of mm above the base
  geometry: null,
  colorCount: 2,
  layerHeights: [0, DEFAULT_MAX_HEIGHT],
  shape: 'rectangular',
  polygonSides: 4,
  autoCrop: true,
  resolutionMode: 'density',  // 'density' (verts/mm) or 'maxDim' (px)
  display: { solid: true, wireframe: false, vertices: false }
};

const viewer = new Viewer(els.viewport);

// ---------- color count + layer heights ----------

function defaultLayerHeights(N, max) {
  if (N === 1) return [max];
  const out = new Array(N);
  for (let k = 0; k < N; k++) out[k] = +(k / (N - 1) * max).toFixed(3);
  return out;
}

function currentMaxLayerHeight() {
  if (!state.layerHeights.length) return 0;
  let m = 0;
  for (let k = 0; k < state.colorCount; k++) {
    const v = state.layerHeights[k] || 0;
    if (v > m) m = v;
  }
  return m;
}

function changeColorCount(newN) {
  newN = Math.max(1, Math.min(8, newN | 0));
  const max = currentMaxLayerHeight() || DEFAULT_MAX_HEIGHT;
  state.colorCount = newN;
  state.layerHeights = defaultLayerHeights(newN, max);
  els.colorCount.value = String(newN);
  renderLayerHeights();
  updateThresholdVisibility();
  onParamChange();
}

function renderLayerHeights() {
  const N = state.colorCount;
  const c = els.layerHeights;
  c.innerHTML = '';

  if (N === 1) {
    c.appendChild(makeLayerControl(0, 'Max relief height (mm)', state.layerHeights[0], false));
    return;
  }

  const header = document.createElement('div');
  header.className = 'layers-header';
  header.textContent = `${N} layers — Layer 0 = darkest pixels, Layer ${N - 1} = lightest`;
  c.appendChild(header);

  for (let k = 0; k < N; k++) {
    c.appendChild(makeLayerControl(k, `Layer ${k}`, state.layerHeights[k] ?? 0, true));
  }
}

function makeLayerControl(k, labelText, value, compact) {
  const wrap = document.createElement('div');
  wrap.className = compact ? 'control layer-row' : 'control';

  const label = document.createElement('label');
  label.htmlFor = `layerH${k}`;
  label.textContent = labelText;
  wrap.appendChild(label);

  const range = document.createElement('input');
  range.type = 'range';
  range.id = `layerH${k}`;
  range.min = '0';
  range.max = '10';
  range.step = '0.05';
  range.value = String(value);
  wrap.appendChild(range);

  const num = document.createElement('input');
  num.type = 'number';
  num.id = `layerH${k}Num`;
  num.min = '0';
  num.max = '10';
  num.step = '0.05';
  num.value = String(value);
  wrap.appendChild(num);

  const sync = (src, dst) => {
    const v = clampToInputRange(src, parseFloat(src.value));
    if (!Number.isFinite(v)) return;
    dst.value = String(v);
    state.layerHeights[k] = v;
  };
  range.addEventListener('input', () => { sync(range, num); onParamChange(); });
  num.addEventListener('input', () => { sync(num, range); onParamChange(); });

  return wrap;
}

function updateThresholdVisibility() {
  if (state.colorCount === 2) {
    els.thresholdControl.classList.remove('hidden');
  } else {
    els.thresholdControl.classList.add('hidden');
  }
}

function updateShapeLabels() {
  const isPoly = state.shape === 'polygon';
  const isCyl  = state.shape === 'cylindrical';
  if (isCyl) {
    els.plateWLabel.textContent = 'Image tile width (mm)';
  } else if (isPoly) {
    els.plateWLabel.textContent = 'Side width W';
  } else {
    els.plateWLabel.textContent = 'Width W';
  }
  els.sidesControl.classList.toggle('hidden', !isPoly);
  // Closed bottom is available for both cylinder and polygon prism modes.
  els.closedBottomControl.classList.toggle('hidden', !(isPoly || isCyl));
  els.chamferTopControl.classList.toggle('hidden', !isPoly);
}

function updateResolutionVisibility() {
  const dens = state.resolutionMode === 'density';
  els.densityControl.classList.toggle('hidden', !dens);
  els.maxDimControl.classList.toggle('hidden', dens);
}

function applyAutoCrop() {
  if (!state.rawSourceCanvas) return;
  let usingCrop = false;
  if (state.autoCrop) {
    const bbox = detectContentBBox(state.rawSourceCanvas);
    const w = state.rawSourceCanvas.width;
    const h = state.rawSourceCanvas.height;
    if (bbox && (bbox.w < w || bbox.h < h)) {
      state.sourceCanvas = cropCanvas(state.rawSourceCanvas, bbox);
      usingCrop = true;
    } else {
      state.sourceCanvas = state.rawSourceCanvas;
    }
  } else {
    state.sourceCanvas = state.rawSourceCanvas;
  }
  els.cropBadge.classList.toggle('hidden', !usingCrop);
  paintToCanvas(canvasToImageData(state.sourceCanvas), els.originalCanvas);
}

// Set plate H so one image tile preserves its native aspect ratio on the
// shape: H = (per-tile width on the surface) × (imgH / imgW). For
// rectangular plates and polygon prisms the per-tile width is W. For
// cylinders W is now the image tile width (the diameter is derived from
// W × tileX / π), so the per-tile width is also just W. Clamped + snapped
// to the H slider's step. Called on image load and after the auto-crop
// toggle changes.
function autoFitHeightToImage() {
  if (!state.sourceCanvas) return;
  const imgW = state.sourceCanvas.width;
  const imgH = state.sourceCanvas.height;
  if (imgW <= 0 || imgH <= 0) return;

  const plateW = parseFloat(els.plateW.value);
  let h = plateW * (imgH / imgW);

  const min = parseFloat(els.plateH.min);
  const max = parseFloat(els.plateH.max);
  const step = parseFloat(els.plateH.step) || 0.5;
  h = Math.max(min, Math.min(max, h));
  h = Math.round(h / step) * step;

  els.plateH.value = String(h);
  els.plateHNum.value = String(h);
  persist();
}

// ---------- persistence ----------

function readParamsFromUI() {
  return {
    brightness: parseFloat(els.brightness.value),
    contrast: parseFloat(els.contrast.value),
    blurRadius: parseFloat(els.blur.value),
    threshold: parseInt(els.threshold.value, 10),
    invert: els.invert.checked,
    colorCount: state.colorCount,
    layerHeights: state.layerHeights.slice(0, state.colorCount),
    resolutionMode: state.resolutionMode,
    maxDim: parseInt(els.maxDim.value, 10),
    density: parseFloat(els.density.value),
    tileX: parseInt(els.tileX.value, 10) || 1,
    tileY: parseInt(els.tileY.value, 10) || 1,
    marginX: parseFloat(els.marginX.value) || 0,
    marginY: parseFloat(els.marginY.value) || 0,

    plateW: parseFloat(els.plateW.value),
    plateH: parseFloat(els.plateH.value),
    baseThickness: parseFloat(els.baseThickness.value),
    mapDir: els.mapDir.value,
    fitMode: els.fitMode.value,
    shape: state.shape,
    sides: parseInt(els.sides.value, 10) || 4,
    closedBottom: els.closedBottom.checked,
    chamferTop: parseFloat(els.chamferTop.value) || 0,
    autoCrop: state.autoCrop,
    stlSide: state.stlSide,
    stlRenderSize: parseInt(els.stlRenderSize.value, 10) || STL_RENDER_MAX_DIM_DEFAULT,
    display: { ...state.display },

    asciiSTL: els.asciiSTL.checked
  };
}

function writeParamsToUI(p) {
  if (!p) return;
  const setNum = (rangeId, numId, val) => {
    if (val == null || Number.isNaN(val)) return;
    els[rangeId].value = String(val);
    if (els[numId]) els[numId].value = String(val);
  };
  setNum('brightness', 'brightnessNum', p.brightness);
  setNum('contrast', 'contrastNum', p.contrast);
  setNum('blur', 'blurNum', p.blurRadius);
  setNum('threshold', 'thresholdNum', p.threshold);
  setNum('maxDim', 'maxDimNum', p.maxDim);
  setNum('density', 'densityNum', p.density);
  setNum('sides', 'sidesNum', p.sides);
  setNum('chamferTop', 'chamferTopNum', p.chamferTop);
  setNum('stlRenderSize', 'stlRenderSizeNum', p.stlRenderSize);
  setNum('tileX', 'tileXNum', p.tileX);
  setNum('tileY', 'tileYNum', p.tileY);
  setNum('marginX', 'marginXNum', p.marginX);
  setNum('marginY', 'marginYNum', p.marginY);
  setNum('plateW', 'plateWNum', p.plateW);
  setNum('plateH', 'plateHNum', p.plateH);
  setNum('baseThickness', 'baseThicknessNum', p.baseThickness);
  if (p.invert != null) els.invert.checked = !!p.invert;
  if (p.mapDir) els.mapDir.value = p.mapDir;
  if (p.fitMode) els.fitMode.value = p.fitMode;
  if (p.asciiSTL != null) els.asciiSTL.checked = !!p.asciiSTL;
  if (p.colorCount) {
    state.colorCount = Math.max(1, Math.min(8, p.colorCount | 0));
    els.colorCount.value = String(state.colorCount);
  }
  if (Array.isArray(p.layerHeights) && p.layerHeights.length) {
    state.layerHeights = p.layerHeights.slice();
    while (state.layerHeights.length < state.colorCount) state.layerHeights.push(0);
  }
  if (p.shape === 'rectangular' || p.shape === 'cylindrical' || p.shape === 'polygon') {
    state.shape = p.shape;
    els.shape.value = p.shape;
  }
  if (p.closedBottom != null) els.closedBottom.checked = !!p.closedBottom;
  if (p.autoCrop != null) {
    state.autoCrop = !!p.autoCrop;
    els.autoCrop.checked = state.autoCrop;
  }
  if (typeof p.stlSide === 'string' && p.stlSide in { front:1, back:1, left:1, right:1, top:1, bottom:1 }) {
    state.stlSide = p.stlSide;
    els.stlSide.value = p.stlSide;
  }
  if (p.resolutionMode === 'density' || p.resolutionMode === 'maxDim') {
    state.resolutionMode = p.resolutionMode;
    els.resolutionMode.value = p.resolutionMode;
  }
  if (p.display && typeof p.display === 'object') {
    state.display = { ...state.display, ...p.display };
    els.showSolid.checked     = !!state.display.solid;
    els.showWireframe.checked = !!state.display.wireframe;
    els.showVertices.checked  = !!state.display.vertices;
    viewer.setVisibility('solid',     state.display.solid);
    viewer.setVisibility('wireframe', state.display.wireframe);
    viewer.setVisibility('vertices',  state.display.vertices);
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(readParamsFromUI()));
  } catch {}
}

function restore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) writeParamsToUI(JSON.parse(raw));
  } catch {}
}

restore();
renderLayerHeights();
updateThresholdVisibility();
updateShapeLabels();
updateResolutionVisibility();
els.asciiSTL.addEventListener('change', persist);

// ---------- file input ----------

els.fileInput.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (file) handleFile(file);
});

['dragenter', 'dragover'].forEach((evt) =>
  els.dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    els.dropZone.classList.add('hover');
  })
);
['dragleave', 'drop'].forEach((evt) =>
  els.dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    els.dropZone.classList.remove('hover');
  })
);
els.dropZone.addEventListener('drop', (e) => {
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (!file) return;
  const isImg = /^image\//.test(file.type);
  const isMesh = /\.(stl|glb)$/i.test(file.name);
  if (isImg || isMesh) handleFile(file);
});

els.stlSide.addEventListener('change', () => {
  state.stlSide = els.stlSide.value;
  rerenderStlDepth();
  persist();
});

const STL_RENDER_MAX_DIM_DEFAULT = 600;

function currentStlRenderSize() {
  const v = parseInt(els.stlRenderSize.value, 10);
  return Number.isFinite(v) && v >= 8 ? v : STL_RENDER_MAX_DIM_DEFAULT;
}

async function handleFile(file) {
  try {
    const lower = file.name.toLowerCase();
    const isStl = lower.endsWith('.stl');
    const isGlb = lower.endsWith('.glb');
    if (isStl || isGlb) {
      const mesh = isStl ? await loadSTLFromFile(file) : await loadGLBFromFile(file);
      state.stlData = mesh;
      state.inputType = 'stl';   // kept for backward-compat — same code path
      const size = currentStlRenderSize();
      state.rawSourceCanvas = projectSTLToCanvas(mesh, state.stlSide || 'front', size);
      state.lastStlRenderSize = size;
    } else {
      state.stlData = null;
      state.inputType = 'image';
      state.rawSourceCanvas = await loadImageFromFile(file);
      state.lastStlRenderSize = 0;
    }
    state.sourceFilename = file.name.replace(/\.[^.]+$/, '') || 'input';
    updateStlControlsVisibility();
    applyAutoCrop();
    autoFitHeightToImage();
    setExportEnabled(false);
    triggerProcessing(true);
  } catch (err) {
    showWarning('Could not load file: ' + err.message, true);
  }
}

function rerenderStlDepth() {
  if (state.inputType !== 'stl' || !state.stlData) return;
  try {
    const size = currentStlRenderSize();
    state.rawSourceCanvas = projectSTLToCanvas(state.stlData, state.stlSide, size);
    state.lastStlRenderSize = size;
    applyAutoCrop();
    autoFitHeightToImage();
    triggerProcessing(true);
  } catch (err) {
    showWarning('STL projection failed: ' + err.message, true);
  }
}

// Called from the regenerate pipeline. Re-projects the STL only when the
// requested render size differs from the last projection, then re-runs auto
// crop / auto fit. Returns true when the source canvas was rebuilt.
function maybeReprojectStl() {
  if (state.inputType !== 'stl' || !state.stlData) return false;
  const size = currentStlRenderSize();
  if (size === state.lastStlRenderSize) return false;
  try {
    state.rawSourceCanvas = projectSTLToCanvas(state.stlData, state.stlSide, size);
    state.lastStlRenderSize = size;
    applyAutoCrop();
    autoFitHeightToImage();
    return true;
  } catch (err) {
    showWarning('STL projection failed: ' + err.message, true);
    return false;
  }
}

function updateStlControlsVisibility() {
  els.stlControls.classList.toggle('hidden', state.inputType !== 'stl');
}

function canvasToImageData(c) {
  const ctx = c.getContext('2d');
  return ctx.getImageData(0, 0, c.width, c.height);
}

// ---------- pipeline ----------

const TRI_AUTO_LIMIT = 500_000;
const TRI_HARD_LIMIT = 2_000_000;

let processTimer = null;

function onParamChange() {
  persist();
  triggerProcessing(false);
}

function getTargetDims(params) {
  // Cylindrical mode: W is the per-tile arc width in mm. The unrolled
  // rectangle is (W × tileX) wide so all tileX repetitions cover the full
  // circumference. Polygon mode: W is the per-face side width.
  const w = params.shape === 'cylindrical' ? params.plateW * params.tileX : params.plateW;
  const h = params.plateH;
  if (params.resolutionMode === 'density') {
    const d = params.density;
    return {
      targetW: Math.max(2, Math.round(w * d)),
      targetH: Math.max(2, Math.round(h * d))
    };
  }
  return computeTargetDimensions(w, h, params.maxDim);
}

function estimateTrisForShape(targetW, targetH, shape, sides, hasChamfer) {
  if (shape === 'cylindrical') return estimateCylindricalTriangleCount(targetW, targetH);
  if (shape === 'polygon') return estimatePolygonPrismTriangleCount(sides, targetW, targetH, hasChamfer);
  return estimateTriangleCount(targetW, targetH);
}

function triggerProcessing(immediate) {
  if (!state.sourceCanvas) {
    updateStats();
    return;
  }
  if (processTimer) clearTimeout(processTimer);

  const params = readParamsFromUI();
  const { targetW, targetH } = getTargetDims(params);
  const tris = estimateTrisForShape(targetW, targetH, params.shape, params.sides, params.chamferTop > 0);

  if (tris > TRI_HARD_LIMIT) {
    showWarning(
      `Very large mesh (~${formatNum(tris)} triangles, above the 2M soft cap). ` +
      `Browser may freeze or run out of memory. Click Regenerate to proceed anyway.`,
      true
    );
    els.regenButtonWrap.classList.remove('hidden');
    updateStats({ tris });
    return;
  }

  if (tris > TRI_AUTO_LIMIT) {
    showWarning(`Large mesh (~${formatNum(tris)} triangles). Click Regenerate to update.`, false);
    els.regenButtonWrap.classList.remove('hidden');
    updateStats({ tris });
    return;
  }

  hideWarning();
  els.regenButtonWrap.classList.add('hidden');

  const delay = immediate ? 0 : 150;
  processTimer = setTimeout(() => regeneratePipeline(), delay);
}

els.regenBtn.addEventListener('click', () => regeneratePipeline());

function regeneratePipeline() {
  if (!state.sourceCanvas) return;
  maybeReprojectStl();
  const params = readParamsFromUI();
  const { targetW, targetH } = getTargetDims(params);

  // Convert margin mm → pixels using actual mm-to-pixel ratio for each axis.
  // For cylinder mode the unrolled width = plateW × tileX (matches getTargetDims).
  const baseW = params.shape === 'cylindrical' ? params.plateW * params.tileX : params.plateW;
  const pxPerMmX = baseW > 0 ? targetW / baseW : 0;
  const pxPerMmY = params.plateH > 0 ? targetH / params.plateH : 0;
  // Fill the margin / alpha-composite background with whichever color ends
  // up at 0 relief after invert + mapDir, so the margin acts as a flat
  // border instead of a raised one. (Brightness/contrast can still shift it.)
  const lowReliefAfter = params.mapDir === 'black' ? 255 : 0;
  const lowReliefBefore = params.invert ? 255 - lowReliefAfter : lowReliefAfter;
  const fillColor = lowReliefBefore === 0 ? '#000000' : '#ffffff';
  const raster = rasterize(state.sourceCanvas, targetW, targetH, params.fitMode, {
    tileX: params.tileX,
    tileY: params.tileY,
    marginPxX: Math.round(params.marginX * pxPerMmX),
    marginPxY: Math.round(params.marginY * pxPerMmY),
    fillColor
  });
  const processed = processImage(raster, {
    brightness: params.brightness,
    contrast: params.contrast,
    blurRadius: params.blurRadius,
    invert: params.invert,
    threshold: params.threshold,
    colorCount: params.colorCount
  });
  state.processed = processed;
  paintToCanvas(processed.displayImageData, els.processedCanvas);

  const heightmapMm = buildHeightmap(processed, {
    layerHeights: params.layerHeights,
    invertHeight: params.mapDir === 'black'
  });
  state.heightmapMm = heightmapMm;

  const heightmap = { data: heightmapMm, width: processed.width, height: processed.height };

  let geom;
  try {
    if (params.shape === 'cylindrical') {
      // Diameter is derived: image tile width × tileX wraps around once.
      const D = (params.plateW * params.tileX) / Math.PI;
      geom = buildCylindricalGeometry(heightmap, {
        diameter: D,
        height: params.plateH,
        baseThickness: params.baseThickness,
        closedBottom: params.closedBottom
      });
    } else if (params.shape === 'polygon') {
      geom = buildPolygonPrismGeometry(heightmap, {
        sideWidth: params.plateW,
        height: params.plateH,
        baseThickness: params.baseThickness,
        sides: params.sides,
        closedBottom: params.closedBottom,
        chamferTop: params.chamferTop
      });
    } else {
      geom = buildReliefGeometry(heightmap, {
        plateW: params.plateW,
        plateH: params.plateH,
        baseThickness: params.baseThickness
      });
    }
  } catch (err) {
    showWarning(err.message, true);
    setExportEnabled(false);
    return;
  }

  state.geometry = geom;
  viewer.setMesh(geom.positions, geom.indices);

  setExportEnabled(true);
  updateStats({ tris: geom.triCount, verts: geom.vertCount });
}

// ---------- UI helpers ----------

function showWarning(msg, isError) {
  els.warningBox.textContent = msg;
  els.warningBox.classList.remove('hidden');
  els.warningBox.classList.toggle('error', !!isError);
}

function hideWarning() {
  els.warningBox.classList.add('hidden');
  els.warningBox.classList.remove('error');
}

function setExportEnabled(on) {
  els.downloadSTL.disabled = !on;
  els.downloadPNG.disabled = !on;
  if (on) {
    const params = readParamsFromUI();
    const tris = state.geometry ? state.geometry.triCount : 0;
    const bytes = estimateBinarySTLBytes(tris);
    els.exportHint.textContent =
      `Filename: ${exportFilename('stl', params)} · ~${formatBytes(bytes)} binary STL`;
  } else {
    els.exportHint.textContent = '';
  }
}

function updateStats(info) {
  if (!info) {
    els.meshStats.textContent = state.sourceCanvas ? 'Awaiting regenerate' : 'No mesh';
    return;
  }
  const parts = [];
  if (info.verts != null) parts.push(`${formatNum(info.verts)} verts`);
  if (info.tris != null) parts.push(`${formatNum(info.tris)} tris`);
  if (info.tris != null) parts.push(`~${formatBytes(estimateBinarySTLBytes(info.tris))}`);
  els.meshStats.textContent = parts.join(' · ');
}

function exportFilename(ext, params) {
  const name = state.sourceFilename || 'relief';
  const f = stripTrailing(currentMaxLayerHeight());
  const c = params.colorCount === 1 ? '' : `_${params.colorCount}c`;
  const W = stripTrailing(params.plateW);
  const H = stripTrailing(params.plateH);
  if (params.shape === 'cylindrical') {
    const D = stripTrailing((params.plateW * params.tileX) / Math.PI);
    return `${name}_cyl_D${D}xH${H}_h${f}mm${c}.${ext}`;
  }
  if (params.shape === 'polygon') {
    return `${name}_poly${params.sides}_W${W}xH${H}_h${f}mm${c}.${ext}`;
  }
  return `${name}_${W}x${H}_h${f}mm${c}.${ext}`;
}

function stripTrailing(n) {
  return String(+(+n).toFixed(3));
}

function formatNum(n) {
  return n.toLocaleString('en-US');
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// ---------- export ----------

els.downloadSTL.addEventListener('click', () => {
  if (!state.geometry) return;
  const params = readParamsFromUI();
  const blob = params.asciiSTL
    ? exportSTLAscii(state.geometry.positions, state.geometry.indices, state.sourceFilename || 'relief')
    : exportSTLBinary(state.geometry.positions, state.geometry.indices);
  downloadBlob(blob, exportFilename('stl', params));
});

els.downloadPNG.addEventListener('click', () => {
  if (!state.processed) return;
  const c = document.createElement('canvas');
  c.width = state.processed.displayImageData.width;
  c.height = state.processed.displayImageData.height;
  c.getContext('2d').putImageData(state.processed.displayImageData, 0, 0);
  c.toBlob((blob) => {
    if (blob) downloadBlob(blob, exportFilename('png', readParamsFromUI()));
  }, 'image/png');
});

// ---------- initial paint ----------

updateStats();
setExportEnabled(false);
