/**
 * Legal Test Page — minimal end-to-end driver for the Legal Orchestration
 * pipeline. Lets Mike upload a landlord-redlined .docx and walk it through:
 *
 *   1. Pick a deal
 *   2. Upload the .docx (creates an attachment row + Storage object)
 *   3. Create or reuse a legal_loi_session for that deal
 *   4. Invoke `legal-ingest-loi`         → creates a legal_loi_round + decisions
 *   5. Invoke `legal-decide-positions`   → AI picks positions for each decision
 *   6. Show the resulting decisions in a table
 *
 * This is a TEST page, intentionally scrappy. The proper Legal module UI
 * (deal-page tab + dedicated review screen) is Week 5-6 of the V1 roadmap.
 */

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';

const STARBUCKS_CLIENT_ID = '39933b5b-3e8c-438d-be2f-e48cd9228c00';

interface DealOption {
  id: string;
  deal_name: string;
}

interface LegalLoiSession {
  id: string;
  client_id: string;
  deal_id: string | null;
  status: string;
  created_at: string;
}

interface LegalLoiRound {
  id: string;
  round_num: number;
  direction: 'inbound' | 'outbound';
  attachment_id: string | null;
  created_at: string;
  notes: string | null;
}

interface LegalLoiDecision {
  id: string;
  round_id: string;
  clause_type_id: string | null;
  doc_anchor: string | null;
  landlord_text_excerpt: string | null;
  ai_position_rank: number | null;
  ai_rationale: string | null;
  ai_confidence: number | null;
  ai_model: string | null;
  final_position_rank: number | null;
  final_text: string | null;
  final_comment_text: string | null;
  status: string;
  severity: string | null;
  clause_type?: { name: string; display_name: string };
}

export default function LegalTestPage() {
  const { user } = useAuth();
  const [deals, setDeals] = useState<DealOption[]>([]);
  const [selectedDealId, setSelectedDealId] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [session, setSession] = useState<LegalLoiSession | null>(null);
  const [rounds, setRounds] = useState<LegalLoiRound[]>([]);
  const [decisions, setDecisions] = useState<LegalLoiDecision[]>([]);
  const [activeRoundId, setActiveRoundId] = useState<string | null>(null);
  const [counterDownloadUrl, setCounterDownloadUrl] = useState<string | null>(null);
  const [counterFileName, setCounterFileName] = useState<string | null>(null);

  const log = (line: string) =>
    setLogLines((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${line}`]);

  // -------------------------------------------------------------------------
  // Load Starbucks deals on mount
  // -------------------------------------------------------------------------
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('deal')
        .select('id, deal_name')
        .eq('client_id', STARBUCKS_CLIENT_ID)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) {
        setError(`Failed to load deals: ${error.message}`);
        return;
      }
      setDeals(data ?? []);
    })();
  }, []);

  // -------------------------------------------------------------------------
  // When a deal is selected, look up an existing session or null
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!selectedDealId) {
      setSession(null);
      setRounds([]);
      setDecisions([]);
      setActiveRoundId(null);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from('legal_loi_session')
        .select('id, client_id, deal_id, status, created_at')
        .eq('deal_id', selectedDealId)
        .eq('client_id', STARBUCKS_CLIENT_ID)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        setError(`Failed to load session: ${error.message}`);
        return;
      }
      setSession(data ?? null);
      if (data) await refreshRounds(data.id);
    })();
  }, [selectedDealId]);

  async function refreshRounds(sessionId: string) {
    const { data, error } = await supabase
      .from('legal_loi_round')
      .select('id, round_num, direction, attachment_id, created_at, notes')
      .eq('session_id', sessionId)
      .order('round_num', { ascending: true });
    if (error) {
      setError(`Failed to load rounds: ${error.message}`);
      return;
    }
    setRounds(data ?? []);
    if (data && data.length > 0 && !activeRoundId) {
      setActiveRoundId(data[data.length - 1].id);
    }
  }

  async function refreshDecisions(roundId: string) {
    const { data, error } = await supabase
      .from('legal_loi_decision')
      .select(
        'id, round_id, clause_type_id, doc_anchor, landlord_text_excerpt, ai_position_rank, ai_rationale, ai_confidence, ai_model, final_position_rank, final_text, final_comment_text, status, severity, clause_type:clause_type_id(name, display_name)',
      )
      .eq('round_id', roundId)
      .order('doc_anchor');
    if (error) {
      setError(`Failed to load decisions: ${error.message}`);
      return;
    }
    setDecisions((data as unknown as LegalLoiDecision[]) ?? []);
  }

  useEffect(() => {
    if (activeRoundId) refreshDecisions(activeRoundId);
  }, [activeRoundId]);

  // -------------------------------------------------------------------------
  // Step 1: Upload .docx -> Storage + attachment row
  // -------------------------------------------------------------------------
  async function uploadAndIngest() {
    if (!file || !selectedDealId) {
      setError('Pick a deal and a .docx file first');
      return;
    }
    setBusy('Uploading + ingesting');
    setError(null);

    try {
      // Ensure session exists.
      let sessionId = session?.id;
      if (!sessionId) {
        log('Creating legal_loi_session…');
        const { data, error } = await supabase
          .from('legal_loi_session')
          .insert({
            client_id: STARBUCKS_CLIENT_ID,
            deal_id: selectedDealId,
            status: 'in_progress',
            created_by: user?.id,
            title: `LOI for ${deals.find((d) => d.id === selectedDealId)?.deal_name ?? 'deal'}`,
          })
          .select('id, client_id, deal_id, status, created_at')
          .single();
        if (error) throw error;
        sessionId = data.id;
        setSession(data);
        log(`Session ${sessionId} created.`);
      } else {
        log(`Reusing session ${sessionId}.`);
      }

      // Upload to Storage.
      const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, '_');
      const storagePath = `legal/${selectedDealId}/${sessionId}/${Date.now()}-${safeName}`;
      log(`Uploading to assets/${storagePath} (${file.size} bytes)…`);
      const { error: upErr } = await supabase.storage
        .from('assets')
        .upload(storagePath, file, { upsert: false, contentType: file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage.from('assets').getPublicUrl(storagePath);
      const fileUrl = urlData.publicUrl;
      log(`Stored at ${fileUrl}`);

      // Create attachment row tied to the deal.
      const { data: att, error: attErr } = await supabase
        .from('attachment')
        .insert({
          deal_id: selectedDealId,
          file_url: fileUrl,
          file_name: file.name,
          uploaded_by: user?.id,
        })
        .select('id')
        .single();
      if (attErr) throw attErr;
      log(`attachment row ${att.id} created.`);

      // Find the latest outbound round (if any) to use as prior_round_id.
      const { data: priorOutbound } = await supabase
        .from('legal_loi_round')
        .select('id')
        .eq('session_id', sessionId)
        .eq('direction', 'outbound')
        .order('round_num', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Invoke ingest function.
      log('Invoking legal-ingest-loi…');
      const { data: ingestRes, error: ingestErr } = await supabase.functions.invoke(
        'legal-ingest-loi',
        {
          body: {
            session_id: sessionId,
            attachment_id: att.id,
            prior_round_id: priorOutbound?.id ?? undefined,
          },
        },
      );
      if (ingestErr) throw new Error(`ingest error: ${ingestErr.message}`);
      log(`Ingest complete: ${JSON.stringify(ingestRes)}`);

      // Refresh state.
      await refreshRounds(sessionId);
      // Use the ingest's reported round_id directly.
      // deno-lint-ignore no-explicit-any
      const newRoundId = (ingestRes as any)?.round_id as string | undefined;
      if (newRoundId) setActiveRoundId(newRoundId);
      setFile(null);
    } catch (err) {
      setError((err as Error).message);
      log(`ERROR: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  // -------------------------------------------------------------------------
  // Step 3: Generate counter-redline .docx
  // -------------------------------------------------------------------------
  async function runGenerateCounter() {
    if (!activeRoundId) {
      setError('No active round');
      return;
    }
    setBusy('Generating counter-redline');
    setError(null);
    setCounterDownloadUrl(null);
    setCounterFileName(null);
    try {
      log(`Invoking legal-generate-counter for round ${activeRoundId}…`);
      const { data, error } = await supabase.functions.invoke('legal-generate-counter', {
        body: { round_id: activeRoundId },
      });
      if (error) throw new Error(`generate-counter error: ${error.message}`);
      log(`Counter-redline generated: ${JSON.stringify(data)}`);
      // deno-lint-ignore no-explicit-any
      const d = data as any;
      if (d?.download_url) {
        setCounterDownloadUrl(d.download_url);
        setCounterFileName(`Round ${rounds.find((r) => r.id === activeRoundId)?.round_num ?? '?'} counter.docx`);
      }
      if (session) await refreshRounds(session.id);
    } catch (err) {
      setError((err as Error).message);
      log(`ERROR: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  // -------------------------------------------------------------------------
  // Step 2: Run reasoning layer on the active round
  // -------------------------------------------------------------------------
  async function runDecidePositions() {
    if (!activeRoundId) {
      setError('No active round');
      return;
    }
    setBusy('Running reasoning layer');
    setError(null);
    try {
      log(`Invoking legal-decide-positions for round ${activeRoundId}…`);
      const { data, error } = await supabase.functions.invoke('legal-decide-positions', {
        body: { round_id: activeRoundId },
      });
      if (error) throw new Error(`decide-positions error: ${error.message}`);
      log(`Decisions complete: ${JSON.stringify(data)}`);
      await refreshDecisions(activeRoundId);
    } catch (err) {
      setError((err as Error).message);
      log(`ERROR: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  const groupedDecisions = useMemo(() => {
    const groups: Record<string, LegalLoiDecision[]> = {
      escalated: [],
      pending: [],
      auto_applied: [],
      silent_acceptance: [],
      reviewed: [],
    };
    for (const d of decisions) {
      (groups[d.status] ?? (groups[d.status] = [])).push(d);
    }
    return groups;
  }, [decisions]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="p-6 max-w-6xl mx-auto" style={{ color: '#002147' }}>
      <h1 className="text-2xl font-bold mb-2">Legal Orchestration — Test Driver</h1>
      <p className="text-sm mb-6" style={{ color: '#4A6B94' }}>
        Scrappy end-to-end driver for the inbound LOI pipeline. Pick a Starbucks deal, upload a
        landlord-redlined <code>.docx</code>, and walk it through ingest → reasoning. The proper UI
        (deal-page tab, full review screen) is Week 5-6.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left column — controls */}
        <div className="space-y-4">
          <section className="border rounded p-4" style={{ borderColor: '#8FA9C8' }}>
            <h2 className="font-semibold mb-3">Step 1 — Pick a deal</h2>
            <select
              className="w-full border rounded px-3 py-2"
              style={{ borderColor: '#8FA9C8' }}
              value={selectedDealId}
              onChange={(e) => setSelectedDealId(e.target.value)}
            >
              <option value="">Select a Starbucks deal…</option>
              {deals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.deal_name}
                </option>
              ))}
            </select>
            {session && (
              <div className="mt-2 text-xs" style={{ color: '#4A6B94' }}>
                Existing session: {session.id} ({session.status})
              </div>
            )}
          </section>

          <section className="border rounded p-4" style={{ borderColor: '#8FA9C8' }}>
            <h2 className="font-semibold mb-3">Step 2 — Upload landlord-redlined .docx</h2>
            <input
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full"
            />
            {file && (
              <div className="mt-2 text-xs" style={{ color: '#4A6B94' }}>
                {file.name} — {(file.size / 1024).toFixed(1)} KB
              </div>
            )}
            <button
              type="button"
              disabled={!file || !selectedDealId || busy !== null}
              onClick={uploadAndIngest}
              className="mt-3 px-4 py-2 rounded text-white disabled:opacity-50"
              style={{ backgroundColor: '#002147' }}
            >
              {busy === 'Uploading + ingesting' ? 'Uploading + ingesting…' : 'Upload + Ingest'}
            </button>
          </section>

          <section className="border rounded p-4" style={{ borderColor: '#8FA9C8' }}>
            <h2 className="font-semibold mb-3">Step 3 — Run reasoning layer</h2>
            <p className="text-sm mb-3" style={{ color: '#4A6B94' }}>
              For each pending decision in the active round, asks Claude to pick a position rank
              from the playbook. Sonnet 4.6 default; Opus 4.7 escalation on HIGH-stakes clauses.
            </p>
            <div className="flex items-center gap-2 mb-3">
              <label className="text-sm">Active round:</label>
              <select
                className="border rounded px-2 py-1 text-sm"
                style={{ borderColor: '#8FA9C8' }}
                value={activeRoundId ?? ''}
                onChange={(e) => setActiveRoundId(e.target.value || null)}
              >
                <option value="">(none)</option>
                {rounds.map((r) => (
                  <option key={r.id} value={r.id}>
                    Round {r.round_num} — {r.direction}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={!activeRoundId || busy !== null}
              onClick={runDecidePositions}
              className="px-4 py-2 rounded text-white disabled:opacity-50"
              style={{ backgroundColor: '#4A6B94' }}
            >
              {busy === 'Running reasoning layer' ? 'Running…' : 'Run Decide Positions'}
            </button>
          </section>

          <section className="border rounded p-4" style={{ borderColor: '#8FA9C8' }}>
            <h2 className="font-semibold mb-3">Step 4 — Generate counter-redline</h2>
            <p className="text-sm mb-3" style={{ color: '#4A6B94' }}>
              Builds a counter-redline .docx with Mike's preferred clause text spliced in as native
              Word tracked insertions, plus comments anchored on each affected heading. V1 is
              append-only — landlord's existing text stays put for manual finalization in Word.
            </p>
            <button
              type="button"
              disabled={!activeRoundId || busy !== null}
              onClick={runGenerateCounter}
              className="px-4 py-2 rounded text-white disabled:opacity-50"
              style={{ backgroundColor: '#002147' }}
            >
              {busy === 'Generating counter-redline' ? 'Generating…' : 'Generate Counter-Redline'}
            </button>
            {counterDownloadUrl && (
              <div className="mt-3">
                <a
                  href={counterDownloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm underline"
                  style={{ color: '#002147' }}
                  download={counterFileName ?? 'counter.docx'}
                >
                  ⬇ Download {counterFileName ?? 'counter.docx'}
                </a>
              </div>
            )}
          </section>

          <section className="border rounded p-4" style={{ borderColor: '#8FA9C8' }}>
            <h2 className="font-semibold mb-3">Activity log</h2>
            <pre className="text-xs whitespace-pre-wrap" style={{ color: '#4A6B94', maxHeight: '20rem', overflowY: 'auto' }}>
              {logLines.length === 0 ? 'No activity yet.' : logLines.join('\n')}
            </pre>
          </section>

          {error && (
            <div className="border rounded p-3 text-sm" style={{ borderColor: '#A27B5C', color: '#A27B5C' }}>
              {error}
            </div>
          )}
        </div>

        {/* Right column — decisions */}
        <div>
          <section className="border rounded p-4" style={{ borderColor: '#8FA9C8' }}>
            <h2 className="font-semibold mb-3">
              Decisions {activeRoundId && `(round ${rounds.find((r) => r.id === activeRoundId)?.round_num ?? '?'})`}
            </h2>
            {decisions.length === 0 && (
              <div className="text-sm" style={{ color: '#4A6B94' }}>
                No decisions on this round yet.
              </div>
            )}
            {(['escalated', 'pending', 'auto_applied', 'silent_acceptance', 'reviewed'] as const).map((status) => {
              const list = groupedDecisions[status] ?? [];
              if (list.length === 0) return null;
              return (
                <div key={status} className="mb-4">
                  <div className="text-xs font-bold uppercase mb-2" style={{ color: '#002147' }}>
                    {statusLabel(status)} ({list.length})
                  </div>
                  <ul className="space-y-2">
                    {list.map((d) => (
                      <li key={d.id} className="border rounded p-2 text-sm" style={{ borderColor: '#8FA9C8' }}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold">
                            {d.clause_type?.display_name ?? '(unmapped)'}
                          </span>
                          {d.ai_position_rank !== null && (
                            <span
                              className="px-1.5 py-0.5 text-xs rounded"
                              style={{ backgroundColor: '#002147', color: 'white' }}
                            >
                              P{d.ai_position_rank}
                            </span>
                          )}
                          {d.ai_confidence !== null && (
                            <span className="text-xs" style={{ color: '#4A6B94' }}>
                              conf {d.ai_confidence.toFixed(2)}
                            </span>
                          )}
                          {d.ai_model && (
                            <span className="text-xs" style={{ color: '#4A6B94' }}>
                              {d.ai_model.replace('claude-', '')}
                            </span>
                          )}
                        </div>
                        {d.ai_rationale && (
                          <div className="text-xs mb-1" style={{ color: '#4A6B94' }}>
                            <strong>Why:</strong> {d.ai_rationale}
                          </div>
                        )}
                        {d.landlord_text_excerpt && (
                          <details>
                            <summary className="text-xs cursor-pointer" style={{ color: '#4A6B94' }}>
                              Landlord text excerpt
                            </summary>
                            <pre className="text-xs whitespace-pre-wrap mt-1 p-2 rounded" style={{ backgroundColor: '#F8FAFC' }}>
                              {d.landlord_text_excerpt}
                            </pre>
                          </details>
                        )}
                        {d.final_text && (
                          <details>
                            <summary className="text-xs cursor-pointer" style={{ color: '#4A6B94' }}>
                              Proposed final text
                            </summary>
                            <pre className="text-xs whitespace-pre-wrap mt-1 p-2 rounded" style={{ backgroundColor: '#F8FAFC' }}>
                              {d.final_text}
                            </pre>
                          </details>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </section>
        </div>
      </div>
    </div>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case 'escalated':
      return '🚨 Escalated';
    case 'pending':
      return '⚠️ Needs Review';
    case 'auto_applied':
      return '✓ Auto-Applied';
    case 'silent_acceptance':
      return '⏸ Silent Acceptances';
    case 'reviewed':
      return '✓ Reviewed';
    default:
      return status;
  }
}
