# Relief Riser

A single-page web app that converts a 2D image into a 3D **relief plate** suitable for FDM 3D printing, with live preview and STL export. Everything runs client-side: no server, no uploads, no analytics.

## Run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). To produce a static deployable bundle:

```bash
npm run build
npm run preview     # local serve of the production build
```

The `dist/` directory after `build` contains a fully self-contained app (no CDN, no runtime network calls).

## How it works

1. **Image input** — drag-and-drop or file picker. PNG/JPG/WebP/BMP. Images with alpha are composited onto white.
2. **2D editor** — grayscale + brightness/contrast/blur, optional binarization with a threshold, invert, and a resolution slider that controls heightmap density (and therefore mesh detail).
3. **Plate parameters** — width, height, base thickness, max relief height ("factor"), white-vs-black mapping, fit-vs-stretch.
4. **Geometry** — a watertight indexed triangle mesh: a front grid (Z = base + heightmap·factor) and a parallel back grid (Z = 0), joined by four side walls that share their corner vertices with the grids. Every edge is shared by exactly two triangles, so no slicer repair is needed.
5. **Export** — binary STL by default, ASCII optional. Filename is auto-built from the image name plus dimensions and factor.

## Parameter meanings

| Control            | Meaning                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------- |
| Brightness         | Linear shift on grayscale value (-100…+100 ≈ ±255).                                            |
| Contrast           | Standard contrast formula around 128 (-100…+100).                                              |
| Gaussian blur      | Separable Gaussian, radius in pixels. Useful for denoising photos before relief.               |
| Color count        | 1 = continuous grayscale (lithophane). 2 = sharp B&W. 3–8 = quantize to N gray buckets.        |
| Threshold          | Only meaningful for *Color count* = 2: pixel > threshold → light bucket, else dark bucket.     |
| Invert             | Inverts the grayscale before quantization / height mapping.                                    |
| Resolution mode    | *Density (verts/mm)* — keeps detail constant across plate sizes (default = 5). *Max grid dim (px)* — caps total mesh size. |
| Display            | Toggle Solid / Wireframe / Vertices independently. Wireframe + vertices render on top of the solid; disable Solid to inspect just the mesh. |
| Auto-crop          | Trims the source image to its content bounding box (alpha if present, else colour-similarity). |
| Shape              | Rectangular plate · Cylindrical (open tube) · Polygon prism (hollow N-sided box, same image on each face). |
| Number of sides    | Polygon mode only: 3–20 (default 4 → cube).                                                    |
| Closed bottom      | Polygon mode only, default ON: adds a solid floor of thickness = base thickness, so the prism prints as a sealed cup instead of an open tube. |
| Width / Diameter / Side | Rectangular width, cylinder diameter, or polygon side length (mm). Label tracks the shape. |
| Height             | Plate / cylinder / prism height along Z, in mm.                                                |
| Base thickness     | Wall thickness without relief, in mm. For cylinders / prisms this is perpendicular to each face. |
| Layer heights      | Absolute relief above the base, in mm, for each color level (Layer 0 = darkest pixels).        |
| Auto-distribute    | Resets all layer heights to evenly spaced 0…(current max).                                     |
| Mapping direction  | White = high (default) or Black = high. Equivalent to flipping *Invert*; exposed for clarity.  |
| Aspect handling    | Fit (preserve image aspect, pad with flat base) vs Stretch to W × H.                           |
| ASCII STL          | Larger, human-readable. Off by default.                                                        |

## Recommended settings

**Lithophane / portrait (smooth grayscale relief, backlit)**

- Color count: **1**
- Resolution: 300–600 (more = smoother gradients; expect a larger STL)
- Base thickness: 0.6 – 0.8 mm (thin so light passes through)
- Max relief height: 2.0 – 3.0 mm
- Brightness/contrast: tune so the brightest highlights still show some material
- Mapping direction: **Black = high** (so dark image areas become thick → opaque when backlit)

**Sign / logo (sharp 2-tone relief)**

- Color count: **2**, threshold around 128
- Resolution: 200 is plenty for most signs
- Base thickness: 1.5 – 2.0 mm
- Layer 0 (background): 0 mm. Layer 1 (foreground): 0.4 – 0.8 mm
- Mapping direction: **White = high**

**Multi-step relief / topo map (3+ colors)**

- Color count: **3–6**
- Resolution: 200 – 300
- Set per-layer heights to whatever step thicknesses you want — for example
  4 layers at 0 / 0.6 / 1.2 / 1.8 mm makes evenly-stepped contour terraces.
- Use *Auto-distribute layers 0…max evenly* as a starting point, then tweak.

**Photo plaque (smooth relief, frontlit, decorative)**

- Color count: **1**
- Gaussian blur: 1 – 2 px (denoise)
- Base thickness: 1.5 mm
- Max relief height: 1.5 – 2.5 mm
- Resolution: 250 – 400

**Polygon prism (hollow N-sided box, same image on each face)**

- Shape: **Polygon prism**, sides = 4 (cube), 6 (hexagonal lantern), or whatever you like
- Side width: e.g. 40 mm. Height: e.g. 80 mm. Base thickness: 1.5 – 2 mm.
- Color count + layer heights as for any other shape.
- Each side renders the entire image. Adjacent sides meet at sharp polygon
  corners; a small seam wall at every corner keeps the mesh watertight.
- *Closed bottom* (default on): solid floor of thickness = base thickness, so
  the prism prints as a sealed cup with an open top — good for pen holders,
  planters, or display boxes that should hold contents. Disable to get the
  cylinder-style open tube (both ends open through the central axis).
- *Side width* W is the **outer** side length of the polygon. Adjacent faces
  meet at sharp polygon corners; the relief is automatically faded to zero
  at each face's left and right edge column so the corner sits exactly on
  the geometric polygon corner. If you want a wider clean transition
  between adjacent faces, add some *Margin X* — that frame extends the
  flat region inward and gives the relief a clean border.
- Print standing up. Useful for backlit lanterns or display boxes where the
  same artwork should be visible from all angles.

**Cylindrical lantern / lithophane shade**

- Shape: **Cylindrical**
- Diameter: 60 – 100 mm. Height: 80 – 150 mm.
- Color count: **1**, mapping direction **Black = high**, base thickness 0.6 – 0.8 mm
- Max relief height: 1.5 – 2.5 mm
- Resolution: 300 – 500. The image wraps fully around the cylinder, so its
  width-to-height ratio should ideally be ~ π·D / H. Use *Fit* to letterbox
  taller images with flat bands above/below; use *Stretch* if you want full
  cylinder coverage.
- Print standing up. The ends are open by design — the central axis is hollow
  so a candle / LED can sit inside.

## Quality / printability

- Coordinates in millimetres. Z is up. The back of the plate rests on the build plate at Z = 0.
- The mesh is constructed to be watertight by construction — front grid, back grid, and four wall strips share their boundary vertices.
- Tested in PrusaSlicer / Cura / Bambu Studio — slices without "repair model" prompts.
- Soft cap at 500 000 triangles: above that, regeneration is gated behind a button so dragging sliders stays smooth. Hard cap at 2 000 000 triangles: above that, regeneration is blocked with a warning.

## Browser support

Modern Chromium / Firefox / Safari (ES2020 modules + WebGL2).

## Out of scope (v1)

- Multi-material / multi-colour STL.
- Spherical or partial-arc cylindrical reliefs (only full 360° wrap supported).
- Sealed cylindrical pill-shape (the cylindrical mode is intentionally an
  open-ended tube, suitable for backlit lantern use).
- Beveled edges and through-holes for hanging — left out to keep mesh construction strictly watertight without a CSG dependency.
- Account system, cloud storage.
