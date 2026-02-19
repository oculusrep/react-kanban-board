/**
 * Shared Site Submit Email Template Generator
 *
 * This utility generates the email template for site submit notifications.
 * Uses table-based HTML layout for professional appearance in email clients.
 * Supports user email signatures from the user_email_signature table.
 */

export interface PropertyUnitFile {
  name: string;
  sharedLink: string;
}

export interface SiteSubmitEmailData {
  siteSubmit: any;
  siteSubmitId: string; // ID of the site submit for portal deep link
  property: any;
  propertyUnit: any;
  contacts: any[];
  userData: any;
  propertyUnitFiles?: PropertyUnitFile[]; // Array of property unit files with shared links
  propertyFiles?: PropertyUnitFile[]; // Array of property-level files with shared links
  portalBaseUrl?: string; // Base URL for portal links (e.g., https://app.example.com)
  userSignatureHtml?: string; // User's saved email signature HTML
}

// Color palette for consistent styling
const COLORS = {
  primary: '#2563eb',      // Blue for headers and buttons
  primaryDark: '#1d4ed8',  // Darker blue for hover states
  headerBg: '#1e40af',     // Professional blue for section headers
  rowEven: '#ffffff',      // White for even rows
  rowOdd: '#f8fafc',       // Very light gray for odd rows
  border: '#e2e8f0',       // Light gray border
  text: '#1e293b',         // Dark text
  textMuted: '#64748b',    // Muted text
  accent: '#059669',       // Green for success/highlights
};

export function generateSiteSubmitEmailTemplate(data: SiteSubmitEmailData): string {
  const { siteSubmit, siteSubmitId, property, propertyUnit, contacts, userData, propertyUnitFiles, propertyFiles, portalBaseUrl, userSignatureHtml } = data;

  // Helper: Format currency
  const formatCurrency = (value: number | null | undefined) => {
    if (!value) return null;
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Helper: Format number with commas
  const formatNumber = (value: number | null | undefined) => {
    if (!value) return null;
    return value.toLocaleString('en-US');
  };

  // Helper: Generate map link
  const getMapLink = () => {
    if (property?.map_link) return property.map_link;
    const lat = property?.verified_latitude || property?.latitude;
    const lng = property?.verified_longitude || property?.longitude;
    return (lat && lng) ? `https://www.google.com/maps?q=${lat},${lng}` : null;
  };

  // Helper: Generate alternating row style
  const getRowStyle = (index: number) => {
    const bgColor = index % 2 === 0 ? COLORS.rowEven : COLORS.rowOdd;
    return `background-color: ${bgColor};`;
  };

  // Contact names for greeting
  const contactNames = contacts && Array.isArray(contacts)
    ? contacts.map(c => c.first_name).filter(Boolean).join(', ')
    : 'Site Selectors';

  // Property name
  const propertyName = property?.property_name || 'N/A';

  // Build address
  const address = [property?.address, property?.city, property?.state, property?.zip].filter(Boolean).join(', ');

  // Determine size info
  let sizeInfo = '';
  if (propertyUnit?.sqft) {
    sizeInfo = `${formatNumber(propertyUnit.sqft)} SF`;
  } else if (property?.available_sqft) {
    sizeInfo = `${formatNumber(property.available_sqft)} SF`;
  } else if (property?.acres) {
    sizeInfo = `${property.acres} Acres`;
    if (property?.building_sqft) {
      sizeInfo += ` (${formatNumber(property.building_sqft)} SF building)`;
    }
  }

  // Determine pricing info
  let pricingLabel = '';
  let pricingValue = '';
  if (propertyUnit?.rent) {
    pricingLabel = 'Base Rent';
    pricingValue = formatCurrency(propertyUnit.rent) || '';
  } else if (property?.rent_psf) {
    pricingLabel = 'Base Rent';
    pricingValue = formatCurrency(property.rent_psf) || '';
  } else if (property?.asking_lease_price) {
    pricingLabel = 'Ground Lease';
    pricingValue = formatCurrency(property.asking_lease_price) || '';
  } else if (property?.asking_purchase_price) {
    pricingLabel = 'Purchase Price';
    pricingValue = formatCurrency(property.asking_purchase_price) || '';
  }

  // NNN info
  let nnnValue = '';
  if (propertyUnit?.nnn) {
    nnnValue = formatCurrency(propertyUnit.nnn) || '';
  } else if (property?.nnn_psf) {
    nnnValue = formatCurrency(property.nnn_psf) || '';
  }

  // Map link
  const mapLink = getMapLink();

  // Portal link
  const portalLink = (portalBaseUrl && siteSubmitId) ? `${portalBaseUrl}/portal/map?selected=${siteSubmitId}` : null;

  // Build property details rows with zebra striping
  const propertyRowsData: { label: string; value: string }[] = [];
  propertyRowsData.push({ label: 'Property Name', value: propertyName });
  if (address) propertyRowsData.push({ label: 'Address', value: address });
  if (propertyUnit?.property_unit_name) propertyRowsData.push({ label: 'Unit', value: propertyUnit.property_unit_name });
  if (property?.trade_area) propertyRowsData.push({ label: 'Trade Area', value: property.trade_area });
  if (sizeInfo) propertyRowsData.push({ label: 'Size', value: sizeInfo });
  if (pricingValue) propertyRowsData.push({ label: pricingLabel, value: pricingValue });
  if (nnnValue) propertyRowsData.push({ label: 'NNN', value: nnnValue });
  if (siteSubmit.delivery_timeframe) propertyRowsData.push({ label: 'Delivery', value: siteSubmit.delivery_timeframe });

  const propertyRows = propertyRowsData.map((row, idx) =>
    `<tr style="${getRowStyle(idx)}">
      <td style="padding: 10px 16px; font-weight: 600; color: ${COLORS.textMuted}; width: 35%; border-bottom: 1px solid ${COLORS.border};">${row.label}</td>
      <td style="padding: 10px 16px; color: ${COLORS.text}; border-bottom: 1px solid ${COLORS.border};">${row.value}</td>
    </tr>`
  ).join('');

  // Build demographics rows with zebra striping
  const demoRowsData: { label: string; value: string }[] = [];
  if (property?.['1_mile_pop']) demoRowsData.push({ label: '1-Mile Population', value: formatNumber(property['1_mile_pop']) || '' });
  if (property?.['3_mile_pop']) demoRowsData.push({ label: '3-Mile Population', value: formatNumber(property['3_mile_pop']) || '' });
  if (property?.hh_income_median_3_mile) demoRowsData.push({ label: 'Median HH Income (3mi)', value: formatCurrency(property.hh_income_median_3_mile) || '' });
  if (property?.traffic_count) demoRowsData.push({ label: 'Traffic Count', value: formatNumber(property.traffic_count) || '' });
  if (property?.traffic_count_2nd) demoRowsData.push({ label: 'Traffic Count (2nd)', value: formatNumber(property.traffic_count_2nd) || '' });
  if (property?.total_traffic) demoRowsData.push({ label: 'Total Traffic', value: formatNumber(property.total_traffic) || '' });

  const demoRows = demoRowsData.map((row, idx) =>
    `<tr style="${getRowStyle(idx)}">
      <td style="padding: 10px 16px; font-weight: 600; color: ${COLORS.textMuted}; width: 35%; border-bottom: 1px solid ${COLORS.border};">${row.label}</td>
      <td style="padding: 10px 16px; color: ${COLORS.text}; border-bottom: 1px solid ${COLORS.border};">${row.value}</td>
    </tr>`
  ).join('');

  // Build supporting documents
  const docLinks: string[] = [];
  const hasPropertyUnitFiles = propertyUnitFiles && propertyUnitFiles.length > 0;
  const hasPropertyFiles = propertyFiles && propertyFiles.length > 0;

  if (hasPropertyFiles) {
    propertyFiles!.forEach(file => {
      docLinks.push(`<a href="${file.sharedLink}" style="color: ${COLORS.primary}; text-decoration: none; font-weight: 500;">${file.name}</a>`);
    });
  }
  if (property?.marketing_materials) {
    docLinks.push(`<a href="${property.marketing_materials}" style="color: ${COLORS.primary}; text-decoration: none; font-weight: 500;">Marketing Materials</a>`);
  }
  if (property?.site_plan) {
    docLinks.push(`<a href="${property.site_plan}" style="color: ${COLORS.primary}; text-decoration: none; font-weight: 500;">Site Plan</a>`);
  }
  if (property?.demographics) {
    docLinks.push(`<a href="${property.demographics}" style="color: ${COLORS.primary}; text-decoration: none; font-weight: 500;">Demographics Report</a>`);
  }
  if (hasPropertyUnitFiles) {
    propertyUnitFiles!.forEach(file => {
      docLinks.push(`<a href="${file.sharedLink}" style="color: ${COLORS.primary}; text-decoration: none; font-weight: 500;">${file.name}</a>`);
    });
  }

  // Button style for CTA buttons
  const buttonStyle = `
    display: inline-block;
    padding: 10px 20px;
    background-color: ${COLORS.primary};
    color: white;
    text-decoration: none;
    border-radius: 6px;
    font-weight: 600;
    font-size: 14px;
    margin-right: 12px;
    margin-bottom: 8px;
  `;

  // Section header style
  const sectionHeaderStyle = `
    padding: 12px 16px;
    background: linear-gradient(135deg, ${COLORS.headerBg} 0%, ${COLORS.primary} 100%);
    color: white;
    font-weight: 700;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-radius: 6px 6px 0 0;
  `;

  // Table wrapper style
  const tableWrapperStyle = `
    border: 1px solid ${COLORS.border};
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: 24px;
  `;

  // Start building email
  let emailHtml = '';

  // Greeting
  emailHtml += `<p style="font-size: 15px; color: ${COLORS.text}; margin-bottom: 8px;">${contactNames},</p>`;
  emailHtml += `<p style="font-size: 15px; color: ${COLORS.text}; margin-bottom: 24px;">Please find below a new site for your review. Your feedback is appreciated.</p>`;

  // Property Header Banner
  emailHtml += `
    <table style="width: 100%; margin-bottom: 24px;" cellpadding="0" cellspacing="0">
      <tr>
        <td style="background: linear-gradient(135deg, ${COLORS.headerBg} 0%, ${COLORS.primary} 100%); padding: 20px 24px; border-radius: 8px;">
          <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: white;">${propertyName}</h1>
          ${address ? `<p style="margin: 6px 0 0 0; font-size: 14px; color: rgba(255,255,255,0.85);">${address}</p>` : ''}
        </td>
      </tr>
    </table>
  `;

  // Quick Action Buttons
  if (mapLink || portalLink) {
    emailHtml += `<table style="width: 100%; margin-bottom: 24px;" cellpadding="0" cellspacing="0"><tr><td>`;
    if (mapLink) {
      emailHtml += `<a href="${mapLink}" style="${buttonStyle}">📍 View on Map</a>`;
    }
    if (portalLink) {
      emailHtml += `<a href="${portalLink}" style="${buttonStyle}">🌐 View in Portal</a>`;
    }
    emailHtml += `</td></tr></table>`;
  }

  // Property Details Table
  emailHtml += `<table style="${tableWrapperStyle} width: 100%; border-collapse: collapse;" cellpadding="0" cellspacing="0">`;
  emailHtml += `<tr><td colspan="2" style="${sectionHeaderStyle}">Property Details</td></tr>`;
  emailHtml += propertyRows;
  emailHtml += `</table>`;

  // Demographics Table (if data exists)
  if (demoRowsData.length > 0) {
    emailHtml += `<table style="${tableWrapperStyle} width: 100%; border-collapse: collapse;" cellpadding="0" cellspacing="0">`;
    emailHtml += `<tr><td colspan="2" style="${sectionHeaderStyle}">Location & Demographics</td></tr>`;
    emailHtml += demoRows;
    emailHtml += `</table>`;
  }

  // Supporting Documents
  if (docLinks.length > 0) {
    emailHtml += `<table style="${tableWrapperStyle} width: 100%; border-collapse: collapse;" cellpadding="0" cellspacing="0">`;
    emailHtml += `<tr><td style="${sectionHeaderStyle}">Supporting Documents</td></tr>`;
    emailHtml += `<tr><td style="padding: 16px; background-color: ${COLORS.rowEven}; line-height: 2;">`;
    docLinks.forEach((link, idx) => {
      emailHtml += `<span style="display: inline-block; margin-right: 8px;">📄</span>${link}`;
      if (idx < docLinks.length - 1) emailHtml += `<br>`;
    });
    emailHtml += `</td></tr></table>`;
  }

  // Site Notes
  if (siteSubmit.notes) {
    emailHtml += `<table style="${tableWrapperStyle} width: 100%; border-collapse: collapse;" cellpadding="0" cellspacing="0">`;
    emailHtml += `<tr><td style="${sectionHeaderStyle}">Site Notes</td></tr>`;
    emailHtml += `<tr><td style="padding: 16px; background-color: ${COLORS.rowEven}; color: ${COLORS.text}; line-height: 1.6;">${siteSubmit.notes.replace(/\n/g, '<br>')}</td></tr>`;
    emailHtml += `</table>`;
  }

  // Competitor Data
  if (siteSubmit.competitor_data) {
    emailHtml += `<table style="${tableWrapperStyle} width: 100%; border-collapse: collapse;" cellpadding="0" cellspacing="0">`;
    emailHtml += `<tr><td style="${sectionHeaderStyle}">Competitor Information</td></tr>`;
    emailHtml += `<tr><td style="padding: 16px; background-color: ${COLORS.rowEven}; color: ${COLORS.text}; line-height: 1.6;">${siteSubmit.competitor_data.replace(/\n/g, '<br>')}</td></tr>`;
    emailHtml += `</table>`;
  }

  // Divider before closing
  emailHtml += `<hr style="border: none; border-top: 1px solid ${COLORS.border}; margin: 32px 0;">`;

  // Closing message
  emailHtml += `<p style="font-size: 15px; color: ${COLORS.text}; margin-bottom: 8px;">If this property is a pass, please reply with a brief reason. If you need more information or want to discuss further, let me know.</p>`;
  emailHtml += `<p style="font-size: 15px; color: ${COLORS.text}; margin-bottom: 24px;">Thanks!</p>`;

  // Signature
  if (userSignatureHtml) {
    emailHtml += userSignatureHtml;
  } else {
    // Fallback signature using userData
    emailHtml += `<p style="font-size: 14px; color: ${COLORS.text};"><strong>${userData?.first_name || ''} ${userData?.last_name || ''}</strong><br>`;
    emailHtml += `<span style="color: ${COLORS.textMuted};">${userData?.email || ''}</span>`;
    if (userData?.mobile_phone) {
      emailHtml += `<br><span style="color: ${COLORS.textMuted};">M: ${userData.mobile_phone}</span>`;
    }
    emailHtml += `</p>`;
  }

  return emailHtml;
}
