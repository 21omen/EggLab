import { api } from './api.mjs';
await api('POST', '/api/photocraft/project/open', { path: 'projects/jazz-night/jazz-night.pcraft' });
for (const f of ['layer.setProps', 'type.create', 'layer.layerMask.fromTransparency', 'layer.newAdjustmentLayer.curves']) {
  const s = await api('POST', '/api/photocraft/commands', { filter: f, limit: 3 });
  for (const c of s.commands) console.log(c.id, '| enabled', c.enabled, '| needsDoc', c.needsDocument, '|', c.label);
}
process.exit(0);
