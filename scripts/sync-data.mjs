// generated/entries.json を CLI / MCP パッケージにコピーする。
// これらは npm 公開時に自己完結している必要があるため。
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'packages/data/generated/entries.json');

if (!existsSync(src)) {
  console.error('generated/entries.json がありません。先に `pnpm --filter @nanteyomu/data build` を実行してください。');
  process.exit(1);
}

for (const pkg of ['cli', 'mcp']) {
  const dir = join(root, 'packages', pkg, 'data');
  mkdirSync(dir, { recursive: true });
  copyFileSync(src, join(dir, 'entries.json'));
  console.log(`synced -> packages/${pkg}/data/entries.json`);
}
