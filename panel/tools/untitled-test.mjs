// Create an untitled document, then drive the agent through the "never lose work" flow.
import { api } from './api.mjs';

const created = await api('POST', '/api/photocraft/new-document', {
  width: 768, height: 768, background: 'white', name: 'Poster draft',
});
console.log('created:', JSON.stringify(created).slice(0, 200));

const state = await api('GET', '/api/photocraft/project');
console.log('project state:', JSON.stringify(state.document));
console.log('open docs:', JSON.stringify(state.documents));
