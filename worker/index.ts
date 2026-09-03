/**
 * 「タメになった」ボタンの API。
 *
 * サイト本体は静的アセットのままで、wrangler.jsonc の run_worker_first に
 * 挙げた /api/tame/* だけがこの Worker に来る。それ以外のパスは
 * これまでどおり Cloudflare のアセット配信がそのまま処理する。
 *
 *   GET  /api/tame/<slug>  -> { slug, count }
 *   POST /api/tame/<slug>  -> { slug, count }
 *
 * 「同じ人が何度も押す」を防ぐのはブラウザ側の localStorage だけで、
 * サーバー側に投票者の記録は一切残さない。かわりに POST は自サイトからの
 * fetch だけ受け付け、素の curl で書き込み枠を食われないようにする。
 */

export interface Env {
  REACTIONS: D1Database;
  ASSETS: Fetcher;
}

/**
 * 加算はこのサイトのページ上の操作だけ受け付ける。
 *
 * ブラウザは同一オリジンでも POST には Origin を付ける。付かない古い環境の
 * ために Referer も見る。決意のある相手は偽装できるが、素の curl を弾ければ
 * 書き込み枠を守る目的には足りる。
 *
 * 比較先はリクエスト自身のオリジンにしてある。本番のドメインを直に書くと
 * wrangler dev の localhost で弾かれてしまうため。
 */
function fromOwnSite(request: Request, self: string): boolean {
  const origin = request.headers.get('origin');
  if (origin) return origin === self;
  const referer = request.headers.get('referer');
  return referer ? referer.startsWith(`${self}/`) : false;
}

/** 存在しない slug で行を作られないよう、実データの slug だけを受け付ける。 */
let slugCache: Set<string> | null = null;

async function knownSlugs(env: Env): Promise<Set<string>> {
  if (slugCache) return slugCache;
  // アセットとして配信している全データをそのまま流用する
  const res = await env.ASSETS.fetch('https://nanteyomu.dev/api/entries.json');
  if (!res.ok) throw new Error(`entries.json ${res.status}`);
  const data = (await res.json()) as { entries: { slug: string }[] };
  slugCache = new Set(data.entries.map((e) => e.slug));
  return slugCache;
}

/**
 * テーブルがまだ無ければ作る。migrations と同じ内容。
 *
 * 管理画面で D1 を作っただけの状態でも動くよう、アイソレートごとに一度流す。
 * votes は投票者ごとの痕跡を残していた旧方式のテーブルで、もう使わないので消す
 * （migrations/0002 を適用済みなら何もしない）。
 */
let ready: Promise<unknown> | null = null;

function ensureSchema(env: Env): Promise<unknown> {
  ready ??= env.REACTIONS.batch([
    env.REACTIONS.prepare(
      'CREATE TABLE IF NOT EXISTS reactions (slug TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0)',
    ),
    env.REACTIONS.prepare('DROP TABLE IF EXISTS votes'),
  ]).catch((e) => {
    // 失敗を握ったままにすると以後ずっと同じ失敗を返すので、次回やり直せるようにする
    ready = null;
    throw e;
  });
  return ready;
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { 'content-type': 'application/json; charset=utf-8', ...init.headers },
  });

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

    if (!fromOwnSite(request, url.origin)) {
      return json({ error: 'forbidden' }, { status: 403 });
    }

    const row = await env.REACTIONS.prepare(
      `INSERT INTO reactions (slug, count) VALUES (?, 1)
       ON CONFLICT(slug) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
      .bind(slug)
      .first<{ count: number }>();

    return json({ slug, count: row?.count ?? 1 });
  },
} satisfies ExportedHandler<Env>;
