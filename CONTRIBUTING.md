# 貢献のしかた

## 用語を追加する

`packages/data/entries/<slug>.yml` を1つ作るだけです。ファイル名は `slug` と一致させてください。

```yaml
slug: tmux                 # 小文字英数とハイフンのみ。URL になる。
term: tmux                 # 表記そのまま
aliases: [TMUX]            # 別表記・よくある誤記（任意）
category: cli              # cli / language / framework / library / service /
                           # infra / db / protocol / acronym / format / company / person
expansion: terminal multiplexer   # 何の略か（任意）
summary: 1つの端末で複数のセッションを扱うターミナルマルチプレクサ。
en:
  ipa: /ˈtiːmʌks/
  respelling: TEE-mux
ja:
  - kana: ティーマックス     # カタカナのみ
    primary: true           # 現場で最も通る読み。1つだけ。
  - kana: テーマックス
    note: 少数派。
divergence: false          # 英語圏の読みと日本の通り名がズレるか
confidence: high           # high / medium / low / disputed
sources:
  - url: https://github.com/tmux/tmux
    title: tmux/tmux — GitHub
    kind: official         # author / official / docs / conference / community
updated: 2026-08-31
```

検証:

```bash
pnpm lint:data
```

## 出典の方針（これが一番大事）

このプロジェクトの価値は出典にあります。次の順で優先してください。

1. **`author`** — 作者本人が読みを述べている（インタビュー、SNS、リポジトリ）
2. **`official`** — 公式サイト・公式FAQ
3. **`docs`** — 公式ドキュメント
4. **`conference`** — 公式カンファレンスでの発話
5. **`community`** — 上記が存在しない場合の補助

ルール:

- **出典を捏造しない。** 実在を確認していない URL を書かないでください。
- **`quote` は実際に確認できた文言だけ。** 要約や推測を引用符で囲まないでください。
- 出典が見つからない場合は `sources` を書かず `needsSource: true` を立ててください。
  暫定値であることがサイト上にも明示されます。
- 出典なしで `confidence: high` にはしないでください。

## `divergence` の基準

`divergence: true` は、**英語圏の読みと日本の現場の通り名が実際に食い違っている**語に立てます。
単に読みにくいだけの語には立てません。`divergenceNote` に何がどうズレるかを必ず書いてください。

例:
- JWT（仕様は "jot"、日本では「ジェイダブリューティー」）→ true
- PostgreSQL（英語圏は Postgres、日本は「ポスグレ」）→ true
- Deno（どちらも「ディーノ」）→ false

## 読みが複数あるとき

無理に1つへ寄せないでください。`ja` に複数並べ、`primary` は「日本の現場で最も通る読み」に付けます。
決着していない語は `confidence: disputed` にしてください。
