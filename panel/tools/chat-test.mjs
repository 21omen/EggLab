import { api } from './api.mjs';

const text = process.argv[2] || 'Check the EggLab engine status and tell me which PhotoCraft document is open. Use your tools, do not guess.';
const t0 = Date.now();
const res = await api('POST', '/api/chat', { text }, 900000);
console.log(JSON.stringify(res, null, 1));
console.log('seconds', Math.round((Date.now() - t0) / 1000));
