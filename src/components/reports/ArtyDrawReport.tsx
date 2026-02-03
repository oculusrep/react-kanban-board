import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { RefreshCw, Download, ChevronDown, ChevronUp, ShieldAlert } from 'lucide-react';
import { usePermissions } from '../../hooks/usePermissions';

interface TransactionLine {
  id: string;
  date: string;
  type: string;
  docNumber: string | null;
  name: string | null;
  memo: string | null;
  debit: number;
  credit: number;
  balance: number;
}

interface AccountTransactionsResponse {
  accountId: string;
  accountName: string;
  accountType: string;
  currentBalance: number;
  startDate: string;
  endDate: string;
  transactions: TransactionLine[];
  summary: {
    totalDebits: number;
    totalCredits: number;
    netChange: number;
  };
  debug?: {
    hasRows: boolean;
    hasRowArray: boolean;
    rowCount: number;
    columns: string[];
    columnMapping: Record<string, number>;
    sampleRows: any[];
    transactionCount: number;
  };
}

interface CommissionMapping {
  id: string;
  broker_id: string;
  qb_credit_account_id: string | null;
  qb_credit_account_name: string | null;
  broker: {
    name: string;
  };
}

export default function ArtyDrawReport() {
  const { hasPermission, loading: permLoading } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AccountTransactionsResponse | null>(null);
  const [mapping, setMapping] = useState<CommissionMapping | null>(null);

  // Permission check
  const canViewReport = hasPermission('can_view_arty_draw_report');

  // Date range - default to 2024-01-01 to capture full draw history
  const [startDate, setStartDate] = useState('2024-01-01');
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  // Sort state
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Fetch Arty's commission mapping to get the draw account
  useEffect(() => {
    fetchArtyMapping();
  }, []);

  // Fetch transactions when mapping is available
  useEffect(() => {
    if (mapping?.qb_credit_account_id) {
      fetchTransactions();
    }
  }, [mapping, startDate, endDate]);

  const fetchArtyMapping = async () => {
    try {
      // Find Arty Santos's broker record first
      const { data: brokers, error: brokerError } = await supabase
        .from('broker')
        .select('id, name')
        .ilike('name', '%arty%');

      if (brokerError) throw brokerError;

      if (!brokers || brokers.length === 0) {
        setError('Could not find Arty Santos in broker list');
        setLoading(false);
        return;
      }

      const artyBroker = brokers[0];

      // Get the commission mapping for Arty
      const { data: mappingData, error: mappingError } = await supabase
        .from('qb_commission_mapping')
        .select(`
          id,
          broker_id,
          qb_credit_account_id,
          qb_credit_account_name,
          broker:broker_id (name)
        `)
        .eq('broker_id', artyBroker.id)
        .eq('payment_method', 'journal_entry')
        .eq('is_active', true)
        .single();

      if (mappingError || !mappingData) {
        setError('No commission mapping found for Arty Santos. Please configure in Settings > QuickBooks.');
        setLoading(false);
        return;
      }

      if (!mappingData.qb_credit_account_id) {
        setError('Arty\'s commission mapping does not have a credit (draw) account configured.');
        setLoading(false);
        return;
      }

      setMapping(mappingData as CommissionMapping);
    } catch (err) {
      console.error('Error fetching mapping:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch commission mapping');
      setLoading(false);
    }
  };

  const fetchTransactions = async () => {
    if (!mapping?.qb_credit_account_id) return;

    setLoading(true);
    setError(null);

    try {
      const { data: result, error: funcError } = await supabase.functions.invoke(
        'quickbooks-account-transactions',
        {
          body: {
            accountId: mapping.qb_credit_account_id,
            accountName: mapping.qb_credit_account_name,
            startDate,
            endDate
          }
        }
      );

      if (funcError) {
        throw new Error(funcError.message);
      }

      if (result.error) {
        throw new Error(result.error);
      }

      setData(result);
    } catch (err) {
      console.error('Error fetching transactions:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch transactions');
    } finally {
      setLoading(false);
    }
  };

  // Sort transactions
  const sortedTransactions = useMemo(() => {
    if (!data?.transactions) return [];

    return [...data.transactions].sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    });
  }, [data?.transactions, sortOrder]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const exportToCSV = () => {
    if (!data?.transactions) return;

    const headers = ['Date', 'Type', 'Doc #', 'Name', 'Memo', 'Draws (Debit)', 'Credits', 'Balance'];
    const rows = sortedTransactions.map(t => [
      t.date,
      t.type,
      t.docNumber || '',
      t.name || '',
      t.memo || '',
      t.debit || '',
      t.credit || '',
      t.balance
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `arty-draw-report-${startDate}-to-${endDate}.csv`;
    link.click();
  };

  const toggleSortOrder = () => {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
  };

  // Show loading while checking permissions
  if (permLoading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-2 text-sm text-gray-600">Checking permissions...</p>
      </div>
    );
  }

  // Access denied if no permission
  if (!canViewReport) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <ShieldAlert className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-red-800">Access Denied</h3>
          <p className="mt-2 text-sm text-red-600">
            You do not have permission to view this report. Contact an administrator if you need access.
          </p>
        </div>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-2 text-sm text-gray-600">Loading draw account data...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          <h3 className="font-semibold">Error Loading Report</h3>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Arty's Draw Account</h1>
              <p className="text-sm text-gray-500 mt-1">
                {data?.accountName || mapping?.qb_credit_account_name || 'Loading...'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Date Range Filters */}
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">From:</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">To:</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
              </div>
              <button
                onClick={fetchTransactions}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                onClick={exportToCSV}
                disabled={!data?.transactions?.length}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Current Balance */}
        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500">
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Current Balance</p>
          <p className={`text-3xl font-bold mt-2 ${(data?.currentBalance || 0) >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
            {formatCurrency(data?.currentBalance || 0)}
          </p>
          <p className="text-xs text-gray-500 mt-1">Amount owed to Arty</p>
        </div>

        {/* Total Draws */}
        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Total Draws</p>
          <p className="text-3xl font-bold text-green-600 mt-2">
            {formatCurrency(data?.summary?.totalDebits || 0)}
          </p>
          <p className="text-xs text-gray-500 mt-1">Money paid to Arty</p>
        </div>

        {/* Total Credits */}
        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-purple-500">
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Total Credits</p>
          <p className="text-3xl font-bold text-purple-600 mt-2">
            {formatCurrency(data?.summary?.totalCredits || 0)}
          </p>
          <p className="text-xs text-gray-500 mt-1">Commissions earned</p>
        </div>

        {/* Net Change */}
        <div className="bg-gray-800 rounded-lg shadow p-6 text-white">
          <p className="text-sm font-medium text-gray-300 uppercase tracking-wide">Net Change</p>
          <p className="text-3xl font-bold mt-2">
            {formatCurrency(data?.summary?.netChange || 0)}
          </p>
          <p className="text-xs text-gray-400 mt-1">Draws - Credits (period)</p>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Transactions ({sortedTransactions.length})
            </h2>
            <button
              onClick={toggleSortOrder}
              className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
            >
              Sort by Date
              {sortOrder === 'desc' ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronUp className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Doc #</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name/Memo</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-green-600 uppercase bg-green-50">Draws (Debit)</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-purple-600 uppercase bg-purple-50">Credits</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    No transactions found for the selected date range.
                  </td>
                </tr>
              ) : (
                sortedTransactions.map((txn, idx) => (
                  <tr key={txn.id || idx} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                      {formatDate(txn.date)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        txn.type === 'Journal Entry' ? 'bg-blue-100 text-blue-700' :
                        txn.type === 'Bill' ? 'bg-yellow-100 text-yellow-700' :
                        txn.type === 'Check' ? 'bg-green-100 text-green-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {txn.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {txn.docNumber || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 max-w-xs">
                      <div className="truncate">
                        {txn.name && <span className="font-medium">{txn.name}</span>}
                        {txn.name && txn.memo && ' - '}
                        {txn.memo && <span className="text-gray-500">{txn.memo}</span>}
                        {!txn.name && !txn.memo && '-'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-right bg-green-50">
                      {txn.debit > 0 ? (
                        <span className="text-green-600 font-medium">{formatCurrency(txn.debit)}</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-right bg-purple-50">
                      {txn.credit > 0 ? (
                        <span className="text-purple-600 font-medium">{formatCurrency(txn.credit)}</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                      {formatCurrency(txn.balance)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {sortedTransactions.length > 0 && (
              <tfoot className="bg-gray-800 text-white">
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-sm font-semibold">TOTALS</td>
                  <td className="px-4 py-3 text-sm text-right font-semibold bg-green-900">
                    {formatCurrency(data?.summary?.totalDebits || 0)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-semibold bg-purple-900">
                    {formatCurrency(data?.summary?.totalCredits || 0)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-semibold">
                    {formatCurrency(data?.currentBalance || 0)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="bg-white rounded-lg shadow px-6 py-3">
        <div className="text-xs text-gray-500 space-y-1">
          <p><strong>Draws (Debit):</strong> Money paid to Arty from the draw account (reduces the balance)</p>
          <p><strong>Credits:</strong> Commissions earned by Arty (increases the balance owed)</p>
          <p><strong>Balance:</strong> Current amount in the draw account (positive = owed to Arty)</p>
          <p><strong>Source:</strong> QuickBooks Online General Ledger Report for {mapping?.qb_credit_account_name || 'Draw Account'}</p>
        </div>
      </div>

      {/* Debug Info - temporary for diagnosing parsing issues */}
      {data?.debug && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg shadow p-4">
          <h3 className="font-semibold text-yellow-800 mb-2">Debug Info (temporary)</h3>
          <div className="text-xs font-mono text-yellow-900 space-y-2">
            <p><strong>Columns from QBO:</strong> {data.debug.columns?.join(', ') || 'none'}</p>
            <p><strong>Column Mapping:</strong> {JSON.stringify(data.debug.columnMapping)}</p>
            <p><strong>Row Count:</strong> {data.debug.rowCount}</p>
            <p><strong>Transactions Parsed:</strong> {data.debug.transactionCount}</p>
            {data.debug.sampleRows?.length > 0 && (
              <div>
                <p><strong>Sample Rows:</strong></p>
                <pre className="bg-yellow-100 p-2 rounded overflow-x-auto text-xs">
                  {JSON.stringify(data.debug.sampleRows, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
