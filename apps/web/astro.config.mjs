import { readFileSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import solid from '@astrojs/solid-js';
import sitemap from '@astrojs/sitemap';

// 用語ページの lastmod に、そのエントリの updated を使う。
// クローラが「どのページが更新されたか」を判断できるようにするため。
//
// generated/entries.json は gitignore されていてビルド時に作られるので、
// トップレベルで import せず serialize の中で遅延して読む。こうしておくと
// 設定ファイルの読み込み自体はデータの有無に左右されない。
let updatedBySlug;
function lastmodFor(pathname) {
  if (!updatedBySlug) {
    const url = new URL('../../packages/data/generated/entries.json', import.meta.url);
    const entries = JSON.parse(readFileSync(url, 'utf-8'));
    updatedBySlug = new Map(entries.map((e) => [`/w/${e.slug}/`, e.updated]));
  }
  return updatedBySlug.get(pathname);
}

export default defineConfig({
  site: 'https://nanteyomu.dev',
  output: 'static',
  integrations: [
    solid(),
    sitemap({
      serialize(item) {
        const updated = lastmodFor(new URL(item.url).pathname);
        if (updated) item.lastmod = `${updated}T00:00:00+09:00`;
        return item;
      },
    }),
  ],
  build: { format: 'directory' },
});
