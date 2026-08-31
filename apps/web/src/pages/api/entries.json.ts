import type { APIRoute } from 'astro';
import { entries } from '../../lib/entries';

/** 全データの公開エンドポイント。CLI / MCP / 第三者が自由に使える。 */
export const GET: APIRoute = () =>
  new Response(JSON.stringify({ version: 1, count: entries.length, entries }, null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
