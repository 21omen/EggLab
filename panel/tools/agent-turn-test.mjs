// Live agent-turn test: send one design brief and watch which tools the model
// reaches for unprompted. Prints the tool trail and the final reply.
import fs from 'node:fs';

const c = JSON.parse(fs.readFileSync('D:/neww/EggLab/panel/control.json', 'utf8'));
const H = { 'x-egglab-token': c.token, 'content-type': 'application/json' };

async function api(method, path, body) {
  const res = await fetch(c.url + path, {
    method,
    headers: H,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  if (!res.ok) throw new Error(json?.error || text || res.status);
  return json;
}

const brief =
  process.argv[2] ||
  'Design a 1080x1350 Instagram post for a canned cold brew called "MIDNIGHT SET". ' +
  'One idea: shoot it like a 1960s Blue Note jazz sleeve. Keep it editable.';

console.log('brief:', brief);
const started = Date.now();
// POST /api/chat blocks for the entire turn (10+ minutes), which blows past any
// client headers timeout. Fire it, ignore the eventual rejection, and watch the
// turn over GET instead — the server keeps working regardless of this socket.
fetch(c.url + '/api/chat', {
  method: 'POST',
  headers: H,
  body: JSON.stringify({ text: brief }),
}).catch((err) => console.log(`(post returned: ${err.message}; turn continues server-side)`));

const seen = new Set();
for (;;) {
  await new Promise((r) => setTimeout(r, 5000));
  const h = await api('GET', '/api/chat?limit=8');
  const items = h.items || [];
  const agent = [...items].reverse().find((i) => i.role === 'agent');
  if (!agent) continue;
  for (const t of agent.tools || []) {
    const key = `${t.name}:${(t.arg || '').slice(0, 40)}`;
    if (!seen.has(key)) {
      seen.add(key);
      console.log(`  [${Math.round((Date.now() - started) / 1000)}s] ${t.name} (${t.status}) ${(t.arg || '').slice(0, 90)}`);
    }
  }
  const elapsed = Math.round((Date.now() - started) / 1000);
  if (!agent.pending && agent.tools?.length) {
    console.log(`\nfinished in ${elapsed}s`);
    console.log('tools used:', (agent.tools || []).map((t) => t.name).join(', '));
    console.log('reply:', (agent.text || '').slice(0, 800));
    if (agent.error) console.log('error:', agent.error);
    break;
  }
  if (elapsed > 1500) {
    console.log('timed out after 25 min; last tool:', (agent.tools || []).slice(-1)[0]?.name);
    break;
  }
}
