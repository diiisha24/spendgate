/**
 * Minimal app-wide "data changed" signal. Every successful mutation emits it,
 * and every data hook re-fetches, so the dashboard, lists and badges always
 * reflect the latest server state without a global store.
 */
const target = new EventTarget();
const EVENT = 'spendgate:data-changed';

export function notifyDataChanged(): void {
  target.dispatchEvent(new Event(EVENT));
}

export function onDataChanged(listener: () => void): () => void {
  target.addEventListener(EVENT, listener);
  return () => target.removeEventListener(EVENT, listener);
}
