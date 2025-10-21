// src/components/AssignmentHeaderBar.tsx
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

interface AssignmentHeaderBarProps {
  assignment: {
    id: string;
    assignment_name: string;
    assignment_value: number | null;
    fee: number | null;
    priority_id: string | null;
    due_date: string | null;
    client_id: string | null;
  };
  onDelete?: () => void;
}

interface Client {
  id: string;
  client_name: string;
}

interface AssignmentPriority {
  id: string;
  label: string;
}

const AssignmentHeaderBar: React.FC<AssignmentHeaderBarProps> = ({ assignment, onDelete }) => {
  const [client, setClient] = useState<Client | null>(null);
  const [priority, setPriority] = useState<AssignmentPriority | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHeaderData = async () => {
      try {
        // Fetch client data
        if (assignment.client_id) {
          const { data: clientData } = await supabase
            .from('client')
            .select('id, client_name')
            .eq('id', assignment.client_id)
            .single();

          if (clientData) setClient(clientData);
        }

        // Fetch priority data
        if (assignment.priority_id) {
          const { data: priorityData } = await supabase
            .from('assignment_priority')
            .select('id, label')
            .eq('id', assignment.priority_id)
            .single();

          if (priorityData) setPriority(priorityData);
        }
      } catch (error) {
        console.error('Error fetching header data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchHeaderData();
  }, [assignment.client_id, assignment.priority_id]);

  const formatCurrency = (amount: number | null): string => {
    if (amount === null || amount === undefined) return '$0';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return 'Not set';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        month: 'numeric',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return 'Invalid date';
    }
  };

  // Modern assignment icon SVG - Clipboard with checkmark
  const AssignmentIcon = () => (
    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  );

  if (loading) {
    return (
      <div className="bg-gradient-to-r from-indigo-800 to-indigo-700 border-b border-indigo-600 text-white px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                <AssignmentIcon />
              </div>
              <span className="text-sm font-medium text-indigo-300">Loading...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-indigo-800 to-indigo-700 border-b border-indigo-600 text-white px-6 py-4">
      <div className="max-w-7xl mx-auto">
        {/* Top Row - Assignment Label and Name */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-3">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 rounded-lg">
              <AssignmentIcon />
              <span className="text-white text-sm font-medium">Assignment</span>
            </div>
            <h1 className="text-xl font-bold leading-tight">
              {assignment.assignment_name || 'Unnamed Assignment'}
            </h1>
          </div>
          {onDelete && assignment.id && (
            <button
              onClick={onDelete}
              className="flex items-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-md transition-colors"
              title="Delete Assignment"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete
            </button>
          )}
        </div>

        {/* Bottom Row - Assignment Details */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
          <div>
            <div className="text-indigo-300 font-medium mb-1">Account Name</div>
            <div className="text-white">
              {client?.client_name || 'No Client'}
            </div>
          </div>

          <div>
            <div className="text-indigo-300 font-medium mb-1">Priority</div>
            <div className="text-white font-semibold">
              {priority?.label || 'No Priority'}
            </div>
          </div>

          <div>
            <div className="text-indigo-300 font-medium mb-1">Due Date</div>
            <div className="text-white">
              {formatDate(assignment.due_date)}
            </div>
          </div>

          <div>
            <div className="text-indigo-300 font-medium mb-1">Assignment Value</div>
            <div className="text-white font-bold text-base">
              {formatCurrency(assignment.assignment_value)}
            </div>
          </div>

          <div>
            <div className="text-indigo-300 font-medium mb-1">Fee</div>
            <div className="text-emerald-400 font-bold text-base">
              {formatCurrency(assignment.fee)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssignmentHeaderBar;
