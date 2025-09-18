# Salesforce Notes Full Content Solution

## 🎯 **Problem Statement**

Salesforce notes imported via Airbyte are truncated at 255 characters because:
- Airbyte syncs `ContentNote.TextPreview` field (255-char limit)
- Full content exists in `ContentVersion.VersionData` but as API endpoint paths
- **782 out of 1,146 notes** have content longer than 255 characters

## 🔍 **Root Cause Analysis**

### **Salesforce ContentNote System Structure**
```
ContentNote (the note record)
├── TextPreview (255 char limit) ❌
├── Content (API URL, not content) ❌
└── LatestPublishedVersionId → ContentVersion
                                 └── VersionData (API path to full content) ✅
```

### **Why Airbyte Approach Failed**
- `ContentVersion.VersionData` field contains API paths like:
  ```
  /services/data/v62.0/sobjects/ContentVersion/068460000007bU4AAI/VersionData
  ```
- Not actual base64 content that can be decoded directly
- Requires authenticated REST API calls to fetch actual content

## 🛠️ **Solution: REST API Content Fetcher**

### **Architecture**
```
Database → Get VersionData paths → Salesforce REST API → Base64 decode → Update notes
```

### **Files Created**

#### 1. **`fetch-salesforce-notes.js`** - Core API client
- Handles Salesforce OAuth authentication
- Fetches content from VersionData API endpoints
- Includes error handling and rate limiting

#### 2. **`update-notes-with-full-content.js`** - Database integration
- Queries database for truncated notes
- Processes VersionData paths through API
- Updates `note` table with full content
- Includes dry-run mode for testing

## 📋 **Implementation Steps**

### **Step 1: Configure Salesforce Authentication**

**Option A: Direct Access Token**
```bash
export SF_INSTANCE_URL="https://your-org.salesforce.com"
export SF_ACCESS_TOKEN="your_session_token"
```

**Option B: Connected App OAuth (Recommended)**
```bash
export SF_INSTANCE_URL="https://your-org.salesforce.com"
export SF_CLIENT_ID="your_connected_app_client_id"
export SF_CLIENT_SECRET="your_connected_app_secret"
export SF_USERNAME="your_salesforce_username"
export SF_PASSWORD="your_salesforce_password"
export SF_SECURITY_TOKEN="your_security_token"
```

### **Step 2: Configure Database Access**
```bash
export SUPABASE_URL="your_supabase_project_url"
export SUPABASE_ANON_KEY="your_supabase_anon_key"
```

### **Step 3: Test with Dry Run**
```bash
node update-notes-with-full-content.js --dry-run
```

### **Step 4: Execute Full Update**
```bash
node update-notes-with-full-content.js
```

## 🔬 **Verification Queries**

### **Check VersionData paths in database:**
```sql
SELECT "Id", "VersionData", "ContentSize", "Title"
FROM salesforce_ContentVersion
WHERE "VersionData" IS NOT NULL
AND "ContentSize" > 255
LIMIT 5;
```

### **Test Workbench query to verify content access:**
```sql
SELECT Id, Title, LatestPublishedVersionId
FROM ContentNote
WHERE LatestPublishedVersionId IN (
    SELECT Id FROM ContentVersion WHERE ContentSize > 255
)
LIMIT 5
```

### **Verify note updates:**
```sql
SELECT id, LENGTH(body) as content_length,
       LEFT(body, 100) as content_preview,
       updated_at
FROM note
WHERE LENGTH(body) > 255
ORDER BY updated_at DESC
LIMIT 10;
```

## 🔐 **Authentication Options**

### **Method 1: Workbench Session Token**
1. Login to https://workbench.developerforce.com/
2. Go to **utilities → REST Explorer**
3. Copy session ID from browser cookies or use Developer Tools
4. Use as `SF_ACCESS_TOKEN`

### **Method 2: Connected App (Production)**
1. **Setup → App Manager → New Connected App**
2. Enable OAuth settings
3. Add scopes: `api`, `refresh_token`
4. Note Client ID/Secret for environment variables

### **Method 3: Dev Console Session (Quick Test)**
1. Open Salesforce → Developer Console
2. Execute Anonymous: `System.debug(UserInfo.getSessionId());`
3. Copy session ID from debug logs

## 📊 **Expected Results**

- **Before**: 782 notes truncated at 255 characters
- **After**: All notes with full HTML/rich text content
- **Content Format**: HTML that gets converted to markdown by `RichTextNote.tsx`

## 🚨 **Important Notes**

### **Rate Limiting**
- Script includes 100ms delays between API calls
- Salesforce has daily API limits - monitor usage
- Consider processing in batches for large datasets

### **Content Format**
- Salesforce stores notes as HTML
- Your `RichTextNote.tsx` component handles HTML→markdown conversion
- Existing formatting (`<p>`, `<br>`, `<strong>`, etc.) will be preserved

### **Database Schema**
- `note.body` field is `TEXT` type (unlimited length) ✅
- No schema changes needed
- Updates preserve all existing relationships

## 🔄 **Execution Workflow**

1. **Setup Environment Variables** (auth + database)
2. **Dry Run**: `node update-notes-with-full-content.js --dry-run`
3. **Review**: Check what will be processed
4. **Execute**: `node update-notes-with-full-content.js`
5. **Verify**: Run SQL queries to confirm updates
6. **Test UI**: Check notes display properly in `ClientNotesSidebar`

## 📁 **File Locations**

- **`fetch-salesforce-notes.js`** - Salesforce API client
- **`update-notes-with-full-content.js`** - Database integration script
- **`src/components/RichTextNote.tsx`** - UI component (already working)
- **`src/components/ClientNotesSidebar.tsx`** - Notes display (already working)

## 🏁 **Next Steps**

1. Configure authentication environment variables
2. Run dry-run to verify setup
3. Execute full content update
4. Verify results in both database and UI
5. **Optional**: Set up periodic sync for new notes

## 🎉 **Final State**

After completion:
- ✅ All 1,146 notes migrated with proper relationships
- ✅ 782 notes updated with full content (no 255-char truncation)
- ✅ Rich text formatting preserved
- ✅ UI components display complete notes
- ✅ System ready for production use

---

*This solution bypasses the Airbyte limitation by using direct Salesforce REST API calls to fetch full note content that was inaccessible through standard field syncing.*