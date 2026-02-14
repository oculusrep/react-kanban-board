/**
 * CFO Dashboard Page
 *
 * AI-powered financial analysis dashboard with chat interface.
 * Users can ask questions about finances and get instant analysis with charts.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, DollarSign, BarChart3, RefreshCw, Lightbulb, Zap } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import CFOChatPanel from '../components/cfo/CFOChatPanel';
import CFOChartRenderer from '../components/cfo/CFOChartRenderer';
import CFOContextPanel from '../components/cfo/CFOContextPanel';
import type { CFOMessage, ChartSpecification, CFOQueryResponse } from '../types/cfo';

export default function CFODashboardPage() {
  const navigate = useNavigate();
  const { userRole } = useAuth();

  const [messages, setMessages] = useState<CFOMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeChart, setActiveChart] = useState<ChartSpecification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showContextPanel, setShowContextPanel] = useState(false);

  useEffect(() => {
    document.title = 'CFO Dashboard | OVIS Admin';
  }, []);

  const handleSendMessage = async (query: string) => {
    setIsLoading(true);
    setError(null);

    // Add user message immediately
    const userMessage: CFOMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: query,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);

    try {
      // Get session for auth
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      // Build conversation history (last 10 messages for context)
      const conversationHistory = messages.slice(-10).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Call the CFO query edge function
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cfo-query`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            query,
            conversation_history: conversationHistory,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Request failed: ${response.status}`);
      }

      const data: CFOQueryResponse = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Unknown error');
      }

      // Add assistant message
      const assistantMessage: CFOMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.answer,
        chart_spec: data.chart_spec,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);

      // If there's a chart, show it
      if (data.chart_spec) {
        setActiveChart(data.chart_spec);
      }
    } catch (err) {
      console.error('CFO Query error:', err);
      setError((err as Error).message);

      // Add error message
      const errorMessage: CFOMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `Sorry, I encountered an error: ${(err as Error).message}. Please try again.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChartClick = (chartSpec: ChartSpecification | undefined) => {
    if (chartSpec) {
      setActiveChart(chartSpec);
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    setActiveChart(null);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/admin/budget')}
                className="text-gray-500 hover:text-gray-700"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-blue-600" />
                  CFO Dashboard
                </h1>
                <p className="text-sm text-gray-500">AI-powered financial analysis</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => handleSendMessage('Reality check')}
                disabled={isLoading}
                className="text-sm text-green-600 hover:text-green-700 flex items-center gap-1 px-3 py-1.5 bg-green-50 hover:bg-green-100 rounded-md transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                title="Get Mike's personal cash flow forecast"
              >
                <Zap className="h-4 w-4" />
                Reality Check
              </button>
              <button
                onClick={() => setShowContextPanel(true)}
                className="text-sm text-amber-600 hover:text-amber-700 flex items-center gap-1 px-2 py-1 hover:bg-amber-50 rounded transition-colors"
                title="View saved context notes"
              >
                <Lightbulb className="h-4 w-4" />
                Context Notes
              </button>
              {messages.length > 0 && (
                <button
                  onClick={handleClearChat}
                  className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
                >
                  <RefreshCw className="h-4 w-4" />
                  Clear Chat
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-140px)]">
          {/* Chat Panel - Left */}
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            <CFOChatPanel
              messages={messages}
              onSendMessage={handleSendMessage}
              isLoading={isLoading}
              onChartClick={handleChartClick}
            />
          </div>

          {/* Chart/Report Panel - Right */}
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            {activeChart ? (
              <div className="h-full p-6">
                <CFOChartRenderer spec={activeChart} />
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 p-8">
                <BarChart3 className="h-16 w-16 mb-4" />
                <h3 className="text-lg font-medium text-gray-600 mb-2">
                  Charts & Reports
                </h3>
                <p className="text-sm text-center max-w-xs">
                  Ask a question in the chat to generate charts and financial analysis
                </p>

                {/* Quick Stats placeholder */}
                <div className="mt-8 grid grid-cols-2 gap-4 w-full max-w-sm">
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <DollarSign className="h-6 w-6 text-green-500 mx-auto mb-2" />
                    <p className="text-xs text-gray-500">Ask about</p>
                    <p className="text-sm font-medium text-gray-700">Cash Flow</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <BarChart3 className="h-6 w-6 text-blue-500 mx-auto mb-2" />
                    <p className="text-xs text-gray-500">Ask about</p>
                    <p className="text-sm font-medium text-gray-700">Budget vs Actual</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <TrendingUp className="h-6 w-6 text-purple-500 mx-auto mb-2" />
                    <p className="text-xs text-gray-500">Ask about</p>
                    <p className="text-sm font-medium text-gray-700">Revenue Forecast</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <DollarSign className="h-6 w-6 text-orange-500 mx-auto mb-2" />
                    <p className="text-xs text-gray-500">Ask about</p>
                    <p className="text-sm font-medium text-gray-700">AR Aging</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Context Panel */}
      <CFOContextPanel
        isOpen={showContextPanel}
        onClose={() => setShowContextPanel(false)}
      />
    </div>
  );
}
