import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';

// Task descriptions are plain text, so URLs in them (e.g. the listing / comp-record
// links the NNN intake writes on VA tasks) are listed as clickable links. OVIS URLs
// open in-app; anything else opens in a new tab. The label is the text that precedes
// the URL on its line ("Comp record:" → "Comp record"). Used by the task slideout and
// the Tasks queue.
const URL_RE = /https?:\/\/[^\s)]+/g;
const OVIS_HOSTS = new Set(['ovis.oculusrep.com']);
const STEEL = '#4A6B94';

export function extractDescriptionLinks(text: string | null | undefined): { url: string; label: string }[] {
  const out: { url: string; label: string }[] = [];
  for (const line of (text ?? '').split('\n')) {
    for (const m of line.matchAll(URL_RE)) {
      const label = line.slice(0, m.index).replace(/^[\s\-•*\[\]x]*/i, '').replace(/[:\s]+$/, '').trim();
      out.push({ url: m[0], label: label || m[0] });
    }
  }
  return out;
}

const DescriptionLinks: React.FC<{ text: string | null | undefined; className?: string }> = ({ text, className }) => {
  const links = useMemo(() => extractDescriptionLinks(text), [text]);
  if (!links.length) return null;
  return (
    <div className={className ?? 'mt-1 flex flex-col gap-0.5'}>
      {links.map(({ url, label }, i) => {
        let internal: string | null = null;
        try {
          const u = new URL(url);
          if (OVIS_HOSTS.has(u.host) || u.host === window.location.host) internal = u.pathname + u.search + u.hash;
        } catch { /* not a URL */ }
        const cls = 'text-xs underline truncate';
        const stop = (e: React.MouseEvent) => e.stopPropagation(); // don't trigger a row's own click
        return internal ? (
          <Link key={i} to={internal} onClick={stop} className={cls} style={{ color: STEEL }}>{label} ↗</Link>
        ) : (
          <a key={i} href={url} target="_blank" rel="noreferrer" onClick={stop} className={cls} style={{ color: STEEL }}>{label} ↗</a>
        );
      })}
    </div>
  );
};

export default DescriptionLinks;
