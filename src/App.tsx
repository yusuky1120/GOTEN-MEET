import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { createGameConfig } from './game/houseGame2';
import VoicePanel from './voice/VoicePanel';

const MAP_LABELS = new Set(['キッチン', '廊下', 'リビング', '作業部屋', '玄関']);
const WALL_COLOR = 0x493d30;
const ENTRANCE_MAT_COLOR = 0x65734e;

export default function App() {
  const gameRootRef = useRef<HTMLDivElement>(null);
  const [roomName, setRoomName] = useState('玄関');

  useEffect(() => {
    if (!gameRootRef.current) return;

    const onRoomChange = (event: Event) => {
      setRoomName((event as CustomEvent<string>).detail);
    };

    window.addEventListener('goten:room-change', onRoomChange);
    const game = new Phaser.Game(createGameConfig(gameRootRef.current));

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
        <div className="status-card">
          <span>現在地</span>
          <strong>{roomName}</strong>
        </div>
      </header>

      <section className="game-panel">
        <div ref={gameRootRef} className="game-root" />
      </section>

      <aside className="help-card">
        <h2>操作方法</h2>
        <p><kbd>WASD</kbd> または <kbd>矢印キー</kbd> で移動</p>
        <p><kbd>E</kbd> 近くの椅子・ソファに座る／立つ</p>
        <p><kbd>Esc</kbd> 着席確認を閉じる／立つ</p>
        <p>壁・家具には当たり判定があります。</p>
        <div className="legend">
          <span><i className="legend-dot room" />部屋</span>
          <span><i className="legend-dot hall" />廊下</span>
          <span><i className="legend-dot avatar" />あなた</span>
        </div>
      </aside>

      <VoicePanel currentMapRoom={roomName} />
    </main>
  );
}
