# Property Contact Management System

## Overview

The Property Contact Management System implements a many-to-many relationship between properties and contacts, allowing each property to have multiple associated contacts (owners, tenants, property managers, etc.) and each contact to be associated with multiple properties.

## Architecture

### Database Schema

#### `property_contact` Junction Table
```sql
CREATE TABLE property_contact (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sf_id TEXT UNIQUE,                    -- Salesforce ID
    sf_join_name TEXT,                    -- Salesforce join name
    sf_owner_id TEXT,                     -- Salesforce owner ID
    sf_email TEXT,                        -- Salesforce email
    sf_phone TEXT,                        -- Salesforce phone
    sf_contact_id TEXT,                   -- Salesforce contact reference
    contact_id UUID REFERENCES contact(id), -- Local contact reference
    sf_created_by_id TEXT,                -- Salesforce created by
    created_by_id UUID REFERENCES "user"(id), -- Local created by
    created_at TIMESTAMPTZ DEFAULT NOW(),
    sf_property_id TEXT,                  -- Salesforce property reference
    property_id UUID REFERENCES property(id), -- Local property reference
    sf_mobile_phone TEXT,                 -- Salesforce mobile phone
    sf_contact_name TEXT,                 -- Salesforce contact name
    updated_by_sf_id TEXT,                -- Salesforce updated by
    updated_by_id UUID REFERENCES "user"(id), -- Local updated by
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Key Constraints
- `UNIQUE INDEX property_contact_unique_pair ON property_contact(property_id, contact_id)` - Prevents duplicate relationships
- Foreign key constraints ensure data integrity
- Indexes on `property_id`, `contact_id`, and Salesforce fields for performance

### Data Migration

#### Salesforce Integration
The system imports data from Salesforce `J_Property_2_Contacts__c` table:

```sql
-- Deduplication logic keeps most recent record for each property-contact pair
WITH deduplicated_property_contacts AS (
    SELECT DISTINCT ON (sf."Property__c", sf."Contact__c")
        -- All mapped fields
    FROM "salesforce_J_Property_2_Contacts__c" sf
    ORDER BY sf."Property__c", sf."Contact__c", sf."LastModifiedDate" DESC NULLS LAST
)
INSERT INTO property_contact (...)
SELECT ... FROM deduplicated_property_contacts
ON CONFLICT (property_id, contact_id) DO UPDATE SET ...
```

## Frontend Components

### ContactsSidebar Component

**File**: `src/components/property/ContactsSidebar.tsx`

#### Features
- **Right-sliding sidebar modal** - Non-intrusive interface
- **Multi-source contact fetching**:
  - Primary contacts via `property_contact` junction table
  - Legacy support for `property.contact_id`
  - Deal-associated contacts as fallback
- **Rich contact display**:
  - Contact name with visual badges (Primary, Deal)
  - Company name (prominently displayed)
  - Job title
  - Email address (click-to-email)
  - Work phone (click-to-call)
  - Mobile phone (click-to-call)
- **Interactive elements**:
  - Click-to-call functionality
  - Click-to-email functionality
  - Add Contact button (ready for future implementation)

#### Contact Display Hierarchy
1. **Contact Name** + Status Badges
2. **Company Name** (no label, just the name)
3. **Job Title** (blue text)
4. **Email Address** (clickable with 📧 icon)
5. **Work Phone** (clickable with 📞 icon)
6. **Mobile Phone** (clickable with 📱 icon)

#### Usage
```tsx
import ContactsSidebar from './ContactsSidebar';

<ContactsSidebar
  propertyId={propertyId}
  isOpen={showContactsSidebar}
  onClose={() => setShowContactsSidebar(false)}
/>
```

### PropertyHeader Integration

**File**: `src/components/property/PropertyHeader.tsx`

#### Updates Made
- **Added contacts button**: Blue people icon in action bar
- **Removed clutter**: Eliminated "Contact Made" field and stage display
- **Clean integration**: Seamless trigger for ContactsSidebar

#### Usage
```tsx
<PropertyHeader
  // ... other props
  onShowContacts={() => setShowContactsSidebar(true)}
/>
```

### PropertyDetailScreen Integration

**File**: `src/components/property/PropertyDetailScreen.tsx`

#### Integration Points
- State management for sidebar visibility
- ContactsSidebar component integration
- Proper cleanup and event handling

## Data Flow

### Contact Fetching Logic

1. **Primary Source**: `property_contact` junction table
   ```sql
   SELECT *, contact!fk_property_contact_contact_id (*)
   FROM property_contact 
   WHERE property_id = ?
   ```

2. **Legacy Support**: Direct property contact reference
   ```sql
   SELECT contact_id FROM property WHERE id = ?
   ```

3. **Deal Integration**: Contacts from associated deals
   ```sql
   SELECT deal_contact.contact_id 
   FROM deal 
   JOIN deal_contact ON deal.id = deal_contact.deal_id
   WHERE deal.property_id = ?
   ```

### Contact Prioritization
- **Primary Contact**: Marked with blue "Primary" badge
- **Junction Table Contacts**: Standard display
- **Deal Contacts**: Marked with purple "Deal" badge

## TypeScript Integration

### Database Schema Types
```typescript
// Added to database-schema.ts
property_contact: {
  Row: {
    id: string
    sf_id: string | null
    // ... all fields with proper types
  }
  Insert: { /* ... */ }
  Update: { /* ... */ }
  Relationships: [
    {
      foreignKeyName: "fk_property_contact_contact_id"
      columns: ["contact_id"]
      referencedRelation: "contact"
      referencedColumns: ["id"]
    }
    // ... other relationships
  ]
}
```

### Component Interface Types
```typescript
interface PropertyContactWithDetails extends Contact {
  client?: Client;
  isPrimaryContact?: boolean;
  fromDeal?: boolean;
}

interface ContactsSidebarProps {
  propertyId: string;
  isOpen: boolean;
  onClose: () => void;
}
```

## Future Enhancements

### Planned Features
1. **Add Contact Functionality**: Complete contact creation within sidebar
2. **Contact Role Management**: Assign specific roles (Owner, Tenant Rep, etc.)
3. **Contact Notes**: Property-specific notes for each contact relationship
4. **Contact Communication History**: Track emails and calls
5. **Bulk Contact Operations**: Mass assign contacts to multiple properties

### Technical Improvements
1. **Caching**: Implement contact data caching for performance
2. **Real-time Updates**: WebSocket integration for live contact updates
3. **Search and Filter**: Advanced contact filtering within sidebar
4. **Export Functionality**: Export property contact lists
5. **Mobile Optimization**: Enhanced mobile interface for field use

## Migration and Deployment

### Database Migration
Run the master migration script to create the junction table:
```bash
psql -f _master_migration_script.sql
```

### Data Import
The migration script automatically imports data from Salesforce if the `salesforce_J_Property_2_Contacts__c` table exists.

### Rollback Considerations
- Junction table can be safely dropped if needed
- Original `property.contact_id` field preserved for backward compatibility
- No breaking changes to existing functionality

## Troubleshooting

### Common Issues

1. **Contacts Not Displaying**
   - Check browser console for Supabase errors
   - Verify `property_contact` table has data for the property
   - Ensure foreign key relationships are properly set up

2. **Foreign Key Ambiguity Errors**
   - Use explicit relationship names in Supabase queries
   - Example: `contact!fk_property_contact_contact_id`

3. **Duplicate Contact Relationships**
   - Migration script includes deduplication logic
   - Unique constraint prevents duplicates at database level

### Debug Mode
Enable debug logging by uncommenting console.log statements in ContactsSidebar component for detailed query information.