import fs from 'node:fs';
const file = new URL('../settings.json', import.meta.url);
const s = JSON.parse(fs.readFileSync(file, 'utf8'));
console.log(JSON.stringify(s.opencode, null, 2));
