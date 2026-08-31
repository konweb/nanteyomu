# nanteyomu

**IT のツール名・サービス名の読み方を、出典つきで引ける辞典。**

`tmux` は？ `nginx` は？ `Cloudflare Turnstile` は？ — 綴りから読みが推測できない名前は、
検索しても個人ブログの断片的なまとめしか出てきません。nanteyomu はそれを一箇所に集めます。

→ https://nanteyomu.dev （公開準備中）

## 何が違うのか

日本語話者が本当に困るのは「英語圏での正しい発音」ではなく、
**英語圏の読みと日本の現場で通っている読みが食い違っていて、どちらで喋るべきか分からない**ことです。

nanteyomu は両方を載せ、ズレている語には `divergence` フラグを立てて[専用の一覧](https://nanteyomu.dev/divergence/)を用意しています。

| 用語 | 英語圏 | 日本の現場 |
|---|---|---|
| JWT | jot | ジェイダブリューティー |
| PostgreSQL | POST-gres-Q-L | ポスグレ |
| Kubernetes | koo-ber-NET-eez | クバネティス / ケーエイツ |
| Vite | veet | ヴィート（「バイト」は誤り） |

もうひとつの方針は **出典**です。読みは作者本人の発言・公式ドキュメント・公式FAQ を根拠に載せ、
確認できていないものは推測で断定せず「出典なし（暫定値）」と明示します。

## 使い方

### Web

https://nanteyomu.dev で検索できます。カタカナからの逆引きも可能です。

### CLI

```bash
npm i -g nanteyomu

ny tmux
ny "Cloudflare Turnstile"
ny ジョット            # カタカナから逆引き
ny --divergence        # 日英でズレる語だけ
ny --json tmux         # JSON 出力
```

### MCP サーバ（AI エージェント向け）

エージェントが用語の読みを**推測せずに**引けるようになります。

```jsonc
// Claude Code / Claude Desktop などの MCP 設定
{
  "mcpServers": {
    "nanteyomu": {
      "command": "npx",
      "args": ["-y", "@nanteyomu/mcp"]
    }
  }
}
```

提供ツール: `lookup_reading` / `search_terms` / `list_divergent_terms`

### API

全データは静的 JSON として公開しています。

```
GET https://nanteyomu.dev/api/entries.json
```

## リポジトリ構成

```
apps/web            Astro + SolidJS のサイト（静的生成 → Cloudflare Workers）
packages/data       辞書データ（YAML 1ファイル = 1用語）+ スキーマ検証 + ビルド
packages/cli        npm パッケージ `nanteyomu`（依存ゼロ）
packages/mcp        npm パッケージ `@nanteyomu/mcp`（依存ゼロ・JSON-RPC を直接実装）
```

データが単一の source of truth で、サイト・CLI・MCP はすべてそこから生成されます。

## 開発

```bash
pnpm install
pnpm dev          # http://localhost:4321
pnpm build        # データ検証 → 各パッケージへ配布 → 静的サイト生成
pnpm test         # データ lint + CLI + MCP のスモークテスト
pnpm lint:data    # 出典カバレッジも表示される
pnpm deploy       # Cloudflare Workers へデプロイ
```

## 貢献

読みの追加・修正はいつでも歓迎します。[CONTRIBUTING.md](./CONTRIBUTING.md) を読んでください。
とくに**出典の追加**（`needsSource: true` になっている語）が一番ありがたい貢献です。

## ライセンス

MIT。辞書データも含めて自由に使えます。
