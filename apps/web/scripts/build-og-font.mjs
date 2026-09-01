/**
 * OGP 画像用のサブセットフォントを作り直す。
 *
 *   cd apps/web && node --experimental-strip-types scripts/build-og-font.mjs
 *
 * 実行には subset-font が要る（毎回のビルドには不要なので依存に入れていない）:
 *   pnpm dlx subset-font --help   # 参考
 * 実際には下の import が解決できる状態で走らせる:
 *   npm i --no-save subset-font
 *
 * 元フォントは Zen Maru Gothic Bold (SIL OFL 1.1)。
 *   https://github.com/google/fonts/tree/main/ofl/zenmarugothic
 * 3.7MB あるのでリポジトリには置かず、ここで必要な文字だけに絞った
 * assets/og-font.ttf（約86KB）だけをコミットしている。
 *
 * 収録語に新しい文字種（漢字・記号など）が入った場合はこれを流用して作り直す。
 * ビルド時に「OGP 用フォントのサブセットに無い」と警告が出たら、その合図。
 */
import subsetFont from 'subset-font';
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = process.argv[2];
if (!SRC) {
  console.error('使い方: node scripts/build-og-font.mjs <ZenMaruGothic-Bold.ttf のパス>');
  process.exit(1);
}

const entries = JSON.parse(
  readFileSync(new URL('../../../packages/data/generated/entries.json', import.meta.url), 'utf8'),
);
const lib = readFileSync(new URL('../src/lib/entries.ts', import.meta.url), 'utf8');

// カテゴリ名はソースから拾う。ラベルを増やしたときに取りこぼさないため。
const labels = [...lib.match(/CATEGORY_LABEL[^{]*\{([\s\S]*?)\};/)[1].matchAll(/:\s*'([^']+)'/g)].map((m) => m[1]);

const set = new Set();
const add = (s) => { for (const c of s) set.add(c); };
for (const e of entries) {
  add(e.term);
  add((e.ja.find((r) => r.primary) ?? e.ja[0]).kana);
}
add('nanteyomu — そのツール、なんて読む？日英でズレる「」');
labels.forEach(add);
// 将来の語のため ASCII・ひらがな・カタカナはブロックごと入れておく
for (let i = 0x20; i <= 0x7e; i++) set.add(String.fromCharCode(i));
for (let i = 0x3040; i <= 0x30ff; i++) set.add(String.fromCharCode(i));
for (let i = 0xff61; i <= 0xff9f; i++) set.add(String.fromCharCode(i));
add('—–…‘’“”');

const buf = await subsetFont(readFileSync(SRC), [...set].join(''), { targetFormat: 'truetype' });
const out = new URL('../assets/og-font.ttf', import.meta.url);
writeFileSync(out, buf);
console.log(`${set.size} 文字 / ${(buf.length / 1024).toFixed(0)} KB -> ${out.pathname}`);
