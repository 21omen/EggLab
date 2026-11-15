import { api } from './api.mjs';
for (let i = 0; i < 5; i++) {
  const st = await api('GET', '/api/photocraft/project');
  if (!st?.document) break;
  console.log('closing', st.document.name);
  await api('POST', '/api/photocraft/project/close', { save: false });
}
console.log('now:', (await api('GET', '/api/photocraft/project')).document?.name || null);
