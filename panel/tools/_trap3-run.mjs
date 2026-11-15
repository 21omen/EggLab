// Launches agent-turn-test.mjs with the brief read from _trap3-brief.txt.
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const brief = fs.readFileSync('D:/neww/EggLab/panel/tools/_trap3-brief.txt', 'utf8').trim();
const child = spawn(process.execPath, ['tools/agent-turn-test.mjs', brief], {
  cwd: 'D:/neww/EggLab/panel',
  stdio: 'inherit',
});
child.on('exit', (code) => process.exit(code ?? 0));
