// Diagnostic: can Electron's Chromium network stack reach GitHub here?
import { app, net } from 'electron';

app.whenReady().then(async () => {
  for (const url of [
    'https://api.github.com/repos/YanNyeinHtet/EggLab/releases/latest',
    'https://github.com/YanNyeinHtet/EggLab/releases/download/v0.1.1/latest.yml',
    'https://objects.githubusercontent.com/',
  ]) {
    const t0 = Date.now();
    try {
      const res = await net.fetch(url, { redirect: 'manual' });
      console.log(`${url} -> ${res.status} in ${Date.now() - t0}ms`);
    } catch (err) {
      console.log(`${url} -> ERR ${err?.message} in ${Date.now() - t0}ms`);
    }
  }
  app.quit();
});
