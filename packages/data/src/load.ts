import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { validateEntry, type Entry, type Issue } from './schema.js';

export const ENTRIES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'entries');

export interface LoadResult {
  entries: Entry[];
  issues: Issue[];
}

/** entries/*.yml を全部読んで検証する。 */
export function loadEntries(dir: string = ENTRIES_DIR): LoadResult {
  const files = readdirSync(dir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml')).sort();
  const entries: Entry[] = [];
  const issues: Issue[] = [];
  const seenSlugs = new Map<string, string>();

  for (const file of files) {
    let raw: unknown;
    try {
      raw = parse(readFileSync(join(dir, file), 'utf8'));
    } catch (cause) {
      issues.push({ file, level: 'error', message: `YAML パース失敗: ${(cause as Error).message}` });
      continue;
    }

    const entryIssues = validateEntry(raw, file);
    issues.push(...entryIssues);
    if (entryIssues.some((i) => i.level === 'error')) continue;

    const entry = raw as Entry;
    const expected = `${entry.slug}.yml`;
    if (file !== expected) {
      issues.push({ file, level: 'error', message: `ファイル名は slug と一致させてください (期待: ${expected})` });
      continue;
    }
    const dup = seenSlugs.get(entry.slug);
    if (dup) {
      issues.push({ file, level: 'error', message: `slug が ${dup} と重複しています` });
      continue;
    }
    seenSlugs.set(entry.slug, file);
    entries.push(entry);
  }

  return { entries, issues };
}

/** 検索用に正規化した文字列群。CLI・Web の両方が使う。 */
export function searchKeys(entry: Entry): string[] {
  return [
    entry.term,
    entry.slug,
    ...(entry.aliases ?? []),
    ...entry.ja.map((r) => r.kana),
    entry.expansion ?? '',
    ...(entry.tags ?? []),
  ].filter(Boolean).map((s) => s.toLowerCase());
}
