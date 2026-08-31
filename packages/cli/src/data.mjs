import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** @returns {Array<object>} */
export function loadEntries() {
  return JSON.parse(readFileSync(join(here, '..', 'data', 'entries.json'), 'utf8'));
}

export function primaryKana(e) {
  return (e.ja.find((r) => r.primary) ?? e.ja[0]).kana;
}

/** 完全一致 > 前方一致 > 部分一致 の順にスコアリングして返す。 */
export function search(entries, query, limit = 10) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored = [];
  for (const e of entries) {
    const term = e.term.toLowerCase();
    const haystack = [
      e.term, e.slug, ...(e.aliases ?? []),
      ...e.ja.map((r) => r.kana), e.expansion ?? '', ...(e.tags ?? []),
    ].join(' ').toLowerCase();

    let score = -1;
    if (term === q || e.slug === q) score = 0;
    else if (term.startsWith(q)) score = 1;
    else if (e.ja.some((r) => r.kana.toLowerCase().startsWith(q))) score = 2;
    else if (haystack.includes(q)) score = 3;
    if (score >= 0) scored.push({ e, score });
  }
  scored.sort((a, b) => a.score - b.score || a.e.term.localeCompare(b.e.term));
  return scored.slice(0, limit).map((s) => s.e);
}
