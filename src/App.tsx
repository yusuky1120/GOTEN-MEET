import { useCallback, useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import HouseChatPanel from './chat/HouseChatPanel';
import GameHelpButton from './controls/GameHelpButton';
import GameHelpPopover from './controls/GameHelpPopover';
import MicrophoneButton from './controls/MicrophoneButton';
import './controls/gameControls.css';
import { createGameConfig } from './game/houseGame2';
import { installPhaserKeyboardCaptureSync } from './game/phaserKeyboardCapture';
import JoinOverlay from './onboarding/JoinOverlay';
import {
  didPresenceDisconnect,
  shouldShowJoinOverlay,
} from './onboarding/joinValidation';
import { useRealtimeSession } from './realtime/useRealtimeSession';

const MAP_LABELS = new Set(['キッチン', '廊下', 'リビング', '作業部屋', '玄関']);
const WALL_COLOR = 0x493d30;
const ENTRANCE_MAT_COLOR = 0x65734e;
const HELP_PANEL_ID = 'game-help-panel';

export default function App() {
  const gameRootRef = useRef<HTMLDivElement>(null);
  const wasPresenceConnectedRef = useRef(false);
  const presenceCleanupInFlightRef = useRef(false);
  const [roomName, setRoomName] = useState('玄関');
  const [helpOpen, setHelpOpen] = useState(false);
  const closeHelp = useCallback(() => setHelpOpen(false), []);
  const toggleHelp = useCallback(() => setHelpOpen((open) => !open), []);

  const session = useRealtimeSession({ currentMapRoom: roomName });
  const joinOverlayOpen = shouldShowJoinOverlay({
    joining: session.joining,
    presenceConnected: session.joined,
  });

  useEffect(() => {
    const connected = session.joined;
    const disconnectedUnexpectedly = didPresenceDisconnect({
      wasConnected: wasPresenceConnectedRef.current,
      connected,
    });
    wasPresenceConnectedRef.current = connected;

    if (!disconnectedUnexpectedly || presenceCleanupInFlightRef.current) return;

    presenceCleanupInFlightRef.current = true;
    void session.leave().finally(() => {
      presenceCleanupInFlightRef.current = false;
    });
  }, [session.joined, session.leave]);

  useEffect(() => {
    if (!gameRootRef.current) return;

    const onRoomChange = (event: Event) => {
      setRoomName((event as CustomEvent<string>).detail);
    };

    window.addEventListener('goten:room-change', onRoomChange);
    const game = new Phaser.Game(createGameConfig(gameRootRef.current));
    const removeKeyboardCaptureSync = installPhaserKeyboardCaptureSync(game);

    let labelsRemoved = false;
    let mapTweaksApplied = false;

    const finalizeMap = () => {
      let removed = 0;
      let tweaked = 0;

      for (const scene of game.scene.getScenes(true)) {
        for (const child of [...scene.children.list]) {
          if (child instanceof Phaser.GameObjects.Text && MAP_LABELS.has(child.text)) {
            child.destroy();
            removed += 1;
            continue;
          }

          if (child instanceof Phaser.GameObjects.Rectangle) {
            if (child.fillColor === WALL_COLOR && child.y === 880 && child.x === 485) {
              child.setPosition(470, 880).setDisplaySize(100, 12);
              const wall = child as Phaser.GameObjects.Rectangle & {
                body?: Phaser.Physics.Arcade.StaticBody;
              };
              wall.body?.updateFromGameObject();
              tweaked += 1;
              continue;
            }

            if (child.fillColor === WALL_COLOR && child.y === 880 && child.x === 705) {
              child.setPosition(700, 880).setDisplaySize(120, 12);
              const wall = child as Phaser.GameObjects.Rectangle & {
                body?: Phaser.Physics.Arcade.StaticBody;
              };
              wall.body?.updateFromGameObject();
              tweaked += 1;
              continue;
            }

            if (child.fillColor === ENTRANCE_MAT_COLOR && child.y === 850 && child.x === 610) {
              child.setX(580);
              tweaked += 1;
              continue;
            }

            if (child.fillColor === 0xaeb8ba && child.y === 92 && child.x === 360) {
              child.setX(505);
              tweaked += 1;
              continue;
            }

            if (child.fillColor === 0x323230 && child.y === 91 && child.x === 505) {
              child.setX(360);
              tweaked += 1;
            }
          } else if (child instanceof Phaser.GameObjects.Ellipse) {
            if (child.fillColor === 0x7f8d90 && child.y === 92 && child.x === 360) {
              child.setX(505);
              tweaked += 1;
            }
          } else if (child instanceof Phaser.GameObjects.Arc) {
            if (child.fillColor === 0x191918 && child.y === 91) {
              if (child.x === 480) {
                child.setX(335);
                tweaked += 1;
              } else if (child.x === 530) {
                child.setX(385);
                tweaked += 1;
              }
            }
          }
        }
      }

      if (removed > 0) labelsRemoved = true;
      if (tweaked >= 8) mapTweaksApplied = true;

      if (labelsRemoved && mapTweaksApplied) {
        game.events.off(Phaser.Core.Events.POST_STEP, finalizeMap);
      }
    };

    game.events.on(Phaser.Core.Events.POST_STEP, finalizeMap);

    return () => {
      window.removeEventListener('goten:room-change', onRoomChange);
      game.events.off(Phaser.Core.Events.POST_STEP, finalizeMap);
      removeKeyboardCaptureSync();
      game.destroy(true);
    };
  }, []);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">SHARE HOUSE PROTOTYPE</p>
          <h1>GOTEN MEET</h1>
        </div>
        <div className="topbar__trailing">
          <div className="status-card">
            <span>現在地</span>
            <strong>{roomName}</strong>
          </div>
        </div>
      </header>

      <section className="game-panel">
        <div ref={gameRootRef} className="game-root" />
        <div className="game-controls">
          <div className="game-controls__mic">
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
          </div>
          <GameHelpPopover open={helpOpen} panelId={HELP_PANEL_ID} onClose={closeHelp} />
          <GameHelpButton open={helpOpen} panelId={HELP_PANEL_ID} onToggle={toggleHelp} />
        </div>
      </section>

      <div ref={session.audioContainerRef} className="voice-audio-container" aria-hidden="true" />

      <JoinOverlay
        open={joinOverlayOpen}
        joining={session.joining}
        error={session.joinError}
        onJoin={(profile) => {
          void session.join(profile);
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
    </main>
  );
}
