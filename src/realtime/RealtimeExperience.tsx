import HouseChatPanel from '../chat/HouseChatPanel';
import MicrophoneButton from '../controls/MicrophoneButton';
import JoinOverlay from '../onboarding/JoinOverlay';
import { useRealtimeSession } from './useRealtimeSession';

export type RealtimeExperienceProps = {
  currentMapRoom: string;
};

/**
 * Optional composition wrapper around join / chat / mic controls.
 * App currently composes these directly for topbar placement.
 */
export default function RealtimeExperience({ currentMapRoom }: RealtimeExperienceProps) {
  const session = useRealtimeSession({ currentMapRoom });

  return (
    <>
      <div ref={session.audioContainerRef} className="voice-audio-container" aria-hidden="true" />
      <JoinOverlay
        open={!session.joined}
        joining={session.joining}
        error={session.joinError}
        onJoin={(profile) => {
          void session.join(profile);
        }}
      />
      <MicrophoneButton
        joined={session.joined}
        voice={session.voice}
        voiceError={session.voiceError}
        onToggleMute={() => {
          void session.toggleMute();
        }}
        onRetryVoice={() => {
          void session.retryVoice();
        }}
        onStartAudio={() => {
          void session.startAudio();
        }}
      />
      <HouseChatPanel
        presenceConnected={session.joined}
        messages={session.chatMessages}
        sending={session.chatSending}
        error={session.chatError}
        onClearError={session.clearChatError}
        onSend={session.sendChat}
      />
    </>
  );
}
