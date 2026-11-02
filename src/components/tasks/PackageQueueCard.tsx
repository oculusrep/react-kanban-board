import type { DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';
import { BRAND, INPUT_LABEL, Pace, ProgressRow, paceStyle } from '../../lib/packageTracker';
import type { HeldSlide, QueueTask } from '../../lib/taskQueue';
import { CardTag, ChatButton, CheckOff, Grip, StartOrState, Tag, UnreadDot } from './QueueTaskCard';

// One package (site / deal) on the command center: the owner's open slide tasks
// as a checklist in template order, plus that package's held slides greyed with
// the input they wait on. The card is what gets ranked; slides keep template order.

type Row = { kind: 'task'; position: number; task: QueueTask } | { kind: 'held'; position: number; slide: HeldSlide };

export interface PackageQueueCardProps {
  position: number;                // 1-based card position in the queue
  name: string;
  city: string | null;
  ownerName: string;
  tasks: QueueTask[];              // this owner's open slide tasks for the package
  held: HeldSlide[];               // this owner's held slides for the package
  progress: ProgressRow | null;
  pace: Pace | null;
  tags: CardTag[];
  unread: Set<string>;             // task ids with unread chat
  busyTaskId: string | null;
  canReorder: boolean;
  dragHandle: DraggableProvidedDragHandleProps | null | undefined;
  variant: 'large' | 'compact';
  onOpen: (() => void) | null;
  onCheck: (t: QueueTask) => void;
  onStart: (t: QueueTask) => void;
  onChat: (t: QueueTask) => void;
}

function ProgressBar({ progress, pace, wide }: { progress: ProgressRow | null; pace: Pace | null; wide: boolean }) {
  if (!progress) return null;
  const pct = progress.applicable > 0 ? Math.round((progress.done / progress.applicable) * 100) : 0;
  const style = paceStyle(pace ?? 'on_pace');
  return (
    <div className="flex items-center gap-2">
      <div className={`${wide ? 'flex-1' : 'w-24'} h-2 overflow-hidden rounded-sm`} style={{ backgroundColor: BRAND.page, ...style.track }}>
        <div className="h-full" style={{ width: `${pct}%`, backgroundColor: style.fill }} />
      </div>
      <span className="whitespace-nowrap text-xs" style={{ color: BRAND.steel }}>{progress.done} of {progress.applicable} done</span>
    </div>
  );
}

function ChecklistRow({ row, first, large, unread, busy, onCheck, onStart, onChat }: {
  row: Row; first: boolean; large: boolean; unread: boolean; busy: boolean;
  onCheck: () => void; onStart: () => void; onChat: () => void;
}) {
  if (row.kind === 'held') {
    return (
      <li className="flex items-center gap-2 rounded px-2 py-1.5" style={{ opacity: 0.6 }}>
        <span className="h-3.5 w-3.5 shrink-0 rounded-sm" style={{ border: `1px dashed ${BRAND.slate}` }} aria-hidden />
        <span className={`min-w-0 flex-1 truncate ${large ? 'text-sm' : 'text-xs'}`} style={{ color: BRAND.slate }}>{row.slide.label}</span>
        <span className="whitespace-nowrap text-xs" style={{ color: BRAND.slate }}>
          needs {row.slide.missing_inputs.map((k) => INPUT_LABEL[k]).join(', ')}
        </span>
      </li>
    );
  }
  const t = row.task;
  return (
    <li className="flex flex-wrap items-center gap-2 rounded px-2 py-1.5"
        style={first
          ? { backgroundColor: BRAND.page, boxShadow: `inset 3px 0 0 ${BRAND.navy}` }
          : undefined}>
      <span className={`min-w-0 flex-1 truncate ${large ? 'text-sm' : 'text-xs'} ${first ? 'font-semibold' : ''}`}
            style={{ color: BRAND.navy }} title={t.subject}>
        {t.slide?.label ?? t.subject}
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        <StartOrState task={t} disabled={busy} onStart={onStart} />
        <CheckOff disabled={busy} onClick={onCheck} />
        <ChatButton unread={unread} onClick={onChat} />
      </span>
    </li>
  );
}

export function PackageQueueCard(p: PackageQueueCardProps) {
  const large = p.variant === 'large';
  const rows: Row[] = [
    ...p.tasks.map((task): Row => ({ kind: 'task', position: task.slide?.position ?? 0, task })),
    ...p.held.map((slide): Row => ({ kind: 'held', position: slide.position, slide })),
  ].sort((a, b) => a.position - b.position);
  const firstActionable = rows.find((r) => r.kind === 'task');
  const anyUnread = p.tasks.some((t) => p.unread.has(t.id));
  const border = p.tasks.some((t) => t.status === 'in_progress') ? BRAND.navy : BRAND.slate;

  const headline = (
    <button type="button" disabled={!p.onOpen} onClick={() => p.onOpen?.()}
            className="block min-w-0 max-w-full text-left enabled:hover:underline disabled:cursor-default">
      <div className={`truncate font-semibold ${large ? 'text-lg' : 'text-sm'}`} style={{ color: BRAND.navy }}>{p.name}</div>
    </button>
  );
  const meta = (
    <div className={`flex flex-wrap gap-x-3 ${large ? 'text-sm' : 'text-xs'}`} style={{ color: BRAND.steel }}>
      {p.city && <span>{p.city}</span>}
      <span>{p.ownerName}</span>
      <span>{p.tasks.length} open{p.held.length ? ` · ${p.held.length} held` : ''}</span>
    </div>
  );
  const checklist = (
    <ul className="space-y-0.5">
      {rows.map((r) => (
        <ChecklistRow
          key={r.kind === 'task' ? r.task.id : `held-${r.slide.id}`}
          row={r}
          first={r === firstActionable}
          large={large}
          unread={r.kind === 'task' && p.unread.has(r.task.id)}
          busy={r.kind === 'task' && p.busyTaskId === r.task.id}
          onCheck={() => r.kind === 'task' && p.onCheck(r.task)}
          onStart={() => r.kind === 'task' && p.onStart(r.task)}
          onChat={() => r.kind === 'task' && p.onChat(r.task)}
        />
      ))}
    </ul>
  );
  const dot = anyUnread && (
    <span className="relative inline-block h-2.5 w-2.5" title="New chat message on a slide"><UnreadDot on /></span>
  );

  if (large) {
    return (
      <div className="flex h-full flex-col rounded-lg bg-white shadow-sm" style={{ border: `1px solid ${border}` }}>
        <Grip handle={p.dragHandle} enabled={p.canReorder} vertical={false} />
        <div className="flex flex-1 flex-col gap-3 px-4 pb-4 pt-1">
          <div className="flex items-start justify-between gap-2">
            <span className="flex items-center gap-2">
              <span className="text-3xl font-light leading-none" style={{ color: BRAND.slate }}>{p.position}</span>
              {dot}
            </span>
            <span className="flex flex-wrap justify-end gap-1">{p.tags.map((t) => <Tag key={t.label} tag={t} />)}</span>
          </div>
          <div className="min-w-0">
            {headline}
            {meta}
          </div>
          <ProgressBar progress={p.progress} pace={p.pace} wide />
          <div className="pt-1" style={{ borderTop: `1px solid ${BRAND.page}` }}>{checklist}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-stretch rounded-lg bg-white" style={{ border: `1px solid ${border}` }}>
      <Grip handle={p.dragHandle} enabled={p.canReorder} vertical />
      <div className="min-w-0 flex-1 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="w-6 shrink-0 text-right text-sm" style={{ color: BRAND.slate }}>{p.position}</span>
          <div className="min-w-0 flex-1 basis-48">
            <div className="flex items-center gap-2">{headline}{dot}</div>
            {meta}
          </div>
          <ProgressBar progress={p.progress} pace={p.pace} wide={false} />
          <span className="flex flex-wrap gap-1">{p.tags.map((t) => <Tag key={t.label} tag={t} />)}</span>
        </div>
        <div className="mt-1.5 sm:pl-10">{checklist}</div>
      </div>
    </div>
  );
}
