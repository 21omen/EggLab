// Verify that changing the agent model forks the document's session instead of
// reusing one that may be vision-blind. Restores the original model at the end,
// even if the test chat is stopped or fails mid-run.
import { api } from './api.mjs';

const ORIGINAL = 'inferx/deepseek-v4.1-flash-1017-basic';
const OTHER = 'opencode/mimo-v2.6-flash-free';

const before = await api('GET', '/api/sessions');
const cur = before.docs.find((d) => d.current);
console.log('before: doc', cur?.title, 'session', cur?.sessionId, 'model', cur?.model);

try {
  // Switch model -> the next send must mint a NEW session id for this document.
  await api('PATCH', '/api/settings', { opencode: { model: OTHER } });
  console.log('\nmodel patched to', OTHER);

  const sent = await api('POST', '/api/chat', { text: 'Reply with exactly: FORKED. Do not call any tools.' }, 300000);
  console.log('agent said:', JSON.stringify((sent.item?.text || '').slice(0, 40)));

  const after = await api('GET', '/api/sessions');
  const now = after.docs.find((d) => d.current);
  console.log('after: session', now?.sessionId, 'model', now?.model);
  console.log('FORKED (new session id)?', now?.sessionId !== cur?.sessionId);
} finally {
  // Always restore, so a stopped/failed test never leaves the panel on the
  // wrong model.
  await api('PATCH', '/api/settings', { opencode: { model: ORIGINAL } });
  console.log('\nrestored model to', ORIGINAL);
}

const final = await api('GET', '/api/sessions');
const f = final.docs.find((d) => d.current);
console.log('final: session', f?.sessionId, 'model', f?.model);
