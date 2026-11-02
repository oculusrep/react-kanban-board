import type { CSSProperties, ReactNode } from 'react';
import type { DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';
import DescriptionLinks from './DescriptionLinks';
import { BRAND } from '../../lib/packageTracker';
import type { QueueTask } from '../../lib/taskQueue';

// One task on the command center (/tasks/queue). "large" in the Now lane,
// "compact" in Up next. Palette is the deal board's: navy / steel / slate,
// terracotta for attention. No green.

export type TagTone = 'quiet' | 'watch' | 'urgent' | 'unknown' | 'solid';
export interface CardTag { label: string; tone: TagTone }

const TAG_STYLE: Record<TagTone, CSSProperties> = {
  quiet:   { border: `1px solid ${BRAND.slate}`, color: BRAND.steel },
  watch:   { border: `1px solid ${BRAND.terracotta}`, color: BRAND.terracotta },
  urgent:  { backgroundColor: BRAND.terracotta, color: '#FFFFFF', border: `1px solid ${BRAND.terracotta}` },
  unknown: { border: `1px dashed ${BRAND.slate}`, color: BRAND.slate },
  solid:   { backgroundColor: BRAND.steel, color: '#FFFFFF', border: `1px solid ${BRAND.steel}` },
};

const HANDOFF_HINT: Record<string, string> = {
  approve: 'Then: Mike approves',
  finish: 'Then: Mike finishes',
  none: '',
};

export function Tag({ tag }: { tag: CardTag }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium" style={TAG_STYLE[tag.tone]}>
      {tag.label}
    </span>
  );
}

export function UnreadDot({ on }: { on: boolean }) {
  if (!on) return null;
  return <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white" style={{ backgroundColor: BRAND.terracotta }} aria-label="Unread messages" />;
}

export function ChatButton({ unread, onClick, large }: { unread: boolean; onClick: () => void; large?: boolean }) {
  return (
    <button type="button" onClick={onClick} title={unread ? 'Chat — new message' : 'Chat'}
            className={`relative inline-flex items-center gap-1.5 rounded ${large ? 'px-3 py-1.5 text-sm' : 'px-2.5 py-1 text-xs'}`}
            style={{ border: `1px solid ${unread ? BRAND.terracotta : BRAND.slate}`, color: unread ? BRAND.terracotta : BRAND.steel }}>
      <svg viewBox="0 0 20 20" className={large ? 'h-4 w-4' : 'h-3.5 w-3.5'} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <path d="M3 5.5A2.5 2.5 0 0 1 5.5 3h9A2.5 2.5 0 0 1 17 5.5v6a2.5 2.5 0 0 1-2.5 2.5H9l-4 3v-3h0.5A2.5 2.5 0 0 1 3 11.5z" strokeLinejoin="round" />
      </svg>
      Chat
      <UnreadDot on={unread} />
    </button>
  );
}

export function CheckOff({ disabled, onClick, large }: { disabled: boolean; onClick: () => void; large?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label="Check off"
            className={`inline-flex items-center gap-1.5 rounded font-medium text-white disabled:opacity-50 ${large ? 'px-3 py-1.5 text-sm' : 'px-2.5 py-1 text-xs'}`}
            style={{ backgroundColor: BRAND.navy }}>
      <svg viewBox="0 0 20 20" className={large ? 'h-4 w-4' : 'h-3.5 w-3.5'} fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
        <path d="M4.5 10.5l3.5 3.5 7.5-8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Done
    </button>
  );
}

export function StartOrState({ task, disabled, onStart, large }: { task: QueueTask; disabled: boolean; onStart: () => void; large?: boolean }) {
  if (task.status === 'in_progress') {
    return <span className={`font-medium ${large ? 'text-sm' : 'text-xs'}`} style={{ color: BRAND.navy }}>● In progress</span>;
  }
  return (
    <button type="button" onClick={onStart} disabled={disabled}
            className={`rounded disabled:opacity-50 ${large ? 'px-3 py-1.5 text-sm' : 'px-2.5 py-1 text-xs'}`}
            style={{ border: `1px solid ${BRAND.steel}`, color: BRAND.steel }}>
      Start
    </button>
  );
}

export function Grip({ handle, enabled, vertical }: { handle: DraggableProvidedDragHandleProps | null | undefined; enabled: boolean; vertical: boolean }) {
  const dots = (
    <svg viewBox="0 0 12 20" className="h-5 w-3" fill="currentColor" aria-hidden>
      {[3, 10, 17].map((y) => [3, 9].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" />))}
    </svg>
  );
  return (
    <div {...(handle ?? {})}
         className={vertical
           ? 'flex w-9 shrink-0 items-center justify-center self-stretch rounded-l-lg'
           : 'flex h-7 items-center justify-center rounded-t-lg'}
         style={{ color: enabled ? BRAND.slate : 'transparent', cursor: enabled ? 'grab' : 'default',
                  backgroundColor: enabled ? BRAND.page : 'transparent' }}
         aria-label={enabled ? 'Drag to reorder' : undefined}>
      {vertical ? dots : <span className="rotate-90">{dots}</span>}
    </div>
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
  onCheck: () => void;
  onStart: () => void;
  onOpen: (() => void) | null;    // open the site / deal sidebar
  onChat: () => void;
}

export function QueueTaskCard(p: QueueTaskCardProps) {
  const { task, variant } = p;
  const large = variant === 'large';
  // Package tasks: the site is the headline and the slide the work. Others: the subject is the work.
  const work = task.slide?.label ?? task.subject;
  const where = p.siteName ?? (task.slide ? task.subject.split(' — ').slice(1).join(' — ') || null : null);
  const meta: ReactNode[] = [];
  if (p.city) meta.push(<span key="city">{p.city}</span>);
  meta.push(<span key="owner">{p.ownerName}</span>);
  if (task.slide && HANDOFF_HINT[task.slide.handoff]) meta.push(<span key="handoff">{HANDOFF_HINT[task.slide.handoff]}</span>);

  const Headline = (
    <button type="button" disabled={!p.onOpen} onClick={() => p.onOpen?.()}
            className="block min-w-0 max-w-full text-left enabled:hover:underline disabled:cursor-default">
      {where && (
        <div className={`truncate font-semibold ${large ? 'text-lg' : 'text-sm'}`} style={{ color: BRAND.navy }}>{where}</div>
      )}
      <div className={`${where ? '' : 'font-semibold'} ${large ? 'text-base' : 'text-sm'} ${large ? 'line-clamp-2' : 'truncate'}`}
           style={{ color: where ? BRAND.steel : BRAND.navy }}>
        {work}
      </div>
    </button>
  );

  if (large) {
    return (
      <div className="flex h-full flex-col rounded-lg bg-white shadow-sm"
           style={{ border: `1px solid ${task.status === 'in_progress' ? BRAND.navy : BRAND.slate}` }}>
        <Grip handle={p.dragHandle} enabled={p.canReorder} vertical={false} />
        <div className="flex flex-1 flex-col gap-3 px-4 pb-4 pt-1">
          <div className="flex items-start justify-between gap-2">
            <span className="text-3xl font-light leading-none" style={{ color: BRAND.slate }}>{p.position}</span>
            {p.tag && <Tag tag={p.tag} />}
          </div>
          <div className="min-w-0 flex-1">
            {Headline}
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-sm" style={{ color: BRAND.steel }}>{meta}</div>
            <DescriptionLinks text={task.description} className="mt-1 flex flex-wrap gap-x-3 text-sm" />
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1" style={{ borderTop: `1px solid ${BRAND.page}` }}>
            <CheckOff disabled={p.busy} onClick={p.onCheck} large />
            <StartOrState task={task} disabled={p.busy} onStart={p.onStart} large />
            <span className="flex-1" />
            <ChatButton unread={p.unread} onClick={p.onChat} large />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-stretch rounded-lg bg-white"
         style={{ border: `1px solid ${task.status === 'in_progress' ? BRAND.navy : BRAND.slate}` }}>
      <Grip handle={p.dragHandle} enabled={p.canReorder} vertical />
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5">
        <span className="w-6 shrink-0 text-right text-sm" style={{ color: BRAND.slate }}>{p.position}</span>
        <div className="min-w-0 flex-1 basis-56">
          {Headline}
          <div className="flex flex-wrap gap-x-3 text-xs" style={{ color: BRAND.steel }}>{meta}</div>
          <DescriptionLinks text={task.description} className="flex flex-wrap gap-x-3 text-xs" />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {p.tag && <Tag tag={p.tag} />}
          <StartOrState task={task} disabled={p.busy} onStart={p.onStart} />
          <CheckOff disabled={p.busy} onClick={p.onCheck} />
          <ChatButton unread={p.unread} onClick={p.onChat} />
        </div>
      </div>
    </div>
  );
}
