import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';

interface ValidationIssue {
  dealName: string;
  paymentSeq: number;
  paymentAmount: number;
  paymentAGCI: number;
  isOverride: boolean;
  brokerName: string;
  dealCategories: {
    orig: number;
    site: number;
    deal: number;
  };
  brokerSplits: {
    orig: number;
    site: number;
    deal: number;
  };
  current: {
    orig: number;
    site: number;
    deal: number;
    total: number;
  };
  expected: {
    orig: number;
    site: number;
    deal: number;
    total: number;
  };
  salesforce: {
    orig: number | null;
    site: number | null;
    deal: number | null;
  };
  difference: number;
  sfMatch: boolean | null;
}

interface ValidationSummary {
  totalSplits: number;
  correctSplits: number;
  incorrectSplits: number;
  totalDifference: number;
  salesforceMatches: number;
  salesforceMismatches: number;
}

const SplitValidationTab: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<ValidationSummary | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [showOnlyIssues, setShowOnlyIssues] = useState(true);

  useEffect(() => {
    runValidation();
  }, []);

  const runValidation = async () => {
    setLoading(true);
    try {
      // Get all deals with payments
      const { data: deals } = await supabase
        .from('deal')
        .select('id, deal_name, origination_percent, site_percent, deal_percent')
        .order('deal_name');

      if (!deals) return;

      let totalSplits = 0;
      let totalMismatches = 0;
      let totalSalesforceMatches = 0;
      let totalSalesforceMismatches = 0;
      let totalDifference = 0;
      const allIssues: ValidationIssue[] = [];

      for (const deal of deals) {
        // Get payments for this deal
        const { data: payments } = await supabase
          .from('payment')
          .select('id, payment_sequence, payment_amount, agci, amount_override')
          .eq('deal_id', deal.id)
          .order('payment_sequence');

        if (!payments || payments.length === 0) continue;

        for (const payment of payments) {
          // Get payment splits
          const { data: splits } = await supabase
            .from('payment_split')
            .select(`
              *,
              broker:broker_id(name)
            `)
            .eq('payment_id', payment.id);

          if (!splits || splits.length === 0) continue;

          for (const split of splits) {
            totalSplits++;

            // Calculate expected values based on AGCI formula
            const paymentOrig = (deal.origination_percent / 100) * payment.agci;
            const paymentSite = (deal.site_percent / 100) * payment.agci;
            const paymentDeal = (deal.deal_percent / 100) * payment.agci;

            const expectedOrig = paymentOrig * (split.split_origination_percent / 100);
            const expectedSite = paymentSite * (split.split_site_percent / 100);
            const expectedDeal = paymentDeal * (split.split_deal_percent / 100);
            const expectedTotal = expectedOrig + expectedSite + expectedDeal;

            // Parse Salesforce payment info if available
            let sfOrig = null, sfSite = null, sfDeal = null;
            if (split.sf_payment_info) {
              const origMatch = split.sf_payment_info.match(/Origination:\s*\$?([\d,]+\.?\d*)/);
              const siteMatch = split.sf_payment_info.match(/Site:\s*\$?([\d,]+\.?\d*)/);
              const dealMatch = split.sf_payment_info.match(/Deal:\s*\$?([\d,]+\.?\d*)/);

              if (origMatch) sfOrig = parseFloat(origMatch[1].replace(/,/g, ''));
              if (siteMatch) sfSite = parseFloat(siteMatch[1].replace(/,/g, ''));
              if (dealMatch) sfDeal = parseFloat(dealMatch[1].replace(/,/g, ''));
            }

            // Check if values match (within 1 cent tolerance)
            const allMatch =
              Math.abs(split.split_origination_usd - expectedOrig) < 0.01 &&
              Math.abs(split.split_site_usd - expectedSite) < 0.01 &&
              Math.abs(split.split_deal_usd - expectedDeal) < 0.01 &&
              Math.abs(split.split_broker_total - expectedTotal) < 0.01;

            const difference = expectedTotal - split.split_broker_total;
            totalDifference += difference;

            if (!allMatch) totalMismatches++;

            // Check Salesforce match
            let sfMatch = null;
            if (sfOrig !== null) {
              sfMatch = Math.abs(expectedOrig - sfOrig) < 0.01 &&
                        Math.abs(expectedSite - sfSite) < 0.01 &&
                        Math.abs(expectedDeal - sfDeal) < 0.01;
              if (sfMatch) {
                totalSalesforceMatches++;
              } else {
                totalSalesforceMismatches++;
              }
            }

            if (!allMatch) {
              allIssues.push({
                dealName: deal.deal_name,
                paymentSeq: payment.payment_sequence,
                paymentAmount: payment.payment_amount,
                paymentAGCI: payment.agci,
                isOverride: payment.amount_override,
                brokerName: split.broker?.name || 'Unknown',
                dealCategories: {
                  orig: deal.origination_percent,
                  site: deal.site_percent,
                  deal: deal.deal_percent
                },
                brokerSplits: {
                  orig: split.split_origination_percent,
                  site: split.split_site_percent,
                  deal: split.split_deal_percent
                },
                current: {
                  orig: split.split_origination_usd,
                  site: split.split_site_usd,
                  deal: split.split_deal_usd,
                  total: split.split_broker_total
                },
                expected: {
                  orig: expectedOrig,
                  site: expectedSite,
                  deal: expectedDeal,
                  total: expectedTotal
                },
                salesforce: {
                  orig: sfOrig,
                  site: sfSite,
                  deal: sfDeal
                },
                difference,
                sfMatch
              });
            }
          }
        }
      }

      setSummary({
        totalSplits,
        correctSplits: totalSplits - totalMismatches,
        incorrectSplits: totalMismatches,
        totalDifference,
        salesforceMatches: totalSalesforceMatches,
        salesforceMismatches: totalSalesforceMismatches
      });

      setIssues(allIssues);
    } catch (error) {
      console.error('Error running validation:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Running validation...</div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">No data available</div>
      </div>
    );
  }

  const successRate = (summary.correctSplits / summary.totalSplits * 100).toFixed(1);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm font-medium text-gray-500">Total Splits</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">{summary.totalSplits}</div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm font-medium text-gray-500">Success Rate</div>
          <div className="mt-2 text-3xl font-bold text-green-600">{successRate}%</div>
          <div className="mt-1 text-xs text-gray-500">{summary.correctSplits} correct</div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm font-medium text-gray-500">Issues Found</div>
          <div className="mt-2 text-3xl font-bold text-red-600">{summary.incorrectSplits}</div>
          <div className="mt-1 text-xs text-gray-500">Need fixing</div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm font-medium text-gray-500">Total Difference</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">
            ${Math.abs(summary.totalDifference).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {summary.totalDifference > 0 ? 'Underpaid' : 'Overpaid'}
          </div>
        </div>
      </div>

      {/* Salesforce Comparison */}
      {(summary.salesforceMatches + summary.salesforceMismatches > 0) && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="font-medium text-blue-900 mb-2">Salesforce Comparison</div>
          <div className="text-sm text-blue-700">
            Expected formula matches Salesforce: {summary.salesforceMatches} |
            Differs from Salesforce: {summary.salesforceMismatches}
          </div>
        </div>
      )}

      {/* Issues Table */}
      {summary.incorrectSplits > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">Split Validation Issues</h3>
            <button
              onClick={runValidation}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
            >
              Refresh
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Deal / Payment
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Broker
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    AGCI
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Current Total
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Expected Total
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Difference
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    SF Match
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {issues.map((issue, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{issue.dealName}</div>
                      <div className="text-sm text-gray-500">
                        Payment {issue.paymentSeq}
                        {issue.isOverride && <span className="ml-2 text-blue-600">🔒</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {issue.brokerName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ${issue.paymentAGCI.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-red-600">
                        ${issue.current.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-xs text-gray-500">
                        ${issue.current.orig.toFixed(2)} / ${issue.current.site.toFixed(2)} / ${issue.current.deal.toFixed(2)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-green-600">
                        ${issue.expected.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-xs text-gray-500">
                        ${issue.expected.orig.toFixed(2)} / ${issue.expected.site.toFixed(2)} / ${issue.expected.deal.toFixed(2)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className={`text-sm font-medium ${issue.difference > 0 ? 'text-orange-600' : 'text-purple-600'}`}>
                        ${Math.abs(issue.difference).toFixed(2)}
                      </div>
                      <div className="text-xs text-gray-500">
                        {issue.difference > 0 ? 'Underpaid' : 'Overpaid'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {issue.sfMatch === null ? (
                        <span className="text-gray-400">N/A</span>
                      ) : issue.sfMatch ? (
                        <span className="text-green-600">✅ Match</span>
                      ) : (
                        <span className="text-red-600">❌ Differ</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Success Message */}
      {summary.incorrectSplits === 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center">
          <div className="text-4xl mb-4">✅</div>
          <div className="text-lg font-medium text-green-900 mb-2">All Splits Are Correct!</div>
          <div className="text-sm text-green-700">
            All {summary.totalSplits} payment splits are calculating correctly based on the AGCI formula.
          </div>
        </div>
      )}
    </div>
  );
};

export default SplitValidationTab;
