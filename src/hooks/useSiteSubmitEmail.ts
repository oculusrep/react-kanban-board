import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { generateSiteSubmitEmailTemplate, PropertyUnitFile } from '../utils/siteSubmitEmailTemplate';
import DropboxService from '../services/dropboxService';
import { EmailData } from '../components/EmailComposerModal';

interface UseSiteSubmitEmailOptions {
  showToast: (message: string, options?: { type?: 'success' | 'error' | 'info'; duration?: number }) => void;
}

export function useSiteSubmitEmail({ showToast }: UseSiteSubmitEmailOptions) {
  const [showEmailComposer, setShowEmailComposer] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailDefaultData, setEmailDefaultData] = useState<{
    subject: string;
    body: string;
    recipients: any[];
  }>({ subject: '', body: '', recipients: [] });

  const prepareEmail = async (siteSubmitId: string) => {
    try {
      // Fetch site submit data with related information to generate email template
      const { data: siteSubmitData, error: siteSubmitError } = await supabase
        .from('site_submit')
        .select(`
          *,
          client:client_id (
            id,
            client_name
          ),
          property:property_id (
            id,
            property_name,
            address,
            city,
            state,
            zip,
            trade_area,
            map_link,
            latitude,
            longitude,
            verified_latitude,
            verified_longitude,
            available_sqft,
            acres,
            building_sqft,
            rent_psf,
            asking_lease_price,
            asking_purchase_price,
            nnn_psf,
            marketing_materials,
            site_plan,
            demographics,
            traffic_count,
            traffic_count_2nd,
            total_traffic,
            1_mile_pop,
            3_mile_pop,
            hh_income_median_3_mile
          ),
          property_unit:property_unit_id (
            id,
            property_unit_name,
            sqft,
            rent,
            nnn
          )
        `)
        .eq('id', siteSubmitId)
        .single();

      if (siteSubmitError) throw siteSubmitError;
      if (!siteSubmitData) throw new Error('Site submit not found');

      // Fetch Site Selector contacts for this client using new role system
      const { data: contactRoles, error: contactsError } = await supabase
        .from('contact_client_role')
        .select(`
          contact:contact_id (
            id,
            first_name,
            last_name,
            email
          ),
          role:role_id (
            role_name
          )
        `)
        .eq('client_id', siteSubmitData.client_id)
        .eq('is_active', true);

      if (contactsError) throw contactsError;

      // Filter for Site Selector role and contacts with email addresses
      const contacts = contactRoles
        ?.filter((item: any) =>
          item.role?.role_name === 'Site Selector' &&
          item.contact?.email
        )
        .map((item: any) => item.contact)
        || [];

      // Deduplicate contacts by email
      const uniqueContacts = Array.from(
        new Map(contacts.map((c: any) => [c.email, c])).values()
      );

      // Show user-friendly error if no site selectors are found
      if (uniqueContacts.length === 0) {
        showToast('No site selectors are associated to this client', { type: 'error' });
        return false;
      }

      // Fetch logged-in user data for email signature
      const { data: { user } } = await supabase.auth.getSession();
      const { data: userData } = await supabase
        .from('user')
        .select('first_name, last_name, email, mobile_phone')
        .eq('id', user?.id)
        .single();

      // Fetch property unit files if property_unit_id exists
      let propertyUnitFiles: PropertyUnitFile[] = [];
      if (siteSubmitData.property_unit_id) {
        try {
          const { data: dropboxMapping } = await supabase
            .from('dropbox_mapping')
            .select('dropbox_folder_path')
            .eq('entity_type', 'property_unit')
            .eq('entity_id', siteSubmitData.property_unit_id)
            .single();

          if (dropboxMapping?.dropbox_folder_path) {
            const dropboxService = new DropboxService(
              import.meta.env.VITE_DROPBOX_ACCESS_TOKEN || '',
              import.meta.env.VITE_DROPBOX_REFRESH_TOKEN || '',
              import.meta.env.VITE_DROPBOX_APP_KEY || '',
              import.meta.env.VITE_DROPBOX_APP_SECRET || ''
            );

            const files = await dropboxService.listFolderContents(dropboxMapping.dropbox_folder_path);

            const filePromises = files
              .filter(file => file.type === 'file')
              .map(async (file) => {
                try {
                  const sharedLink = await dropboxService.getSharedLink(file.path);
                  return {
                    name: file.name,
                    sharedLink: sharedLink
                  };
                } catch (error) {
                  console.error(`Failed to get shared link for ${file.name}:`, error);
                  return null;
                }
              });

            const filesWithLinks = await Promise.all(filePromises);
            propertyUnitFiles = filesWithLinks.filter((file): file is PropertyUnitFile => file !== null);
          }
        } catch (error) {
          console.error('Error fetching property unit files:', error);
        }
      }

      // Generate default email template
      const defaultSubject = `New site for Review – ${siteSubmitData.property?.property_name || 'Untitled'} – ${siteSubmitData.client?.client_name || 'N/A'}`;
      const defaultBody = generateSiteSubmitEmailTemplate({
        siteSubmit: siteSubmitData,
        property: siteSubmitData.property,
        propertyUnit: siteSubmitData.property_unit,
        contacts: uniqueContacts,
        userData,
        propertyUnitFiles,
      });

      // Set email default data and show composer modal
      setEmailDefaultData({
        subject: defaultSubject,
        body: defaultBody,
        recipients: contacts,
      });
      setShowEmailComposer(true);
      return true;
    } catch (error) {
      console.error('Error preparing email:', error);
      showToast(
        `Error preparing email: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { type: 'error' }
      );
      return false;
    }
  };

  const sendEmail = async (siteSubmitId: string, emailData: EmailData) => {
    setSendingEmail(true);
    try {
      const { data: { session, user } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('Not authenticated');
      }

      // Fetch user email from the user table
      const { data: userData } = await supabase
        .from('user')
        .select('email')
        .eq('id', user?.id)
        .single();

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-site-submit-email`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            siteSubmitId,
            customEmail: emailData,
            submitterEmail: userData?.email || user?.email
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || result.message || 'Failed to send email');
      }

      showToast(
        `Successfully sent ${result.emailsSent} email(s)`,
        { type: 'success' }
      );

      // Close the email composer modal after successful send
      setShowEmailComposer(false);
    } catch (error) {
      console.error('Error sending email:', error);
      showToast(
        `Error sending email: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { type: 'error' }
      );
      throw error; // Re-throw to keep modal open on error
    } finally {
      setSendingEmail(false);
    }
  };

  return {
    showEmailComposer,
    setShowEmailComposer,
    sendingEmail,
    emailDefaultData,
    prepareEmail,
    sendEmail,
  };
}
