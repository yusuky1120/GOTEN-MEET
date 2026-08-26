import { useCallback, useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { createGameConfig } from './game/houseGame2';
import { installSeatOccupancy } from './game/installSeatOccupancy';
import VoicePanel, {
  type VoiceChromeState,
  type VoicePanelHandle,
} from './voice/VoicePanel';

const MAP_LABELS = new Set(['キッチン', '廊下', 'リビング', '作業部屋', '玄関']);
const WALL_COLOR = 0x493d30;
const ENTRANCE_MAT_COLOR = 0x65734e;

const INITIAL_VOICE_CHROME: VoiceChromeState = {
  muted: false,
  voiceConnected: false,
  canToggleMute: false,
  needsAudioStart: false,
  busy: false,
  error: null,
  statusLabel: '音声オフ',
};

export default function App() {
  const gameRootRef = useRef<HTMLDivElement>(null);
  const voicePanelRef = useRef<VoicePanelHandle>(null);
  const [roomName, setRoomName] = useState('玄関');
  const [hasJoined, setHasJoined] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [micMenuOpen, setMicMenuOpen] = useState(false);
  const [voiceChrome, setVoiceChrome] = useState<VoiceChromeState>(INITIAL_VOICE_CHROME);

  const handleJoinedChange = useCallback((joined: boolean) => {
    setHasJoined(joined);
    if (!joined) {
      setMicMenuOpen(false);
      setHelpOpen(false);
      setVoiceChrome(INITIAL_VOICE_CHROME);
    }
  }, []);

  const handleVoiceChromeChange = useCallback((state: VoiceChromeState) => {
    setVoiceChrome(state);
  }, []);

  useEffect(() => {
    if (!gameRootRef.current) return;

    const onRoomChange = (event: Event) => {
      setRoomName((event as CustomEvent<string>).detail);
    };

    window.addEventListener('goten:room-change', onRoomChange);
    const game = new Phaser.Game(createGameConfig(gameRootRef.current));
    const uninstallSeatOccupancy = installSeatOccupancy(game);

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
            // 玄関の出口を中央廊下（x=520〜640）と一直線にする。
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

            // 玄関マットも中央廊下と出口の軸上へ移動する。
            if (child.fillColor === ENTRANCE_MAT_COLOR && child.y === 850 && child.x === 610) {
              child.setX(580);
              tweaked += 1;
              continue;
            }

            // シンクとコンロの位置を左右で入れ替える。
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
      uninstallSeatOccupancy();
      game.destroy(true);
    };
  }, []);

  function handleMicClick() {
    if (!hasJoined) return;

    // Prefer one-tap mute when voice is ready; otherwise open the small menu.
    if (voiceChrome.canToggleMute && !voiceChrome.needsAudioStart && !voiceChrome.error) {
      voicePanelRef.current?.toggleMute();
      return;
    }

    setMicMenuOpen((open) => !open);
  }

  return (
    <main className={`app-shell${hasJoined ? ' is-joined' : ' is-prejoin'}`}>
      <header className="topbar">
        <div>
          <p className="eyebrow">SHARE HOUSE PROTOTYPE</p>
          <h1>GOTEN MEET</h1>
        </div>
        <div className="status-card">
          <span>現在地</span>
          <strong>{roomName}</strong>
        </div>
      </header>

      <section className="game-panel">
        <div ref={gameRootRef} className="game-root" />
      </section>

      <VoicePanel
        ref={voicePanelRef}
        currentMapRoom={roomName}
        micMenuOpen={micMenuOpen}
        onJoinedChange={handleJoinedChange}
        onVoiceChromeChange={handleVoiceChromeChange}
        onCloseMicMenu={() => setMicMenuOpen(false)}
      />

      {hasJoined && (
        <>
          <aside className={helpOpen ? 'help-card is-open' : 'help-card'} aria-hidden={!helpOpen}>
            <button
              type="button"
              className="panel-close-button"
              onClick={() => setHelpOpen(false)}
              aria-label="操作方法を閉じる"
            >
              ×
            </button>
            <h2>操作方法</h2>
            <p>
              <kbd>WASD</kbd> または <kbd>矢印キー</kbd> で移動
            </p>
            <p>
              <kbd>E</kbd> 近くの椅子・ソファに座る／立つ
            </p>
            <p>
              <kbd>Esc</kbd> 着席確認を閉じる／立つ
            </p>
            <p>壁・家具には当たり判定があります。</p>
            <div className="legend">
              <span>
                <i className="legend-dot room" />
                部屋
              </span>
              <span>
                <i className="legend-dot hall" />
                廊下
              </span>
              <span>
                <i className="legend-dot avatar" />
                あなた
              </span>
            </div>
          </aside>

          <div className="floating-controls" aria-label="画面操作">
            <button
              type="button"
              className={`floating-control floating-control--mic${voiceChrome.muted ? ' is-muted' : ''}${
                voiceChrome.canToggleMute ? '' : ' is-unavailable'
              }`}
              onClick={handleMicClick}
              aria-label={
                voiceChrome.canToggleMute
                  ? voiceChrome.muted
                    ? 'ミュートを解除する'
                    : 'マイクをミュートする'
                  : 'マイクメニューを開く'
              }
              aria-pressed={voiceChrome.muted}
              aria-expanded={micMenuOpen}
              title={
                voiceChrome.canToggleMute
                  ? 'タップでミュート切替'
                  : 'タップでマイクメニュー'
              }
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 14.5a3.5 3.5 0 0 0 3.5-3.5V6a3.5 3.5 0 1 0-7 0v5a3.5 3.5 0 0 0 3.5 3.5Z" />
                <path d="M5.5 10.5v.5a6.5 6.5 0 0 0 13 0v-.5M12 17.5V21M9 21h6" />
                {voiceChrome.muted ? <path className="mic-slash" d="m4 4 16 16" /> : null}
              </svg>
            </button>

            <button
              type="button"
              className={`floating-control floating-control--help${helpOpen ? ' is-active' : ''}`}
              onClick={() => {
                setHelpOpen((open) => !open);
                setMicMenuOpen(false);
              }}
              aria-label={helpOpen ? '操作方法を閉じる' : '操作方法を開く'}
              aria-expanded={helpOpen}
            >
              ?
            </button>
          </div>
        </>
      )}
    </main>
  );
}
