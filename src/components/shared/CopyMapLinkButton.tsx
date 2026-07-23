import { useState, useCallback } from 'react';
import { Link2, Check } from 'lucide-react';

interface CopyMapLinkButtonProps {
  /**
   * Relative path (including query string) of the internal map link to copy,
   * e.g. "/mapping?site-submit=<id>". If null/undefined the button renders
   * disabled (used when a deal has no linked property or site submit).
   */
  path?: string | null;
  /** Optional visible label. Omit for an icon-only button. */
  label?: string;
  /** Tooltip / aria-label when the link is available. */
  title?: string;
  /** Tooltip / aria-label when there is no linkable location. */
  disabledTitle?: string;
  /** Base button classes. */
  className?: string;
  /** Classes applied while showing the "copied" confirmation (defaults to className). */
  copiedClassName?: string;
  /** Icon pixel size. */
  iconSize?: number;
  /** Optional callback after a successful copy (e.g. to fire a toast). */
  onCopied?: (url: string) => void;
}

/**
 * Copies a shareable link to the current object's location on the internal map.
 * A logged-in teammate who opens the link lands on /mapping centered on the
 * object with its detail sidebar open. Shows a check + "Copied!" for 2s.
 */
export function CopyMapLinkButton({
  path,
  label,
  title = 'Copy map link',
  disabledTitle = 'No map location available for this record',
  className,
  copiedClassName,
  iconSize = 16,
  onCopied,
}: CopyMapLinkButtonProps) {
  const [copied, setCopied] = useState(false);
  const disabled = !path;

  const handleCopy = useCallback(async () => {
    if (!path) return;
    const url = `${window.location.origin}${path}`;

    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback for older browsers / non-secure contexts where the
      // async Clipboard API is unavailable.
      const textarea = document.createElement('textarea');
      textarea.value = url;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
      } catch {
        /* no-op */
      }
      document.body.removeChild(textarea);
    }

    setCopied(true);
    onCopied?.(url);
    setTimeout(() => setCopied(false), 2000);
  }, [path, onCopied]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={disabled}
      title={disabled ? disabledTitle : title}
      aria-label={disabled ? disabledTitle : title}
      className={`${copied && copiedClassName ? copiedClassName : className ?? ''} ${
        disabled ? 'opacity-40 cursor-not-allowed' : ''
      }`}
    >
      {copied ? <Check size={iconSize} /> : <Link2 size={iconSize} />}
      {label && <span>{copied ? 'Copied!' : label}</span>}
    </button>
  );
}

export default CopyMapLinkButton;
