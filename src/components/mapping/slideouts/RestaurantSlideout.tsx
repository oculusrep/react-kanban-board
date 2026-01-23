import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import SalesTrendChart from '../../charts/SalesTrendChart';

interface RestaurantTrend {
  trend_id: string;
  store_no: string;
  year: number;
  curr_natl_grade: string | null;
  curr_mkt_grade: string | null;
  curr_annual_sls_k: number | null;
}

interface Restaurant {
  store_no: string;
  chain?: string | null;
  geoaddress?: string | null;
  geocity?: string | null;
  geostate?: string | null;
  geozip?: string | null;
  yr_built?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  verified_latitude?: number | null;
  verified_longitude?: number | null;
  trends?: RestaurantTrend[];
}

interface RestaurantSlideoutProps {
  restaurant: Restaurant;
  onClose: () => void;
}

/**
 * Lightweight slideout component specifically for displaying restaurant details.
 * Separated from the main PinDetailsSlideout to avoid importing unnecessary dependencies
 * that cause bundling conflicts with Google Maps.
 */
const RestaurantSlideout: React.FC<RestaurantSlideoutProps> = ({ restaurant, onClose }) => {
  const [fullTrends, setFullTrends] = useState<RestaurantTrend[]>([]);
  const [loadingTrends, setLoadingTrends] = useState(false);

  // Load full trend history for restaurants
  useEffect(() => {
    // Initialize with existing trends
    if (restaurant.trends && restaurant.trends.length > 0) {
      setFullTrends(restaurant.trends);
    }

    // If we only have one trend, fetch the full history
    if (restaurant.trends && restaurant.trends.length === 1) {
      const loadFullTrends = async () => {
        setLoadingTrends(true);
        try {
          const { data: allTrends, error } = await supabase
            .from('restaurant_trend')
            .select('trend_id, store_no, year, curr_natl_grade, curr_mkt_grade, curr_annual_sls_k')
            .eq('store_no', restaurant.store_no)
            .order('year', { ascending: false });

          if (error) {
            console.error('Error loading full trends:', error);
          } else if (allTrends && allTrends.length > 1) {
            console.log(`✅ Loaded ${allTrends.length} trend records for ${restaurant.store_no}`);
            // Deduplicate by year, keeping the most recent entry for each year
            const uniqueTrends = Array.from(
              new Map(allTrends.map(t => [t.year, t])).values()
            );
            setFullTrends(uniqueTrends);
          }
        } catch (err) {
          console.error('Failed to load full trends:', err);
        } finally {
          setLoadingTrends(false);
        }
      };

      loadFullTrends();
    }
  }, [restaurant.store_no, restaurant.trends?.length]);

  // Prepare chart data - deduplicate by year, sort by year ascending for the chart
  const trendsMap = new Map();
  fullTrends
    ?.filter(t => t.curr_annual_sls_k !== null && t.curr_annual_sls_k !== undefined)
    .forEach(trend => {
      // Keep only one entry per year (the first one we encounter, which is the most recent due to ordering)
      if (!trendsMap.has(trend.year)) {
        trendsMap.set(trend.year, trend);
      }
    });

  const chartData = Array.from(trendsMap.values())
    .sort((a, b) => a.year - b.year)
    .map(trend => ({
      year: trend.year.toString(),
      sales: trend.curr_annual_sls_k! * 1000, // Convert to actual dollars
      salesK: trend.curr_annual_sls_k!, // Keep K for display
    }));

  // Check if all sales values are the same (no variation)
  const hasVariation = chartData.length > 1 &&
    new Set(chartData.map(d => d.sales)).size > 1;

  // Format ZIP code without decimal
  const formatZip = (zip: string | null) => {
    if (!zip) return '';
    return zip.split('.')[0];
  };

  // Format sales value for display
  const formatSalesValue = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)} mil`;
    }
    return `$${(value / 1000).toFixed(0)}K`;
  };

  return (
    <div
      className="fixed top-0 right-0 h-full bg-white border-l border-gray-200 shadow-xl transition-all duration-300 z-40 flex flex-col w-[500px]"
      style={{
        top: '67px',
        height: 'calc(100vh - 67px - 20px)',
      }}
    >
      <div className="p-6 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 capitalize">
              {restaurant.chain?.toLowerCase() || 'Restaurant'}
            </h2>
            {restaurant.geoaddress && (
              <p className="text-sm text-gray-500 capitalize mt-1">
                {restaurant.geoaddress.toLowerCase()}, {restaurant.geocity?.toLowerCase()}, {restaurant.geostate} {formatZip(restaurant.geozip)}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Year Built - small text */}
        {restaurant.yr_built && (
          <div className="mb-4">
            <p className="text-xs text-gray-500">Built {restaurant.yr_built}</p>
          </div>
        )}

        {/* Sales Trend Chart */}
        {chartData.length > 1 && hasVariation && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center">
              <span className="bg-gradient-to-r from-red-500 to-orange-500 px-3 py-1 rounded-full">
                📈 Sales Performance
              </span>
            </h3>
            <SalesTrendChart data={chartData} formatSalesValue={formatSalesValue} />
          </div>
        )}

        {/* Sales Data Table */}
        {fullTrends && fullTrends.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              Sales History
              {loadingTrends && <span className="text-xs text-gray-500">(Loading...)</span>}
            </h3>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700">Year</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-700">Sales</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-700">Nat'l Grade</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-700">Mkt Grade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {fullTrends
                    .sort((a, b) => b.year - a.year) // Show most recent first in table
                    .map((trend) => (
                      <tr key={trend.trend_id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-900">{trend.year}</td>
                        <td className="px-3 py-2 text-center text-gray-900 font-medium">
                          {trend.curr_annual_sls_k
                            ? `$${(trend.curr_annual_sls_k * 1000).toLocaleString()}`
                            : 'N/A'}
                        </td>
                        <td className="px-3 py-2 text-center text-gray-700">
                          {trend.curr_natl_grade || '-'}
                        </td>
                        <td className="px-3 py-2 text-center text-gray-700">
                          {trend.curr_mkt_grade || '-'}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RestaurantSlideout;
