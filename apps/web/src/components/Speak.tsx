import { createSignal, Show } from 'solid-js';

/** Web Speech API で英語読みを再生する。非対応環境ではボタンを出さない。 */
export default function Speak(props: { text: string }) {
  const [supported] = createSignal(
    typeof window !== 'undefined' && 'speechSynthesis' in window,
  );

  const speak = () => {
    const u = new SpeechSynthesisUtterance(props.text);
    u.lang = 'en-US';
    u.rate = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };

  return (
    <Show when={supported()}>
      <button class="speak" type="button" onClick={speak} aria-label={`${props.text} を読み上げる`}>
        ▸ 英語で再生
      </button>
    </Show>
  );
}
