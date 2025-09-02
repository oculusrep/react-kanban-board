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

### Payment Disbursement System (Latest)
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