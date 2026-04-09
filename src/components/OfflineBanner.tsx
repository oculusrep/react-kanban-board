import { useOnlineStatus } from '../hooks/useOnlineStatus';

export function OfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 bg-[#A27B5C] text-white px-4 py-2 text-center z-50"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}
    >
      <p className="text-sm font-medium">
        You're offline — some features may be limited
      </p>
    </div>
  );
}
