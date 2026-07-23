import type Phaser from 'phaser';
import { isTextEntryFocused } from './isTextEntryFocused';

/**
 * Phaser captures movement keys globally and calls preventDefault on the
 * browser event. Pause that capture while a DOM text field owns focus so
 * WASD / E / arrow keys keep their normal editing behavior.
 */
export function installPhaserKeyboardCaptureSync(game: Phaser.Game): () => void {
  let pendingFrame: number | null = null;

  const sync = () => {
    pendingFrame = null;
    const allowBrowserTextInput = isTextEntryFocused();

    for (const scene of game.scene.getScenes(true)) {
      const keyboard = scene.input.keyboard;
      if (!keyboard) continue;

      if (allowBrowserTextInput) {
        keyboard.disableGlobalCapture();
      } else {
        keyboard.enableGlobalCapture();
      }
    }
  };

  const scheduleSync = () => {
    if (pendingFrame !== null) {
      cancelAnimationFrame(pendingFrame);
    }
    pendingFrame = requestAnimationFrame(sync);
  };

  // focusin handles the newly focused input immediately. focusout is deferred
  // until document.activeElement points at the next element.
  document.addEventListener('focusin', sync, true);
  document.addEventListener('focusout', scheduleSync, true);
  sync();

  return () => {
    document.removeEventListener('focusin', sync, true);
    document.removeEventListener('focusout', scheduleSync, true);
    if (pendingFrame !== null) {
      cancelAnimationFrame(pendingFrame);
    }

    for (const scene of game.scene.getScenes(true)) {
      scene.input.keyboard?.enableGlobalCapture();
    }
  };
}
