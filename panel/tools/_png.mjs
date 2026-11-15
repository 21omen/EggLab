import fs from 'node:fs';
import path from 'node:path';

const dir = 'D:/neww/EggLab/out';
const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.png')).slice(-12);
for (const f of files) {
  const b = fs.readFileSync(path.join(dir, f));
  // IHDR: width(4) height(4) bitDepth(1) colorType(1)
  const colorType = b[25];
  const w = b.readUInt32BE(16);
  const h = b.readUInt32BE(20);
  const hasAlpha = colorType === 6 || colorType === 4;
  console.log(`${f}  ${w}x${h}  colorType=${colorType}${hasAlpha ? ' (alpha)' : ''}  ${Math.round(b.length / 1024)}KB`);
}
