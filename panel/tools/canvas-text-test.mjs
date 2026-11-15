// QA probe: text layer as reference + agent canvas vision.
//   1. launch PhotoCraft, make a document with a real type layer
//   2. export that text layer -> PNG with alpha (the @mention / Pick layer path)
//   3. render the whole canvas -> PNG (the Show canvas / photocraft_canvas path)
//   4. verify MCP advertises photocraft_canvas and dispatches it
// Run: node tools/canvas-text-test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { api } from './api.mjs';

const log = (...a) => console.log(...a);
const ok = (cond, msg) => {
  log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) process.exitCode = 1;
};

const step = async (name, fn) => {
  try {
    return await fn();
  } catch (err) {
    log(`FAIL  ${name}: ${err.message}`);
    throw err;
  }
};

log('--- EggLab: text-layer reference + canvas vision probe ---');

// 1. PhotoCraft up
const launched = await step('launch', () => api('POST', '/api/photocraft/launch', {}));
log('launch:', JSON.stringify(launched).slice(0, 200));

const status = await step('status', () => api('GET', '/api/status'));
ok(status?.photocraft?.running, 'PhotoCraft is running');

// 2. fresh document
await step('new-document', () =>
  api('POST', '/api/photocraft/new-document', {
    width: 640,
    height: 480,
    background: 'white',
    name: 'EggLab canvas-test',
  }),
);

// 3. a real type layer
const created = await step('type.create', () =>
  api('POST', '/api/photocraft/command', {
    id: 'type.create',
    params: {
      x: 320,
      y: 260,
      text: 'EGGLAB',
      font: 'Arial',
      size: 110,
      align: 'center',
      color: '#111111',
      name: 'Headline',
    },
  }),
);
log('type.create ->', JSON.stringify(created).slice(0, 240));

// 4. layer list must contain a type layer named Headline
const layers = await step('layers', () => api('POST', '/api/photocraft/layers', {}));
const flat = [];
const walk = (list) => {
  for (const l of list || []) {
    flat.push(l);
    if (l.children) walk(l.children);
  }
};
walk(layers?.layers);
const headline = flat.find((l) => l.name === 'Headline');
ok(Boolean(headline), 'document has a type layer named "Headline"');
ok(String(headline?.kind || '').toLowerCase() === 'type', `layer kind is "type" (got ${headline?.kind})`);
log('layers:', flat.map((l) => `${l.name}[${l.kind}]`).join(', '));

// 5. export the text layer (what @Headline / Pick layer does)
const exported = await step('export-layer', () =>
  api('POST', '/api/photocraft/export-layer', { name: 'Headline' }),
);
ok(Boolean(exported?.path), 'text layer exported to a PNG path');
ok(fs.existsSync(exported.path), `exported file exists (${exported.path})`);
const size = exported.path && fs.existsSync(exported.path) ? fs.statSync(exported.path).size : 0;
ok(size > 0, `exported PNG is not empty (${size} bytes)`);
log('exported:', exported.path, size, 'bytes');

// 6. whole-canvas render (what Show canvas / photocraft_canvas does)
const preview = await step('preview', () => api('POST', '/api/photocraft/preview', { maxSide: 800 }));
ok(Boolean(preview?.path), 'canvas preview returned a PNG path');
ok(preview.path && fs.existsSync(preview.path), `canvas PNG exists (${preview.path})`);
const psize = preview.path && fs.existsSync(preview.path) ? fs.statSync(preview.path).size : 0;
ok(psize > 0, `canvas PNG is not empty (${psize} bytes)`);
log('canvas:', preview.path, psize, 'bytes');

// 7. MCP surface advertises + dispatches photocraft_canvas
const mcp = fs.readFileSync(path.join(import.meta.dirname, '..', 'mcp-server.mjs'), 'utf8');
ok(/name:\s*'photocraft_canvas'/.test(mcp), 'MCP tool list declares photocraft_canvas');
ok(/case 'photocraft_canvas':/.test(mcp), 'MCP dispatch handles photocraft_canvas');

// 8. both fixtures live under the panel's tmp dir (so the renderer can show them)
ok(/EggLab/.test(exported.path), 'exported PNG is inside the EggLab workspace');
ok(/EggLab/.test(preview.path), 'canvas PNG is inside the EggLab workspace');

log('--- done ---');
