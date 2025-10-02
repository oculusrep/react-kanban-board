# Dropbox UI - Next Steps

**Current Status:** Phase 1 Complete ✅
**Next Phase:** Phase 2 - Drag-and-Drop Upload

---

## 🎯 Immediate Next Steps

### Option A: Phase 2 - Drag-and-Drop Upload (Recommended)

**Goal:** Add drag-and-drop functionality for easier file uploads

**Steps:**
1. Install react-dropzone
   ```bash
   npm install react-dropzone
   ```

2. Update FileManager component to add drag-and-drop zone
3. Add visual feedback on drag-over
4. Show upload progress for each file
5. Test with multiple files

**Time Estimate:** 1-2 hours

**Files to Modify:**
- `src/components/FileManager/FileManager.tsx`
- `package.json`

---

### Option B: Integrate into Other Pages

**Goal:** Add FileManager to Client and Deal detail pages

**Client Detail Page:**
```tsx
// In src/pages/ClientDetailsPage.tsx
import FileManager from '../components/FileManager/FileManager';

// Add to render:
{clientId && (
  <div className="mb-6">
    <FileManager entityType="client" entityId={clientId} />
  </div>
)}
```

**Deal Detail Page:**
```tsx
// In src/pages/DealDetailsPage.tsx
import FileManager from '../components/FileManager/FileManager';

// Add to render:
{dealId && (
  <div className="mb-6">
    <FileManager entityType="deal" entityId={dealId} />
  </div>
)}
```

**Time Estimate:** 30 minutes per page

---

## 📋 Phase 2 Implementation Guide

### Step 1: Install Dependencies
```bash
npm install react-dropzone
```

### Step 2: Import and Setup

```tsx
// In FileManager.tsx
import { useDropzone } from 'react-dropzone';

// Inside component:
const { getRootProps, getInputProps, isDragActive } = useDropzone({
  onDrop: async (acceptedFiles) => {
    const fileList = {
      ...acceptedFiles,
      length: acceptedFiles.length,
      item: (index: number) => acceptedFiles[index]
    } as FileList;

    await handleFileUpload({ target: { files: fileList } } as any);
  },
  noClick: false,
  noKeyboard: false
});
```

### Step 3: Update UI

```tsx
// Wrap file list area
<div
  {...getRootProps()}
  className={`relative ${isDragActive ? 'border-4 border-blue-500 border-dashed bg-blue-50' : ''}`}
>
  <input {...getInputProps()} />

  {/* Drag overlay */}
  {isDragActive && (
    <div className="absolute inset-0 bg-blue-100/80 flex items-center justify-center z-10 pointer-events-none">
      <div className="text-center">
        <Upload className="w-16 h-16 text-blue-600 mx-auto mb-4" />
        <p className="text-xl font-semibold text-blue-900">Drop files here</p>
      </div>
    </div>
  )}

  {/* Existing file list */}
  {currentFiles.map(file => ...)}
</div>
```

### Step 4: Add Upload Progress

```tsx
// Add state
const [uploadProgress, setUploadProgress] = useState<{[key: string]: number}>({});

// Update upload handler
const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  if (e.target.files && e.target.files.length > 0) {
    setUploading(true);

    // Track progress for each file
    const files = Array.from(e.target.files);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadProgress(prev => ({ ...prev, [file.name]: 0 }));

      try {
        await uploadFile(file);
        setUploadProgress(prev => ({ ...prev, [file.name]: 100 }));
      } catch (err) {
        console.error(`Error uploading ${file.name}:`, err);
      }
    }

    await refreshFiles();
    setUploading(false);
    setUploadProgress({});
  }
};

// Show progress
{uploading && Object.keys(uploadProgress).length > 0 && (
  <div className="px-6 py-3 bg-blue-50 border-b border-blue-200">
    {Object.entries(uploadProgress).map(([name, progress]) => (
      <div key={name} className="mb-2">
        <div className="flex justify-between text-xs mb-1">
          <span>{name}</span>
          <span>{progress}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    ))}
  </div>
)}
```

---

## 🔮 Future Phases Quick Reference

### Phase 3: Polish & Features
- **File Preview Modal** - Images, PDFs, videos
- **Bulk Actions** - Select multiple, bulk delete/download
- **Search/Filter** - Filter by name, type, sort by date/size
- **Loading Skeletons** - Better loading UX

### Phase 4: New Records
- **Auto-create folders** for new properties/clients/deals
- **Folder naming** - `/New CRM Files/Properties/{name}_{id}/`
- **Mapping creation** - Auto-insert to `dropbox_folder_mapping`

### Phase 5: Production
- **Error boundaries** - Comprehensive error handling
- **Performance** - Caching, optimization
- **Permissions** - Role-based access control
- **Activity logging** - Audit trail for all actions

---

## 🛠️ Common Tasks

### Add FileManager to Any Page

1. Import component:
   ```tsx
   import FileManager from '../components/FileManager/FileManager';
   ```

2. Add to render (with proper entity type):
   ```tsx
   <FileManager
     entityType="property"  // or "client" or "deal"
     entityId={recordId}
   />
   ```

3. Ensure `recordId` exists and has mapping in `dropbox_folder_mapping` table

### Refresh Token Manually (If Needed)

```bash
# Get new token
npm run dropbox:refresh

# Update .env
DROPBOX_ACCESS_TOKEN=<new_token>
VITE_DROPBOX_ACCESS_TOKEN=<new_token>

# Restart dev server
```

**Note:** With auto-refresh enabled, this is rarely needed!

### Adjust Auto-Polling Interval

```tsx
// In FileManager.tsx, line 52
}, 30000);  // Change to desired milliseconds

// Examples:
}, 15000);  // 15 seconds (faster, more API calls)
}, 60000);  // 60 seconds (slower, fewer API calls)
}, 120000); // 2 minutes (minimal API usage)
```

### Debug File List Issues

1. Check browser console for errors
2. Verify `dropbox_folder_mapping` has entry:
   ```sql
   SELECT * FROM dropbox_folder_mapping
   WHERE entity_type = 'property'
   AND entity_id = '<property_id>';
   ```
3. Check Dropbox folder path is correct
4. Click Refresh button to force update
5. Check token hasn't expired (auto-refresh should handle this)

---

## 📚 Documentation Reference

- **[Session Summary](./dropbox_ui_session_summary.md)** - Everything done this session
- **[Phase 1 Complete](./dropbox_ui_phase1_complete.md)** - Phase 1 features & usage
- **[UI Roadmap](./dropbox_ui_roadmap.md)** - Full implementation plan
- **[Implementation Log](./dropbox_implementation_log.md)** - Backend details

---

## ✅ Pre-Flight Checklist

Before starting next phase:

- [ ] Dev server running (`npm run dev`)
- [ ] `.env` has all VITE_ variables configured
- [ ] FileManager working on at least one property page
- [ ] Subfolders navigate correctly
- [ ] Auto-refresh working (check console logs)
- [ ] Auto-polling working (wait 30 seconds, see updates)

---

## 🚀 Recommended Path Forward

**Best Next Step:** Phase 2 - Drag-and-Drop Upload

**Why:**
- Significantly improves user experience
- Completes Phase 2 from roadmap
- Small scope, quick win
- Builds on existing foundation

**Alternative:**
- Integrate into Client/Deal pages first (easier, faster)
- Then come back to drag-and-drop

**Your Choice!** Both are valid next steps.
