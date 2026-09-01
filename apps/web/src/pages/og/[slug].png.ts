import type { APIRoute } from 'astro';
import { readFileSync } from 'node:fs';
import satori from 'satori';
import sharp from 'sharp';
import { entries, primaryKana, CATEGORY_LABEL } from '../../lib/entries';
import { LOGO_PATH, LOGO_VIEW_W, LOGO_VIEW_H } from '../../lib/logo';
import type { Entry } from '@nanteyomu/data';

/**
 * 用語ごとの OGP 画像をビルド時に生成する。
 *
 * satori は文字をパスに変換した SVG を返すので、ラスタライズ側にフォントは要らない。
 * そのため native な resvg を足さず、すでにある sharp で PNG にできる。
 *
 * フォントは assets/og-font.ttf（Zen Maru Gothic Bold を必要な文字だけに絞ったもの、
 * 3.7MB → 86KB）。サイトからは配信しないので public/ ではなく assets/ に置いている。
 * 収録語が増えて未収録の文字が出た場合はビルド時に警告する。
 */

const FONT = readFileSync(new URL('../../../assets/og-font.ttf', import.meta.url));

const W = 1200;
const H = 630;
const CREAM = '#F3F0E6';
const INK = '#33302A';
const MUTED = '#8B8472';
const ACCENT = '#C2185B';
const TINT = '#E8DFCE';

const LOGO_SRC =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LOGO_VIEW_W} ${LOGO_VIEW_H}">` +
      `<path fill="#4A4636" fill-rule="evenodd" d="${LOGO_PATH}"/></svg>`,
  );

/** サブセットフォントに入っている文字の範囲。ここを外れると字が消えるので検知する。 */
const SAFE = /[ -~぀-ヿ｡-ﾟ—–…]/;
const warned = new Set<string>();
function warnUnsupported(entry: Entry, text: string) {
  for (const ch of text) {
    if (!SAFE.test(ch) && !warned.has(ch)) {
      warned.add(ch);
      console.warn(
        `[og] ${entry.slug}: "${ch}" は OGP 用フォントのサブセットに無いため字が出ません。` +
          ' scripts/build-og-font.mjs で作り直してください。',
      );
    }
  }
}

type Node = { type: string; props: Record<string, unknown> };
const box = (style: Record<string, unknown>, children: unknown): Node => ({
  type: 'div',
  props: { style: { display: 'flex', ...style }, children },
});

function layout(entry: Entry) {
  const kana = primaryKana(entry);
  const term = entry.term;
  const left: unknown[] = [
    box({ fontSize: 26, color: MUTED, letterSpacing: 2 }, CATEGORY_LABEL[entry.category] ?? entry.category),
    box({ fontSize: term.length > 16 ? 54 : 76, color: INK, marginTop: 14, lineHeight: 1.15 }, term),
    box({ fontSize: kana.length > 12 ? 42 : 58, color: ACCENT, marginTop: 12 }, `「${kana}」`),
  ];
  if (entry.divergence) {
    left.push(
      box(
        { marginTop: 22, alignSelf: 'flex-start', background: TINT, borderRadius: 999,
          padding: '8px 24px', fontSize: 24, color: '#5A5346' },
        '日英でズレる',
      ),
    );
  }
  left.push(box({ marginTop: 'auto', fontSize: 26, color: MUTED }, 'nanteyomu — そのツール、なんて読む？'));

  return box(
    { width: '100%', height: '100%', background: CREAM, padding: '60px 72px',
      alignItems: 'center', justifyContent: 'space-between', fontFamily: 'ZenMaru' },
    [
      box({ flexDirection: 'column', flex: 1, paddingRight: 40, height: '100%' }, left),
      { type: 'img', props: { src: LOGO_SRC, width: 200, height: Math.round((200 * LOGO_VIEW_H) / LOGO_VIEW_W) } },
    ],
  );
}

export function getStaticPaths() {
  return entries.map((entry) => ({ params: { slug: entry.slug }, props: { entry } }));
}

export const GET: APIRoute = async ({ props }) => {
  const entry = props.entry as Entry;
  warnUnsupported(entry, entry.term + primaryKana(entry));
  const svg = await satori(layout(entry) as never, {
    width: W,
    height: H,
    fonts: [{ name: 'ZenMaru', data: FONT, weight: 700, style: 'normal' }],
  });
  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true }).toBuffer();
  return new Response(new Uint8Array(png), {
    headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=31536000, immutable' },
  });
};
