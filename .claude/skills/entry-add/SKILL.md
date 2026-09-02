---
name: entry-add
description: nanteyomu に語を追加・修正して PR まで出す。YAML の作成、lint とビルドの確認、ブランチ・コミット・PR を担当する。検証は entry-verify の担当なので、その検証レポートが無ければ先に entry-verify を実行すること。「語を追加して」「issue を対応して」と言われて検証が済んでいる場合に使う。
---

# 語の追加・修正

**前提: `entry-verify` の検証レポートがあること。**
無ければ**このスキルを進めず、先に `entry-verify` を実行する。**

検証を省いて書くと、実在しない出典・取り違えた公式サイト・既存語との重複が
そのまま本番に出る。分けてあるのはそれを防ぐため。

## 1. YAML を書く

`packages/data/entries/<slug>.yml` に1語1ファイル。フィールドの順序は
`packages/data/src/schema.ts` の `Entry` に合わせる。

```yaml
slug: cloudflare-turnstile      # 小文字英数とハイフンのみ。URL になる
term: Cloudflare Turnstile      # 表記そのまま
aliases: [Turnstile]            # 別表記・略称・よくある誤記。任意
category: service               # 下の一覧から1つ
expansion: ...                  # 何の略か。任意
summary: 1〜2文の説明。
homepage: https://...           # 公式サイト。sources とは別物
en:
  ipa: /.../                    # 任意
  respelling: TURN-stile        # 英語話者向けの読み下し
  note: ...                     # 任意
ja:
  - kana: ターンスタイル          # カタカナのみ（後述）
    primary: true               # 現場で最も通る読み。1つだけ
  - kana: ...
    note: 誤り。～と読み違えたもの。
divergence: true                # 日英でズレるときだけ
divergenceNote: >-
  何が、どうズレているか。
confidence: high                # high / medium / low / disputed
sources:
  - url: https://...
    title: ページのタイトル
    kind: docs                  # author / official / docs / conference / community
    quote: >-
      原文のまま。要約や翻訳を入れない。
needsSource: true               # sources が無いときは必須
tags: [captcha, security]
added: 2026-09-01               # 収録した日。トップの「最近追加した語」に使う
updated: 2026-09-01             # 今日の日付
```

`category` は `cli` `language` `framework` `library` `service` `infra` `db`
`protocol` `acronym` `format` `ai` `company` `person` から選ぶ。

`ai` は「AI そのもの」に使う。モデル（Llama, Gemma）、AI アシスタント（Gemini, Claude）、
AI 固有の概念（RAG, LoRA）など。**構造で分類できるものは従来どおり**にする
（ONNX はフォーマット、MCP はプロトコル、Keras はライブラリ、Ollama は CLI）。

**方針上、`company` と `person` は収録しない。** ツール名・サービス名の辞典であり、
実在の人物の読みを出典なしで断定するのは方針と合わないため、過去に削除している。

## 2. 落とし穴

lint やビルドで弾かれる、または黙って壊れるもの。

**`ja[].kana` はカタカナのみ。** lint の正規表現が漢字・ひらがな・英数字・括弧を弾く。
補足は `note` に書く。

```yaml
- kana: ジョット            # OK
- kana: ジョット（正）       # NG。括弧が入っている
```

**出典が無いなら `needsSource: true` が必須。** 無いと lint がエラーで落ちる。
そして**出典なしで `confidence: high` にしない**（警告が出る）。

**`divergence: true` なら `divergenceNote` を書く。** 無いと警告が出る。

**`primary: true` は1つだけ。** 複数あるとエラー。

**`added` を忘れない。** 新規追加のときは必ず入れる。無いとトップの
「最近追加した語」に出てこない。`updated` は編集でも動くので追加日には使えない。
既存エントリの修正では `added` は変えず、`updated` だけ今日の日付にする。

**OGP 画像のフォントに注意。** 用語と読みは 1200x630 の画像に描かれるが、
フォントは ASCII・ひらがな・カタカナだけのサブセット。**漢字や珍しい記号を含む用語は
画像で字が消える。** ビルド時に `[og] ... サブセットに無い` と警告が出たら、
`apps/web/scripts/build-og-font.mjs` でフォントを作り直す。

## 3. 検証する

```bash
pnpm run data && pnpm lint:data
```

`errors: 0` を確認する。収録数と出典カバレッジもここに出る。

```bash
pnpm test && pnpm build
```

`test` は型チェック・データ検証・CLI・MCP を通す。`build` は 212 ページ以上の生成と
用語ごとの OGP 画像生成まで行う（15秒ほどかかる）。

新しい語のページを目で確かめる。

```bash
node packages/cli/src/cli.mjs <用語>
```

## 4. PR を出す

`main` は保護されていて直接 push できない。必ずブランチを切る。

```bash
git checkout -b add-<slug>
git add packages/data/entries/<slug>.yml
git commit   # 下記の trailer を末尾に付ける
git push -u origin add-<slug>
gh pr create --base main --title "..." --body "..."
```

**issue が起点なら PR 本文に `Closes #<番号>` を入れる。** マージ時に自動で閉じる。

必須チェックは `build` と `Workers Builds: nanteyomu` の2つ。両方 pass してからマージする。

```bash
gh pr checks <番号> --watch
gh pr merge <番号> --merge --delete-branch
```

## コミットと PR の書き方

**何をしたかではなく、なぜそうしたかを書く。** 特に次の判断は理由を残す。

- 出典が見つからなかったので `needsSource: true` にした
- 読みが割れているので `disputed` にした
- `divergence` を付けた／付けなかった理由

コミットメッセージの末尾:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: <セッションの URL>
```

PR 本文の末尾:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

<セッションの URL>
```

## 既存エントリの修正（issue の `fix` ラベル）

新規追加ではないので、`packages/data/entries/<slug>.yml` を編集する。

- 読みを変えるなら、**古い読みを消さずに残す**ことを検討する。現場で使われている読みは
  `note` 付きで併記したほうが辞典として有用（例: 「誤り。英語読みに引きずられたもの。」）
- 出典が付いたら `needsSource` を消し、`confidence` を上げる
- `updated` を今日の日付にする
