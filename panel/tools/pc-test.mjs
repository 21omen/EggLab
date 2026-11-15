import { api } from './api.mjs';

const file = process.argv[2];
const steps = async (label, fn) => {
  try {
    console.log(`\n== ${label}`);
    console.log(JSON.stringify(await fn(), null, 1).slice(0, 2200));
  } catch (err) {
    console.log(`!! ${label}: ${err.message}`);
  }
};

await steps('status', async () => {
  const s = await api('GET', '/api/status');
  return s.photocraft;
});

await steps('place', () => api('POST', '/api/photocraft/place', { path: file, fit: true }));

await steps('layers', async () => {
  const l = await api('POST', '/api/photocraft/layers');
  return {
    document: l.document,
    activeLayer: l.activeLayer,
    layers: (l.layers || []).map((x) => ({ id: x.id, name: x.name, kind: x.kind, bounds: x.bounds, visible: x.visible })),
  };
});

await steps('export active', () => api('POST', '/api/photocraft/export-active'));
