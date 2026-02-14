/**
 * Finance Hub Page
 *
 * Central dashboard for all financial tools and resources.
 * Provides quick access to CFO Agent, Bookkeeper, Budget & P/L,
 * Cash Flow, QuickBooks, and Payments.
 */

import { useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  BookOpen,
  DollarSign,
  LineChart,
  CreditCard,
  Wallet,
  ArrowRight,
  Brain,
  Calculator,
  Receipt,
  PiggyBank,
  BarChart3,
} from 'lucide-react';

interface FinanceToolCard {
  title: string;
  description: string;
  icon: React.ReactNode;
  path: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

export default function FinanceHubPage() {
  const navigate = useNavigate();

  const aiTools: FinanceToolCard[] = [
    {
      title: 'CFO Agent',
      description: 'AI-powered financial analysis, forecasting, and strategic advice. Ask questions about cash flow, revenue projections, and budget variance.',
      icon: <Brain className="h-8 w-8" />,
      path: '/admin/cfo',
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
    },
    {
      title: 'Bookkeeper',
      description: 'AI assistant for QuickBooks accounting questions, journal entry construction, and proper expense categorization.',
      icon: <BookOpen className="h-8 w-8" />,
      path: '/admin/bookkeeper',
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
      borderColor: 'border-emerald-200',
    },
  ];

  const financeTools: FinanceToolCard[] = [
    {
      title: 'Budget & P/L',
      description: 'View profit & loss statements, track budget vs actual spending, and manage account budgets by month.',
      icon: <BarChart3 className="h-8 w-8" />,
      path: '/admin/budget',
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200',
    },
    {
      title: 'Cash Flow Forecast',
      description: 'Project future cash flow based on expected payments, invoices, and budgeted expenses.',
      icon: <LineChart className="h-8 w-8" />,
      path: '/admin/budget/forecast',
      color: 'text-cyan-600',
      bgColor: 'bg-cyan-50',
      borderColor: 'border-cyan-200',
    },
    {
      title: 'QuickBooks',
      description: 'Manage QuickBooks connection, sync accounts, expenses, and configure commission mappings.',
      icon: <Calculator className="h-8 w-8" />,
      path: '/admin/quickbooks',
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
    },
    {
      title: 'Payments',
      description: 'Track deal payments, manage invoicing, and monitor payment status across all deals.',
      icon: <CreditCard className="h-8 w-8" />,
      path: '/payments',
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-200',
    },
  ];

  const reports: FinanceToolCard[] = [
    {
      title: 'Arty Draw Report',
      description: 'Track commission draws and balances for Arty.',
      icon: <Receipt className="h-8 w-8" />,
      path: '/reports/arty-draw',
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
      borderColor: 'border-indigo-200',
    },
    {
      title: 'Mike Is Owed',
      description: 'View outstanding amounts owed to Mike from deals.',
      icon: <Wallet className="h-8 w-8" />,
      path: '/reports/mike-owed',
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-200',
    },
    {
      title: 'Unpaid Referral Fees',
      description: 'Track referral fees that have not yet been paid out.',
      icon: <PiggyBank className="h-8 w-8" />,
      path: '/reports/unpaid-referrals',
      color: 'text-rose-600',
      bgColor: 'bg-rose-50',
      borderColor: 'border-rose-200',
    },
  ];

  const renderToolCard = (tool: FinanceToolCard) => (
    <button
      key={tool.path}
      onClick={() => navigate(tool.path)}
      className={`${tool.bgColor} ${tool.borderColor} border-2 rounded-xl p-6 text-left hover:shadow-lg transition-all duration-200 hover:scale-[1.02] group`}
    >
      <div className="flex items-start justify-between">
        <div className={`${tool.color} mb-4`}>{tool.icon}</div>
        <ArrowRight className={`h-5 w-5 ${tool.color} opacity-0 group-hover:opacity-100 transition-opacity`} />
      </div>
      <h3 className={`text-lg font-semibold ${tool.color} mb-2`}>{tool.title}</h3>
      <p className="text-sm text-gray-600 leading-relaxed">{tool.description}</p>
    </button>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl">
              <DollarSign className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Finance</h1>
              <p className="text-gray-500">Financial tools, reports, and AI assistants</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* AI Assistants Section */}
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <Brain className="h-5 w-5 text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900">AI Assistants</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {aiTools.map(renderToolCard)}
          </div>
        </div>

        {/* Financial Tools Section */}
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-5 w-5 text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900">Financial Tools</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {financeTools.map(renderToolCard)}
          </div>
        </div>

        {/* Reports Section */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-5 w-5 text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900">Financial Reports</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {reports.map(renderToolCard)}
          </div>
        </div>
      </div>
    </div>
  );
}
