-- 二重投票の判定を localStorage だけに寄せたので、
-- 投票者ごとの痕跡を残していた votes テーブルは不要になった。
DROP TABLE IF EXISTS votes;
