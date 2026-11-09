import { ReactNode, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useBrokerLiteAccess } from '../hooks/useBrokerLiteAccess';
import { supabase } from '../lib/supabaseClient';
import { RolePermissions } from '../types/permissions';

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F8FAFC' }}>
      <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: '#002147' }} />
    </div>
  );
}

function AccessDenied() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F8FAFC' }}>
      <div className="bg-white p-8 rounded-lg max-w-md text-center" style={{ border: '1px solid #8FA9C8' }}>
        <h2 className="text-2xl font-bold mb-2" style={{ color: '#002147' }}>Not available</h2>
        <p className="mb-4" style={{ color: '#4A6B94' }}>
          This area hasn't been turned on for your account.
        </p>
        <Link to="/mapping" style={{ color: '#4A6B94' }} className="underline">Back to the map</Link>
      </div>
    </div>
  );
}

/** Blocks a page for broker_lite unless the permission is explicitly on. */
export function BrokerLiteRoute({
  permission,
  children,
}: {
  permission: keyof RolePermissions;
  children: ReactNode;
}) {
  const { loading, canAccess } = useBrokerLiteAccess();
  if (loading) return <Spinner />;
  return canAccess(permission) ? <>{children}</> : <AccessDenied />;
}

/** Site submit page: RLS returns the row only if this user may see it. */
export function SiteSubmitDetailRoute({ children }: { children: ReactNode }) {
  const { siteSubmitId } = useParams();
  const { loading, seesAllSiteSubmits } = useBrokerLiteAccess();
  const [found, setFound] = useState<boolean | null>(null);
  const needsLookup = !loading && !seesAllSiteSubmits && !!siteSubmitId && siteSubmitId !== 'new';

  useEffect(() => {
    if (!needsLookup) return;
    let cancelled = false;
    supabase
      .from('site_submit')
      .select('id')
      .eq('id', siteSubmitId!)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setFound(!!data);
      });
    return () => {
      cancelled = true;
    };
  }, [needsLookup, siteSubmitId]);

  if (loading) return <Spinner />;
  if (seesAllSiteSubmits) return <>{children}</>;
  if (!needsLookup) return <AccessDenied />;
  if (found === null) return <Spinner />;
  return found ? <>{children}</> : <AccessDenied />;
}
