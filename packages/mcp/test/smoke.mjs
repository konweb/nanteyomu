// MCP サーバに実際の JSON-RPC を流して応答を検証する。
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const server = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'server.mjs');
const child = spawn(process.execPath, [server], { stdio: ['pipe', 'pipe', 'inherit'] });

const requests = [
  { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } },
  { jsonrpc: '2.0', method: 'notifications/initialized' },
  { jsonrpc: '2.0', id: 2, method: 'tools/list' },
  { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'lookup_reading', arguments: { term: 'tmux' } } },
  { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'lookup_reading', arguments: { term: 'Cloudflare Turnstile' } } },
  { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'list_divergent_terms', arguments: {} } },
  { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'lookup_reading', arguments: { term: 'zzz-not-a-real-tool' } } },
];

for (const r of requests) child.stdin.write(JSON.stringify(r) + '\n');
child.stdin.end();

let out = '';
for await (const chunk of child.stdout) out += chunk;

const responses = out.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const byId = new Map(responses.map((r) => [r.id, r]));

assert.equal(responses.length, 6, `期待 6 応答、実際 ${responses.length}（通知に応答していないか確認）`);
assert.equal(byId.get(1).result.serverInfo.name, 'nanteyomu');
assert.equal(byId.get(1).result.protocolVersion, '2025-06-18');
assert.equal(byId.get(2).result.tools.length, 3);
assert.match(byId.get(3).result.content[0].text, /ティーマックス/);
assert.match(byId.get(3).result.content[0].text, /出典/);
assert.match(byId.get(4).result.content[0].text, /ターンスタイル/);
assert.match(byId.get(5).result.content[0].text, /JWT/);
assert.match(byId.get(6).result.content[0].text, /未収録/);

console.log('mcp smoke ok — 6/6 応答が期待どおり');
