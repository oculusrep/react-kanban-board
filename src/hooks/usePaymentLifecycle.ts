import { supabase } from '../lib/supabaseClient';
import { Payment } from '../lib/types';

/**
 * Hook for managing payment lifecycle based on deal stage changes
 * Handles archiving payments when deals move to "Lost" and restoring when they become active again
 */
export const usePaymentLifecycle = () => {

  /**
   * Archive (soft delete) all unpaid payments for a deal
   * Called when deal moves to "Lost" stage
   * @param dealId - The deal ID
   * @returns Object with success status and count of archived payments
   */
  const archiveUnpaidPayments = async (dealId: string): Promise<{ success: boolean; archivedCount: number; error?: string }> => {
    try {
      console.log(`🗄️ Archiving unpaid payments for deal ${dealId}...`);

      // Update all unpaid payments (payment_received = false) to be inactive
      const { data, error } = await supabase
        .from('payment')
        .update({
          is_active: false,
          deleted_at: new Date().toISOString()
        })
        .eq('deal_id', dealId)
        .eq('payment_received', false)  // Only archive unpaid payments
        .select();

      if (error) {
        console.error('❌ Error archiving payments:', error);
        return { success: false, archivedCount: 0, error: error.message };
      }

      const archivedCount = data?.length || 0;
      console.log(`✅ Archived ${archivedCount} unpaid payment(s)`);

      return { success: true, archivedCount };
    } catch (error) {
      console.error('❌ Exception archiving payments:', error);
      return {
        success: false,
        archivedCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  };

  /**
   * Restore previously archived payments for a deal
   * Called when deal moves from "Lost" back to an active stage
   * @param dealId - The deal ID
   * @returns Object with success status and count of restored payments
   */
  const restoreArchivedPayments = async (dealId: string): Promise<{ success: boolean; restoredCount: number; error?: string }> => {
    try {
      console.log(`📦 Restoring archived payments for deal ${dealId}...`);

      // Restore all archived payments (is_active = false)
      const { data, error } = await supabase
        .from('payment')
        .update({
          is_active: true,
          deleted_at: null
        })
        .eq('deal_id', dealId)
        .eq('is_active', false)
        .select();

      if (error) {
        console.error('❌ Error restoring payments:', error);
        return { success: false, restoredCount: 0, error: error.message };
      }

      const restoredCount = data?.length || 0;
      console.log(`✅ Restored ${restoredCount} payment(s)`);

      return { success: true, restoredCount };
    } catch (error) {
      console.error('❌ Exception restoring payments:', error);
      return {
        success: false,
        restoredCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  };

  /**
   * Get count of active payments for a deal
   * @param dealId - The deal ID
   * @returns Count of active payments
   */
  const getActivePaymentCount = async (dealId: string): Promise<number> => {
    try {
      const { count, error } = await supabase
        .from('payment')
        .select('*', { count: 'exact', head: true })
        .eq('deal_id', dealId)
        .eq('is_active', true);

      if (error) {
        console.error('❌ Error getting payment count:', error);
        return 0;
      }

      return count || 0;
    } catch (error) {
      console.error('❌ Exception getting payment count:', error);
      return 0;
    }
  };

  /**
   * Get count of unpaid active payments for a deal
   * @param dealId - The deal ID
   * @returns Count of unpaid active payments
   */
  const getUnpaidPaymentCount = async (dealId: string): Promise<number> => {
    try {
      const { count, error } = await supabase
        .from('payment')
        .select('*', { count: 'exact', head: true })
        .eq('deal_id', dealId)
        .eq('is_active', true)
        .eq('payment_received', false);

      if (error) {
        console.error('❌ Error getting unpaid payment count:', error);
        return 0;
      }

      return count || 0;
    } catch (error) {
      console.error('❌ Exception getting unpaid payment count:', error);
      return 0;
    }
  };

  /**
   * Regenerate payments for a deal after restoring from Lost stage
   * Deletes all existing payments and regenerates based on current deal commission structure
   * @param dealId - The deal ID
   * @returns Object with success status
   */
  const regeneratePayments = async (dealId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      console.log(`🔄 Regenerating payments for deal ${dealId}...`);

      // Call the database function to generate payments
      // This function handles deleting existing payments and creating new ones
      const { data, error } = await supabase.rpc('generate_payments_for_deal', {
        deal_uuid: dealId
      });

      if (error) {
        console.error('❌ Error regenerating payments:', error);
        return { success: false, error: error.message };
      }

      console.log('✅ Payments regenerated successfully');
      return { success: true };
    } catch (error) {
      console.error('❌ Exception regenerating payments:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  };

  return {
    archiveUnpaidPayments,
    restoreArchivedPayments,
    regeneratePayments,
    getActivePaymentCount,
    getUnpaidPaymentCount
  };
};
