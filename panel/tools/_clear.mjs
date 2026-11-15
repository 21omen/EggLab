import { api } from './api.mjs';
await api('POST', '/api/chat/clear', {});
const s = await api('GET', '/api/sessions');
console.log('threads:', (s.docs || []).map((d) => d.key));
