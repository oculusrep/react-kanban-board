import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  PlusIcon,
  TrashIcon,
  PencilIcon,
  CheckIcon,
  XMarkIcon,
  SparklesIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';

interface AgentRule {
  id: string;
  rule_text: string;
  rule_type: 'sender' | 'keyword' | 'domain' | 'general';
  match_pattern: string | null;
  target_object_type: 'deal' | 'contact' | 'client' | 'property' | null;
  target_object_id: string | null;
  priority: number;
  is_active: boolean;
  created_at: string;
}

interface CRMObject {
  id: string;
  name: string;
  type: string;
}

const AgentRulesPage: React.FC = () => {
  const [rules, setRules] = useState<AgentRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNewRule, setShowNewRule] = useState(false);

  // Form state
  const [ruleText, setRuleText] = useState('');
  const [ruleType, setRuleType] = useState<'sender' | 'keyword' | 'domain' | 'general'>('general');
  const [matchPattern, setMatchPattern] = useState('');
  const [targetType, setTargetType] = useState<'deal' | 'contact' | 'client' | 'property' | ''>('');
  const [targetId, setTargetId] = useState('');
  const [priority, setPriority] = useState(0);

  // CRM objects for linking
  const [deals, setDeals] = useState<CRMObject[]>([]);
  const [contacts, setContacts] = useState<CRMObject[]>([]);
  const [clients, setClients] = useState<CRMObject[]>([]);

  const fetchRules = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('agent_rules')
        .select('*')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setRules(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCRMObjects = useCallback(async () => {
    // Fetch deals
    const { data: dealData } = await supabase
      .from('deal')
      .select('id, deal_name')
      .order('deal_name')
      .limit(100);
    setDeals((dealData || []).map(d => ({ id: d.id, name: d.deal_name, type: 'deal' })));

    // Fetch contacts
    const { data: contactData } = await supabase
      .from('contact')
      .select('id, first_name, last_name')
      .order('first_name')
      .limit(100);
    setContacts((contactData || []).map(c => ({
      id: c.id,
      name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
      type: 'contact'
    })));

    // Fetch clients
    const { data: clientData } = await supabase
      .from('client')
      .select('id, client_name')
      .order('client_name')
      .limit(100);
    setClients((clientData || []).map(c => ({ id: c.id, name: c.client_name, type: 'client' })));
  }, []);

  useEffect(() => {
    fetchRules();
    fetchCRMObjects();
  }, [fetchRules, fetchCRMObjects]);

  const resetForm = () => {
    setRuleText('');
    setRuleType('general');
    setMatchPattern('');
    setTargetType('');
    setTargetId('');
    setPriority(0);
    setEditingId(null);
    setShowNewRule(false);
  };

  const handleSave = async () => {
    if (!ruleText.trim()) {
      setError('Rule text is required');
      return;
    }

    try {
      const ruleData = {
        rule_text: ruleText,
        rule_type: ruleType,
        match_pattern: matchPattern || null,
        target_object_type: targetType || null,
        target_object_id: targetId || null,
        priority,
        is_active: true,
      };

      if (editingId) {
        const { error: updateError } = await supabase
          .from('agent_rules')
          .update(ruleData)
          .eq('id', editingId);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('agent_rules')
          .insert(ruleData);
        if (insertError) throw insertError;
      }

      resetForm();
      fetchRules();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleEdit = (rule: AgentRule) => {
    setEditingId(rule.id);
    setRuleText(rule.rule_text);
    setRuleType(rule.rule_type);
    setMatchPattern(rule.match_pattern || '');
    setTargetType(rule.target_object_type || '');
    setTargetId(rule.target_object_id || '');
    setPriority(rule.priority);
    setShowNewRule(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this rule?')) return;

    try {
      const { error: deleteError } = await supabase
        .from('agent_rules')
        .delete()
        .eq('id', id);
      if (deleteError) throw deleteError;
      fetchRules();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggleActive = async (rule: AgentRule) => {
    try {
      const { error: updateError } = await supabase
        .from('agent_rules')
        .update({ is_active: !rule.is_active })
        .eq('id', rule.id);
      if (updateError) throw updateError;
      fetchRules();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const getTargetObjects = () => {
    switch (targetType) {
      case 'deal': return deals;
      case 'contact': return contacts;
      case 'client': return clients;
      default: return [];
    }
  };

  const getRuleTypeLabel = (type: string) => {
    switch (type) {
      case 'sender': return 'Sender Rule';
      case 'keyword': return 'Keyword Rule';
      case 'domain': return 'Domain Rule';
      default: return 'General Rule';
    }
  };

  const getTargetName = (rule: AgentRule): string => {
    if (!rule.target_object_id || !rule.target_object_type) return '-';

    let objects: CRMObject[] = [];
    switch (rule.target_object_type) {
      case 'deal': objects = deals; break;
      case 'contact': objects = contacts; break;
      case 'client': objects = clients; break;
    }

    const target = objects.find(o => o.id === rule.target_object_id);
    return target ? `${rule.target_object_type}: ${target.name}` : `${rule.target_object_type}: ${rule.target_object_id.slice(0, 8)}...`;
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <SparklesIcon className="w-6 h-6 text-purple-600" />
          <h1 className="text-2xl font-bold text-gray-900">Agent Rules</h1>
        </div>
        <p className="text-sm text-gray-600">
          Teach the AI agent how to handle specific senders, keywords, or domains.
          Rules are checked before the agent makes any decisions.
        </p>
      </div>

      {/* Info Banner */}
      <div className="mb-6 p-4 bg-purple-50 border border-purple-200 rounded-lg">
        <div className="flex items-start gap-3">
          <InformationCircleIcon className="w-5 h-5 text-purple-600 mt-0.5" />
          <div className="text-sm text-purple-800">
            <p className="font-medium mb-1">How Rules Work</p>
            <ul className="list-disc list-inside space-y-1">
              <li>The agent checks rules FIRST before analyzing any email</li>
              <li>If a rule matches the sender, domain, or keywords, the agent follows it with 100% confidence</li>
              <li>Use rules to teach the agent about specific people or topics</li>
              <li>Example: "Emails from sarah@acme.com should always link to Client: Acme Corp"</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={() => setError(null)} className="text-xs text-red-600 underline mt-1">
            Dismiss
          </button>
        </div>
      )}

      {/* Add Rule Button */}
      {!showNewRule && (
        <button
          onClick={() => setShowNewRule(true)}
          className="mb-6 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700"
        >
          <PlusIcon className="w-4 h-4 mr-2" />
          Add Rule
        </button>
      )}

      {/* New/Edit Rule Form */}
      {showNewRule && (
        <div className="mb-6 p-4 bg-white border rounded-lg shadow-sm">
          <h3 className="font-medium text-gray-900 mb-4">
            {editingId ? 'Edit Rule' : 'New Rule'}
          </h3>

          <div className="space-y-4">
            {/* Rule Text */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Rule (natural language)
              </label>
              <textarea
                value={ruleText}
                onChange={(e) => setRuleText(e.target.value)}
                placeholder="e.g., Emails from sarah@colliers.com should link to Deal: JJ - Milledgeville"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                rows={2}
              />
            </div>

            {/* Rule Type */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rule Type
                </label>
                <select
                  value={ruleType}
                  onChange={(e) => setRuleType(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                  <option value="general">General</option>
                  <option value="sender">Sender (email address)</option>
                  <option value="domain">Domain</option>
                  <option value="keyword">Keyword</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Match Pattern (optional)
                </label>
                <input
                  type="text"
                  value={matchPattern}
                  onChange={(e) => setMatchPattern(e.target.value)}
                  placeholder="e.g., sarah@colliers.com or @colliers.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
              </div>
            </div>

            {/* Target Object */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Link to Type (optional)
                </label>
                <select
                  value={targetType}
                  onChange={(e) => {
                    setTargetType(e.target.value as any);
                    setTargetId('');
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                  <option value="">No automatic link</option>
                  <option value="deal">Deal</option>
                  <option value="contact">Contact</option>
                  <option value="client">Client</option>
                </select>
              </div>

              {targetType && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Link to Object
                  </label>
                  <select
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="">Select...</option>
                    {getTargetObjects().map((obj) => (
                      <option key={obj.id} value={obj.id}>
                        {obj.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Priority (higher = checked first)
              </label>
              <input
                type="number"
                value={priority}
                onChange={(e) => setPriority(parseInt(e.target.value) || 0)}
                className="w-32 px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSave}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700"
              >
                <CheckIcon className="w-4 h-4 mr-2" />
                {editingId ? 'Update Rule' : 'Save Rule'}
              </button>
              <button
                onClick={resetForm}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                <XMarkIcon className="w-4 h-4 mr-2" />
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rules List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-2 text-sm text-gray-500">Loading rules...</p>
        </div>
      ) : rules.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <SparklesIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No rules yet</h3>
          <p className="mt-1 text-sm text-gray-500">
            Add rules to teach the agent how to handle specific emails.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className={`p-4 bg-white border rounded-lg ${!rule.is_active ? 'opacity-50' : ''}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                      rule.rule_type === 'sender' ? 'bg-blue-100 text-blue-700' :
                      rule.rule_type === 'domain' ? 'bg-green-100 text-green-700' :
                      rule.rule_type === 'keyword' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {getRuleTypeLabel(rule.rule_type)}
                    </span>
                    {rule.priority > 0 && (
                      <span className="text-xs text-gray-500">Priority: {rule.priority}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-900">{rule.rule_text}</p>
                  {rule.match_pattern && (
                    <p className="mt-1 text-xs text-gray-500">
                      Pattern: <code className="bg-gray-100 px-1 rounded">{rule.match_pattern}</code>
                    </p>
                  )}
                  {rule.target_object_id && (
                    <p className="mt-1 text-xs text-gray-500">
                      Links to: {getTargetName(rule)}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => handleToggleActive(rule)}
                    className={`p-1.5 rounded-md ${
                      rule.is_active
                        ? 'text-green-600 hover:bg-green-50'
                        : 'text-gray-400 hover:bg-gray-100'
                    }`}
                    title={rule.is_active ? 'Disable rule' : 'Enable rule'}
                  >
                    <CheckIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleEdit(rule)}
                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md"
                    title="Edit rule"
                  >
                    <PencilIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(rule.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md"
                    title="Delete rule"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AgentRulesPage;
