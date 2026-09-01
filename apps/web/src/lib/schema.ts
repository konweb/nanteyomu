/**
 * schema.org の構造化データ。
 *
 * @graph に @id つきでノードを並べ、参照で繋ぐ。同じ WebSite / DefinedTermSet を
 * ページごとに再定義せずに済み、検索エンジン側でも同一物として扱われる。
 */
import type { Entry } from '@nanteyomu/data';
import { SITE_URL } from './site';
import { CATEGORY_LABEL, primaryKana } from './entries';

const WEBSITE_ID = `${SITE_URL}/#website`;
const DICTIONARY_ID = `${SITE_URL}/#dictionary`;

const website = () => ({
  '@type': 'WebSite',
  '@id': WEBSITE_ID,
  url: `${SITE_URL}/`,
  name: 'nanteyomu',
  description: 'IT のツール名・サービス名の読み方を、出典つきで引ける辞典。',
  inLanguage: 'ja',
});

const dictionary = (count?: number) => ({
  '@type': 'DefinedTermSet',
  '@id': DICTIONARY_ID,
  url: `${SITE_URL}/`,
  name: 'nanteyomu',
  description:
    'IT のツール名・サービス名の読み方を集めた辞典。英語圏での発音と、日本の現場で通っている読みの両方を収録している。',
  inLanguage: 'ja',
  ...(count ? { numberOfItems: count } : {}),
});

const crumbs = (id: string, items: Array<{ name: string; path?: string }>) => ({
  '@type': 'BreadcrumbList',
  '@id': id,
  itemListElement: items.map((it, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: it.name,
    ...(it.path ? { item: `${SITE_URL}${it.path}` } : {}),
  })),
});

/** トップページ。 */
export function homeSchema(count: number) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      website(),
      dictionary(count),
      {
        '@type': 'CollectionPage',
        '@id': `${SITE_URL}/#webpage`,
        url: `${SITE_URL}/`,
        name: 'nanteyomu — IT のツール名・サービス名の読み方辞典',
        isPartOf: { '@id': WEBSITE_ID },
        about: { '@id': DICTIONARY_ID },
        inLanguage: 'ja',
      },
    ],
  };
}

/** 用語ページ。読みそのものを DefinedTerm、出典を citation として持たせる。 */
export function entrySchema(entry: Entry, title: string, description: string) {
  const url = `${SITE_URL}/w/${entry.slug}/`;
  const label = CATEGORY_LABEL[entry.category] ?? entry.category;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      website(),
      dictionary(),
      {
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        url,
        name: title,
        description,
        isPartOf: { '@id': WEBSITE_ID },
        breadcrumb: { '@id': `${url}#breadcrumb` },
        mainEntity: { '@id': `${url}#term` },
        dateModified: entry.updated,
        inLanguage: 'ja',
        ...(entry.sources?.length
          ? {
              citation: entry.sources.map((s) => ({
                '@type': 'CreativeWork',
                name: s.title,
                url: s.url,
              })),
            }
          : {}),
      },
      crumbs(`${url}#breadcrumb`, [
        { name: 'トップ', path: '/' },
        { name: label, path: `/c/${entry.category}/` },
        { name: entry.term },
      ]),
      {
        '@type': 'DefinedTerm',
        '@id': `${url}#term`,
        url,
        name: entry.term,
        alternateName: [...new Set([...entry.ja.map((r) => r.kana), ...(entry.aliases ?? [])])],
        description: `${entry.term} は「${primaryKana(entry)}」と読みます。${entry.summary}`,
        inDefinedTermSet: { '@id': DICTIONARY_ID },
        inLanguage: 'ja',
        ...(entry.homepage ? { sameAs: entry.homepage } : {}),
      },
    ],
  };
}

/** 索引・カテゴリなどの一覧ページ。 */
export function collectionSchema(opts: {
  path: string;
  name: string;
  description: string;
  count: number;
  parent?: { name: string; path: string };
}) {
  const url = `${SITE_URL}${opts.path}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      website(),
      {
        '@type': 'CollectionPage',
        '@id': `${url}#webpage`,
        url,
        name: opts.name,
        description: opts.description,
        isPartOf: { '@id': WEBSITE_ID },
        breadcrumb: { '@id': `${url}#breadcrumb` },
        about: { '@id': DICTIONARY_ID },
        inLanguage: 'ja',
      },
      crumbs(`${url}#breadcrumb`, [
        { name: 'トップ', path: '/' },
        ...(opts.parent ? [opts.parent] : []),
        { name: opts.name },
      ]),
    ],
  };
}
