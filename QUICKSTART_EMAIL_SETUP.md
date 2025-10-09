# Email System Quick Start Guide

Quick setup guide for the Site Submit email notification system.

## ⚡ 5-Minute Setup

### 1. Get Resend API Key (2 min)

1. Go to [resend.com/signup](https://resend.com/signup)
2. Create free account
3. Click "API Keys" → "Create API Key"
4. Copy the key (starts with `re_`)

### 2. Deploy Edge Function (1 min)

```bash
# Install Supabase CLI (if needed)
npm install -g supabase

# Login and link project
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# Deploy function
supabase functions deploy send-site-submit-email
```

### 3. Configure Environment (1 min)

In Supabase Dashboard → Edge Functions → send-site-submit-email → Settings:

```
RESEND_API_KEY=re_your_key_here
RESEND_FROM_EMAIL=notifications@yourdomain.com
```

### 4. Mark Contacts as Site Selectors (1 min)

```sql
UPDATE contact
SET is_site_selector = true
WHERE email = 'recipient@example.com';
```

### 5. Test It! (30 sec)

1. Open any Site Submit page
2. Click "Submit Site" button
3. Email Composer opens - review and edit as needed
4. Click "Send"
5. Check recipient inbox ✅

---

## 📋 What You Get

✅ Salesforce-style email composer with preview
✅ Rich text editor for customizing email content
✅ Edit recipients, subject, and body before sending
✅ Pre-populated templates with Site Submit details
✅ Toggle between Edit and Preview modes
✅ 3,000 free emails/month with Resend

---

## 🔧 Configuration Checklist

- [ ] Resend account created
- [ ] API key copied
- [ ] Edge function deployed
- [ ] Environment variables set in Supabase
- [ ] At least one contact marked as `is_site_selector = true`
- [ ] Contact has valid email address
- [ ] Test email sent successfully

---

## 📝 For Production

**Set up custom domain in Resend:**

1. Resend Dashboard → Domains → Add Domain
2. Enter your domain (e.g., `yourdomain.com`)
3. Add DNS records to your domain registrar:
   - SPF record
   - DKIM record
   - DMARC record (optional)
4. Wait for verification (~15 min)
5. Update `RESEND_FROM_EMAIL` to `notifications@yourdomain.com`

**Why?** Better deliverability, professional sender address, no sandbox limitations.

---

## ❓ Troubleshooting

| Issue | Solution |
|-------|----------|
| "No Site Selectors found" | Mark contacts: `UPDATE contact SET is_site_selector = true WHERE ...` |
| "Failed to send email" | Check API key in Supabase Edge Functions settings |
| Email not received | Check spam folder, verify email address |
| Function error | Check Supabase Edge Function logs |

---

## 📚 Full Documentation

See [docs/EMAIL_SYSTEM_SETUP.md](docs/EMAIL_SYSTEM_SETUP.md) for:
- Architecture details
- Customization guide
- Alternative email providers
- Advanced configuration
- Cost breakdown

---

## 🚀 Next Steps

Once basic setup works:

1. **Customize email template** - Edit HTML in Edge Function
2. **Add more recipient types** - Add fields like `is_property_manager`
3. **Schedule emails** - Add delayed sending
4. **Track delivery** - Add Resend webhooks for open/click tracking

---

**Need help?** Check the full documentation or Supabase Edge Function logs for detailed error messages.
