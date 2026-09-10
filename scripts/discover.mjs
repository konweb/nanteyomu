#!/usr/bin/env node
/**
 * 新しく出たツールの候補を集める。
 *
 * このスクリプトは「候補の一覧」しか作らない。読みを勝手に決めて語を追加することは
 * しない。nanteyomu は出典のない読みを断定しないことを前提にしているので、
 * 収集は機械、読みの確定は人（と entry-verify）の担当に分けている。
 *
 *   node scripts/discover.mjs
 *
 * 出力:
 *   discovery/candidates.md  今回の候補一覧（PR 本文にもそのまま使う）
 *   discovery/seen.json      一度出した名前。翌週も同じものを並べないための記録
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEEN_PATH = join(ROOT, 'discovery/seen.json');
const OUT_PATH = join(ROOT, 'discovery/candidates.md');

/** 1 回の PR で並べる上限。多すぎると誰も見ないので絞る。 */
const MAX = 25;
/** トピックごとの採用上限。星の数だけで並べると AI 系が全部埋めてしまう。 */
const PER_TOPIC = 3;
/** AI 系トピックの合計上限。同じ理由で、辞典としての偏りを避ける。 */
const AI_CAP = 8;
const AI_TOPICS = new Set(['llm', 'ai-agents', 'agent']);
/** GitHub 側の足切り。新しくてこの数を超えていれば話題になったとみなす。 */
const MIN_STARS = 400;
/** 「新しく出た」の範囲。これより古い作成日は拾わない。 */
const MONTHS = 18;

/** 英数字だけにして比較する。check-duplicate.mjs と同じ考え方。 */
const norm = (s) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * ツールではないリポジトリを落とす。
 * awesome 系・学習教材・設定集は星が多くても辞典には載らない。
 */
const NOT_A_TOOL = [
  /^awesome/, /awesome$/, /tutorial/, /examples?$/, /^learn/, /roadmap/, /cheat/,
  /course/, /^book/, /books$/, /dotfiles/, /interview/, /^resume/, /templates?$/,
  /boilerplate/, /starter/, /^hello/, /playground/, /^test/, /demo$/, /^my-/,
  /guide$/, /handbook/, /notes$/, /^100-/, /^30-days/, /papers?$/, /^list-of/,
  /collection$/, /resources$/, /^free-/, /^public-apis/,
  // 実際に拾ってしまったもの。ツール名ではなく取り組みや成果物の名前
  /best.?practice/, /prompts?$/, /leaks?/, /^system[_-]/, /analysis$/, /_analysis/,
  /skill$/, /skills$/, /^ai-/, /-ai$/,
];

/**
 * 語として扱える形か。
 * ツール名はふつう 1〜2 語で、claude-code-best-practice のような
 * 説明文めいた名前は辞典には載らない。
 */
const shortName = (name) => name.split(/[-_.]/).filter(Boolean).length <= 2;

const isTool = (name) => {
  const n = name.toLowerCase();
  return !NOT_A_TOOL.some((re) => re.test(n));
};

/** 名前として扱えないものを落とす。 */
const usableName = (name) =>
  name.length >= 2 && name.length <= 28 && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name);

/**
 * 説明文を表の 1 セルに収める。
 *
 * 説明は GitHub と Hacker News から来る他人の書いた文字列なので、
 * 表を壊したりリンクとして描画されたりしないよう落としてから入れる。
 * バックスラッシュを先に処理しないと、\\| のような入力で
 * エスケープ自体をすり抜けられる。
 */
const cell = (s) =>
  (s ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/[<>[\]]/g, '')
    .trim();

/** 説明は上流が書いた文をそのまま使う。長いときだけ語の切れ目で丸める。 */
const summarize = (s) => {
  const t = cell(s);
  if (t.length <= 120) return t;
  const cut = t.slice(0, 120);
  const sp = cut.lastIndexOf(' ');
  return (sp > 80 ? cut.slice(0, sp) : cut) + '…';
};

/** URL も他人の入力。http(s) 以外と、表を壊す文字を通さない。 */
const safeUrl = (u) => {
  try {
    const url = new URL(u);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    return url.href.replace(/[|\s<>()[\]]/g, encodeURIComponent);
  } catch {
    return '';
  }
};

async function getJSON(url, headers = {}) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'nanteyomu-discovery', accept: 'application/json', ...headers },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.json();
}

/** GitHub の検索。トピックごとに、新しくて星が伸びたリポジトリを拾う。 */
async function fromGitHub(since) {
  const token = process.env.GITHUB_TOKEN;
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  // nanteyomu のカテゴリに対応するトピックを並べる
  const topics = [
    'cli', 'developer-tools', 'terminal',
    'framework', 'web-framework',
    'database', 'orm', 'sql',
    'devops', 'kubernetes', 'observability', 'networking', 'proxy',
    'llm', 'ai-agents', 'agent',
    'compiler', 'programming-language',
    'build-tool', 'bundler', 'linter', 'testing',
  ];
  const out = [];
  for (const topic of topics) {
    const q = `topic:${topic} created:>${since} stars:>=${MIN_STARS}`;
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=20`;
    let data;
    try {
      data = await getJSON(url, headers);
    } catch (e) {
      console.error(`  GitHub (${topic}) 取得失敗: ${e.message}`);
      continue;
    }
    let taken = 0;
    for (const r of data.items ?? []) {
      if (taken >= PER_TOPIC) break;
      if (!usableName(r.name) || !isTool(r.name) || !shortName(r.name)) continue;
      taken++;
      out.push({
        name: r.name,
        url: r.html_url,
        homepage: r.homepage || null,
        stars: r.stargazers_count,
        desc: (r.description ?? '').trim(),
        created: r.created_at.slice(0, 10),
        source: `GitHub topic:${topic}`,
        topic,
      });
    }
    // 検索 API は認証ありで毎分 30 回。余裕をもって間隔を空ける
    await new Promise((r) => setTimeout(r, 2500));
  }
  return out;
}

/** Show HN。GitHub の星より早く話題が出るので、新しさの補完に使う。 */
async function fromHackerNews(sinceTs) {
  const url = `https://hn.algolia.com/api/v1/search_by_date?tags=show_hn&numericFilters=points>=100,created_at_i>${sinceTs}&hitsPerPage=100`;
  let data;
  try {
    data = await getJSON(url);
  } catch (e) {
    console.error(`  Hacker News 取得失敗: ${e.message}`);
    return [];
  }
  const out = [];
  for (const h of data.hits ?? []) {
    // 「Show HN: Foo – 説明」から Foo を取り出す
    const m = (h.title ?? '').match(/^Show HN:\s*([^–—\-:(]{2,40})/i);
    if (!m) continue;
    const name = m[1].trim().split(/\s+/)[0].replace(/[,.]$/, '');
    if (!usableName(name)) continue;
    out.push({
      name,
      url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      homepage: h.url || null,
      stars: null,
      points: h.points,
      desc: (h.title ?? '').replace(/^Show HN:\s*/i, '').trim(),
      created: (h.created_at ?? '').slice(0, 10),
      source: 'Show HN',
    });
  }
  return out;
}

/**
 * 公式サイトが生きているか見る。
 *
 * GitHub の homepage は放置されて死んでいることがあるので、繋がらないものは
 * 落としてリポジトリだけ載せる。ここで確かめるのは到達性だけで、
 * その製品のサイトかどうかの判断は entry-verify の担当。
 */
async function liveUrl(u) {
  if (!u) return null;
  let url;
  try {
    url = new URL(u);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  // リポジトリ自身を指しているだけなら公式サイトとは呼べない
  if (/(^|\.)github\.com$/.test(url.hostname)) return null;
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      headers: { 'user-agent': 'nanteyomu-discovery' },
    });
    return res.ok ? res.url.replace(/\/$/, '') : null;
  } catch {
    return null;
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
        out[n] = await fn(items[n]);
      }
    }),
  );
  return out;
}

function loadRegistered() {
  const p = join(ROOT, 'packages/data/generated/entries.json');
  if (!existsSync(p)) {
    console.error('generated/entries.json がありません。先に `pnpm run data` を実行してください。');
    process.exit(2);
  }
  const set = new Set();
  for (const e of JSON.parse(readFileSync(p, 'utf8'))) {
    set.add(norm(e.slug));
    set.add(norm(e.term));
    for (const a of e.aliases ?? []) set.add(norm(a));
  }
  return set;
}

const iso = (d) => d.toISOString().slice(0, 10);

async function main() {
  const now = new Date();
  const since = iso(new Date(now.getTime() - MONTHS * 30 * 86400_000));
  const hnSince = Math.floor((now.getTime() - 30 * 86400_000) / 1000);

  const registered = loadRegistered();
  const seen = new Set(existsSync(SEEN_PATH) ? JSON.parse(readFileSync(SEEN_PATH, 'utf8')).seen : []);

  console.error(`収録済み ${registered.size} 件 / 既出 ${seen.size} 件 と照合します`);

  const found = [...(await fromGitHub(since)), ...(await fromHackerNews(hnSince))];
  console.error(`取得 ${found.length} 件`);

  // 名寄せして、収録済み・既出・ツールでないものを落とす
  const byName = new Map();
  for (const c of found) {
    const k = norm(c.name);
    if (!k || registered.has(k) || seen.has(k)) continue;
    if (!usableName(c.name) || !isTool(c.name) || !shortName(c.name)) continue;
    // 同じ名前が複数ソースで来たら、星の多い方を残す
    const prev = byName.get(k);
    if (!prev || (c.stars ?? 0) > (prev.stars ?? 0)) byName.set(k, c);
  }

  const ranked = [...byName.values()].sort(
    (a, b) => (b.stars ?? b.points ?? 0) - (a.stars ?? a.points ?? 0),
  );
  const picked = [];
  let ai = 0;
  for (const c of ranked) {
    if (picked.length >= MAX) break;
    if (AI_TOPICS.has(c.topic)) {
      if (ai >= AI_CAP) continue;
      ai++;
    }
    picked.push(c);
  }

  console.error(`候補 ${picked.length} 件。公式サイトの到達性を確認します`);
  const homes = await mapLimit(picked, 6, (c) => liveUrl(c.homepage));
  picked.forEach((c, i) => (c.site = homes[i]));
  console.error(`公式サイトあり ${homes.filter(Boolean).length} 件`);

  const week = iso(now);
  const lines = [
    '# 語の候補',
    '',
    `最終更新: ${week}（scripts/discover.mjs が自動生成）`,
    '',
    '新しく出たツールを機械的に集めたものです。**読みはまだ調べていません。**',
    '説明は各プロジェクト自身が書いたものをそのまま載せています（訳していません）。',
    '追加するときは entry-verify で重複と公式サイトと読みの出典を確かめてから、',
    'entry-add で登録してください。載せる価値がないものはそのまま無視して構いません',
    '（一度出した名前は seen.json に記録され、翌週以降は並びません）。',
    '',
  ];

  if (picked.length === 0) {
    lines.push('今回は新しい候補がありませんでした。', '');
  } else {
    lines.push('| 名前 | 何のツールか | 公式サイト | リポジトリ | 星 / points | 公開 |');
    lines.push('|---|---|---|---|---|---|');
    for (const c of picked) {
      const n = c.stars != null ? `${c.stars}★` : `${c.points}pt`;
      const site = c.site ? `[${new URL(c.site).hostname}](${safeUrl(c.site)})` : '—';
      const repo = /github\.com/.test(c.url) ? `[${c.url.split('/').slice(-2).join('/')}](${safeUrl(c.url)})` : '—';
      lines.push(`| \`${c.name}\` | ${summarize(c.desc)} | ${site} | ${repo} | ${n} | ${c.created} |`);
    }
    lines.push('');
  }

  writeFileSync(OUT_PATH, lines.join('\n'), 'utf8');
  // 今回出したものは既出に回す。拾わなかったものは翌週また候補になり得る
  for (const c of picked) seen.add(norm(c.name));
  writeFileSync(SEEN_PATH, JSON.stringify({ seen: [...seen].sort() }, null, 2) + '\n', 'utf8');

  // ワークフローが件数で分岐できるよう標準出力に出す
  console.log(picked.length);
}

main().catch((e) => {
  console.error(`収集に失敗しました: ${e.message}`);
  process.exit(1);
});
