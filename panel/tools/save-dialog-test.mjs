// Click-test the Save-as dialog that replaced window.prompt (Electron has none).
import { api } from './api.mjs';
import { execFileSync } from 'node:child_process';

const CDP = (expr) =>
  execFileSync('node', ['tools/cdp.mjs', expr], { cwd: 'D:\\neww\\EggLab\\panel', encoding: 'utf8', maxBuffer: 8e6 });

// A never-saved document so the Save button reads "Save as…".
await api('POST', '/api/photocraft/new-document', { width: 512, height: 512, background: 'white', name: 'Dialog probe' });
await new Promise((r) => setTimeout(r, 4000));

const state = await api('GET', '/api/photocraft/project');
console.log('doc:', state.document.name, '| path:', state.document.path, '| dirty:', state.document.dirty);

// 1. The Save button should be labelled "Save as…" for an untitled document.
console.log('\n[1] Save button label:', CDP("document.querySelector('#pcSave').textContent").trim());

// 2. Click it -> the dialog must open with a suggestion and a live path preview.
console.log(
  '[2] dialog opened:',
  CDP(`(async () => {
    document.querySelector('#pcSave').click();
    await new Promise(r => setTimeout(r, 900));
    const m = document.querySelector('#promptModal');
    const i = document.querySelector('#promptInput');
    i.value = 'dialog-probe';
    i.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 200));
    return JSON.stringify({
      on: m.classList.contains('on'),
      title: document.querySelector('#promptTitle').textContent,
      value: i.value,
      preview: document.querySelector('#promptPath').textContent,
      note: document.querySelector('#promptNote').textContent.slice(0, 45),
    });
  })()`).trim(),
);

// 3. Confirm -> it must really write the project and clear dirty.
console.log('\n[3] confirming with Enter...');
CDP(`(async () => {
  const i = document.querySelector('#promptInput');
  i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await new Promise(r => setTimeout(r, 5000));
})()`);
// execFileSync already awaited the promise, so just settle.
await new Promise((r) => setTimeout(r, 4000));

const after = await api('GET', '/api/photocraft/project');
console.log('    path after :', after.document.path);
console.log('    dirty after:', after.document.dirty, '(should be false)');
console.log('    on disk    :', after.document.path ? await fileExists(after.document.path) : false);
console.log('    button now :', CDP("document.querySelector('#pcSave').textContent").trim());

async function fileExists(p) {
  const fs = await import('node:fs');
  return fs.existsSync(p) && fs.statSync(p).size > 0;
}
