import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  SparklesIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  TagIcon,
  FlagIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';

interface EmailObjectLink {
  id: string;
  object_type: string;
  object_id: string;
  confidence_score: number;
  reasoning_log: string | null;
  link_source: string;
  created_at: string;
  // Resolved names
  object_name?: string;
}

interface AIReasoningTraceProps {
  emailId: string;
}

const AIReasoningTrace: React.FC<AIReasoningTraceProps> = ({ emailId }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [links, setLinks] = useState<EmailObjectLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isExpanded && links.length === 0) {
      fetchLinks();
    }
  }, [isExpanded, emailId]);

  const fetchLinks = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('email_object_link')
        .select('*')
        .eq('email_id', emailId)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      // Resolve object names
      const linksWithNames = await Promise.all(
        (data || []).map(async (link) => {
          let objectName = 'Unknown';
          try {
            if (link.object_type === 'deal') {
              const { data: deal } = await supabase
                .from('deal')
                .select('deal_name')
                .eq('id', link.object_id)
                .single();
              objectName = deal?.deal_name || 'Unknown Deal';
            } else if (link.object_type === 'contact') {
              const { data: contact } = await supabase
                .from('contact')
                .select('first_name, last_name')
                .eq('id', link.object_id)
                .single();
              objectName = contact ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim() : 'Unknown Contact';
            } else if (link.object_type === 'client') {
              const { data: client } = await supabase
                .from('client')
                .select('client_name')
                .eq('id', link.object_id)
                .single();
              objectName = client?.client_name || 'Unknown Client';
            } else if (link.object_type === 'property') {
              const { data: property } = await supabase
                .from('property')
                .select('property_name, address')
                .eq('id', link.object_id)
                .single();
              objectName = property?.property_name || property?.address || 'Unknown Property';
            }
          } catch (e) {
            // Ignore resolution errors
          }
          return { ...link, object_name: objectName };
        })
      );

      setLinks(linksWithNames);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 0.9) return 'text-green-600 bg-green-100';
    if (score >= 0.7) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const getObjectTypeIcon = (type: string) => {
    switch (type) {
      case 'deal':
        return <TagIcon className="w-4 h-4" />;
      case 'contact':
        return <CheckCircleIcon className="w-4 h-4" />;
      case 'client':
        return <FlagIcon className="w-4 h-4" />;
      default:
        return <TagIcon className="w-4 h-4" />;
    }
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'ai_agent':
        return 'AI Agent';
      case 'manual':
        return 'Manual';
      case 'rule':
        return 'Rule';
      default:
        return source;
    }
  };

  return (
    <div className="border-t mt-4 pt-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-sm font-medium text-purple-600 hover:text-purple-800"
      >
        <SparklesIcon className="w-4 h-4" />
        <span>AI Classification</span>
        {isExpanded ? (
          <ChevronUpIcon className="w-4 h-4" />
        ) : (
          <ChevronDownIcon className="w-4 h-4" />
        )}
      </button>

      {isExpanded && (
        <div className="mt-3 bg-purple-50 rounded-lg p-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600"></div>
              <span>Loading...</span>
            </div>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : links.length === 0 ? (
            <p className="text-sm text-gray-500">
              No AI classifications found for this email.
            </p>
          ) : (
            <div className="space-y-3">
              {links.map((link) => (
                <div key={link.id} className="bg-white rounded-md p-3 border border-purple-100">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`p-1 rounded ${getConfidenceColor(link.confidence_score)}`}>
                        {getObjectTypeIcon(link.object_type)}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {link.object_type}: {link.object_name}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span className={`px-1.5 py-0.5 rounded ${getConfidenceColor(link.confidence_score)}`}>
                            {Math.round(link.confidence_score * 100)}% confidence
                          </span>
                          <span>via {getSourceLabel(link.link_source)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {link.reasoning_log && (
                    <div className="mt-2 text-xs text-gray-600 bg-gray-50 rounded p-2">
                      <span className="font-medium">Reasoning: </span>
                      {link.reasoning_log}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AIReasoningTrace;
