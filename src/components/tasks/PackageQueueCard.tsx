import type { DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';
import { BRAND, INPUT_LABEL, Pace, ProgressRow, paceStyle } from '../../lib/packageTracker';
import type { HeldSlide, QueueTask } from '../../lib/taskQueue';
import { CardTag, ChatButton, CheckBox, Chevron, Grip, OpenLink, StartButton, Tag } from './QueueTaskCard';

// One package (site / deal) on the command center: the owner's open slide tasks
// as a checklist in template order, plus that package's held slides greyed with
// the input they wait on. The card is what gets ranked; slides keep template order.
// "large" (Now) is always expanded; "compact" (Up next) is one row that expands inline.
// Chat is per package (package_comment): the card's icon opens the whole thread, a
// slide row's icon (held rows too) opens it filtered to that slide.
// A package whose slides for this owner are all held is still a card (greyed, still
// rankable, chat works) showing what it waits on. "Pause" parks the whole package.

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
  unread: Set<string>;             // this package's unread chat keys: slide ids, or GENERAL
  stopLabel: string | null;        // "D1·3" when a tour filter is on
  pausing: boolean;
  onPause: () => void;
  busyTaskId: string | null;
  canReorder: boolean;
  dragHandle: DraggableProvidedDragHandleProps | null | undefined;
  variant: 'large' | 'compact';
  expanded: boolean;               // compact only
  onToggle: () => void;            // compact only
  onOpen: (() => void) | null;
  onCheck: (t: QueueTask) => void;
  onStart: (t: QueueTask) => void;
  onChat: (slideId: string | null) => void;  // null = whole thread
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
    // Greyed (not the chat icon: held slides can carry chat too).
    return (
      <li className="flex items-center gap-2 rounded px-1.5 py-0.5">
        <span className="h-4 w-4 shrink-0 rounded-sm opacity-60" style={{ border: `1.5px dashed ${BRAND.slate}` }} aria-hidden />
        <span className={`min-w-0 flex-1 truncate opacity-60 ${large ? 'text-sm' : 'text-xs'}`} style={{ color: BRAND.slate }}>{row.slide.label}</span>
        <span className="whitespace-nowrap text-xs opacity-60" style={{ color: BRAND.slate }}>
          needs {row.slide.missing_inputs.map((k) => INPUT_LABEL[k]).join(', ')}
        </span>
        <ChatButton unread={unread} onClick={onChat} />
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
  const anyUnread = p.unread.size > 0;
  const border = p.tasks.some((t) => t.status === 'in_progress') ? BRAND.navy : BRAND.slate;
  const allHeld = p.tasks.length === 0;
  const waitingOn = [...new Set(p.held.flatMap((s) => s.missing_inputs))].map((k) => INPUT_LABEL[k]).join(' / ');
  const cardStyle = { border: `1px ${allHeld ? 'dashed' : 'solid'} ${border}`, backgroundColor: allHeld ? BRAND.page : '#FFFFFF' };
  const dim = allHeld ? 'opacity-60' : '';
  const nameColor = allHeld ? BRAND.steel : BRAND.navy;
  const stop = p.stopLabel ? (
    <span className="shrink-0 rounded px-1.5 text-xs font-semibold" style={{ border: `1px solid ${BRAND.steel}`, color: BRAND.steel }}
          title="Tour stop">{p.stopLabel}</span>
  ) : null;
  const pauseBtn = (
    <button type="button" disabled={p.pausing} onClick={(e) => { e.stopPropagation(); p.onPause(); }}
            className="text-xs underline disabled:opacity-50" style={{ color: BRAND.steel }}
            title="Hide this package's tasks from every queue and hold releases until it's resumed">
      {p.pausing ? 'Pausing…' : 'Pause'}
    </button>
  );
  const counts = allHeld
    ? <span style={{ color: BRAND.terracotta }}>Waiting on: {waitingOn}</span>
    : <span>{p.tasks.length} open{p.held.length ? ` · ${p.held.length} held` : ''}</span>;

  const checklist = (
    <ul className="space-y-px">
      {rows.map((r) => (
        <ChecklistRow
          key={r.kind === 'task' ? r.task.id : `held-${r.slide.id}`}
          row={r}
          first={r === firstActionable}
          large={large}
          unread={p.unread.has(r.kind === 'task' ? r.task.package_slide_id ?? '' : r.slide.id)}
          busy={r.kind === 'task' && p.busyTaskId === r.task.id}
          onCheck={() => r.kind === 'task' && p.onCheck(r.task)}
          onStart={() => r.kind === 'task' && p.onStart(r.task)}
          onChat={() => p.onChat(r.kind === 'task' ? r.task.package_slide_id : r.slide.id)}
        />
      ))}
    </ul>
  );
  const chat = <ChatButton unread={anyUnread} onClick={() => p.onChat(null)} label="Package chat" />;

  if (large) {
    return (
      <div className="flex h-full flex-col rounded-lg shadow-sm" style={cardStyle}>
        <Grip handle={p.dragHandle} enabled={p.canReorder} vertical={false} />
        <div className="flex flex-1 flex-col gap-1.5 px-3 pb-2.5">
          <div className="flex items-start justify-between gap-2">
            <span className="flex items-center gap-2">
              <span className="text-3xl font-light leading-none" style={{ color: BRAND.slate }}>{p.position}</span>
              {stop}
              {chat}
            </span>
            <span className={`flex flex-wrap justify-end gap-1 ${dim}`}>{p.tags.map((t) => <Tag key={t.label} tag={t} />)}</span>
          </div>
          <div className="min-w-0">
            <button type="button" disabled={!p.onOpen} onClick={() => p.onOpen?.()}
                    className="block min-w-0 max-w-full truncate text-left text-lg font-semibold enabled:hover:underline disabled:cursor-default"
                    style={{ color: nameColor }}>
              {p.name}
            </button>
            <div className="flex flex-wrap items-center gap-x-3 text-sm" style={{ color: BRAND.steel }}>
              {p.city && <span>{p.city}</span>}
              <span>{p.ownerName}</span>
              {counts}
              <span className="ml-auto">{pauseBtn}</span>
            </div>
          </div>
          <div className={dim}><ProgressBar progress={p.progress} pace={p.pace} wide /></div>
          <div className="pt-1" style={{ borderTop: `1px solid ${BRAND.page}` }}>{checklist}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg" style={cardStyle}>
      <div className="flex cursor-pointer items-stretch" onClick={p.onToggle} aria-expanded={p.expanded}>
        <Grip handle={p.dragHandle} enabled={p.canReorder} vertical />
        <div className="flex min-w-0 flex-1 items-center gap-3 px-2.5 py-1.5">
          <span className="w-6 shrink-0 text-right text-sm" style={{ color: BRAND.slate }}>{p.position}</span>
          {stop}
          <span className="min-w-0 max-w-[18rem] shrink truncate text-sm font-semibold" style={{ color: nameColor }}>{p.name}</span>
          {p.city && <span className="hidden shrink-0 text-xs md:inline" style={{ color: BRAND.steel }}>{p.city}</span>}
          <span className={`hidden sm:flex ${dim}`}><ProgressBar progress={p.progress} pace={p.pace} wide={false} /></span>
          <span className="min-w-0 flex-1 truncate text-xs" style={{ color: BRAND.steel }}>
            {firstActionable
              ? <>Next: <span style={{ color: BRAND.navy }}>{firstActionable.task.slide?.label ?? firstActionable.task.subject}</span></>
              : allHeld ? <span style={{ color: BRAND.terracotta }}>Waiting on: {waitingOn}</span> : null}
          </span>
          <span className={`hidden shrink-0 gap-1 lg:flex ${dim}`}>{p.tags.map((t) => <Tag key={t.label} tag={t} />)}</span>
          {chat}
          <Chevron open={p.expanded} />
        </div>
      </div>
      {p.expanded && (
        <div className="pb-2 pl-9 pr-2.5" onClick={(e) => e.stopPropagation()}>
          <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-1.5 text-xs" style={{ color: BRAND.steel }}>
            <span>{p.ownerName}</span>
            {counts}
            <span className="flex gap-1 lg:hidden">{p.tags.map((t) => <Tag key={t.label} tag={t} />)}</span>
            {p.onOpen && <OpenLink onOpen={p.onOpen} label="Open site" />}
            {pauseBtn}
          </div>
          {checklist}
        </div>
      )}
    </div>
  );
}
