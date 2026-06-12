import { useEffect, useRef } from 'react';

/**
 * Shared modal/overlay chrome: close on Escape, lock body scroll while open, and
 * restore keyboard focus to the triggering element when the overlay closes.
 * - Conditionally-mounted overlays can call it with no flag (defaults enabled).
 * - Always-mounted overlays (controlled by an `open` prop) pass that as `enabled`.
 * onClose is read through a ref so the listener subscribes once, not every render.
 */
export function useModalDismiss(onClose: () => void, enabled: boolean = true) {
  const cb = useRef(onClose);
  cb.current = onClose;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cb.current(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // remember what was focused so we can return focus on close (keyboard users
    // otherwise get dropped at the top of the page when a dialog dismisses)
    const prevFocus = document.activeElement as HTMLElement | null;
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      if (prevFocus && typeof prevFocus.focus === 'function' && document.contains(prevFocus)) {
        prevFocus.focus();
      }
    };
  }, [enabled]);
}
