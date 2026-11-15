import { api } from './api.mjs';
const c = await api('GET', '/api/chat');
console.log('thread:', c.docKey, '| session:', c.sessionID, '| items:', c.items.length);
for (const it of c.items) console.log('---', it.role, (it.text || '').slice(0, 160).replace(/\n/g, ' '));
const fs = await import('node:fs');
const a = fs.readFileSync(new URL('../agent/AGENT.md', import.meta.url), 'utf8');
console.log('AGENT.md lines', a.split('\n').length, '| emdash', a.includes('\u2014'));
process.exit(0);
