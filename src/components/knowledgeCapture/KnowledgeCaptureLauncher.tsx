import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ObjectPicker } from './ObjectPicker';
import ContactFormModal from '../ContactFormModal';
import InlinePropertyCreationModal from '../mapping/InlinePropertyCreationModal';
import {
  type FiledEntry,
  type KnowledgeLink,
  type ObjectType,
  type Proposal,
  type UnresolvedName,
  useKnowledgeCapture,
} from './useKnowledgeCapture';

// Intel (internally "knowledge capture" — table, function and file names use that
// prefix): a floating button on every internal page that opens a panel
// for capturing ad hoc facts — "the Starbucks work letter says drywall on the
// Bridge prototype runs $18/sf". The AI proposes which OVIS records and topics it
// belongs to, the user confirms or corrects in conversation, and it is filed
// permanently for the whole company.
//
// NOT Quick Notes. That is a personal 7-day sticky list with no AI and no tags;
// this is shared, permanent, linked company knowledge. The two are deliberately
// different colours and icons (navy "+" vs steel lightbulb) so they aren't
// confused, and they sit at different spots in the corner.
//
// Keyboard: Alt+K (Option+K on Mac). Docs: docs/KNOWLEDGE_CAPTURE.md

const COLORS = {
  midnight: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
  white: '#FFFFFF',
  bg: '#F8FAFC',
  terracotta: '#A27B5C',
} as const;

// Same band as Quick Notes (above map slideouts at 10001+, below the ~10010 modal
// tier), one step up so the two panels don't fight. See docs/OVERLAY_STACKING.md.
const Z_FAB = 10006;
const Z_PANEL = 10008;

// Stacked directly above Quick Notes' default corner (which is bottom-6 right-6,
// 48px tall) so neither button covers the other out of the box.
const FAB_SIZE = 48;
const FAB_BOTTOM = 24 + FAB_SIZE + 12;
const FAB_RIGHT = 24;

const PANEL_WIDTH = 460;

// The create overlays default to the map band (z 60 / 10001), i.e. BELOW this
// panel, so they're pushed above it explicitly.
const Z_CREATE_MODAL = Z_PANEL + 1;

/** Only these two have a create flow reachable from here. See UnresolvedRow. */
const CREATABLE: ObjectType[] = ['contact', 'property'];

/** "Nick Lukens" -> first/last for the contact form, which requires both. */
export function splitPersonName(name: string): { first_name: string; last_name: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { first_name: parts[0], last_name: '' };
  return { first_name: parts.slice(0, -1).join(' '), last_name: parts[parts.length - 1] };
}

/** ovis_role values that is_internal_user() accepts. Coach and portal users are excluded. */
const INTERNAL_ROLES = ['admin', 'broker_full', 'broker_lite', 'va'];

const TYPE_LABEL: Record<ObjectType, string> = {
  account: 'Account',
  deal: 'Deal',
  property: 'Property',
  contact: 'Contact',
};

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------
const Chip: React.FC<{ label: string; badge?: string; onRemove: () => void; title?: string }> = ({
  label,
  badge,
  onRemove,
  title,
}) => (
  <span
    className="inline-flex max-w-full items-center gap-1 rounded-full py-0.5 pl-1.5 pr-1 text-[11px]"
    style={{ backgroundColor: COLORS.white, border: `1px solid ${COLORS.slate}`, color: COLORS.midnight }}
    title={title ?? label}
  >
    {badge && (
      <span className="flex-shrink-0 text-[9px] font-semibold uppercase tracking-wide" style={{ color: COLORS.steel }}>
        {badge}
      </span>
    )}
    <span className="min-w-0 truncate">{label}</span>
    <button
      type="button"
      onClick={onRemove}
      className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full hover:bg-slate-100"
      aria-label={`Remove ${label}`}
    >
      <svg className="h-2.5 w-2.5" fill="none" stroke={COLORS.steel} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  </span>
);

const SmallButton: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className="rounded-full px-2 py-0.5 text-[11px] hover:bg-white"
    style={{ border: `1px dashed ${COLORS.slate}`, color: COLORS.steel }}
  >
    {children}
  </button>
);

const ProposalEditor: React.FC<{
  proposal: Proposal;
  rawText: string;
  unresolved: UnresolvedName[];
  onEditCleanText: (t: string) => void;
  onAddLink: (l: KnowledgeLink) => void;
  onRemoveLink: (t: ObjectType, id: string) => void;
  onCreateUnresolved: (item: UnresolvedName) => void;
  onDismissUnresolved: (name: string) => void;
  onAddTag: (t: string) => void;
  onRemoveTag: (t: string) => void;
}> = ({
  proposal,
  rawText,
  unresolved,
  onEditCleanText,
  onAddLink,
  onRemoveLink,
  onCreateUnresolved,
  onDismissUnresolved,
  onAddTag,
  onRemoveTag,
}) => {
  const [picking, setPicking] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const [showRaw, setShowRaw] = useState(false);

  return (
    <section className="rounded-md p-2.5" style={{ backgroundColor: COLORS.bg, border: `1px solid ${COLORS.slate}` }}>
      <label className="block text-[10px] font-semibold uppercase tracking-wide" style={{ color: COLORS.steel }}>
        The fact
      </label>
      <textarea
        value={proposal.clean_text}
        onChange={(e) => onEditCleanText(e.target.value)}
        rows={3}
        className="mt-1 w-full resize-y rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1"
        style={{ border: `1px solid ${COLORS.slate}`, color: COLORS.midnight, backgroundColor: COLORS.white }}
      />

      {/* raw_text is never editable — it's the record of what was actually said. */}
      <button
        type="button"
        onClick={() => setShowRaw((s) => !s)}
        className="mt-1 text-[10px] underline"
        style={{ color: COLORS.slate }}
      >
        {showRaw ? 'Hide what I typed' : 'Show what I typed'}
      </button>
      {showRaw && (
        <p className="mt-1 whitespace-pre-wrap rounded px-2 py-1 text-[11px] italic"
          style={{ color: COLORS.steel, backgroundColor: COLORS.white, border: `1px solid ${COLORS.slate}` }}>
          {rawText}
        </p>
      )}

      <div className="mt-2.5">
        <div className="flex items-baseline justify-between">
          <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: COLORS.steel }}>
            Linked to
          </label>
          {proposal.is_general && proposal.links.length === 0 && (
            <span className="text-[10px]" style={{ color: COLORS.steel }}>general knowledge</span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {proposal.links.map((link) => (
            <Chip
              key={`${link.object_type}:${link.object_id}`}
              badge={TYPE_LABEL[link.object_type]}
              label={link.object_name}
              onRemove={() => onRemoveLink(link.object_type, link.object_id)}
            />
          ))}
          {!picking && <SmallButton onClick={() => setPicking(true)}>+ link</SmallButton>}
        </div>
        {picking && <ObjectPicker onPick={onAddLink} onClose={() => setPicking(false)} />}
      </div>

      {unresolved.length > 0 && (
        <ul className="mt-2 space-y-1">
          {unresolved.map((item) => (
            <UnresolvedRow
              key={`${item.object_type}:${item.name}`}
              item={item}
              onCreate={onCreateUnresolved}
              onDismiss={onDismissUnresolved}
            />
          ))}
        </ul>
      )}

      <div className="mt-2.5">
        <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: COLORS.steel }}>
          Tags
        </label>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {proposal.tags.map((tag) => (
            <Chip key={tag} label={tag} onRemove={() => onRemoveTag(tag)} />
          ))}
          <input
            type="text"
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onAddTag(tagDraft);
                setTagDraft('');
              }
            }}
            placeholder="+ tag"
            className="w-20 rounded-full px-2 py-0.5 text-[11px] focus:outline-none focus:ring-1"
            style={{ border: `1px dashed ${COLORS.slate}`, color: COLORS.midnight }}
          />
        </div>
      </div>
    </section>
  );
};

/**
 * A name the AI found in the note but not in OVIS. Contacts and properties get a
 * create button; accounts and deals don't have a create flow that works from here
 * (both need more than a name — see docs/KNOWLEDGE_CAPTURE.md), so they're shown
 * so the user knows nothing was linked.
 */
const UnresolvedRow: React.FC<{
  item: UnresolvedName;
  onCreate: (item: UnresolvedName) => void;
  onDismiss: (name: string) => void;
}> = ({ item, onCreate, onDismiss }) => (
  <li
    className="flex flex-wrap items-center gap-1.5 rounded px-2 py-1.5 text-[11px]"
    style={{ backgroundColor: COLORS.white, border: `1px dashed ${COLORS.terracotta}` }}
  >
    <span style={{ color: COLORS.midnight }}>
      Not in OVIS: <strong>{item.name}</strong>
    </span>
    {CREATABLE.includes(item.object_type) ? (
      <button
        type="button"
        onClick={() => onCreate(item)}
        className="rounded-full px-2 py-0.5 text-[11px] font-medium"
        style={{ backgroundColor: COLORS.steel, color: COLORS.white }}
      >
        Create {item.object_type}: {item.name}
      </button>
    ) : (
      <span style={{ color: COLORS.steel }}>
        (create the {item.object_type} in OVIS first, then add the link)
      </span>
    )}
    <button
      type="button"
      onClick={() => onDismiss(item.name)}
      className="ml-auto underline"
      style={{ color: COLORS.slate }}
    >
      ignore
    </button>
  </li>
);

const RecentList: React.FC<{ entries: FiledEntry[] }> = ({ entries }) => {
  if (entries.length === 0) return null;
  return (
    <section className="mt-3 pt-2" style={{ borderTop: `1px solid ${COLORS.slate}` }}>
      <h3 className="px-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: COLORS.steel }}>
        Recently filed
      </h3>
      <ul className="mt-1 space-y-1">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className="rounded px-2 py-1.5 text-[11px]"
            style={{
              backgroundColor: COLORS.white,
              border: '1px solid #E2E8F0',
              opacity: entry.pending ? 0.6 : 1,
            }}
          >
            <p className="line-clamp-2" style={{ color: COLORS.midnight }}>{entry.clean_text}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px]" style={{ color: COLORS.slate }}>
              <span>
                {entry.is_general
                  ? 'general'
                  : `${entry.links.length} link${entry.links.length === 1 ? '' : 's'}`}
              </span>
              {entry.tags.length > 0 && <span>· {entry.tags.join(', ')}</span>}
              {entry.pending && <span>· saving…</span>}
              {entry.embedding_failed && (
                <span title="Filed, but the embedding failed — it will be backfilled." style={{ color: COLORS.terracotta }}>
                  · no embedding
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
};

// ---------------------------------------------------------------------------
// Launcher + panel
// ---------------------------------------------------------------------------
export const KnowledgeCaptureLauncher: React.FC = () => {
  const { user, userRole, isPortalUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // The unresolved name currently being created, if any. Held here (not in
  // ProposalEditor) because the create overlays must render OUTSIDE the panel:
  // the panel carries a transform, which would become the containing block for
  // their position:fixed and misplace them entirely.
  const [creating, setCreating] = useState<UnresolvedName | null>(null);

  const capture = useKnowledgeCapture(user?.id ?? null);
  const toggle = useCallback(() => setOpen((o) => !o), []);

  // Alt+K / Option+K. e.code, not e.key, because Option+K types "˚" on a Mac.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === 'KeyK') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  useEffect(() => {
    if (!open) return;
    capture.loadRecent();
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
    // loadRecent is stable (useCallback on the user id).
  }, [open, capture.loadRecent]);

  // Keep the latest reply in view as the conversation grows.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [capture.messages.length, capture.thinking]);

  // Internal users only — the same gate the edge function enforces. Portal and
  // coach users share this layout, so without it they'd see a button that 403s.
  const isInternal = !isPortalUser && !!userRole && INTERNAL_ROLES.includes(userRole);
  if (!isInternal) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || capture.thinking) return;
    setDraft('');
    capture.send(text);
    inputRef.current?.focus();
  };

  const isFirstTurn = capture.messages.length === 0;

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        className="fixed flex items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2"
        style={{
          bottom: FAB_BOTTOM,
          right: FAB_RIGHT,
          height: FAB_SIZE,
          width: FAB_SIZE,
          // Steel blue + a lightbulb, against Quick Notes' midnight "+".
          backgroundColor: COLORS.steel,
          color: COLORS.white,
          zIndex: Z_FAB,
        }}
        title={open ? 'Close Intel (Alt+K)' : 'Capture intel (Alt+K)'}
        aria-label={open ? 'Close Intel' : 'Capture intel'}
        aria-expanded={open}
      >
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 21h6M10 21v-2.5a5.5 5.5 0 10-1.6-1.1M12 3v1m6.4 1.6l-.7.7M21 12h-1M4 12H3m2.3-5.7l.7.7"
          />
        </svg>
      </button>

      <aside
        className={`fixed right-0 top-0 flex h-full flex-col transition-transform duration-200 ease-out ${
          open ? 'shadow-2xl' : 'pointer-events-none invisible'
        }`}
        style={{
          width: `min(${PANEL_WIDTH}px, 100vw)`,
          backgroundColor: COLORS.bg,
          borderLeft: `1px solid ${COLORS.slate}`,
          zIndex: Z_PANEL,
          transform: open ? 'translateX(0)' : 'translateX(100%)',
        }}
        aria-hidden={!open}
        aria-label="Intel"
        onKeyDown={(e) => {
          // stopPropagation so Esc here doesn't also close a map slideout behind us.
          if (e.key === 'Escape') {
            e.stopPropagation();
            setOpen(false);
          }
        }}
      >
        <header
          className="flex flex-shrink-0 items-center justify-between px-4 py-3"
          style={{ backgroundColor: COLORS.steel, color: COLORS.white }}
        >
          <div>
            <h2 className="text-sm font-semibold">Intel</h2>
            <p className="text-[11px]" style={{ color: '#D6E0EC' }}>
              Shared with the team · kept permanently
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded p-1 hover:bg-white/10"
            aria-label="Close Intel"
            title="Close (Alt+K)"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <form onSubmit={submit} className="flex-shrink-0 px-4 pt-3 pb-2" style={{ backgroundColor: COLORS.white }}>
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter is a newline.
              if (e.key === 'Enter' && !e.shiftKey) submit(e);
            }}
            rows={isFirstTurn ? 3 : 2}
            tabIndex={open ? 0 : -1}
            placeholder={
              isFirstTurn
                ? 'What did you just learn? e.g. "Starbucks work letter says drywall on the Bridge prototype runs $18/sf"'
                : 'Reply — correct it, or say yes…'
            }
            className="w-full resize-none rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2"
            style={{ border: `1px solid ${COLORS.slate}`, color: COLORS.midnight }}
          />
          <div className="mt-1 flex items-center justify-between text-[11px]" style={{ color: COLORS.steel }}>
            <span>{capture.thinking ? 'Thinking…' : 'Enter to send · Shift+Enter for a new line'}</span>
            {!isFirstTurn && (
              <button type="button" onClick={() => { capture.reset(); setDraft(''); }} className="underline">
                Start over
              </button>
            )}
          </div>
        </form>

        {capture.error && (
          <div
            className="mx-4 mt-2 flex-shrink-0 rounded px-2 py-1 text-xs"
            style={{ color: COLORS.terracotta, border: `1px solid ${COLORS.terracotta}`, backgroundColor: COLORS.white }}
          >
            {capture.error}
          </div>
        )}

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3" style={{ borderTop: `1px solid ${COLORS.slate}` }}>
          {isFirstTurn && !capture.thinking ? (
            <p className="py-2 text-center text-xs" style={{ color: COLORS.slate }}>
              Type the fact as you heard it. I'll tidy it, find what it relates to, and ask if I'm unsure.
            </p>
          ) : (
            <div className="space-y-2">
              {capture.messages.map((message, i) => (
                <div
                  key={i}
                  className="rounded-md px-2.5 py-1.5 text-xs whitespace-pre-wrap"
                  style={
                    message.role === 'user'
                      ? { backgroundColor: COLORS.white, border: '1px solid #E2E8F0', color: COLORS.midnight }
                      : { backgroundColor: 'transparent', color: COLORS.midnight }
                  }
                >
                  {message.content}
                </div>
              ))}
              {capture.thinking && (
                <p className="px-2.5 text-xs" style={{ color: COLORS.slate }}>Searching OVIS…</p>
              )}
            </div>
          )}

          {capture.proposal && (
            <div className="mt-3">
              <ProposalEditor
                proposal={capture.proposal}
                rawText={capture.rawText}
                unresolved={capture.unresolved}
                onEditCleanText={capture.editCleanText}
                onAddLink={capture.addLink}
                onRemoveLink={capture.removeLink}
                onCreateUnresolved={setCreating}
                onDismissUnresolved={capture.dismissUnresolved}
                onAddTag={capture.addTag}
                onRemoveTag={capture.removeTag}
              />
              <button
                type="button"
                onClick={() => { capture.fileIt(); inputRef.current?.focus(); }}
                disabled={capture.filing || !capture.proposal.clean_text.trim()}
                className="mt-2 w-full rounded-md py-2 text-sm font-semibold disabled:opacity-50"
                style={
                  // Lit up once the user has confirmed in conversation; the click is
                  // still the only thing that files.
                  capture.readyToFile
                    ? { backgroundColor: COLORS.midnight, color: COLORS.white }
                    : { backgroundColor: COLORS.white, color: COLORS.midnight, border: `1px solid ${COLORS.midnight}` }
                }
              >
                {capture.filing ? 'Filing…' : 'File it'}
              </button>
            </div>
          )}

          <RecentList entries={capture.recent} />
        </div>
      </aside>

      {/*
        Create flows for names the AI couldn't find. Rendered as siblings of the
        panel, never inside it (see `creating` above). Both are the app's existing
        overlays, reused as-is apart from the prefill and stacking props: the new
        record is created by them, and we only link what they hand back.
      */}
      {creating?.object_type === 'contact' && (
        <ContactFormModal
          isOpen
          zIndex={Z_CREATE_MODAL}
          initialValues={splitPersonName(creating.name)}
          onClose={() => setCreating(null)}
          onSave={(contact) => {
            const name = [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim();
            capture.resolveWith(creating.name, {
              object_type: 'contact',
              object_id: contact.id,
              object_name: name || creating.name,
            });
            setCreating(null);
          }}
        />
      )}

      {creating?.object_type === 'property' && (
        <InlinePropertyCreationModal
          isOpen
          zIndex={Z_CREATE_MODAL}
          initialName={creating.name}
          // No coordinates: a note names a property, it doesn't place it. The
          // modal says so and the property is created unmapped.
          coordinates={null}
          onClose={() => setCreating(null)}
          onSave={(property) => {
            capture.resolveWith(creating.name, {
              object_type: 'property',
              object_id: property.id,
              object_name: property.property_name || property.address || creating.name,
            });
            setCreating(null);
          }}
        />
      )}
    </>
  );
};
