import { api } from './api.mjs';
console.log(await api('POST', '/api/photocraft/launch', {}, 180000));
const p = await api('GET', '/api/photocraft/project');
console.log('doc:', JSON.stringify(p.document));
process.exit(0);
