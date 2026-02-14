import { useState, useEffect, Fragment, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import {
  ArrowLeft,
  RefreshCw,
  Save,
  ChevronRight,
  ChevronDown,
  ArrowRightCircle,
  Calendar,
  ChevronsUpDown,
  ChevronsDownUp
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

// Hierarchical node for account tree
interface AccountNode {
  name: string;
  fullPath: string;
  account?: QBAccount; // Only leaf nodes have the actual account
  children: AccountNode[];
  depth: number;
}

// P&L Section definition
interface PLSection {
  title: string;
  accountTypes: string[];
  accounts: AccountNode[];
}

// P&L section definitions (order matters)
const SECTION_DEFINITIONS = [
  { title: 'Cost of Goods Sold', accountTypes: ['Cost of Goods Sold'] },
  { title: 'Operating Expenses', accountTypes: ['Expense'] },
  { title: 'Other Expenses', accountTypes: ['Other Expense'] },
];

export default function BudgetSetupPage() {
  const navigate = useNavigate();
  const { userRole } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [accounts, setAccounts] = useState<QBAccount[]>([]);
  const [budgets, setBudgets] = useState<Map<string, AccountBudget>>(new Map());
  const [priorYearActuals, setPriorYearActuals] = useState<Map<string, MonthlyActual>>(new Map());
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editingCell, setEditingCell] = useState<{ accountId: string; month: typeof MONTHS[number] } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [hasChanges, setHasChanges] = useState(false);

  // Year selection
  const currentYear = new Date().getFullYear();
  const [budgetYear, setBudgetYear] = useState(currentYear);
  const priorYear = budgetYear - 1;

  // Show all accounts toggle (not just those with prior year activity)
  const [showAllAccounts, setShowAllAccounts] = useState(false);
  const [allExpenseAccounts, setAllExpenseAccounts] = useState<QBAccount[]>([]);

  // Collapsed sections for hierarchy
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    document.title = "Budget Setup | OVIS Admin";
    fetchData();
  }, [budgetYear]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch expense accounts that had activity in the prior year
      const { data: expenseAccounts, error: accountsError } = await supabase
        .from('qb_account')
        .select('*')
        .in('account_type', ['Expense', 'Other Expense', 'Cost of Goods Sold'])
        .eq('active', true)
        .order('fully_qualified_name');

      if (accountsError) throw accountsError;

      // Fetch prior year actuals grouped by month
      const { data: expenses, error: expensesError } = await supabase
        .from('qb_expense')
        .select('account_id, transaction_date, amount')
        .gte('transaction_date', `${priorYear}-01-01`)
        .lte('transaction_date', `${priorYear}-12-31`)
        .in('transaction_type', ['Purchase', 'Bill']);

      if (expensesError) throw expensesError;

      // Aggregate expenses by account and month
      const actualsByAccount = new Map<string, MonthlyActual>();
      for (const expense of expenses || []) {
        const month = new Date(expense.transaction_date).getMonth(); // 0-11
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

      // Store all expense accounts
      setAllExpenseAccounts(expenseAccounts || []);

      // Filter accounts to only those with prior year activity (default view)
      const accountsWithActivity = (expenseAccounts || []).filter(
        acc => actualsByAccount.has(acc.qb_account_id)
      );

      // Fetch existing budgets for the selected year
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

      setAccounts(accountsWithActivity);
      setPriorYearActuals(actualsByAccount);
      setBudgets(budgetMap);
      setHasChanges(false);
    } catch (error: any) {
      console.error('Error fetching data:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to load data' });
    } finally {
      setLoading(false);
    }
  };

  // Get or create budget for an account
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

  // Update a single month's budget
  const updateBudget = (accountId: string, month: typeof MONTHS[number], value: number) => {
    const newBudgets = new Map(budgets);
    const budget = getBudget(accountId);
    budget[month] = value;
    newBudgets.set(accountId, budget);
    setBudgets(newBudgets);
    setHasChanges(true);
  };

  // Fill forward: copy value to all subsequent months
  const fillForward = (accountId: string, startMonth: typeof MONTHS[number], value: number) => {
    const startIndex = MONTHS.indexOf(startMonth);
    const newBudgets = new Map(budgets);
    const budget = getBudget(accountId);

    for (let i = startIndex; i < MONTHS.length; i++) {
      budget[MONTHS[i]] = value;
    }

    newBudgets.set(accountId, budget);
    setBudgets(newBudgets);
    setHasChanges(true);
  };

  // Copy prior year actuals as budget
  const copyFromPriorYear = (accountId: string) => {
    console.log('copyFromPriorYear called with:', accountId);
    console.log('priorYearActuals keys:', Array.from(priorYearActuals.keys()));

    const actuals = priorYearActuals.get(accountId);
    console.log('Found actuals:', actuals);

    if (!actuals) {
      console.log('No actuals found for account:', accountId);
      setMessage({ type: 'error', text: `No prior year actuals found for this account` });
      return;
    }

    const newBudgets = new Map(budgets);
    const budget = getBudget(accountId);

    for (const month of MONTHS) {
      budget[month] = Math.round(actuals[month] * 100) / 100;
    }

    newBudgets.set(accountId, budget);
    setBudgets(newBudgets);
    setHasChanges(true);
    setMessage({ type: 'success', text: `Copied ${priorYear} actuals to ${budgetYear} budget` });
  };

  // Save all budgets
  const saveAllBudgets = async () => {
    setSaving(true);
    setMessage(null);

    try {
      // Prepare all budgets for upsert
      const budgetsToSave = Array.from(budgets.values()).map(budget => ({
        qb_account_id: budget.qb_account_id,
        year: budgetYear,
        jan: budget.jan,
        feb: budget.feb,
        mar: budget.mar,
        apr: budget.apr,
        may: budget.may,
        jun: budget.jun,
        jul: budget.jul,
        aug: budget.aug,
        sep: budget.sep,
        oct: budget.oct,
        nov: budget.nov,
        dec: budget.dec,
        notes: budget.notes,
        updated_at: new Date().toISOString()
      }));

      if (budgetsToSave.length === 0) {
        setMessage({ type: 'error', text: 'No budgets to save' });
        return;
      }

      const { error } = await supabase
        .from('account_budget')
        .upsert(budgetsToSave, { onConflict: 'qb_account_id,year' });

      if (error) throw error;

      setMessage({ type: 'success', text: `Saved ${budgetsToSave.length} budget entries` });
      setHasChanges(false);
    } catch (error: any) {
      console.error('Error saving budgets:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to save budgets' });
    } finally {
      setSaving(false);
    }
  };

  // Sync expenses from QBO
  const syncExpenses = async () => {
    setSyncing(true);
    setMessage(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quickbooks-sync-expenses`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ startDate: `${priorYear}-01-01` })
        }
      );

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to sync expenses');
      }

      setMessage({ type: 'success', text: `Synced ${result.syncedCount} expenses` });
      fetchData();
    } catch (error: any) {
      console.error('Error syncing expenses:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to sync expenses' });
    } finally {
      setSyncing(false);
    }
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  // Get displayed accounts based on toggle
  const displayedAccounts = showAllAccounts ? allExpenseAccounts : accounts;

  // Build hierarchical tree from accounts
  const buildHierarchy = (sectionAccounts: QBAccount[]): AccountNode[] => {
    const roots: AccountNode[] = [];
    const nodeMap = new Map<string, AccountNode>();

    const sortedAccounts = [...sectionAccounts].sort((a, b) =>
      a.fully_qualified_name.localeCompare(b.fully_qualified_name)
    );

    for (const account of sortedAccounts) {
      const parts = account.fully_qualified_name.split(':');
      let currentPath = '';

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const parentPath = currentPath;
        currentPath = currentPath ? `${currentPath}:${part}` : part;
        const depth = i;

        if (!nodeMap.has(currentPath)) {
          const isLeaf = i === parts.length - 1;
          const node: AccountNode = {
            name: part,
            fullPath: currentPath,
            account: isLeaf ? account : undefined,
            children: [],
            depth
          };
          nodeMap.set(currentPath, node);

          if (parentPath && nodeMap.has(parentPath)) {
            nodeMap.get(parentPath)!.children.push(node);
          } else if (depth === 0) {
            roots.push(node);
          }
        } else if (i === parts.length - 1) {
          nodeMap.get(currentPath)!.account = account;
        }
      }
    }

    return roots;
  };

  // Build sections with hierarchical accounts
  const sections = useMemo((): PLSection[] => {
    return SECTION_DEFINITIONS.map(def => {
      const sectionAccounts = displayedAccounts.filter(a => def.accountTypes.includes(a.account_type));
      return {
        title: def.title,
        accountTypes: def.accountTypes,
        accounts: buildHierarchy(sectionAccounts)
      };
    }).filter(section => section.accounts.length > 0);
  }, [displayedAccounts]);

  // Flatten section tree for rendering
  const flattenSection = (sectionRoots: AccountNode[]): { node: AccountNode; isParent: boolean }[] => {
    const result: { node: AccountNode; isParent: boolean }[] = [];

    const traverse = (nodes: AccountNode[]) => {
      for (const node of nodes) {
        const isParent = node.children.length > 0;
        result.push({ node, isParent });

        if (isParent && !collapsedSections.has(node.fullPath)) {
          traverse(node.children);
        }
      }
    };

    traverse(sectionRoots);
    return result;
  };

  const toggleSection = (path: string) => {
    const newCollapsed = new Set(collapsedSections);
    if (newCollapsed.has(path)) {
      newCollapsed.delete(path);
    } else {
      newCollapsed.add(path);
    }
    setCollapsedSections(newCollapsed);
  };

  // Get all collapsible parent paths (NOT section headers)
  const getAllParentPaths = (): string[] => {
    const paths: string[] = [];

    const addParentPaths = (nodes: AccountNode[]) => {
      for (const node of nodes) {
        if (node.children.length > 0) {
          paths.push(node.fullPath);
          addParentPaths(node.children);
        }
      }
    };

    sections.forEach(section => {
      addParentPaths(section.accounts);
    });

    return paths;
  };

  const isAllCollapsed = useMemo(() => {
    const allPaths = getAllParentPaths();
    if (allPaths.length === 0) return false;
    return allPaths.every(path => collapsedSections.has(path));
  }, [sections, collapsedSections]);

  const toggleCollapseAll = () => {
    if (isAllCollapsed) {
      setCollapsedSections(new Set());
    } else {
      setCollapsedSections(new Set(getAllParentPaths()));
    }
  };

  // Calculate totals for a node (including children)
  const getNodeBudgetTotal = (node: AccountNode): number => {
    if (node.account) {
      const budget = getBudget(node.account.qb_account_id);
      return MONTHS.reduce((sum, month) => sum + (budget[month] || 0), 0);
    }
    return node.children.reduce((sum, child) => sum + getNodeBudgetTotal(child), 0);
  };

  const getNodePriorTotal = (node: AccountNode): number => {
    if (node.account) {
      return getPriorYearTotal(node.account.qb_account_id);
    }
    return node.children.reduce((sum, child) => sum + getNodePriorTotal(child), 0);
  };

  const getNodeMonthBudget = (node: AccountNode, month: typeof MONTHS[number]): number => {
    if (node.account) {
      const budget = getBudget(node.account.qb_account_id);
      return budget[month] || 0;
    }
    return node.children.reduce((sum, child) => sum + getNodeMonthBudget(child, month), 0);
  };

  const getNodeMonthActual = (node: AccountNode, month: typeof MONTHS[number]): number => {
    if (node.account) {
      const actuals = priorYearActuals.get(node.account.qb_account_id);
      return actuals?.[month] || 0;
    }
    return node.children.reduce((sum, child) => sum + getNodeMonthActual(child, month), 0);
  };

  // Calculate totals for an account
  const getAccountTotal = (budget: AccountBudget): number => {
    return MONTHS.reduce((sum, month) => sum + (budget[month] || 0), 0);
  };

  const getPriorYearTotal = (accountId: string): number => {
    const actuals = priorYearActuals.get(accountId);
    if (!actuals) return 0;
    return MONTHS.reduce((sum, month) => sum + (actuals[month] || 0), 0);
  };

  // Handle cell edit
  const startEdit = (accountId: string, month: typeof MONTHS[number]) => {
    const budget = getBudget(accountId);
    setEditingCell({ accountId, month });
    setEditValue(budget[month].toString());
  };

  const confirmEdit = () => {
    if (!editingCell) return;
    const value = parseFloat(editValue) || 0;
    updateBudget(editingCell.accountId, editingCell.month, value);
    setEditingCell(null);
    setEditValue("");
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setEditValue("");
  };

  // Handle keyboard events for cell editing
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      confirmEdit();
    } else if (e.key === 'Escape') {
      cancelEdit();
    } else if (e.key === 'Tab' && editingCell) {
      e.preventDefault();
      confirmEdit();
      // Move to next month
      const currentIndex = MONTHS.indexOf(editingCell.month);
      if (currentIndex < MONTHS.length - 1) {
        startEdit(editingCell.accountId, MONTHS[currentIndex + 1]);
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
              Budget Setup - {budgetYear}
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
                  <option key={year} value={year}>{year} Budget</option>
                ))}
              </select>
            </div>

            {/* Show All Accounts Toggle */}
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showAllAccounts}
                onChange={(e) => setShowAllAccounts(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Show all accounts
            </label>

            {/* Collapse/Expand All */}
            <button
              onClick={toggleCollapseAll}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-gray-100 text-gray-600 hover:bg-gray-200"
              title={isAllCollapsed ? 'Expand all sections' : 'Collapse all sections'}
            >
              {isAllCollapsed ? <ChevronsDownUp className="h-4 w-4" /> : <ChevronsUpDown className="h-4 w-4" />}
              {isAllCollapsed ? 'Expand' : 'Collapse'}
            </button>

            {/* Sync Button */}
            <button
              onClick={syncExpenses}
              disabled={syncing}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync QBO'}
            </button>

            {/* Save Button */}
            <button
              onClick={saveAllBudgets}
              disabled={saving || !hasChanges}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save All'}
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

        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-blue-800">
            <strong>How to use:</strong> Click any budget cell to edit. Press <kbd className="px-1 bg-blue-100 rounded">Tab</kbd> to move to the next month.
            Use the <ArrowRightCircle className="inline h-4 w-4 mx-1" /> button to fill a value forward to all remaining months.
            The gray row shows {priorYear} actuals for reference.
          </p>
        </div>

        {/* Budget Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : displayedAccounts.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            {showAllAccounts
              ? 'No expense accounts found. Try syncing from QBO.'
              : 'No expense accounts with prior year activity found. Enable "Show all accounts" to see new accounts, or try syncing from QBO.'}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-auto max-h-[calc(100vh-300px)]">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="sticky left-0 z-20 bg-gray-50 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[300px]">
                    Account
                  </th>
                  {MONTH_LABELS.map((month, idx) => (
                    <th key={month} colSpan={2} className="bg-gray-50 px-1 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {month}
                    </th>
                  ))}
                  <th colSpan={2} className="bg-gray-50 px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                    Total
                  </th>
                  <th className="bg-gray-50 px-2 py-3 w-10"></th>
                </tr>
                <tr className="bg-gray-100">
                  <th className="sticky left-0 z-20 bg-gray-100 px-4 py-1"></th>
                  {MONTH_LABELS.map((month) => (
                    <Fragment key={month}>
                      <th className="bg-emerald-50 px-1 py-1 text-center text-[10px] font-medium text-emerald-600">
                        {priorYear}
                      </th>
                      <th className="bg-blue-100 px-1 py-1 text-center text-[10px] font-medium text-blue-700">
                        {budgetYear}
                      </th>
                    </Fragment>
                  ))}
                  <th className="bg-emerald-50 px-1 py-1 text-center text-[10px] font-medium text-emerald-600">{priorYear}</th>
                  <th className="bg-blue-100 px-1 py-1 text-center text-[10px] font-medium text-blue-700">{budgetYear}</th>
                  <th className="bg-gray-100"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {sections.map((section) => {
                  const flattenedNodes = flattenSection(section.accounts);
                  const isSectionCollapsed = collapsedSections.has(`section:${section.title}`);

                  // Calculate section totals
                  const sectionBudgetTotal = section.accounts.reduce((sum, node) => sum + getNodeBudgetTotal(node), 0);
                  const sectionPriorTotal = section.accounts.reduce((sum, node) => sum + getNodePriorTotal(node), 0);

                  // Calculate section monthly totals
                  const getSectionMonthBudget = (month: typeof MONTHS[number]) =>
                    section.accounts.reduce((sum, node) => sum + getNodeMonthBudget(node, month), 0);
                  const getSectionMonthActual = (month: typeof MONTHS[number]) =>
                    section.accounts.reduce((sum, node) => sum + getNodeMonthActual(node, month), 0);

                  return (
                    <Fragment key={section.title}>
                      {/* Section Header Row */}
                      <tr className="bg-blue-50 border-t-2 border-blue-200">
                        <td className="sticky left-0 bg-blue-50 px-4 py-2">
                          <button
                            onClick={() => toggleSection(`section:${section.title}`)}
                            className="flex items-center gap-2 text-blue-900 font-bold text-sm"
                          >
                            {isSectionCollapsed ? (
                              <ChevronRight className="h-5 w-5" />
                            ) : (
                              <ChevronDown className="h-5 w-5" />
                            )}
                            {section.title}
                          </button>
                        </td>
                        {MONTHS.map((month) => {
                          const monthActual = getSectionMonthActual(month);
                          const monthBudget = getSectionMonthBudget(month);
                          return (
                            <Fragment key={month}>
                              <td className="bg-emerald-100/70 px-1 py-2 text-right text-xs font-bold text-emerald-800">
                                {monthActual > 0 ? formatCurrency(monthActual) : '-'}
                              </td>
                              <td className="bg-blue-200/70 px-1 py-2 text-right text-xs font-bold text-blue-900">
                                {monthBudget > 0 ? formatCurrency(monthBudget) : '-'}
                              </td>
                            </Fragment>
                          );
                        })}
                        <td className="bg-emerald-100/70 px-2 py-2 text-right text-xs font-bold text-emerald-800">
                          {formatCurrency(sectionPriorTotal)}
                        </td>
                        <td className="bg-blue-200/70 px-2 py-2 text-right text-xs font-bold text-blue-900">
                          {formatCurrency(sectionBudgetTotal)}
                        </td>
                        <td className="bg-blue-50"></td>
                      </tr>

                      {/* Section Content (if not collapsed) */}
                      {!isSectionCollapsed && flattenedNodes.map(({ node, isParent }) => {
                        const budgetTotal = getNodeBudgetTotal(node);
                        const priorTotal = getNodePriorTotal(node);
                        const isNodeCollapsed = collapsedSections.has(node.fullPath);
                        const isLeaf = !!node.account;

                        return (
                          <tr
                            key={node.fullPath}
                            className={`group ${isParent ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
                          >
                            <td className={`sticky left-0 px-4 py-2 ${isParent ? 'bg-gray-50' : 'bg-white group-hover:bg-gray-50'}`}>
                              <div
                                className="flex items-center gap-1"
                                style={{ paddingLeft: `${(node.depth + 1) * 16}px` }}
                              >
                                {isParent ? (
                                  <button
                                    onClick={() => toggleSection(node.fullPath)}
                                    className="p-0.5 hover:bg-gray-200 rounded"
                                  >
                                    {isNodeCollapsed ? (
                                      <ChevronRight className="h-4 w-4 text-gray-500" />
                                    ) : (
                                      <ChevronDown className="h-4 w-4 text-gray-500" />
                                    )}
                                  </button>
                                ) : (
                                  <span className="w-5" />
                                )}
                                <span className={`text-xs truncate ${isParent ? 'font-semibold text-gray-900' : 'text-gray-700'}`} title={node.fullPath}>
                                  {node.name}
                                </span>
                              </div>
                            </td>
                            {MONTHS.map((month) => {
                              const monthActual = getNodeMonthActual(node, month);
                              const monthBudget = getNodeMonthBudget(node, month);
                              const isEditing = isLeaf && editingCell?.accountId === node.account!.qb_account_id && editingCell?.month === month;

                              return (
                                <Fragment key={month}>
                                  {/* Prior Year Actual */}
                                  <td className={`px-1 py-2 text-right text-xs ${isParent ? 'bg-emerald-100/50 font-semibold' : 'bg-emerald-50/30'} text-gray-600`}>
                                    {monthActual > 0 ? formatCurrency(monthActual) : '-'}
                                  </td>
                                  {/* Budget */}
                                  <td className={`px-1 py-2 text-right ${isParent ? 'bg-blue-100/50' : 'bg-blue-50/50'}`}>
                                    {isLeaf ? (
                                      isEditing ? (
                                        <div className="flex items-center justify-end">
                                          <input
                                            type="number"
                                            value={editValue}
                                            onChange={(e) => setEditValue(e.target.value)}
                                            onKeyDown={handleKeyDown}
                                            onBlur={(e) => {
                                              if (e.relatedTarget?.closest('button[data-fill-forward]')) return;
                                              confirmEdit();
                                            }}
                                            autoFocus
                                            className="w-14 px-1 py-0.5 text-right text-xs border rounded bg-white"
                                          />
                                          <button
                                            data-fill-forward
                                            onClick={() => {
                                              fillForward(node.account!.qb_account_id, month, parseFloat(editValue) || 0);
                                              setEditingCell(null);
                                              setEditValue("");
                                            }}
                                            className="ml-0.5 p-0.5 text-gray-400 hover:text-blue-600 rounded"
                                            title="Fill forward"
                                          >
                                            <ArrowRightCircle className="h-3 w-3" />
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          onClick={() => startEdit(node.account!.qb_account_id, month)}
                                          className={`text-xs px-1 py-0.5 rounded hover:bg-blue-100 ${
                                            monthBudget > 0 ? 'text-gray-900' : 'text-gray-300'
                                          }`}
                                        >
                                          {monthBudget > 0 ? formatCurrency(monthBudget) : '-'}
                                        </button>
                                      )
                                    ) : (
                                      <span className={`text-xs font-semibold ${monthBudget > 0 ? 'text-gray-900' : 'text-gray-300'}`}>
                                        {monthBudget > 0 ? formatCurrency(monthBudget) : '-'}
                                      </span>
                                    )}
                                  </td>
                                </Fragment>
                              );
                            })}
                            {/* Totals */}
                            <td className={`px-2 py-2 text-right text-xs font-semibold ${isParent ? 'bg-emerald-100/50' : 'bg-emerald-50/30'} text-gray-700`}>
                              {priorTotal > 0 ? formatCurrency(priorTotal) : '-'}
                            </td>
                            <td className={`px-2 py-2 text-right text-xs font-semibold ${isParent ? 'bg-blue-100/50' : 'bg-blue-50/50'} text-gray-900`}>
                              {budgetTotal > 0 ? formatCurrency(budgetTotal) : '-'}
                            </td>
                            <td className={isParent ? 'bg-gray-50' : ''}>
                              {isLeaf && (
                                <button
                                  onClick={() => copyFromPriorYear(node.account!.qb_account_id)}
                                  className="p-1 text-gray-300 hover:text-blue-600 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                  title={`Copy ${priorYear} actuals as ${budgetYear} budget`}
                                >
                                  <ArrowRightCircle className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Summary */}
        {!loading && displayedAccounts.length > 0 && (
          <div className="mt-6 bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Budget Summary</h3>
            {(() => {
              const totalBudget = sections.reduce((sum, section) =>
                sum + section.accounts.reduce((sSum, node) => sSum + getNodeBudgetTotal(node), 0), 0);
              const totalPrior = sections.reduce((sum, section) =>
                sum + section.accounts.reduce((sSum, node) => sSum + getNodePriorTotal(node), 0), 0);
              const variance = totalBudget - totalPrior;

              return (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-sm text-gray-500">Total {budgetYear} Budget</div>
                    <div className="text-2xl font-bold text-gray-900">
                      {formatCurrency(totalBudget)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Total {priorYear} Actuals</div>
                    <div className="text-2xl font-bold text-gray-600">
                      {formatCurrency(totalPrior)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Accounts with Budgets</div>
                    <div className="text-2xl font-bold text-gray-900">
                      {budgets.size} / {displayedAccounts.length}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Variance</div>
                    <div className={`text-2xl font-bold ${variance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {variance > 0 ? '+' : ''}{formatCurrency(variance)}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
