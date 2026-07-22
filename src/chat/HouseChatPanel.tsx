import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { MAX_CHAT_MESSAGE_LENGTH } from './chatConstants';
import type { HouseChatMessage } from './chatTypes';
import { countChatCharacters, normalizeChatText } from './chatValidation';

export type HouseChatPanelProps = {
  presenceConnected: boolean;
  messages: HouseChatMessage[];
  sending: boolean;
  error: string | null;
  onClearError: () => void;
  onSend: (text: string) => Promise<boolean>;
};

function formatTime(sentAt: number): string {
  if (!Number.isFinite(sentAt) || sentAt <= 0) return '';
  const date = new Date(sentAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export default function HouseChatPanel({
  presenceConnected,
  messages,
  sending,
  error,
  onClearError,
  onSend,
}: HouseChatPanelProps) {
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  const charCount = countChatCharacters(normalizeChatText(draft));
  const canSubmit =
    presenceConnected && !sending && charCount > 0 && charCount <= MAX_CHAT_MESSAGE_LENGTH;

  async function handleSend() {
    if (!canSubmit) return;
    const ok = await onSend(draft);
    if (ok) {
      setDraft('');
      onClearError();
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void handleSend();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    void handleSend();
  }

  return (
    <aside className="house-chat" aria-label="House chat">
      <div className="house-chat__header">
        <h2>ハウスチャット</h2>
        <p className="house-chat__status">
          {presenceConnected ? '接続済み' : '参加前'}
        </p>
      </div>

      {!presenceConnected ? (
        <p className="house-chat__hint">参加するとチャットできます</p>
      ) : (
        <>
          <div ref={listRef} className="house-chat__list" role="log" aria-live="polite">
            {messages.length === 0 ? (
              <p className="house-chat__empty">まだメッセージはありません</p>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={
                    message.own
                      ? 'house-chat__message house-chat__message--own'
                      : 'house-chat__message'
                  }
                >
                  <span className="house-chat__name">[{message.participantName}]</span>{' '}
                  <span className="house-chat__text">{message.text}</span>
                  {formatTime(message.sentAt) ? (
                    <span className="house-chat__time">{formatTime(message.sentAt)}</span>
                  ) : null}
                </div>
              ))
            )}
          </div>

          <form className="house-chat__composer" onSubmit={handleSubmit}>
            <input
              type="text"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                if (error) onClearError();
              }}
              onKeyDown={handleKeyDown}
              placeholder="メッセージを入力"
              maxLength={MAX_CHAT_MESSAGE_LENGTH * 4}
              disabled={!presenceConnected || sending}
              autoComplete="off"
              enterKeyHint="send"
            />
            <div className="house-chat__composer-row">
              <span className="house-chat__counter">
                {charCount} / {MAX_CHAT_MESSAGE_LENGTH}
              </span>
              <button type="submit" disabled={!canSubmit}>
                {sending ? '送信中…' : '送信'}
              </button>
            </div>
          </form>
        </>
      )}

      {error ? (
        <p className="house-chat__error" role="alert">
          {error}
        </p>
      ) : null}
    </aside>
  );
}
