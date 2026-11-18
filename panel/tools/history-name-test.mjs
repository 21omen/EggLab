import { historyFileName } from '../service/history-names.mjs';

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

const long = 'c:\\users\\ko du won\\egglab projects\\skin-retouch-20261118\\skin-retouch-20261118.pcraft';
const ids = [
  long,
  `${long}#2`,
  `${long}#3`,
  `${long}#4`,
  `${long}#5`,
  'c:\\users\\ko du won\\egglab projects\\a-very-long-project-name-that-shares-the-prefix-one\\same.pcraft',
  'c:\\users\\ko du won\\egglab projects\\a-very-long-project-name-that-shares-the-prefix-two\\same.pcraft',
  'no-document',
  'untitled:Poster:1080x1350',
];
const names = ids.map(historyFileName);
check('deterministic', historyFileName(long) === names[0]);
check('unique names', new Set(names).size === names.length, `${new Set(names).size}/${names.length}`);
check('all json', names.every((name) => name.endsWith('.json')));
check('bounded length', names.every((name) => name.length <= 80), `max ${Math.max(...names.map((n) => n.length))}`);
check('primary and siblings differ', names[0] !== names[1] && names[1] !== names[2], names.slice(0, 5).join(', '));
check('long shared prefixes differ', names[5] !== names[6], `${names[5]} vs ${names[6]}`);

console.log(`\n${failures ? 'FAILED' : 'OK'} — ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
