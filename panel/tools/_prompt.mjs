import fs from 'node:fs';
const a = fs.readFileSync(new URL('../agent/AGENT.md', import.meta.url), 'utf8');
const left = [...new Set([...a.matchAll(/\{\{[A-Z0-9_]+\}\}/g)].map((m) => m[0]))];
console.log('unsubstituted placeholders:', left.length ? left.join(', ') : 'none');
console.log('lines:', a.split('\n').length, '| bytes:', Buffer.byteLength(a));

const required = ['# EggLab', 'EggLab knowledge router', 'Knowledge package', 'Runtime snapshot'];
const missing = required.filter((needle) => !a.includes(needle));
console.log('required sections:', missing.length ? `MISSING ${missing.join(', ')}` : 'all present');

const manifest = fs.readFileSync(new URL('../manifest.yaml', import.meta.url), 'utf8');
const skills = [...manifest.matchAll(/^  - name:\s*(.+)$/gm)].map((m) => m[1].trim());
const absent = skills.filter((name) => !a.includes(`- ${name} —`));
console.log('skills indexed:', `${skills.length - absent.length}/${skills.length}`);
if (absent.length) console.log('skills missing from index:', absent.join(', '));

process.exit(left.length || missing.length || absent.length ? 1 : 0);
