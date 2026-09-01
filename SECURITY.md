# セキュリティについて

## 脆弱性の報告

**公開の issue には書かないでください。** GitHub の private vulnerability reporting を有効にしてあります。

→ [Security タブ → Report a vulnerability](https://github.com/konweb/nanteyomu/security/advisories/new)

非公開で報告でき、修正まで公開されません。

## サポート対象

デプロイされている最新版（`main` の内容）のみです。過去のバージョンへのバックポートはしていません。

## このプロジェクトで特に注意している点

辞書データは Pull Request で外部から追加されます。データがそのままページに出るため、**データ経由の混入**を主な脅威と考えています。

- 構造化データ（JSON-LD）は `<` をエスケープして出力します。`JSON.stringify` は `<` をエスケープしないため、`</script>` を含むデータで script タグを閉じられてしまうためです
- それ以外の箇所は Astro の既定のエスケープに任せています（テンプレート内の `{}` は自動でエスケープされます）
- `set:html` を使う箇所は `src/components/JsonLd.astro` の 1 つだけに限定しています

出典として登録される URL は外部サイトです。`rel="noopener nofollow"` を付けていますが、**リンク先の内容は検証していません**。

## 対象外

- 掲載されている読みの誤り: 脆弱性ではありません。[issue](https://github.com/konweb/nanteyomu/issues/new?template=fix-reading.yml) でお願いします
- 依存パッケージの既知の脆弱性: Dependabot が自動で PR を出します。報告は不要です
