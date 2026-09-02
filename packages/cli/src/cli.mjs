#!/usr/bin/env node
import { loadEntries, primaryKana, search } from './data.mjs';

const C = process.stdout.isTTY
  ? { dim: '\x1b[2m', bold: '\x1b[1m', accent: '\x1b[38;5;209m', ok: '\x1b[32m', warn: '\x1b[33m', off: '\x1b[0m' }
  : { dim: '', bold: '', accent: '', ok: '', warn: '', off: '' };

const CATEGORY_LABEL = {
  cli: 'CLI・ツール', language: 'プログラミング言語', framework: 'フレームワーク・ランタイム',
  library: 'ライブラリ', service: 'サービス・SaaS', infra: 'インフラ・ミドルウェア',
  db: 'データベース', protocol: 'プロトコル', acronym: '略語', format: 'フォーマット',
  ai: 'AI・機械学習',
  company: '企業', person: '人名',
};
const CONFIDENCE_LABEL = {
  high: '確度: 高', medium: '確度: 中', low: '確度: 低', disputed: '読みが割れている',
};

function usage() {
  console.log(`
${C.bold}nanteyomu${C.off} — IT のツール名・サービス名の読み方を、出典つきで引く

  ${C.bold}使い方${C.off}
    ny <用語>              読み方を引く（カタカナからも引ける）
    ny --list              収録語をすべて表示
    ny --divergence        英語圏と日本の読みがズレる語だけ表示
    ny --json <用語>       JSON で出力
    ny --help              このヘルプ

  ${C.bold}例${C.off}
    ny tmux
    ny "Cloudflare Turnstile"
    ny ジョット
`);
}

function render(e) {
  const kana = primaryKana(e);
  const others = e.ja.filter((r) => r.kana !== kana);

  console.log(`\n${C.bold}${e.term}${C.off}  ${C.accent}${kana}${C.off}  ${C.dim}[${CATEGORY_LABEL[e.category] ?? e.category}]${C.off}`);

  const en = [e.en?.ipa, e.en?.respelling].filter(Boolean).join('  ');
  if (en) console.log(`  ${C.dim}英語${C.off}      ${en}`);
  if (e.expansion) console.log(`  ${C.dim}略${C.off}        ${e.expansion}`);
  if (others.length) {
    console.log(`  ${C.dim}他の読み${C.off}  ${others.map((r) => r.kana + (r.note ? ` ${C.dim}(${r.note})${C.off}` : '')).join('  ')}`);
  }

  console.log(`  ${C.dim}${e.summary}${C.off}`);

  if (e.divergence && e.divergenceNote) {
    console.log(`\n  ${C.warn}⚠ 日英でズレる${C.off}  ${e.divergenceNote.replace(/\s+/g, ' ').trim()}`);
  }

  const conf = e.confidence === 'high' ? C.ok : C.warn;
  console.log(`\n  ${conf}${CONFIDENCE_LABEL[e.confidence]}${C.off}`);

  if (e.sources?.length) {
    for (const s of e.sources) console.log(`  ${C.dim}出典${C.off}  ${s.title}\n        ${C.dim}${s.url}${C.off}`);
  } else {
    console.log(`  ${C.dim}出典なし（暫定値）。ご存知の方は PR をください。${C.off}`);
  }
  console.log();
}

const args = process.argv.slice(2);
const entries = loadEntries();

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  usage();
  process.exit(0);
}

if (args[0] === '--version' || args[0] === '-v') {
  console.log('0.1.0');
  process.exit(0);
}

if (args[0] === '--list') {
  for (const e of [...entries].sort((a, b) => a.term.localeCompare(b.term))) {
    console.log(`${e.term.padEnd(24)} ${C.accent}${primaryKana(e)}${C.off}`);
  }
  process.exit(0);
}

if (args[0] === '--divergence') {
  for (const e of entries.filter((x) => x.divergence)) {
    console.log(`${e.term.padEnd(24)} ${C.accent}${primaryKana(e)}${C.off}`);
  }
  process.exit(0);
}

const json = args[0] === '--json';
const query = (json ? args.slice(1) : args).join(' ');
const hits = search(entries, query);

if (hits.length === 0) {
  console.error(`「${query}」は未収録です。追加のリクエストはこちら:`);
  console.error('  https://github.com/konweb/nanteyomu/issues/new');
  process.exit(1);
}

if (json) {
  console.log(JSON.stringify(hits.length === 1 ? hits[0] : hits, null, 2));
  process.exit(0);
}

if (hits.length === 1 || hits[0].term.toLowerCase() === query.trim().toLowerCase()) {
  render(hits[0]);
} else {
  console.log(`\n${hits.length} 件ヒット:`);
  for (const e of hits) console.log(`  ${e.term.padEnd(24)} ${C.accent}${primaryKana(e)}${C.off}`);
  console.log();
}
