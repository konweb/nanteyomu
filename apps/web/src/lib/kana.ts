/**
 * カタカナの五十音順の並べ替えと、行（あ行・か行…）へのグループ分け。
 *
 * localeCompare(_, 'ja') でもそれなりに並ぶが、ビルド環境の ICU に依存し、
 * small-icu の Node だと黙って別の順序になる。辞典として並び順は本体機能なので
 * 五十音表を明示的に持って決定的に比較する。
 */

/** 五十音表の基本形。濁音・半濁音・小書きは、ここに正規化してから比較する。 */
const BASE = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';

/** BASE と同じ並びで、各仮名の母音。ー を直前の母音に展開するために使う。 */
const VOWEL =
  'aiueo' + 'aiueo' + 'aiueo' + 'aiueo' + 'aiueo' + 'aiueo' + 'aiueo' + 'auo' + 'aiueo' + 'ao-';

const VOWEL_TO_INDEX: Record<string, number> = { a: 0, i: 1, u: 2, e: 3, o: 4 };

/** 濁音・半濁音 → 清音。値は [清音, 濁点の段階] で、比較の第2キーに使う。 */
const VOICED: Record<string, [string, number]> = {
  ガ: ['カ', 1], ギ: ['キ', 1], グ: ['ク', 1], ゲ: ['ケ', 1], ゴ: ['コ', 1],
  ザ: ['サ', 1], ジ: ['シ', 1], ズ: ['ス', 1], ゼ: ['セ', 1], ゾ: ['ソ', 1],
  ダ: ['タ', 1], ヂ: ['チ', 1], ヅ: ['ツ', 1], デ: ['テ', 1], ド: ['ト', 1],
  バ: ['ハ', 1], ビ: ['ヒ', 1], ブ: ['フ', 1], ベ: ['ヘ', 1], ボ: ['ホ', 1],
  パ: ['ハ', 2], ピ: ['ヒ', 2], プ: ['フ', 2], ペ: ['ヘ', 2], ポ: ['ホ', 2],
  ヴ: ['ウ', 1],
};

/** 小書き → 並字。 */
const SMALL: Record<string, string> = {
  ァ: 'ア', ィ: 'イ', ゥ: 'ウ', ェ: 'エ', ォ: 'オ',
  ッ: 'ツ', ャ: 'ヤ', ュ: 'ユ', ョ: 'ヨ', ヮ: 'ワ',
};

/** 表に無い文字はここに落とす。並びの最後になる。 */
const UNKNOWN = 99;

export interface KanaRow {
  /** 見出し（例: あ行） */
  label: string;
  /** URL のアンカーに使う識別子（例: a） */
  id: string;
  /** BASE 上の範囲 [開始, 終了] */
  range: [number, number];
}

export const KANA_ROWS: KanaRow[] = [
  { label: 'あ行', id: 'a', range: [0, 4] },
  { label: 'か行', id: 'ka', range: [5, 9] },
  { label: 'さ行', id: 'sa', range: [10, 14] },
  { label: 'た行', id: 'ta', range: [15, 19] },
  { label: 'な行', id: 'na', range: [20, 24] },
  { label: 'は行', id: 'ha', range: [25, 29] },
  { label: 'ま行', id: 'ma', range: [30, 34] },
  { label: 'や行', id: 'ya', range: [35, 37] },
  { label: 'ら行', id: 'ra', range: [38, 42] },
  { label: 'わ行', id: 'wa', range: [43, 45] },
];

/** 1文字を [BASE 上の位置, 濁点の段階] に正規化する。比較対象外の文字は null。 */
function normalizeChar(ch: string): [number, number] | null {
  if (ch === '・' || ch === '　' || ch === ' ') return null;
  let voicing = 0;
  let c = SMALL[ch] ?? ch;
  const v = VOICED[c];
  if (v) [c, voicing] = v;
  const i = BASE.indexOf(c);
  return i < 0 ? [UNKNOWN, 0] : [i, voicing];
}

/**
 * 並べ替え用のキー。
 * 第1キーは清音化した仮名の並び、第2キーは濁点の段階。
 * 「ー」は直前の仮名の母音に展開する（ターナー → タアナア）。
 */
export function kanaSortKey(kana: string): { base: number[]; voicing: number[] } {
  const base: number[] = [];
  const voicing: number[] = [];
  for (const ch of kana) {
    if (ch === 'ー' || ch === '－' || ch === '-') {
      const prev = base[base.length - 1];
      const vw = prev !== undefined && prev < BASE.length ? VOWEL[prev] : '-';
      const idx = VOWEL_TO_INDEX[vw];
      if (idx !== undefined) { base.push(idx); voicing.push(0); }
      continue;
    }
    const n = normalizeChar(ch);
    if (n) { base.push(n[0]); voicing.push(n[1]); }
  }
  return { base, voicing };
}

function cmpNums(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

/** 五十音順の比較。同じ清音なら 清音 → 濁音 → 半濁音 の順。 */
export function compareKana(a: string, b: string): number {
  const ka = kanaSortKey(a);
  const kb = kanaSortKey(b);
  return cmpNums(ka.base, kb.base) || cmpNums(ka.voicing, kb.voicing);
}

/** その読みが属する行の id を返す。表に無い文字で始まる場合は null。 */
export function kanaRowId(kana: string): string | null {
  const { base } = kanaSortKey(kana);
  const first = base[0];
  if (first === undefined) return null;
  for (const r of KANA_ROWS) if (first >= r.range[0] && first <= r.range[1]) return r.id;
  return null;
}
