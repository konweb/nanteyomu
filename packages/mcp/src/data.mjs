import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export function loadEntries() {
  return JSON.parse(readFileSync(join(here, '..', 'data', 'entries.json'), 'utf8'));
}

export function primaryKana(e) {
  return (e.ja.find((r) => r.primary) ?? e.ja[0]).kana;
}

export function search(entries, query, limit = 10) {
  const q = String(query ?? '').trim().toLowerCase();
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

/** LLM に渡しやすい平文に整形する。 */
export function format(e) {
  const lines = [`${e.term} — ${primaryKana(e)}`];
  const others = e.ja.filter((r) => r.kana !== primaryKana(e));
  if (others.length) lines.push(`他の読み: ${others.map((r) => r.kana).join('、')}`);
  if (e.en?.respelling || e.en?.ipa) {
    lines.push(`英語圏: ${[e.en.respelling, e.en.ipa].filter(Boolean).join(' ')}`);
  }
  if (e.expansion) lines.push(`略: ${e.expansion}`);
  lines.push(`説明: ${e.summary}`);
  if (e.divergence && e.divergenceNote) {
    lines.push(`日英のズレ: ${e.divergenceNote.replace(/\s+/g, ' ').trim()}`);
  }
  lines.push(`確度: ${e.confidence}`);
  if (e.sources?.length) {
    lines.push(`出典:\n${e.sources.map((s) => `  - [${s.kind}] ${s.title} ${s.url}`).join('\n')}`);
  } else {
    lines.push('出典: なし（暫定値）');
  }
  return lines.join('\n');
}
