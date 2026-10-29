import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { isInternalRole } from '../../utils/internalRoles';
import { splitPersonName } from '../../utils/personName';
import { parsePastedSignature, type PastedSignatureResult } from '../knowledgeCapture/useKnowledgeCapture';

// "Paste signature" inside ContactFormModal: paste a signature block, the form
// fills. Extraction and verification are Intel's (ovis-knowledge-capture
// parse_signature): only details literally in the pasted text, never Oculus
// details. Nothing is saved here — the user reviews and saves as normal.
// Docs: docs/CONTACT_PASTE_SIGNATURE_PLAN.md

const COLORS = {
  midnight: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
  white: '#FFFFFF',
  bg: '#F8FAFC',
  terracotta: '#A27B5C',
} as const;

/** Form field ← parsed field, with the label shown in the "filled/skipped" note. */
export const SIGNATURE_FIELD_MAP = [
  { field: 'first_name', label: 'First name' },
  { field: 'last_name', label: 'Last name' },
  { field: 'email', label: 'Email' },
  { field: 'phone', label: 'Phone' },
  { field: 'mobile_phone', label: 'Mobile' },
  { field: 'title', label: 'Title' },
  { field: 'company', label: 'Company' },
  { field: 'mailing_street', label: 'Street', from: 'address' },
  { field: 'mailing_city', label: 'City', from: 'city' },
  { field: 'mailing_state', label: 'State', from: 'state' },
  { field: 'mailing_zip', label: 'ZIP', from: 'zip' },
] as const;

export type SignatureFormField = (typeof SIGNATURE_FIELD_MAP)[number]['field'];
export type SignatureValues = Partial<Record<SignatureFormField, string>>;

/** The parse result as form-field values (name split into first/last). */
export function signatureValues(res: Extract<PastedSignatureResult, { result: 'parsed' }>): SignatureValues {
  const out: SignatureValues = {};
  if (res.name) {
    const { first_name, last_name } = splitPersonName(res.name);
    if (first_name) out.first_name = first_name;
    if (last_name) out.last_name = last_name;
  }
  const details = res.details as Record<string, string | undefined>;
  for (const m of SIGNATURE_FIELD_MAP) {
    if (m.field === 'first_name' || m.field === 'last_name') continue;
    const value = details['from' in m ? m.from : m.field];
    if (value && value.trim()) out[m.field] = value.trim();
  }
  return out;
}

/**
 * Apply found values to the form. Create: every found field is written.
 * Edit: only fields that are empty now — existing data is never overwritten,
 * and those fields are reported as skipped.
 */
export function applySignature<T extends object>(
  form: T,
  values: SignatureValues,
  mode: 'create' | 'edit',
): { next: T; filled: string[]; skipped: string[] } {
  const next: Record<string, unknown> = { ...(form as Record<string, unknown>) };
  const filled: string[] = [];
  const skipped: string[] = [];
  for (const m of SIGNATURE_FIELD_MAP) {
    const value = values[m.field];
    if (!value) continue;
    const current = (form as Record<string, unknown>)[m.field];
    const hasData = typeof current === 'string' ? current.trim() !== '' : current != null;
    if (mode === 'edit' && hasData) {
      skipped.push(m.label);
    } else {
      next[m.field] = value;
      filled.push(m.label);
    }
  }
  return { next: next as T, filled, skipped };
}

export function fillNote(filled: string[], skipped: string[]): string {
  const parts: string[] = [];
  parts.push(filled.length ? `Filled from signature: ${filled.join(', ')}.` : 'Nothing new to fill.');
  if (skipped.length) parts.push(`Skipped (already had data): ${skipped.join(', ')}.`);
  if (filled.length) parts.push('Check before saving.');
  return parts.join(' ');
}

export const PasteSignatureBox: React.FC<{
  /** Applies the values to the form and reports what it did. */
  onFill: (values: SignatureValues) => { filled: string[]; skipped: string[] };
}> = ({ onFill }) => {
  const { userRole, isPortalUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; warn: boolean } | null>(null);

  // Internal users only — the edge function enforces the same is_internal_user().
  if (!isInternalRole(userRole, isPortalUser)) return null;

  const fill = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await parsePastedSignature(text);
      if (res.result === 'multiple') {
        setNote({ text: "That looks like more than one person's signature, or a thread. Paste just one signature.", warn: true });
      } else if (res.result === 'nothing_found') {
        setNote({ text: "Couldn't find any contact details in that text.", warn: true });
      } else {
        const { filled, skipped } = onFill(signatureValues(res));
        setNote({ text: fillNote(filled, skipped), warn: filled.length === 0 });
        setText('');
        setOpen(false);
      }
    } catch (e) {
      setNote({ text: e instanceof Error ? e.message : 'Could not read that signature', warn: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md px-3 py-2" style={{ backgroundColor: COLORS.bg, border: `1px dashed ${COLORS.slate}` }}>
      {!open ? (
        <button
          type="button"
          onClick={() => { setOpen(true); setNote(null); }}
          className="text-xs font-medium underline"
          style={{ color: COLORS.steel }}
        >
          Paste signature to fill the form
        </button>
      ) : (
        <>
          <label className="block text-[11px] font-semibold uppercase tracking-wide" style={{ color: COLORS.steel }}>
            Paste signature
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            autoFocus
            placeholder={'Jane Smith\nVice President\nAcme Realty\n404-555-0100\njane@acmerealty.com'}
            className="mt-1 w-full resize-y rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1"
            style={{ border: `1px solid ${COLORS.slate}`, color: COLORS.midnight, backgroundColor: COLORS.white }}
          />
          <div className="mt-1.5 flex items-center gap-2">
            <button
              type="button"
              onClick={fill}
              disabled={busy || !text.trim()}
              className="rounded px-3 py-1 text-xs font-semibold disabled:opacity-50"
              style={{ backgroundColor: COLORS.midnight, color: COLORS.white }}
            >
              {busy ? 'Reading…' : 'Fill form'}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setText(''); }}
              className="text-xs underline"
              style={{ color: COLORS.slate }}
            >
              Cancel
            </button>
            <span className="ml-auto text-[10px]" style={{ color: COLORS.slate }}>
              Only details in the text are used
            </span>
          </div>
        </>
      )}
      {note && (
        <p className="mt-1.5 text-xs" style={{ color: note.warn ? COLORS.terracotta : COLORS.midnight }}>
          {note.text}
        </p>
      )}
    </div>
  );
};
