// Hunter Settings Page - Email Templates and Signatures
// /hunter/settings

import React, { useState, useEffect, useCallback, lazy, Suspense, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  DocumentDuplicateIcon,
  CheckIcon,
  XMarkIcon,
  EnvelopeIcon,
  SparklesIcon,
  PhotoIcon,
  ArrowLeftIcon
} from '@heroicons/react/24/outline';

// Lazy load ReactQuill
const ReactQuill = lazy(() => import('react-quill').then(module => {
  import('react-quill/dist/quill.snow.css');
  return module;
}));

// ============================================================================
// Types
// ============================================================================

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: string | null;
  created_by: string;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}

interface EmailSignature {
  id: string;
  user_id: string;
  name: string;
  signature_html: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Constants
// ============================================================================

const TEMPLATE_CATEGORIES = [
  'Cold Outreach',
  'Follow-up',
  'Meeting Request',
  'Introduction',
  'Thank You',
  'Check-in',
  'Other'
];

const TEMPLATE_VARIABLES = [
  { variable: '{{first_name}}', description: "Contact's first name" },
  { variable: '{{last_name}}', description: "Contact's last name" },
  { variable: '{{full_name}}', description: "Contact's full name" },
  { variable: '{{company}}', description: "Contact's company" },
];

// ============================================================================
// Main Component
// ============================================================================

export default function HunterSettingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'templates' | 'signature'>('templates');
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Templates state
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<Partial<EmailTemplate> | null>(null);
  const [templateSearch, setTemplateSearch] = useState('');
  const [templateCategory, setTemplateCategory] = useState<string>('all');

  // Signature state
  const [signatures, setSignatures] = useState<EmailSignature[]>([]);
  const [editingSignature, setEditingSignature] = useState<Partial<EmailSignature> | null>(null);

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Get current user ID
  useEffect(() => {
    const fetchUserId = async () => {
      if (!user?.email) return;
      const { data } = await supabase
        .from('user')
        .select('id')
        .eq('email', user.email)
        .single();
      if (data) setCurrentUserId(data.id);
    };
    fetchUserId();
  }, [user?.email]);

  // Load data
  const loadData = useCallback(async () => {
    if (!currentUserId) return;
    setLoading(true);

    try {
      // Load templates (own + shared)
      const { data: templateData } = await supabase
        .from('email_template')
        .select('*')
        .or(`created_by.eq.${currentUserId},is_shared.eq.true`)
        .order('name');

      setTemplates(templateData || []);

      // Load signatures (own only)
      const { data: signatureData } = await supabase
        .from('user_email_signature')
        .select('*')
        .eq('user_id', currentUserId)
        .order('is_default', { ascending: false });

      setSignatures(signatureData || []);
    } catch (err) {
      console.error('Error loading settings:', err);
      showToast('Failed to load settings', 'error');
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    if (currentUserId) loadData();
  }, [currentUserId, loadData]);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Filter templates
  const filteredTemplates = useMemo(() => {
    return templates.filter(t => {
      const matchesSearch = !templateSearch ||
        t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
        t.subject.toLowerCase().includes(templateSearch.toLowerCase());
      const matchesCategory = templateCategory === 'all' || t.category === templateCategory;
      return matchesSearch && matchesCategory;
    });
  }, [templates, templateSearch, templateCategory]);

  // ============================================================================
  // Template CRUD
  // ============================================================================

  const saveTemplate = async () => {
    if (!editingTemplate || !currentUserId) return;

    try {
      if (editingTemplate.id) {
        // Update existing
        const { error } = await supabase
          .from('email_template')
          .update({
            name: editingTemplate.name,
            subject: editingTemplate.subject,
            body: editingTemplate.body,
            category: editingTemplate.category,
            is_shared: editingTemplate.is_shared
          })
          .eq('id', editingTemplate.id);

        if (error) throw error;
        showToast('Template updated', 'success');
      } else {
        // Create new
        const { error } = await supabase
          .from('email_template')
          .insert({
            name: editingTemplate.name,
            subject: editingTemplate.subject,
            body: editingTemplate.body,
            category: editingTemplate.category,
            created_by: currentUserId,
            is_shared: editingTemplate.is_shared || false
          });

        if (error) throw error;
        showToast('Template created', 'success');
      }

      setEditingTemplate(null);
      loadData();
    } catch (err) {
      console.error('Error saving template:', err);
      showToast('Failed to save template', 'error');
    }
  };

  const deleteTemplate = async (id: string) => {
    if (!confirm('Delete this template?')) return;

    try {
      const { error } = await supabase
        .from('email_template')
        .delete()
        .eq('id', id);

      if (error) throw error;
      showToast('Template deleted', 'success');
      loadData();
    } catch (err) {
      console.error('Error deleting template:', err);
      showToast('Failed to delete template', 'error');
    }
  };

  const duplicateTemplate = async (template: EmailTemplate) => {
    if (!currentUserId) return;

    try {
      const { error } = await supabase
        .from('email_template')
        .insert({
          name: `${template.name} (Copy)`,
          subject: template.subject,
          body: template.body,
          category: template.category,
          created_by: currentUserId,
          is_shared: false
        });

      if (error) throw error;
      showToast('Template duplicated', 'success');
      loadData();
    } catch (err) {
      console.error('Error duplicating template:', err);
      showToast('Failed to duplicate template', 'error');
    }
  };

  // ============================================================================
  // Signature CRUD
  // ============================================================================

  const saveSignature = async () => {
    if (!editingSignature || !currentUserId) return;

    try {
      if (editingSignature.id) {
        // Update existing
        const { error } = await supabase
          .from('user_email_signature')
          .update({
            name: editingSignature.name,
            signature_html: editingSignature.signature_html,
            is_default: editingSignature.is_default
          })
          .eq('id', editingSignature.id);

        if (error) throw error;
        showToast('Signature updated', 'success');
      } else {
        // If this is the first signature or marked as default, make it default
        const isDefault = signatures.length === 0 || editingSignature.is_default;

        // If setting as default, unset other defaults
        if (isDefault) {
          await supabase
            .from('user_email_signature')
            .update({ is_default: false })
            .eq('user_id', currentUserId);
        }

        const { error } = await supabase
          .from('user_email_signature')
          .insert({
            user_id: currentUserId,
            name: editingSignature.name || 'Default Signature',
            signature_html: editingSignature.signature_html,
            is_default: isDefault
          });

        if (error) throw error;
        showToast('Signature created', 'success');
      }

      setEditingSignature(null);
      loadData();
    } catch (err) {
      console.error('Error saving signature:', err);
      showToast('Failed to save signature', 'error');
    }
  };

  const deleteSignature = async (id: string) => {
    if (!confirm('Delete this signature?')) return;

    try {
      const { error } = await supabase
        .from('user_email_signature')
        .delete()
        .eq('id', id);

      if (error) throw error;
      showToast('Signature deleted', 'success');
      loadData();
    } catch (err) {
      console.error('Error deleting signature:', err);
      showToast('Failed to delete signature', 'error');
    }
  };

  const setDefaultSignature = async (id: string) => {
    if (!currentUserId) return;

    try {
      // Unset all defaults
      await supabase
        .from('user_email_signature')
        .update({ is_default: false })
        .eq('user_id', currentUserId);

      // Set new default
      await supabase
        .from('user_email_signature')
        .update({ is_default: true })
        .eq('id', id);

      showToast('Default signature updated', 'success');
      loadData();
    } catch (err) {
      console.error('Error setting default signature:', err);
      showToast('Failed to update default', 'error');
    }
  };

  // Quill modules configuration
  const quillModules = useMemo(() => ({
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      [{ 'font': [] }],
      [{ 'size': ['small', false, 'large', 'huge'] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'color': [] }, { 'background': [] }],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      [{ 'align': [] }],
      ['link', 'image'],
      ['clean']
    ],
  }), []);

  const quillFormats = [
    'header', 'font', 'size',
    'bold', 'italic', 'underline', 'strike',
    'color', 'background',
    'list', 'bullet',
    'align',
    'link', 'image'
  ];

  // ============================================================================
  // Render
  // ============================================================================

  if (loading && !templates.length && !signatures.length) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg ${
          toast.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/hunter')}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              title="Back to Hunter"
            >
              <ArrowLeftIcon className="w-5 h-5" />
            </button>
            <SparklesIcon className="w-8 h-8 text-orange-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Hunter Settings</h1>
              <p className="text-sm text-gray-500">Manage email templates and signatures</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="mt-6 border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('templates')}
                className={`pb-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'templates'
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <EnvelopeIcon className="w-5 h-5 inline mr-2" />
                Email Templates
              </button>
              <button
                onClick={() => setActiveTab('signature')}
                className={`pb-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'signature'
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <PencilIcon className="w-5 h-5 inline mr-2" />
                Email Signature
              </button>
            </nav>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* ============================================================ */}
        {/* Templates Tab */}
        {/* ============================================================ */}
        {activeTab === 'templates' && (
          <div>
            {/* Template Editor Modal */}
            {editingTemplate && (
              <div className="fixed inset-0 z-50 overflow-y-auto">
                <div className="flex items-center justify-center min-h-screen px-4">
                  <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setEditingTemplate(null)} />
                  <div className="relative bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                    <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                      <h3 className="text-lg font-medium">
                        {editingTemplate.id ? 'Edit Template' : 'New Template'}
                      </h3>
                      <button onClick={() => setEditingTemplate(null)} className="text-gray-400 hover:text-gray-500">
                        <XMarkIcon className="w-6 h-6" />
                      </button>
                    </div>

                    <div className="px-6 py-4 space-y-4">
                      {/* Template Name */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Template Name</label>
                        <input
                          type="text"
                          value={editingTemplate.name || ''}
                          onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-orange-500 focus:border-orange-500"
                          placeholder="e.g., Initial Outreach"
                        />
                      </div>

                      {/* Category */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                        <select
                          value={editingTemplate.category || ''}
                          onChange={(e) => setEditingTemplate({ ...editingTemplate, category: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-orange-500 focus:border-orange-500"
                        >
                          <option value="">Select category...</option>
                          {TEMPLATE_CATEGORIES.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      </div>

                      {/* Subject */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Subject Line</label>
                        <input
                          type="text"
                          value={editingTemplate.subject || ''}
                          onChange={(e) => setEditingTemplate({ ...editingTemplate, subject: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-orange-500 focus:border-orange-500"
                          placeholder="e.g., Quick question about {{company}}"
                        />
                      </div>

                      {/* Variable Reference */}
                      <div className="bg-blue-50 rounded-lg p-3">
                        <p className="text-sm font-medium text-blue-800 mb-2">Available Variables</p>
                        <div className="flex flex-wrap gap-2">
                          {TEMPLATE_VARIABLES.map(v => (
                            <span
                              key={v.variable}
                              className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs cursor-pointer hover:bg-blue-200"
                              onClick={() => {
                                const textarea = document.querySelector('.ql-editor') as HTMLElement;
                                if (textarea) {
                                  textarea.focus();
                                  document.execCommand('insertText', false, v.variable);
                                }
                              }}
                              title={v.description}
                            >
                              {v.variable}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Body Editor */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email Body</label>
                        <div className="border border-gray-300 rounded-lg overflow-hidden">
                          <Suspense fallback={<div className="h-64 flex items-center justify-center text-gray-400">Loading editor...</div>}>
                            <ReactQuill
                              theme="snow"
                              value={editingTemplate.body || ''}
                              onChange={(value) => setEditingTemplate({ ...editingTemplate, body: value })}
                              modules={quillModules}
                              formats={quillFormats}
                              style={{ height: '300px' }}
                            />
                          </Suspense>
                        </div>
                      </div>

                      {/* Share Option */}
                      <div className="flex items-center gap-2 pt-4">
                        <input
                          type="checkbox"
                          id="is_shared"
                          checked={editingTemplate.is_shared || false}
                          onChange={(e) => setEditingTemplate({ ...editingTemplate, is_shared: e.target.checked })}
                          className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                        />
                        <label htmlFor="is_shared" className="text-sm text-gray-700">
                          Share this template with the organization
                        </label>
                      </div>
                    </div>

                    <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                      <button
                        onClick={() => setEditingTemplate(null)}
                        className="px-4 py-2 text-gray-700 hover:text-gray-900"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={saveTemplate}
                        disabled={!editingTemplate.name || !editingTemplate.subject || !editingTemplate.body}
                        className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
                      >
                        Save Template
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Templates List Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <input
                  type="text"
                  value={templateSearch}
                  onChange={(e) => setTemplateSearch(e.target.value)}
                  placeholder="Search templates..."
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-orange-500 focus:border-orange-500"
                />
                <select
                  value={templateCategory}
                  onChange={(e) => setTemplateCategory(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-orange-500 focus:border-orange-500"
                >
                  <option value="all">All Categories</option>
                  {TEMPLATE_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => setEditingTemplate({ name: '', subject: '', body: '', category: '', is_shared: false })}
                className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
              >
                <PlusIcon className="w-5 h-5" />
                New Template
              </button>
            </div>

            {/* Templates Grid */}
            {filteredTemplates.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-12 text-center">
                <EnvelopeIcon className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">No templates yet</p>
                <p className="text-sm text-gray-400 mt-1">Create your first email template to speed up prospecting</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredTemplates.map(template => (
                  <div key={template.id} className="bg-white rounded-lg shadow hover:shadow-md transition-shadow">
                    <div className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-gray-900 truncate">{template.name}</h3>
                          <p className="text-sm text-gray-500 truncate">{template.subject}</p>
                        </div>
                        {template.is_shared && (
                          <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">Shared</span>
                        )}
                      </div>
                      {template.category && (
                        <span className="inline-block mt-2 px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                          {template.category}
                        </span>
                      )}
                      <div
                        className="mt-3 text-sm text-gray-600 line-clamp-3"
                        dangerouslySetInnerHTML={{ __html: template.body }}
                      />
                    </div>
                    <div className="px-4 py-3 border-t border-gray-100 flex justify-end gap-2">
                      <button
                        onClick={() => duplicateTemplate(template)}
                        className="p-2 text-gray-400 hover:text-gray-600"
                        title="Duplicate"
                      >
                        <DocumentDuplicateIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setEditingTemplate(template)}
                        className="p-2 text-gray-400 hover:text-blue-600"
                        title="Edit"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      {template.created_by === currentUserId && (
                        <button
                          onClick={() => deleteTemplate(template.id)}
                          className="p-2 text-gray-400 hover:text-red-600"
                          title="Delete"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* Signature Tab */}
        {/* ============================================================ */}
        {activeTab === 'signature' && (
          <div>
            {/* Signature Editor Modal */}
            {editingSignature && (
              <div className="fixed inset-0 z-50 overflow-y-auto">
                <div className="flex items-center justify-center min-h-screen px-4">
                  <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setEditingSignature(null)} />
                  <div className="relative bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                    <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                      <h3 className="text-lg font-medium">
                        {editingSignature.id ? 'Edit Signature' : 'New Signature'}
                      </h3>
                      <button onClick={() => setEditingSignature(null)} className="text-gray-400 hover:text-gray-500">
                        <XMarkIcon className="w-6 h-6" />
                      </button>
                    </div>

                    <div className="px-6 py-4 space-y-4">
                      {/* Signature Name */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Signature Name</label>
                        <input
                          type="text"
                          value={editingSignature.name || ''}
                          onChange={(e) => setEditingSignature({ ...editingSignature, name: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-orange-500 focus:border-orange-500"
                          placeholder="e.g., Professional, Casual"
                        />
                      </div>

                      {/* Info about images */}
                      <div className="bg-blue-50 rounded-lg p-3 flex items-start gap-3">
                        <PhotoIcon className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-blue-800">Adding Images</p>
                          <p className="text-sm text-blue-600">
                            Click the image icon in the toolbar to add logos or photos.
                            You can paste image URLs or upload from your computer.
                          </p>
                        </div>
                      </div>

                      {/* Signature Editor */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Signature Content</label>
                        <div className="border border-gray-300 rounded-lg overflow-hidden">
                          <Suspense fallback={<div className="h-64 flex items-center justify-center text-gray-400">Loading editor...</div>}>
                            <ReactQuill
                              theme="snow"
                              value={editingSignature.signature_html || ''}
                              onChange={(value) => setEditingSignature({ ...editingSignature, signature_html: value })}
                              modules={quillModules}
                              formats={quillFormats}
                              style={{ height: '250px' }}
                            />
                          </Suspense>
                        </div>
                      </div>

                      {/* Default Option */}
                      <div className="flex items-center gap-2 pt-4">
                        <input
                          type="checkbox"
                          id="is_default"
                          checked={editingSignature.is_default || false}
                          onChange={(e) => setEditingSignature({ ...editingSignature, is_default: e.target.checked })}
                          className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                        />
                        <label htmlFor="is_default" className="text-sm text-gray-700">
                          Set as default signature
                        </label>
                      </div>
                    </div>

                    <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                      <button
                        onClick={() => setEditingSignature(null)}
                        className="px-4 py-2 text-gray-700 hover:text-gray-900"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={saveSignature}
                        disabled={!editingSignature.signature_html}
                        className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
                      >
                        Save Signature
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Signatures List Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-sm text-gray-600">
                  Create email signatures that will be automatically added to your emails.
                </p>
              </div>
              <button
                onClick={() => setEditingSignature({ name: 'Default Signature', signature_html: '', is_default: true })}
                className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
              >
                <PlusIcon className="w-5 h-5" />
                New Signature
              </button>
            </div>

            {/* Signatures List */}
            {signatures.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-12 text-center">
                <PencilIcon className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">No signatures yet</p>
                <p className="text-sm text-gray-400 mt-1">Create a signature to automatically add to your emails</p>
              </div>
            ) : (
              <div className="space-y-4">
                {signatures.map(sig => (
                  <div key={sig.id} className="bg-white rounded-lg shadow">
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <h3 className="font-medium text-gray-900">{sig.name}</h3>
                          {sig.is_default && (
                            <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded flex items-center gap-1">
                              <CheckIcon className="w-3 h-3" />
                              Default
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {!sig.is_default && (
                            <button
                              onClick={() => setDefaultSignature(sig.id)}
                              className="text-sm text-blue-600 hover:text-blue-800"
                            >
                              Set as default
                            </button>
                          )}
                          <button
                            onClick={() => setEditingSignature(sig)}
                            className="p-2 text-gray-400 hover:text-blue-600"
                            title="Edit"
                          >
                            <PencilIcon className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deleteSignature(sig.id)}
                            className="p-2 text-gray-400 hover:text-red-600"
                            title="Delete"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      {/* Preview */}
                      <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                        <div
                          className="prose prose-sm max-w-none"
                          dangerouslySetInnerHTML={{ __html: sig.signature_html }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
