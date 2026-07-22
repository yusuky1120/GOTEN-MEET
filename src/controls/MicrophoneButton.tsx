import type { VoiceSessionSnapshot } from '../voice/types';

export type MicrophoneButtonProps = {
  joined: boolean;
  voice: VoiceSessionSnapshot;
  voiceError: string | null;
  onToggleMute: () => void;
  onRetryVoice: () => void;
  onStartAudio: () => void;
};

function MicIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z"
      />
      {muted ? (
        <line
          x1="4"
          y1="4"
          x2="20"
          y2="20"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      ) : null}
    </svg>
  );
}

export default function MicrophoneButton({
  joined,
  voice,
  voiceError,
  onToggleMute,
  onRetryVoice,
  onStartAudio,
}: MicrophoneButtonProps) {
  const connecting = voice.status === 'connecting' || voice.status === 'switching';
  const connected = voice.status === 'connected';
  const hasVoiceError = Boolean(voiceError) || voice.status === 'error';

  let ariaLabel = 'マイク';
  let ariaPressed: boolean | undefined;
  let disabled = !joined || connecting;

  if (!joined) {
    disabled = true;
    ariaLabel = 'マイク（未参加）';
  } else if (connecting) {
    disabled = true;
    ariaLabel = '音声に接続中';
  } else if (hasVoiceError && !connected) {
    disabled = false;
    ariaLabel = '音声に再接続';
  } else if (connected) {
    disabled = false;
    ariaPressed = voice.muted;
    ariaLabel = voice.muted ? 'マイクのミュートを解除' : 'マイクをミュート';
  }

  function handleClick() {
    if (!joined) return;
    if (hasVoiceError && !connected) {
      onRetryVoice();
      return;
    }
    if (connected) {
      onToggleMute();
    }
  }

  return (
    <div className="mic-control">
      <button
        type="button"
        className={
          hasVoiceError && !connected
            ? 'mic-button mic-button--error'
            : voice.muted
              ? 'mic-button mic-button--muted'
              : 'mic-button'
        }
        aria-label={ariaLabel}
        aria-pressed={ariaPressed}
        disabled={disabled}
        onClick={handleClick}
        title={voiceError ?? undefined}
      >
        {connecting ? <span className="mic-button__spinner" aria-hidden="true" /> : <MicIcon muted={voice.muted} />}
      </button>

      {joined && voice.needsAudioStart ? (
        <button type="button" className="mic-control__action" onClick={onStartAudio}>
          音声を有効にする
        </button>
      ) : null}

      {joined && hasVoiceError && !connected ? (
        <div className="mic-control__error" role="alert">
          <span>音声に接続できません</span>
          <button type="button" className="mic-control__action" onClick={onRetryVoice}>
            再試行
          </button>
        </div>
      ) : null}
    </div>
  );
}
