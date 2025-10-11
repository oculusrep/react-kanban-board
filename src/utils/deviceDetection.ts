// Device detection utilities for responsive UX

export const isTouchDevice = (): boolean => {
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    // @ts-ignore - for IE compatibility
    navigator.msMaxTouchPoints > 0
  );
};

export const isMobile = (): boolean => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
};

export const isDesktop = (): boolean => {
  return !isTouchDevice() && !isMobile();
};

export const supportsRightClick = (): boolean => {
  // Right-click context menus work best on desktop with mouse
  return isDesktop();
};

// Long-press handler for touch devices (like iPad)
// Returns a cleanup function to remove event listeners
export const addLongPressListener = (
  element: HTMLElement,
  onLongPress: (x: number, y: number) => void,
  duration: number = 500 // milliseconds
): (() => void) => {
  let longPressTimer: NodeJS.Timeout | null = null;
  let touchStartX = 0;
  let touchStartY = 0;
  let hasMoved = false;

  const handleTouchStart = (e: TouchEvent) => {
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    hasMoved = false;

    longPressTimer = setTimeout(() => {
      if (!hasMoved) {
        // Prevent default context menu and text selection
        e.preventDefault();
        onLongPress(touchStartX, touchStartY);
      }
    }, duration);
  };

  const handleTouchMove = (e: TouchEvent) => {
    const touch = e.touches[0];
    const moveThreshold = 10; // pixels

    if (
      Math.abs(touch.clientX - touchStartX) > moveThreshold ||
      Math.abs(touch.clientY - touchStartY) > moveThreshold
    ) {
      hasMoved = true;
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    }
  };

  const handleTouchEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  // Add event listeners
  element.addEventListener('touchstart', handleTouchStart, { passive: false });
  element.addEventListener('touchmove', handleTouchMove, { passive: true });
  element.addEventListener('touchend', handleTouchEnd, { passive: true });
  element.addEventListener('touchcancel', handleTouchEnd, { passive: true });

  // Return cleanup function
  return () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
    }
    element.removeEventListener('touchstart', handleTouchStart);
    element.removeEventListener('touchmove', handleTouchMove);
    element.removeEventListener('touchend', handleTouchEnd);
    element.removeEventListener('touchcancel', handleTouchEnd);
  };
};