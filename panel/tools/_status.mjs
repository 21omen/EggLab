import { api } from './api.mjs';
const s = await api('GET', '/api/status');
console.log('running', s.photocraft.running, 'doc', s.photocraft.document?.name || null);
console.log('chat session', (await api('GET', '/api/chat')).sessionID);
