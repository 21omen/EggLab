import fs from 'node:fs';
import { api } from './api.mjs';
const o = await api('POST', '/api/photocraft/command', { id: 'type.fonts', params: {} });
const fams = o.result?.families || [];
fs.writeFileSync('tmp/fonts.json', JSON.stringify(fams, null, 1));
const want = /impact|anton|oswald|bebas|archivo|inter|montserrat|helvetica|futura|roboto|poppins|playfair|bodoni|didot|baskerville|garamond|georgia|franklin|gill|rockwell|din|eurostile|univers|frutiger|myriad|trade gothic|libre|lato|raleway|space grotesk|dm sans|sora|manrope|source sans|work sans|jost|syne|unbounded|clash|satoshi|general sans|instrument|grotesk|condensed|slab|serif|sans/i;
console.log('total', fams.length);
for (const f of fams) if (want.test(f)) console.log(f);
