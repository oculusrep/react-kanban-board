import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

const PULL_THRESHOLD = 70; // pixels to pull before triggering refresh
const MAX_PULL = 120; // max visual pull distance

// Pages where pull-to-refresh should be disabled (gesture conflicts)
const DISABLED_PATHS = ['/mapping', '/mapping-old', '/portal/map'];

export function PullToRefresh() {
  const location = useLocation();
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startYRef = useRef<number | null>(null);
  const isPullingRef = useRef(false);

  const isDisabled = DISABLED_PATHS.some((p) => location.pathname.startsWith(p));

  useEffect(() => {
    if (isDisabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      // Only enable when scrolled to top
      if (window.scrollY > 0) return;

      // Skip if touch starts on the map or other gesture-sensitive elements
      const target = e.target as HTMLElement;
      if (target.closest('.gm-style')) return;

      startYRef.current = e.touches[0].clientY;
      isPullingRef.current = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (startYRef.current === null) return;
      if (window.scrollY > 0) {
        startYRef.current = null;
        return;
      }

      const currentY = e.touches[0].clientY;
      const distance = currentY - startYRef.current;

      if (distance > 0) {
        isPullingRef.current = true;
        // Apply resistance — diminishing returns as you pull further
        const eased = Math.min(MAX_PULL, distance * 0.5);
        setPullDistance(eased);

        // Prevent native scrolling while pulling
        if (e.cancelable) e.preventDefault();
      }
    };

    const handleTouchEnd = () => {
      if (isPullingRef.current && pullDistance >= PULL_THRESHOLD) {
        setIsRefreshing(true);
        // Brief delay so the user sees the refresh indicator
        setTimeout(() => {
          window.location.reload();
        }, 300);
      } else {
        setPullDistance(0);
      }
      startYRef.current = null;
      isPullingRef.current = false;
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDisabled, pullDistance]);

  if (isDisabled || pullDistance === 0) return null;

  const progress = Math.min(1, pullDistance / PULL_THRESHOLD);
  const ready = pullDistance >= PULL_THRESHOLD;

  return (
    <div
      className="fixed left-0 right-0 z-[9999] flex justify-center pointer-events-none"
      style={{
        top: `calc(env(safe-area-inset-top) + ${pullDistance - 50}px)`,
        transition: isRefreshing ? 'top 0.2s ease-out' : 'none',
      }}
    >
      <div className="bg-white rounded-full shadow-lg p-2 flex items-center justify-center w-10 h-10">
        {isRefreshing ? (
          <svg
            className="w-5 h-5 text-[#002147] animate-spin"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : (
          <svg
            className="w-5 h-5 text-[#002147]"
            style={{
              transform: `rotate(${ready ? 180 : progress * 180}deg)`,
              transition: 'transform 0.15s ease-out',
            }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 14l-7 7m0 0l-7-7m7 7V3"
            />
          </svg>
        )}
      </div>
    </div>
  );
}
