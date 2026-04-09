import { useNavigate, useLocation } from 'react-router-dom';
import { useStandaloneMode } from '../hooks/useStandaloneMode';

export function PWABackButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const isStandalone = useStandaloneMode();

  // Only show in standalone mode and not on the home/map page
  if (!isStandalone || location.pathname === '/' || location.pathname === '/master-pipeline' || location.pathname === '/mapping') return null;

  return (
    <button
      onClick={() => navigate(-1)}
      className="fixed top-[calc(env(safe-area-inset-top)+8px)] left-[calc(env(safe-area-inset-left)+8px)] z-50 bg-white/90 backdrop-blur-sm rounded-full p-2 shadow-md"
      aria-label="Go back"
    >
      <svg className="w-6 h-6 text-[#002147]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  );
}
