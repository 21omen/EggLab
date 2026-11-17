#!/usr/bin/env node
/**
 * EggLab MCP server.
 *
 * OpenCode spawns this process; it is a thin JSON-RPC bridge to the EggLab
 * panel HTTP service, which owns the engine, the model downloads and the live
 * PhotoCraft session. Keeping the logic in the panel means the chat agent and
 * the UI always drive exactly the same state.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PANEL_DIR = path.dirname(fileURLToPath(import.meta.url));

// The v2 knowledge package is read-only and allowlisted. Keeping the resolver
// here (not in the prompt) is what makes lazy loading real: the model can only
// see skill metadata until it asks for one specific file.
const KNOWLEDGE_FILES = new Set(['AGENT.md', 'ROUTER.md', 'manifest.yaml']);
const KNOWLEDGE_DIRS = ['skills', 'references', 'templates', 'config', 'evals'];
const KNOWLEDGE_MAX_BYTES = 512 * 1024;

function readKnowledge(requested) {
  const rel = String(requested || '')
    .replace(/\\/g, '/')
    .trim()
    .replace(/^\.\//, '');
  if (!rel) return { ok: false, error: 'not_found', message: 'path is required' };

  const abs = path.resolve(PANEL_DIR, rel);
  const norm = path.relative(PANEL_DIR, abs).replace(/\\/g, '/');
  if (!norm || norm.startsWith('..') || path.isAbsolute(norm)) {
    return { ok: false, error: 'not_allowlisted', path: rel };
  }
  const allowed = KNOWLEDGE_FILES.has(norm) || KNOWLEDGE_DIRS.some((dir) => norm.startsWith(`${dir}/`));
  if (!allowed) return { ok: false, error: 'not_allowlisted', path: norm };
  if (!/\.(md|ya?ml|txt)$/i.test(norm)) return { ok: false, error: 'unsupported_type', path: norm };

  // Resolve symlinks so an allowlisted-looking file cannot point outside the package.
  let real;
  try {
    real = fs.realpathSync(abs);
  } catch {
    return { ok: false, error: 'not_found', path: norm };
  }
  const realRel = path.relative(fs.realpathSync(PANEL_DIR), real);
  if (!realRel || realRel.startsWith('..') || path.isAbsolute(realRel)) {
    return { ok: false, error: 'not_allowlisted', path: norm };
  }

  let stat;
  try {
    stat = fs.statSync(abs);
  } catch {
    return { ok: false, error: 'not_found', path: norm };
  }
  if (!stat.isFile()) return { ok: false, error: 'not_found', path: norm };
  if (stat.size > KNOWLEDGE_MAX_BYTES) {
    return { ok: false, error: 'too_large', path: norm, bytes: stat.size, limit: KNOWLEDGE_MAX_BYTES };
  }
  return { ok: true, path: norm, bytes: stat.size, text: fs.readFileSync(abs, 'utf8') };
}


const BASE = process.env.EGGLAB_URL;
const TOKEN = process.env.EGGLAB_TOKEN;

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    handle(msg).catch(() => {});
  }
});

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function ok(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function fail(id, message, code = -32000) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

// node:http, not fetch: undici enforces a 300 s headers timeout, which killed a
// ~6-min quality edit at the tool layer (325 s observed) while the engine kept
// rendering. The socket timeout here matches the panel's own 30-minute ceiling.
const BASE_URL = BASE ? new URL(BASE) : null;

async function api(method, route, body) {
  if (!BASE) throw new Error('EGGLAB_URL is not set for the MCP server');
  const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: BASE_URL.hostname,
        port: BASE_URL.port,
        path: route,
        method,
        headers: {
          'x-egglab-token': TOKEN || '',
          ...(payload ? { 'content-type': 'application/json', 'content-length': payload.length } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch {}
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(json?.error || text || `EggLab HTTP ${res.statusCode}`));
            return;
          }
          resolve(json);
        });
      },
    );
    req.setTimeout(1_800_000, () => req.destroy(new Error('EggLab request timed out after 30 min.')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitJob(id, timeoutMs = 1_800_000) {
  const start = Date.now();
  for (;;) {
    const { job } = await api('GET', `/api/jobs/${encodeURIComponent(id)}`);
    if (!job) throw new Error(`Unknown job ${id}`);
    // 'queued' is a normal state when several renders are submitted together —
    // the engine runs them strictly serially. Only done/error/canceled settle.
    if (job.status !== 'running' && job.status !== 'queued') return job;
    if (Date.now() - start > timeoutMs) throw new Error('Render timed out');
    await sleep(1500);
  }
}

function summary(job) {
  return {
    status: job.status,
    path: job.outPath,
    seed: job.seed,
    workflow: job.workflow,
    size: `${job.width}x${job.height}`,
    sizeCapped: job.sizeCapped || undefined,
    steps: job.steps,
    cfg: job.cfg,
    seconds: Math.round(job.elapsedMs / 1000),
    transparent: job.transparent,
    alpha: job.alpha
      ? {
          verdict: job.alpha.verdict,
          transparentPct: job.alpha.transparentPct,
          opaquePct: job.alpha.opaquePct,
          partialPct: job.alpha.partialPct,
          minAlpha: job.alpha.minAlpha,
          maxAlpha: job.alpha.maxAlpha,
          subjectBounds: job.alpha.subjectBounds,
          subjectTouchesEdge: job.alpha.subjectTouchesEdge,
        }
      : undefined,
    error: job.status === 'done' ? undefined : job.error || undefined,
  };
}

const tools = [
  {
    name: 'status',
    description:
      'Live EggLab state in one compact call: engine ready, model files present, current workflow/steps/cfg/size, PhotoCraft connection and open document. Call once at the start of a turn; do not re-check what you already know. Pass full:true for the complete model/settings dump.',
    inputSchema: {
      type: 'object',
      properties: {
        full: { type: 'boolean', description: 'Return the entire status payload (large). Defaults to a compact summary.' },
      },
    },
  },
  {
    name: 'read_knowledge',
    description:
      'Read one allowlisted EggLab v2 knowledge file (read-only). Pass a package-relative path exactly as named in ROUTER.md or manifest.yaml, e.g. "skills/design-direction/SKILL.md" or "references/engine/qwen-image-2.1-legacy-facts.md". Readable roots: skills/, references/, templates/, config/, evals/ plus AGENT.md, ROUTER.md, manifest.yaml. Load a skill body only after routing selects it, and a reference only when the next concrete decision needs it; never dump the whole library. Errors are compact: not_found, not_allowlisted, unsupported_type, too_large.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Package-relative path with forward slashes.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'generate',
    description:
      'Generate an image with Qwen-Image-2.1 and wait for the PNG. Three uses: a full scene/backdrop (text-to-image, describe the whole frame, leave empty space where type will go), a transparent asset (transparent=true, native RGBA cut-out for a product, person, prop, icon or graphic element), or a background plate for compositing. Returns path, seed, duration and — for transparent jobs — measured alpha stats (verdict cutout/opaque, percentages, subject bounds, edge contact). Never assume a transparent render worked; read alpha. Steps/CFG come from the panel settings (quality for final art, turbo for tests).',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Full description of the finished image. For transparent assets the panel wraps it in the official RGBA template, so describe only the subject.' },
        workflow: { type: 'string', enum: ['quality', 'turbo'], description: 'quality = 40 steps, final art and anything with alpha edges; turbo = 8 steps, contact sheets, composition and light tests.' },
        width: { type: 'integer', description: 'Pixels, multiple of 32; 256–2048 (the service caps at 2048). Size the asset will occupy in the layout (or 1.5x), NOT the canvas size; floor 512 for anything bearing text. Render time scales with area.' },
        height: { type: 'integer', description: 'Pixels, multiple of 32; 256–2048 (the service caps at 2048). Match the element\'s aspect, not the canvas\'.' },
        steps: { type: 'integer' },
        seed: { type: 'integer', description: 'Reuse a seed to iterate one variable; change it to explore.' },
        transparent: { type: 'boolean' },
        count: { type: 'integer', description: '1-4 images, sequentially. Use 2-4 turbo variants to pick a direction before rendering the winner at quality.' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'edit',
    description:
      'Edit one or more reference images with Qwen-Image-2.1. Two modes: (A) change THIS picture — remove/replace/recolour/retouch/relight — write a short imperative plus one blanket preserve clause, one logical change per pass; (B) a NEW picture of this subject — place the person/product into a designed scene, build a poster or campaign frame — construct the scene actively and lock identity to the reference. Multi-reference: <image1> is the canvas whose framing survives, <image2>+ are donors; tag every input and state each role. One image: no tags. Use use_active_layer=true to edit the selected PhotoCraft layer, or prefer photocraft_edit_active with region for local work. Set transparent=true when the deliverable is a cut-out.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The change first, then what must stay unchanged. Never describe preserved things in detail — that makes them drift.' },
        images: { type: 'array', items: { type: 'string' }, description: 'Absolute paths to reference images (1-10). Order is the order the model sees: <image1>, <image2>, …' },
        use_active_layer: { type: 'boolean', description: 'Export the selected PhotoCraft layer and use it as the first reference.' },
        workflow: { type: 'string', enum: ['quality', 'turbo'] },
        width: { type: 'integer', description: 'Pixels, multiple of 32; 256–2048 (service caps at 2048). Default: follow the source aspect, capped at 1024 long side.' },
        height: { type: 'integer', description: 'Pixels, multiple of 32; 256–2048 (service caps at 2048).' },
        steps: { type: 'integer' },
        seed: { type: 'integer' },
        transparent: { type: 'boolean', description: 'Return a transparent RGBA cut-out instead of an opaque background.' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'settings',
    description: 'Read or update panel defaults (workflow, steps, cfg, aspect, size, transparent, seed lock, offload). Omit patch to read.',
    inputSchema: {
      type: 'object',
      properties: {
        patch: {
          type: 'object',
          description: 'Shallow patch, e.g. {"workflow":"turbo","aspect":"16:9","transparent":true}',
          additionalProperties: true,
        },
      },
    },
  },
  {
    name: 'models',
    description: 'Model inventory: which of DiT, VAE, text encoder, vision projector and Turbo LoRA are present, with sizes and download state.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'download_models',
    description: 'Download missing model files from Hugging Face and wait until they finish. ids: diffusion, vae, llm, mmproj, turbo.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string', enum: ['diffusion', 'vae', 'llm', 'mmproj', 'turbo'] } },
        variant: { type: 'string', description: 'Optional diffusion variant id: q4km-beta, uc-q5km or uc-fp8.' },
      },
      required: ['ids'],
    },
  },
  {
    name: 'cancel',
    description: 'Cancel a running render job.',
    inputSchema: { type: 'object', properties: { job_id: { type: 'string' } }, required: ['job_id'] },
  },
  {
    name: 'photocraft_launch',
    description: 'Launch PhotoCraft with the EggLab control port if it is not running.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'photocraft_layers',
    description: 'Layer tree of the active document: ids, names, bounds, visibility, active layer.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'photocraft_place',
    description:
      'Place an image file into the active document as a new pixel layer with its alpha preserved. Give it a short, meaningful layer name.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        name: { type: 'string', description: 'Layer name shown in the PhotoCraft layers panel.' },
        fit: { type: 'boolean', description: 'Scale down to fit the canvas.' },
        scale: { type: 'number', description: 'Percent scale.' },
        center: { type: 'array', items: { type: 'number' }, description: '[x, y] document pixels for the centre of the new layer.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'photocraft_canvas',
    description: "Show the agent what the current PhotoCraft canvas looks like. Returns a PNG path of the full composite canvas (all visible layers flattened). Use this before editing or placing so you know the exact current state — text position, colors, layout, what's already on canvas. The returned path is a local file the panel can attach as a reference image.",
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'photocraft_audit',
    description:
      'Measure the composite instead of guessing: real ink margins in document pixels, which sides touch the frame, palette shares, luminance range (p2..p98) and text-on-text collisions. Use it with the canvas — the canvas shows the look, the audit gives the numbers. Cheap, read-only, no renders.',
    inputSchema: {
      type: 'object',
      properties: {
        max_side: { type: 'integer', description: 'Composite sample size, default 1024.' },
      },
    },
  },
  {
    name: 'photocraft_new_document',
    description:
      'Create a new PhotoCraft document and make it the active one. Returns {document:index, activated:true}; if activated is false, call photocraft_command {id:"document.activate",params:{document}} before placing anything.',
    inputSchema: {
      type: 'object',
      properties: {
        width: { type: 'integer' },
        height: { type: 'integer' },
        background: { type: 'string', description: 'white | black | transparent | #rrggbb' },
        name: { type: 'string' },
      },
      required: ['width', 'height'],
    },
  },
  {
    name: 'photocraft_export_flat',
    description:
      'Flatten the visible composite and save it as ONE PNG the user keeps (the normal deliverable for a poster, ad or story). Pass an absolute dir and a name; the project file path is untouched. Use this instead of exporting layers unless the handoff really is an editable stack.',
    inputSchema: {
      type: 'object',
      properties: {
        dir: { type: 'string', description: 'Absolute output directory.' },
        name: { type: 'string', description: 'File name without extension; defaults to the document name.' },
        overwrite: { type: 'boolean', description: 'Replace an existing file (default true).' },
      },
      required: ['dir'],
    },
  },
  {
    name: 'photocraft_export_layers',
    description:
      'Export every top-level layer of the active document to its own PNG, alpha preserved. This is the deliverable exporter: pass an absolute dir the user keeps (e.g. the renders folder). Returns {files:[absolute paths]}.',
    inputSchema: {
      type: 'object',
      properties: {
        dir: {
          type: 'string',
          description: 'Absolute output directory, or a path under the write root. Defaults to a scratch folder — always set it for real deliverables.',
        },
        visible_only: { type: 'boolean' },
      },
    },
  },
  {
    name: 'check_alpha',
    description:
      'Measure a PNG\'s alpha channel: verdict (cutout / opaque / empty), transparent/opaque/partial percentages, alpha range, subject bounds and whether the subject touches the frame edge. Use it after every transparent render and on any exported layer before you rely on it: a transparent render can silently come back fully opaque.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Absolute path to a PNG.' } },
      required: ['path'],
    },
  },
  {
    name: 'photocraft_edit_active',
    description:
      'Edit the layer selected in PhotoCraft: exports it, runs the edit, places the result back at the same bounds and hides the original. Pass region:[x,y,w,h] (document pixels) for a LOCAL edit — only that rectangle is edited and the rest of the layer is untouched. Use a region whenever the change is one object, one label or one area; the model is far more reliable on a tight crop. A region edit must never come back with a visible rectangle: mode:"crop" (default) feathers the patch back in over `feather` px (raise it if you can see an edge), mode:"inpaint" repaints the whole layer through a soft mask so no seam can exist — use it on flat areas such as sky, walls and skin. Read all four borders of the region before you report the edit done.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        region: {
          type: 'array',
          items: { type: 'number' },
          description: '[x, y, width, height] in document pixels. Omit to edit the whole layer.',
        },
        mode: {
          type: 'string',
          enum: ['crop', 'inpaint'],
          description:
            'How a region edit is applied. "crop" (default) edits a tight crop and feathers the result back in over ~48 px — fast, and everything outside the feather band stays byte-identical. "inpaint" hands the whole layer plus a soft-edged mask to the engine (--init-img --mask --strength), so the model repaints one continuous canvas and no seam can exist — use it when a flat area (sky, wall, skin) would expose a blend line, accepting a slight drift over the whole layer. Both replace the old hard rectangle.',
        },
        feather: {
          type: 'integer',
          description:
            'Blend band in pixels beyond the region edge (default 48, max 256, 0 = hard edge). Raise it — do not lower it — if any edge is still visible; the model needs room to blend, not a surgical strip.',
        },
        strength: {
          type: 'number',
          description: 'mode:"inpaint" only — denoising strength 0.05..1 (default 0.4). Low preserves the source; retouch and tonal passes want 0.25-0.5.',
        },
        workflow: { type: 'string', enum: ['quality', 'turbo'] },
        steps: { type: 'integer' },
        seed: { type: 'integer' },
        replace: { type: 'boolean', description: 'Hide the original layer (default true; ignored for a region edit).' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'photocraft_command',
    description: 'Run a raw PhotoCraft engine command by id with params (948 commands). Use only when no dedicated tool fits.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, params: { type: 'object', additionalProperties: true } },
      required: ['id'],
    },
  },
  {
    name: 'photocraft_batch',
    description:
      'Run several PhotoCraft commands in one call, in order, stopping at the first error. Use this to build a whole layout in a single round trip instead of ten: pass type.create, shape.create, layer.* steps as {id,params}, or {id:"place",params:{path,name,fit}} to drop an image into the same stack. Returns {ok_count, failed, first_failed?, not_run?, results:[{i,id,ok,error?}]}: failed is a COUNT of failed steps (0 when all pass), first_failed the index of the first failure, not_run how many steps were skipped after an early stop.',
    inputSchema: {
      type: 'object',
      properties: {
        commands: {
          type: 'array',
          description: 'Commands to run in order.',
          items: {
            type: 'object',
            properties: { id: { type: 'string' }, params: { type: 'object', additionalProperties: true } },
            required: ['id'],
          },
        },
        continue_on_error: { type: 'boolean', description: 'Keep going after a failure (default false).' },
      },
      required: ['commands'],
    },
  },
  {
    name: 'photocraft_commands',
    description:
      'Look up PhotoCraft commands that are NOT documented in your instructions. Search by word ("mask", "adjustment", "text") to discover ids, or pass ids for exact params. One round trip, so use it only for genuinely unknown commands — type, shape, layer, mask, group, adjustment, export and batch are already documented.',
    inputSchema: {
      type: 'object',
      properties: {
        filter: { type: 'string', description: 'Case-insensitive substring matched against command id, label and menu. e.g. "layer.mask", "adjustment", "type".' },
        ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Exact command ids to describe, e.g. ["layer.setProps","type.create"]. Overrides filter.',
        },
        limit: { type: 'number', description: 'Max results in search mode (default 40, max 200).' },
      },
    },
  },
  {
    name: 'photocraft_export_layer',
    description:
      'Export ONE layer to a temporary reference PNG for @mention or vision use (alpha preserved). It is written to the panel scratch folder and cleaned up — never hand this path to the user as a deliverable. For a file the user keeps, use photocraft_export_layers with an absolute dir.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Exact layer name as shown in PhotoCraft.' },
      },
      required: ['name'],
    },
  },
  {
    name: 'photocraft_export_layers_by_mentions',
    description: 'Resolve multiple @layerName mentions to exported PNG files. Returns which mentions resolved and which failed.',
    inputSchema: {
      type: 'object',
      properties: {
        names: { type: 'array', items: { type: 'string' }, description: 'Layer names mentioned with @.' },
      },
      required: ['names'],
    },
  },
  {
    name: 'photocraft_project',
    description:
      'Project state: active document (name, path, size, revision, dirty), every open document, and recent project files. Call before saving or when you need to know whether work is unsaved.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'photocraft_save',
    description:
      'Save the active PhotoCraft document. With no path it saves to the document\'s own file (refuses if never saved). With a path it saves a copy there (must be under the write root). ALWAYS save after placing or editing layers — otherwise the work is lost when PhotoCraft closes.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'Optional target under the write root, e.g. "projects/my-art/my-art.pcraft". Omit to save the document in place.',
        },
        name: {
          type: 'string',
          description:
            'Project name when no path is given: the panel picks projects/<slug>/<slug>.pcraft for you and saves there.',
        },
      },
    },
  },
  {
    name: 'photocraft_open',
    description: 'Open a PhotoCraft project or image file (path under the read root). Returns the opened document name and path.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'e.g. "projects/my-art/my-art.pcraft"' } },
      required: ['path'],
    },
  },
  {
    name: 'photocraft_recent_projects',
    description: 'List recent .pcraft / .psd / .psb files under the project root, newest first.',
    inputSchema: { type: 'object', properties: { limit: { type: 'integer' } } },
  },
];

async function callTool(name, args = {}) {
  switch (name) {
    case 'status': {
      const full = await api('GET', '/api/status');
      if (args.full) return full;
      // The raw status is ~5 KB of model variants the agent almost never needs.
      // Return the decision-relevant facts; `full: true` gets the rest.
      const e = full.engine || {};
      const s = full.settings || {};
      const pc = full.photocraft || {};
      const models = e.models || {};
      const missing = Object.entries(models)
        .filter(([, present]) => !present)
        .map(([key]) => key);
      const wf = e.workflows?.[s.workflow] || {};
      return {
        engine: { ready: !!e.ready, editReady: !!e.editReady },
        models: missing.length ? { missing } : 'all present',
        workflow: s.workflow,
        steps: wf.steps ?? null,
        cfg: wf.cfg ?? null,
        size: `${s.width}x${s.height}`,
        transparentDefault: !!s.transparent,
        photocraft: {
          running: !!pc.running,
          version: pc.version || null,
          document: pc.document || null,
        },
        busy: !!full.chat?.busy,
        note: 'Compact status. Pass full:true only if you need the full model/settings dump.',
      };
    }

    case 'read_knowledge':
      return readKnowledge(args.path);

    case 'generate': {
      const count = Math.min(4, Math.max(1, Number(args.count) || 1));
      const outputs = [];
      for (let i = 0; i < count; i++) {
        const seed =
          args.seed === undefined || args.seed === null
            ? undefined
            : Number(args.seed) + i;
        const { job } = await api('POST', '/api/jobs', {
    // Tags the job as agent-started: the panel refuses these when no chat
    // turn is active, so a tool call still in flight after Stop cannot render.
    source: 'agent',
          prompt: args.prompt,
          workflow: args.workflow,
          width: args.width,
          height: args.height,
          steps: args.steps,
          seed,
          transparent: Boolean(args.transparent),
        });
        const done = await waitJob(job.id);
        if (done.status !== 'done') {
          return { ok: false, generated: outputs, failed: summary(done), error: done.error || 'Generation failed.' };
        }
        outputs.push(summary(done));
      }
      return { ok: true, generated: outputs, prompt: args.prompt };
    }

    case 'edit': {
      let images = Array.isArray(args.images) ? args.images.slice() : [];
      let layer = null;
      if (args.use_active_layer) {
        const exported = await api('POST', '/api/photocraft/export-active');
        images = [exported.path, ...images];
        layer = exported.layer || null;
      }
      if (!images.length) throw new Error('egglab_edit needs images or use_active_layer=true.');
      const { job } = await api('POST', '/api/jobs', {
    // Tags the job as agent-started: the panel refuses these when no chat
    // turn is active, so a tool call still in flight after Stop cannot render.
    source: 'agent',
        prompt: args.prompt,
        images,
        workflow: args.workflow,
        width: args.width,
        height: args.height,
        steps: args.steps,
        seed: args.seed,
        transparent: Boolean(args.transparent),
      });
      const done = await waitJob(job.id);
      return {
        ok: done.status === 'done',
        edited: summary(done),
        references: images,
        layer,
        error: done.status === 'done' ? undefined : done.error || undefined,
      };
    }

    case 'check_alpha':
      if (!args.path) throw new Error('path is required');
      return await api('POST', '/api/check/alpha', { path: args.path });

    case 'settings':
      if (!args.patch) return await api('GET', '/api/settings');
      return await api('PATCH', '/api/settings', { patch: args.patch });

    case 'models':
      return await api('GET', '/api/models');

    case 'download_models': {
      const ids = [...new Set(Array.isArray(args.ids) ? args.ids : [])];
      if (!ids.length) throw new Error('ids is required');
      await api('POST', '/api/models/download', { ids, variant: args.variant });
      const deadline = Date.now() + 3_600_000;
      for (;;) {
        const status = await api('GET', '/api/models');
        const requested = ids
          .map((id) => status.entries.find((e) => e.id === id))
          .filter(Boolean);
        const unknown = ids.filter((id) => !requested.some((e) => e.id === id));
        const active = requested.filter(
          (e) => e.download && (e.download.status === 'running' || e.download.status === 'queued'),
        );
        const failed = requested.filter((e) => e.download && e.download.status === 'error');
        const missing = requested.filter((e) => !e.exists);
        const snapshot = requested.map((e) => ({
          id: e.id,
          file: e.file,
          exists: e.exists,
          size: e.sizeText,
          download: e.download?.status || null,
          error: e.download?.error || undefined,
        }));
        if (!active.length) {
          if (unknown.length) {
            return { ok: false, error: `Unknown model id(s): ${unknown.join(', ')}`, models: snapshot };
          }
          if (!missing.length) return { ok: true, models: snapshot };
          const reason =
            failed[0]?.download?.error ||
            `Download did not complete: ${missing.map((e) => e.file).join(', ')}`;
          return { ok: false, error: reason, models: snapshot };
        }
        if (Date.now() > deadline) {
          return {
            ok: false,
            pending: true,
            error: 'Download still running after 60 minutes. Check the Models panel and retry if needed.',
            models: snapshot,
          };
        }
        await sleep(2000);
      }
    }

    case 'cancel':
      return await api('POST', `/api/jobs/${encodeURIComponent(args.job_id)}/cancel`);

    case 'photocraft_launch':
      return await api('POST', '/api/photocraft/launch');

    case 'photocraft_layers':
      return await api('POST', '/api/photocraft/layers');

    case 'photocraft_place':
      return await api('POST', '/api/photocraft/place', {
        path: args.path,
        name: args.name,
        fit: args.fit,
        scale: args.scale,
        center: args.center,
      });

    case 'photocraft_canvas':
      return await api('POST', '/api/photocraft/preview', {});

    case 'photocraft_audit':
      return await api('POST', '/api/photocraft/audit', { maxSide: args.max_side });

    case 'photocraft_new_document':
      return await api('POST', '/api/photocraft/new-document', {
        width: args.width,
        height: args.height,
        background: args.background,
        name: args.name,
      });

    case 'photocraft_export_layers':
      return await api('POST', '/api/photocraft/export-layers', {
        dir: args.dir,
        visibleOnly: args.visible_only,
      });

    case 'photocraft_export_flat':
      return await api('POST', '/api/photocraft/export-flat', {
        dir: args.dir,
        name: args.name,
        overwrite: args.overwrite,
      });

    case 'photocraft_edit_active':
      return await api('POST', '/api/photocraft/edit-active', {
        prompt: args.prompt,
        region: args.region,
        mode: args.mode,
        feather: args.feather,
        strength: args.strength,
        workflow: args.workflow,
        steps: args.steps,
        seed: args.seed,
        replace: args.replace,
      });

    case 'photocraft_command':
      return await api('POST', '/api/photocraft/command', { id: args.id, params: args.params || {} });

    case 'photocraft_batch': {
      const list = Array.isArray(args.commands) ? args.commands : [];
      const results = [];
      // A batch step is a command id, except `place`, which is a tool but has to
      // run in the same ordered stack as the type and shapes.
      const runStep = async (step) =>
        step.id === 'place' || step.id === 'photocraft_place'
          ? api('POST', '/api/photocraft/place', step.params || {})
          : api('POST', '/api/photocraft/command', { id: step.id, params: step.params || {} });
      for (let i = 0; i < list.length; i++) {
        const step = list[i] || {};
        try {
          const out = await runStep(step);
          const value = out && (out.result !== undefined ? out.result : out);
          results.push({
            i,
            id: step.id,
            ok: true,
            // Keep the payload tiny: ids and counts matter, whole documents do not.
            ...(value && typeof value === 'object'
              ? { id_out: value.id ?? value.layer ?? undefined, count: Array.isArray(value) ? value.length : undefined }
              : {}),
          });
        } catch (err) {
          results.push({ i, id: step.id, ok: false, error: String(err.message || err).slice(0, 300) });
          if (!args.continue_on_error) break;
        }
      }
      // Counts, not indexes: `failed: 3` must mean three failures, not "the
      // step at index 3 failed" — an agent reading it as a count makes the
      // wrong repair. The first failure's index and the number of steps that
      // never ran (early stop) are reported separately and explicitly.
      const failures = results.filter((r) => !r.ok);
      const notRun = Math.max(0, list.length - results.length);
      return {
        ok_count: results.filter((r) => r.ok).length,
        total: list.length,
        failed: failures.length,
        ...(failures.length ? { first_failed: failures[0].i } : {}),
        ...(notRun ? { not_run: notRun } : {}),
        results,
      };
    }

    case 'photocraft_commands':
      return await api('POST', '/api/photocraft/commands', {
        filter: args.filter || '',
        ids: args.ids || [],
        limit: args.limit,
      });

    case 'photocraft_export_layer':
      return await api('POST', '/api/photocraft/export-layer', { name: args.name });

    case 'photocraft_export_layers_by_mentions':
      return await api('POST', '/api/photocraft/export-layers-by-mentions', { names: args.names || [] });

    case 'photocraft_project':
      return await api('GET', '/api/photocraft/project');

    case 'photocraft_save': {
      if (!args.path && args.name) {
        const made = await api('POST', '/api/photocraft/project/path', { name: args.name });
        args.path = made.path;
      }
      return await api('POST', '/api/photocraft/project/save', { path: args.path });
    }

    case 'photocraft_open':
      return await api('POST', '/api/photocraft/project/open', { path: args.path });

    case 'photocraft_recent_projects':
      return await api(
        'GET',
        `/api/photocraft/project/recent${
          Number.isFinite(Number(args.limit)) && Number(args.limit) > 0
            ? `?limit=${encodeURIComponent(args.limit)}`
            : ''
        }`,
      );

    default:
      throw new Error(`Unknown tool ${name}`);
  }
}

// Session clock: every tool result carries _clock {elapsed_s, call_s} so the
// agent can see time passing. Stating a budget in the prompt alone does not work
// — agents cannot anticipate action durations; harness-side timing feedback cut
// budget overrun from 161% to 99.7% in arXiv:2610.10833.
const T0 = Date.now();

async function handle(msg) {
  if (msg.id === undefined || msg.id === null) return;
  const { id, method, params } = msg;

  if (method === 'initialize') {
    return ok(id, {
      protocolVersion: params?.protocolVersion || '2025-11-25',
      capabilities: { tools: {} },
      serverInfo: { name: 'egglab', version: '0.1.0' },
      instructions:
        'EggLab tools drive a local Qwen-Image-2.1 engine and a live PhotoCraft session. Start with egglab_status (compact). Decompose the piece into assets: generate transparent cut-outs for subjects (egglab_generate transparent=true, then read the returned alpha), full scenes or plates for fields, reference edits for anything derived from existing imagery (egglab_edit), and local fixes with egglab_photocraft_edit_active region:[x,y,w,h]. A region edit must never come back as a visible rectangle: pass mode:"inpaint" on flat areas (sky, wall, skin) or raise feather (48 -> 96 -> 160) if you can see an edge, and always read all four borders of the region before calling it done. Assemble bottom-up in PhotoCraft (new document, place, type, shape, adjustment layers), check with egglab_photocraft_audit, save, export. egglab_check_alpha measures any PNG. Look up unknown engine commands with egglab_photocraft_commands. Knowledge loads on demand: use egglab_read_knowledge for a skill body or reference only after ROUTER.md selects it.',
    });
  }
  if (method === 'ping') return ok(id, {});
  if (method === 'tools/list') return ok(id, { tools });
  if (method === 'resources/list') return ok(id, { resources: [] });
  if (method === 'prompts/list') return ok(id, { prompts: [] });
  if (method === 'tools/call') {
    const name = params?.name;
    const args = params?.arguments || {};
    try {
      const tCall = Date.now();
      const result = await callTool(name, args);
      const now = Date.now();
      const clock = {
        elapsed_s: Math.round((now - T0) / 1000),
        call_s: Math.round((now - tCall) / 1000),
      };
      const payload = result && typeof result === 'object' ? { ...result, _clock: clock } : result;
      return ok(id, {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
        isError: false,
      });
    } catch (err) {
      return ok(id, {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
        isError: true,
      });
    }
  }
  return fail(id, `Method not found: ${method}`, -32601);
}
