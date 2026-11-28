import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import DealDetailsSlideout from '../DealDetailsSlideout';
import { todayET } from '../../lib/cashCalendar';
import { useCashData } from './useCashData';
import { CleanupScreen, GROUPS, GroupId } from './CleanupScreen';
import { OutsideCf, useCfFonts } from './cfTheme';

/** /admin/budget/forecast?tab=cleanup[&group=pastDue|missingDate|missingFee|noPayments] */
export default function CleanupTab() {
  useCfFonts();
  const { data, loading, error, reload } = useCashData();
  const [params] = useSearchParams();
  const [slideoutDealId, setSlideoutDealId] = useState<string | null>(null);
  const g = params.get('group');
  const initialGroup: GroupId | 'all' = GROUPS.some((x) => x.id === g) ? (g as GroupId) : 'all';

  if (loading && !data) return <div className="cf-muted p-2">Loading…</div>;
  if (error) return <div className="cf-msg err">{error}</div>;
  if (!data) return null;
  return (
    <>
      <CleanupScreen data={data} today={todayET()} initialGroup={initialGroup} onOpenDeal={setSlideoutDealId} onChanged={reload} />
      <OutsideCf><DealDetailsSlideout dealId={slideoutDealId} isOpen={!!slideoutDealId} onClose={() => setSlideoutDealId(null)} onDealUpdated={reload} /></OutsideCf>
    </>
  );
}
