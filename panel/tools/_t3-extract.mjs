// Pulls test #3 evidence out of the session transcript into one UTF-8 file:
// the full agent reply, the full layers + audit outputs, and the failed batch
// op. Console mangles UTF-8, so this file is read instead.
import fs from 'node:fs';

const t = JSON.parse(fs.readFileSync('D:/neww/EggLab/panel/chats/d_neww_projects_cocoa_line_midnight_70_wrapper_cocoa_line_midnight_70_wrapper_pc.json', 'utf8'));
const out = [];
for (const item of t.items) {
  if (item.role === 'agent') {
    out.push('=== FULL AGENT REPLY ===\n' + item.text + '\n');
    for (const tool of item.tools || []) {
      if (tool.name === 'egglab_photocraft_layers') out.push('=== LAYERS OUTPUT (full) ===\n' + tool.output + '\n');
      if (tool.name === 'egglab_photocraft_audit') out.push('=== AUDIT OUTPUT (full) ===\n' + tool.output + '\n');
      if (tool.name === 'egglab_photocraft_batch' && /"failed": 1/.test(tool.output)) out.push('=== SECOND BATCH (failed op) ===\n' + tool.output + '\n');
    }
  }
}
fs.writeFileSync('D:/neww/EggLab/panel/tools/_t3-score-evidence.txt', out.join('\n'), 'utf8');
console.log('written', out.length, 'blocks');
