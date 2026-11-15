// Exercise the panel-styled confirm dialog and drop the migration probe.
import { api } from './api.mjs';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const PANEL = 'D:\\neww\\EggLab\\panel';
const cdp = (expr) => execFileSync('node', ['tools/cdp.mjs', expr], { cwd: PANEL, encoding: 'utf8', maxBuffer: 8e6 }).trim();

const PROBE_KEY = 'd:\\neww\\projects\\migration-probe\\migration-probe.pcraft';

// 1. Open the Chats popover and click delete on the probe row.
console.log('[1] opening delete dialog...');
console.log(
  cdp(`(async () => {
    document.querySelector('#threadLabel').click();
    await new Promise(r => setTimeout(r, 1800));
    const row = [...document.querySelectorAll('.session-row')].find(r => r.querySelector('.s-title')?.textContent === 'Migration probe');
    row.querySelector('[data-act=delete]').click();
    await new Promise(r => setTimeout(r, 700));
    return JSON.stringify({
      open: document.querySelector('#confirmModal').classList.contains('on'),
      title: document.querySelector('#confirmTitle').textContent,
      note: document.querySelector('#confirmNote').textContent.slice(0, 55),
      ok: document.querySelector('#confirmOk').textContent,
      cancel: document.querySelector('#confirmCancel').textContent,
      dangerClass: document.querySelector('#confirmOk').classList.contains('danger'),
      focus: document.activeElement?.id,
    });
  })()`),
);

// 2. Escape must cancel without deleting anything.
console.log('\n[2] pressing Escape (should cancel)...');
cdp(`(async () => {
  document.querySelector('#confirmModal').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await new Promise(r => setTimeout(r, 900));
})()`);
await new Promise((r) => setTimeout(r, 1500));
const afterEscape = await api('GET', '/api/sessions');
console.log('    modal closed :', cdp("!document.querySelector('#confirmModal').classList.contains('on')"));
console.log('    still there  :', afterEscape.docs.some((d) => d.key === PROBE_KEY), '(should be true)');

// 3. Reopen and confirm for real.
console.log('\n[3] confirming the delete...');
cdp(`(async () => {
  document.querySelector('#threadLabel').click();
  await new Promise(r => setTimeout(r, 1500));
  const row = [...document.querySelectorAll('.session-row')].find(r => r.querySelector('.s-title')?.textContent === 'Migration probe');
  row.querySelector('[data-act=delete]').click();
  await new Promise(r => setTimeout(r, 700));
  document.querySelector('#confirmOk').click();
  await new Promise(r => setTimeout(r, 2000));
})()`);
await new Promise((r) => setTimeout(r, 2000));

const after = await api('GET', '/api/sessions');
console.log('    registry     :', after.docs.map((d) => d.title).join(', '));
console.log('    gone         :', !after.docs.some((d) => d.key === PROBE_KEY), '(should be true)');

// 4. The PhotoCraft project must survive a chat deletion.
console.log('    project file :', fs.existsSync('D:\\neww\\projects\\migration-probe\\migration-probe.pcraft'), '(should be true)');
