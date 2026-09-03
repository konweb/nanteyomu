import { createSignal, onMount, Show } from 'solid-js';

/**
 * 「タメになった」ボタン。
 *
 * 件数は /api/tame/<slug> から取る。押した記録は localStorage にも残して
 * おき、再訪時は押済みの見た目にする（サーバー側は IP と日付で二重投票を
 * 弾いているので、記録が消えていても数が増えることはない）。
 */
export default function Tame(props: { slug: string }) {
  const [count, setCount] = createSignal<number | null>(null);
  const [voted, setVoted] = createSignal(false);
  const [busy, setBusy] = createSignal(false);

  const key = `tame:${props.slug}`;
  const endpoint = `/api/tame/${encodeURIComponent(props.slug)}`;

  /** localStorage はプライベートモードなどで例外を投げるので必ず包む。 */
  const remembered = () => {
    try {
      return localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  };

  onMount(async () => {
    setVoted(remembered());
    try {
      const res = await fetch(endpoint);
      if (res.ok) setCount(((await res.json()) as { count: number }).count);
    } catch {
      /* 取れなければ件数を出さないだけにする */
    }
  });

  const press = async () => {
    if (voted() || busy()) return;
    setBusy(true);
    // 先に見た目を進めておき、失敗したら戻す
    const before = count();
    setVoted(true);
    setCount((before ?? 0) + 1);
    try {
      const res = await fetch(endpoint, { method: 'POST' });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { count: number; counted: boolean };
      setCount(data.count);
      try {
        localStorage.setItem(key, '1');
      } catch {
        /* 保存できなくても投票自体は済んでいる */
      }
    } catch {
      setVoted(false);
      setCount(before);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="tame">
      <button
        class="tame-btn"
        classList={{ 'is-voted': voted() }}
        type="button"
        onClick={press}
        disabled={voted() || busy()}
        aria-pressed={voted()}
      >
        <span class="tame-icon" aria-hidden="true">{voted() ? '💡' : '❓'}</span>
        <span>{voted() ? 'タメになった！' : 'タメになった'}</span>
        <Show when={count() !== null}>
          <span class="tame-count">{count()}</span>
        </Show>
      </button>
      <p class="tame-note" aria-live="polite">
        {voted() ? 'ありがとう。1 日 1 回まで数えています' : '読みが役に立ったら押してください'}
      </p>
    </div>
  );
}
