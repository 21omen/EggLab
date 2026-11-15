// Rebuild agent/AGENT.md from the v2 core (AGENT.md + ROUTER.md + skill index
// + live runtime snapshot) without restarting the panel. opencode reads the
// prompt file at process start, so the next run picks this up.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSystemPrompt } from '../service/chat.mjs';

const PANEL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGENT_DIR = path.join(PANEL_DIR, 'agent');
const prompt = buildSystemPrompt();

const left = [...new Set(prompt.match(/\{\{[A-Z0-9_]+\}\}/g) || [])];
if (left.length) {
  console.error('unsubstituted placeholders:', left.join(', '));
  process.exit(1);
}
fs.mkdirSync(AGENT_DIR, { recursive: true });
fs.writeFileSync(path.join(AGENT_DIR, 'AGENT.md'), prompt, 'utf8');
console.log(`AGENT.md rebuilt: ${prompt.split('\n').length} lines, ${Buffer.byteLength(prompt)} bytes`);
