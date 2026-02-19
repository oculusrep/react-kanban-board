/**
 * TimeHistoryModal - View and edit prospecting time entries for previous days
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { XMarkIcon, PencilIcon, SunIcon } from '@heroicons/react/24/outline';
import TimeEntryModal from '../hunter/TimeEntryModal';
import { ProspectingTimeEntry, ProspectingVacationDay } from '../../lib/types';

interface TimeHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

interface DayEntry {
  date: string;
  minutes: number | null;
  notes: string | null;
  isVacation: boolean;
  vacationReason: string | null;
}

export default function TimeHistoryModal({ isOpen, onClose, onRefresh }: TimeHistoryModalProps) {
  const [entries, setEntries] = useState<DayEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [editingMinutes, setEditingMinutes] = useState(0);
  const [editingNotes, setEditingNotes] = useState('');

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get last 30 days
      const days: DayEntry[] = [];
      const today = new Date();

      for (let i = 0; i < 30; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        days.push({
          date: dateStr,
          minutes: null,
          notes: null,
          isVacation: false,
          vacationReason: null
        });
      }

      // Fetch time entries
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(today.getDate() - 30);
      const startDate = `${thirtyDaysAgo.getFullYear()}-${String(thirtyDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(thirtyDaysAgo.getDate()).padStart(2, '0')}`;

      const { data: timeEntries } = await supabase
        .from('prospecting_time_entry')
        .select('*')
        .eq('user_id', user.id)
        .gte('entry_date', startDate)
        .order('entry_date', { ascending: false });

      // Fetch vacation days
      const { data: vacationDays } = await supabase
        .from('prospecting_vacation_day')
        .select('*')
        .eq('user_id', user.id)
        .gte('vacation_date', startDate)
        .order('vacation_date', { ascending: false });

      // Merge entries
      const entriesMap = new Map<string, DayEntry>();
      days.forEach(d => entriesMap.set(d.date, d));

      timeEntries?.forEach((entry: ProspectingTimeEntry) => {
        const existing = entriesMap.get(entry.entry_date);
        if (existing) {
          existing.minutes = entry.minutes;
          existing.notes = entry.notes;
        }
      });

      vacationDays?.forEach((vd: ProspectingVacationDay) => {
        const existing = entriesMap.get(vd.vacation_date);
        if (existing) {
          existing.isVacation = true;
          existing.vacationReason = vd.reason;
        }
      });

      setEntries(days);
    } catch (err) {
      console.error('Error loading time history:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen, loadHistory]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const dateOnly = new Date(date);
    dateOnly.setHours(0, 0, 0, 0);

    if (dateOnly.getTime() === today.getTime()) {
      return 'Today';
    } else if (dateOnly.getTime() === yesterday.getTime()) {
      return 'Yesterday';
    }
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const formatTime = (minutes: number | null) => {
    if (minutes === null || minutes === 0) return '-';
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hrs === 0) return `${mins}m`;
    if (mins === 0) return `${hrs}h`;
    return `${hrs}h ${mins}m`;
  };

  const handleSaveEntry = async (date: string, minutes: number, notes?: string): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { error } = await supabase
        .from('prospecting_time_entry')
        .upsert({
          entry_date: date,
          minutes,
          notes: notes || null,
          user_id: user.id
        }, {
          onConflict: 'entry_date,user_id'
        });

      if (error) throw error;

      loadHistory();
      onRefresh();
      return true;
    } catch (err) {
      console.error('Error saving entry:', err);
      return false;
    }
  };

  const handleMarkVacation = async (date: string, reason?: string): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { error } = await supabase
        .from('prospecting_vacation_day')
        .insert({
          vacation_date: date,
          reason: reason || null,
          user_id: user.id
        });

      if (error) throw error;

      loadHistory();
      onRefresh();
      return true;
    } catch (err) {
      console.error('Error marking vacation:', err);
      return false;
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50 z-[70]" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-[71] flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Time History</h2>
              <p className="text-sm text-gray-500">Last 30 days of prospecting time</p>
            </div>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center text-gray-500">Loading...</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {entries.map((entry) => (
                  <div
                    key={entry.date}
                    className="px-5 py-3 hover:bg-gray-50 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-24 text-sm font-medium text-gray-700">
                        {formatDate(entry.date)}
                      </div>
                      {entry.isVacation ? (
                        <div className="flex items-center gap-1.5 text-sm text-amber-600">
                          <SunIcon className="w-4 h-4" />
                          <span>Vacation{entry.vacationReason ? `: ${entry.vacationReason}` : ''}</span>
                        </div>
                      ) : (
                        <div className="text-sm">
                          <span className={`font-medium ${entry.minutes ? 'text-gray-900' : 'text-gray-400'}`}>
                            {formatTime(entry.minutes)}
                          </span>
                          {entry.notes && (
                            <span className="ml-2 text-gray-500 truncate max-w-[200px] inline-block align-middle">
                              - {entry.notes}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setEditingDate(entry.date);
                        setEditingMinutes(entry.minutes || 0);
                        setEditingNotes(entry.notes || '');
                      }}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <PencilIcon className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Entry Modal */}
      <TimeEntryModal
        isOpen={!!editingDate}
        onClose={() => setEditingDate(null)}
        onSave={handleSaveEntry}
        onMarkVacation={handleMarkVacation}
        initialDate={editingDate || undefined}
        initialMinutes={editingMinutes}
        initialNotes={editingNotes}
        dailyGoalMinutes={120}
      />
    </>
  );
}
