import raw from '@nanteyomu/data/generated/entries.json';
import type { Entry } from '@nanteyomu/data';
import { KANA_ROWS, compareKana, kanaRowId, type KanaRow } from './kana';

export const entries = raw as unknown as Entry[];

export const bySlug = new Map(entries.map((e) => [e.slug, e]));

export const CATEGORY_LABEL: Record<string, string> = {
  cli: 'CLI・ツール',
  language: 'プログラミング言語',
  framework: 'フレームワーク・ランタイム',
  library: 'ライブラリ',
  service: 'サービス・SaaS',
  infra: 'インフラ・ミドルウェア',
  db: 'データベース',
  protocol: 'プロトコル',
  acronym: '略語',
  format: 'フォーマット',
  company: '企業',
  person: '人名',
};

export const CONFIDENCE_LABEL: Record<string, string> = {
  high: '確度: 高',
  medium: '確度: 中',
  low: '確度: 低',
  disputed: '読みが割れている',
};

export const SOURCE_KIND_LABEL: Record<string, string> = {
  author: '作者本人',
  official: '公式',
  docs: '公式ドキュメント',
  conference: '講演',
  community: 'コミュニティ',
};

export function primaryKana(e: Entry): string {
  return e.ja.find((r) => r.primary)?.kana ?? e.ja[0].kana;
}

export function sortedEntries(): Entry[] {
  return [...entries].sort((a, b) => a.term.localeCompare(b.term, 'en'));
}

export function categoriesWithCounts(): Array<{ category: string; count: number }> {
  const counts = new Map<string, number>();
  for (const e of entries) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

export function divergentEntries(): Entry[] {
  return sortedEntries().filter((e) => e.divergence);
}

/** 五十音順に並べたエントリ。 */
export function kanaSortedEntries(): Entry[] {
  return [...entries].sort((a, b) => compareKana(primaryKana(a), primaryKana(b)));
}

export interface IndexGroup {
  /** 見出し（例: あ行 / A） */
  label: string;
  /** ページ内アンカー */
  id: string;
  entries: Entry[];
}

/** あいうえお順の索引。読みが表に無い文字で始まる語は「その他」に入れる。 */
export function kanaIndex(): IndexGroup[] {
  const buckets = new Map<string, Entry[]>();
  for (const e of kanaSortedEntries()) {
    const id = kanaRowId(primaryKana(e)) ?? 'other';
    const b = buckets.get(id);
    if (b) b.push(e);
    else buckets.set(id, [e]);
  }
  const rows: IndexGroup[] = KANA_ROWS.map((r: KanaRow) => ({
    label: r.label,
    id: r.id,
    entries: buckets.get(r.id) ?? [],
  }));
  const other = buckets.get('other');
  if (other?.length) rows.push({ label: 'その他', id: 'other', entries: other });
  return rows;
}

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/** アルファベット順の索引。数字で始まる語は 0-9、それ以外の記号は「記号」にまとめる。 */
export function alphabetIndex(): IndexGroup[] {
  const buckets = new Map<string, Entry[]>();
  const push = (id: string, e: Entry) => {
    const b = buckets.get(id);
    if (b) b.push(e);
    else buckets.set(id, [e]);
  };
  for (const e of sortedEntries()) {
    const c = [...e.term][0]?.toUpperCase() ?? '';
    if (ALPHA.includes(c)) push(c, e);
    else if (c >= '0' && c <= '9') push('0-9', e);
    else push('sym', e);
  }
  const groups: IndexGroup[] = [];
  const num = buckets.get('0-9');
  if (num?.length) groups.push({ label: '0-9', id: 'num', entries: num });
  for (const c of ALPHA) groups.push({ label: c, id: c.toLowerCase(), entries: buckets.get(c) ?? [] });
  const sym = buckets.get('sym');
  if (sym?.length) groups.push({ label: '記号', id: 'sym', entries: sym });
  return groups;
}
