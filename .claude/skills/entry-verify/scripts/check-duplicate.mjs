#!/usr/bin/env node
/**
 * 収録済みかどうかを調べる。完全一致だけでなく、表記ゆれで衝突しそうなものも拾う。
 *
 *   node check-duplicate.mjs "Cloudflare Turnstile" [読みのカタカナ]
 *
 * 見るのは slug / term / aliases / ja[].kana の4つ。
 * term だけ見ていると「Go を足そうとしたら golang が alias で既にあった」を取り逃す。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const dataPath = join(root, 'packages/data/generated/entries.json');

let entries;
try {
  entries = JSON.parse(readFileSync(dataPath, 'utf8'));
} catch {
  console.error('generated/entries.json がありません。先に `pnpm run data` を実行してください。');
  process.exit(2);
}

const [term, kana] = process.argv.slice(2);
if (!term) {
  console.error('使い方: node check-duplicate.mjs <用語> [読みのカタカナ]');
  process.exit(2);
}

/** 英数字だけにして比較する。記号・空白・大小の違いを吸収する。 */
const normTerm = (s) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
/** ひらがな→カタカナ、長音と中黒と空白を落として比較する。 */
const normKana = (s) =>
  (s ?? '')
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .replace(/[ー・\s]/g, '');

const t = normTerm(term);
const k = normKana(kana);

const hits = [];
for (const e of entries) {
  const reasons = [];
  if (normTerm(e.slug) === t) reasons.push(`slug が一致 (${e.slug})`);
  if (normTerm(e.term) === t) reasons.push(`term が一致 (${e.term})`);
  for (const a of e.aliases ?? []) if (normTerm(a) === t) reasons.push(`aliases に一致 (${a})`);
  if (k) for (const r of e.ja) if (normKana(r.kana) === k) reasons.push(`読みが一致 (${r.kana})`);
  if (reasons.length) hits.push({ e, reasons, exact: true });
}

// 完全一致が無いときだけ、部分一致で「近いもの」を出す。誤検出で騒がないため。
if (hits.length === 0 && t.length >= 3) {
  for (const e of entries) {
    const cands = [e.slug, e.term, ...(e.aliases ?? [])].map(normTerm);
    if (cands.some((c) => c && (c.includes(t) || t.includes(c))))
      hits.push({ e, reasons: [`表記が近い (${e.term})`], exact: false });
  }
}

const exact = hits.filter((h) => h.exact);
if (exact.length) {
  console.log(`重複あり: ${exact.length} 件`);
  for (const h of exact) {
    console.log(`  ${h.e.term}  (/w/${h.e.slug}/)`);
    for (const r of h.reasons) console.log(`    - ${r}`);
    console.log(`    読み: ${h.e.ja.map((x) => x.kana).join(' / ')}`);
    console.log(`    確度: ${h.e.confidence} / 出典: ${h.e.sources?.length ?? 0} 件`);
  }
  process.exit(1);
}

if (hits.length) {
  console.log(`完全一致なし。ただし表記の近いものが ${hits.length} 件ある（別語なら追加してよい）:`);
  for (const h of hits) console.log(`  ${h.e.term}  (/w/${h.e.slug}/)  読み: ${h.e.ja[0].kana}`);
} else {
  console.log('重複なし。追加してよい。');
}
console.log(`\n収録数: ${entries.length} 語`);
