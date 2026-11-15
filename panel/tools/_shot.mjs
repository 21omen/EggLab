// Capture the live Electron renderer. Usage:
//   node tools/_shot.mjs <expand|collapse|none> <output.png> [waitMs]
import fs from 'node:fs';

const PORT = process.env.CDP_PORT || '9333';
const [, , action = 'none', out = 'shot.png', waitArg] = process.argv;
const waitMs = Number(waitArg) || 700;

const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const page = list.find((t) => t.type === 'page');
if (!page) throw new Error('no page target');

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});

let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
  }
};

function call(method, params = {}) {
  const msgId = ++id;
  ws.send(JSON.stringify({ id: msgId, method, params }));
  return new Promise((res, rej) => pending.set(msgId, { res, rej }));
}

async function evalJs(expression) {
  const r = await call('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}

await call('Page.enable');
await call('Runtime.enable');

if (action === 'expand') {
  await evalJs('expandEgg()');
} else if (action === 'collapse') {
  await evalJs('collapseEgg()');
}
await new Promise((r) => setTimeout(r, waitMs));

const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));

const state = await evalJs(`(() => ({
  body: document.body.className,
  size: [innerWidth, innerHeight],
  expanded: typeof shell !== 'undefined' ? shell.expanded : null,
  panel: (() => { const el = document.querySelector('#eggPanel'); const s = getComputedStyle(el); return { opacity: s.opacity, visibility: s.visibility, rect: el.getBoundingClientRect().toJSON() }; })(),
  chat: document.querySelector('#chat').getBoundingClientRect().toJSON(),
  composer: document.querySelector('#composer').getBoundingClientRect().toJSON(),
}))()`);
console.log(JSON.stringify({ out, ...state }, null, 2));
ws.close();
process.exit(0);
