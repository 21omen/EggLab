// Close the probe documents my tests left open in PhotoCraft, keeping one
// EggLab-test and one poster-draft as QA fixtures.
import { api } from './api.mjs';

// The control() helper lives in the service; go through the panel's raw command
// route for menu items, which is what ui.menu.invoke needs.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function menu() {
  // ui.menu.list is a protocol method, not an engine command, so use the panel's
  // internal bridge via the project endpoint's document list when available.
  const s = await api('GET', '/api/photocraft/project');
  return s.documents || [];
}

async function activate(index) {
  await api('POST', '/api/photocraft/command', { id: 'ui.menu.invoke', params: { id: `window.document.${index}` } });
  await sleep(600);
}

async function closeActive() {
  await api('POST', '/api/photocraft/command', { id: 'file.close', params: {} });
  await sleep(900);
  // Answer the unsaved-changes prompt if one appeared.
  try {
    await api('POST', '/api/photocraft/command', {
      id: 'ui.dialog.confirm',
      params: { dialog: 'discard', choice: 'dontSave' },
    });
    await sleep(600);
  } catch {}
}

// Targets to remove, by exact label. Processed one at a time because the
// tab indices shift after every close.
const DROP = ['migration-probe.pcraft', 'dialog-probe.pcraft', 'Dialog probe'];

for (const label of DROP) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const docs = await menu();
    const hit = docs.find((d) => d.label === label);
    if (!hit) break;
    console.log(`closing "${label}" (index ${hit.index})...`);
    await activate(hit.index);
    await closeActive();
  }
}

// One duplicate poster-draft is left from repeated opens; drop it too.
{
  const docs = await menu();
  const drafts = docs.filter((d) => d.label === 'poster-draft.pcraft');
  if (drafts.length > 1) {
    console.log(`closing 1 of ${drafts.length} duplicate poster-draft tabs...`);
    await activate(drafts[drafts.length - 1].index);
    await closeActive();
  }
}

console.log('\ndocuments now open:');
for (const d of await menu()) console.log(`  ${d.active ? '*' : ' '} [${d.index}] ${d.label}`);
