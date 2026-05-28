import React, { useEffect, useRef } from 'react';

interface Props {
  isVisible: boolean;
  x: number;
  y: number;
  projectName: string;
  onClose: () => void;
  onVerifyLocation: () => void;
  onOpenDetails: () => void;
}

const BRAND = {
  midnight: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
};

const MunicipalProjectContextMenu: React.FC<Props> = ({
  isVisible,
  x,
  y,
  projectName,
  onClose,
  onVerifyLocation,
  onOpenDetails,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Click-outside / Escape closes.
  useEffect(() => {
    if (!isVisible) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // Defer attaching to next tick so the click that opened the menu doesn't immediately close it.
    const id = window.setTimeout(() => {
      window.addEventListener('mousedown', handleClick);
      window.addEventListener('keydown', handleEsc);
    }, 0);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('mousedown', handleClick);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isVisible, onClose]);

  if (!isVisible) return null;

  // Keep menu fully on-screen.
  const left = Math.min(x, window.innerWidth - 220);
  const top = Math.min(y, window.innerHeight - 120);

  return (
    <div
      ref={menuRef}
      className="fixed z-[10000] bg-white rounded-lg shadow-xl border min-w-[200px] py-1"
      style={{ left, top, borderColor: BRAND.slate }}
    >
      <div
        className="px-3 py-1.5 text-[10px] uppercase tracking-wide border-b truncate"
        style={{ color: BRAND.slate, borderColor: '#EAEEF3' }}
        title={projectName}
      >
        {projectName || '(unnamed project)'}
      </div>

      <button
        type="button"
        onClick={() => {
          onOpenDetails();
          onClose();
        }}
        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
        style={{ color: BRAND.midnight }}
      >
        <span>📋</span>
        <span>Open details</span>
      </button>

      <button
        type="button"
        onClick={() => {
          onVerifyLocation();
          onClose();
        }}
        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
        style={{ color: BRAND.steel }}
      >
        <span>🎯</span>
        <span>Verify pin location</span>
      </button>
    </div>
  );
};

export default MunicipalProjectContextMenu;
