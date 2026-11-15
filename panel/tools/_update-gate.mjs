// Polls the running EggLab until it reports the new version (auto-update gate).
import fs from 'node:fs';

const ctlPath = `${process.env.APPDATA}/EggLab/control.json`;
const read = () => {
  try {
    return JSON.parse(fs.readFileSync(ctlPath, 'utf8'));
  } catch {
    return null;
  }
};

const t0 = Date.now();
let last = '';
const startedAt = Date.now();

for (;;) {
  await new Promise((r) => setTimeout(r, 3000));
  const ctl = read();
  let st = null;
  if (ctl) {
    try {
      const res = await fetch(ctl.url + '/api/update', {
        headers: { 'x-egglab-token': ctl.token },
        signal: AbortSignal.timeout(4000),
      });
      st = await res.json();
    } catch {}
  }
  const line = st
    ? `${st.status} current=${st.current} ${st.percent || 0}% ${st.version || ''} ${st.error || ''}`
    : '(app restarting)';
  if (line !== last) {
    console.log(`${Math.round((Date.now() - t0) / 1000)}s: ${line}`);
    last = line;
  }
  if (st && st.current === '0.1.1') {
    console.log('UPDATED to', st.current);
    break;
  }
  if (Date.now() - startedAt > 300000) {
    console.log('TIMEOUT');
    break;
  }
}
