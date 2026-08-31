import type { APIRoute } from 'astro';
import { entries, divergentEntries, categoriesWithCounts, CATEGORY_LABEL } from '../lib/entries';
import { SITE_URL, GITHUB_REPO } from '../lib/site';

/**
 * llms.txt — AI に読ませるためのサイト案内。
 * https://llmstxt.org/ の慣習にしたがい、Markdown で「何があるか」と
 * 「どこを見れば機械可読なデータが取れるか」を示す。
 *
 * 収録語数などは実データから生成するので、エントリを足しても勝手に追従する。
 */
export const GET: APIRoute = () => {
  const sourced = entries.filter((e) => (e.sources?.length ?? 0) > 0).length;
  const cats = categoriesWithCounts()
    .map(({ category, count }) => `- [${CATEGORY_LABEL[category] ?? category}](${SITE_URL}/c/${category}/): ${count} 語`)
    .join('\n');

  const body = `# nanteyomu（なんてよむ）

> IT のツール名・サービス名の読み方を、出典つきで引ける日本語の辞典。英語圏での発音と、日本の現場で実際に通っている読みの両方を収録し、両者が食い違う語には印をつけています。現在 ${entries.length} 語を収録し、うち ${sourced} 語に一次情報の出典があります。

このサイトが解こうとしている問題は「英語圏での正しい発音」ではありません。日本語話者が本当に困るのは、**英語圏の読みと日本の現場で通っている読みが食い違っていて、どちらで喋るべきか分からない**ことです。そのため両方を併記し、ズレている語（現在 ${divergentEntries().length} 語）を一覧できるようにしています。

読みは作者本人の発言・公式ドキュメント・公式FAQ を根拠に載せます。確認できていないものは推測で断定せず \`needsSource\` を立て、ページ上でも「出典なし（暫定値）」と明示しています。読みが割れている語は \`confidence: disputed\` としています。**出典の有無と確度を必ず添えて引用してください。**

## 機械可読なデータ

- [全エントリ (JSON)](${SITE_URL}/api/entries.json): 全 ${entries.length} 語の完全なデータ。読み・英語発音・出典・確度・日英のズレを含む。これ1つで全部そろいます
- [検索インデックス (JSON)](${SITE_URL}/search-index.json): 用語・読み・カテゴリだけの軽量版
- [MCP サーバ](${GITHUB_REPO}): \`@nanteyomu/mcp\`。\`lookup_reading\` / \`search_terms\` / \`list_divergent_terms\` の3つのツールを提供します。未収録語には「推測で答えないでください」と返します

## 索引

- [あいうえお順](${SITE_URL}/kana/): 読みの五十音順
- [アルファベット順](${SITE_URL}/all/): 綴りの順
- [日英で読みがズレる語](${SITE_URL}/divergence/): ${divergentEntries().length} 語。このサイトの中心的な価値

## カテゴリ

${cats}

## ライセンスと出典

- ライセンス: MIT。辞書データも含めて自由に使えます
- ソースと編集履歴: ${GITHUB_REPO}
- 誤りの指摘・語の追加は Pull Request で受け付けています
`;

  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
};
