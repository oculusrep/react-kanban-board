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
  parent_comment_id: string | null;
  replies?: Comment[];
  reply_count?: number;
  activity_type?: string | null; // null = regular message, otherwise activity type like 'field_update', 'file_added', 'status_change'
}

interface PortalChatTabProps {
  siteSubmitId: string;
  showInternalComments: boolean;
}

export default function PortalChatTab({ siteSubmitId, showInternalComments }: PortalChatTabProps) {
  const { user, userRole } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');
  const [commentVisibility, setCommentVisibility] = useState<'internal' | 'client'>('client');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const [currentUserName, setCurrentUserName] = useState<string>('You');
  const commentsEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const replyInputRef = useRef<HTMLTextAreaElement>(null);

  const isAdmin = userRole === 'admin';

  // Fetch current user's display name
  useEffect(() => {
    async function fetchCurrentUserName() {
      if (!user?.id || !user?.email) return;

      // Try user table first (internal users)
      const { data: userData } = await supabase
        .from('user')
        .select('first_name, last_name, email')
        .eq('auth_user_id', user.id)
        .single();

      if (userData) {
        const name = `${userData.first_name || ''} ${userData.last_name || ''}`.trim();
        setCurrentUserName(name || userData.email || 'You');
        return;
      }

      // Try contact table (portal users)
      const { data: contactData } = await supabase
        .from('contact')
        .select('first_name, last_name, email')
        .eq('portal_auth_user_id', user.id)
        .single();

      if (contactData) {
        const name = `${contactData.first_name || ''} ${contactData.last_name || ''}`.trim();
        setCurrentUserName(name || contactData.email || 'You');
      }
    }

    fetchCurrentUserName();
  }, [user?.id, user?.email]);

  // Fetch comments and organize into threads
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

        if (!showInternalComments) {
          query = query.eq('visibility', 'client');
        }

        const { data, error: fetchError } = await query;

        if (fetchError) throw fetchError;

        // Fetch author names
        const authorIds = [...new Set((data || []).map(c => c.author_id))];
        const authorMap: Record<string, { name: string; email: string }> = {};

        if (authorIds.length > 0) {
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

          const remainingIds = authorIds.filter(id => !authorMap[id]);
          if (remainingIds.length > 0) {
            const { data: contactData } = await supabase
              .from('contact')
              .select('portal_auth_user_id, first_name, last_name, email')
              .in('portal_auth_user_id', remainingIds);

            (contactData || []).forEach(c => {
              if (c.portal_auth_user_id) {
                authorMap[c.portal_auth_user_id] = {
                  name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email || 'Portal User',
                  email: c.email || '',
                };
              }
            });

            remainingIds.forEach(id => {
              if (!authorMap[id]) {
                authorMap[id] = { name: 'Portal User', email: '' };
              }
            });
          }
        }

        // Attach author info and organize into threads
        const allComments = (data || []).map(c => ({
          ...c,
          author_name: authorMap[c.author_id]?.name || 'Unknown',
          author_email: authorMap[c.author_id]?.email || '',
        }));

        // Separate parent comments and replies
        const parentComments: Comment[] = [];
        const repliesMap: Record<string, Comment[]> = {};

        allComments.forEach(comment => {
          if (comment.parent_comment_id) {
            if (!repliesMap[comment.parent_comment_id]) {
              repliesMap[comment.parent_comment_id] = [];
            }
            repliesMap[comment.parent_comment_id].push(comment);
          } else {
            parentComments.push(comment);
          }
        });

        // Attach replies to parent comments
        const commentsWithReplies = parentComments.map(parent => ({
          ...parent,
          replies: repliesMap[parent.id] || [],
          reply_count: (repliesMap[parent.id] || []).length,
        }));

        setComments(commentsWithReplies);

        // Auto-expand all threads that have replies
        const threadsWithReplies = commentsWithReplies
          .filter(c => (c.reply_count || 0) > 0)
          .map(c => c.id);
        setExpandedThreads(new Set(threadsWithReplies));
      } catch (err) {
        console.error('Error fetching comments:', err);
        setError('Failed to load comments');
      } finally {
        setLoading(false);
      }
    }

    fetchComments();

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
          fetchComments();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [siteSubmitId, showInternalComments]);

  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments]);

  // Focus reply input when opening reply
  useEffect(() => {
    if (replyingToId && replyInputRef.current) {
      replyInputRef.current.focus();
    }
  }, [replyingToId]);

  const handleSubmit = async (e: React.FormEvent, parentId: string | null = null) => {
    e.preventDefault();
    const content = parentId ? replyContent : newComment;
    if (!content.trim() || !user) return;

    setSubmitting(true);
    try {
      const insertPayload = {
        site_submit_id: siteSubmitId,
        author_id: user.id,
        content: content.trim(),
        visibility: commentVisibility,
        parent_comment_id: parentId,
      };

      const { data: insertData, error: insertError } = await supabase
        .from('site_submit_comment')
        .insert(insertPayload)
        .select();

      if (insertError) throw insertError;

      if (insertData && insertData[0]) {
        const newCommentData: Comment = {
          ...insertData[0],
          author_name: currentUserName,
          author_email: user.email || '',
          replies: [],
          reply_count: 0,
        };

        if (parentId) {
          // Add reply to existing thread
          setComments(prev =>
            prev.map(c =>
              c.id === parentId
                ? {
                    ...c,
                    replies: [...(c.replies || []), newCommentData],
                    reply_count: (c.reply_count || 0) + 1,
                  }
                : c
            )
          );
          // Auto-expand thread when replying
          setExpandedThreads(prev => new Set(prev).add(parentId));
          setReplyContent('');
          setReplyingToId(null);
        } else {
          setComments(prev => [...prev, newCommentData]);
          setNewComment('');
        }
      }
    } catch (err) {
      console.error('Error posting comment:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (commentId: string, isReply: boolean = false, parentId?: string) => {
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

      if (isReply && parentId) {
        setComments(prev =>
          prev.map(c =>
            c.id === parentId
              ? {
                  ...c,
                  replies: (c.replies || []).map(r =>
                    r.id === commentId
                      ? { ...r, content: editContent.trim(), is_edited: true }
                      : r
                  ),
                }
              : c
          )
        );
      } else {
        setComments(prev =>
          prev.map(c =>
            c.id === commentId
              ? { ...c, content: editContent.trim(), is_edited: true }
              : c
          )
        );
      }

      setEditingId(null);
      setEditContent('');
    } catch (err) {
      console.error('Error updating comment:', err);
    }
  };

  const handleDelete = async (commentId: string, isReply: boolean = false, parentId?: string) => {
    try {
      const { error: deleteError } = await supabase
        .from('site_submit_comment')
        .delete()
        .eq('id', commentId);

      if (deleteError) throw deleteError;

      if (isReply && parentId) {
        setComments(prev =>
          prev.map(c =>
            c.id === parentId
              ? {
                  ...c,
                  replies: (c.replies || []).filter(r => r.id !== commentId),
                  reply_count: Math.max(0, (c.reply_count || 1) - 1),
                }
              : c
          )
        );
      } else {
        setComments(prev => prev.filter(c => c.id !== commentId));
      }
      setDeletingId(null);
    } catch (err) {
      console.error('Error deleting comment:', err);
    }
  };

  const startEditing = (comment: Comment) => {
    setEditingId(comment.id);
    setEditContent(comment.content);
    setDeletingId(null);
    setReplyingToId(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditContent('');
  };

  const startReplying = (commentId: string) => {
    setReplyingToId(commentId);
    setReplyContent('');
    setEditingId(null);
    setDeletingId(null);
    // Auto-expand thread when starting to reply
    setExpandedThreads(prev => new Set(prev).add(commentId));
  };

  const cancelReplying = () => {
    setReplyingToId(null);
    setReplyContent('');
  };

  const toggleThread = (commentId: string) => {
    setExpandedThreads(prev => {
      const next = new Set(prev);
      if (next.has(commentId)) {
        next.delete(commentId);
      } else {
        next.add(commentId);
      }
      return next;
    });
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getUserInitials = (name: string) => {
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  // Generate a consistent color for a user based on their name/id
  const getUserColor = (identifier: string) => {
    const colors = [
      '#3b82f6', // blue
      '#10b981', // green
      '#8b5cf6', // purple
      '#f59e0b', // amber
      '#ef4444', // red
      '#06b6d4', // cyan
      '#ec4899', // pink
      '#6366f1', // indigo
      '#14b8a6', // teal
      '#f97316', // orange
    ];

    // Simple hash function to get consistent color
    let hash = 0;
    for (let i = 0; i < identifier.length; i++) {
      hash = identifier.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, parentId: string | null = null) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent, parentId);
    }
    if (e.key === 'Escape' && parentId) {
      cancelReplying();
    }
  };

  // Render a single comment (used for both parent and replies)
  const renderComment = (
    comment: Comment,
    isReply: boolean = false,
    parentId?: string
  ) => {
    // Render activity entries differently
    if (comment.activity_type) {
      return (
        <div
          key={comment.id}
          className="px-4 py-1.5 flex items-center gap-2"
        >
          <div className="flex-1 flex items-center gap-2">
            <div className="h-px flex-1 bg-gray-200" />
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {comment.activity_type === 'file_added' ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                ) : comment.activity_type === 'status_change' ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                )}
              </svg>
              <span>
                <span className="font-medium text-gray-700">{comment.author_name}</span>
                {' '}{comment.content}
              </span>
              <span className="text-gray-400">·</span>
              <span className="text-gray-400">{formatTimestamp(comment.created_at)}</span>
            </div>
            <div className="h-px flex-1 bg-gray-200" />
          </div>
        </div>
      );
    }

    const isOwn = comment.author_id === user?.id;
    const isInternal = comment.visibility === 'internal';
    const canEdit = isOwn;
    const canDelete = isOwn || isAdmin;
    const isHovered = hoveredId === comment.id;
    const isDeleting = deletingId === comment.id;
    const isEditing = editingId === comment.id;

    return (
      <div
        key={comment.id}
        className={`relative px-4 py-2 transition-colors ${
          isHovered ? 'bg-gray-50' : ''
        } ${isInternal ? 'bg-amber-50/50' : ''} ${isReply ? 'ml-12 border-l-2 border-gray-200' : ''}`}
        onMouseEnter={() => setHoveredId(comment.id)}
        onMouseLeave={() => {
          setHoveredId(null);
          if (deletingId !== comment.id) setDeletingId(null);
        }}
      >
        {/* Action buttons */}
        {isHovered && !isEditing && !isDeleting && (
          <div className="absolute right-2 top-1 flex items-center bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden z-10">
            {!isReply && (
              <button
                onClick={() => startReplying(comment.id)}
                className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 hover:text-blue-600"
                title="Reply"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
              </button>
            )}
            {canEdit && (
              <button
                onClick={() => startEditing(comment)}
                className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 hover:text-blue-600"
                title="Edit"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => setDeletingId(comment.id)}
                className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 hover:text-red-600"
                title="Delete"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Delete confirmation */}
        {isDeleting && (
          <div className="absolute right-2 top-1 flex items-center bg-white border border-red-200 rounded-lg shadow-sm overflow-hidden z-10">
            <span className="px-2 py-1 text-xs text-red-600">Delete?</span>
            <button
              onClick={() => handleDelete(comment.id, isReply, parentId)}
              className="px-2 py-1 text-xs text-white bg-red-500 hover:bg-red-600"
            >
              Yes
            </button>
            <button
              onClick={() => setDeletingId(null)}
              className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
            >
              No
            </button>
          </div>
        )}

        <div className="flex gap-2">
          {/* Avatar */}
          <div
            className={`flex-shrink-0 ${isReply ? 'w-5 h-5' : 'w-6 h-6'} rounded flex items-center justify-center text-white ${isReply ? 'text-[9px]' : 'text-[10px]'} font-semibold`}
            style={{ backgroundColor: isInternal ? '#d97706' : getUserColor(comment.author_id) }}
          >
            {getUserInitials(comment.author_name || 'U')}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className={`font-semibold text-gray-900 ${isReply ? 'text-[11px]' : 'text-xs'}`}>
                {comment.author_name}
              </span>
              {isInternal && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-200 text-amber-800 font-medium">
                  Internal
                </span>
              )}
              <span className="text-xs text-gray-400">
                {formatTimestamp(comment.created_at)}
                {comment.is_edited && <span className="ml-1">(edited)</span>}
              </span>
            </div>

            {/* Edit mode */}
            {isEditing ? (
              <div className="mt-1">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-blue-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  rows={2}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleEdit(comment.id, isReply, parentId);
                    }
                    if (e.key === 'Escape') {
                      cancelEditing();
                    }
                  }}
                />
                <div className="flex gap-2 mt-1">
                  <button
                    onClick={() => handleEdit(comment.id, isReply, parentId)}
                    className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Save
                  </button>
                  <button
                    onClick={cancelEditing}
                    className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className={`text-gray-800 whitespace-pre-wrap break-words ${isReply ? 'text-[11px]' : 'text-xs'}`}>
                {comment.content}
              </p>
            )}
          </div>
        </div>
      </div>
    );
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
    <div className="flex flex-col h-full min-h-0 bg-white">
      {/* Comments List */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8">
            <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-lg font-medium">No messages yet</p>
            <p className="text-sm">Start the conversation below</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {comments.map((comment) => {
              const hasReplies = (comment.reply_count || 0) > 0;
              const isExpanded = expandedThreads.has(comment.id);
              const isReplying = replyingToId === comment.id;

              return (
                <div key={comment.id}>
                  {/* Parent comment */}
                  {renderComment(comment)}

                  {/* Thread indicator and replies */}
                  {hasReplies && (
                    <div className="ml-12 px-4">
                      <button
                        onClick={() => toggleThread(comment.id)}
                        className="flex items-center gap-2 text-xs text-blue-600 hover:text-blue-800 py-1"
                      >
                        <svg
                          className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <span>
                          {comment.reply_count} {comment.reply_count === 1 ? 'reply' : 'replies'}
                        </span>
                      </button>

                      {/* Expanded replies */}
                      {isExpanded && (
                        <div className="border-l-2 border-blue-200 mt-1">
                          {(comment.replies || []).map((reply) =>
                            renderComment(reply, true, comment.id)
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Reply input */}
                  {isReplying && (
                    <div className="ml-8 px-4 py-2 bg-gray-50 border-l-2 border-blue-300">
                      <div className="flex gap-2">
                        <div
                          className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-white text-[9px] font-semibold"
                          style={{ backgroundColor: getUserColor(user?.id || '') }}
                        >
                          {getUserInitials(currentUserName)}
                        </div>
                        <div className="flex-1">
                          <textarea
                            ref={replyInputRef}
                            value={replyContent}
                            onChange={(e) => setReplyContent(e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, comment.id)}
                            placeholder={`Reply to ${comment.author_name}...`}
                            className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                            rows={2}
                          />
                          <div className="flex gap-2 mt-1">
                            <button
                              onClick={(e) => handleSubmit(e, comment.id)}
                              disabled={!replyContent.trim() || submitting}
                              className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                            >
                              {submitting ? 'Sending...' : 'Reply'}
                            </button>
                            <button
                              onClick={cancelReplying}
                              className="px-3 py-1 text-xs text-gray-600 hover:text-gray-800"
                            >
                              Cancel
                            </button>
                            <span className="text-[10px] text-gray-400 ml-auto self-center">
                              Enter to send, Esc to cancel
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div ref={commentsEndRef} />
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 border-t border-gray-200 p-3 bg-gray-50">
        <form onSubmit={(e) => handleSubmit(e, null)}>
          {showInternalComments && (
            <div className="flex items-center gap-3 mb-2">
              <div className="flex items-center gap-1 text-xs">
                <button
                  type="button"
                  onClick={() => setCommentVisibility('client')}
                  className={`px-2 py-1 rounded-full transition-colors ${
                    commentVisibility === 'client'
                      ? 'bg-blue-100 text-blue-700 font-medium'
                      : 'text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  Client-visible
                </button>
                <button
                  type="button"
                  onClick={() => setCommentVisibility('internal')}
                  className={`px-2 py-1 rounded-full transition-colors ${
                    commentVisibility === 'internal'
                      ? 'bg-amber-100 text-amber-700 font-medium'
                      : 'text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  Internal only
                </button>
              </div>
            </div>
          )}

          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, null)}
                placeholder={`Message${commentVisibility === 'internal' ? ' (internal)' : ''}...`}
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:outline-none resize-none ${
                  commentVisibility === 'internal'
                    ? 'border-amber-300 focus:ring-amber-500 focus:border-amber-500 bg-amber-50'
                    : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                }`}
                rows={1}
                style={{ minHeight: '40px', maxHeight: '120px' }}
              />
            </div>
            <button
              type="submit"
              disabled={!newComment.trim() || submitting}
              className={`px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                commentVisibility === 'internal'
                  ? 'bg-amber-500 hover:bg-amber-600 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {submitting ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </div>
          <p className="text-[10px] text-gray-400 mt-1">
            Press Enter to send, Shift+Enter for new line
          </p>
        </form>
      </div>
    </div>
  );
}
