// Renders the EggLab app icon (512×512 PNG) from the same egg-orb language the
// panel uses, so the shipped icon matches the product instead of Electron's
// default. Run with:  npx electron tools/render-icon.mjs
import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'build', 'icon.png');
const SIZE = 512;

const html = `<!doctype html><html><body style="margin:0;background:transparent;overflow:hidden">
<div style="width:${SIZE}px;height:${SIZE}px;display:flex;align-items:center;justify-content:center">
  <div style="position:relative;width:448px;height:448px;border-radius:104px;
       background:linear-gradient(160deg,#20262a 0%,#151a1d 55%,#101314 100%);
       box-shadow:inset 0 1px 0 rgba(232,241,246,.10), 0 18px 40px rgba(0,0,0,.45);">
    <div style="position:absolute;left:50%;top:48%;transform:translate(-50%,-50%);
         width:270px;height:330px;border-radius:50% 50% 50% 50% / 62% 62% 40% 40%;
         background:radial-gradient(120% 110% at 36% 24%, #fbf5e4 0%, #efe2c3 46%, #d9c493 78%, #c3ab74 100%);
         box-shadow:inset -14px -18px 34px rgba(120,96,48,.28), inset 8px 10px 22px rgba(255,252,240,.55), 0 22px 38px rgba(0,0,0,.42);">
      <div style="position:absolute;left:22%;top:13%;width:34%;height:26%;border-radius:50%;
           background:radial-gradient(closest-side,rgba(255,255,255,.85),rgba(255,255,255,0));"></div>
      <div style="position:absolute;inset:0;border-radius:inherit;opacity:.35;
           background-image:radial-gradient(rgba(140,116,64,.35) .7px, transparent .8px);
           background-size:5px 5px;"></div>
    </div>
    <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
         width:340px;height:380px;border-radius:50%;
         box-shadow:0 0 0 1px rgba(211,196,144,.16), 0 0 60px rgba(211,196,144,.10);"></div>
    <div style="position:absolute;left:50%;bottom:52px;transform:translateX(-50%);
         width:64px;height:8px;border-radius:9999px;background:rgba(0,0,0,.35);filter:blur(4px);"></div>
  </div>
</div>
</body></html>`;

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    transparent: true,
    frame: false,
    webPreferences: { offscreen: true },
  });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise((resolve) => setTimeout(resolve, 500));
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, image.toPNG());
  console.log('icon written:', OUT, image.getSize());
  app.quit();
});
