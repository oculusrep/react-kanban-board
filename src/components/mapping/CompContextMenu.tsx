import React, { useEffect, useRef } from 'react';

interface Props {
  isVisible: boolean;
  x: number;
  y: number;
  compName: string;
  onClose: () => void;
  onVerifyLocation: () => void;
  onOpenDetails: () => void;
}

const BRAND = { midnight: '#002147', slate: '#8FA9C8' };

// Right-click menu for a Comp Database pin (mirrors MunicipalProjectContextMenu).
const CompContextMenu: React.FC<Props> = ({ isVisible, x, y, compName, onClose, onVerifyLocation, onOpenDetails }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isVisible) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
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
        title={compName}
      >
        {compName || '(unnamed comp)'}
      </div>

      <button
        type="button"
        onClick={() => { onOpenDetails(); onClose(); }}
        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
        style={{ color: BRAND.midnight }}
      >
        <span>📋</span>
        <span>Open Details</span>
      </button>

      <button
        type="button"
        onClick={() => { onVerifyLocation(); onClose(); }}
        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
        style={{ color: BRAND.midnight }}
      >
        <span>📍</span>
        <span>Verify Location</span>
      </button>
    </div>
  );
};

export default CompContextMenu;
