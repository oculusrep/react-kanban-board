import { useState, useEffect, Fragment } from "react";
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

// Hierarchical structure for P&L display
interface PLCategory {
  name: string;
  fullPath: string;
  account?: QBAccount;
  amount: number;
  budgetAmount: number;
  transactions: QBExpense[];
  children: PLCategory[];
  isParent: boolean;
  depth: number;
}

interface PLSection {
  title: string;
  accountTypes: string[];
  categories: PLCategory[];
  total: number;
  budgetTotal: number;
  isIncome: boolean;
}

export default function BudgetDashboardPage() {
  const navigate = useNavigate();
  const { userRole } = useAuth();

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [accounts, setAccounts] = useState<QBAccount[]>([]);
  const [expenses, setExpenses] = useState<QBExpense[]>([]);
  const [plSections, setPLSections] = useState<PLSection[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedTransactions, setExpandedTransactions] = useState<Set<string>>(new Set());
  const [editingBudget, setEditingBudget] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [recategorizingExpense, setRecategorizingExpense] = useState<string | null>(null);
  const [updatingExpense, setUpdatingExpense] = useState<string | null>(null);

  // Date filter state
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);

  useEffect(() => {
    document.title = "P&L Statement | OVIS Admin";
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
        .order('fully_qualified_name');

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

      // Fetch expenses for the selected period with pagination
      let allExpenses: QBExpense[] = [];
      let page = 0;
      const pageSize = 1000;

      while (true) {
        const { data: expenseData, error: expenseError } = await supabase
          .from('qb_expense')
          .select('*')
          .gte('transaction_date', startDate)
          .lt('transaction_date', endDate)
          .order('transaction_date', { ascending: false })
          .order('id', { ascending: true })
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (expenseError) throw expenseError;
        if (!expenseData || expenseData.length === 0) break;
        allExpenses = [...allExpenses, ...expenseData];
        if (expenseData.length < pageSize) break;
        page++;
      }

      setExpenses(allExpenses);
      buildPLStructure(accountData || [], allExpenses);
    } catch (error: any) {
      console.error('Error fetching budget data:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to load data' });
    } finally {
      setLoading(false);
    }
  };

  const buildPLStructure = (accountList: QBAccount[], expenseList: QBExpense[]) => {
    // Group expenses by account
    const expensesByAccount = new Map<string, QBExpense[]>();
    for (const expense of expenseList) {
      const accountId = expense.account_id;
      if (!expensesByAccount.has(accountId)) {
        expensesByAccount.set(accountId, []);
      }
      expensesByAccount.get(accountId)!.push(expense);
    }

    // Build hierarchical categories from fully_qualified_name
    const buildHierarchy = (accounts: QBAccount[], accountTypes: string[]): PLCategory[] => {
      const filteredAccounts = accounts.filter(a => accountTypes.includes(a.account_type));
      const categoryMap = new Map<string, PLCategory>();

      // First pass: create all categories including parents
      for (const account of filteredAccounts) {
        const parts = account.fully_qualified_name.split(':');
        let currentPath = '';

        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          const parentPath = currentPath;
          currentPath = currentPath ? `${currentPath}:${part}` : part;

          if (!categoryMap.has(currentPath)) {
            const isLeaf = i === parts.length - 1;
            const transactions = isLeaf ? (expensesByAccount.get(account.qb_account_id) || []) : [];
            const amount = transactions.reduce((sum, t) => sum + t.amount, 0);

            categoryMap.set(currentPath, {
              name: part,
              fullPath: currentPath,
              account: isLeaf ? account : undefined,
              amount: amount,
              budgetAmount: isLeaf ? (account.budget_amount || 0) : 0,
              transactions: transactions,
              children: [],
              isParent: !isLeaf,
              depth: i
            });
          }
        }
      }

      // Second pass: build tree structure and calculate parent totals
      const rootCategories: PLCategory[] = [];

      for (const [path, category] of categoryMap) {
        const parts = path.split(':');
        if (parts.length === 1) {
          rootCategories.push(category);
        } else {
          const parentPath = parts.slice(0, -1).join(':');
          const parent = categoryMap.get(parentPath);
          if (parent) {
            parent.children.push(category);
          }
        }
      }

      // Calculate totals for parent categories (bottom-up)
      const calculateTotals = (cat: PLCategory): { amount: number; budget: number } => {
        if (cat.children.length === 0) {
          return { amount: cat.amount, budget: cat.budgetAmount };
        }

        let totalAmount = cat.amount;
        let totalBudget = cat.budgetAmount;

        for (const child of cat.children) {
          const childTotals = calculateTotals(child);
          totalAmount += childTotals.amount;
          totalBudget += childTotals.budget;
        }

        cat.amount = totalAmount;
        cat.budgetAmount = totalBudget;
        return { amount: totalAmount, budget: totalBudget };
      };

      for (const root of rootCategories) {
        calculateTotals(root);
      }

      // Sort by amount (highest first) at each level
      const sortCategories = (cats: PLCategory[]) => {
        cats.sort((a, b) => b.amount - a.amount);
        for (const cat of cats) {
          sortCategories(cat.children);
        }
      };
      sortCategories(rootCategories);

      return rootCategories;
    };

    // Build P&L sections
    const sections: PLSection[] = [
      {
        title: 'Income',
        accountTypes: ['Income', 'Other Income'],
        categories: buildHierarchy(accountList, ['Income', 'Other Income']),
        total: 0,
        budgetTotal: 0,
        isIncome: true
      },
      {
        title: 'Cost of Goods Sold',
        accountTypes: ['Cost of Goods Sold'],
        categories: buildHierarchy(accountList, ['Cost of Goods Sold']),
        total: 0,
        budgetTotal: 0,
        isIncome: false
      },
      {
        title: 'Operating Expenses',
        accountTypes: ['Expense', 'Other Expense'],
        categories: buildHierarchy(accountList, ['Expense', 'Other Expense']),
        total: 0,
        budgetTotal: 0,
        isIncome: false
      }
    ];

    // Calculate section totals
    for (const section of sections) {
      section.total = section.categories.reduce((sum, c) => sum + c.amount, 0);
      section.budgetTotal = section.categories.reduce((sum, c) => sum + c.budgetAmount, 0);
    }

    setPLSections(sections);
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

  const toggleCategory = (path: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  };

  const toggleTransactions = (path: string) => {
    setExpandedTransactions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
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

  const formatCurrency = (amount: number, showSign: boolean = false) => {
    const formatted = Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2 });
    if (showSign && amount < 0) {
      return `($${formatted})`;
    }
    return `$${formatted}`;
  };

  // Render a category row with proper indentation
  const renderCategory = (category: PLCategory, sectionIsIncome: boolean) => {
    const isExpanded = expandedCategories.has(category.fullPath);
    const showTransactions = expandedTransactions.has(category.fullPath);
    const hasChildren = category.children.length > 0;
    const hasTransactions = category.transactions.length > 0;
    const isEditing = category.account && editingBudget === category.account.id;
    const indent = category.depth * 24;

    return (
      <Fragment key={category.fullPath}>
        <tr className={`hover:bg-gray-50 ${category.isParent ? 'bg-gray-50/50' : ''}`}>
          <td className="py-2 pr-4" style={{ paddingLeft: `${16 + indent}px` }}>
            <div className="flex items-center gap-2">
              {(hasChildren || hasTransactions) ? (
                <button
                  onClick={() => hasChildren ? toggleCategory(category.fullPath) : toggleTransactions(category.fullPath)}
                  className="p-0.5 hover:bg-gray-200 rounded"
                >
                  {(hasChildren ? isExpanded : showTransactions) ? (
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  )}
                </button>
              ) : (
                <span className="w-5" />
              )}
              <span className={`${category.isParent ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                {category.name}
              </span>
            </div>
          </td>
          <td className={`py-2 text-right tabular-nums ${category.isParent ? 'font-semibold' : ''}`}>
            {category.amount > 0 ? formatCurrency(category.amount) : '-'}
          </td>
          <td className="py-2 text-right tabular-nums text-gray-500">
            {isEditing ? (
              <input
                type="number"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="w-24 px-2 py-1 border border-gray-300 rounded text-right text-sm"
                placeholder="0.00"
                autoFocus
              />
            ) : (
              category.budgetAmount > 0 ? formatCurrency(category.budgetAmount) : '-'
            )}
          </td>
          <td className="py-2 text-right tabular-nums">
            {category.budgetAmount > 0 && category.amount > 0 && (
              <span className={category.amount > category.budgetAmount ? 'text-red-600' : 'text-green-600'}>
                {((category.amount / category.budgetAmount) * 100).toFixed(0)}%
              </span>
            )}
          </td>
          <td className="py-2 pl-4 text-center w-20">
            {category.account && (
              isEditing ? (
                <div className="flex items-center justify-center gap-1">
                  <button
                    onClick={() => saveBudget(category.account!.id)}
                    className="p-1 text-green-600 hover:text-green-800"
                  >
                    <Check className="h-3 w-3" />
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="p-1 text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => startEditBudget(category.account!)}
                  className="p-1 text-gray-400 hover:text-blue-600"
                  title="Edit budget"
                >
                  <Edit2 className="h-3 w-3" />
                </button>
              )
            )}
          </td>
        </tr>

        {/* Render children if expanded */}
        {hasChildren && isExpanded && category.children.map(child => renderCategory(child, sectionIsIncome))}

        {/* Render transactions if expanded */}
        {hasTransactions && showTransactions && (
          <tr>
            <td colSpan={5} className="py-0 bg-blue-50/30">
              <div className="py-2" style={{ paddingLeft: `${40 + indent}px` }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 uppercase">
                      <th className="py-1 text-left font-medium">Date</th>
                      <th className="py-1 text-left font-medium">Vendor</th>
                      <th className="py-1 text-left font-medium">Description</th>
                      <th className="py-1 text-right font-medium">Amount</th>
                      <th className="py-1 text-center font-medium w-32">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {category.transactions.slice(0, 15).map((txn) => {
                      const canRecategorize = !!txn.qb_entity_type && !!txn.qb_entity_id;
                      const isRecategorizing = recategorizingExpense === txn.id;
                      const isUpdating = updatingExpense === txn.id;

                      return (
                        <tr key={txn.id} className="border-t border-gray-100">
                          <td className="py-1.5 text-gray-600 w-24">
                            {new Date(txn.transaction_date).toLocaleDateString()}
                          </td>
                          <td className="py-1.5 text-gray-900 w-40 truncate">{txn.vendor_name || '-'}</td>
                          <td className="py-1.5 text-gray-600 truncate max-w-xs" title={txn.description || undefined}>
                            {txn.description || '-'}
                          </td>
                          <td className="py-1.5 text-right font-medium text-gray-900 w-28 tabular-nums">
                            {formatCurrency(txn.amount)}
                          </td>
                          <td className="py-1.5 text-center">
                            {isUpdating ? (
                              <span className="text-gray-500 text-xs">Updating...</span>
                            ) : isRecategorizing ? (
                              <div className="flex items-center gap-1 justify-center">
                                <select
                                  className="text-xs border border-gray-300 rounded px-1 py-0.5 max-w-[100px]"
                                  defaultValue=""
                                  onChange={(e) => {
                                    if (e.target.value) {
                                      const selectedAccount = accounts.find(a => a.qb_account_id === e.target.value);
                                      handleRecategorize(txn.id, e.target.value, selectedAccount?.name || '');
                                    }
                                  }}
                                >
                                  <option value="">Select...</option>
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
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                    {category.transactions.length > 15 && (
                      <tr className="border-t border-gray-100">
                        <td colSpan={5} className="py-1.5 text-center text-gray-500 text-xs">
                          ... and {category.transactions.length - 15} more transactions
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </td>
          </tr>
        )}
      </Fragment>
    );
  };

  // Calculate P&L totals
  const incomeSection = plSections.find(s => s.title === 'Income');
  const cogsSection = plSections.find(s => s.title === 'Cost of Goods Sold');
  const expenseSection = plSections.find(s => s.title === 'Operating Expenses');

  const totalIncome = incomeSection?.total || 0;
  const totalCOGS = cogsSection?.total || 0;
  const grossProfit = totalIncome - totalCOGS;
  const totalExpenses = expenseSection?.total || 0;
  const netIncome = grossProfit - totalExpenses;

  // Check access
  if (userRole !== 'admin') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900">Access Denied</h1>
          <p className="text-gray-600 mt-2">Only administrators can access the P&L statement.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading P&L data...</p>
        </div>
      </div>
    );
  }

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const periodLabel = selectedMonth !== null
    ? `${months[selectedMonth]} ${selectedYear}`
    : `Full Year ${selectedYear}`;

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-5xl mx-auto">
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
              <h1 className="text-3xl font-bold text-gray-900">Profit & Loss Statement</h1>
              <p className="mt-1 text-gray-600">{periodLabel}</p>
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
                Sync Transactions
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

        {/* P&L Statement */}
        <div className="bg-white rounded-lg shadow">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 text-center">
            <h2 className="text-lg font-semibold text-gray-900">OVIS Produce</h2>
            <p className="text-sm text-gray-600">Profit and Loss</p>
            <p className="text-sm text-gray-500">{periodLabel}</p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Account</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider w-32">Actual</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider w-32">Budget</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider w-20">% Used</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider w-20"></th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {/* Income Section */}
                {incomeSection && incomeSection.categories.length > 0 && (
                  <>
                    <tr className="bg-green-50/50">
                      <td colSpan={5} className="px-4 py-3 font-bold text-green-800 text-base">
                        Income
                      </td>
                    </tr>
                    {incomeSection.categories.map(cat => renderCategory(cat, true))}
                    <tr className="border-t-2 border-green-200 bg-green-50/30">
                      <td className="px-4 py-2 font-bold text-green-800">Total Income</td>
                      <td className="px-4 py-2 text-right font-bold text-green-800 tabular-nums">{formatCurrency(totalIncome)}</td>
                      <td className="px-4 py-2 text-right font-bold text-green-700 tabular-nums">{incomeSection.budgetTotal > 0 ? formatCurrency(incomeSection.budgetTotal) : '-'}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </>
                )}

                {/* COGS Section */}
                {cogsSection && cogsSection.categories.length > 0 && (
                  <>
                    <tr className="bg-orange-50/50">
                      <td colSpan={5} className="px-4 py-3 font-bold text-orange-800 text-base">
                        Cost of Goods Sold
                      </td>
                    </tr>
                    {cogsSection.categories.map(cat => renderCategory(cat, false))}
                    <tr className="border-t-2 border-orange-200 bg-orange-50/30">
                      <td className="px-4 py-2 font-bold text-orange-800">Total COGS</td>
                      <td className="px-4 py-2 text-right font-bold text-orange-800 tabular-nums">{formatCurrency(totalCOGS)}</td>
                      <td className="px-4 py-2 text-right font-bold text-orange-700 tabular-nums">{cogsSection.budgetTotal > 0 ? formatCurrency(cogsSection.budgetTotal) : '-'}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </>
                )}

                {/* Gross Profit */}
                <tr className="bg-blue-100 border-y-2 border-blue-300">
                  <td className="px-4 py-3 font-bold text-blue-900 text-base">Gross Profit</td>
                  <td className={`px-4 py-3 text-right font-bold text-base tabular-nums ${grossProfit >= 0 ? 'text-blue-900' : 'text-red-600'}`}>
                    {formatCurrency(grossProfit)}
                  </td>
                  <td colSpan={3}></td>
                </tr>

                {/* Expenses Section */}
                {expenseSection && expenseSection.categories.length > 0 && (
                  <>
                    <tr className="bg-red-50/50">
                      <td colSpan={5} className="px-4 py-3 font-bold text-red-800 text-base">
                        Operating Expenses
                      </td>
                    </tr>
                    {expenseSection.categories.map(cat => renderCategory(cat, false))}
                    <tr className="border-t-2 border-red-200 bg-red-50/30">
                      <td className="px-4 py-2 font-bold text-red-800">Total Expenses</td>
                      <td className="px-4 py-2 text-right font-bold text-red-800 tabular-nums">{formatCurrency(totalExpenses)}</td>
                      <td className="px-4 py-2 text-right font-bold text-red-700 tabular-nums">{expenseSection.budgetTotal > 0 ? formatCurrency(expenseSection.budgetTotal) : '-'}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </>
                )}

                {/* Net Income */}
                <tr className="bg-gray-800 text-white">
                  <td className="px-4 py-4 font-bold text-lg">Net Income</td>
                  <td className={`px-4 py-4 text-right font-bold text-lg tabular-nums ${netIncome >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                    {formatCurrency(netIncome)}
                  </td>
                  <td colSpan={3}></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-full">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Total Income</p>
                <p className="text-lg font-bold text-green-600">{formatCurrency(totalIncome)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-full">
                <DollarSign className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Cost of Goods</p>
                <p className="text-lg font-bold text-orange-600">{formatCurrency(totalCOGS)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-full">
                <TrendingDown className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Expenses</p>
                <p className="text-lg font-bold text-red-600">{formatCurrency(totalExpenses)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${netIncome >= 0 ? 'bg-blue-100' : 'bg-red-100'}`}>
                <DollarSign className={`h-5 w-5 ${netIncome >= 0 ? 'text-blue-600' : 'text-red-600'}`} />
              </div>
              <div>
                <p className="text-xs text-gray-500">Net Income</p>
                <p className={`text-lg font-bold ${netIncome >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                  {formatCurrency(netIncome)}
                </p>
              </div>
            </div>
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
