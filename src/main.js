import { Viewer } from './viewer.js';
import {
  computeTargetDimensions,
  rasterize,
  processImage,
  buildHeightmap,
  paintToCanvas,
  loadImageFromFile,
  detectContentBBox,
  cropCanvas,
  subRectCanvas,
  stretchCanvas
} from './imageProcessor.js';
import { loadSTLFromFile, loadSTLFromUrl } from './stlReader.js';
import { loadGLBFromFile } from './glbReader.js';
import { projectSTLToCanvas } from './stlProjector.js';
import {
  buildReliefGeometry,
  buildCylindricalGeometry,
  buildEllipseGeometry,
  buildPolygonPrismGeometry,
  buildCustomProfileGeometry,
  buildSTLWrapGeometry,
  estimateTriangleCount,
  estimateCylindricalTriangleCount,
  estimateEllipseTriangleCount,
  estimatePolygonPrismTriangleCount,
  estimateCustomProfileTriangleCount,
  estimateSTLWrapTriangleCount
} from './geometry.js';
import {
  loadDxfFromFile,
  loadDxfFromUrl,
  findOuterBand,
  resampleSlice,
  spliceSlice
} from './dxfReader.js';
import {
  exportSTLBinary,
  exportSTLAscii,
  estimateBinarySTLBytes,
  downloadBlob
} from './stlExporter.js';
import { exportOBJMTL } from './objExporter.js';
import { levelMapToColoredImageData, hexToRgb } from './imageProcessor.js';

// ---------- DOM lookup ----------

const $ = (id) => document.getElementById(id);

const els = {
  fileInput: $('fileInput'),
  dropZone: $('dropZone'),
  originalCanvas: $('originalCanvas'),
  processedCanvas: $('processedCanvas'),
  histogramCanvas: $('histogramCanvas'),
  showClipping: $('showClipping'),
  cropPolyStatus: $('cropPolyStatus'),
  cropPolyClear: $('cropPolyClear'),
  stlControls: $('stlControls'),
  stlSide: $('stlSide'),
  stlRenderSize: $('stlRenderSize'),
  stlRenderSizeNum: $('stlRenderSizeNum'),

  brightness: $('brightness'),       brightnessNum: $('brightnessNum'),
  contrast: $('contrast'),           contrastNum: $('contrastNum'),
  blur: $('blur'),                   blurNum: $('blurNum'),
  threshold: $('threshold'),         thresholdNum: $('thresholdNum'),
  thresholdControl: $('thresholdControl'),
  blackPoint: $('blackPoint'),       blackPointNum: $('blackPointNum'),
  whitePoint: $('whitePoint'),       whitePointNum: $('whitePointNum'),
  autoStretch: $('autoStretch'),
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
  gradFrameTop:    $('gradFrameTop'),    gradFrameTopNum:    $('gradFrameTopNum'),
  gradFrameBottom: $('gradFrameBottom'), gradFrameBottomNum: $('gradFrameBottomNum'),
  gradFrameLeft:   $('gradFrameLeft'),   gradFrameLeftNum:   $('gradFrameLeftNum'),
  gradFrameRight:  $('gradFrameRight'),  gradFrameRightNum:  $('gradFrameRightNum'),
  interpX:         $('interpX'),
  interpY:         $('interpY'),
  interpWidth:     $('interpWidth'),     interpWidthNum:     $('interpWidthNum'),

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
  customProfileControls: $('customProfileControls'),
  ellipseControls: $('ellipseControls'),
  ellipseX:          $('ellipseX'),         ellipseXNum:          $('ellipseXNum'),
  ellipseY:          $('ellipseY'),         ellipseYNum:          $('ellipseYNum'),
  ellipseThickness:       $('ellipseThickness'),       ellipseThicknessNum:       $('ellipseThicknessNum'),
  ellipseBottomThickness: $('ellipseBottomThickness'), ellipseBottomThicknessNum: $('ellipseBottomThicknessNum'),
  ellipseHeight:          $('ellipseHeight'),          ellipseHeightNum:          $('ellipseHeightNum'),
  ellipseBottomHole:      $('ellipseBottomHole'),      ellipseBottomHoleNum:      $('ellipseBottomHoleNum'),
  stlWrapControls: $('stlWrapControls'),
  wrapStlFile: $('wrapStlFile'),
  wrapStlResetBtn: $('wrapStlResetBtn'),
  wrapStlStatus: $('wrapStlStatus'),
  wrapAutoTiles: $('wrapAutoTiles'),
  profileFile: $('profileFile'),
  profileResetBtn: $('profileResetBtn'),
  profileStatus: $('profileStatus'),
  profilePreview: $('profilePreview'),
  profileBandMode: $('profileBandMode'),
  profileBandReset: $('profileBandReset'),
  profileBandFlip: $('profileBandFlip'),
  radiusFactor: $('radiusFactor'),   radiusFactorNum: $('radiusFactorNum'),
  heightFactor: $('heightFactor'),   heightFactorNum: $('heightFactorNum'),
  outerBandFrac: $('outerBandFrac'), outerBandFracNum: $('outerBandFracNum'),
  plateW: $('plateW'),               plateWNum: $('plateWNum'),
  plateWLabel: $('plateWLabel'),
  derivedDimsHint: $('derivedDimsHint'),
  plateWControl: null,               plateHControl: null,
  baseThicknessControl: null,
  plateH: $('plateH'),               plateHNum: $('plateHNum'),
  baseThickness: $('baseThickness'), baseThicknessNum: $('baseThicknessNum'),
  layerHeights: $('layerHeights'),
  autoDistribute: $('autoDistribute'),
  mapDir: $('mapDir'),
  fitMode: $('fitMode'),
  autoCrop: $('autoCrop'),
  rotation: $('rotation'),
  zoomSliderX: $('zoomSliderX'),     zoomSliderXNum: $('zoomSliderXNum'),
  zoomSliderY: $('zoomSliderY'),     zoomSliderYNum: $('zoomSliderYNum'),
  stretchX:    $('stretchX'),        stretchXNum:    $('stretchXNum'),
  stretchY:    $('stretchY'),        stretchYNum:    $('stretchYNum'),
  alignX: $('alignX'),
  alignY: $('alignY'),
  cropBadge: $('cropBadge'),

  asciiSTL: $('asciiSTL'),
  downloadSTL: $('downloadSTL'),
  downloadOBJ: $('downloadOBJ'),
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
  ['blackPoint', 'blackPointNum'],
  ['whitePoint', 'whitePointNum'],
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
  ['baseThickness', 'baseThicknessNum'],
  ['radiusFactor', 'radiusFactorNum'],
  ['heightFactor', 'heightFactorNum'],
  ['outerBandFrac', 'outerBandFracNum'],
  ['gradFrameTop',    'gradFrameTopNum'],
  ['gradFrameBottom', 'gradFrameBottomNum'],
  ['gradFrameLeft',   'gradFrameLeftNum'],
  ['gradFrameRight',  'gradFrameRightNum'],
  ['interpWidth',     'interpWidthNum'],
  ['zoomSliderX',     'zoomSliderXNum'],
  ['zoomSliderY',     'zoomSliderYNum'],
  ['stretchX',        'stretchXNum'],
  ['stretchY',        'stretchYNum'],
  ['ellipseX',          'ellipseXNum'],
  ['ellipseY',          'ellipseYNum'],
  ['ellipseThickness',       'ellipseThicknessNum'],
  ['ellipseBottomThickness', 'ellipseBottomThicknessNum'],
  ['ellipseHeight',          'ellipseHeightNum'],
  ['ellipseBottomHole',      'ellipseBottomHoleNum']
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

['invert', 'mapDir', 'fitMode', 'closedBottom', 'interpX', 'interpY'].forEach((id) => {
  els[id].addEventListener('change', () => onParamChange());
});

els.wrapAutoTiles.addEventListener('change', () => onParamChange());

['alignX', 'alignY'].forEach((id) => {
  els[id].addEventListener('change', () => {
    paintSourceWithOverlay();
    onParamChange();
  });
});

// Slider pairs already trigger onParamChange (which rebuilds the heightmap).
// The orange crop-rect overlay also needs to track the slider value live so
// dragging gives instant visual feedback.
['zoomSliderX', 'zoomSliderXNum', 'zoomSliderY', 'zoomSliderYNum'].forEach((id) => {
  els[id].addEventListener('input', () => paintSourceWithOverlay());
});

// Clipping highlight only changes how the processed canvas is painted, not
// the heightmap or geometry — repaint from the cached processed result so we
// don't waste a full pipeline pass.
els.showClipping.addEventListener('change', () => {
  if (state.processed) paintProcessedCanvas(state.processed);
  persist();
});

// Auto-stretch reads the actual brightness range from the most recent
// processed image (post brightness/contrast/blur, pre-levels) and pins the
// black/white points to it so the full [0, max] relief band is used and the
// background sits at exactly 0 relief.
els.autoStretch.addEventListener('click', () => {
  const p = state.processed;
  if (!p) return;
  let lo = p.dataMin | 0;
  let hi = p.dataMax | 0;
  if (hi <= lo) hi = lo + 1;
  if (lo > 254) lo = 254;
  if (hi < 1) hi = 1;
  if (hi > 255) hi = 255;
  els.blackPoint.value = String(lo);
  els.blackPointNum.value = String(lo);
  els.whitePoint.value = String(hi);
  els.whitePointNum.value = String(hi);
  onParamChange();
});

els.shape.addEventListener('change', () => {
  state.shape = els.shape.value;
  updateShapeLabels();
  viewer.requestFrame();
  if (state.shape === 'customProfile' && !state.profilePoints) {
    loadDefaultProfile();   // fire-and-forget; pipeline re-runs when it lands
  }
  if (state.shape === 'stlWrap' && !state.wrapStl) {
    loadDefaultWrapStl();   // fire-and-forget; pipeline re-runs when it lands
  }
  onParamChange();
});

els.profileFile.addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    const { points } = await loadDxfFromFile(file);
    state.profilePoints = points;
    state.profileSource = 'user';
    state.profileFilename = file.name;
    state.profileBandManual = null;
    state.profileBandPicking = null;
    setProfileStatus(`Loaded ${file.name} — ${points.length} points`);
    updateBandModeLabel();
    drawProfilePreview();
    viewer.requestFrame();
    triggerProcessing(true);
  } catch (err) {
    setProfileStatus(`Error: ${err.message}`, true);
  }
});

els.profileResetBtn.addEventListener('click', () => loadDefaultProfile());

els.wrapStlFile.addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    const mesh = await loadSTLFromFile(file);
    state.wrapStl = mesh;
    state.wrapStlFilename = file.name;
    state.wrapStlSource = 'user';
    state.wrapStlInfo = computeWrapStlInfo(mesh);
    setWrapStlStatus(formatWrapStlInfo(file.name, state.wrapStlInfo));
    applyDerivedDims();
    viewer.requestFrame();
    triggerProcessing(true);
  } catch (err) {
    setWrapStlStatus(`Error: ${err.message}`, true);
  }
});

els.wrapStlResetBtn.addEventListener('click', () => loadDefaultWrapStl());

async function loadDefaultWrapStl() {
  setWrapStlStatus('Loading default STL…');
  try {
    const mesh = await loadSTLFromUrl('default_wrap.stl');
    state.wrapStl = mesh;
    state.wrapStlFilename = 'BIC_lighter_holder_TT_J26_MAXI.stl';
    state.wrapStlSource = 'default';
    state.wrapStlInfo = computeWrapStlInfo(mesh);
    setWrapStlStatus(formatWrapStlInfo(state.wrapStlFilename, state.wrapStlInfo));
    applyDerivedDims();
    viewer.requestFrame();
    triggerProcessing(true);
  } catch (err) {
    setWrapStlStatus(`Could not load default STL: ${err.message}`, true);
  }
}

function setWrapStlStatus(msg, isError) {
  els.wrapStlStatus.textContent = msg;
  els.wrapStlStatus.style.color = isError ? '#c33' : '';
}

// Compute the metrics the rasterization pipeline needs: max radius from the
// XY-bbox centroid (drives circumference) and Z-extent (drives height).
function computeWrapStlInfo(stl) {
  if (!stl || !stl.positions || !stl.triCount) return null;
  const p = stl.positions;
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  let zmin = Infinity, zmax = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    if (p[i]     < xmin) xmin = p[i];     if (p[i]     > xmax) xmax = p[i];
    if (p[i + 1] < ymin) ymin = p[i + 1]; if (p[i + 1] > ymax) ymax = p[i + 1];
    if (p[i + 2] < zmin) zmin = p[i + 2]; if (p[i + 2] > zmax) zmax = p[i + 2];
  }
  const cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2;
  let maxR = 0;
  for (let i = 0; i < p.length; i += 3) {
    const dx = p[i] - cx, dy = p[i + 1] - cy;
    const r = Math.sqrt(dx * dx + dy * dy);
    if (r > maxR) maxR = r;
  }
  return { maxR, height: zmax - zmin, triCount: stl.triCount };
}

function formatWrapStlInfo(name, info) {
  if (!info) return name;
  const fmt = (v) => v.toFixed(2);
  return `${name} — ${info.triCount.toLocaleString('en-US')} tris · max R ${fmt(info.maxR)} mm · H ${fmt(info.height)} mm`;
}

async function loadDefaultProfile() {
  setProfileStatus('Loading default profile…');
  try {
    const { points } = await loadDxfFromUrl('default_ring_profile.dxf');
    state.profilePoints = points;
    state.profileSource = 'default';
    state.profileFilename = 'default_ring_profile.dxf';
    state.profileBandManual = null;
    state.profileBandPicking = null;
    setProfileStatus(`Default profile — ${points.length} points`);
    updateBandModeLabel();
    drawProfilePreview();
    viewer.requestFrame();
    triggerProcessing(true);
  } catch (err) {
    setProfileStatus(`Could not load default profile: ${err.message}`, true);
  }
}

function setProfileStatus(msg, isError) {
  els.profileStatus.textContent = msg;
  els.profileStatus.style.color = isError ? '#c33' : '';
}

// Pick the contiguous slice of the profile that receives the relief.
// Manual override (set by clicking two endpoints in the preview) wins;
// otherwise fall back to the slider-driven auto detection.
function selectBand(scaled, bandFrac) {
  if (
    state.profileBandManual &&
    state.profileBandManual.length >= 2 &&
    state.profileBandManual.startIdx >= 0 &&
    state.profileBandManual.startIdx < scaled.length &&
    state.profileBandManual.length <= scaled.length
  ) {
    return state.profileBandManual;
  }
  let maxX = -Infinity, minX = Infinity;
  for (const p of scaled) {
    if (p[0] > maxX) maxX = p[0];
    if (p[0] < minX) minX = p[0];
  }
  const eps = (maxX - minX) * Math.max(0.01, Math.min(1, bandFrac / 100));
  return findOuterBand(scaled, eps);
}

// Compute the same scaling + canvas mapping `drawProfilePreview` uses, so
// click handlers can hit-test against the rendered geometry without drift.
function profileViewMapping() {
  const canvas = els.profilePreview;
  const pts = state.profilePoints;
  if (!canvas || !pts || pts.length < 3) return null;
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 280;
  const cssH = canvas.clientHeight || 180;
  const W = Math.max(2, Math.round(cssW * dpr));
  const H = Math.max(2, Math.round(cssH * dpr));
  const rf = parseFloat(els.radiusFactor.value) || 1;
  const hf = parseFloat(els.heightFactor.value) || 1;
  const scaled = pts.map(([x, y]) => [x * rf, y * hf]);
  let maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of scaled) {
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  const heightMM = maxY - minY;
  if (!(maxX > 0) || !(heightMM > 0)) return null;
  const pad = 18 * dpr;
  const labelPadTop = 14 * dpr;
  const labelPadBot = 14 * dpr;
  const availW = W - pad * 2;
  const availH = H - pad * 2 - labelPadTop - labelPadBot;
  const s = Math.min(availW / (2 * maxX), availH / heightMM);
  const cx = W / 2;
  const cy = H - pad - labelPadBot - (-minY) * s;
  const toCanvas = ([x, y]) => [cx + x * s, cy - y * s];
  return { dpr, W, H, scaled, maxX, minY, maxY, heightMM, pad, cx, cy, s, toCanvas };
}

// Given two profile indices that the user clicked, pick which of the two
// arc directions around the closed loop should be the relief band. The
// direction whose points sit at higher mean X is the "outer" side and is
// almost always what the user means.
function pickBandDirection(a, b) {
  const pts = state.profilePoints;
  const n = pts.length;
  const lenAB = ((b - a + n) % n) + 1;
  const lenBA = ((a - b + n) % n) + 1;
  const meanX = (start, length) => {
    let sum = 0;
    for (let k = 0; k < length; k++) sum += pts[(start + k) % n][0];
    return sum / length;
  };
  return meanX(a, lenAB) >= meanX(b, lenBA)
    ? { startIdx: a, length: lenAB }
    : { startIdx: b, length: lenBA };
}

function updateBandModeLabel() {
  if (!els.profileBandMode) return;
  if (state.profileBandPicking) {
    els.profileBandMode.textContent = 'Click second endpoint to set band';
    els.profileBandReset.textContent = 'Cancel';
    els.profileBandReset.classList.remove('hidden');
    els.profileBandFlip.classList.add('hidden');
  } else if (state.profileBandManual) {
    els.profileBandMode.textContent = 'Band: manual — slider disabled';
    els.profileBandReset.textContent = 'Use auto';
    els.profileBandReset.classList.remove('hidden');
    els.profileBandFlip.classList.remove('hidden');
  } else {
    els.profileBandMode.textContent = 'Band: auto · click profile to pick manually';
    els.profileBandReset.classList.add('hidden');
    els.profileBandFlip.classList.add('hidden');
  }
}

// Render the loaded profile (post-radius/height scaling) into the preview
// canvas. Shows the rotation axis (dashed), the profile polyline, a faint
// mirror across the axis to convey the revolution, and highlights the relief
// band — auto-detected by `outerBandFrac` or manually picked via two clicks.
function drawProfilePreview() {
  const canvas = els.profilePreview;
  if (!canvas) return;

  const map = profileViewMapping();
  if (!map) {
    // Still resize the buffer so the canvas isn't a stale bitmap.
    const dpr0 = window.devicePixelRatio || 1;
    canvas.width = Math.max(2, Math.round((canvas.clientWidth || 280) * dpr0));
    canvas.height = Math.max(2, Math.round((canvas.clientHeight || 180) * dpr0));
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  const { dpr, W, H, scaled, maxX, heightMM, pad, cx, toCanvas } = map;
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const bandFrac = parseFloat(els.outerBandFrac.value) || 50;
  const band = selectBand(scaled, bandFrac);

  // --- rotation axis (X = 0) ---
  ctx.save();
  ctx.strokeStyle = 'rgba(140, 150, 170, 0.55)';
  ctx.setLineDash([6 * dpr, 4 * dpr]);
  ctx.lineWidth = 1 * dpr;
  ctx.beginPath();
  ctx.moveTo(cx, pad);
  ctx.lineTo(cx, H - pad);
  ctx.stroke();
  ctx.restore();

  // --- mirrored (left) copy: dimmer, to convey the revolution ---
  ctx.save();
  ctx.strokeStyle = 'rgba(160, 175, 200, 0.30)';
  ctx.lineWidth = 1 * dpr;
  ctx.beginPath();
  for (let i = 0; i < scaled.length; i++) {
    const [x, y] = scaled[i];
    const [px, py] = toCanvas([-x, y]);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  // --- main profile polyline ---
  ctx.save();
  ctx.strokeStyle = '#cdd3df';
  ctx.lineWidth = 1.5 * dpr;
  ctx.beginPath();
  for (let i = 0; i < scaled.length; i++) {
    const [px, py] = toCanvas(scaled[i]);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  // --- outer band (relief target) ---
  if (band.length >= 2) {
    ctx.save();
    ctx.strokeStyle = '#6c8cff';
    ctx.lineWidth = 2.6 * dpr;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let k = 0; k < band.length; k++) {
      const p = scaled[(band.startIdx + k) % scaled.length];
      const [px, py] = toCanvas(p);
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  }

  // --- max-radius indicator on the X axis ---
  ctx.save();
  ctx.strokeStyle = 'rgba(108, 140, 255, 0.45)';
  ctx.setLineDash([3 * dpr, 3 * dpr]);
  ctx.lineWidth = 1 * dpr;
  const [maxRX, maxRY] = toCanvas([maxX, 0]);
  ctx.beginPath();
  ctx.moveTo(cx, maxRY);
  ctx.lineTo(maxRX, maxRY);
  ctx.stroke();
  ctx.restore();

  // --- band endpoint markers (manual mode) and picking marker ---
  const drawDot = (idx, fill, stroke) => {
    if (idx < 0 || idx >= scaled.length) return;
    const [px, py] = toCanvas(scaled[idx]);
    ctx.save();
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.arc(px, py, 4 * dpr, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };
  if (state.profileBandManual && band.length >= 2) {
    drawDot(band.startIdx, '#6c8cff', '#0c0c0c');
    drawDot((band.startIdx + band.length - 1) % scaled.length, '#6c8cff', '#0c0c0c');
  }
  if (state.profileBandPicking) {
    drawDot(state.profileBandPicking.firstIdx, '#f5b042', '#0c0c0c');
  }

  // --- labels ---
  ctx.save();
  ctx.fillStyle = '#9a9ca5';
  ctx.font = `${10 * dpr}px ui-monospace, monospace`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(`R ${maxX.toFixed(2)} mm`, 6 * dpr, 4 * dpr);
  ctx.textAlign = 'right';
  ctx.fillText(`H ${heightMM.toFixed(2)} mm`, W - 6 * dpr, 4 * dpr);
  ctx.fillStyle = '#6c8cff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(state.profileBandManual ? 'relief band (manual)' : 'relief band', 6 * dpr, H - 4 * dpr);
  ctx.fillStyle = '#9a9ca5';
  ctx.textAlign = 'right';
  ctx.fillText('axis ⇡', W - 6 * dpr, H - 4 * dpr);
  ctx.restore();
}

// Map a mouse event on the preview canvas to the nearest profile index,
// using the same scaling / projection as `drawProfilePreview`. Returns -1
// when no profile is loaded.
function nearestProfileIndexFromEvent(e) {
  const map = profileViewMapping();
  if (!map) return -1;
  const rect = els.profilePreview.getBoundingClientRect();
  const xCss = e.clientX - rect.left;
  const yCss = e.clientY - rect.top;
  const px = xCss * (map.W / rect.width);
  const py = yCss * (map.H / rect.height);
  let best = -1;
  let bestD2 = Infinity;
  for (let i = 0; i < map.scaled.length; i++) {
    const [qx, qy] = map.toCanvas(map.scaled[i]);
    const d2 = (qx - px) * (qx - px) + (qy - py) * (qy - py);
    if (d2 < bestD2) { bestD2 = d2; best = i; }
  }
  return best;
}

els.profilePreview.addEventListener('click', (e) => {
  if (!state.profilePoints || state.profilePoints.length < 3) return;
  const idx = nearestProfileIndexFromEvent(e);
  if (idx < 0) return;
  if (!state.profileBandPicking) {
    state.profileBandPicking = { firstIdx: idx };
    updateBandModeLabel();
    drawProfilePreview();
    return;
  }
  const first = state.profileBandPicking.firstIdx;
  state.profileBandPicking = null;
  if (idx === first) {
    // Same point twice — treat as a cancel rather than a 1-point band.
    updateBandModeLabel();
    drawProfilePreview();
    return;
  }
  state.profileBandManual = pickBandDirection(first, idx);
  updateBandModeLabel();
  drawProfilePreview();
  triggerProcessing(true);
});

els.profileBandReset.addEventListener('click', () => {
  state.profileBandManual = null;
  state.profileBandPicking = null;
  updateBandModeLabel();
  drawProfilePreview();
  triggerProcessing(true);
});

// Swap to the other arc of the closed loop. The two arcs share endpoints
// and together cover every point exactly once except the endpoints, so
// lengthA + lengthB = n + 2 (the +2 accounts for the shared endpoints).
els.profileBandFlip.addEventListener('click', () => {
  const m = state.profileBandManual;
  if (!m || !state.profilePoints) return;
  const n = state.profilePoints.length;
  const newStart = (m.startIdx + m.length - 1) % n;
  const newLen = n + 2 - m.length;
  if (newLen < 2 || newLen > n) return;
  state.profileBandManual = { startIdx: newStart, length: newLen };
  drawProfilePreview();
  triggerProcessing(true);
});

// Touching the outer-band slider implies the user wants auto detection
// back. Without this the slider would silently no-op in manual mode.
['outerBandFrac', 'outerBandFracNum'].forEach((id) => {
  els[id].addEventListener('input', () => {
    if (state.profileBandManual) {
      state.profileBandManual = null;
      updateBandModeLabel();
    }
  });
});

els.autoCrop.addEventListener('change', () => {
  state.autoCrop = els.autoCrop.checked;
  applyAutoCrop();
  applyDerivedDims();
  persist();
  triggerProcessing(true);
});

els.rotation.addEventListener('change', () => {
  state.rotation = parseInt(els.rotation.value, 10) || 0;
  applyRotation();
  applyAutoCrop();
  applyDerivedDims();
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

// ---------- color count + layer heights + layer colors ----------

const COLOR_PALETTE = [
  '#f0f0f0', '#e85050', '#4a90e2', '#50c850',
  '#e8c040', '#9050c8', '#50c8c8', '#202020',
];

function defaultLayerColors(N) {
  const out = [];
  for (let k = 0; k < N; k++) out.push(COLOR_PALETTE[k % COLOR_PALETTE.length]);
  return out;
}

// ---------- state ----------

// v3 bump: W slider's meaning is now shape-dependent (radius for cylinder,
// width otherwise) and H is fully derived. Old v2 data would mis-restore
// cylinder mode and is intentionally ignored.
const STORAGE_KEY = 'relief-riser-params-v3';
const DEFAULT_MAX_HEIGHT = 0.4;

const state = {
  // Pristine canvas as loaded from disk / STL projection — never rotated.
  // We re-derive `rawSourceCanvas` from this whenever rotation changes.
  originalRawCanvas: null,
  rawSourceCanvas: null,  // (originalRawCanvas) rotated by `state.rotation`
  sourceCanvas: null,     // possibly cropped, used for processing
  sourceFilename: null,
  inputType: 'image',     // 'image' or 'stl'
  stlData: null,          // { positions, triCount } when inputType === 'stl'
  stlSide: 'front',
  lastStlRenderSize: 0,   // tracks the size we last projected at
  rotation: 0,            // 0 / 90 / 180 / 270, applied to originalRawCanvas
  processed: null,        // { displayImageData, levelMap, width, height, colorCount }
  heightmapMm: null,      // Float32Array of mm above the base
  geometry: null,
  colorCount: 2,
  layerHeights: [0, DEFAULT_MAX_HEIGHT],
  layerColors: defaultLayerColors(2),
  shape: 'rectangular',
  polygonSides: 4,
  autoCrop: true,
  resolutionMode: 'density',  // 'density' (verts/mm) or 'maxDim' (px)
  display: { solid: true, wireframe: false, vertices: false },
  // Custom profile mode — populated when a DXF is loaded (or default fetched).
  // profilePoints: closed polyline in DXF mm, no duplicate end vertex.
  // profileSource: 'default' | 'user' | null
  profilePoints: null,
  profileSource: null,
  profileFilename: null,
  // Manual override for the relief band. When non-null, takes precedence
  // over the auto detection driven by `outerBandFrac`. Stored as indices
  // into `profilePoints`, so it MUST be cleared whenever a new profile is
  // loaded — the indices would otherwise refer to wrong points.
  profileBandManual: null,            // { startIdx, length } | null
  profileBandPicking: null,           // { firstIdx } during a 2-click pick
  // Target STL for the "stlWrap" shape. Loaded via the wrap-STL file picker
  // and held in memory only — too large to persist through localStorage.
  // wrapStlInfo caches the derived dimensions (max radius, axial height) we
  // need to size the heightmap rasterization.
  wrapStl: null,                      // { positions, triCount } | null
  wrapStlFilename: null,
  wrapStlSource: null,                // 'default' | 'user' | null
  wrapStlInfo: null,                  // { maxR, height, triCount } | null
  // 4-point polygon mask in source-image pixel coords. Pixels outside the
  // polygon are replaced with the relief-zero fill color before rasterization,
  // so the rectangular border around a relief design doesn't end up in the
  // mesh. Always 0..4 entries; the mask is only applied when length === 4.
  cropPolygon: [],
  cropDragIndex: -1,
};

const viewer = new Viewer(els.viewport);

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
  // Preserve existing colors when expanding; fill new slots from palette
  while (state.layerColors.length < newN) {
    state.layerColors.push(COLOR_PALETTE[state.layerColors.length % COLOR_PALETTE.length]);
  }
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

  if (compact) {
    const colorPicker = document.createElement('input');
    colorPicker.type = 'color';
    colorPicker.id = `layerColor${k}`;
    colorPicker.title = `Layer ${k} color`;
    colorPicker.value = state.layerColors[k] || COLOR_PALETTE[k % COLOR_PALETTE.length];
    colorPicker.className = 'layer-color-picker';
    colorPicker.addEventListener('input', () => {
      state.layerColors[k] = colorPicker.value;
      onParamChange();
    });
    wrap.appendChild(colorPicker);
  }

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
  const isCustom = state.shape === 'customProfile';
  const isStlWrap = state.shape === 'stlWrap';
  const isEllipse = state.shape === 'ellipse';
  if (isCyl) {
    els.plateWLabel.textContent = 'Radius R (mm)';
  } else if (isPoly) {
    els.plateWLabel.textContent = 'Side width W (mm)';
  } else {
    els.plateWLabel.textContent = 'Width W (mm)';
  }
  els.sidesControl.classList.toggle('hidden', !isPoly);
  els.closedBottomControl.classList.toggle('hidden', !(isPoly || isCyl || isStlWrap));
  els.chamferTopControl.classList.toggle('hidden', !isPoly);
  els.customProfileControls.classList.toggle('hidden', !isCustom);
  if (els.stlWrapControls) els.stlWrapControls.classList.toggle('hidden', !isStlWrap);
  if (els.ellipseControls) els.ellipseControls.classList.toggle('hidden', !isEllipse);
  // Custom-profile, STL-wrap, and ellipse modes all own their own dimensional
  // controls, so the plain plate W slider is irrelevant. The H control is
  // permanently hidden — H is always derived. baseThickness is hidden for
  // custom profile (not used) and ellipse (replaced by its own thickness
  // slider); STL wrap and cylindrical still use it.
  const plateCtl = els.plateW.closest('.control');
  const plateHCtl = els.plateH.closest('.control');
  const baseCtl = els.baseThickness.closest('.control');
  if (plateCtl)  plateCtl.classList.toggle('hidden', isCustom || isStlWrap || isEllipse);
  if (plateHCtl) plateHCtl.classList.add('hidden');
  if (baseCtl)   baseCtl.classList.toggle('hidden', isCustom || isEllipse);
  if (els.derivedDimsHint) els.derivedDimsHint.classList.toggle('hidden', isCustom || isStlWrap || isEllipse);
}

function updateResolutionVisibility() {
  const dens = state.resolutionMode === 'density';
  els.densityControl.classList.toggle('hidden', !dens);
  els.maxDimControl.classList.toggle('hidden', dens);
}

// Rotate a canvas by 0/90/180/270° (CW). Returns a new canvas; passes the
// original through unchanged when rotation is 0 to avoid an extra blit.
function rotateCanvas(src, deg) {
  deg = ((deg % 360) + 360) % 360;
  if (deg === 0) return src;
  const w = src.width, h = src.height;
  const out = document.createElement('canvas');
  if (deg === 90 || deg === 270) {
    out.width = h;
    out.height = w;
  } else {
    out.width = w;
    out.height = h;
  }
  const ctx = out.getContext('2d');
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate(deg * Math.PI / 180);
  ctx.drawImage(src, -w / 2, -h / 2);
  return out;
}

// Rebuild rawSourceCanvas from the original by applying the current rotation.
// Called on load and when the rotation control changes.
function applyRotation() {
  if (!state.originalRawCanvas) return;
  state.rawSourceCanvas = rotateCanvas(state.originalRawCanvas, state.rotation);
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
  // Polygon coords are in source-canvas pixel space, so they're only valid
  // while the source dimensions stay the same. Rotation, the auto-crop
  // toggle, or loading a new image all invalidate them — drop the polygon
  // rather than silently misalign it with the new content. The first call
  // (lastSourceDims unset) preserves whatever persistence restored.
  const w = state.sourceCanvas.width;
  const h = state.sourceCanvas.height;
  if (state.cropPolygon.length > 0 && state.lastSourceDims) {
    if (state.lastSourceDims.w !== w || state.lastSourceDims.h !== h) {
      state.cropPolygon = [];
      state.cropDragIndex = -1;
    }
  }
  state.lastSourceDims = { w, h };
  paintSourceWithOverlay();
  updateCropStatus();
}

// --------- polygon crop ---------

// Paint the source canvas plus the polygon overlay (dim outside, blue
// outline, draggable handles). Replaces the plain paintToCanvas call we used
// to do directly so any source-canvas update keeps the polygon visible.
function paintSourceWithOverlay() {
  if (!state.sourceCanvas) return;
  const canvas = els.originalCanvas;
  const w = state.sourceCanvas.width;
  const h = state.sourceCanvas.height;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(state.sourceCanvas, 0, 0);

  // Crop-window indicator: when either fraction < 1, dim everything outside
  // the cropped rect and outline it in orange. Drawn first so the polygon
  // overlay (if any) renders on top.
  const crop = currentCropRect();
  if (crop.fX < 1 || crop.fY < 1) {
    const zw = w * crop.fX;
    const zh = h * crop.fY;
    const zx = crop.oxFrac * w;
    const zy = crop.oyFrac * h;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.rect(zx, zy, zw, zh);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fill('evenodd');
    ctx.strokeStyle = '#f5b042';
    ctx.lineWidth = Math.max(1.5, Math.min(w, h) / 250);
    ctx.setLineDash([Math.max(6, Math.min(w, h) / 60), Math.max(4, Math.min(w, h) / 90)]);
    ctx.strokeRect(zx, zy, zw, zh);
    ctx.restore();
  }

  const poly = state.cropPolygon;
  if (!poly || poly.length === 0) return;

  // Dim the area outside the polygon when it's complete (4 points). Uses
  // even-odd fill against the canvas rect so the polygon interior stays
  // un-dimmed.
  if (poly.length === 4) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.moveTo(poly[0].x, poly[0].y);
    for (let i = poly.length - 1; i >= 1; i--) ctx.lineTo(poly[i].x, poly[i].y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fill('evenodd');
    ctx.restore();
  }

  const lineW = Math.max(1.5, Math.min(w, h) / 250);
  ctx.strokeStyle = '#3a86ff';
  ctx.lineWidth = lineW;
  ctx.beginPath();
  ctx.moveTo(poly[0].x, poly[0].y);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
  if (poly.length === 4) ctx.closePath();
  ctx.stroke();

  const r = Math.max(4, Math.min(w, h) / 80);
  for (let i = 0; i < poly.length; i++) {
    ctx.beginPath();
    ctx.arc(poly[i].x, poly[i].y, r, 0, 2 * Math.PI);
    ctx.fillStyle = '#3a86ff';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(1, lineW);
    ctx.stroke();
  }
}

function updateCropStatus() {
  if (!els.cropPolyStatus) return;
  const n = state.cropPolygon.length;
  els.cropPolyStatus.textContent = `${n}/4` + (n === 4 ? ' (active)' : '');
  els.cropPolyClear.disabled = n === 0;
}

// Convert a pointer event on the originalCanvas to source-canvas pixel coords.
function eventToSourceCoords(e) {
  const canvas = els.originalCanvas;
  const rect = canvas.getBoundingClientRect();
  const sx = (e.clientX - rect.left) * canvas.width  / rect.width;
  const sy = (e.clientY - rect.top)  * canvas.height / rect.height;
  return { x: sx, y: sy };
}

// Read the current crop window as fractions: { fX, fY, oxFrac, oyFrac }.
// Each fraction is in (0, 1]; the offsets sit in [0, 1 - fraction], snapped
// to whichever edge the alignment dropdowns pick (left/center/right · top/
// center/bottom). Centralized so the overlay painter, persistence, and the
// rasterize call all see the same numbers.
function currentCropRect() {
  const readFrac = (slider) => {
    if (!slider) return 1;
    const v = parseFloat(slider.value);
    if (!Number.isFinite(v)) return 1;
    return Math.max(0.01, Math.min(1, v / 100));
  };
  const fX = readFrac(els.zoomSliderX);
  const fY = readFrac(els.zoomSliderY);
  const offsetForAlign = (frac, alignVal, lowKey, highKey) => {
    const max = Math.max(0, 1 - frac);
    if (alignVal === lowKey) return 0;
    if (alignVal === highKey) return max;
    return max / 2;
  };
  const oxFrac = offsetForAlign(fX, els.alignX ? els.alignX.value : 'center', 'left', 'right');
  const oyFrac = offsetForAlign(fY, els.alignY ? els.alignY.value : 'center', 'top', 'bottom');
  return { fX, fY, oxFrac, oyFrac };
}

function findPolygonHandle(pt) {
  if (!state.sourceCanvas) return -1;
  const w = state.sourceCanvas.width;
  const h = state.sourceCanvas.height;
  // Match the visual handle radius plus a little slack for easier grabbing.
  const rPick = Math.max(8, Math.min(w, h) / 60);
  let best = -1;
  let bestD = rPick * rPick;
  for (let i = 0; i < state.cropPolygon.length; i++) {
    const dx = state.cropPolygon[i].x - pt.x;
    const dy = state.cropPolygon[i].y - pt.y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= bestD) { bestD = d2; best = i; }
  }
  return best;
}

// Build a copy of the source canvas with everything outside the 4-point
// polygon replaced by `fillColor` — that color is already chosen elsewhere to
// map to 0 relief, so masked pixels sit flush with the wall.
function getMaskedSourceCanvas(sourceCanvas, polygon, fillColor) {
  if (!polygon || polygon.length !== 4) return sourceCanvas;
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d');
  ctx.fillStyle = fillColor;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(polygon[0].x, polygon[0].y);
  for (let i = 1; i < polygon.length; i++) ctx.lineTo(polygon[i].x, polygon[i].y);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(sourceCanvas, 0, 0);
  ctx.restore();
  return out;
}

els.originalCanvas.addEventListener('pointerdown', (e) => {
  if (!state.sourceCanvas) return;
  const pt = eventToSourceCoords(e);

  // Polygon-handle drag has top priority — handles are small, easily missed.
  const hit = findPolygonHandle(pt);
  if (hit >= 0) {
    state.cropDragIndex = hit;
    els.originalCanvas.setPointerCapture(e.pointerId);
    return;
  }

  // Polygon point placement (up to 4). The crop rect is positioned via the
  // Align dropdowns, not by dragging it here.
  if (state.cropPolygon.length < 4) {
    state.cropPolygon.push({ x: pt.x, y: pt.y });
    state.cropDragIndex = state.cropPolygon.length - 1;
    paintSourceWithOverlay();
    updateCropStatus();
    persist();
    if (state.cropPolygon.length === 4) onParamChange();
    els.originalCanvas.setPointerCapture(e.pointerId);
  }
});

els.originalCanvas.addEventListener('pointermove', (e) => {
  if (!state.sourceCanvas) return;

  if (state.cropDragIndex < 0) return;
  const pt = eventToSourceCoords(e);
  const w = state.sourceCanvas.width;
  const h = state.sourceCanvas.height;
  pt.x = Math.max(0, Math.min(w, pt.x));
  pt.y = Math.max(0, Math.min(h, pt.y));
  state.cropPolygon[state.cropDragIndex] = pt;
  paintSourceWithOverlay();
});

const endPolygonDrag = (e) => {
  if (state.cropDragIndex < 0) return;
  state.cropDragIndex = -1;
  if (e && e.pointerId != null && els.originalCanvas.hasPointerCapture(e.pointerId)) {
    els.originalCanvas.releasePointerCapture(e.pointerId);
  }
  persist();
  if (state.cropPolygon.length === 4) onParamChange();
};
els.originalCanvas.addEventListener('pointerup', endPolygonDrag);
els.originalCanvas.addEventListener('pointercancel', endPolygonDrag);

els.cropPolyClear.addEventListener('click', () => {
  if (state.cropPolygon.length === 0) return;
  state.cropPolygon = [];
  state.cropDragIndex = -1;
  paintSourceWithOverlay();
  updateCropStatus();
  persist();
  onParamChange();
});

// Ramanujan's second approximation. Used for the rasterizer's unrolled
// width and the hint text. The mesh builder integrates arc length directly
// for its parameterization — this is just for sizing.
function ellipseCircumference(a, b) {
  if (!(a > 0) || !(b > 0)) return 0;
  const h = ((a - b) / (a + b)) ** 2;
  return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
}

// Single-knob sizing: only W is user-editable. H is derived so that each
// stamped image tile preserves its native aspect ratio on the chosen shape.
// Per-tile match: (tileWmm) / (tileHmm) = imgW / imgH.
//
// Rect / polygon: the heightmap covers the whole plate (or one face);
// the image is stamped tileX × tileY across it, so
//   plateH = plateW × (imgH / imgW) × (tileY / tileX).
// Cylindrical: W is reinterpreted as the cylinder RADIUS (mm). The actual
// per-tile arc width is plateW_arc = 2πR / tileX. The image is stamped
// tileX times around the circumference and tileY along Z, so each tile is
// (plateW_arc) × (plateH / tileY) and
//   plateH = plateW_arc × (imgH / imgW) × tileY.
// Returns null until a source image is available.
function computeDerivedDims() {
  if (!state.sourceCanvas) return null;
  const imgW = state.sourceCanvas.width;
  const imgH = state.sourceCanvas.height;
  if (!(imgW > 0) || !(imgH > 0)) return null;

  const uiW = parseFloat(els.plateW.value);
  if (!(uiW > 0)) return null;
  const tileX = Math.max(1, parseInt(els.tileX.value, 10) || 1);
  const tileY = Math.max(1, parseInt(els.tileY.value, 10) || 1);

  if (state.shape === 'cylindrical') {
    const radius = uiW;
    const diameter = 2 * radius;
    const circumference = 2 * Math.PI * radius;
    const actualPlateW = circumference / tileX;
    const plateH = actualPlateW * (imgH / imgW) * tileY;
    return { actualPlateW, plateH, radius, diameter, circumference, tileX, tileY };
  }

  if (state.shape === 'ellipse') {
    const xSize = parseFloat(els.ellipseX.value);
    const ySize = parseFloat(els.ellipseY.value);
    const height = parseFloat(els.ellipseHeight.value);
    const thickness = parseFloat(els.ellipseThickness.value) || 0;
    if (!(xSize > 0) || !(ySize > 0) || !(height > 0)) return null;
    const circumference = ellipseCircumference(xSize / 2 + thickness, ySize / 2 + thickness);
    const actualPlateW = circumference / tileX;
    return { actualPlateW, plateH: height, circumference, xSize, ySize, tileX, tileY };
  }

  if (state.shape === 'stlWrap') {
    if (!state.wrapStlInfo) return null;
    const { maxR, height } = state.wrapStlInfo;
    const circumference = 2 * Math.PI * maxR;
    // Auto-fit tile count around: pick the integer tileX that makes each
    // tile preserve the image's aspect ratio. Per-tile arc = C/tileX, axial
    // height per Y-tile = H/tileY; we want (C/tileX) / (H/tileY) = imgW/imgH,
    // so tileX = round(C × tileY × imgH / (H × imgW)). Integer = seamless
    // wrap around the seam.
    const autoTiles = !!els.wrapAutoTiles && !!els.wrapAutoTiles.checked;
    let effectiveTileX = tileX;
    if (autoTiles && height > 0) {
      const ideal = (circumference * tileY * imgH) / (height * imgW);
      effectiveTileX = Math.max(1, Math.min(60, Math.round(ideal) || 1));
    }
    const actualPlateW = circumference / effectiveTileX;
    return {
      actualPlateW,
      plateH: height,
      maxR,
      circumference,
      tileX: effectiveTileX,
      tileY,
      autoTileX: autoTiles ? effectiveTileX : null
    };
  }

  const actualPlateW = uiW;
  const plateH = actualPlateW * (imgH / imgW) * (tileY / tileX);
  return { actualPlateW, plateH, tileX, tileY };
}

// Push the derived dimensions into the hidden plateH inputs (so the rest
// of the pipeline reads them through readParamsFromUI) and update the hint
// shown next to the W control. Safe to call when no image is loaded yet.
function applyDerivedDims() {
  const dims = computeDerivedDims();
  if (!dims) {
    if (els.derivedDimsHint) els.derivedDimsHint.textContent = '';
    return;
  }
  // Write raw (unrounded) so the tile aspect is preserved exactly. The H
  // slider's min/max are display-only — readParamsFromUI uses .value directly.
  const hStr = String(dims.plateH);
  els.plateH.value = hStr;
  els.plateHNum.value = hStr;
  if (!els.derivedDimsHint) return;
  const fmt = (v) => v.toFixed(1);
  if (state.shape === 'cylindrical') {
    els.derivedDimsHint.textContent =
      `→ diameter ${fmt(dims.diameter)} mm · height ${fmt(dims.plateH)} mm · per-tile arc ${fmt(dims.actualPlateW)} mm`;
  } else if (state.shape === 'stlWrap') {
    const tilePart = dims.autoTileX != null
      ? ` · auto tiles X = ${dims.autoTileX}`
      : '';
    els.derivedDimsHint.textContent =
      `→ max-R ${fmt(dims.maxR)} mm · height ${fmt(dims.plateH)} mm · per-tile arc ${fmt(dims.actualPlateW)} mm${tilePart}`;
  } else if (state.shape === 'ellipse') {
    // The ellipse panel already shows X/Y/height literally, so the regular
    // derived-dims hint is hidden in this mode (see updateShapeLabels).
  } else {
    els.derivedDimsHint.textContent = `→ height ${fmt(dims.plateH)} mm`;
  }
}

// ---------- persistence ----------

function readParamsFromUI() {
  // The UI W slider means different things by shape: width for rect/poly,
  // radius for cylinder. computeDerivedDims handles the conversion and
  // returns the actual per-tile plateW the geometry pipeline expects, plus
  // the derived plateH. Fall back to raw UI values if no image is loaded
  // yet (e.g. initial render before a file lands).
  const derived = computeDerivedDims();
  const plateW = derived ? derived.actualPlateW : parseFloat(els.plateW.value);
  const plateH = derived ? derived.plateH : parseFloat(els.plateH.value);
  // In stlWrap + auto-fit mode, tileX is derived (so tiles wrap seamlessly
  // and preserve image aspect). All other modes read it straight from the UI.
  const uiTileX = parseInt(els.tileX.value, 10) || 1;
  const effectiveTileX = (state.shape === 'stlWrap' && derived && derived.autoTileX != null)
    ? derived.autoTileX
    : uiTileX;
  return {
    brightness: parseFloat(els.brightness.value),
    contrast: parseFloat(els.contrast.value),
    blurRadius: parseFloat(els.blur.value),
    threshold: parseInt(els.threshold.value, 10),
    blackPoint: parseInt(els.blackPoint.value, 10),
    whitePoint: parseInt(els.whitePoint.value, 10),
    invert: els.invert.checked,
    colorCount: state.colorCount,
    layerHeights: state.layerHeights.slice(0, state.colorCount),
    resolutionMode: state.resolutionMode,
    maxDim: parseInt(els.maxDim.value, 10),
    density: parseFloat(els.density.value),
    tileX: effectiveTileX,
    // Persist the raw slider value too — on restore we want the slider back
    // to the user's manual choice, not the auto-fit override.
    uiTileX,
    tileY: parseInt(els.tileY.value, 10) || 1,
    marginX: parseFloat(els.marginX.value) || 0,
    marginY: parseFloat(els.marginY.value) || 0,
    gradFrameTop:    parseFloat(els.gradFrameTop.value)    || 0,
    gradFrameBottom: parseFloat(els.gradFrameBottom.value) || 0,
    gradFrameLeft:   parseFloat(els.gradFrameLeft.value)   || 0,
    gradFrameRight:  parseFloat(els.gradFrameRight.value)  || 0,
    interpX:         els.interpX.checked,
    interpY:         els.interpY.checked,
    interpWidth:     parseFloat(els.interpWidth.value) || 10,

    plateW,
    plateH,
    // The raw UI W slider value (radius for cylinder, width otherwise).
    // Persisted separately from `plateW` so the slider can be restored to
    // exactly what the user set, not the shape-converted per-tile arc.
    uiPlateW: parseFloat(els.plateW.value),
    baseThickness: parseFloat(els.baseThickness.value),
    mapDir: els.mapDir.value,
    fitMode: els.fitMode.value,
    shape: state.shape,
    sides: parseInt(els.sides.value, 10) || 4,
    closedBottom: els.closedBottom.checked,
    wrapAutoTiles: els.wrapAutoTiles.checked,
    chamferTop: parseFloat(els.chamferTop.value) || 0,
    radiusFactor: parseFloat(els.radiusFactor.value) || 1,
    heightFactor: parseFloat(els.heightFactor.value) || 1,
    outerBandFrac: parseFloat(els.outerBandFrac.value) || 50,
    ellipseX:               parseFloat(els.ellipseX.value)               || 40,
    ellipseY:               parseFloat(els.ellipseY.value)               || 25,
    ellipseThickness:       parseFloat(els.ellipseThickness.value)       || 1.5,
    ellipseBottomThickness: parseFloat(els.ellipseBottomThickness.value) || 1.2,
    ellipseHeight:          parseFloat(els.ellipseHeight.value)          || 40,
    ellipseBottomHole:      parseFloat(els.ellipseBottomHole.value)      || 0,
    autoCrop: state.autoCrop,
    rotation: state.rotation,
    zoomX: parseFloat(els.zoomSliderX.value) / 100 || 1,
    zoomY: parseFloat(els.zoomSliderY.value) / 100 || 1,
    stretchX: parseFloat(els.stretchX.value) || 1,
    stretchY: parseFloat(els.stretchY.value) || 1,
    alignX: els.alignX.value,
    alignY: els.alignY.value,
    stlSide: state.stlSide,
    stlRenderSize: parseInt(els.stlRenderSize.value, 10) || STL_RENDER_MAX_DIM_DEFAULT,
    display: { ...state.display },

    asciiSTL: els.asciiSTL.checked,
    showClipping: els.showClipping.checked,
    cropPolygon: state.cropPolygon.map((p) => ({ x: p.x, y: p.y })),
    layerColors: state.layerColors.slice(0, state.colorCount),
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
  setNum('blackPoint', 'blackPointNum', p.blackPoint);
  setNum('whitePoint', 'whitePointNum', p.whitePoint);
  setNum('maxDim', 'maxDimNum', p.maxDim);
  setNum('density', 'densityNum', p.density);
  setNum('sides', 'sidesNum', p.sides);
  setNum('chamferTop', 'chamferTopNum', p.chamferTop);
  setNum('radiusFactor', 'radiusFactorNum', p.radiusFactor);
  setNum('heightFactor', 'heightFactorNum', p.heightFactor);
  setNum('outerBandFrac', 'outerBandFracNum', p.outerBandFrac);
  setNum('ellipseX',               'ellipseXNum',               p.ellipseX);
  setNum('ellipseY',               'ellipseYNum',               p.ellipseY);
  setNum('ellipseThickness',       'ellipseThicknessNum',       p.ellipseThickness);
  setNum('ellipseBottomThickness', 'ellipseBottomThicknessNum', p.ellipseBottomThickness);
  setNum('ellipseHeight',          'ellipseHeightNum',          p.ellipseHeight);
  setNum('ellipseBottomHole',      'ellipseBottomHoleNum',      p.ellipseBottomHole);
  setNum('stlRenderSize', 'stlRenderSizeNum', p.stlRenderSize);
  setNum('tileX', 'tileXNum', p.uiTileX != null ? p.uiTileX : p.tileX);
  setNum('tileY', 'tileYNum', p.tileY);
  setNum('marginX', 'marginXNum', p.marginX);
  setNum('marginY', 'marginYNum', p.marginY);
  setNum('gradFrameTop',    'gradFrameTopNum',    p.gradFrameTop);
  setNum('gradFrameBottom', 'gradFrameBottomNum', p.gradFrameBottom);
  setNum('gradFrameLeft',   'gradFrameLeftNum',   p.gradFrameLeft);
  setNum('gradFrameRight',  'gradFrameRightNum',  p.gradFrameRight);
  setNum('interpWidth',     'interpWidthNum',     p.interpWidth);
  if (p.interpX != null) els.interpX.checked = !!p.interpX;
  if (p.interpY != null) els.interpY.checked = !!p.interpY;
  // Restore the raw slider value (radius or width depending on shape).
  // p.plateW (the converted per-tile arc) is intentionally ignored — it
  // would be wrong to feed back into a slider whose meaning depends on shape.
  setNum('plateW', 'plateWNum', p.uiPlateW != null ? p.uiPlateW : p.plateW);
  setNum('baseThickness', 'baseThicknessNum', p.baseThickness);
  if (p.invert != null) els.invert.checked = !!p.invert;
  if (p.mapDir) els.mapDir.value = p.mapDir;
  if (p.fitMode) els.fitMode.value = p.fitMode;
  if (p.asciiSTL != null) els.asciiSTL.checked = !!p.asciiSTL;
  if (p.showClipping != null) els.showClipping.checked = !!p.showClipping;
  if (Array.isArray(p.cropPolygon)) {
    state.cropPolygon = p.cropPolygon
      .filter((pt) => pt && Number.isFinite(pt.x) && Number.isFinite(pt.y))
      .slice(0, 4)
      .map((pt) => ({ x: pt.x, y: pt.y }));
    state.cropDragIndex = -1;
    updateCropStatus();
  }
  if (p.colorCount) {
    state.colorCount = Math.max(1, Math.min(8, p.colorCount | 0));
    els.colorCount.value = String(state.colorCount);
  }
  if (Array.isArray(p.layerHeights) && p.layerHeights.length) {
    state.layerHeights = p.layerHeights.slice();
    while (state.layerHeights.length < state.colorCount) state.layerHeights.push(0);
  }
  if (Array.isArray(p.layerColors) && p.layerColors.length) {
    state.layerColors = p.layerColors.slice();
    while (state.layerColors.length < 8) {
      state.layerColors.push(COLOR_PALETTE[state.layerColors.length % COLOR_PALETTE.length]);
    }
  }
  if (p.shape === 'rectangular' || p.shape === 'cylindrical' || p.shape === 'polygon' || p.shape === 'customProfile' || p.shape === 'stlWrap' || p.shape === 'ellipse') {
    state.shape = p.shape;
    els.shape.value = p.shape;
  }
  if (p.closedBottom != null) els.closedBottom.checked = !!p.closedBottom;
  if (p.wrapAutoTiles != null) els.wrapAutoTiles.checked = !!p.wrapAutoTiles;
  if (p.autoCrop != null) {
    state.autoCrop = !!p.autoCrop;
    els.autoCrop.checked = state.autoCrop;
  }
  if (p.rotation != null) {
    const r = ((parseInt(p.rotation, 10) || 0) % 360 + 360) % 360;
    state.rotation = (r === 0 || r === 90 || r === 180 || r === 270) ? r : 0;
    els.rotation.value = String(state.rotation);
  }
  // Back-compat: older saves had `imageZoom` (square) + free-drag offsets.
  // Map those into the new fields — same numeric fraction on both axes; pick
  // the alignment closest to the saved offset on each axis (left/right/center).
  const restoreFrac = (val, fallback) => {
    if (val == null) return fallback;
    const f = parseFloat(val);
    if (!Number.isFinite(f)) return fallback;
    return Math.max(0.05, Math.min(1, f));
  };
  const alignFromOffset = (offset, frac, lowKey, highKey) => {
    if (offset == null) return 'center';
    const maxOff = Math.max(0, 1 - frac);
    const o = Math.max(0, Math.min(maxOff, parseFloat(offset) || 0));
    if (maxOff < 1e-6) return 'center';
    if (o < maxOff * 0.25) return lowKey;
    if (o > maxOff * 0.75) return highKey;
    return 'center';
  };
  const fX = restoreFrac(p.zoomX != null ? p.zoomX : p.imageZoom, 1);
  const fY = restoreFrac(p.zoomY != null ? p.zoomY : p.imageZoom, 1);
  const setPct = (slider, num, frac) => {
    const pct = String(+(frac * 100).toFixed(1));
    slider.value = pct;
    if (num) num.value = pct;
  };
  setPct(els.zoomSliderX, els.zoomSliderXNum, fX);
  setPct(els.zoomSliderY, els.zoomSliderYNum, fY);
  setNum('stretchX', 'stretchXNum', p.stretchX);
  setNum('stretchY', 'stretchYNum', p.stretchY);
  els.alignX.value = (p.alignX === 'left' || p.alignX === 'center' || p.alignX === 'right')
    ? p.alignX
    : alignFromOffset(p.zoomOffsetX, fX, 'left', 'right');
  els.alignY.value = (p.alignY === 'top' || p.alignY === 'center' || p.alignY === 'bottom')
    ? p.alignY
    : alignFromOffset(p.zoomOffsetY, fY, 'top', 'bottom');
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
applyDerivedDims();
els.asciiSTL.addEventListener('change', persist);

if (state.shape === 'customProfile') {
  loadDefaultProfile();
}
if (state.shape === 'stlWrap') {
  loadDefaultWrapStl();
}

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
      state.originalRawCanvas = projectSTLToCanvas(mesh, state.stlSide || 'front', size);
      state.lastStlRenderSize = size;
    } else {
      state.stlData = null;
      state.inputType = 'image';
      state.originalRawCanvas = await loadImageFromFile(file);
      state.lastStlRenderSize = 0;
    }
    state.sourceFilename = file.name.replace(/\.[^.]+$/, '') || 'input';
    // A new image has different pixel dimensions (and content), so any old
    // polygon points are meaningless — reset.
    state.cropPolygon = [];
    state.cropDragIndex = -1;
    updateCropStatus();
    updateStlControlsVisibility();
    applyRotation();
    applyAutoCrop();
    applyDerivedDims();
    setExportEnabled(false);
    viewer.requestFrame();
    triggerProcessing(true);
  } catch (err) {
    showWarning('Could not load file: ' + err.message, true);
  }
}

function rerenderStlDepth() {
  if (state.inputType !== 'stl' || !state.stlData) return;
  try {
    const size = currentStlRenderSize();
    state.originalRawCanvas = projectSTLToCanvas(state.stlData, state.stlSide, size);
    state.lastStlRenderSize = size;
    applyRotation();
    applyAutoCrop();
    applyDerivedDims();
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
    state.originalRawCanvas = projectSTLToCanvas(state.stlData, state.stlSide, size);
    state.lastStlRenderSize = size;
    applyRotation();
    applyAutoCrop();
    applyDerivedDims();
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

// Paint the processed (heightmap) preview, optionally with a clipping
// highlight: pure-black pixels (under the black point → 0 relief) are shown
// as white and pure-white pixels (above the white point → max relief) are
// shown as black, so clipped regions jump out visually. Mid-tone pixels
// pass through unchanged so the grayscale heightmap reads normally.
function paintProcessedCanvas(processed) {
  const N = processed.colorCount;
  const colors = state.layerColors.slice(0, N);
  // Show colored preview; clipping highlight only applies in grayscale mode
  const colored = levelMapToColoredImageData(processed.levelMap, N, processed.width, processed.height, colors);
  if (!els.showClipping.checked || N > 1) {
    paintToCanvas(colored, els.processedCanvas);
    return;
  }
  // Clipping highlight for N=1 continuous mode
  const w = colored.width, h = colored.height;
  const out = new ImageData(w, h);
  const src = colored.data;
  const dst = out.data;
  for (let i = 0; i < src.length; i += 4) {
    const r = src[i], g = src[i + 1], b = src[i + 2];
    if (r === 0 && g === 0 && b === 0) {
      dst[i] = dst[i + 1] = dst[i + 2] = 255;
    } else if (r === 255 && g === 255 && b === 255) {
      dst[i] = dst[i + 1] = dst[i + 2] = 0;
    } else {
      dst[i] = r; dst[i + 1] = g; dst[i + 2] = b;
    }
    dst[i + 3] = src[i + 3];
  }
  paintToCanvas(out, els.processedCanvas);
}

// Render a 256-bin brightness histogram with black/white-point markers
// overlaid. Bins are computed in processImage from the post-blur, pre-levels
// `smoothed` array, so the bars show the actual brightness distribution the
// user is mapping with the Levels sliders. Uses log scale so a single huge
// background bin doesn't crush the rest of the distribution flat.
function paintHistogram(processed, params) {
  const canvas = els.histogramCanvas;
  if (!canvas) return;
  const cssW = canvas.clientWidth || canvas.parentElement?.clientWidth || 256;
  const cssH = canvas.clientHeight || 96;
  const dpr = window.devicePixelRatio || 1;
  const W = Math.max(64, Math.round(cssW * dpr));
  const H = Math.max(32, Math.round(cssH * dpr));
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const hist = processed && processed.histogram;
  if (!hist) return;

  let maxCount = 0;
  for (let i = 0; i < 256; i++) if (hist[i] > maxCount) maxCount = hist[i];
  if (maxCount === 0) return;
  const logMax = Math.log1p(maxCount);

  const binW = W / 256;
  ctx.fillStyle = '#888';
  for (let i = 0; i < 256; i++) {
    if (hist[i] === 0) continue;
    const h = (Math.log1p(hist[i]) / logMax) * (H - 2);
    ctx.fillRect(i * binW, H - h, Math.max(1, binW), h);
  }

  // Black/white-point markers. Black point = the cutoff below which pixels
  // are clamped to 0 relief; white point = the cutoff above which they hit
  // max. Drawn as full-height vertical lines so they're easy to align with
  // the histogram peaks.
  const black = Math.max(0, Math.min(254, params.blackPoint | 0));
  const white = Math.max(black + 1, Math.min(255, params.whitePoint | 0));
  ctx.lineWidth = Math.max(1, dpr);
  ctx.strokeStyle = '#3a86ff';
  ctx.beginPath();
  ctx.moveTo(black * binW + 0.5, 0);
  ctx.lineTo(black * binW + 0.5, H);
  ctx.stroke();
  ctx.strokeStyle = '#ffd166';
  ctx.beginPath();
  ctx.moveTo(white * binW + 0.5, 0);
  ctx.lineTo(white * binW + 0.5, H);
  ctx.stroke();
}

// ---------- pipeline ----------

const TRI_AUTO_LIMIT = 500_000;
const TRI_HARD_LIMIT = 2_000_000;

let processTimer = null;

function onParamChange() {
  // Refresh derived plateH from current W / tileX / tileY / shape before
  // anything reads readParamsFromUI(). Cheap enough to run on every change.
  applyDerivedDims();
  if (state.shape === 'customProfile') drawProfilePreview();
  persist();
  triggerProcessing(false);
}

function getTargetDims(params) {
  // Cylindrical mode: W is the per-tile arc width in mm. The unrolled
  // rectangle is (W × tileX) wide so all tileX repetitions cover the full
  // circumference. Polygon mode: W is the per-face side width.
  // Custom-profile mode: heightmap width = full circumference at the outer
  // band's max radius (after factors); heightmap height = outer-band arc
  // length. Both already include their tile multipliers, like cylinder mode.
  let w, h;
  if (params.shape === 'customProfile') {
    const dims = customProfileDims(params);
    if (!dims) return { targetW: 2, targetH: 2 };
    // Closed surface: a single revolution covers the whole circumference, so
    // baseW = circumference (NOT × tileX). The rasterizer's perTileFit path
    // then gets a per-tile pixel box whose aspect matches the physical tile
    // aspect (circumference/tileX) / bandLength.
    w = dims.circumference;
    h = dims.bandLength;
  } else if (params.shape === 'cylindrical' || params.shape === 'stlWrap' || params.shape === 'ellipse') {
    w = params.plateW * params.tileX;
    h = params.plateH;
  } else {
    w = params.plateW;
    h = params.plateH;
  }
  if (params.resolutionMode === 'density') {
    const d = params.density;
    return {
      targetW: Math.max(2, Math.round(w * d)),
      targetH: Math.max(2, Math.round(h * d))
    };
  }
  return computeTargetDimensions(w, h, params.maxDim);
}

// For custom-profile mode: compute the full circumference at the outermost
// radius (post-scaling) and the arc length of the outer band of the
// (scaled) profile. Returns null if no profile is loaded yet.
function customProfileDims(params) {
  if (!state.profilePoints || state.profilePoints.length < 3) return null;
  const rf = params.radiusFactor || 1;
  const hf = params.heightFactor || 1;
  const scaled = state.profilePoints.map(([x, y]) => [x * rf, y * hf]);
  const band = selectBand(scaled, params.outerBandFrac || 50);
  if (band.length < 2) return null;
  // Walk the band once to get both its arc length and its own max radius.
  // The circumference reference for the rasterized image is the band's max
  // radius (not the profile's), so a manually-picked inner band gets a
  // correctly-sized heightmap rather than one stretched for an outer ring
  // that isn't actually receiving the relief.
  let bandLength = 0;
  let bandMaxX = -Infinity;
  for (let k = 0; k < band.length; k++) {
    const a = scaled[(band.startIdx + k) % scaled.length];
    if (a[0] > bandMaxX) bandMaxX = a[0];
    if (k < band.length - 1) {
      const b = scaled[(band.startIdx + k + 1) % scaled.length];
      bandLength += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
  }
  const circumference = 2 * Math.PI * bandMaxX;
  return { circumference, bandLength, scaled, band, maxR: bandMaxX };
}

function estimateTrisForShape(targetW, targetH, shape, sides, hasChamfer, profileLen) {
  if (shape === 'cylindrical') return estimateCylindricalTriangleCount(targetW, targetH);
  if (shape === 'stlWrap') return estimateSTLWrapTriangleCount(targetW, targetH);
  if (shape === 'ellipse') return estimateEllipseTriangleCount(targetW, targetH);
  if (shape === 'polygon') return estimatePolygonPrismTriangleCount(sides, targetW, targetH, hasChamfer);
  if (shape === 'customProfile') {
    // After splicing the outer band (length Ny) into the profile (originally
    // Np_orig points), the new profile has Np_orig − band.length + Ny points.
    // We don't know band.length here without recomputing; use a conservative
    // estimate of profileLen (the original) + Ny as an upper bound that still
    // grows linearly with Ny.
    const np = (profileLen || 32) + targetH;
    return estimateCustomProfileTriangleCount(targetW, np);
  }
  return estimateTriangleCount(targetW, targetH);
}

function triggerProcessing(immediate) {
  if (!state.sourceCanvas) {
    updateStats();
    return;
  }
  if (processTimer) clearTimeout(processTimer);

  // Always run the preview phase synchronously — it's the only thing that
  // gives the user instant feedback for sliders. The expensive mesh build
  // happens after, gated by the triangle-count thresholds below.
  if (!regeneratePreview()) return;

  const params = readParamsFromUI();
  const { targetW, targetH } = getTargetDims(params);
  const profileLen = state.profilePoints ? state.profilePoints.length : 0;
  const tris = estimateTrisForShape(targetW, targetH, params.shape, params.sides, params.chamferTop > 0, profileLen);

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
  processTimer = setTimeout(() => regenerateMesh(), delay);
}

els.regenBtn.addEventListener('click', () => regeneratePipeline());

// Phase 1 of the pipeline: rasterize → processImage → paint preview canvas
// + histogram → build heightmap. Cheap relative to mesh build, so it always
// runs synchronously on slider changes for instant UI feedback. Returns
// false if the preview can't be built (e.g. customProfile with no DXF yet).
function regeneratePreview() {
  if (!state.sourceCanvas) return false;
  maybeReprojectStl();
  const params = readParamsFromUI();
  const { targetW, targetH } = getTargetDims(params);

  // Convert margin mm → pixels using actual mm-to-pixel ratio for each axis.
  // For cylinder mode the unrolled width = plateW × tileX (matches getTargetDims).
  // For custom-profile mode the unrolled grid is circumference × bandLength.
  let baseW, baseH;
  let customDims = null;
  if (params.shape === 'customProfile') {
    customDims = customProfileDims(params);
    if (!customDims) {
      showWarning('Load a DXF profile first.', false);
      setExportEnabled(false);
      return false;
    }
    // Match getTargetDims: baseW = circumference (single revolution); the
    // rasterizer stamps tileX copies inside that single-rev canvas.
    baseW = customDims.circumference;
    baseH = customDims.bandLength;
  } else if (params.shape === 'cylindrical' || params.shape === 'ellipse') {
    baseW = params.plateW * params.tileX;
    baseH = params.plateH;
  } else if (params.shape === 'stlWrap') {
    if (!state.wrapStl || !state.wrapStlInfo) {
      showWarning('Load a target STL first.', false);
      setExportEnabled(false);
      return false;
    }
    baseW = params.plateW * params.tileX;
    baseH = params.plateH;
  } else {
    baseW = params.plateW;
    baseH = params.plateH;
  }
  const pxPerMmX = baseW > 0 ? targetW / baseW : 0;
  const pxPerMmY = baseH > 0 ? targetH / baseH : 0;
  // Fill the margin / alpha-composite background with whichever color ends
  // up at 0 relief after mapDir, so the margin acts as a flat border instead
  // of a raised one. (Brightness/contrast can still shift it.) `invert` no
  // longer flips grayscale here — it's an engrave-mode toggle applied to the
  // heightmap below, which leaves the margin neutral either way.
  const lowReliefAfter = params.mapDir === 'black' ? 255 : 0;
  const fillColor = lowReliefAfter === 0 ? '#000000' : '#ffffff';
  // If a 4-point polygon is set, mask everything outside it with the
  // 0-relief fill color before rasterization. The mask happens in source
  // pixel space so it tiles correctly when tileX/tileY > 1.
  const sourceForRaster = state.cropPolygon.length === 4
    ? getMaskedSourceCanvas(state.sourceCanvas, state.cropPolygon, fillColor)
    : state.sourceCanvas;
  // Crop step: take the (zoomX × zoomY) sub-rectangle of the source, snapped
  // to the chosen alignment (left/center/right · top/center/bottom). The
  // rasterizer then fits that region into the heightmap target, dropping the
  // unselected side. Runs after the polygon mask so the mask still applies
  // in source pixel space (visible via the orange crop overlay).
  const crop = currentCropRect();
  const zoomedForRaster = (crop.fX < 1 || crop.fY < 1)
    ? subRectCanvas(sourceForRaster, crop.fX, crop.fY, crop.oxFrac, crop.oyFrac)
    : sourceForRaster;
  const stretchedForRaster = (params.stretchX !== 1 || params.stretchY !== 1)
    ? stretchCanvas(zoomedForRaster, params.stretchX, params.stretchY)
    : zoomedForRaster;
  const marginPxX = Math.round(params.marginX * pxPerMmX);
  const marginPxY = Math.round(params.marginY * pxPerMmY);
  const raster = rasterize(stretchedForRaster, targetW, targetH, params.fitMode, {
    tileX: params.tileX,
    tileY: params.tileY,
    marginPxX,
    marginPxY,
    fillColor,
    // Closed revolved surfaces: each tile must literally cover its share of
    // the circumference, so fit each tile in its own box rather than fitting
    // the combined tiled-source aspect into the canvas (which would
    // letterbox tiles when bandLength ≪ circumference).
    perTileFit: params.shape === 'customProfile'
  });
  const processed = processImage(raster, {
    brightness: params.brightness,
    contrast: params.contrast,
    blurRadius: params.blurRadius,
    invert: false,
    threshold: params.threshold,
    blackPoint: params.blackPoint,
    whitePoint: params.whitePoint,
    colorCount: params.colorCount,
    gradFrameTop: params.gradFrameTop,
    gradFrameBottom: params.gradFrameBottom,
    gradFrameLeft: params.gradFrameLeft,
    gradFrameRight: params.gradFrameRight,
    interpX: params.interpX,
    interpY: params.interpY,
    interpWidth: params.interpWidth,
    tileX: params.tileX,
    tileY: params.tileY,
    marginPxX,
    marginPxY
  });
  state.processed = processed;
  paintProcessedCanvas(processed);
  paintHistogram(processed, params);

  const heightmapMm = buildHeightmap(processed, {
    layerHeights: params.layerHeights,
    invertHeight: params.mapDir === 'black'
  });
  // "Invert grayscale" now means engrave: relief carves INTO the base wall
  // instead of protruding outward. Negate the heightmap so geometry's
  // `base + relief` becomes `base - depth`, removing the cuboid pedestal that
  // appears when the whole image area is pushed outward.
  if (params.invert) {
    for (let i = 0; i < heightmapMm.length; i++) heightmapMm[i] = -heightmapMm[i];
  }
  state.heightmapMm = heightmapMm;
  state.lastHeightmap = { data: heightmapMm, width: processed.width, height: processed.height };
  state.lastSurfaceDims = { surfaceW: baseW, surfaceH: baseH };
  state.lastCustomDims = customDims;
  state.lastParamsForMesh = params;
  return true;
}

// Map each vertex in the geometry to its levelMap pixel, then look up the
// user-chosen color for that level. All geometry builders place the outer
// surface as the first Nx*Ny vertices (same row-major order as levelMap),
// and the inner/back surface as the next Nx*Ny vertices.
function buildVertexColors(geom, processed) {
  const Nx = geom.Nx, Ny = geom.Ny;
  const surfaceVerts = Nx * Ny;
  const totalVerts = geom.positions.length / 3;
  const N = processed.colorCount;
  const levelMap = processed.levelMap;
  const colors = state.layerColors.slice(0, N);
  const out = new Float32Array(totalVerts * 3);

  if (N === 1) {
    const [cr, cg, cb] = hexToRgb(colors[0] || '#e0e0e0');
    for (let v = 0; v < totalVerts; v++) {
      const pixelIdx = Math.min(v < surfaceVerts ? v : v - surfaceVerts, surfaceVerts - 1);
      const t = Math.min(255, Math.max(0, levelMap[pixelIdx])) / 255;
      out[v * 3]     = (255 + t * (cr - 255)) / 255;
      out[v * 3 + 1] = (255 + t * (cg - 255)) / 255;
      out[v * 3 + 2] = (255 + t * (cb - 255)) / 255;
    }
  } else {
    const rgbs = colors.map((c) => hexToRgb(c));
    for (let v = 0; v < totalVerts; v++) {
      const pixelIdx = Math.min(v < 2 * surfaceVerts ? (v < surfaceVerts ? v : v - surfaceVerts) : 0, surfaceVerts - 1);
      const level = Math.min(levelMap[pixelIdx], N - 1);
      const [r, g, b] = rgbs[level] || [136, 136, 136];
      out[v * 3]     = r / 255;
      out[v * 3 + 1] = g / 255;
      out[v * 3 + 2] = b / 255;
    }
  }
  return out;
}

// Phase 2: build geometry from the cached heightmap and push it to the
// viewer. Slow at high triangle counts, so callers may debounce or gate
// this on user click while still letting regeneratePreview run instantly.
function regenerateMesh() {
  const heightmap = state.lastHeightmap;
  const params = state.lastParamsForMesh;
  const customDims = state.lastCustomDims;
  if (!heightmap || !params) return;

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
    } else if (params.shape === 'stlWrap') {
      if (!state.wrapStl) {
        showWarning('Load a target STL first.', false);
        setExportEnabled(false);
        return;
      }
      geom = buildSTLWrapGeometry(heightmap, {
        stl: state.wrapStl,
        baseThickness: params.baseThickness,
        closedBottom: params.closedBottom
      });
    } else if (params.shape === 'ellipse') {
      let maxRelief = 0;
      for (let i = 0; i < heightmap.data.length; i++) {
        if (heightmap.data[i] > maxRelief) maxRelief = heightmap.data[i];
      }
      const effectiveWallThickness = params.ellipseThickness + maxRelief;
      geom = buildEllipseGeometry(heightmap, {
        xSize: params.ellipseX,
        ySize: params.ellipseY,
        thickness: effectiveWallThickness,
        bottomThickness: params.ellipseBottomThickness,
        height: params.ellipseHeight,
        bottomHolePct: params.ellipseBottomHole
      });
    } else if (params.shape === 'customProfile') {
      // Resample the outer band to exactly Ny points (one per heightmap row),
      // then splice it back into the profile so all band points sit at known
      // row indices. Non-band points are revolved without any offset.
      if (!customDims) return;
      const { scaled, band } = customDims;
      const Ny = heightmap.height;
      const resampled = resampleSlice(scaled, band.startIdx, band.length, Ny);
      const profilePts = spliceSlice(scaled, band.startIdx, band.length, resampled);
      geom = buildCustomProfileGeometry(heightmap, {
        profile: profilePts,
        outerStart: 0,         // splice puts the resampled band at the front
        outerLength: Ny
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

  // Build vertex colors from levelMap (outer surface = first Nx*Ny vertices).
  const vertexColors = buildVertexColors(geom, state.processed);
  viewer.setMesh(geom.positions, geom.indices, vertexColors);

  setExportEnabled(true);
  updateStats({ tris: geom.triCount, verts: geom.vertCount });
}

function regeneratePipeline() {
  if (regeneratePreview()) regenerateMesh();
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

// FDM extruders top out around 5 points/mm of XY surface detail; anything
// beyond that just bloats the file without adding visible relief. Resin
// printers can resolve more, so we only flag this as informational.
const FDM_PTS_PER_MM_MAX = 5;
// Confirm before downloading STLs bigger than this — they can lock up
// slicers and take ages to upload.
const LARGE_STL_BYTES = 100 * 1024 * 1024;

function getPtsPerMm() {
  const hm = state.lastHeightmap;
  const dims = state.lastSurfaceDims;
  if (!hm || !dims) return null;
  const { surfaceW, surfaceH } = dims;
  if (!(surfaceW > 0) || !(surfaceH > 0)) return null;
  return {
    horizontal: hm.width / surfaceW,
    vertical: hm.height / surfaceH
  };
}

function formatPtsPerMm(pts) {
  if (!pts) return '';
  const fmt = (v) => v.toFixed(v >= 10 ? 0 : 1);
  const flag = (v) => (v > FDM_PTS_PER_MM_MAX ? ' ⚠ above FDM 5/mm' : '');
  const worst = Math.max(pts.horizontal, pts.vertical);
  return `${fmt(pts.horizontal)} × ${fmt(pts.vertical)} pts/mm (H × V)${flag(worst)}`;
}

function setExportEnabled(on) {
  els.downloadSTL.disabled = !on;
  els.downloadOBJ.disabled = !on;
  els.downloadPNG.disabled = !on;
  if (on) {
    const params = readParamsFromUI();
    const tris = state.geometry ? state.geometry.triCount : 0;
    const bytes = estimateBinarySTLBytes(tris);
    const pts = getPtsPerMm();
    const ptsStr = pts ? ` · ${formatPtsPerMm(pts)}` : '';
    els.exportHint.textContent =
      `Filename: ${exportFilename('stl', params)} · ~${formatBytes(bytes)} binary STL${ptsStr}`;
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
  if (params.shape === 'customProfile') {
    const rf = stripTrailing(params.radiusFactor);
    const hf = stripTrailing(params.heightFactor);
    const profileTag = state.profileFilename
      ? state.profileFilename.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]+/g, '_')
      : 'profile';
    return `${name}_${profileTag}_r${rf}xh${hf}_h${f}mm${c}.${ext}`;
  }
  if (params.shape === 'stlWrap') {
    const wrapTag = state.wrapStlFilename
      ? state.wrapStlFilename.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]+/g, '_')
      : 'wrap';
    return `${name}_on_${wrapTag}_h${f}mm${c}.${ext}`;
  }
  if (params.shape === 'ellipse') {
    const ex = stripTrailing(params.ellipseX);
    const ey = stripTrailing(params.ellipseY);
    const eh = stripTrailing(params.ellipseHeight);
    return `${name}_ellipse_${ex}x${ey}xH${eh}_h${f}mm${c}.${ext}`;
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
  const tris = state.geometry.triCount;
  const estBytes = estimateBinarySTLBytes(tris);
  const pts = getPtsPerMm();

  if (estBytes > LARGE_STL_BYTES) {
    const lines = [
      `This STL is very large: ~${formatBytes(estBytes)} (${formatNum(tris)} triangles).`
    ];
    if (pts) {
      lines.push(
        `Resolution: ${formatPtsPerMm(pts)}.`,
        `FDM printing tops out around ${FDM_PTS_PER_MM_MAX} pts/mm — anything higher is wasted on filament. Resin printers can use more.`
      );
    }
    lines.push('', 'Download anyway?');
    if (!window.confirm(lines.join('\n'))) return;
  }

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

els.downloadOBJ.addEventListener('click', () => {
  if (!state.geometry || !state.processed) return;
  const params = readParamsFromUI();
  const N = state.processed.colorCount;
  const baseName = exportFilename('', params).replace(/\.$/, '');
  const { objBlob, mtlBlob, objFilename, mtlFilename } = exportOBJMTL(
    state.geometry.positions,
    state.geometry.indices,
    state.processed.levelMap,
    state.geometry.Nx,
    state.geometry.Ny,
    state.layerColors.slice(0, N),
    N,
    baseName
  );
  downloadBlob(mtlBlob, mtlFilename);
  downloadBlob(objBlob, objFilename);
});

// ---------- initial paint ----------

updateStats();
setExportEnabled(false);
