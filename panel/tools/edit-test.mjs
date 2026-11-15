import { api } from './api.mjs';

const t0 = Date.now();
try {
  const res = await api('POST', '/api/photocraft/edit-active', {
    prompt: 'Change the fried egg yolk to a glossy deep purple, keep the white outline, the fried egg shape, the smiley face, the highlights and the transparent background unchanged.',
    workflow: 'turbo',
    steps: 8,
  });
  console.log(JSON.stringify(res, null, 1).slice(0, 3500));
} catch (err) {
  console.log('ERROR', err.message);
}
console.log('seconds', Math.round((Date.now() - t0) / 1000));
