import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';

interface EmailTemplate {
  subject: string;
  message: string;
}

export default function PortalEmailSettingsPage() {
  const { user } = useAuth();
  const [template, setTemplate] = useState<EmailTemplate>({
    subject: "You're Invited to the Oculus Client Portal",
    message: `Hi {{firstName}},

You've been invited to access the Oculus Client Portal. This portal gives you visibility into your real estate projects, including property details, documents, and direct communication with your broker team.

Click the button below to set up your account.

If you have any questions, simply reply to this email or reach out to your broker representative.

Best regards`,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load template from database
  useEffect(() => {
    async function loadTemplate() {
      try {
        const { data, error } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'portal_invite_email_template')
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error('Error loading template:', error);
        }

        if (data?.value) {
          setTemplate(data.value as EmailTemplate);
        }
      } catch (err) {
        console.error('Error loading template:', err);
      } finally {
        setLoading(false);
      }
    }

    loadTemplate();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaveSuccess(false);

    try {
      const { error: upsertError } = await supabase
        .from('app_settings')
        .upsert({
          key: 'portal_invite_email_template',
          value: template,
          description: "Default email template for portal invitations. Use {{firstName}} for contact's first name.",
          updated_at: new Date().toISOString(),
          updated_by: user?.id,
        });

      if (upsertError) throw upsertError;

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      console.error('Error saving template:', err);
      setError(err.message || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setTemplate({
      subject: "You're Invited to the Oculus Client Portal",
      message: `Hi {{firstName}},

You've been invited to access the Oculus Client Portal. This portal gives you visibility into your real estate projects, including property details, documents, and direct communication with your broker team.

Click the button below to set up your account.

If you have any questions, simply reply to this email or reach out to your broker representative.

Best regards`,
    });
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center space-x-2 text-gray-500">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
          <span>Loading template...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Portal Invite Email Template</h1>
        <p className="mt-1 text-sm text-gray-500">
          Customize the default email template that is used when sending portal invitations.
          Individual invites can still be customized before sending.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {saveSuccess && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-md">
          <p className="text-sm text-green-700">Template saved successfully!</p>
        </div>
      )}

      <div className="bg-white shadow rounded-lg p-6">
        {/* Subject */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Email Subject
          </label>
          <input
            type="text"
            value={template.subject}
            onChange={e => setTemplate(prev => ({ ...prev, subject: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
            placeholder="Enter email subject..."
          />
        </div>

        {/* Message */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Email Message
          </label>
          <textarea
            value={template.message}
            onChange={e => setTemplate(prev => ({ ...prev, message: e.target.value }))}
            rows={12}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 font-mono"
            placeholder="Enter email message..."
          />
          <p className="mt-2 text-xs text-gray-500">
            <strong>Available placeholders:</strong> Use <code className="bg-gray-100 px-1 rounded">{'{{firstName}}'}</code> to insert the contact's first name.
          </p>
          <p className="mt-1 text-xs text-gray-500">
            <strong>Note:</strong> The "Set Up Your Account" button and expiration notice are automatically added below your message.
          </p>
        </div>

        {/* Preview */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Preview
          </label>
          <div className="border border-gray-200 rounded-md p-4 bg-gray-50">
            <div className="mb-3">
              <span className="text-xs font-medium text-gray-500">Subject: </span>
              <span className="text-sm text-gray-900">{template.subject}</span>
            </div>
            <div className="border-t border-gray-200 pt-3">
              <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
                {template.message.replace(/\{\{firstName\}\}/g, 'John')}
              </div>
              <div className="mt-4 text-center">
                <span className="inline-block px-6 py-3 bg-blue-600 text-white text-sm font-medium rounded-md">
                  Set Up Your Account
                </span>
              </div>
              <div className="mt-4 p-3 bg-gray-100 rounded-md text-xs text-gray-600">
                <strong>Note:</strong> This invitation link will expire on [expiration date]. If you need a new link, please contact your broker.
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={handleReset}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            Reset to Default
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Template'}
          </button>
        </div>
      </div>
    </div>
  );
}
