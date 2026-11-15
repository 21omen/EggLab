import * as pc from '../service/photocraft.mjs';

console.log('sessions', JSON.stringify(await pc.sessionList(), null, 1).slice(0, 1500));
console.log('inspect', JSON.stringify(await pc.inspect(), null, 1).slice(0, 1200));
