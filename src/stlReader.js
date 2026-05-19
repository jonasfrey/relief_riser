// STL file reader. Detects binary vs ASCII automatically: binary STLs have a
// strict 84 + 50·triCount byte layout, so the size check is reliable even
// when the binary header begins with "solid " (which fools naive parsers).

export async function loadSTLFromFile(file) {
  const buffer = await file.arrayBuffer();
  return parseSTL(buffer);
}

export async function loadSTLFromUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`STL fetch ${url}: ${res.status} ${res.statusText}`);
  const buffer = await res.arrayBuffer();
  return parseSTL(buffer);
}

export function parseSTL(buffer) {
  if (buffer.byteLength >= 84) {
    const view = new DataView(buffer);
    const triCount = view.getUint32(80, true);
    const expectedSize = 84 + triCount * 50;
    if (expectedSize === buffer.byteLength && triCount > 0) {
      return parseBinary(buffer, triCount);
    }
  }
  const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  return parseAscii(text);
}

function parseBinary(buffer, triCount) {
  const view = new DataView(buffer);
  const positions = new Float32Array(triCount * 9);
  let off = 84;
  for (let t = 0; t < triCount; t++) {
    off += 12; // skip per-facet normal
    for (let v = 0; v < 9; v++) {
      positions[t * 9 + v] = view.getFloat32(off, true);
      off += 4;
    }
    off += 2; // attribute byte count
  }
  return { positions, triCount };
}

function parseAscii(text) {
  const positions = [];
  const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    positions.push(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
  }
  if (positions.length === 0 || positions.length % 9 !== 0) {
    throw new Error('Not a valid STL file (no/incomplete vertex data found)');
  }
  return {
    positions: new Float32Array(positions),
    triCount: positions.length / 9
  };
}
