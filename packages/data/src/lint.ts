import { loadEntries } from './load.js';

const { entries, issues } = loadEntries();
const errors = issues.filter((i) => i.level === 'error');
const warns = issues.filter((i) => i.level === 'warn');

for (const i of errors) console.error(`error  ${i.file}: ${i.message}`);
for (const i of warns) console.warn(`warn   ${i.file}: ${i.message}`);

const sourced = entries.filter((e) => (e.sources?.length ?? 0) > 0).length;
const divergent = entries.filter((e) => e.divergence).length;

console.log(`\nentries: ${entries.length}`);
console.log(`出典あり: ${sourced} (${entries.length ? Math.round((sourced / entries.length) * 100) : 0}%)`);
console.log(`出典募集中 (needsSource): ${entries.length - sourced}`);
console.log(`日英で読みがズレる語: ${divergent}`);
console.log(`errors: ${errors.length}, warnings: ${warns.length}`);

process.exit(errors.length > 0 ? 1 : 0);
