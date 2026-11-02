import type { DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';
import { BRAND, INPUT_LABEL, Pace, ProgressRow, paceStyle } from '../../lib/packageTracker';
import type { HeldSlide, QueueTask } from '../../lib/taskQueue';
import { CardTag, ChatButton, CheckBox, Chevron, Grip, OpenLink, StartButton, Tag, UnreadDot } from './QueueTaskCard';

// One package (site / deal) on the command center: the owner's open slide tasks
// as a checklist in template order, plus that package's held slides greyed with
// the input they wait on. The card is what gets ranked; slides keep template order.
// "large" (Now) is always expanded; "compact" (Up next) is one row that expands inline.

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
  expanded: boolean;               // compact only
  onToggle: () => void;            // compact only
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
    <div className={`flex items-center gap-2 ${wide ? '' : 'shrink-0'}`}>
      <div className={`${wide ? 'flex-1' : 'w-20'} h-1.5 overflow-hidden rounded-sm`} style={{ backgroundColor: BRAND.page, ...style.track }}>
        <div className="h-full" style={{ width: `${pct}%`, backgroundColor: style.fill }} />
      </div>
      <span className="whitespace-nowrap text-xs tabular-nums" style={{ color: BRAND.steel }}>
        {progress.done}/{progress.applicable}{wide ? ' done' : ''}
      </span>
    </div>
  );
}

function ChecklistRow({ row, first, large, unread, busy, onCheck, onStart, onChat }: {
  row: Row; first: boolean; large: boolean; unread: boolean; busy: boolean;
  onCheck: () => void; onStart: () => void; onChat: () => void;
}) {
  if (row.kind === 'held') {
    return (
      <li className="flex items-center gap-2 rounded px-1.5 py-0.5" style={{ opacity: 0.6 }}>
        <span className="h-4 w-4 shrink-0 rounded-sm" style={{ border: `1.5px dashed ${BRAND.slate}` }} aria-hidden />
        <span className={`min-w-0 flex-1 truncate ${large ? 'text-sm' : 'text-xs'}`} style={{ color: BRAND.slate }}>{row.slide.label}</span>
        <span className="whitespace-nowrap text-xs" style={{ color: BRAND.slate }}>
          needs {row.slide.missing_inputs.map((k) => INPUT_LABEL[k]).join(', ')}
        </span>
      </li>
    );
  }
  const t = row.task;
  const label = t.slide?.label ?? t.subject;
  return (
    <li className="flex items-center gap-2 rounded px-1.5 py-0.5"
        style={first ? { backgroundColor: BRAND.page, boxShadow: `inset 3px 0 0 ${BRAND.navy}` } : undefined}>
      <CheckBox checked={busy} disabled={busy} onCheck={onCheck} label={label} />
      <span className={`min-w-0 flex-1 truncate ${large ? 'text-sm' : 'text-xs'} ${first ? 'font-semibold' : ''}`}
            style={{ color: BRAND.navy }} title={t.subject}>
        {label}
      </span>
      <StartButton task={t} disabled={busy} onStart={onStart} />
      <ChatButton unread={unread} onClick={onChat} />
    </li>
  );
}

export function PackageQueueCard(p: PackageQueueCardProps) {
  const large = p.variant === 'large';
  const rows: Row[] = [
    ...p.tasks.map((task): Row => ({ kind: 'task', position: task.slide?.position ?? 0, task })),
    ...p.held.map((slide): Row => ({ kind: 'held', position: slide.position, slide })),
  ].sort((a, b) => a.position - b.position);
  const firstActionable = rows.find((r): r is Extract<Row, { kind: 'task' }> => r.kind === 'task');
  const anyUnread = p.tasks.some((t) => p.unread.has(t.id));
  const border = p.tasks.some((t) => t.status === 'in_progress') ? BRAND.navy : BRAND.slate;

  const checklist = (
    <ul className="space-y-px">
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
    <span className="relative inline-block h-2.5 w-2.5 shrink-0" title="New chat message on a slide"><UnreadDot on /></span>
  );

  if (large) {
    return (
      <div className="flex h-full flex-col rounded-lg bg-white shadow-sm" style={{ border: `1px solid ${border}` }}>
        <Grip handle={p.dragHandle} enabled={p.canReorder} vertical={false} />
        <div className="flex flex-1 flex-col gap-1.5 px-3 pb-2.5">
          <div className="flex items-start justify-between gap-2">
            <span className="flex items-center gap-2">
              <span className="text-3xl font-light leading-none" style={{ color: BRAND.slate }}>{p.position}</span>
              {dot}
            </span>
            <span className="flex flex-wrap justify-end gap-1">{p.tags.map((t) => <Tag key={t.label} tag={t} />)}</span>
          </div>
          <div className="min-w-0">
            <button type="button" disabled={!p.onOpen} onClick={() => p.onOpen?.()}
                    className="block min-w-0 max-w-full truncate text-left text-lg font-semibold enabled:hover:underline disabled:cursor-default"
                    style={{ color: BRAND.navy }}>
              {p.name}
            </button>
            <div className="flex flex-wrap gap-x-3 text-sm" style={{ color: BRAND.steel }}>
              {p.city && <span>{p.city}</span>}
              <span>{p.ownerName}</span>
              <span>{p.tasks.length} open{p.held.length ? ` · ${p.held.length} held` : ''}</span>
            </div>
          </div>
          <ProgressBar progress={p.progress} pace={p.pace} wide />
          <div className="pt-1" style={{ borderTop: `1px solid ${BRAND.page}` }}>{checklist}</div>
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
          <span className="min-w-0 max-w-[18rem] shrink truncate text-sm font-semibold" style={{ color: BRAND.navy }}>{p.name}</span>
          {p.city && <span className="hidden shrink-0 text-xs md:inline" style={{ color: BRAND.steel }}>{p.city}</span>}
          <span className="hidden sm:flex"><ProgressBar progress={p.progress} pace={p.pace} wide={false} /></span>
          <span className="min-w-0 flex-1 truncate text-xs" style={{ color: BRAND.steel }}>
            {firstActionable ? <>Next: <span style={{ color: BRAND.navy }}>{firstActionable.task.slide?.label ?? firstActionable.task.subject}</span></> : null}
          </span>
          <span className="hidden shrink-0 gap-1 lg:flex">{p.tags.map((t) => <Tag key={t.label} tag={t} />)}</span>
          {dot}
          <Chevron open={p.expanded} />
        </div>
      </div>
      {p.expanded && (
        <div className="pb-2 pl-9 pr-2.5" onClick={(e) => e.stopPropagation()}>
          <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-1.5 text-xs" style={{ color: BRAND.steel }}>
            <span>{p.ownerName}</span>
            <span>{p.tasks.length} open{p.held.length ? ` · ${p.held.length} held` : ''}</span>
            <span className="flex gap-1 lg:hidden">{p.tags.map((t) => <Tag key={t.label} tag={t} />)}</span>
            {p.onOpen && <OpenLink onOpen={p.onOpen} label="Open site" />}
          </div>
          {checklist}
        </div>
      )}
    </div>
  );
}
