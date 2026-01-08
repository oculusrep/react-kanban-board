# Excel Export System Documentation

## Overview

OVIS uses the ExcelJS library to generate professional, branded Excel reports. This document describes the standard export format, brand styling, and implementation details for creating consistent reports across the application.

## Library

- **Package**: `exceljs`
- **Location**: `src/lib/excelExport.ts`

## Brand Colors (Oculus Real Estate Partners)

All exports use the official Oculus brand palette:

| Color Name | Hex Code | ARGB (Excel) | Usage |
|------------|----------|--------------|-------|
| Deep Midnight Blue | `#002147` | `FF002147` | Primary header background, text color |
| Steel Blue Gradient | `#4A6B94` | `FF4A6B94` | Mid-tone accent, borders, hyperlinks |
| Light Slate Blue | `#8FA9C8` | `FF8FA9C8` | Light accent |
| Data Cell Border | `#D0DBE8` | `FFD0DBE8` | Subtle data cell borders |
| Very Light Blue-Gray | `#F7F9FC` | `FFF7F9FC` | Alternating row fill (even rows) |
| Pure White | `#FFFFFF` | `FFFFFFFF` | Background, alternating rows (odd) |

## Standard Report Layout

### Row Structure

1. **Row 1: Logo + Title**
   - Logo: Oculus logo in top-left corner (288px width x 96px height)
   - Title: Centered, Calibri 16pt bold, Deep Midnight Blue text
   - Background: White
   - Row height: 72 (accommodates 96px logo)

2. **Row 2: Filter Info (optional)**
   - Only displayed when filters are applied
   - Format: `Filtered by: Stage1, Stage2 | City: Austin | Has LOI`
   - Font: Calibri 11pt, Steel Blue
   - Left-aligned

3. **Row 3: Metadata**
   - Format: `{count} records - Generated {date}`
   - Font: Calibri 11pt, Steel Blue
   - Left-aligned

4. **Row 4: Column Headers**
   - Background: Deep Midnight Blue (`#002147`)
   - Text: White, Calibri 11pt bold, centered
   - Border: Steel Blue thin borders
   - Row height: 24
   - Auto-filter enabled

5. **Row 5+: Data Rows**
   - Alternating row colors (white/light blue-gray)
   - Text: Calibri 10pt, Deep Midnight Blue
   - Auto-adjusting row heights based on content
   - Hyperlinks: Steel Blue with underline

### Features

- **Frozen Header Row**: Header row stays visible when scrolling
- **Auto-Filter**: Excel filter dropdowns on all column headers
- **Dynamic Row Heights**: Rows auto-size based on longest text content (especially Notes)
- **Hyperlink Support**: Columns can be marked as hyperlinks with custom display text
- **Date Formatting**: ISO dates auto-converted to `mm/dd/yyyy` format

## Implementation

### Core Export Function

```typescript
import { exportToExcel, ExcelColumn, ExcelExportOptions } from '../lib/excelExport';

const columns: ExcelColumn[] = [
  { header: 'Property Name', key: 'property_name', width: 35 },
  { header: 'City', key: 'city', width: 18 },
  { header: 'Map', key: 'map_link', width: 12, isHyperlink: true, hyperlinkText: 'View Map' },
  { header: 'Date', key: 'date_submitted', width: 16, style: { alignment: { horizontal: 'center' } } },
  { header: 'Notes', key: 'notes', width: 50 },
];

await exportToExcel({
  filename: 'Report_2025-01-08.xlsx',
  sheetName: 'Data',
  columns,
  data: arrayOfObjects,
  title: 'Report Title',
  subtitle: 'Filtered by: Some Filter',  // optional
  logoBase64: logoBase64String,           // optional, auto-loaded if omitted
});
```

### ExcelColumn Interface

```typescript
interface ExcelColumn {
  header: string;           // Column header text
  key: string;              // Key in data object
  width?: number;           // Column width (default: 15)
  style?: {
    alignment?: {
      horizontal?: 'left' | 'center' | 'right';
    };
  };
  isHyperlink?: boolean;    // Render as clickable link
  hyperlinkText?: string;   // Display text for hyperlinks (e.g., "View Map")
}
```

### ExcelExportOptions Interface

```typescript
interface ExcelExportOptions {
  filename: string;
  sheetName?: string;       // Default: 'Sheet1'
  columns: ExcelColumn[];
  data: Record<string, any>[];
  headerStyle?: Partial<ExcelJS.Style>;  // Override default header style
  title?: string;
  subtitle?: string;
  logoBase64?: string;
}
```

## Convenience Export Functions

### Client Submit Report

```typescript
import { exportClientSubmitReport, ClientSubmitReportFilters } from '../lib/excelExport';

await exportClientSubmitReport(data, {
  clientName: 'Starbucks',
  stages: ['LOI', 'Submitted-Reviewing'],
  city: 'Austin',
  quickFilter: 'has_loi',
});
```

**Columns**: Property Name, City, Map (hyperlink), Latitude, Longitude, Submit Stage, Date Submitted, LOI Date, Notes

**Filename Format**: `{ClientName}_Site_Submits_{YYYY-MM-DD}.xlsx` or `Client_Submit_Report_{YYYY-MM-DD}.xlsx`

## Creating New Report Exports

When creating a new report export function, follow this pattern:

```typescript
export async function exportMyReport(
  data: MyDataType[],
  filters?: MyReportFilters
): Promise<void> {
  // 1. Define columns
  const columns: ExcelColumn[] = [
    { header: 'Column 1', key: 'field1', width: 20 },
    { header: 'Column 2', key: 'field2', width: 15 },
    // ... more columns
  ];

  // 2. Format data for export (handle nulls, format values)
  const exportData = data.map(row => ({
    field1: row.field1 || '',
    field2: row.field2?.toFixed(2) || '',
  }));

  // 3. Build filter description for subtitle
  const filterParts: string[] = [];
  if (filters?.someFilter) {
    filterParts.push(`Filter: ${filters.someFilter}`);
  }
  const filterDescription = filterParts.length > 0
    ? `Filtered by: ${filterParts.join(' | ')}`
    : undefined;

  // 4. Generate filename
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `My_Report_${dateStr}.xlsx`;

  // 5. Load logo
  const logoBase64 = await getLogoBase64();

  // 6. Export
  await exportToExcel({
    filename,
    sheetName: 'Report Data',
    columns,
    data: exportData,
    title: 'My Report Title',
    subtitle: filterDescription,
    logoBase64: logoBase64 || undefined,
  });
}
```

## Logo

- **File**: `/public/Images/Oculus_02-Long.jpg`
- **Original Dimensions**: 2364 x 789 pixels
- **Export Size**: 288px width x 96px height (maintains aspect ratio)
- **Loading**: Auto-loaded and cached via `getLogoBase64()` function

## Custom Sort Orders

For reports with specific sort requirements (like Submit Stage), implement custom sort logic in the page component before passing data to the export function. See `SiteSubmitDashboardPage.tsx` for the Submit Stage custom sort order:

```typescript
const submitStageSortOrder = [
  'LOI',
  'Submitted-Reviewing',
  'Pursuing Ownership',
  'Pass',
  'Use Conflict',
  'Use Declined',
  'Not Available',
  'Lost/Killed',
  'Under Contract/Contingent',
  'Store Opened',
];
```

## Session Summary (January 8, 2026)

### Changes Made

1. **Implemented ExcelJS Library**
   - Added professional Excel export with brand styling
   - Replaced basic CSV exports with formatted Excel files

2. **Brand Styling**
   - Applied Oculus Real Estate Partners color palette
   - Deep Midnight Blue headers, Steel Blue accents
   - Alternating row colors for readability
   - Consistent Calibri font throughout

3. **Layout Improvements**
   - Logo + title on same row (row 1)
   - Filter info on row 2 (only when filters applied)
   - Record count and generated date on row 3
   - Column headers on row 4 with auto-filter

4. **Column Width Adjustments**
   - Widened Latitude, Longitude, Date Submitted, LOI Date columns
   - Ensures filter arrows don't obscure header text

5. **Custom Sort Order**
   - Implemented business-priority sort for Submit Stage column
   - LOI first, Store Opened last, others in between
   - Alphabetical for any stages not in the defined list

### Files Modified

- `src/lib/excelExport.ts` - Core export utility
- `src/pages/SiteSubmitDashboardPage.tsx` - Submit Stage custom sort, Excel export integration
