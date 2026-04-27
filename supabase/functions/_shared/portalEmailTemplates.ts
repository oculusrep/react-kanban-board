/**
 * Portal email templates — shared by send-portal-comment-alert and send-portal-digest.
 */

export interface CommentAlertItem {
  text: string;
  created_at: string;
  author_name?: string | null;
}

export interface CommentAlertTemplateInput {
  clientName: string;
  siteSubmitName: string;
  comments: CommentAlertItem[];
  portalLink: string;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      timeZone: 'America/New_York',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function renderCommentAlertEmail(input: CommentAlertTemplateInput): { subject: string; html: string; text: string } {
  const { clientName, siteSubmitName, comments, portalLink } = input;

  const subject =
    comments.length === 1
      ? `${clientName} commented on ${siteSubmitName}`
      : `${comments.length} new comments from ${clientName} on ${siteSubmitName}`;

  const commentsHtml = comments
    .map(
      (c) => `
    <div style="margin: 0 0 16px; padding: 12px 16px; background: #F8FAFC; border-left: 3px solid #4A6B94; border-radius: 4px;">
      <div style="font-size: 12px; color: #4A6B94; margin-bottom: 6px;">
        ${escapeHtml(c.author_name || clientName)} &middot; ${escapeHtml(formatTime(c.created_at))}
      </div>
      <div style="color: #002147; white-space: pre-wrap;">${escapeHtml(c.text)}</div>
    </div>`
    )
    .join('\n');

  const html = `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #ffffff; margin: 0; padding: 24px; color: #002147;">
  <div style="max-width: 600px; margin: 0 auto;">
    <h2 style="color: #002147; margin: 0 0 16px;">New portal activity from ${escapeHtml(clientName)}</h2>
    <p style="color: #4A6B94; margin: 0 0 20px;">Site submit: <strong>${escapeHtml(siteSubmitName)}</strong></p>
    ${commentsHtml}
    <div style="margin-top: 24px;">
      <a href="${escapeHtml(portalLink)}" style="display: inline-block; padding: 10px 18px; background: #002147; color: #ffffff; text-decoration: none; border-radius: 4px; font-weight: 600;">Open in OVIS</a>
    </div>
    <p style="margin-top: 24px; font-size: 12px; color: #8FA9C8;">
      You're receiving this because you're listed as a broker on this account. Reply directly to ${escapeHtml(clientName)} — your reply will go to them, not to OVIS.
    </p>
  </div>
</body>
</html>`;

  const text = `New portal activity from ${clientName}
Site submit: ${siteSubmitName}

${comments.map((c) => `[${formatTime(c.created_at)}] ${c.author_name || clientName}:\n${c.text}`).join('\n\n')}

Open in OVIS: ${portalLink}`;

  return { subject, html, text };
}

export interface DigestActivityItem {
  type: 'comment' | 'file_shared' | 'status_change';
  created_at: string;
  payload: Record<string, unknown>;
  actor_name?: string | null;
  site_submit_id: string;
  site_submit_name: string;
}

export interface DigestTemplateInput {
  brokerName: string;
  clientName: string;
  scope: 'site_submit' | 'client_all';
  scopeLabel: string;
  customNote: string | null;
  activities: DigestActivityItem[];
  portalLink: string;
}

export function renderDigestEmail(input: DigestTemplateInput): { subject: string; html: string; text: string } {
  const { brokerName, clientName, scope, scopeLabel, customNote, activities, portalLink } = input;

  const subject =
    scope === 'site_submit'
      ? `Update on ${scopeLabel}`
      : `Today's updates on ${clientName} projects`;

  // Group by site submit
  const grouped = new Map<string, { name: string; items: DigestActivityItem[] }>();
  for (const item of activities) {
    const key = item.site_submit_id;
    if (!grouped.has(key)) grouped.set(key, { name: item.site_submit_name, items: [] });
    grouped.get(key)!.items.push(item);
  }

  const renderItem = (item: DigestActivityItem): string => {
    const time = `<span style="color: #8FA9C8; font-size: 12px;">${escapeHtml(formatTime(item.created_at))}</span>`;
    if (item.type === 'comment') {
      const text = String(item.payload.text || '');
      return `<li style="margin-bottom: 8px;">💬 <strong>Comment</strong> ${time}<br><div style="margin-top: 4px; padding: 8px 12px; background: #F8FAFC; border-radius: 4px; white-space: pre-wrap;">${escapeHtml(text)}</div></li>`;
    }
    if (item.type === 'file_shared') {
      const name = String(item.payload.file_name || item.payload.dropbox_path || 'file');
      return `<li style="margin-bottom: 8px;">📎 <strong>File shared:</strong> ${escapeHtml(name)} ${time}</li>`;
    }
    if (item.type === 'status_change') {
      const from = String(item.payload.from_stage_label || '—');
      const to = String(item.payload.to_stage_label || '—');
      return `<li style="margin-bottom: 8px;">🔄 <strong>Stage changed:</strong> ${escapeHtml(from)} → ${escapeHtml(to)} ${time}</li>`;
    }
    return `<li style="margin-bottom: 8px;">${escapeHtml(item.type)} ${time}</li>`;
  };

  const sectionsHtml = Array.from(grouped.entries())
    .map(
      ([, group]) => `
    <div style="margin-bottom: 24px;">
      <h3 style="color: #002147; border-bottom: 1px solid #8FA9C8; padding-bottom: 6px; margin: 0 0 12px;">${escapeHtml(group.name)}</h3>
      <ul style="list-style: none; padding: 0; margin: 0;">
        ${group.items.map(renderItem).join('\n')}
      </ul>
    </div>`
    )
    .join('\n');

  const noteHtml = customNote
    ? `<div style="margin: 0 0 24px; padding: 16px; background: #F8FAFC; border-left: 3px solid #4A6B94; border-radius: 4px; white-space: pre-wrap;">${escapeHtml(customNote)}</div>`
    : '';

  const html = `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #ffffff; margin: 0; padding: 24px; color: #002147;">
  <div style="max-width: 640px; margin: 0 auto;">
    <h2 style="margin: 0 0 6px; color: #002147;">Project update</h2>
    <p style="color: #4A6B94; margin: 0 0 20px;">From ${escapeHtml(brokerName)} at Oculus Real Estate Advisors</p>
    ${noteHtml}
    ${sectionsHtml}
    <div style="margin-top: 24px;">
      <a href="${escapeHtml(portalLink)}" style="display: inline-block; padding: 10px 18px; background: #002147; color: #ffffff; text-decoration: none; border-radius: 4px; font-weight: 600;">View in OVIS Portal</a>
    </div>
  </div>
</body>
</html>`;

  const text = [
    `Project update from ${brokerName}`,
    customNote ? `\n${customNote}\n` : '',
    ...Array.from(grouped.values()).map(
      (g) =>
        `\n${g.name}\n${'-'.repeat(g.name.length)}\n` +
        g.items
          .map((i) => {
            if (i.type === 'comment') return `  • Comment (${formatTime(i.created_at)}): ${i.payload.text || ''}`;
            if (i.type === 'file_shared') return `  • File shared (${formatTime(i.created_at)}): ${i.payload.file_name || ''}`;
            if (i.type === 'status_change')
              return `  • Stage changed (${formatTime(i.created_at)}): ${i.payload.from_stage_label || '—'} → ${i.payload.to_stage_label || '—'}`;
            return `  • ${i.type} (${formatTime(i.created_at)})`;
          })
          .join('\n')
    ),
    `\n\nView in OVIS Portal: ${portalLink}`,
  ].join('');

  return { subject, html, text };
}
