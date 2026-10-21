import * as PIXI from 'pixi.js';
import { glTFAsset } from 'pixi3d/pixi7';

const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

export async function loadGlb(url) {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  const dv = new DataView(buf);

  let offset = 12;
  let jsonOffset = 0, jsonLength = 0, binOffset = 0, binLength = 0;
  while (offset < buf.byteLength) {
    const length = dv.getUint32(offset, true); offset += 4;
    const type = dv.getUint32(offset, true); offset += 4;
    if (type === JSON_CHUNK) { jsonOffset = offset; jsonLength = length; }
    else if (type === BIN_CHUNK) { binOffset = offset; binLength = length; }
    offset += length;
  }

  const descriptor = JSON.parse(new TextDecoder('utf-8').decode(new Uint8Array(buf, jsonOffset, jsonLength)));
  const bin = buf.slice(binOffset, binOffset + binLength);
  const buffers = [bin];
  const base = url.slice(0, url.lastIndexOf('/') + 1);

  const images = [];
  for (let i = 0; i < (descriptor.images || []).length; i++) {
    const img = descriptor.images[i];
    if (typeof img.bufferView === 'number') {
      const bv = descriptor.bufferViews[img.bufferView];
      const bytes = new Uint8Array(bin, bv.byteOffset || 0, bv.byteLength);
      const blob = new Blob([bytes], { type: img.mimeType || 'image/png' });
      const bitmap = await createImageBitmap(blob);
      images[i] = PIXI.Texture.from(bitmap);
    } else if (img.uri) {
      const src = img.uri.startsWith('data:') ? img.uri : base + img.uri;
      images[i] = await PIXI.Assets.load(src);
    }
  }

  return new glTFAsset(descriptor, buffers, images);
}
