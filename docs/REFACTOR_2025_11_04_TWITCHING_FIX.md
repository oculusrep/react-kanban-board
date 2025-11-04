# Fix: Property Details Slideout and Add Contact Modal Twitching

**Date:** November 4, 2025
**Issue:** Twitching/flickering when opening Property Details slideout and Add Contact modal
**Root Cause:** Multiple unstable references causing infinite re-render loops

## Problems Fixed

### 1. Add Contact Modal - Unstable Array Default Parameter

**File:** `src/components/property/AddPropertyContactModal.tsx`

**Problem:**
```typescript
// WRONG - creates new empty array on every render
const AddPropertyContactModal = ({
  existingContactIds = [],  // <-- New array reference every render!
}) => {
  useEffect(() => {
    // ... fetch contacts
  }, [existingContactIds]);  // <-- Dependency array sees new reference every time
}
```

This caused an infinite loop:
1. Component renders with `existingContactIds = []`
2. New empty array `[]` is created
3. useEffect sees new array reference and triggers
4. State update from fetch causes re-render
5. Go to step 1 → infinite loop

**Fix:**
```typescript
// CORRECT - stable array reference
const EMPTY_ARRAY: string[] = [];

const AddPropertyContactModal = ({
  existingContactIds = EMPTY_ARRAY,  // <-- Same reference every render
}) => {
  useEffect(() => {
    // ... fetch contacts
  }, [existingContactIds]);  // <-- Only triggers when actual IDs change
}
```

### 2. useAutosave Hook - Unstable Callback Dependencies

**File:** `src/hooks/useAutosave.ts`

**Problems:**
1. `updateStatus` had `onStatusChange` in dependencies, causing it to recreate
2. `save` callback had `data` and `onSave` in dependencies, causing it to recreate on every keystroke
3. Debounced effect had `save` in dependencies, triggering on every `save` recreation

**Solution:** Use refs for all unstable dependencies and keep callbacks stable.

**Changes:**

```typescript
// Store callbacks in refs
const onStatusChangeRef = useRef(onStatusChange);
const dataRef = useRef(data);
const onSaveRef = useRef(onSave);

// Keep refs up to date
useEffect(() => {
  onStatusChangeRef.current = onStatusChange;
  dataRef.current = data;
  onSaveRef.current = onSave;
}, [onStatusChange, data, onSave]);

// Stable updateStatus with empty dependency array
const updateStatus = useCallback((newStatus: AutosaveStatus) => {
  setStatus(newStatus);
  onStatusChangeRef.current?.(newStatus);
}, []);  // <-- Empty! Stable forever

// Inline save logic in setTimeout to avoid save callback in dependencies
timeoutRef.current = setTimeout(async () => {
  await onSaveRef.current(dataRef.current);  // Use refs
  // ... rest of save logic
}, delay);
```

**Result:** The autosave useEffect now only depends on `[data, delay, enabled, updateStatus]`, where `updateStatus` is stable.

### 3. PropertyDetailsSlideoutContent - Unstable onSave Callback

**File:** `src/components/PropertyDetailsSlideoutContent.tsx`

**Problem:**
```typescript
// WRONG - inline function recreated every render
const { status: autosaveStatus, lastSavedAt } = useAutosave({
  data: formData,
  onSave: async (data) => {  // <-- New function every render
    const { error } = await supabase
      .from('property')
      .update(data)
      .eq('id', propertyId);
    if (error) throw error;
  },
  delay: 1500,
  enabled: !loading && !!property,
});
```

**Fix:**
```typescript
// CORRECT - stable callback with useCallback
const handleSave = useCallback(async (data: Partial<Property>) => {
  const { error} = await supabase
    .from('property')
    .update(data)
    .eq('id', propertyId);
  if (error) throw error;
}, [propertyId]);  // Only recreates if propertyId changes

const { status: autosaveStatus, lastSavedAt } = useAutosave({
  data: formData,
  onSave: handleSave,  // <-- Stable reference
  delay: 1500,
  enabled: !loading && !!property,
});
```

### 4. AssignmentSidebar - Unstable Callbacks

**File:** `src/components/AssignmentSidebar.tsx`

**Fix:** Wrapped callbacks in useCallback with empty dependencies:

```typescript
// Stable callbacks to prevent infinite re-renders
const handleSiteSubmitClick = useCallback((siteSubmitId: string) => {
  setSiteSubmitSlideoutId(siteSubmitId);
  setSiteSubmitSlideoutOpen(true);
}, []);

const handlePropertyDetailsClose = useCallback(() => {
  setPropertyDetailsSlideout({ isOpen: false, propertyId: null });
  setPropertyMinimized(false);
}, []);
```

### 5. SlideOutPanel - Unstable Style Object

**File:** `src/components/SlideOutPanel.tsx`

**Problem:**
```typescript
// WRONG - new style object every render triggers CSS transitions
<div
  className="... transition-all duration-300 ..."
  style={{
    width: actualWidth,
    maxWidth: isMinimized ? '48px' : '90vw',
    right: `${rightOffset}px`
  }}
>
```

**Fix:**
```typescript
// CORRECT - memoized style object
const panelStyle = React.useMemo(() => ({
  width: actualWidth,
  maxWidth: isMinimized ? '48px' : '90vw',
  right: `${rightOffset}px`
}), [actualWidth, isMinimized, rightOffset]);

<div
  className="... transition-all duration-300 ..."
  style={panelStyle}  // <-- Stable reference
>
```

### 6. PropertyDetailsSlideOut - React.memo Wrapper

**File:** `src/components/PropertyDetailsSlideOut.tsx`

**Fix:** Wrapped component in React.memo to prevent unnecessary re-renders from parent:

```typescript
const PropertyDetailsSlideOut = React.memo(function PropertyDetailsSlideOut({
  isOpen,
  onClose,
  propertyId,
  isMinimized,
  onMinimizeChange,
  onSiteSubmitClick
}: PropertyDetailsSlideOutProps) {
  return (
    <SlideOutPanel ... >
      <PropertyDetailsSlideoutContent ... />
    </SlideOutPanel>
  );
});
```

## Key Learnings

### 1. Default Parameters with Objects/Arrays Are Dangerous

❌ **Never do this:**
```typescript
function Component({ items = [] }) {
  useEffect(() => {
    // This will run on EVERY render because [] is new each time
  }, [items]);
}
```

✅ **Do this instead:**
```typescript
const EMPTY_ARRAY = [];

function Component({ items = EMPTY_ARRAY }) {
  useEffect(() => {
    // Only runs when items actually changes
  }, [items]);
}
```

### 2. Inline Objects in Dependency Arrays Cause Loops

❌ **Never do this:**
```typescript
useEffect(() => {
  // ...
}, [onSave]);  // If onSave is an inline function, infinite loop!
```

✅ **Do this instead:**
```typescript
const handleSave = useCallback(async (data) => {
  // save logic
}, [stableDependencies]);

useEffect(() => {
  // ...
}, [handleSave]);  // Now stable
```

### 3. Use Refs for Truly Dynamic Values in Stable Callbacks

When you need a callback to be stable but use the latest values:

```typescript
const dataRef = useRef(data);
useEffect(() => {
  dataRef.current = data;
}, [data]);

const stableCallback = useCallback(() => {
  // Always uses latest data via ref
  doSomething(dataRef.current);
}, []);  // Empty dependencies = stable forever
```

### 4. Always Ask Which Component First

**Critical Rule:** When debugging visual issues, always ask:
- "Which specific component is twitching?"
- "When does it happen?"
- "What triggers it?"

Don't assume which component has the issue. In this case, I spent 30+ minutes debugging the Property Details slideout when the actual issue was the Add Contact modal.

## Files Changed

1. `src/components/property/AddPropertyContactModal.tsx` - Stable EMPTY_ARRAY
2. `src/hooks/useAutosave.ts` - Refs for unstable dependencies
3. `src/components/PropertyDetailsSlideoutContent.tsx` - useCallback for handleSave
4. `src/components/AssignmentSidebar.tsx` - useCallback for callbacks
5. `src/components/SlideOutPanel.tsx` - useMemo for style object
6. `src/components/PropertyDetailsSlideOut.tsx` - React.memo wrapper
7. `src/components/property/PropertyInputField.tsx` - Styling updates (text-xs, text-sm)

## Testing

✅ Property Details slideout opens smoothly without twitching
✅ Add Contact modal opens smoothly without continuous reloading
✅ Autosave works correctly without infinite loops
✅ All callbacks remain stable across re-renders

## Related Documentation

- See [DEBUGGING_RULES.md](./DEBUGGING_RULES.md) for debugging best practices
- See [REFACTOR_2025_11_04_PROPERTY_CONTACTS_HOOK.md](./REFACTOR_2025_11_04_PROPERTY_CONTACTS_HOOK.md) for related Property Contacts work
