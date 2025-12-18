import { supabase } from '../../db/client';
import { config } from '../../config';
import { createLogger } from '../../utils/logger';
import { DashboardLead, OutreachQueueItem, RunError } from '../../types';

const logger = createLogger('briefing');

export interface BriefingResult {
  sent: boolean;
  emailId: string | null;
  errors: RunError[];
}

export interface RunMetrics {
  sources_scraped: number;
  signals_collected: number;
  leads_created: number;
  leads_updated: number;
  contacts_enriched: number;
  outreach_drafted: number;
}

export class BriefingSender {
  /**
   * Send the daily briefing email via Gmail (using edge function)
   */
  async send(runId: string, metrics: RunMetrics): Promise<BriefingResult> {
    const result: BriefingResult = {
      sent: false,
      emailId: null,
      errors: [],
    };

    try {
      // Skip if no briefing email configured
      const toEmail = config.briefing.toEmail;
      if (!toEmail) {
        logger.warn('BRIEFING_TO_EMAIL not configured, skipping briefing email');
        return result;
      }

      // Gather data for briefing
      const hotLeads = await this.getHotLeads();
      const pendingOutreach = await this.getPendingOutreach();
      const reconnectOpportunities = await this.getReconnectOpportunities();

      // Generate email content
      const html = this.generateBriefingHtml(metrics, hotLeads, pendingOutreach, reconnectOpportunities);
      const subject = this.generateSubject(metrics, hotLeads.length);
      const plainText = this.generatePlainText(metrics, hotLeads, pendingOutreach);

      // Send via the hunter-send-briefing edge function (uses Gmail)
      const { data, error } = await supabase.functions.invoke('hunter-send-briefing', {
        body: {
          to: toEmail,
          subject,
          body_html: html,
          body_text: plainText,
        },
      });

      if (error) {
        throw new Error(`Edge function error: ${error.message}`);
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to send briefing');
      }

      result.sent = true;
      result.emailId = data.message_id || null;

      // Update run log with briefing info
      await supabase
        .from('hunter_run_log')
        .update({
          briefing_sent_at: new Date().toISOString(),
          briefing_email_id: result.emailId,
        })
        .eq('id', runId);

      logger.info(`Briefing email sent via Gmail: ${result.emailId}`);

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to send briefing: ${message}`);

      result.errors.push({
        module: 'briefing',
        message,
        timestamp: new Date().toISOString(),
      });
    }

    return result;
  }

  /**
   * Generate plain text version of the briefing
   */
  private generatePlainText(
    metrics: RunMetrics,
    hotLeads: DashboardLead[],
    pendingOutreach: OutreachQueueItem[]
  ): string {
    let text = `HUNTER DAILY BRIEFING\n\n`;
    text += `Signals: ${metrics.signals_collected} | New Leads: ${metrics.leads_created} | Drafts Ready: ${metrics.outreach_drafted}\n\n`;

    if (hotLeads.length > 0) {
      text += `HOT LEADS:\n`;
      hotLeads.forEach(lead => {
        text += `- ${lead.concept_name} (${lead.signal_strength})\n`;
      });
      text += `\n`;
    }

    if (pendingOutreach.length > 0) {
      text += `PENDING OUTREACH: ${pendingOutreach.length} draft(s) ready for review\n\n`;
    }

    text += `View dashboard: ${config.app.ovisUrl}/hunter`;
    return text;
  }

  /**
   * Get HOT and WARM+ leads from last 24 hours
   */
  private async getHotLeads(): Promise<DashboardLead[]> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const { data } = await supabase
      .from('v_hunter_dashboard')
      .select('*')
      .in('signal_strength', ['HOT', 'WARM+'])
      .gte('last_signal_at', yesterday.toISOString())
      .order('signal_strength', { ascending: true })
      .order('last_signal_at', { ascending: false })
      .limit(20);

    return (data as DashboardLead[]) || [];
  }

  /**
   * Get pending outreach drafts
   */
  private async getPendingOutreach(): Promise<OutreachQueueItem[]> {
    const { data } = await supabase
      .from('v_hunter_outreach_queue')
      .select('*')
      .eq('status', 'draft')
      .order('created_at', { ascending: false })
      .limit(10);

    return (data as OutreachQueueItem[]) || [];
  }

  /**
   * Get reconnect opportunities (existing contacts with new signals)
   */
  private async getReconnectOpportunities(): Promise<any[]> {
    const { data } = await supabase
      .from('v_hunter_reconnect')
      .select('*')
      .limit(10);

    return data || [];
  }

  /**
   * Generate email subject based on findings
   */
  private generateSubject(metrics: RunMetrics, hotLeadCount: number): string {
    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });

    if (hotLeadCount > 0) {
      return `🎯 Hunter Daily: ${hotLeadCount} HOT Lead${hotLeadCount > 1 ? 's' : ''} - ${today}`;
    } else if (metrics.leads_created > 0) {
      return `📊 Hunter Daily: ${metrics.leads_created} New Lead${metrics.leads_created > 1 ? 's' : ''} - ${today}`;
    } else {
      return `📊 Hunter Daily Briefing - ${today}`;
    }
  }

  /**
   * Generate briefing email HTML
   */
  private generateBriefingHtml(
    metrics: RunMetrics,
    hotLeads: DashboardLead[],
    pendingOutreach: OutreachQueueItem[],
    reconnectOpportunities: any[]
  ): string {
    const ovisUrl = config.app.ovisUrl;

    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    h1 { color: #1e40af; font-size: 24px; border-bottom: 2px solid #1e40af; padding-bottom: 10px; }
    h2 { color: #374151; font-size: 18px; margin-top: 30px; }
    .metric-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 20px 0; }
    .metric { background: #f3f4f6; padding: 15px; border-radius: 8px; text-align: center; }
    .metric-value { font-size: 28px; font-weight: bold; color: #1e40af; }
    .metric-label { font-size: 12px; color: #6b7280; text-transform: uppercase; }
    .lead-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; margin: 10px 0; }
    .lead-card.hot { border-left: 4px solid #ef4444; }
    .lead-card.warm-plus { border-left: 4px solid #f97316; }
    .lead-name { font-weight: bold; font-size: 16px; }
    .lead-signal { color: #6b7280; font-size: 14px; margin-top: 5px; }
    .lead-geography { color: #059669; font-size: 13px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; }
    .badge.hot { background: #fef2f2; color: #dc2626; }
    .badge.warm-plus { background: #fff7ed; color: #ea580c; }
    .btn { display: inline-block; background: #1e40af; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
    .outreach-item { padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <h1>🎯 Hunter Daily Briefing</h1>

  <div class="metric-grid">
    <div class="metric">
      <div class="metric-value">${metrics.signals_collected}</div>
      <div class="metric-label">Signals</div>
    </div>
    <div class="metric">
      <div class="metric-value">${metrics.leads_created}</div>
      <div class="metric-label">New Leads</div>
    </div>
    <div class="metric">
      <div class="metric-value">${metrics.outreach_drafted}</div>
      <div class="metric-label">Drafts Ready</div>
    </div>
  </div>

  ${hotLeads.length > 0 ? `
  <h2>🔥 Hot Leads</h2>
  ${hotLeads.map(lead => `
    <div class="lead-card ${lead.signal_strength === 'HOT' ? 'hot' : 'warm-plus'}">
      <div class="lead-name">
        ${lead.concept_name}
        <span class="badge ${lead.signal_strength === 'HOT' ? 'hot' : 'warm-plus'}">${lead.signal_strength}</span>
      </div>
      <div class="lead-signal">${lead.latest_signal_summary || 'Expansion signal detected'}</div>
      ${lead.target_geography && lead.target_geography.length > 0 ? `
        <div class="lead-geography">📍 ${lead.target_geography.join(', ')}</div>
      ` : ''}
      ${lead.key_person_name ? `
        <div style="color: #6b7280; font-size: 13px; margin-top: 5px;">
          👤 ${lead.key_person_name}${lead.key_person_title ? ` (${lead.key_person_title})` : ''}
        </div>
      ` : ''}
    </div>
  `).join('')}
  ` : ''}

  ${pendingOutreach.length > 0 ? `
  <h2>📝 Outreach Ready for Review</h2>
  <p>You have ${pendingOutreach.length} draft${pendingOutreach.length > 1 ? 's' : ''} waiting for approval:</p>
  ${pendingOutreach.slice(0, 5).map(item => `
    <div class="outreach-item">
      <strong>${item.concept_name}</strong> - ${item.contact_name}<br>
      <span style="color: #6b7280;">${item.outreach_type === 'email' ? '📧' : '📞'} ${item.outreach_type}</span>
    </div>
  `).join('')}
  ` : ''}

  ${reconnectOpportunities.length > 0 ? `
  <h2>🔄 Reconnect Opportunities</h2>
  <p>Existing contacts with new activity:</p>
  ${reconnectOpportunities.slice(0, 5).map(item => `
    <div class="outreach-item">
      <strong>${item.concept_name}</strong><br>
      <span style="color: #6b7280;">👤 ${item.contact_name} - ${item.latest_news || 'New activity'}</span>
    </div>
  `).join('')}
  ` : ''}

  <a href="${ovisUrl}/hunter" class="btn">Open Hunter Dashboard</a>

  <div class="footer">
    <p>This briefing was automatically generated by Hunter Agent.</p>
    <p>Sources scraped: ${metrics.sources_scraped} | Contacts enriched: ${metrics.contacts_enriched}</p>
  </div>
</body>
</html>
    `.trim();
  }
}

export default BriefingSender;
