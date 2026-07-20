import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { createGameConfig } from './game/houseGame2';

const MAP_LABELS = new Set(['キッチン', '廊下', 'リビング', '作業部屋', '玄関']);

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

    const removeMapLabels = () => {
      let removed = 0;

      for (const scene of game.scene.getScenes(true)) {
        for (const child of [...scene.children.list]) {
          if (child instanceof Phaser.GameObjects.Text && MAP_LABELS.has(child.text)) {
            child.destroy();
            removed += 1;
          }
        }
      }

      if (removed > 0) {
        game.events.off(Phaser.Core.Events.POST_STEP, removeMapLabels);
      }
    };

    game.events.on(Phaser.Core.Events.POST_STEP, removeMapLabels);

    return () => {
      window.removeEventListener('goten:room-change', onRoomChange);
      game.events.off(Phaser.Core.Events.POST_STEP, removeMapLabels);
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
    </main>
  );
}
