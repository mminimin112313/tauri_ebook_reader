import { useEffect, useRef } from 'react';

const INTERACTIVE_WHEEL_SELECTOR = '.toc-panel, .reader-hud, .reader-chrome-top, .settings-panel, .settings-overlay, input, textarea, select, button, a, [role="button"]';

export function shouldHandleNativePageWheel(event) {
  if (!event || Math.abs(event.deltaY || 0) < 18) return false;
  if (event.target?.closest?.(INTERACTIVE_WHEEL_SELECTOR)) return false;
  return true;
}

export function useNativePageControls({ enabled, turnPage }) {
  const wheelLockRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const onWheel = (event) => {
      if (!shouldHandleNativePageWheel(event) || wheelLockRef.current) return;
      event.preventDefault();
      wheelLockRef.current = true;
      turnPage(event.deltaY > 0 ? 1 : -1);
      window.setTimeout(() => { wheelLockRef.current = false; }, 320);
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, [enabled, turnPage]);
}
