/**
 * The one TriageStore implementation: PostgREST with the secret key.
 *
 * Every method is a single query with no branching, so the behaviour worth
 * testing lives in voice_triage.ts and is tested there against a fake. What this
 * file has to get right is the schema, and three things about it are not
 * guessable:
 *
 *   1. A LOGIN MAPS TO A PERSON THROUGH user.auth_user_id, NOT user.id. Only
 *      one of the four OVIS users has them equal (Mike's). Resolving by id
 *      would scope every other caller to nothing, or to the wrong row.
 *   2. Writes stamp created_by_id / updated_by_id EXPLICITLY. The audit
 *      triggers read auth.uid(), and the secret key has none, so an unstamped
 *      insert is authored by nobody.
 *   3. SELECTS THAT CAN EXCEED 1000 ROWS PAGINATE (CLAUDE.md) and `in.(…)`
 *      lists are chunked — a long one breaks the request, not just the query.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import type {
  AuditEntry, CommitmentRow, Conn, DealMatch, ThreadMail, TriageStore, WatchRow,
} from './voice_triage.ts';
import { escapeLike } from './voice_triage.ts';

const PAGE = 1000;
/** Thread ids per `in.(…)`: the panel's own chunk size, well under any URL limit. */
const ID_CHUNK = 150;

const chunk = <T>(xs: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
};

export function supabaseStore(db: SupabaseClient): TriageStore {
  const must = <T>(res: { data: T | null; error: { message: string } | null }, what: string): T => {
    if (res.error) throw new Error(`${what}: ${res.error.message}`);
    return res.data as T;
  };

  const connFrom = (row: any): Conn => ({
    id: String(row.id),
    google_email: String(row.google_email ?? '').toLowerCase(),
    user_id: row.user_id ? String(row.user_id) : null,
    user_name: row.user?.name ?? [row.user?.first_name, row.user?.last_name].filter(Boolean).join(' ') ?? null,
  });

  return {
    async userIdForAuthId(authUserId) {
      const res = await db.from('user').select('id').eq('auth_user_id', authUserId).maybeSingle();
      return res.data ? String((res.data as any).id) : null;
    },

    async connectionForUser(userId) {
      const res = await db.from('gmail_connection')
        .select('id, google_email, user_id, user:user_id (name, first_name, last_name)')
        .eq('user_id', userId).limit(1);
      const rows = must(res, 'gmail_connection');
      return rows.length ? connFrom(rows[0]) : null;
    },

    async connectionForEmail(email) {
      const res = await db.from('gmail_connection')
        .select('id, google_email, user_id, user:user_id (name, first_name, last_name)')
        .ilike('google_email', email).limit(1);
      const rows = must(res, 'gmail_connection');
      return rows.length ? connFrom(rows[0]) : null;
    },

    async openCommitments(connectionId) {
      const rows: CommitmentRow[] = [];
      for (let offset = 0; ; offset += PAGE) {
        const res = await db.from('commitment')
          .select('id, ball, status, what, speakable_reason, gmail_thread_id, conversation_thread_ids, counterparty_name, counterparty_email, deal_id, deal:deal_id (deal_name), promised_date, skip_count, sync_state, sync_error')
          .eq('gmail_connection_id', connectionId)
          .in('status', ['open', 'flagged', 'skipped'])
          .range(offset, offset + PAGE - 1);
        const page = must(res, 'commitment') as unknown as CommitmentRow[];
        rows.push(...page);
        if (page.length < PAGE) break;
      }
      return rows;
    },

    async commitmentById(id) {
      const res = await db.from('commitment')
        .select('id, ball, status, what, speakable_reason, gmail_thread_id, conversation_thread_ids, gmail_connection_id, counterparty_name, counterparty_email, deal_id, deal:deal_id (deal_name), promised_date, skip_count, sync_state, sync_error')
        .eq('id', id).maybeSingle();
      if (res.error) throw new Error(`commitment: ${res.error.message}`);
      return (res.data as any) ?? null;
    },

    async newestMailByThread(threadIds) {
      const newest = new Map<string, ThreadMail>();
      for (const part of chunk(threadIds, ID_CHUNK)) {
        const res = await db.from('emails')
          .select('id, thread_id, received_at, subject, sender_email, sender_name')
          .in('thread_id', part)
          .order('received_at', { ascending: false })
          .limit(PAGE);
        for (const m of (must(res, 'emails') as unknown as ThreadMail[])) {
          // Ordered newest-first, so the first sighting of a thread is its newest.
          if (!newest.has(m.thread_id)) newest.set(m.thread_id, m);
        }
      }
      return newest;
    },

    async unknownCounterparties(emails) {
      const res = await db.rpc('commitment_unknown_counterparties', { p_emails: emails });
      const rows = must(res as any, 'commitment_unknown_counterparties') as Array<{ email: string }>;
      return (rows ?? []).map((r) => String(r.email));
    },

    async searchDeals(query) {
      const pat = `%${escapeLike(query)}%`;
      const select = 'id, deal_name, sf_city, sf_address, client:client_id (client_name), stage:stage_id (label), property:property_id (address, city, state)';
      const found = new Map<string, DealMatch>();
      const add = (rows: any[], why: string) => {
        for (const d of rows ?? []) {
          const prev = found.get(String(d.id));
          if (prev) { if (!prev.matched_on.includes(why)) prev.matched_on.push(why); continue; }
          found.set(String(d.id), {
            deal_id: String(d.id),
            deal_name: d.deal_name ?? null,
            stage: d.stage?.label ?? null,
            client: d.client?.client_name ?? null,
            address: d.property?.address ?? d.sf_address ?? null,
            city: d.property?.city ?? d.sf_city ?? null,
            state: d.property?.state ?? null,
            matched_on: [why],
          });
        }
      };
      /** Every page of a filtered deal select — ALL matches, never the first 1000. */
      const allDeals = async (apply: (q: any) => any, why: string) => {
        for (let offset = 0; ; offset += PAGE) {
          const res = await apply(db.from('deal').select(select)).range(offset, offset + PAGE - 1);
          const page = must(res, 'deal') as unknown as any[];
          add(page, why);
          if (page.length < PAGE) break;
        }
      };

      await allDeals((q) => q.ilike('deal_name', pat), 'deal name');
      // The deal's own address/city columns are the Salesforce-era ones; the
      // live address lives on property, so both are searched.
      await allDeals((q) => q.or(`sf_city.ilike.${pat},sf_address.ilike.${pat}`), 'deal address');

      const clients = must(await db.from('client').select('id').ilike('client_name', pat).limit(500), 'client') as unknown as any[];
      for (const part of chunk(clients.map((c) => String(c.id)), ID_CHUNK)) {
        await allDeals((q) => q.in('client_id', part), 'client');
      }
      const props = must(
        await db.from('property').select('id').or(`address.ilike.${pat},city.ilike.${pat},property_name.ilike.${pat}`).limit(500),
        'property',
      ) as unknown as any[];
      for (const part of chunk(props.map((p) => String(p.id)), ID_CHUNK)) {
        await allDeals((q) => q.in('property_id', part), 'property');
      }
      return [...found.values()].sort((a, b) => String(a.deal_name ?? '').localeCompare(String(b.deal_name ?? '')));
    },

    async dealById(id) {
      const res = await db.from('deal').select('*').eq('id', id).maybeSingle();
      if (res.error) throw new Error(`deal: ${res.error.message}`);
      return (res.data as any) ?? null;
    },

    async stageByName(name) {
      const res = await db.from('deal_stage').select('id, label').ilike('label', `%${escapeLike(name)}%`).limit(2);
      const rows = must(res, 'deal_stage') as unknown as Array<{ id: string; label: string }>;
      // An ambiguous spoken stage is not a stage: two matches is a question for
      // the caller, not a coin flip.
      if (rows.length !== 1) return null;
      return { id: String(rows[0].id), label: String(rows[0].label) };
    },

    async updateDeal(id, patch, userId) {
      const res = await db.from('deal')
        .update({ ...patch, updated_by_id: userId, updated_at: new Date().toISOString() })
        .eq('id', id).select('*').maybeSingle();
      if (res.error) throw new Error(`update deal: ${res.error.message}`);
      if (!res.data) throw new Error('update deal: no row came back');
      return res.data as any;
    },

    async insertContact(fields, userId) {
      const now = new Date().toISOString();
      const res = await db.from('contact')
        .insert({ ...fields, created_by_id: userId, updated_by_id: userId, created_at: now, updated_at: now })
        .select('*').single();
      if (res.error) throw new Error(`create contact: ${res.error.message}`);
      return res.data as any;
    },

    async attachDealContact(dealId, contactId, userId) {
      const now = new Date().toISOString();
      const res = await db.from('deal_contact').insert({
        deal_id: dealId, contact_id: contactId, primary_contact: false, role_id: null,
        created_by_id: userId, updated_by_id: userId, created_at: now, updated_at: now,
      });
      if (res.error) throw new Error(`attach to deal: ${res.error.message}`);
    },

    async insertNote(note, dealId, userId) {
      const now = new Date().toISOString();
      // Same shape NoteFormModal writes, including the sf_* surrogate keys the
      // notes UI keys manual rows by.
      const res = await db.from('note').insert({
        sf_content_note_id: `mcp_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        title: note.title, body: note.body, content_size: note.plainLength,
        share_type: 'V', visibility: 'AllUsers',
        created_by_id: userId, updated_by_id: userId, created_at: now, updated_at: now,
      }).select('id').single();
      if (res.error) throw new Error(`create note: ${res.error.message}`);
      const noteId = String((res.data as any).id);
      const link = await db.from('note_object_link').insert({
        note_id: noteId,
        sf_content_document_link_id: `mcp_${Date.now()}_deal_${dealId}`,
        object_type: 'deal', object_id: dealId, deal_id: dealId,
        created_at: now, updated_at: now,
      });
      if (link.error) throw new Error(`link note to deal: ${link.error.message}`);
      return { id: noteId };
    },

    async createWatch(row) {
      const res = await db.from('mcp_thread_watch').insert(row).select('*').single();
      if (res.error) throw new Error(`create watch: ${res.error.message}`);
      return res.data as unknown as WatchRow;
    },

    async watchesForUser(userId, statuses) {
      const res = await db.from('mcp_thread_watch')
        .select('id, thread_id, thread_ids, commitment_id, label, baseline_at, status, fired_at, fired_sender, fired_subject, created_at')
        .eq('user_id', userId).in('status', statuses)
        .order('created_at', { ascending: false }).limit(200);
      return must(res, 'watches') as unknown as WatchRow[];
    },

    async watchById(id, userId) {
      const res = await db.from('mcp_thread_watch')
        .select('id, thread_id, thread_ids, commitment_id, label, baseline_at, status, fired_at, fired_sender, fired_subject, created_at')
        .eq('id', id).eq('user_id', userId).maybeSingle();
      if (res.error) throw new Error(`watch: ${res.error.message}`);
      return (res.data as any) ?? null;
    },

    async markWatchFired(id, mail) {
      const res = await db.from('mcp_thread_watch').update({
        status: 'fired', fired_at: mail.received_at, fired_email_id: mail.id,
        fired_sender: mail.sender_name ? `${mail.sender_name} <${mail.sender_email}>` : mail.sender_email,
        fired_subject: mail.subject,
      }).eq('id', id).eq('status', 'active');
      if (res.error) throw new Error(`mark watch fired: ${res.error.message}`);
    },

    async cancelWatch(id) {
      const res = await db.from('mcp_thread_watch')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('id', id).eq('status', 'active');
      if (res.error) throw new Error(`cancel watch: ${res.error.message}`);
    },

    async mailAfter(threadIds, afterIso) {
      const out: ThreadMail[] = [];
      for (const part of chunk(threadIds, ID_CHUNK)) {
        const res = await db.from('emails')
          .select('id, thread_id, received_at, subject, sender_email, sender_name')
          .in('thread_id', part).gt('received_at', afterIso)
          .order('received_at', { ascending: true }).limit(PAGE);
        out.push(...(must(res, 'emails') as unknown as ThreadMail[]));
      }
      return out;
    },

    async extractionRun(runId) {
      const res = await db.from('commitment_extraction_run').select('*').eq('id', runId).maybeSingle();
      if (res.error) throw new Error(`extraction run: ${res.error.message}`);
      return (res.data as any) ?? null;
    },

    async audit(entry: AuditEntry) {
      const res = await db.from('mcp_audit_log').insert({
        tool: entry.tool, caller: entry.caller, auth_user_id: entry.auth_user_id,
        user_id: entry.user_id, args: entry.args ?? {}, ok: entry.ok,
        result: entry.result ?? null, error: entry.error ?? null,
      });
      // An audit failure must be loud but must not hide the tool's own outcome.
      if (res.error) console.error(`[ovis-mcp] audit write failed for ${entry.tool}: ${res.error.message}`);
    },
  };
}
