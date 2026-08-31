import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEntries, searchKeys } from './load.js';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'generated');

const { entries, issues } = loadEntries();
const errors = issues.filter((i) => i.level === 'error');
if (errors.length > 0) {
  for (const i of errors) console.error(`error  ${i.file}: ${i.message}`);
  console.error(`\nビルド中止: ${errors.length} 件のエラー`);
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });

// 全文（エントリページ用）
writeFileSync(join(OUT, 'entries.json'), JSON.stringify(entries, null, 2) + '\n');

// クライアント検索用の軽量インデックス
const index = entries.map((e) => ({
  s: e.slug,
  t: e.term,
  k: e.ja.find((r) => r.primary)?.kana ?? e.ja[0].kana,
  c: e.category,
  d: e.divergence ?? false,
  q: searchKeys(e).join(' '),
}));
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index) + '\n');

const sourced = entries.filter((e) => (e.sources?.length ?? 0) > 0).length;
console.log(`built ${entries.length} entries -> ${OUT}`);
console.log(`  出典あり: ${sourced}/${entries.length} (${Math.round((sourced / entries.length) * 100)}%)`);
console.log(`  index.json: ${JSON.stringify(index).length} bytes`);
