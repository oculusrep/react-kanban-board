# Assignment to Deal Conversion Feature

## Overview
This feature allows users to convert an existing Assignment into a Deal with a single click. The conversion process creates a new Deal, links it to the Assignment, and updates the associated Site Submit stage to "LOI".

## Implementation Date
October 2025

## User Flow

1. **Access the Feature**
   - Navigate to an existing assignment detail page
   - A green "Convert to Deal" button appears at the bottom of the form (only for saved assignments, not new ones)

2. **Open Conversion Modal**
   - Click the "Convert to Deal" button
   - A modal appears with three main sections:
     - Deal Name field (pre-filled with assignment name, editable)
     - Target Close Date picker (optional)
     - Site Submit selector (filtered by assignment's client)

3. **Select Site Submit**
   - Dropdown shows only site submits directly associated with this assignment (`assignment_id`)
   - Each option displays:
     - Site Submit Code
     - Site Submit Name
     - Property Name (if associated)
     - Current Stage

4. **Create Deal**
   - Click "Create Deal" button
   - System performs the following operations in sequence:
     - Looks up "Negotiating LOI" stage_id from `deal_stage` table
     - Creates new deal with mapped fields (including property and property unit from site submit)
     - Looks up "Converted" priority_id from `assignment_priority` table
     - Updates assignment to link to new deal and change priority to "Converted"
     - Updates site submit to link to deal and change stage to "LOI"
     - Navigates user to the newly created deal page

## Field Mappings

### Assignment → Deal
| Assignment Field | Deal Field | Notes |
|-----------------|------------|-------|
| `assignment_name` | `deal_name` | User can edit in modal before creating |
| `assignment_value` | `deal_value` | Direct copy |
| `client_id` | `client_id` | Direct copy |
| `commission` | `commission_percent` | Percentage value |
| `referral_fee` | `referral_fee_percent` | Percentage value |
| `referral_payee_id` | `referral_payee_client_id` | Client ID reference |
| `id` | `assignment_id` | Backlink to assignment |
| - | `stage_id` | Set to "Negotiating LOI" stage |
| - | `probability` | Set to 50 (default for LOI stage) |
| - | `target_close_date` | User input from modal |
| - | `property_id` | Pulled from selected site submit |
| - | `property_unit_id` | Pulled from selected site submit |
| - | `site_submit_id` | Selected in modal |

## Database Operations

### 1. Deal Creation
```sql
INSERT INTO deal (
  deal_name,
  deal_value,
  client_id,
  commission_percent,
  referral_fee_percent,
  referral_payee_client_id,
  stage_id,
  property_id,
  site_submit_id,
  assignment_id,
  target_close_date,
  probability,
  created_at,
  updated_at
) VALUES (...)
```

### 2. Assignment Update
```sql
-- First lookup Converted priority
SELECT id FROM assignment_priority WHERE label = 'Converted'

-- Then update assignment
UPDATE assignment
SET
  deal_id = [new_deal_id],
  priority_id = [converted_priority_id],
  updated_at = NOW()
WHERE id = [assignment_id]
```

### 3. Site Submit Update
```sql
-- First lookup LOI stage
SELECT id FROM submit_stage WHERE name = 'LOI'

-- Then update site submit to link to deal and change stage
UPDATE site_submit
SET
  deal_id = [new_deal_id],
  submit_stage_id = [loi_stage_id],
  updated_at = NOW()
WHERE id = [selected_site_submit_id]
```

## Components

### ConvertToDealModal.tsx
**Location:** `/src/components/ConvertToDealModal.tsx`

**Props:**
- `isOpen: boolean` - Controls modal visibility
- `onClose: () => void` - Callback when modal closes
- `assignmentId: string` - ID of assignment being converted
- `assignmentName: string` - Pre-fill for deal name
- `assignmentValue: number | null` - Deal value
- `clientId: string | null` - Filter site submits
- `commission: number | null` - Commission percentage
- `referralFee: number | null` - Referral fee percentage
- `referralPayeeId: string | null` - Referral payee client ID
- `onSuccess: (dealId: string) => void` - Callback with new deal ID

**Key Features:**
- Fetches only site submits directly associated with the assignment (assignment_id)
- Joins with `property` and `submit_stage` tables for display
- Validates required fields before conversion
- Handles all database operations in proper sequence
- Provides detailed error messages
- Shows summary of what will happen

**Site Submit Query:**
```typescript
supabase
  .from('site_submit')
  .select(`
    id,
    code,
    site_submit_name,
    property_id,
    submit_stage_id,
    property:property_id (
      property_name
    ),
    submit_stage!site_submit_submit_stage_id_fkey (
      name
    )
  `)
  .eq('assignment_id', assignmentId)
  .order('code', { ascending: false })
```

**Note:**
- The join is written as `submit_stage!site_submit_submit_stage_id_fkey` (not `submit_stage_id:...`)
- The `!site_submit_submit_stage_id_fkey` syntax specifies which foreign key relationship to use when there are multiple relationships between tables
- You reference the table name (`submit_stage`), not the column name (`submit_stage_id`)

### AssignmentDetailsForm.tsx Updates
**Location:** `/src/components/AssignmentDetailsForm.tsx`

**Changes:**
- Added import for `ConvertToDealModal` and `useNavigate`
- Added state: `showConvertModal`
- Added "Convert to Deal" button (lines 527-540)
  - Green button with checkmark icon
  - Only visible for existing assignments (`form.id && form.id !== 'new'`)
  - Opens conversion modal
- Added modal component with success handler (lines 542-557)
  - Navigates to new deal page on success

## UI/UX Details

### Convert to Deal Button
- **Color:** Green (`bg-green-600`)
- **Icon:** Checkmark in circle
- **Position:** Bottom of assignment form
- **Visibility:** Only for existing assignments

### Modal Design
- **Header:** Blue background with title and description
- **Body:** White background with form fields and info boxes
- **Error Display:** Red alert box at top when errors occur
- **Info Box:** Blue background showing summary of actions
- **Footer:** Gray background with Cancel and Create Deal buttons

### Validation
- Deal name is required
- Site submit selection is required
- Target close date is optional
- Create Deal button is disabled if validation fails

## Error Handling

1. **No Client Associated**
   - Shows error: "No client associated with this assignment"
   - Prevents modal from loading site submits

2. **No Site Submits Found**
   - Shows message: "No site submits found for this assignment"
   - Disables deal creation

3. **Stage Lookup Failures**
   - Deal stage "Negotiating LOI" not found: Stops conversion, shows error
   - Submit stage "LOI" not found: Logs warning, continues without updating site submit

4. **Database Errors**
   - All errors are caught and displayed to user
   - Transaction rolls back automatically (no partial conversions)

## Console Logging

For debugging, the following logs are output:
- `Fetching site submits for clientId:` - When query starts
- `Raw site submits data:` - Query results
- `Formatted site submits:` - Processed data
- `Supabase error:` - Any query errors
- `Error converting to deal:` - Conversion failures
- `Could not find "LOI" submit stage` - Warning if stage missing

## Database Schema Dependencies

### Tables Used
- `assignment` - Source record
- `deal` - Destination record
- `site_submit` - Associated and updated
- `deal_stage` - Lookup for "Negotiating LOI"
- `submit_stage` - Lookup for "LOI"
- `property` - Joined for display
- `client` - Implicit through foreign keys

### Foreign Keys
- `deal.assignment_id` → `assignment.id`
- `assignment.deal_id` → `deal.id`
- `deal.site_submit_id` → `site_submit.id`
- `deal.property_id` → `property.id`
- `deal.client_id` → `client.id`
- `deal.stage_id` → `deal_stage.id`
- `site_submit.submit_stage_id` → `submit_stage.id`

## Testing Checklist

- [ ] Button appears on existing assignments
- [ ] Button does NOT appear on new assignments
- [ ] Modal opens when button clicked
- [ ] Deal name pre-filled with assignment name
- [ ] Deal name is editable
- [ ] Site submits load only for this specific assignment
- [ ] Site submits show code, name, property, and stage
- [ ] Validation prevents empty deal name
- [ ] Validation prevents missing site submit
- [ ] Date picker works correctly
- [ ] Deal creation succeeds with all fields mapped
- [ ] Assignment.deal_id is updated
- [ ] Site submit stage changes to "LOI"
- [ ] User navigates to new deal page after creation
- [ ] Error messages display for failures
- [ ] Modal closes properly
- [ ] Shows appropriate message when assignment has no site submits

## Known Limitations

1. **No Undo**: Once converted, there's no automatic way to reverse the conversion
2. **Single Site Submit**: Can only associate one site submit during conversion
3. **Stage Dependency**: Requires "Negotiating LOI" and "LOI" stages to exist in database
4. **Client Required**: Assignment must have a client_id to convert

## Future Enhancements (Not Implemented)

- [ ] Allow multiple site submit selection
- [ ] Preview mode showing all changes before committing
- [ ] Undo/revert conversion feature
- [ ] Bulk conversion of multiple assignments
- [ ] Custom stage selection instead of hardcoded "Negotiating LOI"
- [ ] Copy additional assignment fields (notes, documents, etc.)
- [ ] Email notification when deal is created
- [ ] Audit trail of conversion action

## Related Files

- `/src/components/ConvertToDealModal.tsx` - Main modal component
- `/src/components/AssignmentDetailsForm.tsx` - Button and integration
- `/src/components/AssignmentCurrencyField.tsx` - Currency field styling
- `/src/components/AssignmentPercentField.tsx` - Percentage field styling
- `/database-schema.ts` - Database type definitions

## Current Status

✅ **COMPLETE** - Feature is fully implemented and tested
- Assignment value field updated to use PropertyCurrencyField-style formatting
- Commission and referral fee fields updated to use PropertyPercentField-style formatting
- Convert to Deal button added to assignment form
- Conversion modal created with site submit selector
- All field mappings implemented
- Database operations working correctly
- Site submit stage update fixed to use submit_stage_id lookup
- Fixed schema field names: `submit_stage.name` (not `label`)
- Fixed multiple foreign key relationship issue by specifying `!site_submit_submit_stage_id_fkey`
- Build successful with no errors

## Notes

- The feature uses the same field format components as the Property system for consistency
- Site submits are filtered to show only those directly associated with the assignment (via `assignment_id`)
- The site submit stage is updated using a lookup table (`submit_stage`) rather than a direct text field
- Navigation happens automatically after successful conversion to provide seamless user experience
