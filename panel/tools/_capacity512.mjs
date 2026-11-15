// Capacity probe: asks the InferX model for a one-token reply, so a busy
// endpoint can be detected in seconds without starting a whole agent turn.
// Reads the provider block from the global opencode config; never prints the key.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const cfg = path.join(os.homedir(), '.config', 'opencode', 'opencode.jsonc');
const raw = fs.readFileSync(cfg, 'utf8');
const baseURL = (raw.match(/"baseURL"\s*:\s*"([^"]+)"/) || [])[1];
const apiKey = (raw.match(/"apiKey"\s*:\s*"([^"]+)"/) || [])[1];
const model = process.argv[2] || 'deepseek-v4.1-flash-1017-basic';
if (!baseURL || !apiKey) {
  console.error('probe: could not read provider config');
  process.exit(2);
}

const started = Date.now();
try {
  const res = await fetch(`${baseURL.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 512,
      stream: false,
    }),
  });
  const text = (await res.text()).slice(0, 200).replace(/\s+/g, ' ');
  console.log(`${new Date().toISOString()} ${res.status} ${Date.now() - started}ms ${text}`);
  process.exit(res.ok ? 0 : 1);
} catch (err) {
  console.log(`${new Date().toISOString()} ERR ${Date.now() - started}ms ${err.message}`);
  process.exit(1);
}
