import type { APIRoute } from 'astro';
import { entries, primaryKana } from '../lib/entries';

/** クライアント検索用の軽量インデックス。 */
export const GET: APIRoute = () => {
  const index = entries.map((e) => ({
    s: e.slug,
    t: e.term,
    k: primaryKana(e),
    c: e.category,
    d: e.divergence ?? false,
    q: [e.term, e.slug, ...(e.aliases ?? []), ...e.ja.map((r) => r.kana), e.expansion ?? '', ...(e.tags ?? [])]
      .filter(Boolean)
      .join(' ')
      .toLowerCase(),
  }));
  return new Response(JSON.stringify(index), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
