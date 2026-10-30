import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

// Knowledge Capture state: one capture conversation at a time, plus the last few
// entries this user filed. SEPARATE from Quick Notes — different table, different
// lifetime (permanent), different audience (the whole company can read it).
//
// The conversation is held here and sent whole to ovis-knowledge-capture on every
// turn; the edge function keeps no state. See docs/KNOWLEDGE_CAPTURE.md.

export type ObjectType = 'account' | 'deal' | 'property' | 'contact';

export interface KnowledgeLink {
  object_type: ObjectType;
  object_id: string;
  object_name: string;
}

export interface Proposal {
  clean_text: string;
  links: KnowledgeLink[];
  tags: string[];
  is_general: boolean;
}

/**
 * A name the AI found in the note but couldn't find in OVIS. The panel offers to
 * create the record; it is NOT part of the filed proposal, so an unresolved name
 * that's never created simply doesn't become a link.
 */
export interface UnresolvedName {
  object_type: ObjectType;
  name: string;
  /**
   * Details the AI found LITERALLY in the note (a pasted signature, an address).
   * The edge function verifies every field against the note text before sending
   * it, so anything here was really written by the user — see verifyDetails().
   */
  details?: {
    email?: string;
    phone?: string;
    mobile_phone?: string;
    title?: string;
    company?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
}

/** One sender address in the user's own mailbox that matches a name. */
export interface EmailSenderCandidate {
  sender_email: string;
  sender_name: string | null;
  last_received_at: string;
  email_count: number;
}

/** The email a "Look up in my email" prefill came from, shown on the form. */
export interface EmailSignatureSource {
  email_id: string;
  received_at: string;
  sender_email: string;
  sender_name: string | null;
  subject: string | null;
}

/**
 * ovis-knowledge-capture's lookup_email_signature answer. Details were verified
 * server-side against the sender's own text (quotes and forwards stripped),
 * except the email, which is the From address we searched on (unless that's a
 * mailing service). Never an Oculus email, company or internal phone.
 */
export type EmailLookupResult =
  | {
      result: 'found';
      details: NonNullable<UnresolvedName['details']>;
      source: EmailSignatureSource;
      /** A different address in the signature: shown on the form, not used. */
      signature_email?: string;
      /** The From address is a mailing service's, so it wasn't used. */
      relay_from?: string;
    }
  | { result: 'choose'; candidates: EmailSenderCandidate[] }
  | { result: 'no_signature'; sender_email?: string }
  | { result: 'need_full_name' };

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface FiledEntry {
  id: string;
  clean_text: string;
  is_general: boolean;
  created_at: string;
  links: Array<{ object_type: ObjectType; object_id: string }>;
  tags: string[];
  /** True while the insert is in flight. */
  pending?: boolean;
  /** Set when the entry filed but its embedding didn't. */
  embedding_failed?: boolean;
}

const RECENT_LIMIT = 5;

/** What filing hands the attachment upload. */
export interface FiledResult {
  entry_id: string;
  /** The first linked account in the panel's order: the Dropbox folder's client. */
  client_id: string | null;
  short_title: string;
}

interface TurnResponse {
  reply: string;
  proposal: Proposal;
  ready_to_file: boolean;
  model: string;
  unresolved?: UnresolvedName[];
  /** A few words naming the fact — the Dropbox folder title for attached files. */
  short_title?: string;
}

interface FileResponse {
  entry_id: string;
  proposal: Proposal;
  embedded: boolean;
  embedding_error: string | null;
  correction_written: boolean;
}

/** supabase.functions.invoke puts the function's own error body out of reach. */
export async function invokeKnowledgeCapture<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('ovis-knowledge-capture', { body });
  if (error) {
    // FunctionsHttpError carries the response; the detail in it is the useful part.
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const parsed = await ctx.json();
        const detail = parsed?.detail ?? parsed?.error;
        if (detail) throw new Error(String(detail));
      } catch (e) {
        if (e instanceof Error && e.message && !/json/i.test(e.message)) throw e;
      }
    }
    throw new Error(error.message || 'Knowledge capture is unavailable');
  }
  return data as T;
}

/**
 * ovis-knowledge-capture's parse_signature answer ("Paste signature" in the
 * contact form). Fields were verified server-side against the pasted text and
 * never include an Oculus email, company or internal phone. Nothing is written.
 */
export type PastedSignatureResult =
  | { result: 'parsed'; name?: string; details: NonNullable<UnresolvedName['details']> }
  | { result: 'multiple' }
  | { result: 'nothing_found' };

export function parsePastedSignature(text: string): Promise<PastedSignatureResult> {
  return invokeKnowledgeCapture<PastedSignatureResult>({ action: 'parse_signature', text });
}

export function useKnowledgeCapture(authUserId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [rawText, setRawText] = useState('');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [readyToFile, setReadyToFile] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [filing, setFiling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<FiledEntry[]>([]);
  const [unresolved, setUnresolved] = useState<UnresolvedName[]>([]);
  // "Look up in my email" is per-user (app_settings.intel_email_lookup_user_ids).
  // This only decides whether to SHOW the button; the edge function re-checks.
  const [emailLookupAllowed, setEmailLookupAllowed] = useState(false);

  // The model's FIRST proposal for this note, and the model that produced it.
  // The correction row is the difference between this and what's actually filed,
  // so a fix the user made by talking ("no, the Hoschton deal") counts too — not
  // just chip edits. Never overwritten mid-conversation.
  const baselineRef = useRef<Proposal | null>(null);
  const proposalModelRef = useRef<string | null>(null);
  const shortTitleRef = useRef<string>('');

  useEffect(() => {
    if (!authUserId) return;
    let cancelled = false;
    supabase.rpc('intel_email_lookup_allowed').then(({ data, error: err }) => {
      if (!cancelled) setEmailLookupAllowed(!err && data === true);
    });
    return () => {
      cancelled = true;
    };
  }, [authUserId]);

  /** Signature lookup in the user's own mailbox. `senderEmail` is a picked candidate. */
  const lookupEmailSignature = useCallback(
    (name: string, opts: { email?: string; senderEmail?: string } = {}) =>
      invokeKnowledgeCapture<EmailLookupResult>({
        action: 'lookup_email_signature',
        name,
        ...(opts.email ? { email: opts.email } : {}),
        ...(opts.senderEmail ? { sender_email: opts.senderEmail } : {}),
      }),
    [],
  );

  const loadRecent = useCallback(async () => {
    if (!authUserId) return;
    const { data, error: err } = await supabase
      .from('knowledge_entry')
      .select('id, clean_text, is_general, created_at, links:knowledge_entry_link(object_type, object_id), tags:knowledge_entry_tag(tag)')
      .eq('user_id', authUserId)
      .order('created_at', { ascending: false })
      .limit(RECENT_LIMIT);
    if (err) return; // The list is reassurance, not the feature — never block on it.
    setRecent(
      (data ?? []).map((row: Record<string, unknown>) => ({
        id: String(row.id),
        clean_text: String(row.clean_text ?? ''),
        is_general: row.is_general === true,
        created_at: String(row.created_at),
        links: (row.links ?? []) as FiledEntry['links'],
        tags: ((row.tags ?? []) as Array<{ tag: string }>).map((t) => t.tag),
      })),
    );
  }, [authUserId]);

  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  const reset = useCallback(() => {
    setMessages([]);
    setRawText('');
    setProposal(null);
    setReadyToFile(false);
    setError(null);
    setUnresolved([]);
    baselineRef.current = null;
    proposalModelRef.current = null;
    shortTitleRef.current = '';
  }, []);

  /** Send a note (first turn) or a reply (every turn after). */
  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || thinking) return;

      const isFirst = messages.length === 0;
      // raw_text is the note exactly as first typed, and is never editable or
      // replaced by a later turn.
      const noteText = isFirst ? content : rawText;
      const next: ChatMessage[] = [...messages, { role: 'user', content }];
      setMessages(next);
      if (isFirst) setRawText(content);
      setThinking(true);
      setError(null);

      try {
        const result = await invokeKnowledgeCapture<TurnResponse>({
          action: 'converse',
          messages: next,
          entry_draft: { raw_text: noteText },
        });
        setMessages([...next, { role: 'assistant', content: result.reply }]);
        setProposal(result.proposal);
        setReadyToFile(result.ready_to_file);
        setUnresolved(result.unresolved ?? []);
        if (result.short_title) shortTitleRef.current = result.short_title;
        if (!baselineRef.current) {
          baselineRef.current = result.proposal;
          proposalModelRef.current = result.model;
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong');
        // Leave the user's message in place so they can see what was sent and
        // retry without retyping it.
      } finally {
        setThinking(false);
      }
    },
    [messages, rawText, thinking],
  );

  // --- Editing the proposal before filing -------------------------------
  const editCleanText = useCallback((clean_text: string) => {
    setProposal((p) => (p ? { ...p, clean_text } : p));
  }, []);

  const removeLink = useCallback((objectType: ObjectType, objectId: string) => {
    setProposal((p) => {
      if (!p) return p;
      const links = p.links.filter((l) => !(l.object_type === objectType && l.object_id === objectId));
      // Dropping the last link makes this general knowledge — the table's meaning
      // of is_general (belongs to no object), kept true automatically.
      return { ...p, links, is_general: links.length === 0 };
    });
  }, []);

  const addLink = useCallback((link: KnowledgeLink) => {
    setProposal((p) => {
      if (!p) return p;
      if (p.links.some((l) => l.object_type === link.object_type && l.object_id === link.object_id)) {
        return p;
      }
      return { ...p, links: [...p.links, link], is_general: false };
    });
  }, []);

  /**
   * A record the user just created for an unresolved name: link it and drop the
   * offer. Matching on the name the AI reported, not the saved record's name —
   * the user may have corrected the spelling in the create form.
   */
  const resolveWith = useCallback((unresolvedName: string, link: KnowledgeLink) => {
    addLink(link);
    setUnresolved((u) => u.filter((n) => n.name !== unresolvedName));
  }, [addLink]);

  const dismissUnresolved = useCallback((name: string) => {
    setUnresolved((u) => u.filter((n) => n.name !== name));
  }, []);

  const removeTag = useCallback((tag: string) => {
    setProposal((p) => (p ? { ...p, tags: p.tags.filter((t) => t !== tag) } : p));
  }, []);

  const addTag = useCallback((raw: string) => {
    const tag = raw.trim().replace(/\s+/g, ' ').toLowerCase();
    if (!tag) return;
    setProposal((p) => (p ? (p.tags.includes(tag) ? p : { ...p, tags: [...p.tags, tag] }) : p));
  }, []);

  /**
   * File it. The button is the only thing that files — ready_to_file just lights
   * it up. Optimistic: the row appears in the list immediately.
   *
   * Resolves to what the attachment upload needs (the new entry, its first
   * linked client, the short title), or null if filing failed.
   */
  const fileIt = useCallback(async (): Promise<FiledResult | null> => {
    if (!proposal || !rawText || filing) return null;
    const tempId = `pending-${crypto.randomUUID()}`;
    const optimistic: FiledEntry = {
      id: tempId,
      clean_text: proposal.clean_text,
      is_general: proposal.is_general,
      created_at: new Date().toISOString(),
      links: proposal.links.map((l) => ({ object_type: l.object_type, object_id: l.object_id })),
      tags: proposal.tags,
      pending: true,
    };
    setRecent((r) => [optimistic, ...r].slice(0, RECENT_LIMIT));
    setFiling(true);
    setError(null);

    try {
      const result = await invokeKnowledgeCapture<FileResponse>({
        action: 'file',
        entry: {
          raw_text: rawText,
          clean_text: proposal.clean_text,
          source: 'typed',
          is_general: proposal.is_general,
          links: proposal.links,
          tags: proposal.tags,
          proposed: baselineRef.current,
          proposal_model: proposalModelRef.current,
        },
      });
      setRecent((r) =>
        r.map((entry) =>
          entry.id === tempId
            ? { ...entry, id: result.entry_id, pending: false, embedding_failed: !result.embedded }
            : entry,
        ),
      );
      const filed: FiledResult = {
        entry_id: result.entry_id,
        client_id: proposal.links.find((l) => l.object_type === 'account')?.object_id ?? null,
        short_title: shortTitleRef.current,
      };
      // Ready for the next note; the panel stays open.
      reset();
      return filed;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not file this entry');
      setRecent((r) => r.filter((entry) => entry.id !== tempId));
      return null;
    } finally {
      setFiling(false);
    }
  }, [filing, proposal, rawText, reset]);

  return {
    messages,
    rawText,
    proposal,
    unresolved,
    readyToFile,
    thinking,
    filing,
    error,
    recent,
    send,
    editCleanText,
    addLink,
    removeLink,
    resolveWith,
    dismissUnresolved,
    addTag,
    removeTag,
    fileIt,
    reset,
    loadRecent,
    emailLookupAllowed,
    lookupEmailSignature,
    clearError: () => setError(null),
  };
}
