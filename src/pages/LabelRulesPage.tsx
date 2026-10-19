/**
 * LabelRulesPage — approve or reject one sender rule at a time.
 *
 * DELIBERATELY SMALL. The 2054-line EmailClassificationReviewPage is not
 * extended: this asks one question per row and takes one of two answers. No
 * forms, no free text, no per-email drill-down. Google Alerts was hand-labelled
 * Reading 22 times because corrections accumulated and nothing applied them;
 * this page is the thing that applies them.
 *
 * Approving writes a row to email_label_rule. The labeler picks it up on its
 * next 5-minute tick: new mail is labelled on arrival, and anything still in
 * the inbox is relabelled (the reconcile pass lifts OVIS/Unsorted and applies
 * the new label). Archived mail is left alone.
 *
 * Turning a rule off is on this same page, from day one. It stops applying
 * immediately and the reconcile pass removes the labels it had applied to inbox
 * mail, so a bad rule visibly undoes itself.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { CheckIcon, XMarkIcon, NoSymbolIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

interface Proposal {
  scope: 'address' | 'domain';
  pattern: string;
  proposed_label: string;
  corrections_total: number;
  wrong_count: number;
  silent_count: number;
  distinct_addresses: number;
  unsorted_now: number;
  contradicts: boolean;
  rationale: string;
}

interface Rule {
  id: string;
  scope: 'address' | 'domain';
  pattern: string;
  label: string;
  status: 'active' | 'rejected' | 'disabled';
  corrections_total: number;
  wrong_count: number;
  created_at: string;
  disabled_at: string | null;
}

const NAVY = '#002147';
const STEEL = '#4A6B94';
const SLATE = '#8FA9C8';

/** "You have moved mail from X to Reading 22 times." -> one plain question. */
function question(p: Proposal): string {
  const label = p.proposed_label.replace('OVIS/', '');
  const what = p.scope === 'domain' ? `anything from @${p.pattern}` : p.pattern;
  return `Always label ${what} as ${label}?`;
}

export function LabelRulesPage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Load failures are tracked PER LIST and separately from the data, because
  // the first version of this page rendered a timed-out proposals query as
  // "Proposed (0) — nothing has reached the threshold yet" while 21 proposals
  // existed. An error and a genuine zero must never look the same.
  const [proposalsError, setProposalsError] = useState<string | null>(null);
  const [rulesError, setRulesError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [{ data: props, error: pErr }, { data: rs, error: rErr }] = await Promise.all([
      supabase.rpc('email_label_rule_proposals'),
      supabase.from('email_label_rule').select('*').order('decided_at', { ascending: false }),
    ]);

    // On failure: record it and leave the previous data alone. Writing [] here
    // is what turned a timeout into a confident "there is nothing to approve".
    if (pErr) {
      setProposalsError(pErr.message);
    } else {
      setProposalsError(null);
      setProposals((props ?? []) as Proposal[]);
    }

    if (rErr) {
      setRulesError(rErr.message);
    } else {
      setRulesError(null);
      setRules((rs ?? []) as Rule[]);
    }

    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function decide(p: Proposal, status: 'active' | 'rejected') {
    setBusy(p.scope + p.pattern);
    const { data: auth } = await supabase.auth.getUser();
    let userId: string | null = null;
    if (auth?.user) {
      const { data: u } = await supabase
        .from('user').select('id').eq('auth_user_id', auth.user.id).limit(1);
      userId = u?.[0]?.id ?? null;
    }
    const { error: insErr } = await supabase.from('email_label_rule').insert({
      scope: p.scope,
      pattern: p.pattern,
      label: p.proposed_label,
      status,
      corrections_total: p.corrections_total,
      wrong_count: p.wrong_count,
      silent_count: p.silent_count,
      rationale: p.rationale,
      created_by_user_id: userId,
    });
    if (insErr) setError(insErr.message);
    setBusy(null);
    await load();
  }

  async function disable(rule: Rule) {
    setBusy(rule.id);
    const { error: upErr } = await supabase.from('email_label_rule')
      .update({ status: 'disabled', disabled_at: new Date().toISOString() })
      .eq('id', rule.id);
    if (upErr) setError(upErr.message);
    setBusy(null);
    await load();
  }

  async function reactivate(rule: Rule) {
    setBusy(rule.id);
    const { error: upErr } = await supabase.from('email_label_rule')
      .update({ status: 'active', disabled_at: null, decided_at: new Date().toISOString() })
      .eq('id', rule.id);
    if (upErr) setError(upErr.message);
    setBusy(null);
    await load();
  }

  const active = rules.filter((r) => r.status === 'active');
  const off = rules.filter((r) => r.status !== 'active');

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh', padding: '24px 16px' }}>
      <div style={{ maxWidth: 920, margin: '0 auto' }}>
        <h1 style={{ color: NAVY, fontSize: 24, fontWeight: 600, margin: '0 0 4px' }}>
          Label rules
        </h1>
        <p style={{ color: STEEL, margin: '0 0 24px', fontSize: 14 }}>
          Rules built from corrections you already made in Gmail. Approving one applies it to new
          mail and to anything still in your inbox, within about five minutes.
        </p>

        {error && (
          <div style={{ border: '1px solid #A27B5C', color: '#A27B5C', background: '#fff',
                        padding: 12, borderRadius: 6, marginBottom: 16, fontSize: 14 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <h2 style={{ color: NAVY, fontSize: 18, fontWeight: 600, margin: 0 }}>
            {/* No count while the count is unknown. A number here would be a claim. */}
            {proposalsError ? 'Proposed — unavailable' : `Proposed (${proposals.length})`}
          </h2>
          <button onClick={load} disabled={loading}
                  style={{ border: `1px solid ${SLATE}`, background: '#fff', color: STEEL,
                           borderRadius: 6, padding: '4px 10px', fontSize: 13, cursor: 'pointer' }}>
            <ArrowPathIcon style={{ width: 14, height: 14, display: 'inline', marginRight: 4 }} />
            Refresh
          </button>
        </div>

        {loading && <p style={{ color: STEEL }}>Loading…</p>}

        {/* FAILURE, stated plainly and on its own. Nothing else is rendered for
            this section: no count, no empty-state copy, no stale list. */}
        {!loading && proposalsError && (
          <div style={{ background: '#fff', border: '2px solid #A27B5C', borderRadius: 8,
                        padding: 16, marginBottom: 32 }}>
            <div style={{ color: '#A27B5C', fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
              Could not load proposals — this is an error, not an empty list.
            </div>
            <div style={{ color: NAVY, fontSize: 13, marginBottom: 8 }}>
              There may well be proposals waiting. The query failed, so this page does not know.
            </div>
            <code style={{ color: STEEL, fontSize: 12, wordBreak: 'break-word' }}>
              {proposalsError}
            </code>
          </div>
        )}

        {!loading && !proposalsError && proposals.length === 0 && (
          <div style={{ background: '#fff', border: `1px solid ${SLATE}`, borderRadius: 8,
                        padding: 16, color: STEEL, fontSize: 14, marginBottom: 32 }}>
            Nothing has reached the threshold yet — three agreeing corrections on one address, or
            five across two addresses on a domain.
          </div>
        )}

        {!proposalsError && proposals.map((p) => {
          const key = p.scope + p.pattern;
          return (
            <div key={key} style={{ background: '#fff', border: `1px solid ${SLATE}`,
                                    borderRadius: 8, padding: 16, marginBottom: 12 }}>
              <div style={{ color: NAVY, fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
                {question(p)}
              </div>
              <div style={{ color: STEEL, fontSize: 13, marginBottom: 10 }}>
                {p.rationale}
                {p.scope === 'domain' && ` Across ${p.distinct_addresses} addresses.`}
                {p.unsorted_now > 0 && (
                  <strong style={{ color: NAVY }}>
                    {' '}Would fix {p.unsorted_now} message{p.unsorted_now === 1 ? '' : 's'} sitting
                    in Unsorted right now.
                  </strong>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button disabled={busy === key} onClick={() => decide(p, 'active')}
                        style={{ background: NAVY, color: '#fff', border: 'none', borderRadius: 6,
                                 padding: '8px 16px', fontSize: 14, cursor: 'pointer' }}>
                  <CheckIcon style={{ width: 16, height: 16, display: 'inline', marginRight: 6 }} />
                  Approve
                </button>
                <button disabled={busy === key} onClick={() => decide(p, 'rejected')}
                        style={{ background: 'transparent', color: SLATE,
                                 border: `1px solid ${SLATE}`, borderRadius: 6,
                                 padding: '8px 16px', fontSize: 14, cursor: 'pointer' }}>
                  <XMarkIcon style={{ width: 16, height: 16, display: 'inline', marginRight: 6 }} />
                  Reject
                </button>
              </div>
            </div>
          );
        })}

        <h2 style={{ color: NAVY, fontSize: 18, fontWeight: 600, margin: '32px 0 12px' }}>
          {rulesError ? 'Active — unavailable' : `Active (${active.length})`}
        </h2>
        {/* The Active list had the same defect: on a failed read it claimed
            "No rules are applying yet", which would be read as "my approvals
            did not take". */}
        {rulesError && (
          <div style={{ background: '#fff', border: '2px solid #A27B5C', borderRadius: 8,
                        padding: 16, marginBottom: 12 }}>
            <div style={{ color: '#A27B5C', fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
              Could not load rules — this is an error, not an empty list.
            </div>
            <div style={{ color: NAVY, fontSize: 13, marginBottom: 8 }}>
              Approved rules may be active and applying. This page could not read them.
            </div>
            <code style={{ color: STEEL, fontSize: 12, wordBreak: 'break-word' }}>{rulesError}</code>
          </div>
        )}
        {!rulesError && active.length === 0 && (
          <p style={{ color: STEEL, fontSize: 14 }}>No rules are applying yet.</p>
        )}
        {!rulesError && active.map((r) => (
          <div key={r.id} style={{ background: '#fff', border: `1px solid ${SLATE}`, borderRadius: 8,
                                   padding: '12px 16px', marginBottom: 8, display: 'flex',
                                   justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <div style={{ color: NAVY, fontSize: 14 }}>
                {r.scope === 'domain' ? `@${r.pattern}` : r.pattern} →{' '}
                <strong>{r.label.replace('OVIS/', '')}</strong>
              </div>
              <div style={{ color: STEEL, fontSize: 12 }}>
                {r.corrections_total} corrections ({r.wrong_count} overrode a verdict) ·
                approved {new Date(r.created_at).toLocaleDateString()}
              </div>
            </div>
            <button disabled={busy === r.id} onClick={() => disable(r)}
                    style={{ background: 'transparent', color: '#A27B5C',
                             border: '1px solid #A27B5C', borderRadius: 6, padding: '6px 12px',
                             fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <NoSymbolIcon style={{ width: 14, height: 14, display: 'inline', marginRight: 4 }} />
              Turn off
            </button>
          </div>
        ))}

        {!rulesError && off.length > 0 && (
          <>
            <h2 style={{ color: NAVY, fontSize: 18, fontWeight: 600, margin: '32px 0 12px' }}>
              Off ({off.length})
            </h2>
            {off.map((r) => (
              <div key={r.id} style={{ background: '#fff', border: `1px solid ${SLATE}`,
                                       borderRadius: 8, padding: '10px 16px', marginBottom: 8,
                                       display: 'flex', justifyContent: 'space-between',
                                       alignItems: 'center', gap: 12 }}>
                <div style={{ color: SLATE, fontSize: 14 }}>
                  {r.scope === 'domain' ? `@${r.pattern}` : r.pattern} →{' '}
                  {r.label.replace('OVIS/', '')} · {r.status}
                </div>
                {r.status === 'disabled' && (
                  <button disabled={busy === r.id} onClick={() => reactivate(r)}
                          style={{ background: 'transparent', color: STEEL,
                                   border: `1px solid ${SLATE}`, borderRadius: 6,
                                   padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}>
                    Turn back on
                  </button>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

export default LabelRulesPage;
