// Captures the running panel's viewport to docs/panel.png (2x, for the README).
// Usage: CDP_PORT=9334 node tools/shot.mjs
import fs from 'node:fs';
import path from 'node:path';

const port = process.env.CDP_PORT || '9334';
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
if (!page) throw new Error('no page target on CDP port ' + port);

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

let seq = 0;
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++seq;
    const onMessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id !== id) return;
      ws.removeEventListener('message', onMessage);
      resolve(msg.result);
    };
    ws.addEventListener('message', onMessage);
    ws.send(JSON.stringify({ id, method, params }));
  });

await send('Page.enable');
const metrics = await send('Page.getLayoutMetrics');
const size = metrics.cssContentSize || metrics.contentSize;
const shot = await send('Page.captureScreenshot', {
  format: 'png',
  captureBeyondViewport: true,
  clip: { x: 0, y: 0, width: size.width, height: size.height, scale: 2 },
});
const out = path.join(process.cwd(), '..', 'docs', 'panel.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
console.log('saved', out, Math.round(size.width), 'x', Math.round(size.height), '@2x');
ws.close();
