import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import SlideOutPanel from './SlideOutPanel';
import ConfirmDialog from './ConfirmDialog';
import { supabase } from '../lib/supabaseClient';

interface SiteSubmitSlideOutProps {
  isOpen: boolean;
  onClose: () => void;
  siteSubmitId: string;
  propertySlideoutOpen?: boolean;
  propertySlideoutMinimized?: boolean;
  rightOffset?: number; // Direct offset override
  onDelete?: () => void; // Callback after successful deletion
}

export default function SiteSubmitSlideOut({
  isOpen,
  onClose,
  siteSubmitId,
  propertySlideoutOpen = false,
  propertySlideoutMinimized = false,
  rightOffset: rightOffsetProp,
  onDelete
}: SiteSubmitSlideOutProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Calculate rightOffset based on property slideout state or use direct prop
  const rightOffset = rightOffsetProp !== undefined
    ? rightOffsetProp
    : (propertySlideoutOpen
        ? (propertySlideoutMinimized ? 48 : 900)  // 48px when minimized, 900px when expanded
        : 0);  // 0 when closed

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    setShowDeleteConfirm(false);
    setDeleting(true);

    try {
      const { error } = await supabase
        .from('site_submit')
        .delete()
        .eq('id', siteSubmitId);

      if (error) throw error;

      // Close the slideout
      onClose();

      // Call the onDelete callback if provided
      if (onDelete) {
        onDelete();
      }
    } catch (error) {
      console.error('Error deleting site submit:', error);
      alert(`Error deleting site submit: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setDeleting(false);
    }
  };

  const deleteButton = (
    <button
      onClick={handleDelete}
      disabled={deleting}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      title="Delete this site submit"
    >
      <Trash2 size={16} />
      {deleting ? 'Deleting...' : 'Delete'}
    </button>
  );

  return (
    <>
      <SlideOutPanel
        isOpen={isOpen}
        onClose={onClose}
        title="Site Submit Details"
        width="800px"
        rightOffset={rightOffset}
        canMinimize={true}
        headerActions={deleteButton}
      >
        <iframe
          src={`/site-submit/${siteSubmitId}?embedded=true`}
          className="w-full h-full border-0"
          style={{ minHeight: 'calc(100vh - 120px)' }}
          title="Site Submit Details"
        />
      </SlideOutPanel>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={confirmDelete}
        title="Delete Site Submit"
        message="Are you sure you want to delete this site submit? This action cannot be undone."
        confirmText="Delete"
        confirmButtonClass="bg-red-600 hover:bg-red-700 text-white"
      />
    </>
  );
}
