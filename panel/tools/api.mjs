// Small helper to talk to the running EggLab panel from the shell.
// Uses node:http rather than fetch: undici enforces a 300 s headers timeout,
// which kills long agent turns even when the caller allows more.
import fs from 'node:fs';
import http from 'node:http';

const ctl = JSON.parse(fs.readFileSync(new URL('../control.json', import.meta.url), 'utf8'));
const base = new URL(ctl.url);

function request(method, route, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const req = http.request(
      {
        hostname: base.hostname,
        port: base.port,
        path: route,
        method,
        headers: {
          'x-egglab-token': ctl.token,
          ...(payload ? { 'content-type': 'application/json', 'content-length': payload.length } : {}),
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
    req.setTimeout(Math.max(1000, timeoutMs), () => req.destroy(new Error('Request timed out.')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

export async function api(method, route, body, timeoutMs = 900000) {
  if (!fs.existsSync(new URL('../control.json', import.meta.url))) throw new Error('Panel not running.');
  const c = JSON.parse(fs.readFileSync(new URL('../control.json', import.meta.url), 'utf8'));
  if (c.token !== ctl.token) {
    Object.assign(ctl, c);
    const u = new URL(c.url);
    base.hostname = u.hostname;
    base.port = u.port;
  }
  return request(method, route, body, timeoutMs);
}

if (process.argv[1] && import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const [method, route, raw] = process.argv.slice(2);
  const out = await api(method, route, raw ? JSON.parse(raw) : undefined);
  console.log(JSON.stringify(out, null, 2));
}
