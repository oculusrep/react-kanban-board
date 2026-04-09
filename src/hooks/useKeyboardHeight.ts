import { useState, useEffect } from 'react';

export function useKeyboardHeight() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (!window.visualViewport) return;

    const viewport = window.visualViewport;

    function onResize() {
      const height = window.innerHeight - (viewport?.height ?? window.innerHeight);
      setKeyboardHeight(Math.max(0, height));
    }

    viewport.addEventListener('resize', onResize);
    return () => viewport.removeEventListener('resize', onResize);
  }, []);

  return keyboardHeight;
}
