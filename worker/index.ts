/**
 * 「タメになった」ボタンの API。
 *
 * サイト本体は静的アセットのままで、wrangler.jsonc の run_worker_first に
 * 挙げた /api/tame/* だけがこの Worker に来る。それ以外のパスは
 * これまでどおり Cloudflare のアセット配信がそのまま処理する。
 *
 *   GET  /api/tame/<slug>  -> { slug, count }
 *   POST /api/tame/<slug>  -> { slug, count, counted }
 *
 * counted が false なら「その IP はその日すでに押している」ので数えていない。
 */

export interface Env {
  REACTIONS: D1Database;
  ASSETS: Fetcher;
  /** 投票ハッシュの salt。未設定でも動くが、設定しておくのが望ましい */
  VOTE_SALT?: string;
}

/** 存在しない slug で行を作られないよう、実データの slug だけを受け付ける。 */
let slugCache: Set<string> | null = null;

/**
 * テーブルがまだ無ければ作る。migrations/0001_reactions.sql と同じ内容。
 *
 * 管理画面で D1 を作っただけでもボタンが動くようにしておくため、
 * アイソレートごとに一度だけ流す。IF NOT EXISTS なので何度流しても同じ。
 * スキーマを変えるときは migrations 側とここの両方を直す。
 */
let ready: Promise<unknown> | null = null;

function ensureSchema(env: Env): Promise<unknown> {
  ready ??= env.REACTIONS.batch([
    env.REACTIONS.prepare(
      'CREATE TABLE IF NOT EXISTS reactions (slug TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0)',
    ),
    env.REACTIONS.prepare(
      'CREATE TABLE IF NOT EXISTS votes (id TEXT NOT NULL PRIMARY KEY, day TEXT NOT NULL)',
    ),
    env.REACTIONS.prepare('CREATE INDEX IF NOT EXISTS votes_day ON votes (day)'),
  ]).catch((e) => {
    // 失敗を握ったままにすると以後ずっと同じ失敗を返すので、次回やり直せるようにする
    ready = null;
    throw e;
  });
  return ready;
}

async function knownSlugs(env: Env): Promise<Set<string>> {
  if (slugCache) return slugCache;
  // アセットとして配信している全データをそのまま流用する
  const res = await env.ASSETS.fetch('https://nanteyomu.dev/api/entries.json');
  if (!res.ok) throw new Error(`entries.json ${res.status}`);
  const data = (await res.json()) as { entries: { slug: string }[] };
  slugCache = new Set(data.entries.map((e) => e.slug));
  return slugCache;
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { 'content-type': 'application/json; charset=utf-8', ...init.headers },
  });

/** JST での日付。日本向けのサイトなので、日付の区切りも JST に合わせる。 */
function today(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function voteId(env: Env, ip: string, slug: string, day: string): Promise<string> {
  const salt = env.VOTE_SALT ?? 'nanteyomu';
  const buf = new TextEncoder().encode(`${salt}|${ip}|${slug}|${day}`);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function countOf(env: Env, slug: string): Promise<number> {
  const row = await env.REACTIONS.prepare('SELECT count FROM reactions WHERE slug = ?')
    .bind(slug)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/api\/tame\/([^/]+)\/?$/);

    // run_worker_first の対象外が届いた場合はアセットに戻す
    if (!m) return env.ASSETS.fetch(request);

    await ensureSchema(env);

    const slug = decodeURIComponent(m[1]);
    if (!(await knownSlugs(env)).has(slug)) {
      return json({ error: 'unknown slug' }, { status: 404 });
    }

    if (request.method === 'GET') {
      return json({ slug, count: await countOf(env, slug) }, {
        // 押した本人の表示は楽観更新で先に動くので、短いキャッシュで足りる
        headers: { 'cache-control': 'public, max-age=30' },
      });
    }

    if (request.method !== 'POST') {
      return json({ error: 'method not allowed' }, { status: 405, headers: { allow: 'GET, POST' } });
    }

    const ip = request.headers.get('cf-connecting-ip') ?? '';
    const day = today();
    const id = await voteId(env, ip, slug, day);

    // 同じ IP / 同じ語 / 同じ日は 1 回だけ数える
    const claim = await env.REACTIONS.prepare('INSERT OR IGNORE INTO votes (id, day) VALUES (?, ?)')
      .bind(id, day)
      .run();
    const counted = (claim.meta.changes ?? 0) > 0;

    if (!counted) return json({ slug, count: await countOf(env, slug), counted: false });

    const row = await env.REACTIONS.prepare(
      `INSERT INTO reactions (slug, count) VALUES (?, 1)
       ON CONFLICT(slug) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
      .bind(slug)
      .first<{ count: number }>();

    // ときどき古い痕跡を掃除する。専用の cron を増やさずに済ませる
    if (Math.random() < 0.02) {
      const limit = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
      await env.REACTIONS.prepare('DELETE FROM votes WHERE day < ?').bind(limit).run();
    }

    return json({ slug, count: row?.count ?? 1, counted: true });
  },
} satisfies ExportedHandler<Env>;
