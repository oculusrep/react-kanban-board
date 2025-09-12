# Real Estate Commission Management System

A comprehensive React application for managing real estate deals, payments, commissions, and disbursements.

## Features

### Payment Management
- **Payment Tracking**: Track payments received for real estate deals with detailed payment information
- **Commission Splits**: Automatically calculate broker commissions based on deal amounts and percentages
- **Payment Disbursement System**: Manage and track disbursements to brokers and referral clients

### Disbursement Management
- **Automated Disbursement Tracking**: When payments are marked as received, system automatically generates disbursement items
- **Referral Fee Disbursements**: Proportionally calculate referral fees based on payment amounts
- **Broker Commission Disbursements**: Track individual broker commission payments
- **Visual Disbursement Interface**: Interactive modal with progress tracking and individual check items
- **Payment Status Tracking**: Mark individual disbursements as paid/unpaid with visual feedback

## Recent Updates

### Contact Management System with Slide Drawer Modal and Enhanced Sidebar (Latest)
A comprehensive contact management system has been implemented with a sliding modal interface and improved sidebar functionality:

#### Contact Form Modal System
- **ContactFormModal** (`src/components/ContactFormModal.tsx`)
  - Full-featured slide-out modal for creating and editing contacts directly from property sidebar
  - Comprehensive field organization with logical sections:
    - **Basic Information**: Source type (Contact/Lead), First/Last Name, Title, Company
    - **Contact Information**: Email, Phone, Mobile Phone, Website
    - **Mailing Address**: Complete address fields with state, zip, country
    - **Professional Information**: ICSC Profile, LinkedIN connection and profile links, Tenant Rep relationships
    - **Tags & Tracking**: Contact tags, creation/update tracking
  - **Database Schema Integration**: Fixed column name mismatches (icsc_profile_link, linked_in_profile_link, linked_in_connection)
  - **Salesforce Lead Integration**: Complete mapping from Salesforce Lead table to contact table with source_type='Lead'
  - **Form Validation**: Comprehensive validation with proper error handling and user feedback

#### Enhanced Property Sidebar with Minimize Functionality
- **PropertySidebar** (`src/components/property/PropertySidebar.tsx`)
  - **Sidebar Minimize/Expand**: Always-visible sidebar that can be minimized to a thin strip (48px) or expanded to full width (500px)
  - **UI-Friendly Icons**: Improved minimize/expand button with panel collapse icons and blue hover states
  - **Contact Display Enhancement**: Mobile phone numbers displayed with proper "Mobile" vs "Phone" labeling
  - **ContactFormModal Integration**: Seamless modal state management with sliding animations
  - **Contact Expansion Reset**: All contacts start collapsed on screen refresh for cleaner interface
  - **Removed Close Functionality**: Sidebar is always accessible, only minimizes to maximize screen real estate

#### Database Migration Enhancements
- **Lead Table Integration** (`_master_migration_script.sql`)
  - Added missing columns for Lead data: `sf_lead_source`, `sf_email_campaigns`
  - Complete Salesforce Lead table mapping with 40+ fields and proper foreign key lookups
  - Updated Contact table INSERT to include `source_type = 'Contact'` for existing contacts
  - Added cleanup queries to fix existing NULL source_type values
  - Comprehensive UPSERT patterns for both Contact and Lead data integration

#### Property Detail Screen Improvements  
- **PropertyDetailScreen** (`src/components/property/PropertyDetailScreen.tsx`)
  - **Sliding Animation Support**: Main content slides left when Contact modal opens (lg:-translate-x-[400px])
  - **Modal State Management**: Integrated contact and site submit modal state handling
  - **Sidebar Integration**: Connected minimize functionality with proper state management
  - **Removed Sidebar Toggle Bar**: Eliminated redundant toggle controls for cleaner interface

#### Key User Experience Improvements
1. **Streamlined Contact Management**: Create and edit contacts without leaving property context
2. **Always-Available Sidebar**: Minimize/expand functionality keeps sidebar accessible while maximizing screen space
3. **Enhanced Contact Display**: Mobile phone prioritization with clear labeling for better usability
4. **Unified Data Model**: Contact and Lead data unified with proper source_type distinction
5. **Professional Sliding Interface**: Smooth animations and responsive design for desktop and mobile
6. **Collapsed Contact Default**: Clean initial state with contacts collapsed on page refresh

#### Technical Enhancements
- **Database Schema Fixes**: Resolved column name mismatches and NOT NULL constraint violations
- **Migration Script Updates**: Added comprehensive Lead table integration with proper relationship mapping
- **State Management**: Enhanced modal and sidebar state coordination
- **Animation System**: CSS transition improvements for smooth sliding behavior
- **Type Safety**: Full TypeScript integration with updated database schema types

### Activity Management System (Latest)
A comprehensive activity management system has been implemented to handle tasks, calls, emails, and other activities migrated from Salesforce:

#### Activity System Architecture
- **Comprehensive Activity Table**: Central `activity` table with full Salesforce Task migration (~23,435 records)
- **Normalized Lookup Tables**: Separate lookup tables for status, priority, type, and task classifications
- **Intelligent Relationship Mapping**: Smart WhatId mapping to deals, properties, site submits, and other objects
- **Complete Salesforce Integration**: Preserves all original Salesforce data while providing normalized structure

#### Activity Lookup Tables
- **activity_status**: Status options (Open, Completed, In Progress, Not Started, Waiting on someone else, Deferred)
- **activity_type**: Type categories (Call, Email, Task, ListEmail) with icons and colors
- **activity_priority**: Priority levels (Immediate, EOD, EOW, Next Week, Call Sheet, Prospecting List, Normal, High, Low)
- **activity_task_type**: Task classifications (Assistant Task, Pipeline, Prospecting, Process, Site Submit, Follow-ups, Call List, Property Research, Personal, CRM Future Projects)

#### Main Activity Table Features
- **Salesforce Legacy Fields**: Preserves all original Salesforce fields (`sf_id`, `sf_who_id`, `sf_what_id`, etc.)
- **Active Relationships**: Foreign key relationships to contacts, users, clients, deals, properties, site submits
- **WhatId Intelligence**: Automatic object mapping based on Salesforce ID prefixes:
  - `006` → Deals (Opportunities)
  - `a00` → Properties
  - `a05` → Site Submits
  - `a03`, `0XB`, `a2R`, `a1n` → Text references for smaller objects
- **Core Activity Data**: Subject, description, dates, completion tracking
- **Call-Specific Fields**: Call disposition, duration tracking in seconds
- **Custom Boolean Flags**: Meeting held, completed call, prospecting flags, property-related activities

#### Migration and Data Integrity
- **Complete Data Migration**: Migrates all ~23,435 Task records from `salesforce_Task`
- **Smart Status/Priority Mapping**: Automatically maps Salesforce values to lookup tables with intelligent fallbacks
- **Relationship Resolution**: Links activities to contacts, deals, properties, and other objects through foreign keys
- **UPSERT Pattern**: Safe re-runnable migration with conflict resolution
- **Built-in Validation**: Real-time validation reporting during migration process

#### Database Schema Integration
- **Full TypeScript Integration**: Complete type definitions in `database-schema.ts`
- **Comprehensive Indexing**: Performance optimization for all common query patterns
- **Foreign Key Constraints**: Proper referential integrity with cascading options
- **Legacy Field Preservation**: Maintains Salesforce audit trail while enabling normalized queries

#### Key Features
1. **Complete Salesforce Task Migration**: All historical task data preserved and normalized
2. **Intelligent Object Mapping**: Activities automatically linked to related deals, properties, contacts
3. **Flexible Classification System**: Multiple dimensions of activity categorization (status, priority, type, task type)
4. **Call Management**: Specialized fields for phone call activities with duration and disposition tracking
5. **Prospecting Analytics**: Boolean flags for identifying and analyzing prospecting activities
6. **Property-Specific Tracking**: Custom fields for property-related calls and activities
7. **User Assignment**: Complete user relationship tracking for ownership and creation/modification
8. **Date Management**: Activity scheduling, creation, modification, and completion timestamps
9. **Boolean Flag System**: Comprehensive tracking of activity characteristics and completion states
10. **Migration Validation**: Built-in reporting and validation to ensure successful data migration

#### Technical Implementation
- **Database Tables**: 5 new tables (activity + 4 lookup tables) with proper relationships and constraints
- **Migration Integration**: Seamlessly integrated into master migration script with UPSERT patterns
- **Performance Optimization**: Strategic indexing on all foreign keys and commonly queried fields  
- **Data Validation**: Real-time migration validation with success reporting
- **Legacy Preservation**: All Salesforce fields preserved for audit trail and future reference
- **WhatId Documentation**: Comprehensive mapping documentation for object relationship understanding

### Site Submit Management System with Enhanced User Experience
A comprehensive site submit creation and management system has been implemented with intelligent form automation and improved user interaction:

#### Site Submit Form Modal
- **SiteSubmitFormModal** (`src/components/SiteSubmitFormModal.tsx`)
  - Full-featured slide-out modal for creating and editing site submits directly from property sidebar
  - Comprehensive field set: site_submit_name, client selection, property/unit selection, assignment tracking, submit stages, dates (submitted, LOI, delivery), financial data (year_1_rent, TI), location verification (lat/long), notes fields, and metadata
  - **Automatic Name Generation**: Intelligent site submit naming using "Client Name - Property Name" format
    - Auto-generates on client selection with property context
    - Updates automatically when client or property changes
    - User override capability - stops auto-generation once manually edited
    - Preserves existing names when editing site submits
  - **Smart Form Behavior**: Responsive design with drawer on desktop, full-screen on mobile
  - **Database Integration**: Full CRUD operations with relationship data loading for real-time sidebar updates

#### Enhanced Currency Field Components
- **PropertyCurrencyField** & **PropertyPSFField** improvements:
  - **Automatic Text Selection**: Click any currency field to automatically select all text for easy replacement
  - **Improved Edit State Management**: Added `isSaving` protection to prevent double-saves and race conditions
  - **Enhanced Timing Controls**: Delayed onBlur handling to prevent conflicts with focus events
  - **No Automatic Calculations**: Currency fields store exactly what users type - no transformations or monthly conversions
  - **Professional USD Formatting**: Consistent 2-decimal place display with proper currency symbols
  - **Reliable Single-Entry**: Fixed NNN field issue that previously required multiple attempts to enter values

#### Property Sidebar Enhancements
- **Site Submit Summary Display**: Added property unit names to sidebar summary rows
  - Format: Stage → Property Unit → Client Name (unit only shows if assigned)
  - Updated database queries to include property_unit relationship data
  - Conditional display - no label if property unit is null/blank
  - Enhanced data loading with proper relationship joins

#### Database Schema Updates
- **Legacy Field Handling**: Updated `_master_migration_script.sql` to make `sf_id` nullable
  - Resolved "null value in column 'sf_id' violates not-null constraint" errors
  - Applied to site_submit, property_unit, and deal_contact tables
  - Maintains Salesforce integration for legacy data while allowing new records without sf_id requirement
- **Relationship Query Optimization**: Enhanced site submit queries to fetch stage and client data for real-time sidebar updates

#### Key User Experience Improvements
1. **Streamlined Site Submit Creation**: Create and edit site submits without leaving property context
2. **Intelligent Form Automation**: Auto-generated naming reduces manual input while maintaining flexibility
3. **Improved Currency Input**: Professional financial data entry with reliable single-attempt input
4. **Enhanced Data Visibility**: Property unit context in sidebar summaries for better site submit identification
5. **Database Constraint Resolution**: Fixed legacy field issues preventing new record creation
6. **Real-Time Updates**: Sidebar automatically refreshes with relationship data after save operations

#### Technical Enhancements
- **State Management**: Enhanced modal state handling with edit mode detection
- **Form Validation**: Comprehensive validation with error handling and user feedback
- **Type Safety**: Full TypeScript integration with database schema types
- **Performance**: Optimized database queries with selective field loading and proper joins
- **Error Handling**: Robust error handling for database constraints and validation issues

### Enhanced Property Sidebar with Comprehensive Data Integration
The PropertySidebar has been significantly enhanced with improved data display and new functionality:

#### Deal Summary Improvements
- **Business-Focused Display**: Deal summaries now show stage names and client names instead of dollar amounts
- **Stage Integration**: Proper join with `deal_stage` table to display actual stage labels (e.g., "Prospecting", "Negotiation")
- **Client Name Display**: Join with `client` table via `client_id` foreign key to show real client names
- **Professional Theming**: Blue-themed deal items with hover effects and clickable external link icons
- **Navigation Ready**: Click handlers prepared for navigation to deal detail screens

#### Site Submits Integration  
- **Complete Site Submit Management**: New section displaying all site submits for a property
- **Data Relationships**: Joins with `submit_stage` and `client` tables for comprehensive information
- **Green Theming**: Distinct visual identity with green hover effects to differentiate from deals
- **Stage and Client Display**: Shows submit stage names and associated client names
- **Smart Expansion**: Automatically expands when site submits are present

#### Property Units Management Enhancement
- **Repositioned Section**: Moved Property Units between Location and Financial sections for better workflow
- **Enhanced Summary Display**: Single units show actual unit names instead of generic "1 unit" text
- **Per-Square-Foot Metrics**: Display rent and NNN as per-sqft rates with proper USD formatting
- **Professional Currency Formatting**: Consistent 2-decimal place formatting across all monetary fields
- **Improved Field Labels**: Removed "Monthly" from rent labels as values represent per-sqft rates

#### Database Integration Enhancements
- **Proper Foreign Key Relationships**: Correct joins using `client!client_id` syntax to resolve ambiguous relationships
- **Schema Compatibility**: Fixed field name mismatches (using `label` instead of `name` for deal_stage)
- **Optimized Queries**: Efficient data loading with proper field selection and ordering
- **Error Handling**: Robust error handling for missing relationships and data

#### Technical Improvements
- **State Management**: Enhanced sidebar state with site submits integration
- **Smart Defaults**: Intelligent expansion states based on data availability
- **Performance Optimization**: Efficient database queries with proper field selection
- **TypeScript Integration**: Full type safety with database schema types

### Property Contact Management System
A many-to-many property-contact relationship system has been implemented with a dedicated sidebar interface for managing property contacts:

#### Property Contact Junction Table
- **Database Table**: `property_contact` - Junction table linking properties to contacts
- **Many-to-Many Relationship**: Each property can have multiple contacts; each contact can be associated with multiple properties
- **Salesforce Integration**: Maps from Salesforce `J_Property_2_Contacts__c` table
- **Migration Script**: Complete migration with deduplication logic in `_master_migration_script.sql`

#### ContactsSidebar Component
- **ContactsSidebar** (`src/components/property/ContactsSidebar.tsx`)
  - Right-sliding modal sidebar for property contacts
  - Fetches contacts through `property_contact` junction table
  - Displays contact hierarchy: Name, Company, Title, Contact Info
  - Visual badges for Primary contacts and Deal-related contacts
  - Click-to-call and click-to-email functionality
  - Supports both work phone and mobile phone display
  - Loading states, error handling, and empty state management
  - "Add Contact" functionality ready for future implementation

#### Enhanced Property Header
- **PropertyHeader** (`src/components/property/PropertyHeader.tsx`)
  - Added contacts button (blue people icon) in property action bar
  - Removed "Contact Made" field and stage display for cleaner interface
  - Integrated with ContactsSidebar for seamless contact access

#### Database Schema Updates
- **property_contact table**: Complete junction table with Salesforce field mapping
- **Foreign Key Relationships**: Proper constraints to `contact(id)`, `property(id)`, and `user(id)`
- **Unique Constraints**: Prevents duplicate property-contact relationships
- **Indexes**: Performance optimization for property and contact lookups
- **TypeScript Integration**: Full type definitions in `database-schema.ts`

#### Key Features
1. **Many-to-Many Contact Management**: Properties can have multiple contacts (owners, tenants, property managers, etc.)
2. **Sidebar Interface**: Non-intrusive contact viewing with slide-out design
3. **Contact Hierarchy Display**: Name → Company → Title → Contact Information
4. **Multiple Phone Support**: Shows both work and mobile numbers with appropriate icons
5. **Interactive Contact Actions**: Click-to-call and click-to-email functionality
6. **Primary Contact Identification**: Visual indication of the property's main contact
7. **Deal Contact Integration**: Shows contacts associated through deal relationships
8. **Salesforce Data Integration**: Direct import from Salesforce junction table with deduplication
9. **Future-Ready Add Contact**: Interface prepared for contact creation functionality

### Property Management System
A comprehensive property management system has been implemented with streamlined property creation and detailed management workflows:

#### New Property Creation Flow
- **NewPropertyPage** (`src/components/property/NewPropertyPage.tsx`)
  - Streamlined property creation form optimized for field use
  - Dynamic financial fields based on property record type selection
  - **Shopping Center Units Management**: Complete unit tracking system for retail properties
    - Add/remove individual units with full details
    - Unit-specific fields: name, sqft, rent (USD), NNN (USD), lease expiration, notes
    - Feature checkboxes: patio, inline, end cap, end cap drive-thru, 2nd gen restaurant
    - "Create Submit" button for future site submission functionality
    - Full database integration with `property_unit` table
  - Background geocoding integration with OpenStreetMap Nominatim
  - Required field validation with soft red styling for empty fields
  - Trade area field for location context
  - Verify Location button with future feature tooltip
  - Automatic navigation to detailed property view after creation
  - **Reactive Field Updates**: Financial fields automatically update when switching property types

#### Property Management Components
- **LocationSection** (`src/components/property/LocationSection.tsx`)
  - Comprehensive address and GPS coordinate management
  - Smart coordinate display (prioritizes verified coordinates)
  - Google Maps integration with copy link functionality
  - Future feature tooltips for ZIP/County auto-population
  - Verify Location button in GPS coordinates section
  - Current location detection capability

- **PropertyInputField** (`src/components/property/PropertyInputField.tsx`)
  - Click-to-edit interface with inline editing
  - Required field validation with visual indicators
  - Customizable placeholder text for empty states
  - Support for multiline text areas
  - Keyboard navigation and accessibility features

- **PropertySelectField** (`src/components/property/PropertySelectField.tsx`)
  - Click-to-edit dropdown interface
  - Required field validation with soft red styling
  - Dynamic option loading and display
  - Consistent styling with other form fields

- **PropertyCurrencyField** (`src/components/property/PropertyCurrencyField.tsx`)
  - Specialized currency input with USD formatting
  - Displays values with 2 decimal places and comma separators
  - Click-to-edit interface with inline editing
  - Proper number handling and validation
  - Used for rent, NNN, purchase prices, and lease amounts

#### New Hooks and Services
- **usePropertyGeocoding** (`src/hooks/usePropertyGeocoding.ts`)
  - Background geocoding without blocking UI
  - OpenStreetMap Nominatim integration
  - Error handling and fallback strategies

- **usePropertyRecordTypes** (`src/hooks/usePropertyRecordTypes.ts`)
  - Fetches property record types from database
  - Caches data for performance optimization

- **geocodingService** (`src/services/geocodingService.ts`)
  - Free geocoding service using OpenStreetMap
  - Forward and reverse geocoding capabilities
  - Rate limiting and error handling

#### Enhanced Property Management
- **Property Details Page Integration**
  - Seamless transition from creation to management
  - Comprehensive property information display
  - Future feature indicators for planned functionality
  - Pin icon with current location tooltip

#### Key Features
1. **Streamlined Creation Flow**: Simple, field-optimized form for quick property entry
2. **Dynamic Form Fields**: Financial fields adapt based on property record type (land, building, retail)
3. **Shopping Center Unit Management**: Complete tenant space tracking with individual unit details
4. **Currency Formatting**: Professional USD display with 2 decimal places for all financial fields
5. **Database Schema Integration**: Full type safety with direct mapping to Supabase database tables
6. **Background Geocoding**: Non-blocking address-to-coordinates conversion
7. **Required Field Validation**: Visual feedback for incomplete required information
8. **Reactive Field Updates**: Automatic field clearing/showing when switching property types
9. **Future Feature Tooltips**: User education about planned functionality with contextual hints
10. **Responsive Design**: Mobile-friendly interface optimized for field use
11. **Trade Area Context**: Location categorization for better property organization

#### Database Schema Enhancements
- **Property Unit Integration**: Full `property_unit` table support with all fields mapped
  - Unit identification: `property_unit_name`, `property_id` relationship
  - Financial data: `rent`, `nnn` (with USD formatting)
  - Physical details: `sqft`, `lease_expiration_date`, `unit_notes`
  - Feature flags: `patio`, `inline`, `end_cap`, `end_cap_drive_thru`, `second_gen_restaurant`
  - Metadata: `created_at`, `updated_at`, `sf_id` (Salesforce integration ready)
- **Property Table Enhancements**: Added `trade_area` field for location context
- **Type Safety**: Complete TypeScript integration with database schema types

### Payment Disbursement System
A comprehensive disbursement tracking system has been implemented:

#### New Components
- **PaymentDisbursementModal** (`src/components/payments/PaymentDisbursementModal.tsx`)
  - Modal interface for managing payment disbursements
  - Progress tracking with visual indicators
  - Separate sections for referral payments and broker commissions
  - Real-time calculation of disbursed amounts and remaining balances

- **DisbursementCheckItem** (`src/components/payments/DisbursementCheckItem.tsx`)
  - Individual disbursement item component with checkbox interface
  - Visual states for paid/unpaid status
  - Accessibility support with keyboard navigation
  - Amount formatting and payee information display

#### New Hooks
- **usePaymentDisbursement** (`src/hooks/usePaymentDisbursement.ts`)
  - Database operations for updating disbursement status
  - Referral payment status tracking
  - Payment split status management
  - Disbursement calculations and validation

#### New Utilities
- **formatters** (`src/utils/formatters.ts`)
  - Currency formatting utilities
  - Percentage formatting utilities
  - Consistent number display across the application

#### Enhanced Components
- **PaymentDetails** (`src/components/payments/PaymentDetails.tsx`)
  - Added "Payment Received" checkbox that triggers disbursement modal
  - Proportional referral fee calculation and display
  - Integration with disbursement management system

- **PaymentDetailPanel** (`src/components/payments/PaymentDetailPanel.tsx`)
  - Enhanced with disbursement functionality
  - Passes commission split data to payment details
  - Handles disbursement status updates

#### Database Schema Enhancements
- Added `referral_fee_paid` field to payment table
- Added `paid` field to payment_split table
- Migration script updated to include disbursement tracking fields

#### Key Features
1. **Automatic Disbursement Generation**: When a payment is marked as received, the system automatically identifies all disbursements needed (referral fees + broker commissions)

2. **Proportional Calculations**: Referral fees are calculated proportionally based on the payment amount vs. total deal amount

3. **Visual Progress Tracking**: Progress bar and completion percentages show disbursement status at a glance

4. **Individual Item Management**: Each disbursement (referral or broker commission) can be individually marked as paid

5. **Real-time Updates**: Status changes are immediately reflected in the UI and persisted to the database

6. **Error Handling**: Comprehensive error handling with console logging for debugging

## Installation

```bash
npm install
npm run dev
```

## Database
The application uses Supabase for data persistence. Ensure your database schema includes the latest migration updates for disbursement tracking.

### Critical Files
**⚠️ IMPORTANT**: The `_master_migration_script.sql` file contains the complete database schema and essential migrations. **NEVER DELETE THIS FILE** - it is critical for database setup and contains all table structures, relationships, and data integrity constraints.