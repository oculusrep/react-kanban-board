import { useRegisterSW } from 'virtual:pwa-register/react';

export function PWAUpdatePrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered: ' + r);
    },
    onRegisterError(error) {
      console.log('SW registration error', error);
    },
  });

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  if (!offlineReady && !needRefresh) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-[#002147] text-white p-4 rounded-lg shadow-lg z-50 max-w-sm">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          {offlineReady ? (
            <p className="text-sm">App ready to work offline</p>
          ) : (
            <p className="text-sm">New content available, click reload to update.</p>
          )}
        </div>
        <div className="flex gap-2">
          {needRefresh && (
            <button
              onClick={() => updateServiceWorker(true)}
              className="px-3 py-1 bg-white text-[#002147] rounded text-sm font-medium hover:bg-gray-100"
            >
              Reload
            </button>
          )}
          <button
            onClick={close}
            className="px-3 py-1 bg-[#4A6B94] text-white rounded text-sm font-medium hover:bg-[#8FA9C8]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
