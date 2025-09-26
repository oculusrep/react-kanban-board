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