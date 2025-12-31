import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import {
  ArrowLeft,
  RefreshCw,
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Edit2,
  Check,
  X
} from "lucide-react";

interface QBAccount {
  id: string;
  qb_account_id: string;
  name: string;
  account_type: string;
  account_sub_type: string | null;
  fully_qualified_name: string;
  active: boolean;
  current_balance: number;
  budget_amount: number | null;
  budget_notes: string | null;
  last_synced_at: string | null;
}

interface QBExpense {
  id: string;
  qb_transaction_id: string;
  transaction_type: string;
  transaction_date: string;
  vendor_name: string | null;
  category: string;
  account_id: string;
  account_name: string;
  description: string | null;
  amount: number;
  qb_entity_type?: string;
  qb_entity_id?: string;
  qb_line_id?: string;
  sync_token?: string;
}

interface CategorySummary {
  account: QBAccount;
  totalSpent: number;
  budgetAmount: number;
  percentUsed: number;
  transactions: QBExpense[];
}

export default function BudgetDashboardPage() {
  const navigate = useNavigate();
  const { userRole } = useAuth();

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [accounts, setAccounts] = useState<QBAccount[]>([]);
  const [expenses, setExpenses] = useState<QBExpense[]>([]);
  const [categorySummaries, setCategorySummaries] = useState<CategorySummary[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [editingBudget, setEditingBudget] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [recategorizingExpense, setRecategorizingExpense] = useState<string | null>(null);
  const [updatingExpense, setUpdatingExpense] = useState<string | null>(null);

  // Date filter state
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);

  useEffect(() => {
    document.title = "Budget & P&L | OVIS Admin";
    fetchData();
  }, [selectedYear, selectedMonth]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch accounts
      const { data: accountData, error: accountError } = await supabase
        .from('qb_account')
        .select('*')
        .eq('active', true)
        .order('name');

      if (accountError) throw accountError;
      setAccounts(accountData || []);

      // Build date filter for expenses
      let startDate: string;
      let endDate: string;

      if (selectedMonth !== null) {
        startDate = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`;
        const nextMonth = selectedMonth === 11 ? 0 : selectedMonth + 1;
        const nextYear = selectedMonth === 11 ? selectedYear + 1 : selectedYear;
        endDate = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-01`;
      } else {
        startDate = `${selectedYear}-01-01`;
        endDate = `${selectedYear + 1}-01-01`;
      }

      // Fetch expenses for the selected period
      const { data: expenseData, error: expenseError } = await supabase
        .from('qb_expense')
        .select('*')
        .gte('transaction_date', startDate)
        .lt('transaction_date', endDate)
        .order('transaction_date', { ascending: false });

      if (expenseError) throw expenseError;
      setExpenses(expenseData || []);

      // Calculate category summaries
      calculateSummaries(accountData || [], expenseData || []);
    } catch (error: any) {
      console.error('Error fetching budget data:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to load data' });
    } finally {
      setLoading(false);
    }
  };

  const calculateSummaries = (accountList: QBAccount[], expenseList: QBExpense[]) => {
    // Group expenses by account
    const expensesByAccount = new Map<string, QBExpense[]>();

    for (const expense of expenseList) {
      const accountId = expense.account_id;
      if (!expensesByAccount.has(accountId)) {
        expensesByAccount.set(accountId, []);
      }
      expensesByAccount.get(accountId)!.push(expense);
    }

    // Create summaries
    const summaries: CategorySummary[] = accountList.map(account => {
      const transactions = expensesByAccount.get(account.qb_account_id) || [];
      const totalSpent = transactions.reduce((sum, t) => sum + t.amount, 0);
      const budgetAmount = account.budget_amount || 0;
      const percentUsed = budgetAmount > 0 ? (totalSpent / budgetAmount) * 100 : 0;

      return {
        account,
        totalSpent,
        budgetAmount,
        percentUsed,
        transactions
      };
    });

    // Sort by total spent (highest first)
    summaries.sort((a, b) => b.totalSpent - a.totalSpent);

    setCategorySummaries(summaries);
  };

  const handleSyncAccounts = async () => {
    setSyncing(true);
    setMessage(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage({ type: 'error', text: 'You must be logged in' });
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quickbooks-sync-accounts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          }
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to sync accounts');
      }

      setMessage({ type: 'success', text: result.message });
      fetchData();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Sync failed' });
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncExpenses = async () => {
    setSyncing(true);
    setMessage(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage({ type: 'error', text: 'You must be logged in' });
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quickbooks-sync-expenses`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            startDate: `${selectedYear}-01-01`
          })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to sync expenses');
      }

      setMessage({ type: 'success', text: result.message });
      fetchData();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Sync failed' });
    } finally {
      setSyncing(false);
    }
  };

  const toggleCategory = (accountId: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(accountId)) {
        newSet.delete(accountId);
      } else {
        newSet.add(accountId);
      }
      return newSet;
    });
  };

  const startEditBudget = (account: QBAccount) => {
    setEditingBudget(account.id);
    setEditValue(account.budget_amount?.toString() || '');
  };

  const saveBudget = async (accountId: string) => {
    try {
      const budgetAmount = editValue ? parseFloat(editValue) : null;

      const { error } = await supabase
        .from('qb_account')
        .update({ budget_amount: budgetAmount })
        .eq('id', accountId);

      if (error) throw error;

      setEditingBudget(null);
      fetchData();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to save budget' });
    }
  };

  const cancelEdit = () => {
    setEditingBudget(null);
    setEditValue('');
  };

  const handleRecategorize = async (expenseId: string, newAccountId: string, newAccountName: string) => {
    setUpdatingExpense(expenseId);
    setMessage(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage({ type: 'error', text: 'You must be logged in' });
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quickbooks-update-expense`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            expenseId,
            newAccountId,
            newAccountName
          })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update expense');
      }

      setMessage({ type: 'success', text: 'Expense category updated in QuickBooks' });
      setRecategorizingExpense(null);
      fetchData();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to update expense' });
    } finally {
      setUpdatingExpense(null);
    }
  };

  // Calculate totals
  const totalBudget = categorySummaries.reduce((sum, c) => sum + c.budgetAmount, 0);
  const totalSpent = categorySummaries.reduce((sum, c) => sum + c.totalSpent, 0);
  const totalRemaining = totalBudget - totalSpent;

  // Check access
  if (userRole !== 'admin') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900">Access Denied</h1>
          <p className="text-gray-600 mt-2">Only administrators can access the budget dashboard.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading budget data...</p>
        </div>
      </div>
    );
  }

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center text-blue-600 hover:text-blue-800 mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </button>

          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Budget & P&L</h1>
              <p className="mt-2 text-gray-600">
                Track expenses by category and manage budget targets
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleSyncAccounts}
                disabled={syncing}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                Sync Accounts
              </button>
              <button
                onClick={handleSyncExpenses}
                disabled={syncing}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                Sync Expenses
              </button>
            </div>
          </div>
        </div>

        {/* Message Banner */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
            message.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}>
            {message.type === 'success' ? (
              <Check className="h-5 w-5 text-green-500" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-500" />
            )}
            <span>{message.text}</span>
            <button
              onClick={() => setMessage(null)}
              className="ml-auto text-gray-500 hover:text-gray-700"
            >
              &times;
            </button>
          </div>
        )}

        {/* Date Filter */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700">Period:</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="border border-gray-300 rounded-md px-3 py-2"
            >
              {[2024, 2025, 2026].map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
            <select
              value={selectedMonth ?? ''}
              onChange={(e) => setSelectedMonth(e.target.value === '' ? null : parseInt(e.target.value))}
              className="border border-gray-300 rounded-md px-3 py-2"
            >
              <option value="">Full Year</option>
              {months.map((month, index) => (
                <option key={index} value={index}>{month}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-100 rounded-full">
                <DollarSign className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Budget</p>
                <p className="text-2xl font-bold text-gray-900">
                  ${totalBudget.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-100 rounded-full">
                <TrendingUp className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Spent</p>
                <p className="text-2xl font-bold text-gray-900">
                  ${totalSpent.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-full ${totalRemaining >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                <TrendingDown className={`h-6 w-6 ${totalRemaining >= 0 ? 'text-green-600' : 'text-red-600'}`} />
              </div>
              <div>
                <p className="text-sm text-gray-500">Remaining</p>
                <p className={`text-2xl font-bold ${totalRemaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ${Math.abs(totalRemaining).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  {totalRemaining < 0 && ' over'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Category Table */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Expense Categories</h2>
            <p className="text-sm text-gray-500 mt-1">
              {categorySummaries.length} categories with {expenses.length} transactions
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Spent</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Budget</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase w-48">Progress</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {categorySummaries.map((summary) => {
                  const isExpanded = expandedCategories.has(summary.account.qb_account_id);
                  const isEditing = editingBudget === summary.account.id;
                  const isOverBudget = summary.budgetAmount > 0 && summary.totalSpent > summary.budgetAmount;

                  return (
                    <>
                      <tr key={summary.account.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <button
                            onClick={() => toggleCategory(summary.account.qb_account_id)}
                            className="flex items-center gap-2 text-left"
                          >
                            {summary.transactions.length > 0 ? (
                              isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-gray-400" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-gray-400" />
                              )
                            ) : (
                              <span className="w-4" />
                            )}
                            <div>
                              <div className="font-medium text-gray-900">{summary.account.name}</div>
                              <div className="text-xs text-gray-500">{summary.account.account_type}</div>
                            </div>
                          </button>
                        </td>
                        <td className={`px-6 py-4 text-right font-medium ${isOverBudget ? 'text-red-600' : 'text-gray-900'}`}>
                          ${summary.totalSpent.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {isEditing ? (
                            <input
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-24 px-2 py-1 border border-gray-300 rounded text-right"
                              placeholder="0.00"
                              autoFocus
                            />
                          ) : (
                            <span className="text-gray-600">
                              {summary.budgetAmount > 0
                                ? `$${summary.budgetAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                                : '-'}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {summary.budgetAmount > 0 && (
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-gray-200 rounded-full h-2">
                                <div
                                  className={`h-2 rounded-full ${
                                    summary.percentUsed > 100
                                      ? 'bg-red-500'
                                      : summary.percentUsed > 80
                                      ? 'bg-yellow-500'
                                      : 'bg-green-500'
                                  }`}
                                  style={{ width: `${Math.min(summary.percentUsed, 100)}%` }}
                                />
                              </div>
                              <span className={`text-sm font-medium ${isOverBudget ? 'text-red-600' : 'text-gray-600'}`}>
                                {summary.percentUsed.toFixed(0)}%
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {isEditing ? (
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => saveBudget(summary.account.id)}
                                className="p-1 text-green-600 hover:text-green-800"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="p-1 text-gray-400 hover:text-gray-600"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => startEditBudget(summary.account)}
                              className="p-1 text-gray-400 hover:text-blue-600"
                              title="Edit budget"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>

                      {/* Expanded transactions */}
                      {isExpanded && summary.transactions.length > 0 && (
                        <tr key={`${summary.account.id}-expanded`}>
                          <td colSpan={5} className="px-6 py-0 bg-gray-50">
                            <div className="py-4 pl-8">
                              <table className="min-w-full">
                                <thead>
                                  <tr className="text-xs text-gray-500 uppercase">
                                    <th className="py-2 text-left">Date</th>
                                    <th className="py-2 text-left">Vendor</th>
                                    <th className="py-2 text-left">Description</th>
                                    <th className="py-2 text-left">Type</th>
                                    <th className="py-2 text-right">Amount</th>
                                    <th className="py-2 text-center w-48">Category</th>
                                  </tr>
                                </thead>
                                <tbody className="text-sm">
                                  {summary.transactions.slice(0, 20).map((txn) => {
                                    const canRecategorize = !!txn.qb_entity_type && !!txn.qb_entity_id;
                                    const isRecategorizing = recategorizingExpense === txn.id;
                                    const isUpdating = updatingExpense === txn.id;

                                    return (
                                    <tr key={txn.id} className="border-t border-gray-100">
                                      <td className="py-2 text-gray-600">
                                        {new Date(txn.transaction_date).toLocaleDateString()}
                                      </td>
                                      <td className="py-2 text-gray-900">{txn.vendor_name || '-'}</td>
                                      <td className="py-2 text-gray-600 max-w-xs truncate" title={txn.description || undefined}>
                                        {txn.description || '-'}
                                      </td>
                                      <td className="py-2">
                                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                                          {txn.transaction_type}
                                        </span>
                                      </td>
                                      <td className="py-2 text-right font-medium text-gray-900">
                                        ${txn.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                      </td>
                                      <td className="py-2 text-center">
                                        {isUpdating ? (
                                          <span className="text-gray-500 text-xs">Updating...</span>
                                        ) : isRecategorizing ? (
                                          <div className="flex items-center gap-1">
                                            <select
                                              className="text-xs border border-gray-300 rounded px-1 py-0.5 max-w-[140px]"
                                              defaultValue=""
                                              onChange={(e) => {
                                                if (e.target.value) {
                                                  const selectedAccount = accounts.find(a => a.qb_account_id === e.target.value);
                                                  handleRecategorize(txn.id, e.target.value, selectedAccount?.name || '');
                                                }
                                              }}
                                            >
                                              <option value="">Select category...</option>
                                              {accounts
                                                .filter(a => a.qb_account_id !== txn.account_id)
                                                .map(account => (
                                                  <option key={account.qb_account_id} value={account.qb_account_id}>
                                                    {account.name}
                                                  </option>
                                                ))}
                                            </select>
                                            <button
                                              onClick={() => setRecategorizingExpense(null)}
                                              className="p-0.5 text-gray-400 hover:text-gray-600"
                                            >
                                              <X className="h-3 w-3" />
                                            </button>
                                          </div>
                                        ) : canRecategorize ? (
                                          <button
                                            onClick={() => setRecategorizingExpense(txn.id)}
                                            className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                                          >
                                            Change
                                          </button>
                                        ) : (
                                          <span className="text-xs text-gray-400" title="Sync expenses to enable recategorization">
                                            -
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                    );
                                  })}
                                  {summary.transactions.length > 20 && (
                                    <tr className="border-t border-gray-100">
                                      <td colSpan={6} className="py-2 text-center text-gray-500 text-sm">
                                        ... and {summary.transactions.length - 20} more transactions
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}

                {categorySummaries.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                      No expense categories found. Click "Sync Accounts" to import from QuickBooks.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Last sync info */}
        {accounts.length > 0 && accounts[0].last_synced_at && (
          <div className="mt-4 text-sm text-gray-500 text-center">
            Accounts last synced: {new Date(accounts[0].last_synced_at).toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}
