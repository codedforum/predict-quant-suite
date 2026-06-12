import { useEffect, useRef } from 'react';

/**
 * Shared modal/overlay chrome: close on Escape and lock body scroll while open.
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
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [enabled]);
}
