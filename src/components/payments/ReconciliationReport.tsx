import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabaseClient';

interface SalesforcePayment {
  opportunityName: string;
  stage: string;
  paymentName: string;
  invoiceNumber: string;
  paymentAmount: number;
  gci: number;
  agci: number;
  house: number;
  mikeTotal: number;
  artyTotal: number;
  gregTotal: number;
  paymentDate: string;
}

interface OVISPaymentData {
  dealName: string;
  stage: string;
  totalPayments: number;
  gci: number;
  agci: number;
  house: number;
  mikeTotal: number;
  artyTotal: number;
  gregTotal: number;
  paymentCount: number;
}

interface ReconciliationRow {
  dealName: string;
  ovisStage: string;
  sfStage: string;
  ovisPaymentAmount: number;
  sfPaymentAmount: number;
  paymentVariance: number;
  ovisGCI: number;
  sfGCI: number;
  gciVariance: number;
  ovisAGCI: number;
  sfAGCI: number;
  agciVariance: number;
  ovisHouse: number;
  sfHouse: number;
  houseVariance: number;
  ovisMike: number;
  sfMike: number;
  mikeVariance: number;
  ovisArty: number;
  sfArty: number;
  artyVariance: number;
  ovisGreg: number;
  sfGreg: number;
  gregVariance: number;
}

const ReconciliationReport: React.FC = () => {
  const [ovisData, setOvisData] = useState<OVISPaymentData[]>([]);
  const [salesforceData, setSalesforceData] = useState<SalesforcePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStage, setSelectedStage] = useState<string>('all');
  const [sortColumn, setSortColumn] = useState<string>('dealName');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    fetchOVISData();
  }, []);

  const fetchOVISData = async () => {
    setLoading(true);
    try {
      // Fetch active deals with payments and broker splits
      const { data: deals, error: dealsError } = await supabase
        .from('deal')
        .select(`
          id,
          deal_name,
          stage_id,
          fee,
          origination_usd,
          site_usd,
          deal_usd,
          referral_fee_usd,
          stage:stage_id (
            stage_name,
            is_active
          )
        `)
        .eq('stage.is_active', true)
        .not('stage.stage_name', 'ilike', '%lost%');

      if (dealsError) throw dealsError;

      // Fetch payments for these deals
      const dealIds = deals?.map(d => d.id) || [];
      const { data: payments, error: paymentsError } = await supabase
        .from('payment')
        .select('*')
        .in('deal_id', dealIds);

      if (paymentsError) throw paymentsError;

      // Fetch payment splits for broker totals
      const paymentIds = payments?.map(p => p.id) || [];
      const { data: paymentSplits, error: splitsError } = await supabase
        .from('payment_split')
        .select(`
          *,
          broker:broker_id (
            id,
            name
          )
        `)
        .in('payment_id', paymentIds);

      if (splitsError) throw splitsError;

      // Aggregate data by deal
      const aggregatedData: OVISPaymentData[] = deals?.map(deal => {
        const dealPayments = payments?.filter(p => p.deal_id === deal.id) || [];
        const totalPayments = dealPayments.reduce((sum, p) => sum + (p.payment_amount || 0), 0);
        const paymentCount = dealPayments.length;

        // Calculate GCI (before house fee)
        const gci = deal.fee || 0;

        // Calculate AGCI (after house fee) - this should be origination + site + deal
        const agci = (deal.origination_usd || 0) + (deal.site_usd || 0) + (deal.deal_usd || 0);

        // Calculate house fee
        const house = gci - agci;

        // Calculate broker totals
        let mikeTotal = 0;
        let artyTotal = 0;
        let gregTotal = 0;

        dealPayments.forEach(payment => {
          const splits = paymentSplits?.filter(ps => ps.payment_id === payment.id) || [];
          splits.forEach(split => {
            const brokerName = split.broker?.name || '';
            const total = (split.split_origination_usd || 0) + (split.split_site_usd || 0) + (split.split_deal_usd || 0);

            if (brokerName.toLowerCase().includes('mike')) {
              mikeTotal += total;
            } else if (brokerName.toLowerCase().includes('arty')) {
              artyTotal += total;
            } else if (brokerName.toLowerCase().includes('greg')) {
              gregTotal += total;
            }
          });
        });

        return {
          dealName: deal.deal_name || '',
          stage: deal.stage?.stage_name || '',
          totalPayments,
          gci,
          agci,
          house,
          mikeTotal,
          artyTotal,
          gregTotal,
          paymentCount
        };
      }) || [];

      setOvisData(aggregatedData);
    } catch (error) {
      console.error('Error fetching OVIS data:', error);
    } finally {
      setLoading(false);
    }
  };

  const parseSalesforceHTML = (htmlContent: string): SalesforcePayment[] => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    const rows = doc.querySelectorAll('table tr');

    const payments: SalesforcePayment[] = [];

    // Skip header row (index 0)
    for (let i = 1; i < rows.length; i++) {
      const cells = rows[i].querySelectorAll('td');
      if (cells.length < 13) continue;

      payments.push({
        opportunityName: cells[1]?.textContent?.trim() || '',
        stage: cells[2]?.textContent?.trim() || '',
        paymentName: cells[3]?.textContent?.trim() || '',
        invoiceNumber: cells[4]?.textContent?.trim() || '',
        paymentAmount: parseFloat(cells[5]?.textContent?.replace(/,/g, '') || '0'),
        gci: parseFloat(cells[6]?.textContent?.replace(/,/g, '') || '0'),
        agci: parseFloat(cells[7]?.textContent?.replace(/,/g, '') || '0'),
        house: parseFloat(cells[8]?.textContent?.replace(/,/g, '') || '0'),
        mikeTotal: parseFloat(cells[9]?.textContent?.replace(/,/g, '') || '0'),
        artyTotal: parseFloat(cells[10]?.textContent?.replace(/,/g, '') || '0'),
        gregTotal: parseFloat(cells[11]?.textContent?.replace(/,/g, '') || '0'),
        paymentDate: cells[12]?.textContent?.trim() || ''
      });
    }

    return payments;
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const parsed = parseSalesforceHTML(content);
      setSalesforceData(parsed);
    };
    reader.readAsText(file);
  };

  // Aggregate Salesforce data by opportunity
  const aggregatedSFData = useMemo(() => {
    const grouped = new Map<string, SalesforcePayment[]>();

    salesforceData.forEach(payment => {
      const existing = grouped.get(payment.opportunityName) || [];
      existing.push(payment);
      grouped.set(payment.opportunityName, existing);
    });

    return Array.from(grouped.entries()).map(([name, payments]) => {
      return {
        opportunityName: name,
        stage: payments[0].stage,
        totalPayments: payments.reduce((sum, p) => sum + p.paymentAmount, 0),
        gci: payments.reduce((sum, p) => sum + p.gci, 0),
        agci: payments.reduce((sum, p) => sum + p.agci, 0),
        house: payments.reduce((sum, p) => sum + p.house, 0),
        mikeTotal: payments.reduce((sum, p) => sum + p.mikeTotal, 0),
        artyTotal: payments.reduce((sum, p) => sum + p.artyTotal, 0),
        gregTotal: payments.reduce((sum, p) => sum + p.gregTotal, 0)
      };
    });
  }, [salesforceData]);

  // Create reconciliation rows
  const reconciliationData = useMemo(() => {
    const rows: ReconciliationRow[] = [];

    // Match OVIS data with Salesforce data
    ovisData.forEach(ovis => {
      const sf = aggregatedSFData.find(sf =>
        sf.opportunityName.toLowerCase().includes(ovis.dealName.toLowerCase()) ||
        ovis.dealName.toLowerCase().includes(sf.opportunityName.toLowerCase())
      );

      rows.push({
        dealName: ovis.dealName,
        ovisStage: ovis.stage,
        sfStage: sf?.stage || 'Not Found',
        ovisPaymentAmount: ovis.totalPayments,
        sfPaymentAmount: sf?.totalPayments || 0,
        paymentVariance: ovis.totalPayments - (sf?.totalPayments || 0),
        ovisGCI: ovis.gci,
        sfGCI: sf?.gci || 0,
        gciVariance: ovis.gci - (sf?.gci || 0),
        ovisAGCI: ovis.agci,
        sfAGCI: sf?.agci || 0,
        agciVariance: ovis.agci - (sf?.agci || 0),
        ovisHouse: ovis.house,
        sfHouse: sf?.house || 0,
        houseVariance: ovis.house - (sf?.house || 0),
        ovisMike: ovis.mikeTotal,
        sfMike: sf?.mikeTotal || 0,
        mikeVariance: ovis.mikeTotal - (sf?.mikeTotal || 0),
        ovisArty: ovis.artyTotal,
        sfArty: sf?.artyTotal || 0,
        artyVariance: ovis.artyTotal - (sf?.artyTotal || 0),
        ovisGreg: ovis.gregTotal,
        sfGreg: sf?.gregTotal || 0,
        gregVariance: ovis.gregTotal - (sf?.gregTotal || 0)
      });
    });

    return rows;
  }, [ovisData, aggregatedSFData]);

  // Filter and sort data
  const filteredAndSortedData = useMemo(() => {
    let filtered = reconciliationData;

    // Filter by stage
    if (selectedStage !== 'all') {
      filtered = filtered.filter(row => row.ovisStage === selectedStage);
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal: any = a[sortColumn as keyof ReconciliationRow];
      let bVal: any = b[sortColumn as keyof ReconciliationRow];

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }

      if (sortDirection === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    return filtered;
  }, [reconciliationData, selectedStage, sortColumn, sortDirection]);

  // Calculate totals
  const totals = useMemo(() => {
    return filteredAndSortedData.reduce((acc, row) => {
      acc.ovisPaymentAmount += row.ovisPaymentAmount;
      acc.sfPaymentAmount += row.sfPaymentAmount;
      acc.ovisGCI += row.ovisGCI;
      acc.sfGCI += row.sfGCI;
      acc.ovisAGCI += row.ovisAGCI;
      acc.sfAGCI += row.sfAGCI;
      acc.ovisHouse += row.ovisHouse;
      acc.sfHouse += row.sfHouse;
      acc.ovisMike += row.ovisMike;
      acc.sfMike += row.sfMike;
      acc.ovisArty += row.ovisArty;
      acc.sfArty += row.sfArty;
      acc.ovisGreg += row.ovisGreg;
      acc.sfGreg += row.sfGreg;
      return acc;
    }, {
      ovisPaymentAmount: 0,
      sfPaymentAmount: 0,
      ovisGCI: 0,
      sfGCI: 0,
      ovisAGCI: 0,
      sfAGCI: 0,
      ovisHouse: 0,
      sfHouse: 0,
      ovisMike: 0,
      sfMike: 0,
      ovisArty: 0,
      sfArty: 0,
      ovisGreg: 0,
      sfGreg: 0
    });
  }, [filteredAndSortedData]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const formatCurrency = (value: number) => {
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getVarianceColor = (variance: number) => {
    if (Math.abs(variance) < 0.01) return 'text-gray-600';
    return variance > 0 ? 'text-green-600' : 'text-red-600';
  };

  // Get unique stages for filter
  const stages = useMemo(() => {
    const uniqueStages = new Set(ovisData.map(d => d.stage));
    return Array.from(uniqueStages).sort();
  }, [ovisData]);

  if (loading) {
    return <div className="p-6 text-center">Loading OVIS data...</div>;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-xl font-semibold text-gray-900">Payment Reconciliation Report</h2>
        <p className="text-sm text-gray-600 mt-1">
          Compare OVIS payment data with Salesforce
        </p>
      </div>

      {/* Controls */}
      <div className="p-6 border-b border-gray-200 flex items-center gap-4">
        {/* File Upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Upload Salesforce Report (HTML/XLS)
          </label>
          <input
            type="file"
            accept=".xls,.html"
            onChange={handleFileUpload}
            className="block w-full text-sm text-gray-500
              file:mr-4 file:py-2 file:px-4
              file:rounded-md file:border-0
              file:text-sm file:font-semibold
              file:bg-blue-50 file:text-blue-700
              hover:file:bg-blue-100"
          />
        </div>

        {/* Stage Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Filter by Stage
          </label>
          <select
            value={selectedStage}
            onChange={(e) => setSelectedStage(e.target.value)}
            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
          >
            <option value="all">All Stages</option>
            {stages.map(stage => (
              <option key={stage} value={stage}>{stage}</option>
            ))}
          </select>
        </div>

        {/* Stats */}
        <div className="ml-auto text-right">
          <div className="text-sm text-gray-600">Showing {filteredAndSortedData.length} deals</div>
          <div className="text-sm text-gray-600">
            {salesforceData.length > 0 ? `${salesforceData.length} SF payments loaded` : 'No SF data loaded'}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th onClick={() => handleSort('dealName')} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                Deal Name {sortColumn === 'dealName' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stage</th>
              <th colSpan={3} className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-blue-50">Payment Amount</th>
              <th colSpan={3} className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-green-50">GCI</th>
              <th colSpan={3} className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-purple-50">AGCI</th>
              <th colSpan={3} className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-orange-50">House $</th>
              <th colSpan={3} className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-red-50">Mike Total</th>
              <th colSpan={3} className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-yellow-50">Arty Total</th>
              <th colSpan={3} className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-pink-50">Greg Total</th>
            </tr>
            <tr>
              <th></th>
              <th></th>
              <th className="px-2 py-1 text-xs font-medium text-gray-500 text-center bg-blue-50">OVIS</th>
              <th className="px-2 py-1 text-xs font-medium text-gray-500 text-center bg-blue-50">SF</th>
              <th className="px-2 py-1 text-xs font-medium text-gray-500 text-center bg-blue-50">Var</th>
              <th className="px-2 py-1 text-xs font-medium text-gray-500 text-center bg-green-50">OVIS</th>
              <th className="px-2 py-1 text-xs font-medium text-gray-500 text-center bg-green-50">SF</th>
              <th className="px-2 py-1 text-xs font-medium text-gray-500 text-center bg-green-50">Var</th>
              <th className="px-2 py-1 text-xs font-medium text-gray-500 text-center bg-purple-50">OVIS</th>
              <th className="px-2 py-1 text-xs font-medium text-gray-500 text-center bg-purple-50">SF</th>
              <th className="px-2 py-1 text-xs font-medium text-gray-500 text-center bg-purple-50">Var</th>
              <th className="px-2 py-1 text-xs font-medium text-gray-500 text-center bg-orange-50">OVIS</th>
              <th className="px-2 py-1 text-xs font-medium text-gray-500 text-center bg-orange-50">SF</th>
              <th className="px-2 py-1 text-xs font-medium text-gray-500 text-center bg-orange-50">Var</th>
              <th className="px-2 py-1 text-xs font-medium text-gray-500 text-center bg-red-50">OVIS</th>
              <th className="px-2 py-1 text-xs font-medium text-gray-500 text-center bg-red-50">SF</th>
              <th className="px-2 py-1 text-xs font-medium text-gray-500 text-center bg-red-50">Var</th>
              <th className="px-2 py-1 text-xs font-medium text-gray-500 text-center bg-yellow-50">OVIS</th>
              <th className="px-2 py-1 text-xs font-medium text-gray-500 text-center bg-yellow-50">SF</th>
              <th className="px-2 py-1 text-xs font-medium text-gray-500 text-center bg-yellow-50">Var</th>
              <th className="px-2 py-1 text-xs font-medium text-gray-500 text-center bg-pink-50">OVIS</th>
              <th className="px-2 py-1 text-xs font-medium text-gray-500 text-center bg-pink-50">SF</th>
              <th className="px-2 py-1 text-xs font-medium text-gray-500 text-center bg-pink-50">Var</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredAndSortedData.map((row, idx) => (
              <tr key={idx} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-sm text-gray-900 whitespace-nowrap">{row.dealName}</td>
                <td className="px-3 py-2 text-sm text-gray-600 whitespace-nowrap">{row.ovisStage}</td>
                <td className="px-2 py-2 text-sm text-right bg-blue-50">{formatCurrency(row.ovisPaymentAmount)}</td>
                <td className="px-2 py-2 text-sm text-right bg-blue-50">{formatCurrency(row.sfPaymentAmount)}</td>
                <td className={`px-2 py-2 text-sm text-right font-semibold bg-blue-50 ${getVarianceColor(row.paymentVariance)}`}>{formatCurrency(row.paymentVariance)}</td>
                <td className="px-2 py-2 text-sm text-right bg-green-50">{formatCurrency(row.ovisGCI)}</td>
                <td className="px-2 py-2 text-sm text-right bg-green-50">{formatCurrency(row.sfGCI)}</td>
                <td className={`px-2 py-2 text-sm text-right font-semibold bg-green-50 ${getVarianceColor(row.gciVariance)}`}>{formatCurrency(row.gciVariance)}</td>
                <td className="px-2 py-2 text-sm text-right bg-purple-50">{formatCurrency(row.ovisAGCI)}</td>
                <td className="px-2 py-2 text-sm text-right bg-purple-50">{formatCurrency(row.sfAGCI)}</td>
                <td className={`px-2 py-2 text-sm text-right font-semibold bg-purple-50 ${getVarianceColor(row.agciVariance)}`}>{formatCurrency(row.agciVariance)}</td>
                <td className="px-2 py-2 text-sm text-right bg-orange-50">{formatCurrency(row.ovisHouse)}</td>
                <td className="px-2 py-2 text-sm text-right bg-orange-50">{formatCurrency(row.sfHouse)}</td>
                <td className={`px-2 py-2 text-sm text-right font-semibold bg-orange-50 ${getVarianceColor(row.houseVariance)}`}>{formatCurrency(row.houseVariance)}</td>
                <td className="px-2 py-2 text-sm text-right bg-red-50">{formatCurrency(row.ovisMike)}</td>
                <td className="px-2 py-2 text-sm text-right bg-red-50">{formatCurrency(row.sfMike)}</td>
                <td className={`px-2 py-2 text-sm text-right font-semibold bg-red-50 ${getVarianceColor(row.mikeVariance)}`}>{formatCurrency(row.mikeVariance)}</td>
                <td className="px-2 py-2 text-sm text-right bg-yellow-50">{formatCurrency(row.ovisArty)}</td>
                <td className="px-2 py-2 text-sm text-right bg-yellow-50">{formatCurrency(row.sfArty)}</td>
                <td className={`px-2 py-2 text-sm text-right font-semibold bg-yellow-50 ${getVarianceColor(row.artyVariance)}`}>{formatCurrency(row.artyVariance)}</td>
                <td className="px-2 py-2 text-sm text-right bg-pink-50">{formatCurrency(row.ovisGreg)}</td>
                <td className="px-2 py-2 text-sm text-right bg-pink-50">{formatCurrency(row.sfGreg)}</td>
                <td className={`px-2 py-2 text-sm text-right font-semibold bg-pink-50 ${getVarianceColor(row.gregVariance)}`}>{formatCurrency(row.gregVariance)}</td>
              </tr>
            ))}
            {/* Totals Row */}
            <tr className="bg-gray-800 text-white font-bold">
              <td className="px-3 py-2 text-sm" colSpan={2}>TOTALS</td>
              <td className="px-2 py-2 text-sm text-right">{formatCurrency(totals.ovisPaymentAmount)}</td>
              <td className="px-2 py-2 text-sm text-right">{formatCurrency(totals.sfPaymentAmount)}</td>
              <td className="px-2 py-2 text-sm text-right">{formatCurrency(totals.ovisPaymentAmount - totals.sfPaymentAmount)}</td>
              <td className="px-2 py-2 text-sm text-right">{formatCurrency(totals.ovisGCI)}</td>
              <td className="px-2 py-2 text-sm text-right">{formatCurrency(totals.sfGCI)}</td>
              <td className="px-2 py-2 text-sm text-right">{formatCurrency(totals.ovisGCI - totals.sfGCI)}</td>
              <td className="px-2 py-2 text-sm text-right">{formatCurrency(totals.ovisAGCI)}</td>
              <td className="px-2 py-2 text-sm text-right">{formatCurrency(totals.sfAGCI)}</td>
              <td className="px-2 py-2 text-sm text-right">{formatCurrency(totals.ovisAGCI - totals.sfAGCI)}</td>
              <td className="px-2 py-2 text-sm text-right">{formatCurrency(totals.ovisHouse)}</td>
              <td className="px-2 py-2 text-sm text-right">{formatCurrency(totals.sfHouse)}</td>
              <td className="px-2 py-2 text-sm text-right">{formatCurrency(totals.ovisHouse - totals.sfHouse)}</td>
              <td className="px-2 py-2 text-sm text-right">{formatCurrency(totals.ovisMike)}</td>
              <td className="px-2 py-2 text-sm text-right">{formatCurrency(totals.sfMike)}</td>
              <td className="px-2 py-2 text-sm text-right">{formatCurrency(totals.ovisMike - totals.sfMike)}</td>
              <td className="px-2 py-2 text-sm text-right">{formatCurrency(totals.ovisArty)}</td>
              <td className="px-2 py-2 text-sm text-right">{formatCurrency(totals.sfArty)}</td>
              <td className="px-2 py-2 text-sm text-right">{formatCurrency(totals.ovisArty - totals.sfArty)}</td>
              <td className="px-2 py-2 text-sm text-right">{formatCurrency(totals.ovisGreg)}</td>
              <td className="px-2 py-2 text-sm text-right">{formatCurrency(totals.sfGreg)}</td>
              <td className="px-2 py-2 text-sm text-right">{formatCurrency(totals.ovisGreg - totals.sfGreg)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ReconciliationReport;
