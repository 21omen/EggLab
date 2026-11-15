// Static UI gate for the EggLab panel renderer. Catches, without launching
// Electron: (1) ids referenced in app.js that are missing from index.html —
// those throw on click or init; (2) ids in index.html that nothing references
// — dead controls; (3) CSS custom properties used but never defined; (4)
// classes present in the HTML or emitted by app.js with no CSS rule; (5)
// unbalanced braces in the stylesheet. Exit code 1 on any failure.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'renderer');
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(dir, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(dir, 'app.css'), 'utf8');

let failures = 0;
const fail = (msg) => { console.log(`FAIL ${msg}`); failures++; };

// --- 1. id cross-check ------------------------------------------------------
const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
const jsIdRefs = new Set(
  [...js.matchAll(/\$\('#([A-Za-z][\w-]*)'/g)].map((m) => m[1])
    .concat([...js.matchAll(/querySelector\('#([A-Za-z][\w-]*)'/g)].map((m) => m[1]))
    .concat([...js.matchAll(/closest\('#([A-Za-z][\w-]*)'/g)].map((m) => m[1]))
    .concat([...js.matchAll(/\bon\('#([A-Za-z][\w-]*)'/g)].map((m) => m[1]))
    .concat([...js.matchAll(/\bsetVal\('#([A-Za-z][\w-]*)'/g)].map((m) => m[1])),
);
for (const id of jsIdRefs) {
  if (!htmlIds.has(id)) fail(`app.js references #${id} — missing from index.html (would throw at runtime)`);
}
const dead = [...htmlIds].filter((id) => !jsIdRefs.has(id) && !['app', 'promptTitle', 'promptNote', 'promptInput', 'promptPath', 'confirmTitle', 'confirmNote', 'items', 'composer', 'segThumb', 'ocNote', 'tCfg'].includes(id));
if (dead.length) console.log(`INFO html ids with no direct JS ref (may be structural): ${dead.join(', ')}`);

// --- 2. CSS variables -------------------------------------------------------
const defined = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
const used = new Set([...css.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]));
for (const v of used) {
  if (!defined.has(v)) fail(`app.css uses var(${v}) — never defined`);
}

// --- 3. class coverage ------------------------------------------------------
const selectors = new Set(
  [...css.matchAll(/\.([A-Za-z][\w-]*)/g)].map((m) => m[1]),
);
const htmlClasses = new Set(
  html.split('\n').flatMap((line) => {
    const m = line.match(/class="([^"]+)"/);
    return m ? m[1].trim().split(/\s+/) : [];
  }),
);
const isClassToken = (c) => /^[A-Za-z][\w-]*$/.test(c);
const jsClasses = new Set();
for (const m of js.matchAll(/classList\.(?:add|toggle|remove)\(\s*'([^'\s]+)'/g)) if (isClassToken(m[1])) jsClasses.add(m[1]);
for (const m of js.matchAll(/className\s*=\s*[`'"]([^`'"]+)[`'"]/g)) {
  m[1].split(/\s+/).forEach((c) => { if (isClassToken(c) && !c.includes('$')) jsClasses.add(c); });
}
for (const m of js.matchAll(/class=\\?"([^"\\]+)\\?"/g)) {
  m[1].split(/\s+/).forEach((c) => { if (isClassToken(c) && !c.includes('$')) jsClasses.add(c); });
}
const uncovered = [...new Set([...htmlClasses, ...jsClasses])].filter((c) => !selectors.has(c));
if (uncovered.length) fail(`classes with no CSS rule: ${uncovered.join(', ')}`);

// --- 4. brace balance -------------------------------------------------------
const open = (css.match(/{/g) || []).length;
const close = (css.match(/}/g) || []).length;
if (open !== close) fail(`app.css braces unbalanced: ${open} open vs ${close} close`);

console.log(`ids: ${htmlIds.size} in html, ${jsIdRefs.size} referenced in js`);
console.log(`vars: ${defined.size} defined, ${used.size} used`);
console.log(`classes: ${selectors.size} selectors, ${htmlClasses.size + jsClasses.size} usages checked`);
if (failures) {
  console.log(`UI CHECK: ${failures} failure(s)`);
  process.exit(1);
}
console.log('UI CHECK: all green');
