import React, { useState } from 'react';
import { User } from '@supabase/supabase-js';
import { RestaurantWithTrends, PlacerRank } from '../layers/RestaurantLayer';
import { supabase } from '../../../lib/supabaseClient';

interface RestaurantPopupProps {
  restaurant: RestaurantWithTrends;
  user: User | null;
  onViewDetails?: () => void;
  onClose: () => void;
  onPlacerRankAdded?: (rank: PlacerRank) => void;
}

const RestaurantPopup: React.FC<RestaurantPopupProps> = ({
  restaurant,
  user,
  onViewDetails,
  onClose,
  onPlacerRankAdded
}) => {
  const [showRankForm, setShowRankForm] = useState(false);
  const [rankPosition, setRankPosition] = useState('');
  const [rankTotal, setRankTotal] = useState('');
  const [rankPercentage, setRankPercentage] = useState('');
  const [rankDate, setRankDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [placerUrl, setPlacerUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [currentRank, setCurrentRank] = useState<PlacerRank | null | undefined>(restaurant.latest_placer_rank);
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [editUrl, setEditUrl] = useState(currentRank?.placer_url || '');

  // Format sales for display
  const formatSales = (salesK: number | null) => {
    if (salesK === null || salesK === undefined) return 'N/A';
    const sales = salesK * 1000;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(sales);
  };

  const latestTrend = restaurant.latest_trend;

  // Format ZIP code without decimal
  const formatZip = (zip: string | null) => {
    if (!zip) return '';
    return zip.split('.')[0];
  };

  // Format date for display (MM/DD/YYYY)
  const formatDate = (dateStr: string) => {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[1]}/${parts[2]}/${parts[0]}`;
    }
    return dateStr;
  };

  const handleSaveRank = async () => {
    if (!user) {
      setSaveError('You must be logged in');
      return;
    }

    const pos = parseInt(rankPosition);
    const total = parseInt(rankTotal);
    const pct = parseFloat(rankPercentage);

    if (isNaN(pos) || isNaN(total) || isNaN(pct)) {
      setSaveError('Please fill in all rank fields');
      return;
    }

    if (pos < 0 || total <= 0) {
      setSaveError('Invalid rank values');
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const { data, error } = await supabase
        .from('restaurant_placer_rank')
        .insert({
          store_no: restaurant.store_no,
          rank_position: pos,
          rank_total: total,
          rank_percentage: pct,
          rank_date: rankDate,
          placer_url: placerUrl.trim() || null,
          entered_by: user.id
        })
        .select()
        .single();

      if (error) throw error;

      // Update local state with new rank
      setCurrentRank(data);
      setEditUrl(data.placer_url || '');
      setShowRankForm(false);
      setRankPosition('');
      setRankTotal('');
      setRankPercentage('');
      setPlacerUrl('');

      if (onPlacerRankAdded) {
        onPlacerRankAdded(data);
      }
    } catch (err: any) {
      console.error('Error saving placer rank:', err);
      setSaveError(err.message || 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 w-72">
      {/* Header */}
      <div className="bg-red-600 text-white px-3 py-2 rounded-t-lg flex items-center justify-between">
        <h3 className="font-semibold text-sm truncate capitalize">
          {restaurant.chain?.toLowerCase() || 'Restaurant'}
        </h3>
        <button
          onClick={onClose}
          className="text-white hover:text-red-100 ml-2 flex-shrink-0"
          aria-label="Close"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="px-3 py-2 space-y-1">
        {/* Address - small gray text, no label */}
        {restaurant.geoaddress && (
          <div className="text-xs text-gray-500 capitalize">
            {restaurant.geoaddress.toLowerCase()}
          </div>
        )}

        {/* City, State, ZIP - small gray text */}
        {(restaurant.geocity || restaurant.geostate) && (
          <div className="text-xs text-gray-500 capitalize">
            {restaurant.geocity && <span>{restaurant.geocity.toLowerCase()}</span>}
            {restaurant.geocity && restaurant.geostate && <span>, </span>}
            {restaurant.geostate && <span>{restaurant.geostate}</span>}
            {restaurant.geozip && <span> {formatZip(restaurant.geozip)}</span>}
          </div>
        )}

        {/* Latest Sales Data - Large and Bold */}
        {latestTrend && (
          <>
            <div className="border-t border-gray-200 pt-2 mt-2" />
            <div className="text-center">
              <div className="text-xs text-gray-600 mb-1">{latestTrend.year} Sales</div>
              <div className="text-lg font-bold text-gray-900">
                {formatSales(latestTrend.curr_annual_sls_k)}
              </div>
            </div>
            {latestTrend.curr_natl_grade && (
              <div className="text-xs text-gray-700 text-center mt-1">
                <span className="font-medium">Grade:</span> {latestTrend.curr_natl_grade}
              </div>
            )}
          </>
        )}

        {/* Placer Rank Section */}
        <div className="border-t border-gray-200 pt-2 mt-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-700">Placer Rank</span>
            <button
              onClick={() => setShowRankForm(!showRankForm)}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              {showRankForm ? 'Cancel' : currentRank ? 'Add New' : 'Add'}
            </button>
          </div>

          {/* Display current rank */}
          {currentRank && !showRankForm && (
            <div className="bg-gray-50 rounded px-2 py-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-900">
                  {currentRank.rank_position}/{currentRank.rank_total}
                </span>
                <span className="text-sm font-semibold text-[#4A6B94]">
                  {currentRank.rank_percentage}%
                </span>
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {formatDate(currentRank.rank_date)}
              </div>
              {/* Placer URL */}
              <div className="mt-1">
                {isEditingUrl ? (
                  <div className="flex gap-1">
                    <input
                      type="url"
                      value={editUrl}
                      onChange={(e) => setEditUrl(e.target.value)}
                      placeholder="https://placer.ai/..."
                      className="flex-1 text-xs border border-gray-300 rounded px-1.5 py-0.5 focus:outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={async () => {
                        const { data, error } = await supabase
                          .from('restaurant_placer_rank')
                          .update({ placer_url: editUrl.trim() || null })
                          .eq('id', currentRank.id)
                          .select()
                          .single();
                        if (!error && data) {
                          setCurrentRank(data);
                          setIsEditingUrl(false);
                        }
                      }}
                      className="text-xs text-green-600 hover:text-green-800 font-medium"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => { setEditUrl(currentRank.placer_url || ''); setIsEditingUrl(false); }}
                      className="text-xs text-gray-400 hover:text-gray-600"
                    >
                      ✕
                    </button>
                  </div>
                ) : currentRank.placer_url ? (
                  <div className="flex items-center gap-1">
                    <a
                      href={currentRank.placer_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:text-blue-800 underline truncate"
                    >
                      Open in Placer
                    </a>
                    <button
                      onClick={() => setIsEditingUrl(true)}
                      className="text-xs text-gray-400 hover:text-gray-600 flex-shrink-0"
                    >
                      ✎
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsEditingUrl(true)}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    + Add Placer URL
                  </button>
                )}
              </div>
            </div>
          )}

          {/* No rank yet */}
          {!currentRank && !showRankForm && (
            <div className="text-xs text-gray-400 italic">No rank entered</div>
          )}

          {/* Add rank form */}
          {showRankForm && (
            <div className="space-y-1.5 mt-1">
              <div className="flex gap-1.5">
                <div className="flex-1">
                  <label className="text-xs text-gray-500 block">Rank #</label>
                  <input
                    type="number"
                    value={rankPosition}
                    onChange={(e) => setRankPosition(e.target.value)}
                    placeholder="45"
                    className="w-full text-xs border border-gray-300 rounded px-1.5 py-1 focus:outline-none focus:border-blue-500"
                    min="0"
                  />
                </div>
                <div className="flex items-end pb-1 text-gray-400 text-xs">/</div>
                <div className="flex-1">
                  <label className="text-xs text-gray-500 block">Total</label>
                  <input
                    type="number"
                    value={rankTotal}
                    onChange={(e) => setRankTotal(e.target.value)}
                    placeholder="300"
                    className="w-full text-xs border border-gray-300 rounded px-1.5 py-1 focus:outline-none focus:border-blue-500"
                    min="1"
                  />
                </div>
              </div>
              <div className="flex gap-1.5">
                <div className="flex-1">
                  <label className="text-xs text-gray-500 block">Percentage</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={rankPercentage}
                      onChange={(e) => setRankPercentage(e.target.value)}
                      placeholder="85.5"
                      step="0.1"
                      className="w-full text-xs border border-gray-300 rounded px-1.5 py-1 pr-5 focus:outline-none focus:border-blue-500"
                      min="0"
                      max="100"
                    />
                    <span className="absolute right-1.5 top-1 text-xs text-gray-400">%</span>
                  </div>
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-500 block">Date</label>
                  <input
                    type="date"
                    value={rankDate}
                    onChange={(e) => setRankDate(e.target.value)}
                    className="w-full text-xs border border-gray-300 rounded px-1.5 py-1 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 block">Placer URL (optional)</label>
                <input
                  type="url"
                  value={placerUrl}
                  onChange={(e) => setPlacerUrl(e.target.value)}
                  placeholder="https://placer.ai/..."
                  className="w-full text-xs border border-gray-300 rounded px-1.5 py-1 focus:outline-none focus:border-blue-500"
                />
              </div>
              {saveError && (
                <div className="text-xs text-red-600">{saveError}</div>
              )}
              <button
                onClick={handleSaveRank}
                disabled={isSaving}
                className="w-full bg-[#002147] hover:bg-[#003366] text-white font-medium py-1 px-2 rounded text-xs transition-colors disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save Rank'}
              </button>
            </div>
          )}
        </div>

        {/* Year Built - at bottom in gray */}
        {restaurant.yr_built && (
          <div className="text-xs text-gray-500 text-center mt-2">
            Built {restaurant.yr_built}
          </div>
        )}
      </div>

      {/* View Details Button */}
      {onViewDetails && (
        <div className="px-3 pb-2 pt-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewDetails();
            }}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-1.5 px-3 rounded text-xs transition-colors"
          >
            View Trend Details
          </button>
        </div>
      )}
    </div>
  );
};

export default RestaurantPopup;
