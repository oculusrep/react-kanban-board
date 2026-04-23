import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import BrandsTab from './merchants/BrandsTab';
import CategoriesTab from './merchants/CategoriesTab';
import ClosureAlertsTab from './merchants/ClosureAlertsTab';
import IngestionTab from './merchants/IngestionTab';
import { BRAND_COLOR_DARK, BRAND_COLOR_LIGHT } from './merchants/shared';

// Spec: docs/MERCHANTS_LAYER_SPEC.md §7
// Roadmap: docs/MERCHANTS_ADMIN_ROADMAP.md

type TabKey = 'brands' | 'categories' | 'ingest' | 'alerts';

interface TabDef {
  key: TabKey;
  label: string;
  subtitle: string;
}

const TABS: TabDef[] = [
  {
    key: 'brands',
    label: 'Brands',
    subtitle:
      "Review and correct logos for every merchant brand. Edit a brand's Brandfetch domain to change what logo shows on the map.",
  },
  {
    key: 'categories',
    label: 'Categories',
    subtitle:
      'Admin-managed taxonomy that groups brands in the Merchants map drawer. Controls per-category refresh cadence against Google Places.',
  },
  {
    key: 'ingest',
    label: 'Ingestion',
    subtitle:
      "Populate the merchant map layer with Google Places locations. Run ingestion for all brands, or refresh specific ones.",
  },
  {
    key: 'alerts',
    label: 'Closure Alerts',
    subtitle:
      "Notifications raised when a merchant location's Google business_status changes. Acknowledge to mark reviewed.",
  },
];

const DEFAULT_TAB: TabKey = 'brands';

function parseTab(value: string | null): TabKey {
  if (value === 'brands' || value === 'categories' || value === 'ingest' || value === 'alerts')
    return value;
  return DEFAULT_TAB;
}

export default function MerchantAdminPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = parseTab(searchParams.get('tab'));
  const activeDef = TABS.find((t) => t.key === activeTab) ?? TABS[0];

  useEffect(() => {
    document.title = `Admin · Merchants · ${activeDef.label} | OVIS`;
  }, [activeDef.label]);

  const switchTab = (key: TabKey) => {
    const next = new URLSearchParams(searchParams);
    if (key === DEFAULT_TAB) next.delete('tab');
    else next.set('tab', key);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold" style={{ color: BRAND_COLOR_DARK }}>
            Merchants
          </h1>
          <p className="text-gray-600 mt-1 text-sm max-w-2xl">{activeDef.subtitle}</p>
        </div>

        <div
          className="flex border-b mb-6"
          style={{ borderColor: BRAND_COLOR_LIGHT }}
          role="tablist"
        >
          {TABS.map((tab) => {
            const isActive = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                role="tab"
                aria-selected={isActive}
                onClick={() => switchTab(tab.key)}
                className="px-4 py-2 text-sm font-medium transition-colors relative -mb-px"
                style={{
                  color: isActive ? BRAND_COLOR_DARK : BRAND_COLOR_LIGHT,
                  borderBottom: isActive ? `2px solid ${BRAND_COLOR_DARK}` : '2px solid transparent',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div>
          {activeTab === 'brands' && <BrandsTab />}
          {activeTab === 'categories' && <CategoriesTab />}
          {activeTab === 'ingest' && <IngestionTab />}
          {activeTab === 'alerts' && <ClosureAlertsTab />}
        </div>
      </div>
    </div>
  );
}
