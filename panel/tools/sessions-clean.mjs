// Drop test-fixture chats so the registry reflects real work only.
import { api } from './api.mjs';

const DROP = [
  'untitled:Dialog probe:512x512',
  'd:\\neww\\projects\\dialog-probe\\dialog-probe.pcraft',
];

const before = await api('GET', '/api/sessions');
console.log('before:', before.docs.map((d) => d.title).join(', '));

for (const key of DROP) {
  if (!before.docs.some((d) => d.key === key)) {
    console.log('skip (not present):', key);
    continue;
  }
  const res = await api('POST', '/api/sessions/delete', { key });
  console.log('deleted:', key, JSON.stringify(res));
}

const after = await api('GET', '/api/sessions');
console.log('after :', after.docs.map((d) => `${d.title}${d.current ? ' *' : ''}`).join(', '));
