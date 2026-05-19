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
// fit/stretch, and compositing onto a background fill (default white). The
// fill color is what alpha channels and the margin band end up as before
// height mapping — pass `fillColor` so it lands at 0 relief.
//
// opts:
//   tileX, tileY       — repeat counts (default 1; >1 tiles the source inside the drawing area)
//   marginPxX, marginPxY — flat-relief border width in pixels on each side
//   fillColor          — CSS color used for margin / out-of-image-bounds (default '#ffffff')
//   perTileFit         — when true, each tile is fit independently inside
//                        its own (innerW/tileX × innerH/tileY) box (preserves
//                        source aspect within each tile, no global letterbox).
//                        When false (default), the entire tiled source is fit
//                        as a single image preserving combined aspect — the
//                        right semantic for flat plates, but it letterboxes
//                        when the canvas aspect doesn't match source × tile.
// Return a new canvas containing the (fractionX × fractionY) sub-rectangle of
// `sourceCanvas` whose top-left corner sits at (offsetXFrac × w, offsetYFrac × h).
// Used as a pre-rasterize crop step: each axis can independently scale 0…1,
// so callers can drop e.g. the right half of the image without affecting Y.
// Offsets are clamped to [0, 1 - fractionAxis] so the sub-rect stays inside
// the source. When offsets are not provided, the sub-rect is centered on
// that axis. fractionX = fractionY = 1 returns the source unchanged.
export function subRectCanvas(sourceCanvas, fractionX, fractionY, offsetXFrac, offsetYFrac) {
  const fX = Math.max(0.01, Math.min(1, fractionX));
  const fY = Math.max(0.01, Math.min(1, fractionY));
  if (fX >= 1 && fY >= 1) return sourceCanvas;
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const cw = Math.max(2, Math.round(w * fX));
  const ch = Math.max(2, Math.round(h * fY));
  const maxOffsetX = 1 - fX;
  const maxOffsetY = 1 - fY;
  const ox = offsetXFrac != null ? Math.max(0, Math.min(maxOffsetX, offsetXFrac)) : maxOffsetX / 2;
  const oy = offsetYFrac != null ? Math.max(0, Math.min(maxOffsetY, offsetYFrac)) : maxOffsetY / 2;
  const cx = Math.round(ox * w);
  const cy = Math.round(oy * h);
  const out = document.createElement('canvas');
  out.width = cw;
  out.height = ch;
  const ctx = out.getContext('2d');
  ctx.drawImage(sourceCanvas, cx, cy, cw, ch, 0, 0, cw, ch);
  return out;
}

// Non-uniformly resize a canvas. Used for the per-axis image stretch — the
// scaled canvas then flows through the regular fit/stretch rasterizer, so a
// 1.5× X-stretch on a 1:1 source effectively gives a 1.5:1 aspect when fit
// onto the target shape.
export function stretchCanvas(sourceCanvas, sx, sy) {
  const fx = Math.max(0.25, Math.min(4, sx || 1));
  const fy = Math.max(0.25, Math.min(4, sy || 1));
  if (Math.abs(fx - 1) < 1e-3 && Math.abs(fy - 1) < 1e-3) return sourceCanvas;
  const w = Math.max(2, Math.round(sourceCanvas.width * fx));
  const h = Math.max(2, Math.round(sourceCanvas.height * fy));
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  out.getContext('2d').drawImage(sourceCanvas, 0, 0, w, h);
  return out;
}

export function rasterize(sourceCanvas, targetW, targetH, fitMode, opts = {}) {
  const tileX = Math.max(1, opts.tileX | 0 || 1);
  const tileY = Math.max(1, opts.tileY | 0 || 1);
  const marginPxX = Math.max(0, Math.round(opts.marginPxX || 0));
  const marginPxY = Math.max(0, Math.round(opts.marginPxY || 0));
  const fillColor = opts.fillColor || '#ffffff';
  const perTileFit = !!opts.perTileFit;

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  ctx.fillStyle = fillColor;
  ctx.fillRect(0, 0, targetW, targetH);

  const innerW = targetW - 2 * marginPxX;
  const innerH = targetH - 2 * marginPxY;
  if (innerW <= 0 || innerH <= 0) return canvas;

  if (perTileFit) {
    // Per-tile fit: each of tileX × tileY tiles owns its own box of size
    // (innerW/tileX) × (innerH/tileY). The source image is fit into that
    // box (preserving its aspect) or stretched to it. Used for closed
    // revolved surfaces where tileX must literally wrap N times around.
    const boxW = innerW / tileX;
    const boxH = innerH / tileY;
    const srcAspect = sourceCanvas.width / sourceCanvas.height;
    let drawW, drawH;
    if (fitMode === 'fit') {
      const boxAspect = boxW / boxH;
      if (srcAspect > boxAspect) { drawW = boxW; drawH = boxW / srcAspect; }
      else                       { drawH = boxH; drawW = boxH * srcAspect; }
    } else {
      drawW = boxW; drawH = boxH;
    }
    const insetX = (boxW - drawW) / 2;
    const insetY = (boxH - drawH) / 2;
    for (let j = 0; j < tileY; j++) {
      for (let i = 0; i < tileX; i++) {
        ctx.drawImage(
          sourceCanvas,
          marginPxX + i * boxW + insetX,
          marginPxY + j * boxH + insetY,
          drawW, drawH
        );
      }
    }
    return canvas;
  }

  // Combined-aspect fit (legacy / flat-plate path): treat the tile array as
  // a single image of size sourceW·tileX × sourceH·tileY and fit/stretch
  // that into the canvas.
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

  const tileW = dw / tileX;
  const tileH = dh / tileY;
  for (let j = 0; j < tileY; j++) {
    for (let i = 0; i < tileX; i++) {
      ctx.drawImage(sourceCanvas, dx + i * tileW, dy + j * tileH, tileW, tileH);
    }
  }

  return canvas;
}

// Blend a single horizontal seam. `seamLeftCol` is the column immediately to
// the LEFT of the seam; the matching column to the right wraps with %w so
// that the canvas-edge seam (seamLeftCol = w-1) cleanly pairs col w-1 ↔ col 0.
// α = 0.5 at the seam (perfect average — guarantees both sides hold the same
// value) and tapers linearly to 0 at distance B inside, so detail outside
// the blend zone is untouched.
function blendXSeam(out, src, w, h, seamLeftCol, B) {
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let k = 0; k < B; k++) {
      const lx = ((seamLeftCol - k) % w + w) % w;
      const rx = ((seamLeftCol + 1 + k) % w + w) % w;
      const alpha = 0.5 * (1 - k / B);
      const a = src[row + lx];
      const b = src[row + rx];
      out[row + lx] = (1 - alpha) * a + alpha * b;
      out[row + rx] = (1 - alpha) * b + alpha * a;
    }
  }
}

function blendYSeam(out, src, w, h, seamTopRow, B) {
  for (let k = 0; k < B; k++) {
    const ty = ((seamTopRow - k) % h + h) % h;
    const by = ((seamTopRow + 1 + k) % h + h) % h;
    const alpha = 0.5 * (1 - k / B);
    const rowT = ty * w;
    const rowB = by * w;
    for (let x = 0; x < w; x++) {
      const a = src[rowT + x];
      const b = src[rowB + x];
      out[rowT + x] = (1 - alpha) * a + alpha * b;
      out[rowB + x] = (1 - alpha) * b + alpha * a;
    }
  }
}

// Cross-fade opposing edges of the heightmap so a non-tileable texture wraps
// without a visible seam. When the rasterizer placed tileX × tileY copies of
// the source into the canvas, every inter-tile boundary also gets blended —
// so a non-tileable pattern stops showing the join between adjacent copies.
//
// The blend width is interpreted as a percentage of ONE TILE's dimension
// (capped to half the tile so adjacent zones never overlap). That way the
// slider feels the same whether tileX is 1 or 10. The canvas-wrap seam
// (col 0 ↔ col w-1) is implicitly the last tile's right edge in cylindrical
// shapes, which is why it's always included.
function applyEdgeInterpolation(adjusted, w, h, params) {
  const doX = !!params.interpX;
  const doY = !!params.interpY;
  if (!doX && !doY) return adjusted;
  const pct = Math.max(0, Math.min(50, params.interpWidth || 10));
  if (pct <= 0) return adjusted;

  const tileX = Math.max(1, params.tileX | 0 || 1);
  const tileY = Math.max(1, params.tileY | 0 || 1);
  const marginPxX = Math.max(0, Math.round(params.marginPxX || 0));
  const marginPxY = Math.max(0, Math.round(params.marginPxY || 0));
  const innerW = Math.max(0, w - 2 * marginPxX);
  const innerH = Math.max(0, h - 2 * marginPxY);

  let src = adjusted;
  const out = new Float32Array(adjusted);

  if (doX && innerW > 0) {
    const tileW = innerW / tileX;
    const Bx = Math.max(1, Math.min(
      Math.round((pct / 100) * tileW),
      Math.floor(tileW / 2)
    ));
    // tileX-1 internal seams between adjacent tile copies, plus the wrap
    // seam at the canvas edge (col w-1 ↔ col 0). For tileX = 1 that's just
    // the wrap; for tileX > 1 each junction inside the canvas is covered too.
    for (let i = 0; i < tileX - 1; i++) {
      blendXSeam(out, src, w, h, Math.round(marginPxX + (i + 1) * tileW) - 1, Bx);
    }
    blendXSeam(out, src, w, h, w - 1, Bx);
    src = new Float32Array(out);
  }

  if (doY && innerH > 0) {
    const tileH = innerH / tileY;
    const By = Math.max(1, Math.min(
      Math.round((pct / 100) * tileH),
      Math.floor(tileH / 2)
    ));
    for (let j = 0; j < tileY - 1; j++) {
      blendYSeam(out, src, w, h, Math.round(marginPxY + (j + 1) * tileH) - 1, By);
    }
    blendYSeam(out, src, w, h, h - 1, By);
  }

  return out;
}

// Composite a black-to-transparent gradient over each enabled edge of the
// (already levels-adjusted) float grayscale array. Pixel α is the max of
// the four per-edge ramps so opposing or adjacent gradients meet at the
// strongest point rather than averaging. With `out = in * (1 − α)` and
// α=1 at the edge, the very edge always reaches 0, which is what the
// downstream heightmap reads as zero relief — i.e. a clean chamfer.
function applyGradientFrame(adjusted, w, h, params) {
  const pT = Math.max(0, Math.min(50, params.gradFrameTop || 0));
  const pB = Math.max(0, Math.min(50, params.gradFrameBottom || 0));
  const pL = Math.max(0, Math.min(50, params.gradFrameLeft || 0));
  const pR = Math.max(0, Math.min(50, params.gradFrameRight || 0));
  if (pT === 0 && pB === 0 && pL === 0 && pR === 0) return adjusted;
  const topPx = (pT / 100) * h;
  const botPx = (pB / 100) * h;
  const leftPx = (pL / 100) * w;
  const rightPx = (pR / 100) * w;
  // Always allocate — `adjusted` may alias `smoothed` when the levels pass
  // is a no-op, and we must not mutate it.
  const out = new Float32Array(adjusted);
  for (let y = 0; y < h; y++) {
    let aRow = 0;
    if (topPx > 0 && y < topPx) {
      const a = 1 - y / topPx;
      if (a > aRow) aRow = a;
    }
    if (botPx > 0 && y > h - 1 - botPx) {
      const a = 1 - (h - 1 - y) / botPx;
      if (a > aRow) aRow = a;
    }
    const rowBase = y * w;
    for (let x = 0; x < w; x++) {
      let a = aRow;
      if (leftPx > 0 && x < leftPx) {
        const av = 1 - x / leftPx;
        if (av > a) a = av;
      }
      if (rightPx > 0 && x > w - 1 - rightPx) {
        const av = 1 - (w - 1 - x) / rightPx;
        if (av > a) a = av;
      }
      if (a > 0) out[rowBase + x] = adjusted[rowBase + x] * (1 - a);
    }
  }
  return out;
}

export function processImage(rasterCanvas, params) {
  const w = rasterCanvas.width;
  const h = rasterCanvas.height;
  const ctx = rasterCanvas.getContext('2d', { willReadFrequently: true });
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // Float pipeline: grayscale + brightness + contrast + invert into a Float32
  // array. Source data is uint8, but the moment we blur or apply levels the
  // arithmetic produces meaningful sub-integer values; quantizing each stage
  // back to uint8 throws those away and creates visible terracing on smooth
  // gradients in the final 3D mesh. We only quantize at the very end (display
  // canvas + integer levelMap for quantized color modes).
  const brightness = params.brightness * 2.55;
  const c = params.contrast;
  const contrastFactor = (259 * (c + 255)) / (255 * (259 - c));
  const N = Math.max(1, Math.min(8, params.colorCount | 0));

  const gray = new Float32Array(w * h);
  for (let i = 0, j = 0; i < gray.length; i++, j += 4) {
    let g = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
    g = contrastFactor * (g - 128) + 128 + brightness;
    if (params.invert) g = 255 - g;
    gray[i] = g;
  }

  const smoothed = params.blurRadius > 0
    ? gaussianBlurGray(gray, w, h, params.blurRadius)
    : gray;

  // Pre-levels min/max + 256-bin histogram describe the brightness
  // distribution after brightness/contrast/blur. The UI uses min/max for
  // auto-stretch and renders the histogram for visual feedback under the
  // black/white-point sliders. Clamp to [0,255] for binning since brightness/
  // contrast can push the float values outside that range.
  let dataMin = 255, dataMax = 0;
  const histogram = new Uint32Array(256);
  for (let i = 0; i < smoothed.length; i++) {
    let v = smoothed[i];
    if (v < 0) v = 0; else if (v > 255) v = 255;
    if (v < dataMin) dataMin = v;
    if (v > dataMax) dataMax = v;
    histogram[v | 0]++;
  }
  if (dataMax < dataMin) { dataMin = 0; dataMax = 255; }

  // Levels: black point clamps dark pixels to 0, white point pushes bright
  // pixels to 255, with a linear ramp between. Defaults (0, 255) = no-op.
  // This is what kills the "plate" effect from a non-pure-black background.
  const blackPt = Math.max(0, Math.min(254, params.blackPoint | 0));
  const whitePt = Math.max(blackPt + 1, Math.min(255, params.whitePoint | 0));
  const levRange = whitePt - blackPt;
  const levelsActive = blackPt !== 0 || whitePt !== 255;
  const adjusted = levelsActive ? new Float32Array(smoothed.length) : smoothed;
  if (levelsActive) {
    for (let i = 0; i < smoothed.length; i++) {
      let v = (smoothed[i] - blackPt) * 255 / levRange;
      if (v < 0) v = 0; else if (v > 255) v = 255;
      adjusted[i] = v;
    }
  }

  // Optional edge interpolation: blend the X and/or Y edges into their
  // wrap counterparts so a non-tileable texture revolves around a cylinder
  // (or tiles in flat mode) without a visible seam. Applied before the
  // gradient frame so the chamfer darkening lands on an already-seamless
  // heightmap rather than smearing across the cross-fade.
  const blended = applyEdgeInterpolation(adjusted, w, h, params);

  // Optional gradient frame: a black overlay along each enabled edge that
  // fades from opaque at the very edge to fully transparent `thickness%`
  // pixels in. Applied after levels so the visible chamfer band always
  // reaches 0 regardless of the black/white-point window, and before
  // quantization so the gradient survives in the displayed canvas + the
  // heightmap that's downstream of `levelsFloat` (N=1) or `levelMap`.
  const framed = applyGradientFrame(blended, w, h, params);

  // levelMap (uint8) is used for display + quantized-color heightmap lookups.
  // levelsFloat (the same float array) is used by buildHeightmap in N=1 mode
  // so the continuous lithophane heightmap retains full sub-integer precision
  // from the blur + levels pipeline.
  let levelMap;
  let levelsFloat = null;
  if (N === 1) {
    levelsFloat = framed;
    levelMap = new Uint8Array(framed.length);
    for (let i = 0; i < framed.length; i++) {
      let v = framed[i];
      if (v < 0) v = 0; else if (v > 255) v = 255;
      levelMap[i] = v;
    }
  } else if (N === 2) {
    const t = params.threshold;
    levelMap = new Uint8Array(framed.length);
    for (let i = 0; i < framed.length; i++) {
      levelMap[i] = framed[i] > t ? 1 : 0;
    }
  } else {
    levelMap = new Uint8Array(framed.length);
    for (let i = 0; i < framed.length; i++) {
      let v = framed[i];
      if (v < 0) v = 0; else if (v > 255) v = 255;
      let k = Math.floor((v / 256) * N);
      if (k >= N) k = N - 1;
      levelMap[i] = k;
    }
  }

  const displayImageData = N === 1
    ? grayToImageData(framed, w, h)
    : levelMapToImageData(levelMap, N, w, h);

  return { displayImageData, levelMap, levelsFloat, width: w, height: h, colorCount: N, dataMin, dataMax, histogram };
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
    // Prefer the float source from processImage so smooth gradients don't
    // terrace on the way to mm heights. Falls back to uint8 levelMap if a
    // caller hands in a processed result without levelsFloat.
    const src = processed.levelsFloat || processed.levelMap;
    if (params.invertHeight) {
      for (let i = 0; i < len; i++) {
        let v = src[i];
        if (v < 0) v = 0; else if (v > 255) v = 255;
        out[i] = (1 - v / 255) * max;
      }
    } else {
      for (let i = 0; i < len; i++) {
        let v = src[i];
        if (v < 0) v = 0; else if (v > 255) v = 255;
        out[i] = (v / 255) * max;
      }
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

  // Float32 output: skip the round-to-uint8 step that used to truncate the
  // averaged neighbour values. processImage() does any clamping it needs at
  // the end of the pipeline.
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) {
        let sy = y + k;
        if (sy < 0) sy = 0; else if (sy >= h) sy = h - 1;
        acc += tmp[sy * w + x] * kernel[k + r];
      }
      out[y * w + x] = acc;
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
