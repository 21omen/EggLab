import { api } from './api.mjs';
const chat = await api('GET', '/api/chat');
console.log('thread:', chat.docKey);
for (const it of chat.items) {
  console.log('---', it.role, it.pending ? 'pending' : '', it.error ? `ERR ${it.error}` : '');
  if (it.tools?.length) console.log('TOOLS:', it.tools.map((t) => `${t.name}${t.status ? `(${t.status})` : ''}`).join(' > '));
  console.log((it.text || '').slice(0, 1200));
}
