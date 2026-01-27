# Dropbox Subfolder Upload Fix - January 27, 2026

## Problem

Files dragged from the computer onto Dropbox subfolders were uploading to the root folder instead of the target subfolder. This occurred in two contexts:
- The main Files tab ([FileManager.tsx](../src/components/FileManager/FileManager.tsx))
- The sidebar Files module ([FileManagerModule.tsx](../src/components/sidebar/FileManagerModule.tsx))

## Root Cause

The system couldn't distinguish between:
1. **Native file drags** - Files being dragged from the computer/desktop
2. **Internal file moves** - Files being moved between folders within OVIS

When a user dragged files from their computer onto a subfolder like "_CLOSED", the system treated it as a general upload and used the current viewing path (often root) instead of the drop target folder.

## Solution

### 1. Native File Drag Detection

Added logic to detect native file drags using the HTML5 Drag and Drop API:

```typescript
const isNativeFileDrag = e.dataTransfer.types.includes('Files');
```

When `e.dataTransfer.types` includes `'Files'`, it means files are being dragged from outside the browser (computer, desktop, file manager).

### 2. Drop Target Folder State

Added state to track which folder is being hovered during a native file drag:

```typescript
const [dropTargetFolder, setDropTargetFolder] = useState<DropboxFile | null>(null);
```

### 3. Enhanced Drag Handlers

Modified the drag event handlers to distinguish between drag types:

```typescript
const handleDragOver = (e: React.DragEvent, folder: DropboxFile) => {
  e.preventDefault();
  e.stopPropagation();

  if (folder.type !== 'folder') return;

  // Check if dragging native files (from computer) or internal files
  const isNativeFileDrag = e.dataTransfer.types.includes('Files');

  if (isNativeFileDrag) {
    // Native file drag from outside browser
    e.dataTransfer.dropEffect = 'copy';
    setDropTargetFolder(folder);
    setDropTargetPath(folder.path);
  } else if (draggedItem && folder.path !== draggedItem.path) {
    // Internal file move
    e.dataTransfer.dropEffect = 'move';
    setDropTargetPath(folder.path);
  }
};
```

### 4. React-Dropzone Integration

Updated the react-dropzone `onDrop` handler to use the `dropTargetFolder` path when set:

```typescript
const { getRootProps, getInputProps, isDragActive } = useDropzone({
  onDrop: async (acceptedFiles) => {
    const fileList = {
      ...acceptedFiles,
      length: acceptedFiles.length,
      item: (index: number) => acceptedFiles[index]
    } as unknown as FileList;

    // Determine upload path - use dropTargetFolder if set, otherwise currentPath
    let uploadPath = currentPath;
    if (dropTargetFolder) {
      // Calculate relative path from base folder
      uploadPath = dropTargetFolder.path.replace(folderPath || '', '');
      setDropTargetFolder(null); // Clear after use
    }

    await uploadFiles(fileList, uploadPath);
  },
  noClick: true,
  noKeyboard: false
});
```

### 5. Visual Feedback

Added visual highlight for the folder being hovered during a native file drag:

```typescript
className={`${
  dropTargetPath === folder.path || dropTargetFolder?.path === folder.path
    ? 'bg-blue-100 ring-2 ring-blue-400 ring-inset'
    : ''
}`}
```

## Files Modified

### [src/hooks/useDropboxFiles.ts](../src/hooks/useDropboxFiles.ts)

Added `subPath` parameter to `uploadFiles()` function:

```typescript
uploadFiles: (fileList: FileList, subPath?: string) => Promise<void>;

const uploadFiles = useCallback(
  async (fileList: FileList, subPath: string = '') => {
    // ...
    // Combine base folder path with subfolder path
    const targetFolderPath = baseFolderPath + subPath;
    console.log('📤 Uploading to:', targetFolderPath);
    // ...
  },
  [folderPath, entityId, dropboxService, refreshFiles, createFolderAndMapping, getEntityName]
);
```

This allows callers to specify a relative subfolder path (e.g., `"/_CLOSED"`) which is combined with the base folder path.

### [src/components/FileManager/FileManager.tsx](../src/components/FileManager/FileManager.tsx)

Added native file drag detection and drop target tracking:
- Added `dropTargetFolder` state
- Modified `handleDragOver` to detect native vs internal drags
- Modified `handleDrop` to handle native file drops
- Updated react-dropzone `onDrop` to use `dropTargetFolder.path`

### [src/components/sidebar/FileManagerModule.tsx](../src/components/sidebar/FileManagerModule.tsx)

Applied identical changes as FileManager.tsx:
- Added `dropTargetFolder` state
- Modified `handleDragOver` to detect native vs internal drags
- Modified `handleDrop` to handle native file drops
- Updated react-dropzone `onDrop` to use `dropTargetFolder.path`

## How It Works

1. **User starts dragging files** from their computer
2. **Mouse enters a folder** in the Files tab or sidebar
3. **handleDragOver fires** and detects native file drag via `e.dataTransfer.types.includes('Files')`
4. **dropTargetFolder is set** to the hovered folder
5. **Visual highlight appears** on the target folder (blue background + ring)
6. **User drops files** on the folder
7. **handleDrop fires** and detects native files via `e.dataTransfer.files.length > 0`
8. **React-dropzone onDrop receives** the files
9. **uploadPath is calculated** by removing base folder from dropTargetFolder.path
10. **uploadFiles is called** with the relative subfolder path
11. **Files upload** to the correct subfolder

## Edge Cases Handled

- **Dragging onto root while viewing subfolder**: Uses dropTargetFolder if set, otherwise currentPath
- **Dragging onto same folder as current view**: Works correctly, uploads to that folder
- **Dragging onto deeply nested folders**: Calculates correct relative path
- **Clearing dropTargetFolder**: Resets after upload to prevent stale state

## Testing

**Test Case 1: Drag to subfolder from root view**
1. Open Files tab, viewing root folder
2. Drag file from computer onto "_CLOSED" subfolder
3. ✅ File uploads to "_CLOSED" folder

**Test Case 2: Drag to subfolder in sidebar**
1. Open deal sidebar
2. Drag file from computer onto "_CLOSED" in Salesforce Folders section
3. ✅ File uploads to "_CLOSED" folder

**Test Case 3: Internal file move still works**
1. Drag file within OVIS from one folder to another
2. ✅ File moves correctly (not copied)

## Deployment

Changes were deployed to production at ovis.oculusrep.com via Vercel project "ovis".

**IMPORTANT**: Always deploy to the "ovis" Vercel project, which serves ovis.oculusrep.com. Do NOT deploy to "ovis-online" project.

## Git Commits

1. `4542d80` - "Fix Dropbox file upload to respect current subfolder"
   - Added subPath parameter to uploadFiles()

2. `a899aa1` - "Fix Dropbox file upload to detect folder drop targets"
   - Added native file drag detection to FileManager.tsx

3. `f9624f7` - "Fix Dropbox file upload to folders in sidebar"
   - Applied same fix to FileManagerModule.tsx

---

*Document created: January 27, 2026*
*Feature: Dropbox file management*
*Issue: Files uploading to wrong folder*
*Status: Fixed and deployed*
