// End-to-end @mention chat probe: export a layer, send it as a reference with its name.
import { api } from './api.mjs';

const exp = await api('POST', '/api/photocraft/export-layer', { name: 'Red Ladybug' });
const text =
  process.argv[2] ||
  'The attached image is the PhotoCraft layer @Red Ladybug. In one short sentence, tell me what it looks like. Do not render anything.';
const t0 = Date.now();
const res = await api('POST', '/api/chat', {
  text,
  files: [exp.path],
  refMap: { [exp.path]: exp.layer.name },
}, 900000);
console.log(JSON.stringify(res, null, 1));
console.log('seconds', Math.round((Date.now() - t0) / 1000));
