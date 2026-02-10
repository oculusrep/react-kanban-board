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
  // Payment tracking fields
  is_paid?: boolean | null;  // true=paid, false=unpaid, null=immediate (Purchase/SalesReceipt)
  balance?: number | null;
  payment_date?: string | null;  // Date the Bill was paid (for Cash basis)
}

interface QBItem {
  qb_item_id: string;
  name: string;
  income_account_id: string | null;
  income_account_name: string | null;
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

// Payroll item from QBO Reports API
interface PayrollItem {
  account_name: string;
  account_id: string | null;
  amount: number;
  section: string;
  parent_account: string | null;
  depth: number;
}

// QBO P&L line item for validation comparison
interface QBOLineItem {
  account_name: string;
  account_id: string | null;
  amount: number;
  section: string;
  parent_account: string | null;
  ancestor_path: string[];
  depth: number;
}

export default function BudgetDashboardPage() {
  const navigate = useNavigate();
  const { userRole } = useAuth();

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [accounts, setAccounts] = useState<QBAccount[]>([]);
  const [items, setItems] = useState<QBItem[]>([]);
  const [expenses, setExpenses] = useState<QBExpense[]>([]);
  const [plSections, setPLSections] = useState<PLSection[]>([]);
  // Counter to track when plSections is rebuilt (triggers payroll injection)
  const [plSectionsVersion, setPlSectionsVersion] = useState(0);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedTransactions, setExpandedTransactions] = useState<Set<string>>(new Set());
  const [editingBudget, setEditingBudget] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [recategorizingExpense, setRecategorizingExpense] = useState<string | null>(null);
  const [updatingExpense, setUpdatingExpense] = useState<string | null>(null);
  const [payrollCOGSItems, setPayrollCOGSItems] = useState<PayrollItem[]>([]);
  const [payrollCOGSTotal, setPayrollCOGSTotal] = useState<number>(0);
  // Payroll expense items (employer taxes: FUTA, Medicare, Social Security, SUTA)
  // These are under "Taxes and Licenses" in QBO but only available via Reports API, not Accounting API
  const [payrollExpenseItems, setPayrollExpenseItems] = useState<PayrollItem[]>([]);
  const [payrollExpenseTotal, setPayrollExpenseTotal] = useState<number>(0);
  const [loadingPayroll, setLoadingPayroll] = useState(false);
  // QBO P&L totals for comparison/validation
  const [qboTotals, setQboTotals] = useState<{
    income: number;
    cogs: number;
    expenses: number;
    otherIncome: number;
    otherExpenses: number;
    netIncome: number;
  } | null>(null);
  // QBO line items for account-level comparison
  const [qboLineItems, setQboLineItems] = useState<QBOLineItem[]>([]);
  // Which validation sections are expanded to show details
  const [expandedValidation, setExpandedValidation] = useState<Set<string>>(new Set());
  // Transaction-level comparison for specific accounts
  const [comparingAccount, setComparingAccount] = useState<{ name: string; qbId: string } | null>(null);
  const [comparisonData, setComparisonData] = useState<{
    ovisTransactions: QBExpense[];
    qboTransactions: { date: string; type: string; docNumber: string | null; name: string | null; memo: string | null; debit: number; credit: number }[];
    onlyInOvis: QBExpense[];
    onlyInQbo: { date: string; type: string; docNumber: string | null; name: string | null; memo: string | null; debit: number; credit: number }[];
    matched: { ovis: QBExpense; qbo: { date: string; type: string; docNumber: string | null; name: string | null; memo: string | null; debit: number; credit: number } }[];
  } | null>(null);
  const [loadingComparison, setLoadingComparison] = useState(false);

  // Date filter state
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);

  // Accounting basis toggle (Accrual = default, matches QBO)
  const [accountingBasis, setAccountingBasis] = useState<'Accrual' | 'Cash'>('Accrual');

  useEffect(() => {
    document.title = "P&L Statement | OVIS Admin";
    // Reset payroll state when period or basis changes to avoid stale data injection
    setPayrollCOGSItems([]);
    setPayrollCOGSTotal(0);
    setPayrollExpenseItems([]);
    setPayrollExpenseTotal(0);
    fetchData();
    fetchPayrollData();
  }, [selectedYear, selectedMonth, accountingBasis]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch accounts (only active)
      const { data: accountData, error: accountError } = await supabase
        .from('qb_account')
        .select('*')
        .eq('active', true)
        .order('fully_qualified_name');

      if (accountError) throw accountError;
      setAccounts(accountData || []);

      // Fetch items (for mapping invoice items to income accounts)
      const { data: itemData, error: itemError } = await supabase
        .from('qb_item')
        .select('qb_item_id, name, income_account_id, income_account_name')
        .eq('active', true);

      if (itemError) {
        console.warn('Could not fetch items (table may not exist yet):', itemError.message);
      }
      setItems(itemData || []);

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
      // For Cash basis, we need a more complex query:
      // - Non-Bill transactions: use transaction_date
      // - Bill transactions: use payment_date (when the bill was paid)
      let allExpenses: QBExpense[] = [];
      let page = 0;
      const pageSize = 1000;

      if (accountingBasis === 'Accrual') {
        // Accrual basis: simple date filter on transaction_date
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
      } else {
        // Cash basis: different date columns for different transaction types
        // 1. Non-Bill/Invoice transactions use transaction_date
        page = 0;
        while (true) {
          const { data: expenseData, error: expenseError } = await supabase
            .from('qb_expense')
            .select('*')
            .not('transaction_type', 'eq', 'Bill')
            .not('transaction_type', 'eq', 'Invoice')
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

        // 2. Bill transactions that were PAID in the period (use payment_date)
        page = 0;
        while (true) {
          const { data: billData, error: billError } = await supabase
            .from('qb_expense')
            .select('*')
            .eq('transaction_type', 'Bill')
            .eq('is_paid', true)
            .gte('payment_date', startDate)
            .lt('payment_date', endDate)
            .order('payment_date', { ascending: false })
            .order('id', { ascending: true })
            .range(page * pageSize, (page + 1) * pageSize - 1);

          if (billError) throw billError;
          if (!billData || billData.length === 0) break;
          allExpenses = [...allExpenses, ...billData];
          if (billData.length < pageSize) break;
          page++;
        }

        // 3. Invoice transactions that were PAID in the period (use payment_date)
        // Payment transactions are synced from QBO to populate payment_date on invoices
        page = 0;
        while (true) {
          const { data: invoiceData, error: invoiceError } = await supabase
            .from('qb_expense')
            .select('*')
            .eq('transaction_type', 'Invoice')
            .eq('is_paid', true)
            .gte('payment_date', startDate)
            .lt('payment_date', endDate)
            .order('payment_date', { ascending: false })
            .order('id', { ascending: true })
            .range(page * pageSize, (page + 1) * pageSize - 1);

          if (invoiceError) throw invoiceError;
          if (!invoiceData || invoiceData.length === 0) break;
          allExpenses = [...allExpenses, ...invoiceData];
          if (invoiceData.length < pageSize) break;
          page++;
        }
      }

      setExpenses(allExpenses);
      buildPLStructure(accountData || [], allExpenses, itemData || [], accountingBasis);
    } catch (error: any) {
      console.error('Error fetching budget data:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to load data' });
    } finally {
      setLoading(false);
    }
  };

  // Fetch payroll data from QBO Reports API (payroll isn't available via Accounting API)
  const fetchPayrollData = async () => {
    setLoadingPayroll(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      // Build date range
      let startDate: string;
      let endDate: string;

      if (selectedMonth !== null) {
        startDate = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`;
        // QBO Reports API uses INCLUSIVE end dates, so use last day of month
        const lastDayOfMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
        endDate = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${lastDayOfMonth}`;
      } else {
        startDate = `${selectedYear}-01-01`;
        // QBO Reports API uses INCLUSIVE end dates, so use Dec 31 not Jan 1 of next year
        endDate = `${selectedYear}-12-31`;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quickbooks-sync-pl-report`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ startDate, endDate, accountingMethod: accountingBasis })
        }
      );

      if (response.ok) {
        const result = await response.json();
        // COGS payroll (wages/salary) - these aren't available via Accounting API
        setPayrollCOGSItems(result.payrollCOGSItems || []);
        setPayrollCOGSTotal(result.totalPayrollCOGS || 0);
        // Payroll expense taxes (FUTA, Medicare, SS, SUTA) - also only available via Reports API
        // These appear under "Taxes and Licenses" in QBO but aren't exposed via Accounting API
        setPayrollExpenseItems(result.payrollExpenseItems || []);
        setPayrollExpenseTotal(result.totalPayrollExpenses || 0);
        // QBO totals for validation
        if (result.totals) {
          setQboTotals({
            income: result.totals.income || 0,
            cogs: result.totals.cogs || 0,
            expenses: result.totals.expenses || 0,
            otherIncome: result.totals.otherIncome || 0,
            otherExpenses: result.totals.otherExpenses || 0,
            netIncome: result.totals.netIncome || 0
          });
        }
        // Store line items for account-level comparison
        if (result.lineItems) {
          setQboLineItems(result.lineItems);
        }
      }
    } catch (error) {
      console.error('Error fetching payroll data:', error);
      // Don't show error - payroll is optional enhancement
    } finally {
      setLoadingPayroll(false);
    }
  };

  const buildPLStructure = (accountList: QBAccount[], expenseList: QBExpense[], itemList: QBItem[], basis: 'Accrual' | 'Cash') => {
    // Note: Cash basis filtering is now done at the query level in fetchData()
    // - For Cash basis, Bills are fetched by payment_date (when paid) not transaction_date
    // - Unpaid Bills/Invoices are excluded at query time
    // Build item-to-income-account map for Invoice/SalesReceipt transactions
    // In QBO, Invoices reference Items (products/services), not accounts directly.
    // Items have an IncomeAccountRef that maps to the actual Income account.
    const itemToIncomeAccount = new Map<string, { accountId: string; accountName: string }>();
    for (const item of itemList) {
      if (item.income_account_id) {
        itemToIncomeAccount.set(item.qb_item_id, {
          accountId: item.income_account_id,
          accountName: item.income_account_name || ''
        });
      }
    }

    // Group expenses by account, mapping invoice items to their income accounts
    const expensesByAccount = new Map<string, QBExpense[]>();
    for (const expense of expenseList) {
      let accountId = expense.account_id;

      // For Invoice and SalesReceipt transactions, the account_id is actually an Item ID
      // We need to look up the Item to get the real Income account
      if ((expense.transaction_type === 'Invoice' || expense.transaction_type === 'SalesReceipt')
          && itemToIncomeAccount.has(accountId)) {
        const mapping = itemToIncomeAccount.get(accountId)!;
        accountId = mapping.accountId;
      }

      if (!expensesByAccount.has(accountId)) {
        expensesByAccount.set(accountId, []);
      }
      expensesByAccount.get(accountId)!.push(expense);
    }

    // Build hierarchical categories from fully_qualified_name
    const buildHierarchy = (accounts: QBAccount[], accountTypes: string[]): PLCategory[] => {
      const filteredAccounts = accounts.filter(a => accountTypes.includes(a.account_type));
      const categoryMap = new Map<string, PLCategory>();

      // Build a map from fully_qualified_name to account for quick lookup
      // This helps us find accounts that are "parents" but also have direct transactions
      const accountByFQN = new Map<string, QBAccount>();
      for (const account of filteredAccounts) {
        accountByFQN.set(account.fully_qualified_name, account);
      }

      // Check if we're building income accounts (need to normalize Purchase/Bill amounts)
      const isIncomeSection = accountTypes.includes('Income') || accountTypes.includes('Other Income');

      // Helper to calculate amount for transactions with proper sign handling
      // Journal entries need special handling based on posting type (Debit/Credit)
      // Standard accounting rules:
      // - Income accounts: Credits increase income, Debits decrease income
      // - Expense/COGS accounts: Debits increase expense, Credits decrease expense
      const calculateAmount = (transactions: QBExpense[]) => {
        return transactions.reduce((sum, t) => {
          let txnAmount = t.amount;

          // Handle Journal Entry transactions based on posting type
          if (t.transaction_type.startsWith('JournalEntry-')) {
            const isDebit = t.transaction_type === 'JournalEntry-Debit';
            const isCredit = t.transaction_type === 'JournalEntry-Credit';

            if (isIncomeSection) {
              // Income accounts: Credits increase (+), Debits decrease (-)
              if (isDebit) {
                txnAmount = -txnAmount;
              }
              // Credits stay positive (already stored as positive)
            } else {
              // Expense/COGS accounts: Debits increase (+), Credits decrease (-)
              if (isCredit) {
                txnAmount = -txnAmount;
              }
              // Debits stay positive (already stored as positive)
            }
          }
          // For income accounts, flip the sign on Purchase/Bill transactions
          else if (isIncomeSection && (t.transaction_type === 'Purchase' || t.transaction_type === 'Bill')) {
            txnAmount = -txnAmount;
          }
          // For income accounts, CreditCardCredit, VendorCredit, and Deposit are stored as negative
          // but represent positive income (e.g., AmEx Cash Back, Interest Earned), so flip the sign
          else if (isIncomeSection && (t.transaction_type === 'CreditCardCredit' || t.transaction_type === 'VendorCredit' || t.transaction_type === 'Deposit')) {
            txnAmount = -txnAmount;
          }

          return sum + txnAmount;
        }, 0);
      };

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

            // Check if this path corresponds to an actual account (even if it's a parent)
            // In QBO, a parent account CAN have its own direct transactions
            const accountAtPath = accountByFQN.get(currentPath);
            const hasOwnAccount = !!accountAtPath;

            // Get transactions for this path if it's a real account
            const transactions = hasOwnAccount ? (expensesByAccount.get(accountAtPath.qb_account_id) || []) : [];
            const amount = calculateAmount(transactions);

            categoryMap.set(currentPath, {
              name: part,
              fullPath: currentPath,
              account: hasOwnAccount ? accountAtPath : undefined,
              amount: amount,
              budgetAmount: hasOwnAccount ? (accountAtPath.budget_amount || 0) : 0,
              transactions: transactions,
              children: [],
              // It's a parent if it has children (not the last segment), even if it also has its own transactions
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

      // Sort alphabetically at each level (matches QBO P&L)
      const sortCategories = (cats: PLCategory[]) => {
        cats.sort((a, b) => a.name.localeCompare(b.name));
        for (const cat of cats) {
          sortCategories(cat.children);
        }
      };
      sortCategories(rootCategories);

      // Filter out zero-balance categories (like QBO does on P&L)
      const filterZeroBalance = (cats: PLCategory[]): PLCategory[] => {
        return cats
          .map(cat => ({
            ...cat,
            children: filterZeroBalance(cat.children)
          }))
          .filter(cat => cat.amount !== 0 || cat.children.length > 0);
      };

      return filterZeroBalance(rootCategories);
    };

    // Build P&L sections
    // Standard P&L order: Income, COGS, Gross Profit, Operating Expenses, Other Income/Expense, Net Income
    const sections: PLSection[] = [
      {
        title: 'Income',
        accountTypes: ['Income'],
        categories: buildHierarchy(accountList, ['Income']),
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
        accountTypes: ['Expense'],
        categories: buildHierarchy(accountList, ['Expense']),
        total: 0,
        budgetTotal: 0,
        isIncome: false
      },
      {
        title: 'Other Income',
        accountTypes: ['Other Income'],
        categories: buildHierarchy(accountList, ['Other Income']),
        total: 0,
        budgetTotal: 0,
        isIncome: true
      },
      {
        title: 'Other Expenses',
        accountTypes: ['Other Expense'],
        categories: buildHierarchy(accountList, ['Other Expense']),
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
    // Increment version to trigger payroll injection effect
    setPlSectionsVersion(v => v + 1);
  };

  // Inject payroll expense items into "Taxes and Licenses" category when payroll data changes
  // QBO has two variations: "Taxes & Licenses" (synced expenses) and "Taxes and Licenses" (payroll)
  // We need to merge payroll items into the existing category regardless of which variation exists
  useEffect(() => {
    if (payrollExpenseItems.length === 0 || plSections.length === 0) return;

    // Helper to check if a category name matches "Taxes and Licenses" (with & or "and")
    const isTaxesAndLicenses = (name: string) => {
      const normalized = name.toLowerCase().replace('&', 'and');
      return normalized === 'taxes and licenses';
    };

    // Known payroll tax account names that come from QBO Reports API
    const payrollTaxNames = new Set(payrollExpenseItems.map(item => item.account_name.toLowerCase()));

    setPLSections(prevSections => {
      // Find the Operating Expenses section
      const expensesSectionIdx = prevSections.findIndex(s => s.title === 'Operating Expenses');
      if (expensesSectionIdx === -1) return prevSections;

      const newSections = [...prevSections];
      const expensesSection = { ...newSections[expensesSectionIdx] };
      expensesSection.categories = [...expensesSection.categories];

      // Find "Taxes and Licenses" or "Taxes & Licenses" category and add payroll items
      const findAndUpdateTaxesCategory = (categories: PLCategory[]): PLCategory[] => {
        return categories.map(cat => {
          // Check if this is "Taxes and Licenses" or "Taxes & Licenses"
          if (isTaxesAndLicenses(cat.name)) {
            // Create payroll children from payroll expense items
            const payrollChildren: PLCategory[] = payrollExpenseItems.map((item) => ({
              name: item.account_name,
              fullPath: `${cat.fullPath}:${item.account_name}`,
              account: undefined, // Virtual category from Reports API
              amount: item.amount,
              budgetAmount: 0,
              transactions: [], // No individual transactions - from Reports API
              children: [],
              isParent: false,
              depth: cat.depth + 1
            }));

            // Filter out existing children that are payroll items (they'll be replaced with fresh data)
            // Keep non-payroll children intact
            const nonPayrollChildren = cat.children.filter(
              c => !payrollTaxNames.has(c.name.toLowerCase())
            );

            // Calculate base amount from non-payroll children
            const baseAmount = nonPayrollChildren.reduce((sum, c) => sum + c.amount, 0);

            // Update the category with payroll items and adjusted total
            return {
              ...cat,
              children: [...nonPayrollChildren, ...payrollChildren],
              amount: baseAmount + payrollExpenseTotal,
              isParent: nonPayrollChildren.length > 0 || payrollChildren.length > 0
            };
          }

          // Recursively check children
          if (cat.children.length > 0) {
            return {
              ...cat,
              children: findAndUpdateTaxesCategory(cat.children)
            };
          }

          return cat;
        });
      };

      // Check if "Taxes and Licenses" or "Taxes & Licenses" exists
      const taxesCategoryExists = expensesSection.categories.some(
        cat => isTaxesAndLicenses(cat.name) ||
               cat.children.some(c => isTaxesAndLicenses(c.name))
      );

      if (taxesCategoryExists) {
        expensesSection.categories = findAndUpdateTaxesCategory(expensesSection.categories);
      } else {
        // Create "Taxes and Licenses" category with payroll items
        const payrollChildren: PLCategory[] = payrollExpenseItems.map((item) => ({
          name: item.account_name,
          fullPath: `Taxes and Licenses:${item.account_name}`,
          account: undefined,
          amount: item.amount,
          budgetAmount: 0,
          transactions: [],
          children: [],
          isParent: false,
          depth: 1
        }));

        const taxesCategory: PLCategory = {
          name: 'Taxes and Licenses',
          fullPath: 'Taxes and Licenses',
          account: undefined,
          amount: payrollExpenseTotal,
          budgetAmount: 0,
          transactions: [],
          children: payrollChildren,
          isParent: true,
          depth: 0
        };

        expensesSection.categories.push(taxesCategory);
        // Re-sort alphabetically
        expensesSection.categories.sort((a, b) => a.name.localeCompare(b.name));
      }

      // Update section total
      expensesSection.total = expensesSection.categories.reduce((sum, c) => sum + c.amount, 0);

      newSections[expensesSectionIdx] = expensesSection;
      return newSections;
    });
  }, [payrollExpenseItems, payrollExpenseTotal, plSectionsVersion]);

  const handleSyncAll = async () => {
    setSyncing(true);
    setMessage(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage({ type: 'error', text: 'You must be logged in' });
        return;
      }

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      };

      // 1. Sync Accounts
      setMessage({ type: 'success', text: 'Syncing accounts...' });
      const accountsResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quickbooks-sync-accounts`,
        { method: 'POST', headers }
      );
      const accountsResult = await accountsResponse.json();
      if (!accountsResponse.ok) {
        throw new Error(accountsResult.error || 'Failed to sync accounts');
      }

      // 2. Sync Items (for income account mapping)
      setMessage({ type: 'success', text: 'Syncing items...' });
      const itemsResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quickbooks-sync-items`,
        { method: 'POST', headers }
      );
      const itemsResult = await itemsResponse.json();
      if (!itemsResponse.ok) {
        // Don't fail entirely if items sync fails (table might not exist yet)
        console.warn('Items sync failed:', itemsResult.error);
      }

      // 3. Sync Transactions (always sync from 2024 for full data and proper orphan cleanup)
      setMessage({ type: 'success', text: 'Syncing transactions...' });
      const expensesResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quickbooks-sync-expenses`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ startDate: '2024-01-01' })
        }
      );
      const expensesResult = await expensesResponse.json();
      if (!expensesResponse.ok) {
        throw new Error(expensesResult.error || 'Failed to sync transactions');
      }

      // Build summary message
      const parts = [];
      if (accountsResult.accountCount) parts.push(`${accountsResult.accountCount} accounts`);
      if (itemsResult.itemCount) parts.push(`${itemsResult.itemCount} items`);
      if (expensesResult.transactionCount) parts.push(`${expensesResult.transactionCount} transactions`);
      if (expensesResult.deletedOrphaned) parts.push(`deleted ${expensesResult.deletedOrphaned} orphaned`);

      console.log('[Sync Result]', expensesResult);
      setMessage({ type: 'success', text: `Synced ${parts.join(', ')} from QuickBooks` });
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

  const formatCurrency = (amount: number, showNegative: boolean = false) => {
    const formatted = Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2 });
    // Show negative amounts in parentheses (accounting format) when showNegative is true
    if (showNegative && amount < 0) {
      return `($${formatted})`;
    }
    // For P&L display, show positive numbers normally
    return `$${formatted}`;
  };

  // Format date string (YYYY-MM-DD) as local date to avoid timezone shift
  // When JS parses "2025-12-12" it creates UTC midnight, which shifts back a day in US timezones
  const formatDate = (dateString: string) => {
    // Parse as local date by adding T12:00:00 (noon) to avoid any timezone edge cases
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day); // month is 0-indexed
    return date.toLocaleDateString();
  };

  // Compare transactions between OVIS and QBO for a specific account
  const compareAccountTransactions = async (accountName: string, qbAccountId: string) => {
    setComparingAccount({ name: accountName, qbId: qbAccountId });
    setLoadingComparison(true);
    setComparisonData(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage({ type: 'error', text: 'You must be logged in' });
        return;
      }

      // Build date range
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

      // Fetch QBO transactions for this account
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quickbooks-account-transactions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            accountId: qbAccountId,
            accountName: accountName,
            startDate,
            endDate: endDate.replace(/-01$/, '-31') // End of period
          })
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch QBO transactions');
      }

      const qboData = await response.json();
      const qboTransactions = qboData.transactions || [];

      console.log('[Compare] Looking for QBO Account ID:', qbAccountId, 'Account:', accountName);

      // Get OVIS transactions for this account from the current expenses state
      const ovisTransactions = expenses.filter(e => {
        // Match by account_id or account_name
        if (e.account_id === qbAccountId) return true;
        // Also check if the account name matches (for hierarchical accounts like "Bank Charges:Interest Expense")
        const qbAccount = accounts.find(a => a.qb_account_id === qbAccountId);
        if (qbAccount && e.account_name === qbAccount.name) return true;
        if (qbAccount && e.account_id === qbAccount.qb_account_id) return true;
        return false;
      });

      console.log('[Compare] Found', ovisTransactions.length, 'OVIS transactions, Account IDs:',
        [...new Set(ovisTransactions.map(e => `${e.account_id} (${e.account_name})`))]);
      console.log('[Compare] QBO returned', qboTransactions.length, 'transactions');

      // Match transactions by date and amount (approximate matching)
      const matched: { ovis: QBExpense; qbo: typeof qboTransactions[0] }[] = [];
      const usedQboIndices = new Set<number>();
      const usedOvisIndices = new Set<number>();

      // Try to match each OVIS transaction to a QBO transaction
      ovisTransactions.forEach((ovisTxn, ovisIdx) => {
        const ovisDate = ovisTxn.transaction_date;
        const ovisAmount = Math.abs(ovisTxn.amount);

        for (let qboIdx = 0; qboIdx < qboTransactions.length; qboIdx++) {
          if (usedQboIndices.has(qboIdx)) continue;
          const qboTxn = qboTransactions[qboIdx];
          const qboDate = qboTxn.date;
          const qboAmount = qboTxn.debit > 0 ? qboTxn.debit : qboTxn.credit;

          // Match by date and amount (within $0.01)
          if (ovisDate === qboDate && Math.abs(ovisAmount - qboAmount) < 0.02) {
            matched.push({ ovis: ovisTxn, qbo: qboTxn });
            usedQboIndices.add(qboIdx);
            usedOvisIndices.add(ovisIdx);
            break;
          }
        }
      });

      // Find unmatched transactions
      const onlyInOvis = ovisTransactions.filter((_, idx) => !usedOvisIndices.has(idx));
      const onlyInQbo = qboTransactions.filter((_: any, idx: number) => !usedQboIndices.has(idx));

      setComparisonData({
        ovisTransactions,
        qboTransactions,
        onlyInOvis,
        onlyInQbo,
        matched
      });

    } catch (error: any) {
      console.error('Error comparing transactions:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to compare transactions' });
    } finally {
      setLoadingComparison(false);
    }
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
                <div className="max-h-96 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-blue-50">
                      <tr className="text-xs text-gray-500 uppercase">
                        <th className="py-1 text-left font-medium">Date</th>
                        <th className="py-1 text-left font-medium">Type / Status</th>
                        <th className="py-1 text-left font-medium">Vendor / Payment</th>
                        <th className="py-1 text-left font-medium">Description</th>
                        <th className="py-1 text-right font-medium">Amount</th>
                        <th className="py-1 text-center font-medium w-32">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {category.transactions.map((txn) => {
                      const canRecategorize = !!txn.qb_entity_type && !!txn.qb_entity_id;
                      const isRecategorizing = recategorizingExpense === txn.id;
                      const isUpdating = updatingExpense === txn.id;
                      // Check if this is a credit transaction (reduces the account balance)
                      // For expense accounts: JournalEntry-Credit reduces expense
                      // For income accounts: JournalEntry-Debit reduces income
                      const isJournalEntryCredit = txn.transaction_type === 'JournalEntry-Credit' && !sectionIsIncome;
                      const isJournalEntryDebitToIncome = txn.transaction_type === 'JournalEntry-Debit' && sectionIsIncome;
                      const isCredit = txn.amount < 0 || txn.transaction_type === 'CreditCardCredit' || txn.transaction_type === 'VendorCredit' || txn.transaction_type === 'Deposit' || isJournalEntryCredit || isJournalEntryDebitToIncome;
                      // Check if this is an unpaid Bill or Invoice
                      const isUnpaid = (txn.transaction_type === 'Bill' || txn.transaction_type === 'Invoice') && txn.is_paid === false;
                      const isPaid = (txn.transaction_type === 'Bill' || txn.transaction_type === 'Invoice') && txn.is_paid === true;

                      // Calculate display amount with proper sign handling
                      let displayAmount = txn.amount;

                      // Handle Journal Entry transactions based on posting type
                      if (txn.transaction_type.startsWith('JournalEntry-')) {
                        const isDebit = txn.transaction_type === 'JournalEntry-Debit';
                        const isJECredit = txn.transaction_type === 'JournalEntry-Credit';

                        if (sectionIsIncome) {
                          // Income accounts: Credits increase (+), Debits decrease (-)
                          if (isDebit) {
                            displayAmount = -displayAmount;
                          }
                        } else {
                          // Expense/COGS accounts: Debits increase (+), Credits decrease (-)
                          if (isJECredit) {
                            displayAmount = -displayAmount;
                          }
                        }
                      }
                      // For income sections, flip the sign on Purchase/Bill transactions
                      else if (sectionIsIncome && (txn.transaction_type === 'Purchase' || txn.transaction_type === 'Bill')) {
                        displayAmount = -displayAmount;
                      }
                      // For income sections, CreditCardCredit, VendorCredit, and Deposit are stored as negative
                      // but represent positive income, so flip the sign
                      else if (sectionIsIncome && (txn.transaction_type === 'CreditCardCredit' || txn.transaction_type === 'VendorCredit' || txn.transaction_type === 'Deposit')) {
                        displayAmount = -displayAmount;
                      }

                      return (
                        <tr key={txn.id} className={`border-t border-gray-100 ${isCredit ? 'bg-green-50/50' : ''} ${isUnpaid ? 'bg-yellow-50/50' : ''}`}>
                          <td className="py-1.5 text-gray-600 w-24">
                            {formatDate(txn.transaction_date)}
                          </td>
                          <td className="py-1.5 text-gray-500 text-xs w-20">
                            {txn.transaction_type}
                            {isUnpaid && <span className="ml-1 text-yellow-600">*</span>}
                            {isPaid && <span className="ml-1 text-green-600">✓</span>}
                          </td>
                          <td className="py-1.5 text-gray-900 w-40 truncate">
                            {txn.vendor_name || '-'}
                            {isCredit && <span className="ml-1 text-xs text-green-600">(Credit)</span>}
                            {isUnpaid && <span className="ml-1 text-xs text-yellow-600">(Unpaid)</span>}
                            {isPaid && <span className="ml-1 text-xs text-green-600">(Paid {txn.payment_date ? `${new Date(txn.payment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''})</span>}
                          </td>
                          <td className="py-1.5 text-gray-600 truncate max-w-xs" title={txn.description || undefined}>
                            {txn.description || '-'}
                          </td>
                          <td className={`py-1.5 text-right font-medium w-28 tabular-nums ${isCredit ? 'text-green-700' : 'text-gray-900'}`}>
                            {formatCurrency(displayAmount, true)}
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
                    </tbody>
                  </table>
                </div>
                {category.transactions.length > 0 && (
                  <div className="text-xs text-gray-500 mt-1">
                    {category.transactions.length} transaction{category.transactions.length !== 1 ? 's' : ''}
                  </div>
                )}
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
  const otherIncomeSection = plSections.find(s => s.title === 'Other Income');
  const otherExpenseSection = plSections.find(s => s.title === 'Other Expenses');

  const totalIncome = incomeSection?.total || 0;
  // Include payroll wages from Reports API in COGS total
  const totalCOGS = (cogsSection?.total || 0) + payrollCOGSTotal;
  const grossProfit = totalIncome - totalCOGS;
  // Payroll taxes are now injected into "Taxes and Licenses" category via useEffect
  const totalExpenses = expenseSection?.total || 0;
  const operatingIncome = grossProfit - totalExpenses;
  const totalOtherIncome = otherIncomeSection?.total || 0;
  const totalOtherExpenses = otherExpenseSection?.total || 0;
  const netIncome = operatingIncome + totalOtherIncome - totalOtherExpenses;

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

            <button
              onClick={handleSyncAll}
              disabled={syncing}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync from QuickBooks'}
            </button>
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
          <div className="flex items-center justify-between">
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

            {/* Accounting Basis Toggle */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Basis:</span>
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setAccountingBasis('Accrual')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    accountingBasis === 'Accrual'
                      ? 'bg-white text-blue-700 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Accrual
                </button>
                <button
                  onClick={() => setAccountingBasis('Cash')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    accountingBasis === 'Cash'
                      ? 'bg-white text-blue-700 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Cash
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* P&L Statement */}
        <div className="bg-white rounded-lg shadow">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 text-center">
            <h2 className="text-lg font-semibold text-gray-900">Oculus Real Estate Partners</h2>
            <p className="text-sm text-gray-600">Profit and Loss ({accountingBasis} Basis)</p>
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
                {((cogsSection && cogsSection.categories.length > 0) || payrollCOGSItems.length > 0) && (
                  <>
                    <tr className="bg-orange-50/50">
                      <td colSpan={5} className="px-4 py-3 font-bold text-orange-800 text-base">
                        Cost of Goods Sold
                      </td>
                    </tr>
                    {cogsSection?.categories.map(cat => renderCategory(cat, false))}

                    {/* Payroll wages/salary from QBO Reports API (read-only) */}
                    {payrollCOGSItems.length > 0 && (
                      <>
                        <tr className="hover:bg-gray-50">
                          <td className="py-2 pr-4" style={{ paddingLeft: '16px' }}>
                            <div className="flex items-center gap-2">
                              <span className="w-5" />
                              <span className="font-semibold text-gray-900">Payroll</span>
                              <span className="text-xs text-gray-400 italic">(from QBO Payroll)</span>
                            </div>
                          </td>
                          <td className="py-2 text-right tabular-nums font-semibold">
                            {formatCurrency(payrollCOGSTotal)}
                          </td>
                          <td className="py-2 text-right tabular-nums text-gray-500">-</td>
                          <td className="py-2 text-right tabular-nums"></td>
                          <td className="py-2 pl-4 text-center w-20"></td>
                        </tr>
                        {/* Show individual payroll line items indented */}
                        {payrollCOGSItems.map((item, idx) => (
                          <tr key={`payroll-cogs-${idx}`} className="hover:bg-gray-50 text-sm">
                            <td className="py-1 pr-4" style={{ paddingLeft: '64px' }}>
                              <span className="text-gray-600">{item.account_name}</span>
                            </td>
                            <td className="py-1 text-right tabular-nums text-gray-700">
                              {formatCurrency(item.amount)}
                            </td>
                            <td className="py-1 text-right tabular-nums text-gray-400">-</td>
                            <td className="py-1"></td>
                            <td className="py-1"></td>
                          </tr>
                        ))}
                      </>
                    )}

                    {loadingPayroll && payrollCOGSItems.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-2 text-center text-sm text-gray-500 italic">
                          Loading payroll data...
                        </td>
                      </tr>
                    )}

                    <tr className="border-t-2 border-orange-200 bg-orange-50/30">
                      <td className="px-4 py-2 font-bold text-orange-800">Total COGS</td>
                      <td className="px-4 py-2 text-right font-bold text-orange-800 tabular-nums">{formatCurrency(totalCOGS)}</td>
                      <td className="px-4 py-2 text-right font-bold text-orange-700 tabular-nums">{cogsSection?.budgetTotal && cogsSection.budgetTotal > 0 ? formatCurrency(cogsSection.budgetTotal) : '-'}</td>
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
                      <td className="px-4 py-2 font-bold text-red-800">Total Operating Expenses</td>
                      <td className="px-4 py-2 text-right font-bold text-red-800 tabular-nums">{formatCurrency(totalExpenses)}</td>
                      <td className="px-4 py-2 text-right font-bold text-red-700 tabular-nums">{expenseSection.budgetTotal > 0 ? formatCurrency(expenseSection.budgetTotal) : '-'}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </>
                )}

                {/* Operating Income */}
                <tr className="bg-blue-100 border-y-2 border-blue-300">
                  <td className="px-4 py-3 font-bold text-blue-900 text-base">Operating Income</td>
                  <td className={`px-4 py-3 text-right font-bold text-base tabular-nums ${operatingIncome >= 0 ? 'text-blue-900' : 'text-red-600'}`}>
                    {formatCurrency(operatingIncome)}
                  </td>
                  <td colSpan={3}></td>
                </tr>

                {/* Other Income Section */}
                {otherIncomeSection && otherIncomeSection.categories.length > 0 && (
                  <>
                    <tr className="bg-teal-50/50">
                      <td colSpan={5} className="px-4 py-3 font-bold text-teal-800 text-base">
                        Other Income
                      </td>
                    </tr>
                    {otherIncomeSection.categories.map(cat => renderCategory(cat, true))}
                    <tr className="border-t-2 border-teal-200 bg-teal-50/30">
                      <td className="px-4 py-2 font-bold text-teal-800">Total Other Income</td>
                      <td className="px-4 py-2 text-right font-bold text-teal-800 tabular-nums">{formatCurrency(totalOtherIncome)}</td>
                      <td className="px-4 py-2 text-right font-bold text-teal-700 tabular-nums">{otherIncomeSection.budgetTotal > 0 ? formatCurrency(otherIncomeSection.budgetTotal) : '-'}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </>
                )}

                {/* Other Expenses Section */}
                {otherExpenseSection && otherExpenseSection.categories.length > 0 && (
                  <>
                    <tr className="bg-pink-50/50">
                      <td colSpan={5} className="px-4 py-3 font-bold text-pink-800 text-base">
                        Other Expenses
                      </td>
                    </tr>
                    {otherExpenseSection.categories.map(cat => renderCategory(cat, false))}
                    <tr className="border-t-2 border-pink-200 bg-pink-50/30">
                      <td className="px-4 py-2 font-bold text-pink-800">Total Other Expenses</td>
                      <td className="px-4 py-2 text-right font-bold text-pink-800 tabular-nums">{formatCurrency(totalOtherExpenses)}</td>
                      <td className="px-4 py-2 text-right font-bold text-pink-700 tabular-nums">{otherExpenseSection.budgetTotal > 0 ? formatCurrency(otherExpenseSection.budgetTotal) : '-'}</td>
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

        {/* Transaction-Level Comparison Modal */}
        {comparingAccount && (
          <div className="mt-6 bg-white rounded-lg shadow p-4 border-2 border-blue-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">
                Transaction Comparison: {comparingAccount.name}
                <span className="ml-2 text-xs font-normal text-gray-500">
                  (Expected Account ID: {comparingAccount.qbId})
                </span>
              </h3>
              <button
                onClick={() => {
                  setComparingAccount(null);
                  setComparisonData(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {loadingComparison ? (
              <div className="flex items-center gap-2 text-gray-500">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Loading comparison data...</span>
              </div>
            ) : comparisonData ? (
              <div className="space-y-4">
                {/* Summary */}
                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div className="bg-gray-50 p-2 rounded">
                    <p className="text-gray-500 text-xs">OVIS Transactions</p>
                    <p className="font-semibold">{comparisonData.ovisTransactions.length}</p>
                  </div>
                  <div className="bg-gray-50 p-2 rounded">
                    <p className="text-gray-500 text-xs">QBO Transactions</p>
                    <p className="font-semibold">{comparisonData.qboTransactions.length}</p>
                  </div>
                  <div className="bg-green-50 p-2 rounded">
                    <p className="text-gray-500 text-xs">Matched</p>
                    <p className="font-semibold text-green-700">{comparisonData.matched.length}</p>
                  </div>
                  <div className="bg-yellow-50 p-2 rounded">
                    <p className="text-gray-500 text-xs">Unmatched</p>
                    <p className="font-semibold text-yellow-700">
                      {comparisonData.onlyInOvis.length + comparisonData.onlyInQbo.length}
                    </p>
                  </div>
                </div>

                {/* Only in OVIS - these may be causing the discrepancy */}
                {comparisonData.onlyInOvis.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-blue-700 mb-1 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Only in OVIS ({comparisonData.onlyInOvis.length}) - may be miscategorized or duplicate
                    </h4>
                    <div className="bg-blue-50 rounded p-2 max-h-48 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-gray-500">
                            <th className="text-left py-1">Date</th>
                            <th className="text-left py-1">Type</th>
                            <th className="text-left py-1">Transaction ID</th>
                            <th className="text-left py-1">Vendor</th>
                            <th className="text-left py-1">Description</th>
                            <th className="text-right py-1">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {comparisonData.onlyInOvis.map((txn, idx) => (
                            <tr key={idx} className="border-t border-blue-100">
                              <td className="py-1">{formatDate(txn.transaction_date)}</td>
                              <td className="py-1">{txn.transaction_type}</td>
                              <td className="py-1 truncate max-w-[180px] font-mono text-[10px]" title={txn.qb_transaction_id}>
                                {txn.qb_transaction_id}
                              </td>
                              <td className="py-1 truncate max-w-[100px]">{txn.vendor_name || '-'}</td>
                              <td className="py-1 truncate max-w-[150px]" title={txn.description || undefined}>
                                {txn.description || '-'}
                              </td>
                              <td className="py-1 text-right font-medium">{formatCurrency(txn.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="border-t border-blue-200 font-medium">
                          <tr>
                            <td colSpan={5} className="py-1 text-right">Total (these should be deleted by sync cleanup):</td>
                            <td className="py-1 text-right text-blue-700">
                              {formatCurrency(comparisonData.onlyInOvis.reduce((sum, t) => sum + t.amount, 0))}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

                {/* Only in QBO - these may be missing from OVIS */}
                {comparisonData.onlyInQbo.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-red-700 mb-1 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Only in QBO ({comparisonData.onlyInQbo.length}) - missing from OVIS
                    </h4>
                    <div className="bg-red-50 rounded p-2 max-h-48 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-gray-500">
                            <th className="text-left py-1">Date</th>
                            <th className="text-left py-1">Type</th>
                            <th className="text-left py-1">Doc #</th>
                            <th className="text-left py-1">Name</th>
                            <th className="text-right py-1">Debit</th>
                            <th className="text-right py-1">Credit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {comparisonData.onlyInQbo.map((txn, idx) => (
                            <tr key={idx} className="border-t border-red-100">
                              <td className="py-1">{txn.date}</td>
                              <td className="py-1">{txn.type}</td>
                              <td className="py-1">{txn.docNumber || '-'}</td>
                              <td className="py-1 truncate max-w-[100px]">{txn.name || '-'}</td>
                              <td className="py-1 text-right">{txn.debit > 0 ? formatCurrency(txn.debit) : '-'}</td>
                              <td className="py-1 text-right">{txn.credit > 0 ? formatCurrency(txn.credit) : '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="border-t border-red-200 font-medium">
                          <tr>
                            <td colSpan={4} className="py-1 text-right">Total:</td>
                            <td className="py-1 text-right text-red-700">
                              {formatCurrency(comparisonData.onlyInQbo.reduce((sum, t) => sum + t.debit, 0))}
                            </td>
                            <td className="py-1 text-right text-red-700">
                              {formatCurrency(comparisonData.onlyInQbo.reduce((sum, t) => sum + t.credit, 0))}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

                {comparisonData.onlyInOvis.length === 0 && comparisonData.onlyInQbo.length === 0 && (
                  <p className="text-sm text-green-600">
                    All transactions matched between OVIS and QBO.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No comparison data available.</p>
            )}
          </div>
        )}

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
