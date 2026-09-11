#!/usr/bin/env node
/**
 * 語の中身を実際に取りに行って確かめる。
 *
 * lint.ts はスキーマと重複しか見ておらず、出典の URL は「http で始まるか」
 * しか検査していない。つまり、存在しないページや、そのページに書かれて
 * いない文言を quote に書いても通ってしまう。ここを塞ぐのがこのスクリプト。
 *
 *   node scripts/verify-entries.mjs                 変更された語だけ
 *   node scripts/verify-entries.mjs --all           全部
 *   node scripts/verify-entries.mjs a.yml b.yml     指定した語
 *
 * 見るもの:
 *   homepage    繋がるか / 本文にその語が出てくるか
 *   sources[]   繋がるか / quote がそのページに本当に書かれているか
 *   重複        slug / term / aliases / kana が他の語とぶつかっていないか
 *
 * 落とす（exit 1）のは「書かれていない文言を quote にしている」場合だけ。
 * 繋がらない・語が見つからないは警告に留める。相手のサイトが落ちていたり
 * CI の IP を弾いたりで、こちらに非が無くても失敗しうるため。
 */
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// YAML を直接読まずビルド済みを使う。yaml の依存を増やさずに済み、
// スキーマ検証を通ったデータだけを相手にできる。
const DATA = join(ROOT, 'packages/data/generated/entries.json');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/** 引用の一致を見るための正規化。表記の揺れで落ちないところまで均す。 */
const flatten = (s) =>
  (s ?? '')
    // GitHub は README を JSON に埋めて返すので \u003c の類を戻しておく。
    // これをやらないと README 内の文が一切引っかからない。
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\n/g, ' ')
    .replace(/\\"/g, '"')
    .replace(/<script[\s\S]*?<\/script[^>]*>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;|&rsquo;|&lsquo;|&#x27;/gi, "'")
    .replace(/&ldquo;|&rdquo;|&#0?34;/gi, '"')
    .replace(/&mdash;|&ndash;|&#8212;|&#8211;/gi, '-')
    .replace(/&hellip;/gi, '…')
    // &amp; は最後。先に戻すと &amp;quot; が二度復号されて " になってしまう
    .replace(/&amp;/gi, '&')
    // 引用符とダッシュは書き手によって揺れる。全部ただの ' " - にする
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/**
 * GitHub のリポジトリ URL なら README の生データも取れるようにする。
 * HTML 経由より確実で、相手にも軽い。
 */
function rawReadme(url) {
  const m = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/#?]+)\/?(?:[#?].*)?$/);
  if (!m) return null;
  return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/HEAD/README.md`;
}

/**
 * 引用の照合に使う形。空白を完全に落とす。
 *
 * タグを外すと「pronounced <em>x</em>)」が「pronounced x )」になり、
 * 括弧の前に空白が入る。人が書いた引用とは必ずずれるので空白は無視する。
 *
 * script の中身も残す。Next.js などで描かれるページは本文が JS の中に
 * あり、剥がしてしまうと引用を確かめる術がなくなるため。40 字を超える
 * 引用が minify 済みの JS にたまたま現れることはまず無い。
 */
const squeeze = (s) =>
  (s ?? '')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/<style[\s\S]*?<\/style[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;|&rsquo;|&lsquo;|&#x27;/gi, "'")
    .replace(/&ldquo;|&rdquo;|&#0?34;/gi, '"')
    .replace(/&mdash;|&ndash;|&#8212;|&#8211;/gi, '-')
    .replace(/&hellip;/gi, '…')
    // &amp; は最後。先に戻すと &amp;quot; が二度復号されて " になってしまう
    .replace(/&amp;/gi, '&')
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, '')
    .toLowerCase();

/**
 * 引用が日本語かどうかで Accept-Language を変える。
 *
 * 一律で ja を優先すると、言語交渉をするサイト（debian.org など）が
 * 日本語版を返し、英語の引用が永久に一致しなくなる。
 */
const langFor = (quote) =>
  /[぀-ヿ㐀-鿿]/.test(quote ?? '') ? 'ja,en;q=0.8' : 'en,ja;q=0.8';

async function get(url, lang = 'en,ja;q=0.8') {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
      headers: { 'user-agent': UA, 'accept-language': lang },
    });
    if (!res.ok) return { ok: false, why: `HTTP ${res.status}` };
    return { ok: true, text: await res.text(), final: res.url };
  } catch (e) {
    return { ok: false, why: e.name === 'TimeoutError' ? 'タイムアウト' : e.message };
  }
}

/** 数件ずつ並行で回す。相手に負荷をかけない程度に留める。 */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const n = i++;
        out[n] = await fn(items[n], n);
      }
    }),
  );
  return out;
}

const norm = (s) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const normKana = (s) =>
  (s ?? '')
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .replace(/[ー・\s]/g, '');

function loadAll() {
  if (!existsSync(DATA)) {
    console.error('generated/entries.json がありません。先に `pnpm run data` を実行してください。');
    process.exit(2);
  }
  // ファイル名は slug.yml なので、slug から辿れる
  return JSON.parse(readFileSync(DATA, 'utf8')).map((e) => ({ file: `${e.slug}.yml`, entry: e }));
}

/** 対象の語を決める。既定では main との差分。 */
function targets(argv) {
  const files = argv.filter((a) => !a.startsWith('--'));
  if (files.length) return files.map((f) => basename(f));
  if (argv.includes('--all')) return null;
  const base = process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'origin/main';
  try {
    const out = execSync(`git diff --name-only --diff-filter=d ${base}...HEAD -- packages/data/entries/`, {
      cwd: ROOT,
      encoding: 'utf8',
    });
    return out.split('\n').filter(Boolean).map((f) => basename(f));
  } catch {
    console.error(`${base} と比較できませんでした。--all を付けるか、ファイルを指定してください。`);
    process.exit(2);
  }
}

async function main() {
  const all = loadAll();
  const want = targets(process.argv.slice(2));
  const checking = want ? all.filter((x) => want.includes(x.file)) : all;

  if (checking.length === 0) {
    console.log('対象の語がありません。');
    return;
  }
  console.log(`${checking.length} 件を検証します（全 ${all.length} 件と照合）\n`);

  const errors = [];
  const warns = [];

  // --- 重複。ネットワーク不要なので先に済ませる ---
  for (const { file, entry: e } of checking) {
    const others = all.filter((x) => x.file !== file);
    const mine = [e.slug, e.term, ...(e.aliases ?? [])].map(norm).filter(Boolean);
    for (const { file: of_, entry: o } of others) {
      const theirs = [o.slug, o.term, ...(o.aliases ?? [])].map(norm).filter(Boolean);
      const hit = mine.find((m) => theirs.includes(m));
      if (hit) errors.push(`${file}: ${of_} と表記が重複しています（${hit}）`);
    }
    // 同じ読みの別語は普通にあるので、こちらは警告
    const myKana = (e.ja ?? []).map((j) => normKana(j.kana));
    for (const { file: of_, entry: o } of others) {
      if ((o.ja ?? []).some((j) => myKana.includes(normKana(j.kana)))) {
        warns.push(`${file}: ${of_} と読みが同じです（別語なら問題ありません）`);
      }
    }
  }

  // --- 取得が要るもの ---
  const jobs = [];
  for (const { file, entry: e } of checking) {
    if (e.homepage) jobs.push({ file, kind: 'homepage', url: e.homepage, term: e.term, aliases: e.aliases ?? [] });
    for (const s of e.sources ?? []) jobs.push({ file, kind: 'source', url: s.url, quote: s.quote, title: s.title });
  }

  const results = await mapLimit(jobs, 4, async (j) => {
    const res = await get(j.url, langFor(j.quote));
    // 引用の照合では README の生データも合わせて見る
    if (res.ok && j.kind === 'source' && j.quote) {
      const raw = rawReadme(j.url);
      if (raw) {
        const r = await get(raw);
        if (r.ok) res.text += '\n' + r.text;
      }
    }
    return { j, res };
  });

  for (const { j, res } of results) {
    if (!res.ok) {
      warns.push(`${j.file}: ${j.kind} に繋がりません（${res.why}）— ${j.url}`);
      continue;
    }
    const text = flatten(res.text);

    if (j.kind === 'homepage') {
      const names = [j.term, ...j.aliases].map(flatten).filter(Boolean);
      if (!names.some((n) => text.includes(n))) {
        warns.push(`${j.file}: homepage の本文に「${j.term}」が見つかりません — ${res.final}`);
      }
      continue;
    }

    if (!j.quote) continue;
    const q = flatten(j.quote);
    if (text.includes(q)) continue;

    // 空白を無視した照合。タグ剥がしで入る余分な空白を吸収する
    const tight = squeeze(res.text);
    const qt = squeeze(j.quote);
    if (qt && tight.includes(qt)) continue;

    // 全文が一致しなくても、句点で切った断片が全部あるなら実質そのページの文とみなす
    const parts = q.split(/(?<=[.。!?])\s+/).filter((x) => x.length > 12);
    if (parts.length > 1 && parts.every((x) => text.includes(x))) continue;

    // いちばん長い断片だけでも見つかるなら、引用の切り方の違いとみなす
    const longest = [...parts, q].sort((a, b) => b.length - a.length)[0];
    if (longest && longest.length >= 40) {
      const lt = longest.replace(/\s+/g, '');
      if (text.includes(longest) || tight.includes(lt)) continue;
    }

    // 本文がほとんど無いページは JS で描くもの。取れないだけなので警告に留める
    if (tight.length < 800) {
      warns.push(
        `${j.file}: 本文が取得できず quote を確かめられません（JS 描画か） — ${res.final}`,
      );
      continue;
    }

    errors.push(
      `${j.file}: quote がそのページに見つかりません — ${res.final}\n` +
        `    引用: ${j.quote.slice(0, 100)}${j.quote.length > 100 ? '…' : ''}`,
    );
  }

  for (const w of warns) console.log(`  警告: ${w}`);
  for (const e of errors) console.log(`  エラー: ${e}`);
  console.log(`\nerrors: ${errors.length}, warnings: ${warns.length}`);
  if (errors.length) process.exit(1);
}

main().catch((e) => {
  console.error(`検証に失敗しました: ${e.message}`);
  process.exit(2);
});
