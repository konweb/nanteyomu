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
 * 出力（環境変数で差し替えられる）:
 *   OUT_PATH   今回の候補一覧。Issue 本文にそのまま使う
 *   SEEN_PATH  一度出した名前。翌週も同じものを並べないための記録
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// 既出の記録と出力先。ワークフローからは discovery-state ブランチの
// seen.json と、Issue 本文にするための一時ファイルを指す。
const SEEN_PATH = process.env.SEEN_PATH ?? join(ROOT, 'discovery/seen.json');
const OUT_PATH = process.env.OUT_PATH ?? join(ROOT, 'discovery/candidates.md');

/** 1 回の PR で並べる上限。多すぎると誰も見ないので絞る。 */
const MAX = 10;
/** トピックごとの採用上限。星の数だけで並べると AI 系が全部埋めてしまう。 */
const PER_TOPIC = 3;
/**
 * AI 系トピックの合計上限。同じ理由で、辞典としての偏りを避ける。
 * MAX を変えても偏り方が変わらないよう、割合で決める。
 */
const AI_CAP = Math.max(1, Math.round(MAX * 0.5));
const AI_TOPICS = new Set(['llm', 'ai-agents', 'agent']);
/**
 * 出どころごとの枠。GitHub の星は桁が大きいので、素直に並べると
 * npm と Cloudflare が一件も入らない。先に席を取っておく。
 * 埋まらなかった席は他の出どころが使う。
 */
const SOURCE_CAP = { hn: 4, github: 3, huggingface: 2, npm: 1, cloudflare: 1 };
/** GitHub 側の足切り。新しくてこの数を超えていれば話題になったとみなす。 */
const MIN_STARS = 400;
/** 直近で急に伸びたものを別枠で拾うときの窓と足切り。 */
const HOT_DAYS = 90;
const HOT_STARS = 100;

/**
 * 出どころをまたいで並べるための目盛り。
 *
 * 星の数・HN の点数・npm のスコア・Hugging Face のいいね・日付は
 * そのままでは桁が全く違い、比べると日付が常に勝ってしまう。
 * どれも「だいたい 100 が上限」になるよう揃えてから順位にする。
 */
const scale = (value, full) => Math.min(100, (value / full) * 100);
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
  const hotSince = iso(new Date(Date.now() - HOT_DAYS * 86400_000));
  // 各トピックを 2 通りで引く。18 か月の窓は定着したもの、90 日の窓は
  // まだ星は少ないが急に伸びているものを拾うため。
  const queries = [];
  for (const topic of topics) {
    queries.push({ topic, q: `topic:${topic} created:>${since} stars:>=${MIN_STARS}` });
    queries.push({ topic, q: `topic:${topic} created:>${hotSince} stars:>=${HOT_STARS}`, hot: true });
  }

  const out = [];
  for (const { topic, q, hot } of queries) {
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=20`;
    let data;
    try {
      data = await getJSON(url, headers);
    } catch (e) {
      console.error(`  GitHub (${topic}${hot ? ' 新着' : ''}) 取得失敗: ${e.message}`);
      continue;
    }
    let taken = 0;
    for (const r of data.items ?? []) {
      if (taken >= (hot ? 2 : PER_TOPIC)) break;
      if (!usableName(r.name) || !isTool(r.name) || !shortName(r.name)) continue;
      taken++;
      out.push({
        name: r.name,
        url: r.html_url,
        homepage: r.homepage || null,
        stars: r.stargazers_count,
        desc: (r.description ?? '').trim(),
        created: r.created_at.slice(0, 10),
        metric: `${r.stargazers_count}★`,
        // 総量ではなく 1 日あたりの伸びで並べる。1 年かけて 2 万の語より、
        // 1 か月で 5 千の語の方が「いま出てきたもの」に近いため。
        rank: scale(r.stargazers_count / Math.max(ageDays(r.created_at), 7), 100),
        source: `GitHub topic:${topic}${hot ? '（新着）' : ''}`,
        topic,
        family: 'github',
      });
    }
    // 検索 API は認証ありで毎分 30 回。余裕をもって間隔を空ける
    await new Promise((r) => setTimeout(r, 2500));
  }
  return out;
}

/**
 * npm。こちらは「新しい」ではなく「人気があるのに未収録」を埋める。
 *
 * time.created は名前の予約時点になっていることが多く（rolldown が 2017 年）
 * 新しさの判定に使えない。かわりに検索スコアの高いものを見て、
 * 収録済みと突き合わせて抜けを拾う。
 */
async function fromNpm() {
  const keywords = [
    'bundler', 'linter', 'formatter', 'test-runner', 'orm', 'state-management',
    'css-in-js', 'router', 'validation', 'monorepo', 'ui-components', 'build-tool',
  ];
  // プラットフォーム別バイナリやプラグインは製品名ではない
  const NOISE = [
    /^@/, /-(binding|linux|darwin|win32|android|wasm32)-/, /^(eslint|babel|postcss|vite|rollup|webpack)-(plugin|config|preset)/,
    /-(plugin|preset|config|loader|polyfill|shim|types|cli)$/, /^types-/, /^is-/, /^node-/,
  ];
  const out = [];
  for (const kw of keywords) {
    const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(`keywords:${kw}`)}&size=10&popularity=1.0`;
    let data;
    try {
      data = await getJSON(url);
    } catch (e) {
      console.error(`  npm (${kw}) 取得失敗: ${e.message}`);
      continue;
    }
    let taken = 0;
    for (const o of data.objects ?? []) {
      if (taken >= 3) break;
      const name = o.package?.name ?? '';
      if (NOISE.some((re) => re.test(name))) continue;
      if (!usableName(name) || !isTool(name) || !shortName(name)) continue;
      taken++;
      // git+https://github.com/o/r.git -> https://github.com/o/r
      const repo = (o.package.links?.repository ?? '')
        .replace(/^git\+/, '')
        .replace(/\.git$/, '');
      out.push({
        name,
        url: repo || o.package.links?.npm || '',
        homepage: o.package.links?.homepage ?? null,
        metric: `npm ${o.score?.final != null ? o.score.final.toFixed(1) : '?'}`,
        rank: scale(o.score?.final ?? 0, 100),
        desc: (o.package.description ?? '').trim(),
        created: (o.package.date ?? '').slice(0, 10),
        source: `npm keywords:${kw}`,
        family: 'npm',
      });
    }
    await new Promise((r) => setTimeout(r, 700));
  }
  return out;
}

/**
 * Cloudflare の changelog。製品名は他所から拾いにくいので専用に見る。
 *
 * タイトルが「製品名 - 内容」の形なので、頭を取って製品名にする。
 * フィードに初めて出た日が新しいものほど、新しく出た製品とみなす。
 */
async function fromCloudflare(since) {
  // 製品名の位置に来るが、語として登録する対象ではない一般語
  const GENERIC = new Set([
    'logs', 'rules', 'cache', 'dns', 'analytics', 'billing', 'api', 'dashboard',
    'account', 'ssl/tls', 'ssl', 'tls', 'network', 'security', 'settings',
    'documentation', 'docs', 'pricing', 'terraform', 'changelog',
  ]);
  let xml;
  try {
    const res = await fetch('https://developers.cloudflare.com/changelog/rss/index.xml', {
      redirect: 'follow',
      signal: AbortSignal.timeout(30000),
      headers: { 'user-agent': 'nanteyomu-discovery' },
    });
    if (!res.ok) throw new Error(`${res.status}`);
    xml = await res.text();
  } catch (e) {
    console.error(`  Cloudflare changelog 取得失敗: ${e.message}`);
    return [];
  }

  // 製品ごとに、フィードに出た最も古い日を覚える
  const first = new Map();
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const item = m[1];
    const title = item.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
    const link = item.match(/<link>([^<]*)<\/link>/)?.[1] ?? '';
    const date = item.match(/<pubDate>([^<]*)<\/pubDate>/)?.[1] ?? '';
    const day = date ? new Date(date).toISOString().slice(0, 10) : '';
    if (!title || !day) continue;
    for (const raw of title.split(' - ')[0].split(/,\s*/)) {
      const name = raw.trim();
      if (!name || name.length > 40 || GENERIC.has(name.toLowerCase())) continue;
      const prev = first.get(name);
      // 説明は題から製品名の部分を落とす。表で二重に出るのを避ける
      const desc = title.split(' - ').slice(1).join(' - ') || title;
      if (!prev || day < prev.day) first.set(name, { day, desc, link });
    }
  }

  return [...first.entries()]
    // 初出が新しいものだけ。古くからある製品は既に収録されているか、対象外
    .filter(([, v]) => v.day >= since)
    .map(([name, v]) => ({
      name,
      url: v.link || 'https://developers.cloudflare.com/changelog/',
      homepage: null,
      metric: `初出 ${v.day}`,
      // 初出が近いものほど高く。90 日前で 0 になる
      rank: Math.max(0, scale(90 - ageDays(v.day), 90)),
      desc: v.desc,
      created: v.day,
      source: 'Cloudflare changelog',
      family: 'cloudflare',
    }));
}

/** 題の先頭に来ても製品名ではない語。 */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'my', 'our', 'we', 'i', 'how', 'why', 'what', 'this', 'that',
  'introducing', 'open', 'free', 'building', 'built', 'made', 'making', 'using',
  'from', 'to', 'for', 'with', 'after', 'yet', 'another', 'simple', 'tiny', 'fast',
  'new', 'better', 'best', 'first', 'local', 'self', 'you', 'your', 'it', 'is',
]);

/**
 * 題から製品名を取り出す。
 *
 * 「Foo – 説明」「Foo: 説明」「Introducing Foo」という 3 つの形で、
 * 新しいツールやモデルの発表のほとんどを拾える。
 * 文らしい題（動詞や助動詞が続くもの）は製品名ではないので捨てる。
 */
function namesFromTitle(title) {
  const t = (title ?? '').replace(/^Show HN:\s*/i, '').trim();
  const out = [];

  // 発表ではなく「そのツールについての報道・議論」の題は製品名を拾っても
  // 意味がない。論文（[pdf]）、問いかけ、続報の言い回しで落とす。
  if (/\[pdf\]|\?\s*$|\b(no longer|has been|have been|is dead|shutting down|acquired by)\b/i.test(t)) {
    return out;
  }

  const push = (raw) => {
    const n = (raw ?? '').trim().replace(/[,.?!]+$/, '');
    if (!n || n.length > 28) return;
    // 「Foo 2.1」「Tcl/Tk」のように版番号やスラッシュを含む名前は残す
    if (!/^[A-Za-z0-9][A-Za-z0-9._\/+-]*( [A-Za-z0-9][A-Za-z0-9._+-]*){0,2}$/.test(n)) return;
    if (STOPWORDS.has(n.split(/\s+/)[0].toLowerCase())) return;
    if (!out.includes(n)) out.push(n);
  };

  // Introducing Foo / Introducing Foo and Bar
  const intro = t.match(/^Introducing\s+(.+)$/i);
  if (intro) {
    for (const part of intro[1].split(/\s+and\s+/i)) push(part);
    if (out.length) return out.slice(0, 2);
  }

  // Foo – 説明 / Foo — 説明 / Foo: 説明
  const split = t.match(/^([^–—:]{2,40})\s*[–—:]\s*\S/);
  if (split) push(split[1]);

  return out.slice(0, 2);
}

/**
 * Hacker News。GitHub の星より早く話題が出るので、新しさの要になる出どころ。
 *
 * Show HN だけだと個人の発表しか拾えず、AI モデルの発表を丸ごと取り逃す。
 * 一般の記事も高得点のものだけ見る（Jev や GPT の発表はこちらに出る）。
 */
async function fromHackerNews(sinceTs) {
  const runs = [
    { tags: 'show_hn', min: 100, label: 'Show HN' },
    { tags: 'story', min: 250, label: 'Hacker News' },
  ];
  const out = [];
  for (const { tags, min, label } of runs) {
    // search_by_date ではなく search を使う。日付順だと 1 ページ 100 件で
    // 直近 1 週間分しか遡れず、期間の頭で起きた発表を丸ごと取り逃す
    // （実際 Jev の発表がそれで落ちていた）。人気順なら 30 日を覆える。
    const url =
      `https://hn.algolia.com/api/v1/search?tags=${tags}` +
      `&numericFilters=${encodeURIComponent(`points>=${min},created_at_i>${sinceTs}`)}&hitsPerPage=100`;
    let data;
    try {
      data = await getJSON(url);
    } catch (e) {
      console.error(`  ${label} 取得失敗: ${e.message}`);
      continue;
    }
    for (const h of data.hits ?? []) {
      for (const name of namesFromTitle(h.title)) {
        out.push({
          name,
          url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
          homepage: h.url || null,
          metric: `${h.points}pt`,
          rank: scale(h.points, 2000),
          desc: (h.title ?? '').replace(/^Show HN:\s*/i, '').trim(),
          created: (h.created_at ?? '').slice(0, 10),
          source: label,
          family: 'hn',
        });
      }
    }
  }
  return out;
}

/**
 * Hugging Face。公開されている AI モデルはここに集まるので、
 * 新しいモデルを拾うにはこの出どころが要る。
 *
 * 新着順は各自の実験用アップロードばかりになるので、注目度順で見る。
 */
async function fromHuggingFace() {
  // 量子化・派生・個人の実験は製品名ではない
  const NOISE = [
    /gguf/i, /awq/i, /gptq/i, /-int[48]/i, /uncensored/i, /abliterated/i,
    /-lora/i, /finetune/i, /fine[_-]?tuned/i, /test/i, /demo/i, /^my/i,
    /merge/i, /-exl2/i, /^untitled/i,
  ];
  let data;
  try {
    data = await getJSON('https://huggingface.co/api/models?sort=trendingScore&direction=-1&limit=40');
  } catch (e) {
    console.error(`  Hugging Face 取得失敗: ${e.message}`);
    return [];
  }
  const out = [];
  for (const m of data ?? []) {
    const id = m.id ?? '';
    const name = id.split('/').pop() ?? '';
    if (NOISE.some((re) => re.test(id))) continue;
    if (!usableName(name) || !isTool(name) || !shortName(name)) continue;
    out.push({
      name,
      url: `https://huggingface.co/${id}`,
      homepage: null,
      metric: `HF ${m.likes ?? 0}♥`,
      rank: scale(m.likes ?? 0, 5000),
      desc: `${m.pipeline_tag ?? 'model'} — ${id}`,
      created: (m.createdAt ?? '').slice(0, 10),
      source: 'Hugging Face',
      family: 'huggingface',
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

/** 公開からの日数。伸びの速さを測るのに使う。 */
const ageDays = (createdAt) =>
  Math.max(1, (Date.now() - new Date(createdAt).getTime()) / 86400_000);

async function main() {
  const now = new Date();
  const since = iso(new Date(now.getTime() - MONTHS * 30 * 86400_000));
  const hnSince = Math.floor((now.getTime() - 30 * 86400_000) / 1000);

  const registered = loadRegistered();
  const seen = new Set(existsSync(SEEN_PATH) ? JSON.parse(readFileSync(SEEN_PATH, 'utf8')).seen : []);

  console.error(`収録済み ${registered.size} 件 / 既出 ${seen.size} 件 と照合します`);

  const found = [
    ...(await fromGitHub(since)),
    ...(await fromHackerNews(hnSince)),
    ...(await fromNpm()),
    ...(await fromCloudflare(since)),
    ...(await fromHuggingFace()),
  ];
  console.error(`取得 ${found.length} 件`);

  // 名寄せして、収録済み・既出・ツールでないものを落とす
  const byName = new Map();
  for (const c of found) {
    const k = norm(c.name);
    if (!k || registered.has(k) || seen.has(k)) continue;
    if (!usableName(c.name) || !isTool(c.name) || !shortName(c.name)) continue;
    // 同じ名前が複数ソースで来たら、星の多い方を残す
    const prev = byName.get(k);
    if (!prev || (c.rank ?? 0) > (prev.rank ?? 0)) byName.set(k, c);
  }

  const ranked = [...byName.values()].sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0));
  const picked = [];
  const used = {};
  let ai = 0;

  /** 枠を見ながら詰める。ignoreCap のときは余った席を埋めるだけ。 */
  const fill = (ignoreCap) => {
    for (const c of ranked) {
      if (picked.length >= MAX) return;
      if (picked.includes(c)) continue;
      const cap = SOURCE_CAP[c.family] ?? MAX;
      if (!ignoreCap && (used[c.family] ?? 0) >= cap) continue;
      if (AI_TOPICS.has(c.topic)) {
        if (ai >= AI_CAP) continue;
        ai++;
      }
      used[c.family] = (used[c.family] ?? 0) + 1;
      picked.push(c);
    }
  };
  fill(false);
  // 出どころによっては候補が無いこともある。空いた席は他から埋める
  fill(true);

  console.error(`候補 ${picked.length} 件。公式サイトの到達性を確認します`);
  const homes = await mapLimit(picked, 6, (c) => liveUrl(c.homepage));
  picked.forEach((c, i) => (c.site = homes[i]));
  console.error(`公式サイトあり ${homes.filter(Boolean).length} 件`);

  const week = iso(now);
  const lines = [
    `新しく出たツールを機械的に集めた候補です（${week} 時点）。**読みはまだ調べていません。**`,
    '説明は各プロジェクト自身が書いたものをそのまま載せています（訳していません）。',
    '',
    '追加するときは `entry-verify` で重複・公式サイト・読みの出典を確かめてから',
    '`entry-add` で登録してください。載せる価値がないものは無視して構いません',
    '（一度出した名前は記録され、翌週以降は並びません）。',
    '',
  ];

  if (picked.length === 0) {
    lines.push('今回は新しい候補がありませんでした。', '');
  } else {
    lines.push('| 名前 | 何のツールか | 公式サイト | リポジトリ | 目安 | 出どころ |');
    lines.push('|---|---|---|---|---|---|');
    for (const c of picked) {
      const n = c.metric ?? '—';
      const site = c.site ? `[${new URL(c.site).hostname}](${safeUrl(c.site)})` : '—';
      const repo = c.url
        ? `[${/github\.com/.test(c.url) ? c.url.split('/').slice(-2).join('/') : new URL(c.url).hostname}](${safeUrl(c.url)})`
        : '—';
      lines.push(`| \`${c.name}\` | ${summarize(c.desc)} | ${site} | ${repo} | ${n} | ${c.source} |`);
    }
    lines.push('');
  }

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, lines.join('\n'), 'utf8');
  // 今回出したものは既出に回す。拾わなかったものは翌週また候補になり得る
  for (const c of picked) seen.add(norm(c.name));
  mkdirSync(dirname(SEEN_PATH), { recursive: true });
  writeFileSync(SEEN_PATH, JSON.stringify({ seen: [...seen].sort() }, null, 2) + '\n', 'utf8');

  // ワークフローが件数で分岐できるよう標準出力に出す
  console.log(picked.length);
}

main().catch((e) => {
  console.error(`収集に失敗しました: ${e.message}`);
  process.exit(1);
});
