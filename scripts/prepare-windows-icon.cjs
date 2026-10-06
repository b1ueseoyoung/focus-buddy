// Repackage existing artwork; preserve the ICNS PNG bytes without resampling.
// The source icon and this generated ICO remain under ARTWORK-LICENSE.md.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'resources/icon.icns'));
if (source.toString('ascii', 0, 4) !== 'icns' || source.readUInt32BE(4) !== source.length) {
  throw new Error('Invalid source ICNS.');
}
const images = new Map();
for (let offset = 8; offset < source.length;) {
  const length = source.readUInt32BE(offset + 4);
  if (length < 8 || offset + length > source.length) throw new Error('Invalid ICNS chunk.');
  const png = source.subarray(offset + 8, offset + length);
  if (png.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    if (width === height && [32, 64, 128, 256].includes(width)) images.set(width, png);
  }
  offset += length;
}
const entries = [...images].sort(([a], [b]) => a - b);
if (entries.length !== 4) throw new Error('Expected 32/64/128/256 pixel PNG representations.');
const header = Buffer.alloc(6 + entries.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(entries.length, 4);
let imageOffset = header.length;
entries.forEach(([size, png], index) => {
  const entry = 6 + index * 16;
  header[entry] = header[entry + 1] = size === 256 ? 0 : size;
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(png.length, entry + 8);
  header.writeUInt32LE(imageOffset, entry + 12);
  imageOffset += png.length;
});
fs.writeFileSync(path.join(root, 'resources/icon.ico'), Buffer.concat([header, ...entries.map(([, png]) => png)]));
console.log('Created resources/icon.ico from unchanged 32/64/128/256 pixel ICNS PNGs.');
