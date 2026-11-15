import { api } from './api.mjs';
const start = Date.now();
let last = '';
for (;;) {
  const chat = await api('GET', '/api/chat');
  const agent = [...chat.items].reverse().find((i) => i.role === 'agent');
  if (agent) {
    const sig = `${agent.pending}|${(agent.text || '').length}|${agent.tools?.length}|${agent.error || ''}`;
    if (sig !== last) {
      last = sig;
      console.log(`[${Math.round((Date.now() - start) / 1000)}s] pending=${agent.pending} tools=${agent.tools?.length} text=${(agent.text || '').length}b ${agent.error || ''}`);
    }
    if (!agent.pending) {
      console.log('TOOLS:', (agent.tools || []).map((t) => `${t.name}${t.status === 'error' ? '(ERR)' : ''}`).join(' > '));
      console.log('TEXT:', agent.text);
      if (agent.error) console.log('ERROR:', agent.error);
      break;
    }
  }
  if (Date.now() - start > 1500000) {
    console.log('still pending after 25 min');
    break;
  }
  await new Promise((r) => setTimeout(r, 4000));
}
