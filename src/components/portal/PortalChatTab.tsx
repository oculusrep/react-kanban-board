import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';

interface Comment {
  id: string;
  content: string;
  visibility: 'internal' | 'client';
  is_edited: boolean;
  created_at: string;
  updated_at: string;
  author_id: string;
  author_name?: string;
  author_email?: string;
}

interface PortalChatTabProps {
  siteSubmitId: string;
  showInternalComments: boolean; // true for brokers, false for clients
}

/**
 * PortalChatTab - Two-tier comment system
 *
 * - Internal comments: Only visible to brokers
 * - Client-visible comments: Visible to both brokers and clients
 */
export default function PortalChatTab({ siteSubmitId, showInternalComments }: PortalChatTabProps) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');
  const [commentVisibility, setCommentVisibility] = useState<'internal' | 'client'>('client');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const commentsEndRef = useRef<HTMLDivElement>(null);

  // Fetch comments
  useEffect(() => {
    async function fetchComments() {
      setLoading(true);
      setError(null);

      try {
        let query = supabase
          .from('site_submit_comment')
          .select('*')
          .eq('site_submit_id', siteSubmitId)
          .order('created_at', { ascending: true });

        // If not showing internal comments, filter to client-visible only
        if (!showInternalComments) {
          query = query.eq('visibility', 'client');
        }

        const { data, error: fetchError } = await query;

        if (fetchError) throw fetchError;

        // Fetch author names for each comment
        const authorIds = [...new Set((data || []).map(c => c.author_id))];
        const authorMap: Record<string, { name: string; email: string }> = {};

        if (authorIds.length > 0) {
          // Try user table first (for brokers)
          const { data: userData } = await supabase
            .from('user')
            .select('auth_user_id, first_name, last_name, email')
            .in('auth_user_id', authorIds);

          (userData || []).forEach(u => {
            authorMap[u.auth_user_id] = {
              name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email,
              email: u.email,
            };
          });

          // Check contact table for any remaining authors (portal users)
          const remainingIds = authorIds.filter(id => !authorMap[id]);
          if (remainingIds.length > 0) {
            // Get emails from auth.users via contact email match
            const { data: authUsers } = await supabase.auth.admin?.listUsers?.() || { data: null };
            // Fallback - just show author_id
            remainingIds.forEach(id => {
              if (!authorMap[id]) {
                authorMap[id] = { name: 'Portal User', email: '' };
              }
            });
          }
        }

        // Attach author info to comments
        const commentsWithAuthors = (data || []).map(c => ({
          ...c,
          author_name: authorMap[c.author_id]?.name || 'Unknown',
          author_email: authorMap[c.author_id]?.email || '',
        }));

        setComments(commentsWithAuthors);
      } catch (err) {
        console.error('Error fetching comments:', err);
        setError('Failed to load comments');
      } finally {
        setLoading(false);
      }
    }

    fetchComments();

    // Set up realtime subscription for new comments
    const subscription = supabase
      .channel(`comments-${siteSubmitId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'site_submit_comment',
          filter: `site_submit_id=eq.${siteSubmitId}`,
        },
        () => {
          // Refetch on any change
          fetchComments();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [siteSubmitId, showInternalComments]);

  // Scroll to bottom when new comments arrive
  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !user) return;

    setSubmitting(true);
    try {
      const { error: insertError } = await supabase
        .from('site_submit_comment')
        .insert({
          site_submit_id: siteSubmitId,
          author_id: user.id,
          content: newComment.trim(),
          visibility: commentVisibility,
        });

      if (insertError) throw insertError;

      setNewComment('');
      // Comments will be refreshed via realtime subscription
    } catch (err) {
      console.error('Error posting comment:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (commentId: string) => {
    if (!editContent.trim()) return;

    try {
      const { error: updateError } = await supabase
        .from('site_submit_comment')
        .update({
          content: editContent.trim(),
          is_edited: true,
          updated_at: new Date().toISOString(),
          updated_by_id: user?.id,
        })
        .eq('id', commentId);

      if (updateError) throw updateError;

      setEditingId(null);
      setEditContent('');
      // Comments will be refreshed via realtime subscription
    } catch (err) {
      console.error('Error updating comment:', err);
    }
  };

  const startEditing = (comment: Comment) => {
    setEditingId(comment.id);
    setEditContent(comment.content);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditContent('');
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getUserInitials = (name: string) => {
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="text-center p-4 bg-red-50 rounded-lg">
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Comments List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {comments.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <svg className="mx-auto h-12 w-12 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p>No comments yet</p>
            <p className="text-sm mt-1">Start the conversation!</p>
          </div>
        ) : (
          comments.map((comment) => {
            const isOwn = comment.author_id === user?.id;
            const isInternal = comment.visibility === 'internal';

            return (
              <div
                key={comment.id}
                className={`rounded-lg p-3 ${
                  isInternal
                    ? 'bg-amber-50 border border-amber-200'
                    : 'bg-gray-50 border border-gray-200'
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium"
                      style={{ backgroundColor: isInternal ? '#d97706' : '#3b82f6' }}
                    >
                      {getUserInitials(comment.author_name || 'U')}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium text-gray-900">
                          {comment.author_name}
                        </span>
                        {isInternal && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-200 text-amber-800">
                            Internal
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">
                        {formatTimestamp(comment.created_at)}
                        {comment.is_edited && ' (edited)'}
                      </span>
                    </div>
                  </div>
                  {isOwn && editingId !== comment.id && (
                    <button
                      onClick={() => startEditing(comment)}
                      className="text-xs text-gray-500 hover:text-blue-600"
                    >
                      Edit
                    </button>
                  )}
                </div>

                {/* Content */}
                {editingId === comment.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      rows={3}
                    />
                    <div className="flex justify-end space-x-2">
                      <button
                        onClick={cancelEditing}
                        className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleEdit(comment.id)}
                        className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {comment.content}
                  </p>
                )}
              </div>
            );
          })
        )}
        <div ref={commentsEndRef} />
      </div>

      {/* New Comment Form */}
      <div className="flex-shrink-0 border-t border-gray-200 p-4 bg-white">
        <form onSubmit={handleSubmit}>
          {/* Visibility Toggle (for brokers only) */}
          {showInternalComments && (
            <div className="flex items-center space-x-4 mb-3">
              <span className="text-xs text-gray-500">Visibility:</span>
              <label className="flex items-center space-x-1 cursor-pointer">
                <input
                  type="radio"
                  name="visibility"
                  value="client"
                  checked={commentVisibility === 'client'}
                  onChange={() => setCommentVisibility('client')}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Client-visible</span>
              </label>
              <label className="flex items-center space-x-1 cursor-pointer">
                <input
                  type="radio"
                  name="visibility"
                  value="internal"
                  checked={commentVisibility === 'internal'}
                  onChange={() => setCommentVisibility('internal')}
                  className="text-amber-600 focus:ring-amber-500"
                />
                <span className="text-sm text-amber-700">Internal only</span>
              </label>
            </div>
          )}

          <div className="flex space-x-2">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              rows={2}
            />
            <button
              type="submit"
              disabled={!newComment.trim() || submitting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors self-end"
            >
              {submitting ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
