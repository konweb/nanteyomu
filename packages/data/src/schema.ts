/** 1エントリのスキーマ。YAML 1ファイル = 1用語。 */

export const CATEGORIES = [
  'cli', 'language', 'framework', 'library', 'service',
  'infra', 'db', 'protocol', 'acronym', 'format', 'company', 'person',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CONFIDENCE = ['high', 'medium', 'low', 'disputed'] as const;
export type Confidence = (typeof CONFIDENCE)[number];

export const SOURCE_KINDS = ['author', 'official', 'docs', 'conference', 'community'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export interface Source {
  url: string;
  title: string;
  /** author = 作者本人の発言（最強）, official = 公式サイト/FAQ, docs = 公式ドキュメント */
  kind: SourceKind;
  /** 引用は実際に確認できた文言のみ。推測で書かない。 */
  quote?: string;
}

export interface JaReading {
  /** 日本語話者が実際に口に出す読み（カタカナ） */
  kana: string;
  /** 現場で最も通る読み */
  primary?: boolean;
  /** 補足（「古い現場ではこちら」など） */
  note?: string;
}

export interface EnReading {
  /** 国際音声記号 */
  ipa?: string;
  /** 英語話者向けの読み下し (例: TEE-mux) */
  respelling?: string;
  note?: string;
}

export interface Entry {
  /** URLに使う識別子。小文字英数とハイフンのみ。 */
  slug: string;
  /** 表記そのまま (例: "tmux", "Cloudflare Turnstile") */
  term: string;
  /** 別表記・略称・よくある誤記 */
  aliases?: string[];
  category: Category;
  /** 何の略か (例: "terminal multiplexer") */
  expansion?: string;
  /** 1〜2文の説明 */
  summary: string;
  /**
   * 公式サイト / 公式リポジトリの URL。
   * 「読みの根拠」である sources とは別物で、こちらは「その物自体の入口」。
   * 出典が RFC や解説記事でも、公式サイトは別に示せるようにするため分けている。
   */
  homepage?: string;
  en?: EnReading;
  /** 日本語の読み。先頭が primary 相当だが明示もできる。 */
  ja: JaReading[];
  /**
   * このプロダクト最大の差別化ポイント。
   * 英語圏の読みと日本の現場の通り名がズレている用語に true。
   * 例: nginx (エンジンエックス vs EN-jin-eks は近いが、
   *     Kubernetes / Xcode などは明確にズレる)
   */
  divergence?: boolean;
  /** ズレの説明 */
  divergenceNote?: string;
  confidence: Confidence;
  sources?: Source[];
  /** 出典未取得。lint がカバレッジとして報告する。 */
  needsSource?: boolean;
  tags?: string[];
  /** YYYY-MM-DD */
  updated: string;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const KATAKANA_RE = /^[゠-ヿ　-〿・ー\s]+$/;

export interface Issue {
  file: string;
  level: 'error' | 'warn';
  message: string;
}

/** エントリを検証して問題を返す。throw はしない。 */
export function validateEntry(raw: unknown, file: string): Issue[] {
  const issues: Issue[] = [];
  const err = (message: string) => issues.push({ file, level: 'error', message });
  const warn = (message: string) => issues.push({ file, level: 'warn', message });

  if (typeof raw !== 'object' || raw === null) {
    err('ルートがオブジェクトではありません');
    return issues;
  }
  const e = raw as Partial<Entry>;

  if (typeof e.slug !== 'string' || !SLUG_RE.test(e.slug)) {
    err(`slug が不正です: ${JSON.stringify(e.slug)} (小文字英数とハイフンのみ)`);
  }
  if (typeof e.term !== 'string' || e.term.length === 0) err('term は必須です');
  if (typeof e.summary !== 'string' || e.summary.length === 0) err('summary は必須です');
  if (!CATEGORIES.includes(e.category as Category)) {
    err(`category が不正です: ${JSON.stringify(e.category)}`);
  }
  if (!CONFIDENCE.includes(e.confidence as Confidence)) {
    err(`confidence が不正です: ${JSON.stringify(e.confidence)}`);
  }
  if (typeof e.updated !== 'string' || !DATE_RE.test(e.updated)) {
    err(`updated は YYYY-MM-DD 形式で指定してください: ${JSON.stringify(e.updated)}`);
  }

  if (!Array.isArray(e.ja) || e.ja.length === 0) {
    err('ja に最低1つの読みが必要です');
  } else {
    for (const r of e.ja) {
      if (typeof r?.kana !== 'string' || !KATAKANA_RE.test(r.kana)) {
        err(`ja[].kana はカタカナで指定してください: ${JSON.stringify(r?.kana)}`);
      }
    }
    if (e.ja.filter((r) => r.primary).length > 1) {
      err('ja[].primary は1つまでです');
    }
  }

  if (e.homepage !== undefined && (typeof e.homepage !== 'string' || !/^https?:\/\//.test(e.homepage))) {
    err(`homepage は http(s) の URL で指定してください: ${JSON.stringify(e.homepage)}`);
  }

  if (e.sources !== undefined) {
    if (!Array.isArray(e.sources)) {
      err('sources は配列です');
    } else {
      for (const s of e.sources) {
        if (typeof s?.url !== 'string' || !/^https?:\/\//.test(s.url)) {
          err(`sources[].url が不正です: ${JSON.stringify(s?.url)}`);
        }
        if (typeof s?.title !== 'string' || s.title.length === 0) {
          err('sources[].title は必須です');
        }
        if (!SOURCE_KINDS.includes(s?.kind as SourceKind)) {
          err(`sources[].kind が不正です: ${JSON.stringify(s?.kind)}`);
        }
      }
    }
  }

  const hasSource = Array.isArray(e.sources) && e.sources.length > 0;
  if (!hasSource && !e.needsSource) {
    err('出典がない場合は needsSource: true を明示してください');
  }
  if (hasSource && e.needsSource) {
    warn('sources があるのに needsSource: true のままです');
  }
  if (!hasSource && e.confidence === 'high') {
    warn('出典なしで confidence: high は避けてください');
  }
  if (e.divergence && !e.divergenceNote) {
    warn('divergence: true には divergenceNote を書いてください');
  }

  return issues;
}
