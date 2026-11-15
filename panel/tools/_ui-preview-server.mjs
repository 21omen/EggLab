// Scratch static server for visually checking the panel renderer outside
// Electron. Serves panel/renderer on an ephemeral port. Not part of the app.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = 'D:/neww/EggLab/panel/renderer';
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(root, urlPath === '/' ? 'index.html' : urlPath);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('nope'); return; }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});
server.listen(50321, '127.0.0.1', () => console.log('scratch server on 50321'));
