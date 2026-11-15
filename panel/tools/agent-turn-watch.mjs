// Poll an in-flight agent turn over GET only (POST /api/chat blocks for the whole
// turn, so this script never sends). Prints the tool trail as it happens.
import fs from 'node:fs';

const c = JSON.parse(fs.readFileSync('D:/neww/EggLab/panel/control.json', 'utf8'));
const H = { 'x-egglab-token': c.token };
const started = Date.now();
const seen = new Set();

for (;;) {
  let items = [];
  try {
    const res = await fetch(c.url + '/api/chat?limit=8', { headers: H });
    items = (await res.json()).items || [];
  } catch (err) {
    console.log(`[${Math.round((Date.now() - started) / 1000)}s] poll failed: ${err.message}`);
  }

  const agent = [...items].reverse().find((i) => i.role === 'agent');
  const user = [...items].reverse().find((i) => i.role === 'user');
  if (agent) {
    for (const t of agent.tools || []) {
      const key = `${t.name}:${(t.arg || '').slice(0, 48)}`;
      if (!seen.has(key)) {
        seen.add(key);
        console.log(
          `[${Math.round((Date.now() - started) / 1000)}s] ${t.name} (${t.status}) ${(t.arg || '').replace(/\s+/g, ' ').slice(0, 100)}`
        );
      }
    }
    const elapsed = Math.round((Date.now() - started) / 1000);
    if (!agent.pending) {
      console.log(`\nidle after ${elapsed}s (user brief: ${(user?.text || '').slice(0, 70)}...)`);
      console.log('tools:', (agent.tools || []).map((t) => t.name).join(', '));
      console.log('reply:', (agent.text || '').slice(0, 700));
      if (agent.error) console.log('error:', agent.error);
      break;
    }
  }
  if (Date.now() - started > 60 * 60 * 1000) {
    console.log('giving up after 60 min; last tool:', (agent?.tools || []).slice(-1)[0]?.name);
    break;
  }
  await new Promise((r) => setTimeout(r, 5000));
}
