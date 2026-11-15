// Open a saved project, confirm it loads, then confirm autosave still tracks it.
import { api } from './api.mjs';

const recent = await api('GET', '/api/photocraft/project/recent');
console.log('recent:', JSON.stringify(recent.projects.map((p) => p.name)));

const opened = await api('POST', '/api/photocraft/project/open', { path: 'projects/poster-draft/poster-draft.pcraft' });
console.log('open result:', JSON.stringify(opened));

const state = await api('GET', '/api/photocraft/project');
console.log('state after open:', JSON.stringify(state.document));

const layers = await api('POST', '/api/photocraft/layers', {});
console.log('layers:', layers.layers.map((l) => `${l.name}(${l.kind})`).join(', '));
