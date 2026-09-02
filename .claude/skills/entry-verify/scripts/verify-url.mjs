#!/usr/bin/env node
/**
 * URL を実際に取得して、公式サイト／出典として使えるかを確かめる。
 *
 *   node verify-url.mjs <URL> <用語>
 *
 * 出すもの:
 *   - HTTP ステータスとリダイレクト後の URL（別サイトへ飛んでいないか）
 *   - <title>
 *   - 用語がページに現れる回数（取り違えの検出）
 *   - 読み方に言及していそうな文（引用をここからそのまま取る。作文しない）
 *
 * 403 が返ることがある（bot 遮断）。その場合は「確認できなかった」であって
 * 「URL が間違っている」ではない。確認できないものは採用しない。
 */
const [url, term] = process.argv.slice(2);
if (!url || !term) {
  console.error('使い方: node verify-url.mjs <URL> <用語>');
  process.exit(2);
}

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

const res = await fetch(url, {
  redirect: 'follow',
  headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
  signal: AbortSignal.timeout(25000),
}).catch((e) => ({ ok: false, status: 0, _err: String(e) }));

if (res.status === 0) {
  console.log(`到達できず: ${res._err}`);
  process.exit(1);
}

console.log(`HTTP ${res.status}`);
console.log(`最終 URL: ${res.url}`);
if (new URL(res.url).host !== new URL(url).host) {
  console.log(`  ※ 別ホストへリダイレクトしている（${new URL(url).host} → ${new URL(res.url).host}）`);
}
if (!res.ok) {
  console.log('\n本文を取得できなかった。403 なら bot 遮断の可能性が高い。');
  console.log('「URL が誤り」とは限らないが、確認できない以上は採用しないこと。');
  process.exit(1);
}

const html = await res.text();
const title = (html.match(/<title[^>]*>([^<]*)</i) ?? [, ''])[1].trim();
console.log(`title: ${title}`);

// タグを落として素のテキストにする
const text = html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ');

const count = (text.match(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) ?? []).length;
console.log(`本文中の「${term}」: ${count} 回`);
if (count === 0 && !title.toLowerCase().includes(term.toLowerCase())) {
  console.log('  ※ 用語がページに出てこない。取り違えの可能性が高い。');
}

// 読みに言及していそうな箇所を抜き出す。ここに出た文だけを quote に使う。
const PAT =
  /[^.。!?！？]*(?:pronounc|pronunciation|rhymes with|is said|say it|読み方|発音|と読み|カタカナ)[^.。!?！？]*[.。!?！？]/gi;
const found = [...new Set((text.match(PAT) ?? []).map((s) => s.trim()))].filter((s) => s.length < 320);
console.log('\n読みに言及していそうな文:');
if (found.length === 0) {
  console.log('  なし → このページは読みの出典にはならない（公式サイトとしては使える）');
} else {
  for (const s of found.slice(0, 6)) console.log(`  - ${s}`);
  console.log('\n  ※ quote にはこの中の文を「原文のまま」入れること。要約や翻訳を quote にしない。');
}
