export function isTextEntryFocused(): boolean {
  const element = document.activeElement;

  if (!(element instanceof HTMLElement)) {
    return false;
  }

  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    element.isContentEditable ||
    element.getAttribute('role') === 'textbox'
  );
}

/** True when overlays (join modal, help) or text fields should freeze game controls. */
export function isGameInputBlocked(): boolean {
  if (document.querySelector('[data-game-input-lock="true"]')) {
    return true;
  }
  return isTextEntryFocused();
}
