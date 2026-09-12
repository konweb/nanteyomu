# 既出の記録

`scripts/discover.mjs` が一度候補に挙げた名前を `seen.json` に残しておく置き場。
翌週も同じものが並ばないようにするためだけのブランチで、`main` には入れない。

main は ruleset で保護されていて Actions から push できないので、
状態だけをこのブランチに置いている。候補の一覧そのものは Issue に出る。
