import ExcelJS from 'exceljs';

// Oculus logo as base64 - will be loaded dynamically
let cachedLogoBase64: string | null = null;

async function getLogoBase64(): Promise<string | null> {
  if (cachedLogoBase64) return cachedLogoBase64;

  try {
    // Load the logo from the public Images folder
    const response = await fetch('/Images/Oculus_02-Long.jpg');
    if (!response.ok) return null;

    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        // Remove the data URL prefix to get just the base64 data
        cachedLogoBase64 = base64.split(',')[1] || null;
        resolve(cachedLogoBase64);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export interface ExcelColumn {
  header: string;
  key: string;
  width?: number;
  style?: Partial<ExcelJS.Style>;
  isHyperlink?: boolean;  // If true, values will be rendered as clickable hyperlinks
  hyperlinkText?: string; // Optional display text for hyperlinks (e.g., "View Map")
}

export interface ExcelExportOptions {
  filename: string;
  sheetName?: string;
  columns: ExcelColumn[];
  data: Record<string, any>[];
  headerStyle?: Partial<ExcelJS.Style>;
  title?: string;
  subtitle?: string;
  logoBase64?: string;  // Base64 encoded logo image
}

// ============================================
// Oculus Real Estate Partners Brand Colors
// ============================================
// Deep Midnight Blue: #002147 - Primary header/text color
// Steel Blue Gradient: #4A6B94 - Mid-tone accent
// Light Slate Blue:    #8FA9C8 - Light accent/borders
// Pure White:          #FFFFFF - Background
// ============================================

// Default header style - Oculus Deep Midnight Blue
const defaultHeaderStyle: Partial<ExcelJS.Style> = {
  font: {
    name: 'Calibri',
    bold: true,
    color: { argb: 'FFFFFFFF' },
    size: 11,
  },
  fill: {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF002147' }, // Deep Midnight Blue
  },
  alignment: {
    vertical: 'middle',
    horizontal: 'center',
    wrapText: true,
  },
  border: {
    top: { style: 'thin', color: { argb: 'FF4A6B94' } },    // Steel Blue
    left: { style: 'thin', color: { argb: 'FF4A6B94' } },
    bottom: { style: 'thin', color: { argb: 'FF4A6B94' } },
    right: { style: 'thin', color: { argb: 'FF4A6B94' } },
  },
};

// Alternating row styles - subtle, clean design
const evenRowFill: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF7F9FC' }, // Very light blue-gray tint
};

const oddRowFill: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFFFFFF' }, // Pure White
};

// Subtle borders using Light Slate Blue
const dataCellBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFD0DBE8' } },    // Lighter than Light Slate Blue
  left: { style: 'thin', color: { argb: 'FFD0DBE8' } },
  bottom: { style: 'thin', color: { argb: 'FFD0DBE8' } },
  right: { style: 'thin', color: { argb: 'FFD0DBE8' } },
};

export async function exportToExcel(options: ExcelExportOptions): Promise<void> {
  const {
    filename,
    sheetName = 'Sheet1',
    columns,
    data,
    headerStyle = defaultHeaderStyle,
    title,
    subtitle,
    logoBase64,
  } = options;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'OVIS';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(sheetName);

  // Set column widths first (without headers - we'll add headers manually later)
  columns.forEach((col, index) => {
    worksheet.getColumn(index + 1).width = col.width || 15;
  });

  let currentRow = 1;

  // Row 1: Logo + Title on same row (white background, centered title)
  if (logoBase64 || title) {
    // Merge cells for the title area (leave space for logo on left)
    worksheet.mergeCells(1, 1, 1, columns.length);

    // Add logo if provided (96px height = 20% larger than 80px)
    if (logoBase64) {
      const imageId = workbook.addImage({
        base64: logoBase64,
        extension: 'jpeg',
      });
      // Logo original dimensions: 2364x789, target height: 96px (20% larger)
      // Aspect ratio: 2364/789 = 2.996, so width = 96 * 3 = 288px approx
      worksheet.addImage(imageId, {
        tl: { col: 0, row: 0 },
        ext: { width: 288, height: 96 },
      });
    }

    // Add title in the merged cell, centered
    if (title) {
      const titleCell = worksheet.getCell(1, 1);
      titleCell.value = title;
      titleCell.font = { name: 'Calibri', bold: true, size: 16, color: { argb: 'FF002147' } }; // Deep Midnight Blue
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }; // White background
    }

    // Set row height to accommodate logo (96px ≈ 72 Excel row height)
    worksheet.getRow(1).height = 72;
    currentRow = 2;
  }

  // Row 2: Filter info (subtitle) - only if filters are applied
  if (subtitle) {
    worksheet.mergeCells(currentRow, 1, currentRow, columns.length);
    const subtitleCell = worksheet.getCell(currentRow, 1);
    subtitleCell.value = subtitle;
    subtitleCell.font = { name: 'Calibri', size: 11, color: { argb: 'FF4A6B94' } }; // Steel Blue
    subtitleCell.alignment = { horizontal: 'left', vertical: 'middle' };
    subtitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }; // White background
    worksheet.getRow(currentRow).height = 18;
    currentRow += 1;
  }

  // Next row: Generated date and record count
  worksheet.mergeCells(currentRow, 1, currentRow, columns.length);
  const metaCell = worksheet.getCell(currentRow, 1);
  metaCell.value = `${data.length} records • Generated ${new Date().toLocaleDateString()}`;
  metaCell.font = { name: 'Calibri', size: 11, color: { argb: 'FF4A6B94' } }; // Steel Blue
  metaCell.alignment = { horizontal: 'left', vertical: 'middle' };
  metaCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }; // White background
  worksheet.getRow(currentRow).height = 18;
  currentRow += 1;

  // Now add the header row
  const headerRowNum = currentRow;
  const headerRow = worksheet.getRow(headerRowNum);
  columns.forEach((col, index) => {
    headerRow.getCell(index + 1).value = col.header;
  });

  // Style header row
  headerRow.height = 24;
  headerRow.eachCell((cell, colNumber) => {
    Object.assign(cell, { style: { ...headerStyle } });
    // Ensure font and fill are applied correctly
    cell.font = headerStyle.font as ExcelJS.Font;
    cell.fill = headerStyle.fill as ExcelJS.Fill;
    cell.alignment = headerStyle.alignment as Partial<ExcelJS.Alignment>;
    cell.border = headerStyle.border as Partial<ExcelJS.Borders>;
  });

  // Add data rows starting after header
  const dataStartRow = headerRowNum + 1;
  data.forEach((rowData, rowIndex) => {
    const row = worksheet.getRow(dataStartRow + rowIndex);

    columns.forEach((col, colIndex) => {
      const cell = row.getCell(colIndex + 1);
      let value = rowData[col.key];

      // Handle hyperlinks (Steel Blue for links - brand consistent)
      if (col.isHyperlink && value && typeof value === 'string' && value.startsWith('http')) {
        cell.value = {
          text: col.hyperlinkText || value,
          hyperlink: value,
        };
        cell.font = {
          name: 'Calibri',
          color: { argb: 'FF4A6B94' },  // Steel Blue - brand color
          underline: true,
        };
      }
      // Handle date formatting
      else if (value instanceof Date) {
        cell.value = value;
        cell.numFmt = 'mm/dd/yyyy';
      } else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
        // ISO date string - convert to date
        cell.value = new Date(value);
        cell.numFmt = 'mm/dd/yyyy';
      } else {
        cell.value = value ?? '';
      }

      // Apply styling - consistent Calibri font throughout
      cell.fill = rowIndex % 2 === 0 ? evenRowFill : oddRowFill;
      cell.border = dataCellBorder;
      cell.alignment = {
        vertical: 'top',
        horizontal: col.style?.alignment?.horizontal || 'left',
        wrapText: true,
      };
      // Set font if not already set (hyperlinks have their own font)
      if (!col.isHyperlink || !value || typeof value !== 'string' || !value.startsWith('http')) {
        cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF002147' } }; // Deep Midnight Blue text
      }
    });

    // Calculate row height based on content (especially for Notes column)
    // Find the longest text content and estimate lines needed
    let maxLines = 1;
    columns.forEach((col, colIndex) => {
      const value = rowData[col.key];
      if (typeof value === 'string' && value.length > 0) {
        const colWidth = col.width || 15;
        // Estimate characters per line based on column width (approx 1.2 chars per width unit)
        const charsPerLine = Math.floor(colWidth * 1.2);
        const estimatedLines = Math.ceil(value.length / charsPerLine);
        maxLines = Math.max(maxLines, estimatedLines);
      }
    });
    // Each line is approximately 15px, minimum row height is 20px
    row.height = Math.max(20, Math.min(maxLines * 15, 200));
  });

  // Auto-filter on header row
  worksheet.autoFilter = {
    from: { row: headerRowNum, column: 1 },
    to: { row: headerRowNum, column: columns.length },
  };

  // Freeze rows above data (header row and above)
  worksheet.views = [{ state: 'frozen', ySplit: headerRowNum }];

  // Generate and download the file
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}

export interface ClientSubmitReportFilters {
  clientName?: string;
  stages?: string[];
  city?: string;
  quickFilter?: string;
}

// Convenience function for Client Submit Report export
export async function exportClientSubmitReport(
  data: {
    property_name: string | null;
    city: string | null;
    map_link: string | null;
    latitude: number | null;
    longitude: number | null;
    submit_stage_name: string | null;
    date_submitted: string | null;
    loi_date: string | null;
    notes: string | null;
    client_name?: string | null;
  }[],
  filters?: ClientSubmitReportFilters
): Promise<void> {
  const columns: ExcelColumn[] = [
    { header: 'Property Name', key: 'property_name', width: 35 },
    { header: 'City', key: 'city', width: 18 },
    { header: 'Map', key: 'map_link', width: 12, isHyperlink: true, hyperlinkText: 'View Map', style: { alignment: { horizontal: 'center' } } },
    { header: 'Latitude', key: 'latitude', width: 14, style: { alignment: { horizontal: 'right' } } },      // Widened for filter arrow
    { header: 'Longitude', key: 'longitude', width: 14, style: { alignment: { horizontal: 'right' } } },    // Widened for filter arrow
    { header: 'Submit Stage', key: 'submit_stage_name', width: 18 },
    { header: 'Date Submitted', key: 'date_submitted', width: 16, style: { alignment: { horizontal: 'center' } } },  // Widened for filter arrow
    { header: 'LOI Date', key: 'loi_date', width: 14, style: { alignment: { horizontal: 'center' } } },     // Widened for filter arrow
    { header: 'Notes', key: 'notes', width: 50 },
  ];

  // Format data for export
  const exportData = data.map(row => ({
    property_name: row.property_name || '',
    city: row.city || '',
    map_link: row.map_link || '',
    latitude: row.latitude?.toFixed(5) || '',
    longitude: row.longitude?.toFixed(5) || '',
    submit_stage_name: row.submit_stage_name || '',
    date_submitted: row.date_submitted || '',
    loi_date: row.loi_date || '',
    notes: row.notes || '',
  }));

  const clientName = filters?.clientName;
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = clientName
    ? `${clientName.replace(/[^a-zA-Z0-9]/g, '_')}_Site_Submits_${dateStr}.xlsx`
    : `Client_Submit_Report_${dateStr}.xlsx`;

  // Build filter description for subtitle
  const filterParts: string[] = [];
  if (filters?.stages && filters.stages.length > 0) {
    filterParts.push(`Stages: ${filters.stages.join(', ')}`);
  }
  if (filters?.city) {
    filterParts.push(`City: ${filters.city}`);
  }
  if (filters?.quickFilter && filters.quickFilter !== 'all') {
    const quickFilterLabels: Record<string, string> = {
      'has_loi': 'Has LOI',
      'no_loi': 'No LOI',
      'submitted_this_month': 'Submitted This Month',
      'submitted_this_quarter': 'Submitted This Quarter',
    };
    filterParts.push(quickFilterLabels[filters.quickFilter] || filters.quickFilter);
  }

  // Only show filter info if there are filters (record count is shown separately)
  const filterDescription = filterParts.length > 0
    ? `Filtered by: ${filterParts.join(' | ')}`
    : undefined;

  // Load the logo
  const logoBase64 = await getLogoBase64();

  await exportToExcel({
    filename,
    sheetName: 'Site Submits',
    columns,
    data: exportData,
    title: `Site Submit Report for: ${clientName || 'All Clients'}`,
    subtitle: filterDescription,
    logoBase64: logoBase64 || undefined,
  });
}
