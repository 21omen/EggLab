import { commands } from '../service/photocraft.mjs';
const res = await commands('');
const arr = res?.commands || res?.result?.commands || res;
console.log('keys', res && Object.keys(res));
console.log('len', Array.isArray(arr) ? arr.length : typeof arr);
console.log(JSON.stringify(Array.isArray(arr) ? arr.slice(0, 2) : arr, null, 1).slice(0, 4000));
