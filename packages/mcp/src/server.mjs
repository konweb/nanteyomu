#!/usr/bin/env node
/**
 * nanteyomu MCP サーバ。
 * SDK に依存せず JSON-RPC 2.0 over stdio を直接話す（依存ゼロ・バージョンドリフトなし）。
 */
import { createInterface } from 'node:readline';
import { loadEntries, search, format, primaryKana } from './data.mjs';

const SERVER_INFO = { name: 'nanteyomu', version: '0.1.0' };
const FALLBACK_PROTOCOL = '2025-06-18';

const entries = loadEntries();

const TOOLS = [
  {
    name: 'lookup_reading',
    description:
      'IT のツール名・サービス名の日本語での読み方（カタカナ）を、英語圏の発音・出典つきで返す。' +
      'tmux, nginx, Cloudflare Turnstile のような綴りから読みが推測できない語に使う。',
    inputSchema: {
      type: 'object',
      properties: {
        term: { type: 'string', description: '調べたい用語。カタカナでの逆引きも可能。' },
      },
      required: ['term'],
    },
  },
  {
    name: 'search_terms',
    description: '用語を部分一致で検索して候補を一覧で返す。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '検索語' },
        limit: { type: 'number', description: '最大件数（既定 10）' },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_divergent_terms',
    description:
      '英語圏での発音と日本の現場で通っている読みが食い違う用語の一覧を返す。' +
      '日本語話者向けに読みを説明するときに使う。',
    inputSchema: { type: 'object', properties: {} },
  },
];

function text(s) {
  return { content: [{ type: 'text', text: s }] };
}

function callTool(name, args = {}) {
  if (name === 'lookup_reading') {
    const hits = search(entries, args.term, 5);
    if (hits.length === 0) {
      return text(`「${args.term}」は nanteyomu に未収録です。読みを推測で答えないでください。`);
    }
    if (hits.length > 1 && hits[0].term.toLowerCase() !== String(args.term).trim().toLowerCase()) {
      return text(
        `候補が複数あります:\n${hits.map((e) => `- ${e.term} (${primaryKana(e)})`).join('\n')}\n\n` +
          `最有力:\n${format(hits[0])}`,
      );
    }
    return text(format(hits[0]));
  }

  if (name === 'search_terms') {
    const hits = search(entries, args.query, Number(args.limit) || 10);
    if (hits.length === 0) return text(`「${args.query}」に一致する用語はありません。`);
    return text(hits.map((e) => `- ${e.term} — ${primaryKana(e)}`).join('\n'));
  }

  if (name === 'list_divergent_terms') {
    const list = entries.filter((e) => e.divergence);
    return text(
      list
        .map((e) => `- ${e.term} — ${primaryKana(e)}: ${(e.divergenceNote ?? '').replace(/\s+/g, ' ').trim()}`)
        .join('\n'),
    );
  }

  throw new Error(`unknown tool: ${name}`);
}

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function handle(msg) {
  const { id, method, params } = msg;
  // 通知（id なし）には応答しない
  const isNotification = id === undefined || id === null;

  try {
    let result;
    switch (method) {
      case 'initialize':
        result = {
          protocolVersion:
            typeof params?.protocolVersion === 'string' ? params.protocolVersion : FALLBACK_PROTOCOL,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
        };
        break;
      case 'tools/list':
        result = { tools: TOOLS };
        break;
      case 'tools/call':
        result = callTool(params?.name, params?.arguments ?? {});
        break;
      case 'ping':
        result = {};
        break;
      default:
        if (isNotification) return; // notifications/initialized など
        send({ jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${method}` } });
        return;
    }
    if (!isNotification) send({ jsonrpc: '2.0', id, result });
  } catch (err) {
    if (!isNotification) {
      send({ jsonrpc: '2.0', id, error: { code: -32603, message: String(err?.message ?? err) } });
    }
  }
}

const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } });
    return;
  }
  handle(msg);
});
