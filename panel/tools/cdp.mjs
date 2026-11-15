// Minimal Chrome DevTools Protocol driver over the global WebSocket.
// Lets me inspect the live Electron renderer (DOM + console) without guessing.
const PORT = process.env.CDP_PORT || '9333';

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
const logs = [];
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
    return;
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    logs.push(`${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    logs.push(`EXCEPTION: ${msg.params.exceptionDetails.text} ${msg.params.exceptionDetails.exception?.description || ''}`);
  }
};

function call(method, params = {}) {
  const msgId = ++id;
  ws.send(JSON.stringify({ id: msgId, method, params }));
  return new Promise((res, rej) => pending.set(msgId, { res, rej }));
}

async function evalJs(expression) {
  const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}

await call('Runtime.enable');
await call('Page.enable');

const [expr] = process.argv.slice(2);
const out = await evalJs(expr);
console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 2));
if (logs.length) console.log('\n--- console ---\n' + logs.join('\n'));

ws.close();
process.exit(0);
