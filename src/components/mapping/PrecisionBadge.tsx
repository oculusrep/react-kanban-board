import { TIER_COLORS, type PrecisionBadge as Badge } from '../../services/placementPrecision';

interface Props {
  badge: Badge;
  /** True while the geocode behind the tier is still resolving. */
  loading?: boolean;
  /** `sm` for worklist rows, `md` for the slideout header. */
  size?: 'sm' | 'md';
  /** Hide the detail line (e.g. '2 parcels') where space is tight. */
  showDetail?: boolean;
}

/**
 * How well-located a record is, at a glance.
 *
 * The same badge appears on worklist rows and in the slideout header so the
 * queue can be triaged without opening every record: "County only" means don't
 * go hunting, read the hint and place it by hand.
 *
 * While the geocode is resolving it shows the tier it can already prove rather
 * than a spinner in place of the text — an unresolved lookup only ever makes a
 * record look WORSE than it is (it falls back to "County only"), so the dimmed
 * state says "this may improve", never "this is the answer".
 */
export default function PrecisionBadge({
  badge,
  loading = false,
  size = 'sm',
  showDetail = true,
}: Props) {
  const c = TIER_COLORS[badge.tier];
  const pad = size === 'md' ? 'px-2 py-0.5 text-xs' : 'px-1.5 py-0.5 text-[0.65rem]';

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border font-semibold whitespace-nowrap"
      style={{
        backgroundColor: c.bg,
        color: c.fg,
        borderColor: c.border,
        opacity: loading ? 0.55 : 1,
      }}
      title={loading ? `${badge.hint} (still checking the address…)` : badge.hint}
    >
      <span className={pad}>
        {badge.label}
        {showDetail && badge.detail && (
          <span className="font-normal" style={{ opacity: 0.8 }}> · {badge.detail}</span>
        )}
        {loading && <span className="font-normal"> · checking…</span>}
      </span>
    </span>
  );
}
