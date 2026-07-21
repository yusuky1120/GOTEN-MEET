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
