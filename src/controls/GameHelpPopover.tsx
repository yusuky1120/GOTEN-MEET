import { useEffect, useRef } from 'react';

export type GameHelpPopoverProps = {
  open: boolean;
  panelId: string;
  onClose: () => void;
};

export default function GameHelpPopover({ open, panelId, onClose }: GameHelpPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }

    function onPointerDown(event: PointerEvent) {
      const panel = panelRef.current;
      const target = event.target as Node | null;
      if (!panel || !target) return;
      if (panel.contains(target)) return;
      const button = document.querySelector('.game-help-button');
      if (button && button.contains(target)) return;
      onClose();
    }

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      id={panelId}
      className="game-help-popover"
      data-game-input-lock="true"
      role="dialog"
      aria-labelledby={`${panelId}-title`}
    >
      <h2 id={`${panelId}-title`}>操作方法</h2>
      <p>
        <kbd>WASD</kbd> または <kbd>矢印キー</kbd>：移動
      </p>
      <p>
        <kbd>E</kbd>：近くの椅子・ソファに座る／立つ
      </p>
      <p>
        <kbd>Esc</kbd>：着席確認を閉じる／立つ
      </p>
      <p>壁・家具には当たり判定があります</p>
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
    </div>
  );
}
