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
  account?: QBAccount;
  children: AccountNode[];
  depth: number;
}

// P&L Section definition
interface PLSection {
  title: string;
  accountTypes: string[];
  accounts: AccountNode[];
}

// P&L section definitions
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

  // Show all accounts toggle
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
      const { data: expenseAccounts, error: accountsError } = await supabase
        .from('qb_account')
        .select('*')
        .in('account_type', ['Expense', 'Other Expense', 'Cost of Goods Sold'])
        .eq('active', true)
        .order('fully_qualified_name');

      if (accountsError) throw accountsError;

      const { data: expenses, error: expensesError } = await supabase
        .from('qb_expense')
        .select('account_id, transaction_date, amount')
        .gte('transaction_date', `${priorYear}-01-01`)
        .lte('transaction_date', `${priorYear}-12-31`)
        .in('transaction_type', ['Purchase', 'Bill']);

      if (expensesError) throw expensesError;

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

      setAllExpenseAccounts(expenseAccounts || []);

      const { data: existingBudgets, error: budgetsError } = await supabase
        .from('account_budget')
        .select('*')
        .eq('year', budgetYear);

      if (budgetsError) throw budgetsError;

      const budgetMap = new Map<string, AccountBudget>();
      for (const budget of existingBudgets || []) {
        budgetMap.set(budget.qb_account_id, budget);
      }

      // Filter accounts to those with prior year activity OR existing budget
      const accountsWithActivity = (expenseAccounts || []).filter(
        acc => actualsByAccount.has(acc.qb_account_id) || budgetMap.has(acc.qb_account_id)
      );

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
    const budget = getBudget(accountId);
    budget[month] = value;
    newBudgets.set(accountId, budget);
    setBudgets(newBudgets);
    setHasChanges(true);
  };

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

  const copyFromPriorYear = (accountId: string) => {
    const actuals = priorYearActuals.get(accountId);

    if (!actuals) {
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

  const saveAllBudgets = async () => {
    setSaving(true);
    setMessage(null);

    try {
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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

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

  // Flatten section tree for rendering - returns only leaf accounts
  const flattenSection = (sectionRoots: AccountNode[]): { account: QBAccount; depth: number; parentPath: string }[] => {
    const result: { account: QBAccount; depth: number; parentPath: string }[] = [];

    const traverse = (nodes: AccountNode[], parentCollapsed: boolean) => {
      for (const node of nodes) {
        const isParent = node.children.length > 0;
        const isCollapsed = collapsedSections.has(node.fullPath);

        if (node.account && !parentCollapsed) {
          // This is a leaf node with an account
          result.push({
            account: node.account,
            depth: node.depth,
            parentPath: node.fullPath.split(':').slice(0, -1).join(':')
          });
        }

        if (isParent && !parentCollapsed) {
          traverse(node.children, isCollapsed);
        }
      }
    };

    traverse(sectionRoots, false);
    return result;
  };

  // Get parent nodes for rendering collapse controls
  const getParentNodes = (sectionRoots: AccountNode[]): AccountNode[] => {
    const parents: AccountNode[] = [];

    const traverse = (nodes: AccountNode[]) => {
      for (const node of nodes) {
        if (node.children.length > 0) {
          parents.push(node);
          if (!collapsedSections.has(node.fullPath)) {
            traverse(node.children);
          }
        }
      }
    };

    traverse(sectionRoots);
    return parents;
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

  // Get all collapsible parent paths
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

  // Calculate totals
  const getAccountTotal = (budget: AccountBudget): number => {
    return MONTHS.reduce((sum, month) => sum + (budget[month] || 0), 0);
  };

  const getPriorYearTotal = (accountId: string): number => {
    const actuals = priorYearActuals.get(accountId);
    if (!actuals) return 0;
    return MONTHS.reduce((sum, month) => sum + (actuals[month] || 0), 0);
  };

  // Calculate section totals
  const getSectionTotals = (sectionAccounts: AccountNode[]) => {
    let budgetTotal = 0;
    let priorTotal = 0;
    const monthlyBudget: Record<string, number> = {};
    const monthlyPrior: Record<string, number> = {};

    MONTHS.forEach(m => {
      monthlyBudget[m] = 0;
      monthlyPrior[m] = 0;
    });

    const sumNode = (node: AccountNode) => {
      if (node.account) {
        const budget = getBudget(node.account.qb_account_id);
        const actuals = priorYearActuals.get(node.account.qb_account_id);
        budgetTotal += getAccountTotal(budget);
        priorTotal += getPriorYearTotal(node.account.qb_account_id);
        MONTHS.forEach(m => {
          monthlyBudget[m] += budget[m] || 0;
          monthlyPrior[m] += actuals?.[m] || 0;
        });
      }
      node.children.forEach(sumNode);
    };

    sectionAccounts.forEach(sumNode);

    return { budgetTotal, priorTotal, monthlyBudget, monthlyPrior };
  };

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      confirmEdit();
    } else if (e.key === 'Escape') {
      cancelEdit();
    } else if (e.key === 'Tab' && editingCell) {
      e.preventDefault();
      confirmEdit();
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

            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showAllAccounts}
                onChange={(e) => setShowAllAccounts(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Show all accounts
            </label>

            <button
              onClick={toggleCollapseAll}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-gray-100 text-gray-600 hover:bg-gray-200"
              title={isAllCollapsed ? 'Expand all sections' : 'Collapse all sections'}
            >
              {isAllCollapsed ? <ChevronsDownUp className="h-4 w-4" /> : <ChevronsUpDown className="h-4 w-4" />}
              {isAllCollapsed ? 'Expand' : 'Collapse'}
            </button>

            <button
              onClick={syncExpenses}
              disabled={syncing}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync QBO'}
            </button>

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

        {message && (
          <div className={`mb-4 p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}>
            {message.text}
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-blue-800">
            <strong>How to use:</strong> Click any budget cell to edit. Press <kbd className="px-1 bg-blue-100 rounded">Tab</kbd> to move to the next month.
            Use the <ArrowRightCircle className="inline h-4 w-4 mx-1" /> button to fill a value forward to all remaining months.
            The gray row shows {priorYear} actuals for reference.
          </p>
        </div>

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
                  <th className="bg-gray-50 px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                    Type
                  </th>
                  {MONTH_LABELS.map(month => (
                    <th key={month} className="bg-gray-50 px-2 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                      {month}
                    </th>
                  ))}
                  <th className="bg-gray-50 px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                    Total
                  </th>
                  <th className="bg-gray-50 px-2 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {sections.map((section) => {
                  const isSectionCollapsed = collapsedSections.has(`section:${section.title}`);
                  const sectionTotals = getSectionTotals(section.accounts);
                  const parentNodes = getParentNodes(section.accounts);
                  const leafAccounts = flattenSection(section.accounts);

                  return (
                    <Fragment key={section.title}>
                      {/* Section Header */}
                      <tr className="bg-blue-100 border-t-2 border-blue-300">
                        <td className="sticky left-0 bg-blue-100 px-4 py-3" colSpan={2}>
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
                        {MONTHS.map(month => (
                          <td key={month} className="bg-blue-100 px-2 py-3 text-right text-xs font-bold text-blue-900">
                            {sectionTotals.monthlyBudget[month] > 0 ? formatCurrency(sectionTotals.monthlyBudget[month]) : '-'}
                          </td>
                        ))}
                        <td className="bg-blue-100 px-3 py-3 text-right text-sm font-bold text-blue-900">
                          {formatCurrency(sectionTotals.budgetTotal)}
                        </td>
                        <td className="bg-blue-100"></td>
                      </tr>

                      {/* Section Content */}
                      {!isSectionCollapsed && (
                        <>
                          {/* Parent category rows (collapsible headers) */}
                          {parentNodes.map((parent) => {
                            const isParentCollapsed = collapsedSections.has(parent.fullPath);
                            return (
                              <tr key={`parent-${parent.fullPath}`} className="bg-gray-100">
                                <td className="sticky left-0 bg-gray-100 px-4 py-2" colSpan={2}>
                                  <div style={{ paddingLeft: `${parent.depth * 16}px` }}>
                                    <button
                                      onClick={() => toggleSection(parent.fullPath)}
                                      className="flex items-center gap-1 text-gray-700 font-medium text-sm hover:text-gray-900"
                                    >
                                      {isParentCollapsed ? (
                                        <ChevronRight className="h-4 w-4" />
                                      ) : (
                                        <ChevronDown className="h-4 w-4" />
                                      )}
                                      {parent.name}
                                    </button>
                                  </div>
                                </td>
                                {MONTHS.map(month => (
                                  <td key={month} className="bg-gray-100"></td>
                                ))}
                                <td className="bg-gray-100"></td>
                                <td className="bg-gray-100"></td>
                              </tr>
                            );
                          })}

                          {/* Leaf account rows (two rows per account: actuals + budget) */}
                          {leafAccounts.map(({ account, depth }) => {
                            const budget = getBudget(account.qb_account_id);
                            const actuals = priorYearActuals.get(account.qb_account_id);
                            const budgetTotal = getAccountTotal(budget);
                            const priorTotal = getPriorYearTotal(account.qb_account_id);

                            return (
                              <Fragment key={account.qb_account_id}>
                                {/* Account Header */}
                                <tr className="bg-blue-50 border-t border-blue-200">
                                  <td className="sticky left-0 bg-blue-50 px-4 py-2" colSpan={2}>
                                    <div className="flex items-center gap-2" style={{ paddingLeft: `${depth * 16}px` }}>
                                      <span className="font-semibold text-gray-900 text-sm">{account.name}</span>
                                      {account.fully_qualified_name !== account.name && (
                                        <span className="text-xs text-gray-500 truncate" title={account.fully_qualified_name}>
                                          ({account.fully_qualified_name})
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  {MONTHS.map(month => (
                                    <td key={month} className="bg-blue-50"></td>
                                  ))}
                                  <td className="bg-blue-50"></td>
                                  <td className="bg-blue-50 px-2 py-2">
                                    <button
                                      onClick={() => copyFromPriorYear(account.qb_account_id)}
                                      className="p-1 text-gray-400 hover:text-blue-600 rounded"
                                      title={`Copy ${priorYear} actuals as ${budgetYear} budget`}
                                    >
                                      <ChevronRight className="h-4 w-4" />
                                    </button>
                                  </td>
                                </tr>

                                {/* Actuals Row */}
                                <tr className="bg-gray-50">
                                  <td className="sticky left-0 bg-gray-50 px-4 py-2 text-sm text-gray-600 font-medium" colSpan={2}>
                                    <div style={{ paddingLeft: `${depth * 16}px` }}>
                                      Actuals ({priorYear})
                                    </div>
                                  </td>
                                  {MONTHS.map(month => (
                                    <td key={month} className="px-2 py-2 text-right text-sm text-gray-600 font-mono">
                                      {actuals && actuals[month] > 0 ? formatCurrency(actuals[month]) : '—'}
                                    </td>
                                  ))}
                                  <td className="px-3 py-2 text-right text-sm text-gray-700 font-mono font-medium">
                                    {priorTotal > 0 ? formatCurrency(priorTotal) : '—'}
                                  </td>
                                  <td></td>
                                </tr>

                                {/* Budget Row */}
                                <tr className="bg-white">
                                  <td className="sticky left-0 bg-white px-4 py-2 text-sm text-blue-700 font-medium" colSpan={2}>
                                    <div style={{ paddingLeft: `${depth * 16}px` }}>
                                      Budget ({budgetYear})
                                    </div>
                                  </td>
                                  {MONTHS.map(month => {
                                    const isEditing = editingCell?.accountId === account.qb_account_id && editingCell?.month === month;
                                    const value = budget[month];

                                    return (
                                      <td key={month} className="px-1 py-1">
                                        {isEditing ? (
                                          <div className="flex items-center">
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
                                              className="w-16 px-1 py-1 text-right text-sm border rounded focus:ring-2 focus:ring-blue-500"
                                            />
                                            <button
                                              data-fill-forward
                                              onClick={() => {
                                                fillForward(account.qb_account_id, month, parseFloat(editValue) || 0);
                                                setEditingCell(null);
                                                setEditValue("");
                                              }}
                                              className="ml-1 p-1 text-gray-400 hover:text-blue-600 rounded"
                                              title="Fill forward to remaining months"
                                            >
                                              <ArrowRightCircle className="h-3 w-3" />
                                            </button>
                                          </div>
                                        ) : (
                                          <button
                                            onClick={() => startEdit(account.qb_account_id, month)}
                                            className={`w-full px-2 py-1 text-right text-sm font-mono rounded hover:bg-blue-50 ${
                                              value > 0 ? 'text-gray-900' : 'text-gray-400'
                                            }`}
                                          >
                                            {value > 0 ? formatCurrency(value) : '—'}
                                          </button>
                                        )}
                                      </td>
                                    );
                                  })}
                                  <td className="px-3 py-2 text-right text-sm font-mono font-semibold text-gray-900">
                                    {budgetTotal > 0 ? formatCurrency(budgetTotal) : '—'}
                                  </td>
                                  <td></td>
                                </tr>
                              </Fragment>
                            );
                          })}
                        </>
                      )}
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
              // Calculate totals from sections (same method as BudgetManagePage)
              const totalBudget = sections.reduce((sum, section) => sum + getSectionTotals(section.accounts).budgetTotal, 0);
              const totalPrior = sections.reduce((sum, section) => sum + getSectionTotals(section.accounts).priorTotal, 0);
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
