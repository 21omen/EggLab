// Print the input schema of selected MCP tools, compactly.
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../mcp-server.mjs', import.meta.url), 'utf8');
for (const name of process.argv.slice(2)) {
  const i = src.indexOf(`name: '${name}'`);
  if (i < 0) {
    console.log(name + ': missing');
    continue;
  }
  const j = src.indexOf('inputSchema:', i);
  const k = src.indexOf('\n  },', j);
  console.log('\n' + src.slice(i, k).replace(/\s+/g, ' ').slice(0, 900));
}
