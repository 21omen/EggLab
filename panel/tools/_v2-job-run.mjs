// Run one real creative job through the panel's normal chat path.
// Writes the full result to tools/_v2-job-result.json for scoring.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const PANEL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const control = JSON.parse(fs.readFileSync(path.join(PANEL_DIR, 'control.json'), 'utf8'));
const briefFile = process.argv[2] || 'tools/_v2-job-brief.txt';
const resultFile = process.argv[3] || 'tools/_v2-job-result.json';
const brief = fs.readFileSync(path.join(PANEL_DIR, briefFile), 'utf8').trim();
const base = new URL(control.url);

function post(route, body) {
  const payload = Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: base.hostname,
        port: base.port,
        path: route,
        method: 'POST',
        headers: {
          'x-egglab-token': control.token,
          'content-type': 'application/json',
          'content-length': payload.length,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {}
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(json?.error || text || `HTTP ${res.statusCode}`));
            return;
          }
          resolve(json);
        });
      },
    );
    req.setTimeout(1_700_000, () => req.destroy(new Error('Job timed out after ~28 min.')));
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

const started = Date.now();
console.log(`brief: ${brief.split('\n')[0]}`);
console.log(`panel: ${control.url}`);
let result;
try {
  result = await post('/api/chat', { text: brief, files: [], refMap: {} });
} catch (err) {
  console.error(`RUN ERROR: ${err.message}`);
  process.exit(1);
}
const seconds = Math.round((Date.now() - started) / 1000);
const item = result?.item || null;
fs.writeFileSync(
  path.join(PANEL_DIR, resultFile),
  JSON.stringify({ brief, panel: control.url, seconds, item }, null, 2),
  'utf8',
);

const tools = item?.tools || [];
console.log(`finished in ${seconds}s; tools: ${tools.length}`);
for (const tool of tools) {
  console.log(`  ${tool.status || '?'}  ${tool.name}${tool.arg ? `  ${String(tool.arg).slice(0, 120)}` : ''}`);
}
console.log('');
console.log(item?.text || '(empty reply)');
if (item?.error) console.log(`\nERROR: ${item.error}`);
