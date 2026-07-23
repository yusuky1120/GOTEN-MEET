import type Phaser from 'phaser';
import { isTextEntryFocused } from './isTextEntryFocused';

/**
 * Phaser captures movement keys globally and calls preventDefault on the
 * browser event. Pause that capture while a DOM text field owns focus so
 * WASD / E / arrow keys keep their normal editing behavior.
 */
export function installPhaserKeyboardCaptureSync(game: Phaser.Game): () => void {
  let pendingFrame: number | null = null;
  let disposed = false;

  const sync = () => {
    pendingFrame = null;
    if (disposed) return;

    const activeScenes = game.scene.getScenes(true);
    if (activeScenes.length === 0) {
      // JoinOverlay may autofocus before Phaser has finished starting its Scene.
      // Retry until the keyboard plugin exists, while preserving the current focus.
      pendingFrame = requestAnimationFrame(sync);
      return;
    }

    const allowBrowserTextInput = isTextEntryFocused();
    for (const scene of activeScenes) {
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

  const onFocusIn = () => sync();
  const onFocusOut = () => scheduleSync();

  // focusin handles the newly focused input immediately. focusout is deferred
  // until document.activeElement points at the next element.
  document.addEventListener('focusin', onFocusIn, true);
  document.addEventListener('focusout', onFocusOut, true);
  sync();

  return () => {
    disposed = true;
    document.removeEventListener('focusin', onFocusIn, true);
    document.removeEventListener('focusout', onFocusOut, true);
    if (pendingFrame !== null) {
      cancelAnimationFrame(pendingFrame);
    }

    for (const scene of game.scene.getScenes(true)) {
      scene.input.keyboard?.enableGlobalCapture();
    }
  };
}
