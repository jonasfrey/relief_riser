// Image processing utilities for the relief pipeline.
//
// processImage() does grayscale + brightness/contrast/blur/invert, then
// quantizes the result to N color levels (or leaves it continuous when N=1).
// It returns a display ImageData for the preview canvas plus a `levelMap`
// (bucket indices for N>=2, or 0..255 grayscale for N=1).
//
// buildHeightmap() turns that levelMap + per-layer mm heights into a
// Float32Array of absolute mm heights ready for geometry.

export function computeTargetDimensions(plateW, plateH, maxDim) {
  const aspect = plateW / plateH;
  let targetW, targetH;
  if (aspect >= 1) {
    targetW = Math.round(maxDim);
    targetH = Math.max(2, Math.round(maxDim / aspect));
  } else {
    targetH = Math.round(maxDim);
    targetW = Math.max(2, Math.round(maxDim * aspect));
  }
  return { targetW, targetH };
}

// Render the source onto a target-sized canvas, applying tiling, margin,
// fit/stretch, and compositing onto a white background (so alpha channels and
// the margin become "low" relief).
//
// opts:
//   tileX, tileY       — repeat counts (default 1; >1 tiles the source inside the drawing area)
//   marginPxX, marginPxY — flat-relief border width in pixels on each side
export function rasterize(sourceCanvas, targetW, targetH, fitMode, opts = {}) {
  const tileX = Math.max(1, opts.tileX | 0 || 1);
  const tileY = Math.max(1, opts.tileY | 0 || 1);
  const marginPxX = Math.max(0, Math.round(opts.marginPxX || 0));
  const marginPxY = Math.max(0, Math.round(opts.marginPxY || 0));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, targetW, targetH);

  const innerW = targetW - 2 * marginPxX;
  const innerH = targetH - 2 * marginPxY;
  if (innerW <= 0 || innerH <= 0) return canvas;

  // Effective source dimensions after tiling
  const tiledW = sourceCanvas.width * tileX;
  const tiledH = sourceCanvas.height * tileY;

  let dw, dh, dx, dy;
  if (fitMode === 'fit') {
    const srcAspect = tiledW / tiledH;
    const dstAspect = innerW / innerH;
    if (srcAspect > dstAspect) {
      dw = innerW;
      dh = innerW / srcAspect;
      dx = marginPxX;
      dy = marginPxY + (innerH - dh) / 2;
    } else {
      dh = innerH;
      dw = innerH * srcAspect;
      dx = marginPxX + (innerW - dw) / 2;
      dy = marginPxY;
    }
  } else {
    dw = innerW;
    dh = innerH;
    dx = marginPxX;
    dy = marginPxY;
  }

  // Tile by drawing the source tileX × tileY times, each tile sized to fill
  // its share of the drawing area.
  const tileW = dw / tileX;
  const tileH = dh / tileY;
  for (let j = 0; j < tileY; j++) {
    for (let i = 0; i < tileX; i++) {
      ctx.drawImage(sourceCanvas, dx + i * tileW, dy + j * tileH, tileW, tileH);
    }
  }

  return canvas;
}

export function processImage(rasterCanvas, params) {
  const w = rasterCanvas.width;
  const h = rasterCanvas.height;
  const ctx = rasterCanvas.getContext('2d', { willReadFrequently: true });
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // grayscale + brightness + contrast + invert into a single 8-bit array
  const brightness = params.brightness * 2.55;
  const c = params.contrast;
  const contrastFactor = (259 * (c + 255)) / (255 * (259 - c));
  const N = Math.max(1, Math.min(8, params.colorCount | 0));

  const gray = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; i < gray.length; i++, j += 4) {
    let g = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
    g = contrastFactor * (g - 128) + 128 + brightness;
    if (params.invert) g = 255 - g;
    gray[i] = g;
  }

  const smoothed = params.blurRadius > 0
    ? gaussianBlurGray(gray, w, h, params.blurRadius)
    : gray;

  let levelMap;
  if (N === 1) {
    // Continuous grayscale: levelMap stores 0..255 for full-resolution heights
    levelMap = new Uint8Array(smoothed.length);
    for (let i = 0; i < smoothed.length; i++) levelMap[i] = smoothed[i];
  } else if (N === 2) {
    const t = params.threshold;
    levelMap = new Uint8Array(smoothed.length);
    for (let i = 0; i < smoothed.length; i++) {
      levelMap[i] = smoothed[i] > t ? 1 : 0;
    }
  } else {
    levelMap = new Uint8Array(smoothed.length);
    for (let i = 0; i < smoothed.length; i++) {
      let k = Math.floor((smoothed[i] / 256) * N);
      if (k >= N) k = N - 1;
      levelMap[i] = k;
    }
  }

  const displayImageData = N === 1
    ? grayToImageData(smoothed, w, h)
    : levelMapToImageData(levelMap, N, w, h);

  return { displayImageData, levelMap, width: w, height: h, colorCount: N };
}

// Map a quantized level map (0..N-1) and per-layer mm heights to an absolute
// per-pixel height map. invertHeight reverses the lookup so the lightest
// pixels become the lowest layer.
export function buildHeightmap(processed, params) {
  const N = processed.colorCount;
  const len = processed.width * processed.height;
  const out = new Float32Array(len);

  if (N === 1) {
    const max = Number(params.layerHeights[0]) || 0;
    if (params.invertHeight) {
      for (let i = 0; i < len; i++) out[i] = (1 - processed.levelMap[i] / 255) * max;
    } else {
      for (let i = 0; i < len; i++) out[i] = (processed.levelMap[i] / 255) * max;
    }
  } else {
    const heights = params.layerHeights.slice(0, N).map((v) => Number(v) || 0);
    if (params.invertHeight) heights.reverse();
    for (let i = 0; i < len; i++) out[i] = heights[processed.levelMap[i]];
  }

  return out;
}

function grayToImageData(gray, w, h) {
  const out = new ImageData(w, h);
  for (let i = 0, j = 0; i < gray.length; i++, j += 4) {
    out.data[j] = out.data[j + 1] = out.data[j + 2] = gray[i];
    out.data[j + 3] = 255;
  }
  return out;
}

function levelMapToImageData(levelMap, N, w, h) {
  const out = new ImageData(w, h);
  const step = N === 1 ? 0 : 255 / (N - 1);
  for (let i = 0, j = 0; i < levelMap.length; i++, j += 4) {
    const v = Math.round(levelMap[i] * step);
    out.data[j] = out.data[j + 1] = out.data[j + 2] = v;
    out.data[j + 3] = 255;
  }
  return out;
}

// Separable Gaussian blur on a grayscale array. Returns a new array.
function gaussianBlurGray(src, w, h, radius) {
  const r = Math.max(1, Math.ceil(radius));
  const sigma = Math.max(0.5, radius / 2);
  const kernel = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + r] = v;
    sum += v;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;

  const tmp = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) {
        let sx = x + k;
        if (sx < 0) sx = 0; else if (sx >= w) sx = w - 1;
        acc += src[row + sx] * kernel[k + r];
      }
      tmp[row + x] = acc;
    }
  }

  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) {
        let sy = y + k;
        if (sy < 0) sy = 0; else if (sy >= h) sy = h - 1;
        acc += tmp[sy * w + x] * kernel[k + r];
      }
      const v = Math.round(acc);
      out[y * w + x] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
  return out;
}

export function paintToCanvas(imgData, canvas) {
  canvas.width = imgData.width;
  canvas.height = imgData.height;
  const ctx = canvas.getContext('2d');
  ctx.putImageData(imgData, 0, 0);
}

// Detect the bounding box of "content" pixels in the source canvas.
// Strategy: if the image has any meaningfully transparent pixels, use the
// alpha channel as the content mask. Otherwise compare each pixel's RGB to
// the top-left corner colour and treat anything that differs by more than
// `colorTolerance` (sum of absolute channel differences) as content.
// Returns null when no content is found.
export function detectContentBBox(canvas, options = {}) {
  const w = canvas.width;
  const h = canvas.height;
  if (w === 0 || h === 0) return null;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const data = ctx.getImageData(0, 0, w, h).data;

  let hasAlpha = false;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) { hasAlpha = true; break; }
  }

  let isContent;
  if (hasAlpha) {
    const alphaThreshold = options.alphaThreshold ?? 50;
    isContent = (idx) => data[idx + 3] >= alphaThreshold;
  } else {
    const cr = data[0], cg = data[1], cb = data[2];
    const tol = options.colorTolerance ?? 24;
    isContent = (idx) =>
      Math.abs(data[idx]     - cr) +
      Math.abs(data[idx + 1] - cg) +
      Math.abs(data[idx + 2] - cb) > tol;
  }

  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      const idx = row + x * 4;
      if (isContent(idx)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

export function cropCanvas(canvas, bbox) {
  const out = document.createElement('canvas');
  out.width = bbox.w;
  out.height = bbox.h;
  const ctx = out.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, bbox.x, bbox.y, bbox.w, bbox.h, 0, 0, bbox.w, bbox.h);
  return out;
}

export async function loadImageFromFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}
