import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import {
  ArrowLeft,
  RefreshCw,
  Save,
  Calendar,
  Eye,
  EyeOff,
  LayoutGrid,
  LayoutList
} from "lucide-react";

interface QBAccount {
  id: string;
  qb_account_id: string;
  name: string;
  account_type: string;
  account_sub_type: string | null;
  fully_qualified_name: string;
  active: boolean;
}

interface AccountBudget {
  id?: string;
  qb_account_id: string;
  year: number;
  jan: number;
  feb: number;
  mar: number;
  apr: number;
  may: number;
  jun: number;
  jul: number;
  aug: number;
  sep: number;
  oct: number;
  nov: number;
  dec: number;
  notes?: string;
}

interface MonthlyActual {
  account_id: string;
  jan: number;
  feb: number;
  mar: number;
  apr: number;
  may: number;
  jun: number;
  jul: number;
  aug: number;
  sep: number;
  oct: number;
  nov: number;
  dec: number;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] as const;
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type ViewMode = 'annual' | 'monthly';

export default function BudgetManagePage() {
  const navigate = useNavigate();
  const { userRole } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState<QBAccount[]>([]);
  const [budgets, setBudgets] = useState<Map<string, AccountBudget>>(new Map());
  const [actuals, setActuals] = useState<Map<string, MonthlyActual>>(new Map());
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // View options
  const currentYear = new Date().getFullYear();
  const [budgetYear, setBudgetYear] = useState(currentYear);
  const [viewMode, setViewMode] = useState<ViewMode>('monthly');
  const [showActuals, setShowActuals] = useState(true);
  const [showAllAccounts, setShowAllAccounts] = useState(false);

  // Editing state
  const [editingCell, setEditingCell] = useState<{ accountId: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    document.title = "Budget Manager | OVIS Admin";
    fetchData();
  }, [budgetYear]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch expense accounts
      const { data: expenseAccounts, error: accountsError } = await supabase
        .from('qb_account')
        .select('*')
        .in('account_type', ['Expense', 'Other Expense', 'Cost of Goods Sold'])
        .eq('active', true)
        .order('fully_qualified_name');

      if (accountsError) throw accountsError;

      // Fetch actuals for budget year
      const { data: expenses, error: expensesError } = await supabase
        .from('qb_expense')
        .select('account_id, transaction_date, amount')
        .gte('transaction_date', `${budgetYear}-01-01`)
        .lte('transaction_date', `${budgetYear}-12-31`)
        .in('transaction_type', ['Purchase', 'Bill']);

      if (expensesError) throw expensesError;

      // Aggregate actuals by account and month
      const actualsByAccount = new Map<string, MonthlyActual>();
      for (const expense of expenses || []) {
        const month = new Date(expense.transaction_date).getMonth();
        const monthKey = MONTHS[month];

        if (!actualsByAccount.has(expense.account_id)) {
          actualsByAccount.set(expense.account_id, {
            account_id: expense.account_id,
            jan: 0, feb: 0, mar: 0, apr: 0, may: 0, jun: 0,
            jul: 0, aug: 0, sep: 0, oct: 0, nov: 0, dec: 0
          });
        }

        const actuals = actualsByAccount.get(expense.account_id)!;
        actuals[monthKey] += expense.amount;
      }

      // Fetch existing budgets
      const { data: existingBudgets, error: budgetsError } = await supabase
        .from('account_budget')
        .select('*')
        .eq('year', budgetYear);

      if (budgetsError) throw budgetsError;

      // Convert to map
      const budgetMap = new Map<string, AccountBudget>();
      for (const budget of existingBudgets || []) {
        budgetMap.set(budget.qb_account_id, budget);
      }

      // Filter accounts - show those with budget OR actuals OR all if toggled
      const accountsToShow = (expenseAccounts || []).filter(acc =>
        showAllAccounts ||
        budgetMap.has(acc.qb_account_id) ||
        actualsByAccount.has(acc.qb_account_id)
      );

      setAccounts(accountsToShow);
      setActuals(actualsByAccount);
      setBudgets(budgetMap);
      setHasChanges(false);
    } catch (error: any) {
      console.error('Error fetching data:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to load data' });
    } finally {
      setLoading(false);
    }
  };

  // Re-filter when showAllAccounts changes
  useEffect(() => {
    fetchData();
  }, [showAllAccounts]);

  const getBudget = (accountId: string): AccountBudget => {
    if (budgets.has(accountId)) {
      return budgets.get(accountId)!;
    }
    return {
      qb_account_id: accountId,
      year: budgetYear,
      jan: 0, feb: 0, mar: 0, apr: 0, may: 0, jun: 0,
      jul: 0, aug: 0, sep: 0, oct: 0, nov: 0, dec: 0
    };
  };

  const updateBudget = (accountId: string, month: typeof MONTHS[number], value: number) => {
    const newBudgets = new Map(budgets);
    const budget = { ...getBudget(accountId) };
    budget[month] = value;
    newBudgets.set(accountId, budget);
    setBudgets(newBudgets);
    setHasChanges(true);
  };

  const updateAnnualBudget = (accountId: string, annualValue: number) => {
    const monthlyValue = Math.round(annualValue / 12 * 100) / 100;
    const newBudgets = new Map(budgets);
    const budget = { ...getBudget(accountId) };
    MONTHS.forEach(m => { budget[m] = monthlyValue; });
    newBudgets.set(accountId, budget);
    setBudgets(newBudgets);
    setHasChanges(true);
  };

  const saveAllBudgets = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const budgetsToSave = Array.from(budgets.values()).map(b => ({
        qb_account_id: b.qb_account_id,
        year: budgetYear,
        jan: b.jan || 0,
        feb: b.feb || 0,
        mar: b.mar || 0,
        apr: b.apr || 0,
        may: b.may || 0,
        jun: b.jun || 0,
        jul: b.jul || 0,
        aug: b.aug || 0,
        sep: b.sep || 0,
        oct: b.oct || 0,
        nov: b.nov || 0,
        dec: b.dec || 0,
        notes: b.notes || null
      }));

      if (budgetsToSave.length === 0) {
        setMessage({ type: 'error', text: 'No budgets to save' });
        return;
      }

      const { error } = await supabase
        .from('account_budget')
        .upsert(budgetsToSave, { onConflict: 'qb_account_id,year' });

      if (error) throw error;

      setMessage({ type: 'success', text: `Saved ${budgetsToSave.length} budgets successfully` });
      setHasChanges(false);
    } catch (error: any) {
      console.error('Error saving budgets:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to save budgets' });
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const getBudgetTotal = (budget: AccountBudget): number => {
    return MONTHS.reduce((sum, month) => sum + (budget[month] || 0), 0);
  };

  const getActualTotal = (accountId: string): number => {
    const actual = actuals.get(accountId);
    if (!actual) return 0;
    return MONTHS.reduce((sum, month) => sum + (actual[month] || 0), 0);
  };

  const getVariance = (budget: number, actual: number): { value: number; percent: number; isOver: boolean } => {
    const value = budget - actual;
    const percent = budget > 0 ? ((actual / budget) * 100) : (actual > 0 ? 100 : 0);
    return { value, percent, isOver: actual > budget };
  };

  // Cell editing
  const startEdit = (accountId: string, field: string, currentValue: number) => {
    setEditingCell({ accountId, field });
    setEditValue(currentValue.toString());
  };

  const confirmEdit = () => {
    if (!editingCell) return;
    const value = parseFloat(editValue) || 0;

    if (editingCell.field === 'annual') {
      updateAnnualBudget(editingCell.accountId, value);
    } else {
      updateBudget(editingCell.accountId, editingCell.field as typeof MONTHS[number], value);
    }

    setEditingCell(null);
    setEditValue("");
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setEditValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      confirmEdit();
    } else if (e.key === 'Escape') {
      cancelEdit();
    } else if (e.key === 'Tab' && editingCell && viewMode === 'monthly') {
      e.preventDefault();
      confirmEdit();
      const currentIndex = MONTHS.indexOf(editingCell.field as typeof MONTHS[number]);
      if (currentIndex >= 0 && currentIndex < MONTHS.length - 1) {
        const budget = getBudget(editingCell.accountId);
        startEdit(editingCell.accountId, MONTHS[currentIndex + 1], budget[MONTHS[currentIndex + 1]]);
      }
    }
  };

  if (userRole !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-600">Admin access required</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-[1800px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/admin/budget')}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="h-5 w-5" />
              Back to P&L
            </button>
            <h1 className="text-2xl font-bold text-gray-900">
              Budget Manager - {budgetYear}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            {/* Year Selector */}
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-500" />
              <select
                value={budgetYear}
                onChange={(e) => setBudgetYear(parseInt(e.target.value))}
                className="border rounded-md px-3 py-2 text-sm"
              >
                {[currentYear - 1, currentYear, currentYear + 1].map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center border rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode('annual')}
                className={`flex items-center gap-1 px-3 py-2 text-sm ${
                  viewMode === 'annual' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <LayoutList className="h-4 w-4" />
                Annual
              </button>
              <button
                onClick={() => setViewMode('monthly')}
                className={`flex items-center gap-1 px-3 py-2 text-sm ${
                  viewMode === 'monthly' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <LayoutGrid className="h-4 w-4" />
                Monthly
              </button>
            </div>

            {/* Show Actuals Toggle */}
            <button
              onClick={() => setShowActuals(!showActuals)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                showActuals ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {showActuals ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              {showActuals ? 'Actuals On' : 'Actuals Off'}
            </button>

            {/* Show All Accounts */}
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showAllAccounts}
                onChange={(e) => setShowAllAccounts(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              All accounts
            </label>

            {/* Save Button */}
            <button
              onClick={saveAllBudgets}
              disabled={saving || !hasChanges}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        {/* Message */}
        {message && (
          <div className={`mb-4 p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}>
            {message.text}
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : accounts.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No expense accounts found. Enable "All accounts" to see all accounts.
          </div>
        ) : viewMode === 'annual' ? (
          // Annual View
          <div className="bg-white rounded-lg shadow overflow-auto max-h-[calc(100vh-250px)]">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="sticky left-0 z-20 bg-gray-50 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[300px]">
                    Account
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                    Annual Budget
                  </th>
                  {showActuals && (
                    <>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                        YTD Actual
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                        Variance
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                        % Used
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {accounts.map((account) => {
                  const budget = getBudget(account.qb_account_id);
                  const budgetTotal = getBudgetTotal(budget);
                  const actualTotal = getActualTotal(account.qb_account_id);
                  const variance = getVariance(budgetTotal, actualTotal);

                  return (
                    <tr key={account.qb_account_id} className="hover:bg-gray-50">
                      <td className="sticky left-0 bg-white px-4 py-3">
                        <div className="font-medium text-gray-900 text-sm" title={account.fully_qualified_name}>
                          {account.name}
                        </div>
                        <div className="text-xs text-gray-500">{account.account_type}</div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {editingCell?.accountId === account.qb_account_id && editingCell?.field === 'annual' ? (
                          <input
                            type="number"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onBlur={confirmEdit}
                            autoFocus
                            className="w-24 px-2 py-1 text-right border rounded text-sm"
                          />
                        ) : (
                          <button
                            onClick={() => startEdit(account.qb_account_id, 'annual', budgetTotal)}
                            className="text-sm font-medium text-gray-900 hover:text-blue-600 hover:bg-blue-50 px-2 py-1 rounded"
                          >
                            {formatCurrency(budgetTotal)}
                          </button>
                        )}
                      </td>
                      {showActuals && (
                        <>
                          <td className="px-4 py-3 text-right text-sm text-gray-600">
                            {formatCurrency(actualTotal)}
                          </td>
                          <td className={`px-4 py-3 text-right text-sm font-medium ${
                            variance.isOver ? 'text-red-600' : 'text-green-600'
                          }`}>
                            {variance.isOver ? '-' : '+'}{formatCurrency(Math.abs(variance.value))}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                              variance.percent > 100 ? 'bg-red-100 text-red-700' :
                              variance.percent > 80 ? 'bg-yellow-100 text-yellow-700' :
                              'bg-green-100 text-green-700'
                            }`}>
                              {variance.percent.toFixed(0)}%
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          // Monthly View
          <div className="bg-white rounded-lg shadow overflow-auto max-h-[calc(100vh-250px)]">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="sticky left-0 z-20 bg-gray-50 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[200px]">
                    Account
                  </th>
                  {MONTH_LABELS.map((month, idx) => (
                    <th key={month} colSpan={showActuals ? 2 : 1} className="bg-gray-50 px-1 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {month}
                    </th>
                  ))}
                  <th colSpan={showActuals ? 2 : 1} className="bg-gray-50 px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total
                  </th>
                </tr>
                {showActuals && (
                  <tr className="bg-gray-100">
                    <th className="sticky left-0 z-20 bg-gray-100 px-4 py-1"></th>
                    {MONTH_LABELS.map((month) => (
                      <>
                        <th key={`${month}-b`} className="bg-gray-100 px-1 py-1 text-center text-[10px] font-medium text-blue-600">
                          Bud
                        </th>
                        <th key={`${month}-a`} className="bg-gray-100 px-1 py-1 text-center text-[10px] font-medium text-gray-500">
                          Act
                        </th>
                      </>
                    ))}
                    <th className="bg-gray-100 px-1 py-1 text-center text-[10px] font-medium text-blue-600">Bud</th>
                    <th className="bg-gray-100 px-1 py-1 text-center text-[10px] font-medium text-gray-500">Act</th>
                  </tr>
                )}
              </thead>
              <tbody className="divide-y divide-gray-200">
                {accounts.map((account) => {
                  const budget = getBudget(account.qb_account_id);
                  const actual = actuals.get(account.qb_account_id);
                  const budgetTotal = getBudgetTotal(budget);
                  const actualTotal = getActualTotal(account.qb_account_id);

                  return (
                    <tr key={account.qb_account_id} className="hover:bg-gray-50">
                      <td className="sticky left-0 bg-white px-4 py-2">
                        <div className="font-medium text-gray-900 text-xs truncate" title={account.fully_qualified_name}>
                          {account.name}
                        </div>
                      </td>
                      {MONTHS.map((month) => {
                        const budgetValue = budget[month] || 0;
                        const actualValue = actual?.[month] || 0;
                        const isEditing = editingCell?.accountId === account.qb_account_id && editingCell?.field === month;

                        return (
                          <>
                            <td key={`${month}-budget`} className="px-1 py-2 text-right">
                              {isEditing ? (
                                <input
                                  type="number"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onKeyDown={handleKeyDown}
                                  onBlur={confirmEdit}
                                  autoFocus
                                  className="w-16 px-1 py-0.5 text-right border rounded text-xs"
                                />
                              ) : (
                                <button
                                  onClick={() => startEdit(account.qb_account_id, month, budgetValue)}
                                  className={`text-xs px-1 py-0.5 rounded hover:bg-blue-50 ${
                                    budgetValue > 0 ? 'text-gray-900' : 'text-gray-300'
                                  }`}
                                >
                                  {budgetValue > 0 ? formatCurrency(budgetValue) : '-'}
                                </button>
                              )}
                            </td>
                            {showActuals && (
                              <td key={`${month}-actual`} className={`px-1 py-2 text-right text-xs ${
                                actualValue > budgetValue && budgetValue > 0 ? 'text-red-600 font-medium' : 'text-gray-500'
                              }`}>
                                {actualValue > 0 ? formatCurrency(actualValue) : '-'}
                              </td>
                            )}
                          </>
                        );
                      })}
                      {/* Totals */}
                      <td className="px-2 py-2 text-right text-xs font-semibold text-gray-900 bg-gray-50">
                        {formatCurrency(budgetTotal)}
                      </td>
                      {showActuals && (
                        <td className={`px-2 py-2 text-right text-xs font-semibold bg-gray-50 ${
                          actualTotal > budgetTotal && budgetTotal > 0 ? 'text-red-600' : 'text-gray-600'
                        }`}>
                          {formatCurrency(actualTotal)}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
