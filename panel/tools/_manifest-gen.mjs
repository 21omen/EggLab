// Regenerate MANIFEST-SHA256.txt for the static v2 knowledge package.
// Excludes runtime state and generated config (paths.yaml, runtime-profile.yaml).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const generated = new Set(['config/paths.yaml', 'config/runtime-profile.yaml']);
const roots = ['archive', 'config', 'evals', 'integration', 'migration', 'references', 'skills', 'templates'];
const files = ['AGENT.md', 'CHANGELOG.md', 'README.md', 'ROUTER.md', 'manifest.yaml'];

function walk(rel) {
  for (const entry of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const next = `${rel}/${entry.name}`;
    if (entry.isDirectory()) walk(next);
    else if (entry.isFile() && !generated.has(next)) files.push(next);
  }
}

for (const dir of roots) walk(dir);
files.sort();

const lines = files.map((rel) => {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex');
  return `${hash}  ${rel}`;
});
fs.writeFileSync(path.join(root, 'MANIFEST-SHA256.txt'), `${lines.join('\n')}\n`, 'utf8');
console.log(`MANIFEST-SHA256.txt: ${lines.length} files`);
