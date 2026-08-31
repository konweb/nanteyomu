import raw from '@nanteyomu/data/generated/entries.json';
import type { Entry } from '@nanteyomu/data';

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
