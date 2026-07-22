import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { DEFAULT_AVATAR_TYPE, type AvatarType } from '../avatar/avatarTypes';
import AvatarChoice from './AvatarChoice';

const MAX_NAME_LENGTH = 32;

export type JoinOverlayProps = {
  open: boolean;
  joining: boolean;
  error: string | null;
  onJoin: (profile: { participantName: string; avatarType: AvatarType }) => void;
};

export default function JoinOverlay({ open, joining, error, onJoin }: JoinOverlayProps) {
  const [participantName, setParticipantName] = useState('');
  const [avatarType, setAvatarType] = useState<AvatarType>(DEFAULT_AVATAR_TYPE);

  if (!open) return null;

  function submit() {
    if (joining) return;
    onJoin({ participantName, avatarType });
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    submit();
  }

  return (
    <div className="join-overlay" data-game-input-lock="true" role="dialog" aria-modal="true" aria-labelledby="join-overlay-title">
      <form className="join-overlay__card" onSubmit={handleSubmit}>
        <h2 id="join-overlay-title">GOTEN MEET に参加</h2>
        <p className="join-overlay__lead">表示名とアバターを選んで参加してください。</p>

        <label className="join-field">
          <span>表示名</span>
          <input
            type="text"
            value={participantName}
            onChange={(event) => setParticipantName(event.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={MAX_NAME_LENGTH}
            disabled={joining}
            autoComplete="nickname"
            autoFocus
            placeholder="なまえ"
          />
        </label>

        <AvatarChoice value={avatarType} onChange={setAvatarType} disabled={joining} />

        {error ? (
          <p className="join-overlay__error" role="alert">
            {error}
          </p>
        ) : null}

        <button type="submit" className="join-overlay__submit" disabled={joining}>
          {joining ? '参加中…' : '参加する'}
        </button>
      </form>
    </div>
  );
}
