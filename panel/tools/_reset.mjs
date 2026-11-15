import { api } from './api.mjs';
let st;
try { st = await api('POST', '/api/photocraft/launch', {}, 180000); } catch (e) { st = { err: e.message }; }
console.log('launch:', JSON.stringify(st));
const p = await api('GET', '/api/photocraft/project');
console.log('doc:', JSON.stringify(p.document));
await api('POST', '/api/chat/clear', {});
const s = await api('GET', '/api/sessions');
console.log('threads:', (s.docs || []).map((d) => d.key));
const c = await api('GET', '/api/chat');
console.log('chat items:', c.items.length, 'session:', c.sessionID, 'docKey:', c.docKey);
process.exit(0);
