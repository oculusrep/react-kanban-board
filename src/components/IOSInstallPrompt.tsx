import { useState, useEffect } from 'react';

function isIOSDevice(): boolean {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return isIOS || isIPadOS;
}

function isInStandaloneMode(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in window.navigator && (window.navigator as any).standalone)
  );
}

export function IOSInstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const hasSeenPrompt = localStorage.getItem('ios-install-prompt-seen');

    if (isIOSDevice() && !isInStandaloneMode() && !hasSeenPrompt) {
      const timer = setTimeout(() => setShowPrompt(true), 30000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('ios-install-prompt-seen', 'true');
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-50 p-4">
      <div className="bg-white rounded-t-2xl p-6 max-w-md w-full animate-slide-up">
        <div className="text-center mb-4">
          <h3 className="text-xl font-bold text-[#002147] mb-2">
            Install OVIS
          </h3>
          <p className="text-[#4A6B94] text-sm mb-4">
            Install OVIS on your iPad for the best experience — fullscreen map, no browser UI
          </p>
        </div>

        <div className="space-y-3 mb-6">
          <div className="flex items-start gap-3 text-sm">
            <span className="font-bold text-[#002147]">1.</span>
            <p>Tap the <strong>Share</strong> button in Safari's toolbar</p>
          </div>
          <div className="flex items-start gap-3 text-sm">
            <span className="font-bold text-[#002147]">2.</span>
            <p>Scroll down and tap <strong>"Add to Home Screen"</strong></p>
          </div>
          <div className="flex items-start gap-3 text-sm">
            <span className="font-bold text-[#002147]">3.</span>
            <p>Tap <strong>"Add"</strong> in the top right</p>
          </div>
        </div>

        <button
          onClick={handleDismiss}
          className="w-full bg-[#002147] text-white py-3 rounded-lg font-medium hover:bg-[#4A6B94]"
        >
          Got it!
        </button>
      </div>
    </div>
  );
}
