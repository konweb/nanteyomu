import { createSignal, createMemo, onMount, For, Show } from 'solid-js';
import { NEW_ENTRY_ISSUE } from '../lib/site';

interface IndexRow {
  /** slug */ s: string;
  /** term */ t: string;
  /** primary kana */ k: string;
  /** category */ c: string;
  /** divergence */ d: boolean;
  /** search haystack */ q: string;
}

const LIMIT = 12;

export default function Search() {
  const [rows, setRows] = createSignal<IndexRow[]>([]);
  const [query, setQuery] = createSignal('');
  const [cursor, setCursor] = createSignal(0);
  const [loaded, setLoaded] = createSignal(false);

  onMount(async () => {
    try {
      const res = await fetch('/search-index.json');
      setRows(await res.json());
    } catch {
      /* 検索インデックスが取れなくてもページ自体は使える */
    } finally {
      setLoaded(true);
    }
  });

  const hits = createMemo(() => {
    const q = query().trim().toLowerCase();
    if (!q) return [];
    const scored: Array<{ row: IndexRow; score: number }> = [];
    for (const row of rows()) {
      const term = row.t.toLowerCase();
      let score = -1;
      if (term === q) score = 0;
      else if (term.startsWith(q)) score = 1;
      else if (row.k.toLowerCase().startsWith(q)) score = 2;
      else if (row.q.includes(q)) score = 3;
      if (score >= 0) scored.push({ row, score });
    }
    scored.sort((a, b) => a.score - b.score || a.row.t.localeCompare(b.row.t));
    return scored.slice(0, LIMIT).map((s) => s.row);
  });

  const onKeyDown = (e: KeyboardEvent) => {
    const n = hits().length;
    if (n === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => (c + 1) % n);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => (c - 1 + n) % n);
    } else if (e.key === 'Enter') {
      const hit = hits()[Math.min(cursor(), n - 1)];
      if (hit) window.location.href = `/w/${hit.s}/`;
    }
  };

  return (
    <div class="search">
      <input
        type="search"
        autocomplete="off"
        placeholder="tmux, nginx, Turnstile, ジェイダブリューティー …"
        aria-label="用語を検索"
        role="combobox"
        aria-expanded={hits().length > 0}
        aria-controls="search-results"
        value={query()}
        onInput={(e) => {
          setQuery(e.currentTarget.value);
          setCursor(0);
        }}
        onKeyDown={onKeyDown}
      />

      <Show when={query().trim() && loaded()}>
        <Show
          when={hits().length > 0}
          fallback={
            <p class="search-hint">
              「{query()}」は未収録です。
              <a href={NEW_ENTRY_ISSUE}>
                追加をリクエスト
              </a>
              できます。
            </p>
          }
        >
          <ul class="search-results" id="search-results" role="listbox">
            <For each={hits()}>
              {(row, i) => (
                <li role="option" aria-selected={i() === cursor()}>
                  <a
                    href={`/w/${row.s}/`}
                    classList={{ 'is-cursor': i() === cursor() }}
                  >
                    <span class="term mono">{row.t}</span>
                    <span class="kana">{row.k}</span>
                    <Show when={row.d}>
                      <span class="badge divergence">日英でズレる</span>
                    </Show>
                  </a>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>

      <Show when={!query().trim()}>
        <p class="search-hint">↑↓ で選択、Enter で開く。カタカナからも引けます。</p>
      </Show>
    </div>
  );
}
