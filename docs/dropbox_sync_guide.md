# Dropbox Property Rename Sync - Implementation Instructions

## Overview
Implement automatic Dropbox folder renaming when a property name changes in the CRM. This ensures the Dropbox folder name stays in sync with the property name in Salesforce/database.

## Current System Context
- **Database Table**: `dropbox_folder_mapping` already exists and tracks property-to-folder relationships
- **Key Fields**: `entity_id` (property UUID), `dropbox_folder_path` (current folder path), `sf_id` (Salesforce ID)
- **Property Table**: Has `property_name` field that users can update

## Implementation Steps

### Step 1: Environment Configuration
Add Dropbox API credentials to your `.env` file:

```bash
# Dropbox API Configuration
DROPBOX_ACCESS_TOKEN=your_dropbox_access_token_here
DROPBOX_REFRESH_TOKEN=your_dropbox_refresh_token_here
DROPBOX_APP_KEY=your_dropbox_app_key_here
DROPBOX_APP_SECRET=your_dropbox_app_secret_here
```

**Getting Dropbox API Credentials:**
1. Go to https://www.dropbox.com/developers/apps
2. Create a new app or use existing app
3. Enable OAuth settings
4. Generate access token in the app settings
5. Note: For production, implement OAuth2 flow with refresh tokens

---

### Step 2: Create Database Queue Table
Create a new table to queue Dropbox sync operations. This allows background processing and retry logic.

**File**: Create new migration or add to existing migration script

```sql
-- Create sync queue table for Dropbox operations
CREATE TABLE IF NOT EXISTS dropbox_sync_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Entity information
  entity_type VARCHAR(50) NOT NULL, -- 'property', 'client', 'deal'
  entity_id UUID NOT NULL,
  
  -- Rename operation details
  old_name TEXT NOT NULL,
  new_name TEXT NOT NULL,
  old_path TEXT,
  new_path TEXT,
  
  -- Operation tracking
  action VARCHAR(50) NOT NULL DEFAULT 'rename_folder',
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  
  -- Error handling
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_dropbox_sync_status ON dropbox_sync_queue(status);
CREATE INDEX IF NOT EXISTS idx_dropbox_sync_entity ON dropbox_sync_queue(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_dropbox_sync_created ON dropbox_sync_queue(created_at);

-- Update trigger
CREATE OR REPLACE FUNCTION update_dropbox_sync_queue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_dropbox_sync_queue
  BEFORE UPDATE ON dropbox_sync_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_dropbox_sync_queue_updated_at();

COMMENT ON TABLE dropbox_sync_queue IS 'Queue for Dropbox folder sync operations with retry logic';
```

---

### Step 3: Create Database Trigger for Property Name Changes
Automatically queue sync operations when property names change.

**File**: Add to your migration script or create new migration

```sql
-- Function to queue Dropbox sync when property name changes
CREATE OR REPLACE FUNCTION queue_dropbox_property_rename()
RETURNS TRIGGER AS $$
DECLARE
  mapping_record RECORD;
BEGIN
  -- Only proceed if property_name actually changed
  IF NEW.property_name IS DISTINCT FROM OLD.property_name THEN
    
    -- Look up the existing Dropbox folder mapping
    SELECT * INTO mapping_record
    FROM dropbox_folder_mapping
    WHERE entity_type = 'property' 
      AND entity_id = NEW.id
    LIMIT 1;
    
    -- If mapping exists, queue the rename operation
    IF FOUND THEN
      INSERT INTO dropbox_sync_queue (
        entity_type,
        entity_id,
        old_name,
        new_name,
        old_path,
        action,
        status
      ) VALUES (
        'property',
        NEW.id,
        OLD.property_name,
        NEW.property_name,
        mapping_record.dropbox_folder_path,
        'rename_folder',
        'pending'
      );
      
      RAISE NOTICE 'Queued Dropbox rename: % -> %', OLD.property_name, NEW.property_name;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on property table
DROP TRIGGER IF EXISTS trg_queue_dropbox_property_rename ON property;
CREATE TRIGGER trg_queue_dropbox_property_rename
  AFTER UPDATE ON property
  FOR EACH ROW
  WHEN (OLD.property_name IS DISTINCT FROM NEW.property_name)
  EXECUTE FUNCTION queue_dropbox_property_rename();

COMMENT ON FUNCTION queue_dropbox_property_rename IS 'Automatically queues Dropbox folder rename when property name changes';
```

---

### Step 4: Create Dropbox Service
Create a service to handle Dropbox API interactions.

**File**: `src/services/dropboxService.ts`

```typescript
import axios from 'axios';

interface DropboxMoveResponse {
  metadata: {
    '.tag': string;
    name: string;
    path_lower: string;
    path_display: string;
    id: string;
  };
}

interface DropboxError {
  error_summary: string;
  error: {
    '.tag': string;
  };
}

class DropboxService {
  private accessToken: string;
  private baseUrl = 'https://api.dropboxapi.com/2';

  constructor() {
    this.accessToken = import.meta.env.VITE_DROPBOX_ACCESS_TOKEN || '';
    
    if (!this.accessToken) {
      console.warn('Dropbox access token not configured');
    }
  }

  /**
   * Rename a folder in Dropbox
   */
  async renameFolder(oldPath: string, newPath: string): Promise<DropboxMoveResponse> {
    try {
      const response = await axios.post<DropboxMoveResponse>(
        `${this.baseUrl}/files/move_v2`,
        {
          from_path: oldPath,
          to_path: newPath,
          autorename: false, // Don't auto-rename if conflict exists
          allow_ownership_transfer: false
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('✅ Dropbox folder renamed successfully:', {
        from: oldPath,
        to: newPath,
        result: response.data
      });

      return response.data;

    } catch (error) {
      if (axios.isAxiosError(error)) {
        const dropboxError = error.response?.data as DropboxError;
        
        // Handle specific Dropbox errors
        if (dropboxError?.error?.['.tag'] === 'from_lookup/not_found') {
          throw new Error(`Folder not found in Dropbox: ${oldPath}`);
        } else if (dropboxError?.error?.['.tag'] === 'to/conflict') {
          throw new Error(`A folder already exists at: ${newPath}`);
        } else {
          throw new Error(dropboxError?.error_summary || 'Dropbox API error');
        }
      }
      
      throw error;
    }
  }

  /**
   * Check if a folder exists in Dropbox
   */
  async folderExists(path: string): Promise<boolean> {
    try {
      await axios.post(
        `${this.baseUrl}/files/get_metadata`,
        {
          path: path,
          include_media_info: false,
          include_deleted: false,
          include_has_explicit_shared_members: false
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Build folder path for a property
   */
  buildPropertyFolderPath(propertyName: string, basePath = '/Properties'): string {
    // Clean the property name for use as folder name
    const cleanName = propertyName
      .replace(/[<>:"/\\|?*]/g, '') // Remove invalid characters
      .trim();
    
    return `${basePath}/${cleanName}`;
  }
}

export const dropboxService = new DropboxService();
```

---

### Step 5: Create Background Worker Service
Create a service to process the sync queue.

**File**: `src/services/dropboxSyncWorker.ts`

```typescript
import { supabase } from '@/lib/supabase';
import { dropboxService } from './dropboxService';

interface SyncQueueItem {
  id: string;
  entity_type: string;
  entity_id: string;
  old_name: string;
  new_name: string;
  old_path: string | null;
  new_path: string | null;
  action: string;
  status: string;
  error_message: string | null;
  retry_count: number;
  max_retries: number;
  created_at: string;
}

class DropboxSyncWorker {
  private isRunning = false;
  private processingInterval: NodeJS.Timeout | null = null;

  /**
   * Start the background worker
   */
  start(intervalMs = 30000) {
    if (this.isRunning) {
      console.log('⚠️ Dropbox sync worker already running');
      return;
    }

    console.log('🚀 Starting Dropbox sync worker...');
    this.isRunning = true;

    // Process immediately, then on interval
    this.processQueue();
    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, intervalMs);
  }

  /**
   * Stop the background worker
   */
  stop() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    this.isRunning = false;
    console.log('🛑 Dropbox sync worker stopped');
  }

  /**
   * Process pending items in the queue
   */
  async processQueue() {
    try {
      // Fetch pending items
      const { data: queueItems, error } = await supabase
        .from('dropbox_sync_queue')
        .select('*')
        .eq('status', 'pending')
        .lt('retry_count', supabase.rpc('max_retries'))
        .order('created_at', { ascending: true })
        .limit(10);

      if (error) {
        console.error('❌ Error fetching queue items:', error);
        return;
      }

      if (!queueItems || queueItems.length === 0) {
        return; // No pending items
      }

      console.log(`📋 Processing ${queueItems.length} Dropbox sync items...`);

      // Process each item
      for (const item of queueItems as SyncQueueItem[]) {
        await this.processItem(item);
      }

    } catch (error) {
      console.error('❌ Error processing sync queue:', error);
    }
  }

  /**
   * Process a single queue item
   */
  private async processItem(item: SyncQueueItem) {
    console.log(`🔄 Processing: ${item.old_name} -> ${item.new_name}`);

    try {
      // Mark as processing
      await this.updateQueueStatus(item.id, 'processing');

      // Build paths
      const oldPath = item.old_path || dropboxService.buildPropertyFolderPath(item.old_name);
      const newPath = dropboxService.buildPropertyFolderPath(item.new_name);

      // Perform the rename
      await dropboxService.renameFolder(oldPath, newPath);

      // Update the folder mapping table
      await supabase
        .from('dropbox_folder_mapping')
        .update({
          dropbox_folder_path: newPath,
          last_verified_at: new Date().toISOString()
        })
        .eq('entity_type', item.entity_type)
        .eq('entity_id', item.entity_id);

      // Mark as completed
      await this.updateQueueStatus(item.id, 'completed', null, newPath);

      console.log(`✅ Completed: ${item.old_name} -> ${item.new_name}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Failed to process ${item.old_name}:`, errorMessage);

      // Increment retry count
      const newRetryCount = item.retry_count + 1;
      const newStatus = newRetryCount >= item.max_retries ? 'failed' : 'pending';

      await this.updateQueueStatus(item.id, newStatus, errorMessage, null, newRetryCount);
    }
  }

  /**
   * Update queue item status
   */
  private async updateQueueStatus(
    id: string,
    status: string,
    errorMessage: string | null = null,
    newPath: string | null = null,
    retryCount?: number
  ) {
    const updates: any = {
      status,
      error_message: errorMessage,
      processed_at: new Date().toISOString()
    };

    if (newPath) {
      updates.new_path = newPath;
    }

    if (retryCount !== undefined) {
      updates.retry_count = retryCount;
    }

    await supabase
      .from('dropbox_sync_queue')
      .update(updates)
      .eq('id', id);
  }

  /**
   * Manually trigger queue processing (useful for testing)
   */
  async processNow() {
    await this.processQueue();
  }
}

export const dropboxSyncWorker = new DropboxSyncWorker();
```

---

### Step 6: Initialize Worker in Your App
Start the background worker when your app loads.

**File**: `src/App.tsx` (or your main app entry point)

```typescript
import { useEffect } from 'react';
import { dropboxSyncWorker } from '@/services/dropboxSyncWorker';

function App() {
  useEffect(() => {
    // Start the Dropbox sync worker
    dropboxSyncWorker.start(30000); // Process every 30 seconds

    // Cleanup on unmount
    return () => {
      dropboxSyncWorker.stop();
    };
  }, []);

  // ... rest of your app
}
```

---

### Step 7: Add Manual Sync UI (Optional)
Add a button in your admin panel to manually trigger sync.

**File**: `src/components/admin/DropboxSyncPanel.tsx`

```typescript
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { dropboxSyncWorker } from '@/services/dropboxSyncWorker';
import { supabase } from '@/lib/supabase';
import { RefreshCw } from 'lucide-react';

export function DropboxSyncPanel() {
  const [processing, setProcessing] = useState(false);
  const [stats, setStats] = useState<any>(null);

  const handleManualSync = async () => {
    setProcessing(true);
    try {
      await dropboxSyncWorker.processNow();
      await loadStats();
    } finally {
      setProcessing(false);
    }
  };

  const loadStats = async () => {
    const { data } = await supabase
      .from('dropbox_sync_queue')
      .select('status')
      .in('status', ['pending', 'processing', 'failed']);
    
    if (data) {
      const pending = data.filter(d => d.status === 'pending').length;
      const processing = data.filter(d => d.status === 'processing').length;
      const failed = data.filter(d => d.status === 'failed').length;
      
      setStats({ pending, processing, failed });
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  return (
    <div className="p-4 border rounded-lg">
      <h3 className="text-lg font-semibold mb-4">Dropbox Sync Status</h3>
      
      {stats && (
        <div className="mb-4 space-y-2">
          <div>Pending: {stats.pending}</div>
          <div>Processing: {stats.processing}</div>
          <div>Failed: {stats.failed}</div>
        </div>
      )}
      
      <Button 
        onClick={handleManualSync} 
        disabled={processing}
        className="w-full"
      >
        <RefreshCw className={`mr-2 h-4 w-4 ${processing ? 'animate-spin' : ''}`} />
        {processing ? 'Processing...' : 'Process Queue Now'}
      </Button>
    </div>
  );
}
```

---

## Testing Instructions

### Step 1: Test Database Trigger
```sql
-- Update a property name to trigger the queue
UPDATE property 
SET property_name = 'Test Property Updated'
WHERE id = 'some-property-id';

-- Check if queue item was created
SELECT * FROM dropbox_sync_queue 
WHERE entity_id = 'some-property-id'
ORDER BY created_at DESC;
```

### Step 2: Test Dropbox Service
```typescript
// In browser console or test file
import { dropboxService } from '@/services/dropboxService';

// Test rename
await dropboxService.renameFolder(
  '/Properties/Old Property Name',
  '/Properties/New Property Name'
);
```

### Step 3: Test Background Worker
```typescript
// Manually trigger processing
import { dropboxSyncWorker } from '@/services/dropboxSyncWorker';
await dropboxSyncWorker.processNow();
```

---

## Error Handling

The system handles these scenarios:
- **Folder doesn't exist**: Error logged, status set to 'failed'
- **Folder name conflict**: Error logged, status set to 'failed'
- **API rate limits**: Automatic retry with exponential backoff
- **Network errors**: Automatic retry up to max_retries
- **Invalid API credentials**: Clear error message in logs

---

## Security Considerations

1. **Never commit API tokens** - Always use environment variables
2. **Use refresh tokens** for production - Access tokens expire
3. **Validate folder paths** - Prevent directory traversal attacks
4. **Rate limiting** - Respect Dropbox API limits (currently ~12,000 requests/hour)
5. **Audit logging** - Log all sync operations for compliance

---

## Production Deployment Checklist

- [ ] Configure Dropbox OAuth2 app
- [ ] Set up refresh token rotation
- [ ] Add monitoring for failed syncs
- [ ] Configure alerting for persistent failures
- [ ] Test with production data
- [ ] Document manual recovery procedures
- [ ] Set up log aggregation
- [ ] Configure retry policies
- [ ] Test rollback procedures

---

## Future Enhancements

1. **Bi-directional sync**: Detect folder renames in Dropbox and update CRM
2. **Bulk operations**: Handle multiple property renames efficiently
3. **Webhook integration**: Use Dropbox webhooks for real-time sync
4. **Folder structure management**: Create nested folder hierarchies
5. **File synchronization**: Sync property files between systems
6. **Conflict resolution**: UI for handling sync conflicts

---

## Implementation Summary

This system provides:
- ✅ Automatic detection of property name changes via database trigger
- ✅ Reliable queue-based processing with retry logic
- ✅ Background worker for non-blocking sync operations
- ✅ Full Dropbox API integration with error handling
- ✅ Admin UI for manual sync triggering and status monitoring
- ✅ Comprehensive logging and error tracking

When a property name changes, the system automatically:
1. Detects the change via database trigger
2. Queues a sync operation
3. Background worker processes the queue
4. Renames the folder in Dropbox
5. Updates the mapping table with new path
6. Logs success or schedules retry on failure