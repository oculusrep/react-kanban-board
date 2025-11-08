# Script to Fix All Insert/Update Statements

## Files to Fix (44 total insert statements)

### HIGH PRIORITY (User-facing creates):
1. ✅ **ContactFormModal.tsx** (line 263) - FIXED
2. ✅ **PinDetailsSlideout.tsx** (line 1653) - FIXED
3. **SiteSubmitFormModal.tsx** (line 420) - Site submit creation
4. **DealDetailsForm.tsx** (lines 538, 674, 766, 860) - Deal creation (4 places)
5. **DealSidebar.tsx** (line 248) - Deal creation
6. **NewPropertyPage.tsx** (line 319) - Property unit creation
7. **ClientOverviewTab.tsx** (line 229) - Client creation
8. **AssignmentDetailsForm.tsx** (line 206) - Assignment creation
9. **ConvertToDealModal.tsx** (lines 192, 222) - Deal conversion

### MEDIUM PRIORITY (Associated records):
10. **PaymentTab.tsx** (line 369) - Payment splits
11. **CommissionSplitSection.tsx** (line 237) - Commission splits
12. **PropertyUnitsSection.tsx** (line 194) - Property units
13. **AddPropertyContactModal.tsx** (line 89) - Property contacts
14. **ContactFormModal.tsx** (line 273) - Property contact association
15. **AddContactsModal.tsx** (line 130) - Multiple property contacts
16. **DealContactsTab.tsx** (line 214) - Deal contacts
17. **DealSidebar.tsx** (lines 573, 877, 968, 980) - Deal associations (4 places)
18. **ContactOverviewTab.tsx** (line 120) - Contact data
19. **AddContactRelationModal.tsx** (line 136) - Contact relations
20. **AddChildAccountModal.tsx** (line 114) - Child accounts

### LOWER PRIORITY (Notes, tasks, activities):
21. **NotesSidebar.tsx** (line 187) - Note associations
22. **NoteFormModal.tsx** (lines 193, 305, 339) - Notes (3 places)
23. **NoteAssociations.tsx** (line 94) - Note associations
24. **CriticalDateSidebar.tsx** (line 232) - Critical dates
25. **AddTaskModal.tsx** (line 523) - Activities/tasks
26. **LogCallModal.tsx** (line 364) - Call logs
27. **AddAssignmentModal.tsx** (line 123) - Assignments

### HOOKS (Used by multiple components):
28. **useProperty.ts** (line 132) - Property creation
29. **useDropboxFiles.ts** (line 326) - File records
30. **useClientContacts.ts** (line 126) - Client contact links
31. **useContactClientRoles.ts** (line 151) - Contact client roles
32. **useContactDealRoles.ts** (line 151) - Contact deal roles
33. **useContactClients.ts** (line 168) - Contact client relations

## Fix Pattern

For each file, apply this pattern:

### Step 1: Add import
```typescript
import { prepareInsert } from '../lib/supabaseHelpers';
// or '../../lib/supabaseHelpers' depending on file location
```

### Step 2: Wrap insert data
**Before:**
```typescript
const { data, error } = await supabase
  .from('table_name')
  .insert(insertData)
  .select();
```

**After:**
```typescript
const { data, error } = await supabase
  .from('table_name')
  .insert(prepareInsert(insertData))
  .select();
```

**Or if building data inline:**
```typescript
const { data, error } = await supabase
  .from('table_name')
  .insert(prepareInsert({
    field1: value1,
    field2: value2,
    created_at: new Date().toISOString()
  }))
  .select();
```

## Automated Fix Command

Run this to see all locations:
```bash
grep -rn "\.insert(" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules
```

## Testing After Each Fix

After fixing each file:

```sql
-- Test the specific table
SELECT
  created_by_id,
  updated_by_id,
  created_at
FROM [table_name]
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 5;
```

Verify `created_by_id` and `updated_by_id` are NOT null for new records.

## UPDATE Statements Need Fixing Too!

Don't forget - UPDATE statements also need the same fix:

```bash
grep -rn "\.update(" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | head -30
```

Apply the same pattern:
```typescript
import { prepareUpdate } from '../lib/supabaseHelpers';

const { data, error } = await supabase
  .from('table_name')
  .update(prepareUpdate(updateData))
  .eq('id', id);
```

## Priority Order

1. Fix HIGH PRIORITY files first (these are user-facing creates)
2. Test each one after fixing
3. Then fix MEDIUM PRIORITY
4. Then LOWER PRIORITY
5. Finally fix all UPDATE statements

## Completion Checklist

- [ ] All 44 insert statements fixed
- [ ] All update statements fixed
- [ ] Tested each major table
- [ ] Verified created_by_id is populated
- [ ] Verified updated_by_id is populated
- [ ] No more NULL creator tracking on new records
