export type GameHelpButtonProps = {
  open: boolean;
  panelId: string;
  onToggle: () => void;
};

export default function GameHelpButton({ open, panelId, onToggle }: GameHelpButtonProps) {
  return (
    <button
      type="button"
      className="game-help-button"
      aria-label="操作方法"
      aria-expanded={open}
      aria-controls={panelId}
      onClick={onToggle}
    >
      ?
    </button>
  );
}
