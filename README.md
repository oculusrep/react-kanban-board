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

### Property Management System (Latest)
A comprehensive property management system has been implemented with streamlined property creation and detailed management workflows:

#### New Property Creation Flow
- **NewPropertyPage** (`src/components/property/NewPropertyPage.tsx`)
  - Streamlined property creation form optimized for field use
  - Dynamic financial fields based on property record type selection
  - Background geocoding integration with OpenStreetMap Nominatim
  - Required field validation with soft red styling for empty fields
  - Trade area field for location context
  - Verify Location button with future feature tooltip
  - Automatic navigation to detailed property view after creation

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
3. **Background Geocoding**: Non-blocking address-to-coordinates conversion
4. **Required Field Validation**: Visual feedback for incomplete required information
5. **Future Feature Tooltips**: User education about planned functionality
6. **Responsive Design**: Mobile-friendly interface for field use
7. **Trade Area Context**: Location categorization for better property organization

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