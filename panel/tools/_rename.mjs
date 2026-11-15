import fs from 'node:fs';
const file = new URL('../mcp-server.mjs', import.meta.url);
let s = fs.readFileSync(file, 'utf8');
const map = {
  egglab_status: 'status',
  egglab_generate: 'generate',
  egglab_edit: 'edit',
  egglab_settings: 'settings',
  egglab_models: 'models',
  egglab_download_models: 'download_models',
  egglab_cancel: 'cancel',
};
for (const [from, to] of Object.entries(map)) {
  s = s.split(`'${from}'`).join(`'${to}'`);
}
fs.writeFileSync(file, s);
console.log('renamed', Object.keys(map).length, 'tool names');
