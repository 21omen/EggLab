// Read-only probe: open documents, preset/save/close command surface.
import { api } from './api.mjs';

const call = async (id, params = {}) => {
  const res = await api('POST', '/api/photocraft/command', { id, params });
  return res?.result ?? res;
};

const menu = await call('ui.menu.list', {});
const list = Array.isArray(menu) ? menu : menu?.menu || [];
const docs = list.filter((m) => /^window\.document\./.test(String(m.id)));
console.log('open documents:', JSON.stringify(docs));

const cmds = await call('command.list', {});
const rows = cmds?.commands || cmds?.result || (Array.isArray(cmds) ? cmds : []);
console.log('total commands:', rows.length);
for (const re of [/preset/i, /save/i, /^file\.close/i]) {
  const hits = rows.filter((r) => re.test(r.id || '')).slice(0, 12).map((r) => r.id);
  console.log(`${re}: `, JSON.stringify(hits));
}
