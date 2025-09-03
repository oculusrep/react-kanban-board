import React, { useState, useRef, useEffect } from 'react';
import { Database } from '../../../database-schema';

type Property = Database['public']['Tables']['property']['Row'];

interface NotesSectionProps {
  property: Property;
  isEditing: boolean;
  onFieldUpdate: (field: keyof Property, value: any) => void;
}

const NotesSection: React.FC<NotesSectionProps> = ({
  property,
  isEditing,
  onFieldUpdate
}) => {
  const [notes, setNotes] = useState(property.property_notes || '');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout>();

  // Auto-resize textarea
  const adjustTextareaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [notes, isEditing]);

  // Auto-save functionality with debouncing
  const handleNotesChange = (value: string) => {
    setNotes(value);
    
    if (!isEditing) return;

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set new timeout for auto-save
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        setIsSaving(true);
        await onFieldUpdate('property_notes', value);
        setLastSaved(new Date());
      } catch (error) {
        console.error('Auto-save failed:', error);
      } finally {
        setIsSaving(false);
      }
    }, 1000); // Save after 1 second of no typing
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const formatSaveTime = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'just now';
    if (diffMins === 1) return '1 minute ago';
    if (diffMins < 60) return `${diffMins} minutes ago`;
    
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <section className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          <h3 className="text-lg font-semibold text-gray-900">Property Notes</h3>
        </div>

        {isEditing && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            {isSaving && (
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <span>Saving...</span>
              </div>
            )}
            {!isSaving && lastSaved && (
              <div className="flex items-center gap-1">
                <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Saved {formatSaveTime(lastSaved)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-3">
          <textarea
            ref={textareaRef}
            value={notes}
            onChange={(e) => handleNotesChange(e.target.value)}
            placeholder="Add notes about this property, market conditions, tenant information, lease details, or any other relevant information..."
            className="w-full px-3 py-3 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-base resize-none overflow-hidden min-h-[120px]"
            style={{ maxHeight: '400px' }}
          />
          
          {/* Character count and shortcuts */}
          <div className="flex justify-between items-center text-xs text-gray-500">
            <div className="flex items-center gap-4">
              <span>{notes.length} characters</span>
              <div className="hidden sm:flex items-center gap-2">
                <kbd className="px-1.5 py-0.5 bg-gray-100 border rounded text-xs">Cmd+S</kbd>
                <span>to save manually</span>
              </div>
            </div>
            <div className="text-right">
              Auto-saves after 1 second
            </div>
          </div>

          {/* Quick templates */}
          <div className="border-t border-gray-200 pt-3">
            <div className="text-sm font-medium text-gray-700 mb-2">Quick Templates</div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  const template = "Property visit completed on [DATE]\n- Condition: \n- Tenant activity: \n- Market comparison: \n- Next steps: ";
                  handleNotesChange(notes + (notes ? '\n\n' : '') + template);
                }}
                className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs hover:bg-gray-200"
              >
                Site Visit
              </button>
              <button
                onClick={() => {
                  const template = "Market analysis as of [DATE]\n- Comparable properties: \n- Pricing trends: \n- Occupancy rates: \n- Notable developments: ";
                  handleNotesChange(notes + (notes ? '\n\n' : '') + template);
                }}
                className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs hover:bg-gray-200"
              >
                Market Update
              </button>
              <button
                onClick={() => {
                  const template = "Contact follow-up [DATE]\n- Person contacted: \n- Response: \n- Action items: \n- Next contact date: ";
                  handleNotesChange(notes + (notes ? '\n\n' : '') + template);
                }}
                className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs hover:bg-gray-200"
              >
                Follow-up
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div>
          {notes ? (
            <div className="prose prose-sm max-w-none">
              <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">
                {notes}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm">No notes added yet</p>
              <p className="text-xs text-gray-400 mt-1">Click Edit to add property notes</p>
            </div>
          )}
        </div>
      )}

      {/* Voice-to-text placeholder for future enhancement */}
      {isEditing && (
        <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18.5a5.5 5.5 0 100-11 5.5 5.5 0 000 11z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2a10 10 0 100 20 10 10 0 000-20z" />
            </svg>
            <div>
              <div className="text-sm font-medium text-yellow-800">Voice-to-Text Coming Soon</div>
              <div className="text-xs text-yellow-700 mt-1">
                Future enhancement will allow voice dictation for faster note-taking during property visits.
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default NotesSection;