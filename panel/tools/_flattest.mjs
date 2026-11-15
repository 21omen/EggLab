// Direct test of exportFlattened() without restarting the panel.
import * as pc from '../service/photocraft.mjs';

const doc = await pc.inspect();
console.log('active:', doc?.name, doc?.width + 'x' + doc?.height, 'layers', doc?.layers?.length);
if (!doc) process.exit(1);

const out = await pc.exportFlattened({ dir: 'D:\\neww\\EggLab\\out\\_flattest', name: 'flattest' });
console.log(JSON.stringify(out, null, 2));
process.exit(0);
