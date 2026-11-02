import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import type { DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';
import DescriptionLinks from './DescriptionLinks';
import { BRAND } from '../../lib/packageTracker';
import type { QueueTask } from '../../lib/taskQueue';

// One ordinary (non-package) task on the command center (/tasks/queue), plus the
// small pieces the package card shares. Palette is the deal board's: navy / steel /
// slate, terracotta for attention, no green. Only something actually done is
// filled dark (a checked box, a Tour-ready tag).

export type TagTone = 'quiet' | 'watch' | 'urgent' | 'unknown' | 'solid';
export interface CardTag { label: string; tone: TagTone }

const TAG_STYLE: Record<TagTone, CSSProperties> = {
  quiet:   { border: `1px solid ${BRAND.slate}`, color: BRAND.steel },
  watch:   { border: `1px solid ${BRAND.terracotta}`, color: BRAND.terracotta },
  urgent:  { border: `1px solid ${BRAND.terracotta}`, color: BRAND.terracotta, backgroundColor: '#F6EFE9', fontWeight: 600 },
  unknown: { border: `1px dashed ${BRAND.slate}`, color: BRAND.slate },
  solid:   { backgroundColor: BRAND.steel, color: '#FFFFFF', border: `1px solid ${BRAND.steel}` }, // achieved (Tour-ready)
};

const HANDOFF_HINT: Record<string, string> = {
  approve: 'Then: Mike approves',
  finish: 'Then: Mike finishes',
  none: '',
};

const stop = (fn: () => void) => (e: MouseEvent) => { e.stopPropagation(); fn(); };

export function Tag({ tag }: { tag: CardTag }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full px-2 py-px text-xs font-medium" style={TAG_STYLE[tag.tone]}>
      {tag.label}
    </span>
  );
}

export function UnreadDot({ on }: { on: boolean }) {
  if (!on) return null;
  return <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white" style={{ backgroundColor: BRAND.terracotta }} aria-label="Unread messages" />;
}

// Empty box; checking it completes the task. Shows checked only while the save is in flight
// (the row then leaves the queue).
export function CheckBox({ checked, disabled, onCheck, label }: { checked: boolean; disabled: boolean; onCheck: () => void; label: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} aria-label={`Done: ${label}`} title="Mark done"
            disabled={disabled} onClick={stop(onCheck)}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm disabled:cursor-wait"
            style={checked
              ? { backgroundColor: BRAND.navy, border: `1.5px solid ${BRAND.navy}` }
              : { backgroundColor: '#FFFFFF', border: `1.5px solid ${BRAND.slate}` }}>
      {checked && (
        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="#FFFFFF" strokeWidth="2.4" aria-hidden>
          <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

function IconButton({ title, onClick, disabled, children, attention }: {
  title: string; onClick: () => void; disabled?: boolean; children: ReactNode; attention?: boolean;
}) {
  return (
    <button type="button" title={title} aria-label={title} onClick={stop(onClick)} disabled={disabled}
            className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded hover:bg-slate-100 disabled:opacity-50"
            style={{ color: attention ? BRAND.terracotta : BRAND.steel }}>
      {children}
    </button>
  );
}

export function ChatButton({ unread, onClick }: { unread: boolean; onClick: () => void }) {
  return (
    <IconButton title={unread ? 'Chat — new message' : 'Chat'} onClick={onClick} attention={unread}>
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <path d="M3 5.5A2.5 2.5 0 0 1 5.5 3h9A2.5 2.5 0 0 1 17 5.5v6a2.5 2.5 0 0 1-2.5 2.5H9l-4 3v-3h0.5A2.5 2.5 0 0 1 3 11.5z" strokeLinejoin="round" />
      </svg>
      <UnreadDot on={unread} />
    </IconButton>
  );
}

// Start (icon) for an open task; an outlined "In progress" marker once started.
export function StartButton({ task, disabled, onStart }: { task: QueueTask; disabled: boolean; onStart: () => void }) {
  if (task.status === 'in_progress') {
    return (
      <span className="whitespace-nowrap rounded-full px-1.5 text-xs" title="In progress"
            style={{ border: `1px solid ${BRAND.slate}`, color: BRAND.steel }}>In progress</span>
    );
  }
  return (
    <IconButton title="Start" onClick={onStart} disabled={disabled}>
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <path d="M7 5l8 5-8 5z" strokeLinejoin="round" />
      </svg>
    </IconButton>
  );
}

export function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none"
         stroke={BRAND.slate} strokeWidth="1.8" aria-hidden>
      <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Grip({ handle, enabled, vertical }: { handle: DraggableProvidedDragHandleProps | null | undefined; enabled: boolean; vertical: boolean }) {
  const dots = (
    <svg viewBox="0 0 12 20" className="h-4 w-3" fill="currentColor" aria-hidden>
      {[3, 10, 17].map((y) => [3, 9].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" />))}
    </svg>
  );
  return (
    <div {...(handle ?? {})}
         onClick={(e) => e.stopPropagation()}
         className={vertical
           ? 'flex w-7 shrink-0 items-center justify-center self-stretch rounded-l-lg'
           : 'flex h-5 items-center justify-center rounded-t-lg'}
         style={{ color: enabled ? BRAND.slate : 'transparent', cursor: enabled ? 'grab' : 'default',
                  backgroundColor: enabled ? BRAND.page : 'transparent' }}
         title={enabled ? 'Drag to reorder' : undefined}
         aria-label={enabled ? 'Drag to reorder' : undefined}>
      {vertical ? dots : <span className="rotate-90">{dots}</span>}
    </div>
  );
}

export function OpenLink({ onOpen, label }: { onOpen: () => void; label: string }) {
  return (
    <button type="button" onClick={stop(onOpen)} className="text-xs hover:underline" style={{ color: BRAND.steel }}>
      {label} ↗
    </button>
  );
}

export interface QueueTaskCardProps {
  task: QueueTask;
  position: number;               // 1-based queue position
  siteName: string | null;
  city: string | null;
  ownerName: string;
  tag: CardTag | null;
  unread: boolean;
  busy: boolean;
  canReorder: boolean;
  dragHandle: DraggableProvidedDragHandleProps | null | undefined;
  variant: 'large' | 'compact';
  expanded: boolean;              // compact only
  onToggle: () => void;           // compact only
  onCheck: () => void;
  onStart: () => void;
  onOpen: (() => void) | null;    // open the site / deal sidebar
  onChat: () => void;
}

export function QueueTaskCard(p: QueueTaskCardProps) {
  const { task } = p;
  const border = task.status === 'in_progress' ? BRAND.navy : BRAND.slate;
  const actions = (
    <span className="flex shrink-0 items-center gap-0.5">
      <StartButton task={task} disabled={p.busy} onStart={p.onStart} />
      <ChatButton unread={p.unread} onClick={p.onChat} />
    </span>
  );
  const meta: ReactNode[] = [];
  if (p.siteName) meta.push(<span key="site">{p.siteName}</span>);
  if (p.city) meta.push(<span key="city">{p.city}</span>);
  meta.push(<span key="owner">{p.ownerName}</span>);
  const handoff = HANDOFF_HINT[task.slide?.handoff ?? 'none'];
  const details = (
    <>
      {handoff && <div className="text-xs" style={{ color: BRAND.steel }}>{handoff}</div>}
      <DescriptionLinks text={task.description} className="flex flex-wrap gap-x-3 text-xs" />
      {p.onOpen && <OpenLink onOpen={p.onOpen} label="Open site" />}
    </>
  );

  if (p.variant === 'large') {
    return (
      <div className="flex h-full flex-col rounded-lg bg-white shadow-sm" style={{ border: `1px solid ${border}` }}>
        <Grip handle={p.dragHandle} enabled={p.canReorder} vertical={false} />
        <div className="flex flex-1 flex-col gap-1.5 px-3 pb-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-3xl font-light leading-none" style={{ color: BRAND.slate }}>{p.position}</span>
            {p.tag && <Tag tag={p.tag} />}
          </div>
          <div className="flex items-start gap-2">
            <span className="pt-1"><CheckBox checked={p.busy} disabled={p.busy} onCheck={p.onCheck} label={task.subject} /></span>
            <div className="min-w-0 flex-1">
              <div className="line-clamp-2 text-base font-semibold" style={{ color: BRAND.navy }}>{task.subject}</div>
              <div className="flex flex-wrap gap-x-3 text-sm" style={{ color: BRAND.steel }}>{meta}</div>
            </div>
            {actions}
          </div>
          <div className="space-y-0.5 pl-6">{details}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-white" style={{ border: `1px solid ${border}` }}>
      <div className="flex cursor-pointer items-stretch" onClick={p.onToggle} aria-expanded={p.expanded}>
        <Grip handle={p.dragHandle} enabled={p.canReorder} vertical />
        <div className="flex min-w-0 flex-1 items-center gap-3 px-2.5 py-1.5">
          <span className="w-6 shrink-0 text-right text-sm" style={{ color: BRAND.slate }}>{p.position}</span>
          <CheckBox checked={p.busy} disabled={p.busy} onCheck={p.onCheck} label={task.subject} />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold" style={{ color: BRAND.navy }}>{task.subject}</span>
          {(p.siteName || p.city) && (
            <span className="hidden max-w-[16rem] truncate text-xs md:inline" style={{ color: BRAND.steel }}>
              {[p.siteName, p.city].filter(Boolean).join(' · ')}
            </span>
          )}
          {p.tag && <Tag tag={p.tag} />}
          {actions}
          <Chevron open={p.expanded} />
        </div>
      </div>
      {p.expanded && (
        <div className="space-y-0.5 pb-2 pl-[4.25rem] pr-3" onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-wrap gap-x-3 text-xs" style={{ color: BRAND.steel }}>{meta}</div>
          {details}
        </div>
      )}
    </div>
  );
}
