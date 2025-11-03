# Development Standards & Best Practices

**File to Reference**: Ask me to read this file at the start of EVERY session
**Last Updated**: 2025-10-31
**Status**: Living document - update as patterns emerge

---

## 🚨 CRITICAL RULE #1: Component Reusability - NO DUPLICATION

### The Problem We're Solving

**ANTI-PATTERN** ❌ (What we used to do):
- Same form exists in 3 places: Modal, Slideout, Full Page
- Change a field in one place → must manually update 2 other places
- Different bugs in each version
- Inconsistent UX across different views
- High maintenance burden

**CORRECT PATTERN** ✅ (What we do now):
- **One source of truth** for business logic
- **Reusable components** that work in any context
- **Custom hooks** to extract shared logic
- Changes in one place automatically work everywhere

### Real Example: Site Submit Autosave

**What we did correctly**:

1. **Created reusable hook** (`useAutosave.ts`):
```typescript
// src/hooks/useAutosave.ts
export function useAutosave<T>({ data, onSave, delay, enabled }) {
  // All autosave logic lives HERE, not duplicated
  return { status, lastSavedAt };
}
```

2. **Used in multiple contexts**:
```typescript
// In SiteSubmitFormModal.tsx
const { status } = useAutosave({ data: formData, onSave: saveSiteSubmit });

// In PinDetailsSlideout.tsx
const { status } = useAutosave({ data: formData, onSave: saveSiteSubmit });

// In SiteSubmitDetailsPage.tsx
const { status } = useAutosave({ data: formData, onSave: saveSiteSubmit });
```

3. **Single visual component**:
```typescript
// src/components/AutosaveIndicator.tsx
// Used by all 3 contexts - change here, updates everywhere
<AutosaveIndicator status={status} lastSavedAt={lastSavedAt} />
```

### The Golden Rules

#### Rule 1.1: Extract Logic into Custom Hooks
**When you write logic, ask**: "Could this be used elsewhere?"
- Autosave → `useAutosave` hook
- Form validation → `useFormValidation` hook
- Data fetching → `useSiteSubmitData` hook
- Permissions → `usePermissions` hook

#### Rule 1.2: Create Presentation Components
**Separate logic from UI**:
```typescript
// ❌ WRONG - Logic mixed with UI
function SiteSubmitForm() {
  const [data, setData] = useState({});
  const handleSubmit = async () => { /* save logic */ };
  const validate = () => { /* validation logic */ };
  return <form>...</form>;
}

// ✅ RIGHT - Logic in hook, UI in component
function SiteSubmitForm({ siteSubmit, onSave }) {
  const { data, handleChange, validate } = useSiteSubmitForm(siteSubmit);
  return <form>...</form>;
}
```

#### Rule 1.3: Composition Over Duplication
**Build once, compose everywhere**:
```typescript
// Single source of truth
<SiteSubmitFields
  data={data}
  onChange={handleChange}
  errors={errors}
/>

// Used in Modal
<Modal>
  <SiteSubmitFields {...props} />
</Modal>

// Used in Slideout
<Slideout>
  <SiteSubmitFields {...props} />
</Slideout>

// Used in Full Page
<Page>
  <SiteSubmitFields {...props} />
</Page>
```

---

## 🎯 CRITICAL RULE #2: Map-First Philosophy

### Core Principle
Users should NEVER lose context or position when working with the map.

### Rules

#### Rule 2.1: Preserve Map State
- **Never navigate away** from map to show details
- **Use slideouts/modals** to keep map visible
- **Maintain zoom/position** when switching between views

#### Rule 2.2: Slideouts Over Navigation
```typescript
// ❌ WRONG - Navigates away, loses map context
<MenuItem onClick={() => navigate('/site-submit/' + id)}>
  View Site Submit
</MenuItem>

// ✅ RIGHT - Opens slideout, keeps map visible
<MenuItem onClick={() => openSiteSubmitSlideout(id)}>
  View Site Submit
</MenuItem>
```

#### Rule 2.3: In-Place Editing
- Right-click markers for quick actions (move, edit, delete)
- No new tabs when already on map
- Toast notifications for feedback
- Live updates without page refresh

---

## 🏗️ CRITICAL RULE #3: Component Architecture Patterns

### Pattern 1: Container/Presentation Split

**Container Component** (logic):
```typescript
// src/containers/SiteSubmitFormContainer.tsx
export function SiteSubmitFormContainer({ id, mode }) {
  const { siteSubmit, loading } = useSiteSubmitData(id);
  const { save, status } = useAutosave({ data: siteSubmit, onSave });
  const { validate, errors } = useValidation(siteSubmit);

  return (
    <SiteSubmitForm
      data={siteSubmit}
      onSave={save}
      errors={errors}
      loading={loading}
    />
  );
}
```

**Presentation Component** (UI):
```typescript
// src/components/SiteSubmitForm.tsx
export function SiteSubmitForm({ data, onSave, errors, loading }) {
  return (
    <form onSubmit={onSave}>
      {/* Just UI, no business logic */}
    </form>
  );
}
```

### Pattern 2: Custom Hooks for Shared Logic

**Every time you write useEffect or complex state logic, ask**:
> "Will I need this logic somewhere else?"

If yes → Extract to custom hook

```typescript
// ✅ GOOD - Reusable hook
// src/hooks/useSiteSubmitForm.ts
export function useSiteSubmitForm(siteSubmit) {
  const [formData, setFormData] = useState(siteSubmit);
  const [errors, setErrors] = useState({});

  const validate = () => { /* ... */ };
  const handleChange = (field, value) => { /* ... */ };

  return { formData, errors, validate, handleChange };
}

// Use in Modal
function SiteSubmitModal({ siteSubmit }) {
  const form = useSiteSubmitForm(siteSubmit);
  return <SiteSubmitFields {...form} />;
}

// Use in Slideout
function SiteSubmitSlideout({ siteSubmit }) {
  const form = useSiteSubmitForm(siteSubmit);
  return <SiteSubmitFields {...form} />;
}
```

### Pattern 3: Compound Components

For complex UIs with multiple related parts:

```typescript
// ✅ GOOD - Compound component pattern
<SiteSubmitEditor siteSubmit={data}>
  <SiteSubmitEditor.Header />
  <SiteSubmitEditor.Tabs>
    <SiteSubmitEditor.SubmitTab />
    <SiteSubmitEditor.PropertyTab />
    <SiteSubmitEditor.LocationTab />
  </SiteSubmitEditor.Tabs>
  <SiteSubmitEditor.Footer />
</SiteSubmitEditor>

// Used in Modal, Slideout, Full Page - same component!
```

---

## 🎯 CRITICAL RULE #4: Always Use Inline Editable Fields

### The Rule

**ALWAYS use `FormattedField` (inline editable / click-to-edit) for currency, percentage, and number inputs.**

**NEVER use:**
- ❌ `<input type="number">` (has spinner arrows)
- ❌ Old `FormattedInput` component (different API, has issues)
- ❌ `AssignmentCurrencyField`, `PropertyCurrencyField`, `AssignmentPercentField`, `PercentageInput` (old duplicates)

### Why This Matters

**Spinner arrows are bad UX:**
- Accidentally triggered by mouse wheel
- Take up space
- Not useful for most numeric inputs
- Inconsistent across browsers

**Click-to-edit fields are better:**
- ✅ Clean display when not editing
- ✅ NO spinner arrows (removed globally via CSS)
- ✅ Click to edit, Enter to save, Escape to cancel
- ✅ Can type directly without clicking
- ✅ Consistent formatting ($1,250,000.00, 3.5%, etc.)
- ✅ Keyboard accessible
- ✅ Touch-friendly (44px min height)

### How to Use

**For currency fields:**
```typescript
<FormattedField
  label="Deal Value"
  type="currency"
  value={dealValue}
  onChange={setDealValue}
/>
```

**For percentage fields:**
```typescript
<FormattedField
  label="Commission %"
  type="percentage"
  value={commission}
  onChange={setCommission}
  maxValue={100}
/>
```

**For number fields (square footage, units, etc.):**
```typescript
<FormattedField
  label="Building Sqft"
  type="number"
  value={sqft}
  onChange={setSqft}
  decimalPlaces={0}  // whole numbers only
/>
```

### Component Location

**Use this component:** `src/components/shared/FormattedField.tsx`

**Import:**
```typescript
import FormattedField from '../components/shared/FormattedField';
```

### Reference Names

When discussing these fields, call them:
- "Click-to-edit fields"
- "Inline editable fields"
- Or just: "FormattedField"

### Examples in the Codebase

**Good examples:**
- ✅ Property Details Slideout (`PropertyDetailsSlideoutContent.tsx`)
- ✅ Deal Details Form (`DealDetailsForm.tsx`) - Deal Value, Commission %, Flat Fee
- ✅ Typography Test Page (`/typography-test`)

**Needs migration:**
- `src/components/property/FinancialSection.tsx`
- `src/components/CommissionDetailsSection.tsx`
- `src/components/AddAssignmentModal.tsx`

---

## 📋 CRITICAL RULE #5: Code Review Checklist

### Before Writing Code

- [ ] Does this logic already exist somewhere?
- [ ] Could this be extracted into a custom hook?
- [ ] Is this component presentation-only or does it mix logic?
- [ ] Will this need to work in multiple contexts (modal, slideout, page)?
- [ ] **Am I adding a currency/percentage/number field? Use `FormattedField`!**
- [ ] **Am I showing a message to the user? Use Toast, not `alert()`!**
- [ ] **Am I asking for confirmation? Use ConfirmDialog, not `confirm()`!**

### Before Committing

- [ ] Did I duplicate any code? (Search for similar patterns)
- [ ] Can this component be reused?
- [ ] Did I extract shared logic into hooks?
- [ ] Does this preserve map context (if map-related)?
- [ ] Did I update this document with new patterns?

### Red Flags 🚩

❌ Copy-pasting a component and modifying it
❌ useState/useEffect logic duplicated across files
❌ Similar form fields defined in multiple places
❌ Navigation that loses map position
❌ Opening new tabs when already on map
❌ Manual "Update" buttons instead of autosave
❌ **Using `<input type="number">` instead of `FormattedField`**
❌ **Creating new currency/percentage field components instead of using `FormattedField`**
❌ **Using `alert()`, `confirm()`, or `prompt()` instead of Toast/ConfirmDialog**

---

## 🛠️ Refactoring Guide

### When You Find Duplication

**Step 1: Identify the duplication**
```bash
# Search for similar patterns
git grep "const \[formData, setFormData\]"
git grep "handleSubmit"
```

**Step 2: Extract to hook**
```typescript
// Before: Duplicated in 3 files
const [data, setData] = useState(initial);
useEffect(() => { /* fetch */ }, [id]);
const save = async () => { /* save */ };

// After: One hook
const { data, save, loading } = useSiteSubmitData(id);
```

**Step 3: Create presentation component**
```typescript
// Extract UI to reusable component
<SiteSubmitFields
  data={data}
  onChange={handleChange}
  errors={errors}
/>
```

**Step 4: Use in all contexts**
```typescript
// Modal, Slideout, Page all use same components
<Modal>
  <SiteSubmitFields {...props} />
</Modal>
```

**Step 5: Delete old duplicated code**
```bash
# Remove the old duplicated versions
git rm src/components/SiteSubmitFormOld.tsx
git rm src/components/SiteSubmitSlideoutForm.tsx
```

---

## 📁 Project Structure Standards

### Folder Organization

```
src/
├── components/          # Reusable UI components (presentation only)
│   ├── AutosaveIndicator.tsx
│   ├── SiteSubmitFields.tsx
│   └── shared/         # Highly reusable components
│
├── containers/         # Container components (logic + composition)
│   ├── SiteSubmitFormContainer.tsx
│   └── PropertyFormContainer.tsx
│
├── hooks/              # Custom hooks (shared logic)
│   ├── useAutosave.ts
│   ├── useSiteSubmitForm.ts
│   └── useSiteSubmitData.ts
│
├── pages/              # Full page views (minimal logic, mostly composition)
│   ├── MappingPageNew.tsx
│   └── SiteSubmitDetailsPage.tsx
│
├── services/           # API calls, external services
│   ├── supabaseService.ts
│   └── geocodingService.ts
│
└── utils/              # Pure functions, helpers
    ├── validation.ts
    └── formatters.ts
```

### Naming Conventions

**Components**: PascalCase, descriptive
- ✅ `SiteSubmitFields.tsx`
- ✅ `AutosaveIndicator.tsx`
- ❌ `form.tsx`
- ❌ `SSF.tsx`

**Hooks**: camelCase, starts with `use`
- ✅ `useAutosave.ts`
- ✅ `useSiteSubmitForm.ts`
- ❌ `autosave.ts`
- ❌ `siteSubmitHook.ts`

**Services**: camelCase, ends with `Service`
- ✅ `geocodingService.ts`
- ✅ `supabaseService.ts`

---

## 🔍 Common Patterns Reference

### Pattern: Autosave

**When to use**: Any form that saves to database

**Implementation**:
```typescript
import { useAutosave } from '../hooks/useAutosave';

const { status, lastSavedAt } = useAutosave({
  data: formData,
  onSave: async (data) => {
    const { error } = await supabase.from('table').update(data);
    if (error) throw error;
  },
  delay: 1500,
  enabled: !isNew
});

<AutosaveIndicator status={status} lastSavedAt={lastSavedAt} />
```

### Pattern: Data Fetching

**When to use**: Loading data from Supabase

**Implementation**:
```typescript
// Create hook: src/hooks/useSiteSubmitData.ts
export function useSiteSubmitData(id: string) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Fetch logic here
  }, [id]);

  return { data, loading, error, refetch };
}

// Use everywhere
const { data, loading } = useSiteSubmitData(id);
```

### Pattern: Form State Management

**When to use**: Forms with validation and changes

**Implementation**:
```typescript
// Create hook: src/hooks/useFormState.ts
export function useFormState<T>(initialData: T) {
  const [data, setData] = useState(initialData);
  const [errors, setErrors] = useState({});
  const [isDirty, setIsDirty] = useState(false);

  const handleChange = (field: keyof T, value: any) => {
    setData(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  const reset = () => {
    setData(initialData);
    setIsDirty(false);
  };

  return { data, errors, isDirty, handleChange, reset };
}
```

---

## 🚀 Performance Best Practices

### Rule: Memoization for Expensive Operations

```typescript
// ✅ GOOD - Memoize expensive calculations
const filteredSiteSubmits = useMemo(() => {
  return siteSubmits.filter(ss => ss.stage === selectedStage);
}, [siteSubmits, selectedStage]);

// ✅ GOOD - Memoize callbacks passed to child components
const handleSave = useCallback(async (data) => {
  await saveSiteSubmit(data);
}, [saveSiteSubmit]);
```

### Rule: Lazy Loading for Large Components

```typescript
// ✅ GOOD - Lazy load map components
const MapPanel = lazy(() => import('./components/MapPanel'));

<Suspense fallback={<Loading />}>
  <MapPanel />
</Suspense>
```

---

## 📝 Documentation Standards

### Rule: Document Complex Logic

```typescript
/**
 * Custom hook for site submit location verification
 *
 * Handles the workflow for verifying/adjusting site submit pin locations:
 * 1. Fetches site submit data if not provided
 * 2. Makes marker draggable when in verify mode
 * 3. Updates local state immediately on drag
 * 4. Saves to database in background
 * 5. Refreshes layer without losing marker visibility
 *
 * @param siteSubmitId - ID of site submit to verify
 * @param verifyMode - Whether verification mode is active
 * @returns Verification state and handlers
 *
 * @example
 * const { isVerifying, startVerify, endVerify } = useSiteSubmitVerification(id);
 */
export function useSiteSubmitVerification(siteSubmitId, verifyMode) {
  // ...
}
```

### Rule: README for New Patterns

When introducing a new pattern, update relevant docs:
- `/docs/DEVELOPMENT_STANDARDS.md` (this file)
- Component-specific README if needed
- Architecture decision records (ADRs) for major changes

---

## 🎓 Learning from Past Mistakes

### Case Study 1: Site Submit Forms (The Problem That Started This)

**What we did wrong**:
- Created `SiteSubmitFormModal.tsx` with full form logic
- Created `PinDetailsSlideout.tsx` with duplicate form logic
- Created `SiteSubmitDetailsPage.tsx` with duplicate form logic
- Had to update autosave logic in 3 separate places

**What we should have done**:
1. Create `useSiteSubmitForm()` hook with all logic
2. Create `<SiteSubmitFields>` component with UI
3. Use both in Modal, Slideout, and Page
4. Changes in one place update all three

**Lesson**: If you're creating a second similar component, STOP and refactor into reusable pieces first.

### Case Study 2: Location Verification

**What we did wrong initially**:
- Separate verification logic in multiple places
- Different behavior in PropertyLayer vs SiteSubmitLayer
- Opening new tabs instead of in-place editing

**What we fixed**:
- Standardized verification pattern
- Right-click menu for in-place editing
- Local state updates for seamless UX

**Lesson**: Standardize patterns across similar features (properties and site submits should work the same way).

---

## ✅ Session Start Checklist

**At the beginning of EVERY coding session, the AI should**:

1. **Read this file**:
   ```
   Read /docs/DEVELOPMENT_STANDARDS.md
   ```

2. **Ask before starting**:
   - "Does this logic already exist in a hook?"
   - "Can we reuse an existing component?"
   - "Should I extract this to a hook first?"

3. **Check for duplication**:
   ```bash
   git grep "similar-pattern"
   ```

4. **Review recent changes** for patterns that should be extracted

---

## 🔄 Updating This Document

### When to Update

Update this document when:
- ✅ You discover a new anti-pattern to avoid
- ✅ You create a new reusable pattern worth documenting
- ✅ You refactor duplicated code into reusable pieces
- ✅ You make an architectural decision that affects future development

### How to Update

```bash
# 1. Edit this file
vim docs/DEVELOPMENT_STANDARDS.md

# 2. Commit with clear message
git add docs/DEVELOPMENT_STANDARDS.md
git commit -m "docs: add pattern for [X]"

# 3. Push to main
git push origin main
```

### Document History

- **2025-10-31**: Initial creation after discovering site submit form duplication
- **[Future Date]**: Add new patterns as they emerge

---

## 🎯 Success Metrics

**You're following these standards when**:

✅ You rarely copy-paste components
✅ New features reuse existing hooks and components
✅ Changes in one place automatically work everywhere
✅ No duplicate business logic across files
✅ Map context is always preserved
✅ Forms autosave consistently
✅ You think "Can I extract this?" before writing logic

---

## 💬 CRITICAL RULE #6: User Messaging - Toast Notifications Only

### The Rule

**ALWAYS use Toast notifications and ConfirmDialog components for user feedback.**

**NEVER use:**
- ❌ `alert()` - Browser alert dialogs
- ❌ `confirm()` - Browser confirm dialogs
- ❌ `prompt()` - Browser prompt dialogs
- ❌ `window.alert()`, `window.confirm()`, `window.prompt()`

### Why This Matters

**Browser dialogs are bad UX:**
- Block the entire browser window
- Can't be styled to match app design
- No accessibility features
- Look outdated and unprofessional
- Can't be controlled programmatically
- Different appearance across browsers

**Toast notifications and modal dialogs are better:**
- ✅ Non-blocking and contextual
- ✅ Styled consistently with app
- ✅ Can include icons, colors, and formatting
- ✅ Auto-dismiss for info messages
- ✅ Accessible and screen-reader friendly
- ✅ Professional appearance
- ✅ Can be stacked for multiple messages

### How to Use

#### For Success/Error/Info Messages

**Use Toast notifications:**

```typescript
import { useToast } from '../hooks/useToast';
import Toast from './Toast';

function MyComponent() {
  const { toast, showToast, hideToast } = useToast();

  const handleSave = async () => {
    try {
      await saveData();
      showToast('Data saved successfully', { type: 'success' });
    } catch (err) {
      showToast(err.message, { type: 'error' });
    }
  };

  return (
    <>
      {/* Your component content */}
      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onClose={hideToast}
      />
    </>
  );
}
```

#### For Confirmation Dialogs

**Use ConfirmDialog component:**

```typescript
import ConfirmDialog from './ConfirmDialog';

function MyComponent() {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDelete = async () => {
    setShowDeleteConfirm(false);
    try {
      await deleteItem();
      showToast('Item deleted successfully', { type: 'success' });
    } catch (err) {
      showToast(err.message, { type: 'error' });
    }
  };

  return (
    <>
      <button onClick={() => setShowDeleteConfirm(true)}>
        Delete
      </button>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete Item"
        message="Are you sure you want to delete this item? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </>
  );
}
```

### Toast Types

**Success** - For successful operations:
```typescript
showToast('Critical date saved successfully', { type: 'success' });
```

**Error** - For errors and failures:
```typescript
showToast('Failed to save critical date', { type: 'error' });
```

**Info** - For informational messages:
```typescript
showToast('Loading data...', { type: 'info' });
```

### Component Locations

**Toast hook:** `src/hooks/useToast.ts`
**Toast component:** `src/components/Toast.tsx`
**Confirm dialog:** `src/components/ConfirmDialog.tsx`

### Examples in the Codebase

**Good examples:**
- ✅ CriticalDateSidebar.tsx - Uses toast for save/delete and ConfirmDialog for delete confirmation
- ✅ CriticalDatesTab.tsx - Uses toast for inline edits and ConfirmDialog for delete
- ✅ DealDetailsPage.tsx - Uses toast for autosave feedback

**Needs migration:**
- ❌ Any file using `alert()`, `confirm()`, or `prompt()`

### Red Flags 🚩

❌ Using `alert()` for error messages
❌ Using `confirm()` for delete confirmations
❌ Using `prompt()` for user input
❌ Any browser native dialog functions

---

## 📅 CRITICAL RULE #7: Date Handling - Avoid Timezone Conversion

### The Rule

**ALWAYS use `.substring(0, 10)` to extract date strings. NEVER use `new Date()` for date-only values.**

### The Problem

When working with date-only values (no time component), converting through JavaScript `Date` objects causes timezone shifts that change the actual date:

```typescript
// ❌ WRONG - Timezone conversion changes the date
const dateValue = '2026-02-14T00:00:00.000Z';  // Feb 14
const date = new Date(dateValue);
const result = date.toISOString().split('T')[0]; // Might become Feb 13 or Feb 15!
```

```typescript
// ✅ RIGHT - Direct string extraction preserves the date
const dateValue = '2026-02-14T00:00:00.000Z';  // Feb 14
const result = dateValue.substring(0, 10);     // Always Feb 14
```

### Why This Matters

**Database stores dates as ISO datetime:**
- `critical_date: "2026-02-14T00:00:00.000Z"`
- Even if you only care about the date, PostgreSQL adds time

**HTML date inputs need YYYY-MM-DD format:**
- `<input type="date">` requires exactly "2026-02-14"

**Timezone conversion ruins everything:**
- User in PST sees Feb 13 (8 hours behind UTC)
- User in JST sees Feb 14 (9 hours ahead UTC)
- Same date in database, different dates shown to users!

### The Solution

**Use substring for date-only values:**

```typescript
// Fetching a date from database
const dateValue = data.critical_date;  // "2026-02-14T00:00:00.000Z"
const displayDate = dateValue ? dateValue.substring(0, 10) : '';
// Result: "2026-02-14" - No timezone conversion!
```

**Saving dates from date inputs:**

```typescript
// Date input already gives us YYYY-MM-DD format
const dateInput = formData.criticalDateValue;  // "2026-02-14"
const payload = {
  critical_date: dateInput || null  // Save as-is, PostgreSQL handles rest
};
```

### When to Use Each Approach

**Use `.substring(0, 10)` for:**
- ✅ Date-only fields (birthdate, deadline, scheduled_date)
- ✅ Extracting dates from datetime for display
- ✅ Populating `<input type="date">` values
- ✅ Comparing dates without time component

**Use `new Date()` for:**
- ✅ Datetime fields with time component (created_at, updated_at)
- ✅ Formatting with time (showing "Feb 14, 2026 3:30 PM")
- ✅ Date calculations (adding days, comparing datetimes)

### Examples in the Codebase

**Good example - CriticalDateSidebar:**
```typescript
// Fetching date value
let dateValue = '';
if (data.critical_date) {
  // Extract just the date part (YYYY-MM-DD) without timezone conversion
  dateValue = data.critical_date.substring(0, 10);
}
```

**Bad example (don't do this):**
```typescript
// ❌ WRONG - This will cause timezone issues
const dateObj = new Date(data.critical_date);
const dateValue = dateObj.toISOString().split('T')[0];
```

### Red Flags 🚩

❌ Using `new Date()` on date-only fields
❌ Using `.toISOString()` to format dates for date inputs
❌ Date shows correctly in one timezone but wrong in another
❌ Date in form doesn't match date in table
❌ Off-by-one day errors with dates

---

## 🗄️ CRITICAL RULE #8: Database Query Standards

### PostgreSQL Case Sensitivity

**ALWAYS quote Salesforce table and column names** in SQL queries because they are case-sensitive.

#### The Rule

❌ **WRONG** - Unquoted identifiers (will fail):
```sql
SELECT Id, Subject__c, Opportunity__c
FROM salesforce_Critical_Date__c
WHERE Opportunity__c = 'some_id'
```

✅ **RIGHT** - Quoted identifiers (will work):
```sql
SELECT "Id", "Subject__c", "Opportunity__c"
FROM "salesforce_Critical_Date__c"
WHERE "Opportunity__c" = 'some_id'
```

#### Why This Matters

- Salesforce table names use mixed case (e.g., `salesforce_Critical_Date__c`)
- Salesforce column names use PascalCase (e.g., `Subject__c`, `Opportunity__c`)
- PostgreSQL treats unquoted identifiers as lowercase
- Without quotes, `Opportunity__c` becomes `opportunity__c` and won't match

#### When to Quote

**ALWAYS quote:**
- ✅ Salesforce table names: `"salesforce_Critical_Date__c"`
- ✅ Salesforce column names: `"Id"`, `"Subject__c"`, `"Opportunity__c"`, `"CreatedDate"`
- ✅ Any identifier with mixed case or special characters

**No need to quote:**
- Regular lowercase table names: `deal`, `contact`, `property`
- Regular lowercase column names: `id`, `deal_id`, `created_at`

#### Examples

**Joining Salesforce tables with local tables:**
```sql
SELECT
  d.id,
  sf_cd."Subject__c",
  sf_cd."Critical_Date__c"
FROM "salesforce_Critical_Date__c" sf_cd
LEFT JOIN deal d ON d.sf_id = sf_cd."Opportunity__c"
WHERE d.id IS NOT NULL;
```

**Checking if Salesforce table exists:**
```sql
IF EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name = 'salesforce_Critical_Date__c'  -- This checks the lowercase version in metadata
) THEN
  -- Use quoted version in actual query
  SELECT * FROM "salesforce_Critical_Date__c";
END IF;
```

### Red Flags 🚩

❌ Unquoted Salesforce table names
❌ Unquoted Salesforce column names with `__c` suffix
❌ Queries that work in development but fail in production due to case sensitivity

---

## 📚 Additional Resources

- [React Custom Hooks Guide](https://react.dev/learn/reusing-logic-with-custom-hooks)
- [Component Composition Patterns](https://react.dev/learn/passing-props-to-a-component)
- [Project README](../README.md)
- [Architecture Decisions](/docs/architecture/) (if exists)

---

**Remember**: Every time you're about to write similar code for the second time, STOP and refactor into a reusable piece first. Future you (and your team) will thank you.

---

## 🚨 THE GOLDEN QUESTION

**Before writing ANY code, ask**:

> "If I change this tomorrow, how many files will I need to update?"

**If the answer is more than 1**, you need to refactor into:
- A custom hook (for logic)
- A reusable component (for UI)
- A service/utility (for data/formatting)

---

**File Location**: `/docs/DEVELOPMENT_STANDARDS.md`
**Tell the AI**: "Read `/docs/DEVELOPMENT_STANDARDS.md` at the start of each session"
