-- 「タメになった」ボタンの集計。
--
-- reactions は語ごとの累計。votes は二重投票を弾くための痕跡で、
-- 生の IP は保存せず salt つきハッシュだけを置き、古い行は消す。

CREATE TABLE IF NOT EXISTS reactions (
  slug  TEXT    PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS votes (
  -- sha256(salt | IP | slug | 日付) の 16 進。IP そのものは復元できない
  id  TEXT NOT NULL PRIMARY KEY,
  -- 掃除に使う投票日 (YYYY-MM-DD)
  day TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS votes_day ON votes (day);
