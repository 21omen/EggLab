// Faithful probe: same shape as a real agent turn (large prompt, streaming,
// tools present) so a 429 can be attributed to load rather than to request shape.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const cfg = path.join(os.homedir(), '.config', 'opencode', 'opencode.jsonc');
const raw = fs.readFileSync(cfg, 'utf8');
const baseURL = (raw.match(/"baseURL"\s*:\s*"([^"]+)"/) || [])[1];
const apiKey = (raw.match(/"apiKey"\s*:\s*"([^"]+)"/) || [])[1];
const model = process.argv[2] || 'deepseek-v4.1-flash-1017-basic';
const big = process.argv.includes('--small') ? '' : 'x '.repeat(6000); // ~12k chars

const tools = [
  {
    type: 'function',
    function: {
      name: 'probe_noop',
      description: 'Does nothing. Present so the request carries a tool schema.',
      parameters: { type: 'object', properties: { note: { type: 'string' } } },
    },
  },
];

const started = Date.now();
try {
  const res = await fetch(`${baseURL.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
      accept: 'text/event-stream',
    },
    body: JSON.stringify({
      model,
      stream: true,
      max_tokens: 32,
      tools,
      messages: [
        { role: 'system', content: 'You are a probe. Reply with one word.' },
        { role: 'user', content: `${big}\nReply with one word.` },
      ],
    }),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 160).replace(/\s+/g, ' ');
    console.log(`${res.status} after ${Date.now() - started}ms ${body}`);
    process.exit(1);
  }
  let bytes = 0;
  for await (const chunk of res.body) bytes += chunk.length;
  console.log(`200 stream ${Date.now() - started}ms ${bytes}b`);
} catch (err) {
  console.log(`ERR ${Date.now() - started}ms ${err.message}`);
  process.exit(1);
}
