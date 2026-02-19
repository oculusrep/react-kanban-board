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

  // Build property details rows
  const propertyRows: string[] = [];
  propertyRows.push(`<tr><td style="padding: 6px 12px; font-weight: bold; color: #374151; width: 40%;">Property Name</td><td style="padding: 6px 12px; color: #111827;">${propertyName}</td></tr>`);

  if (address) {
    propertyRows.push(`<tr><td style="padding: 6px 12px; font-weight: bold; color: #374151;">Address</td><td style="padding: 6px 12px; color: #111827;">${address}</td></tr>`);
  }

  if (propertyUnit?.property_unit_name) {
    propertyRows.push(`<tr><td style="padding: 6px 12px; font-weight: bold; color: #374151;">Unit</td><td style="padding: 6px 12px; color: #111827;">${propertyUnit.property_unit_name}</td></tr>`);
  }

  if (property?.trade_area) {
    propertyRows.push(`<tr><td style="padding: 6px 12px; font-weight: bold; color: #374151;">Trade Area</td><td style="padding: 6px 12px; color: #111827;">${property.trade_area}</td></tr>`);
  }

  if (sizeInfo) {
    propertyRows.push(`<tr><td style="padding: 6px 12px; font-weight: bold; color: #374151;">Size</td><td style="padding: 6px 12px; color: #111827;">${sizeInfo}</td></tr>`);
  }

  if (pricingValue) {
    propertyRows.push(`<tr><td style="padding: 6px 12px; font-weight: bold; color: #374151;">${pricingLabel}</td><td style="padding: 6px 12px; color: #111827;">${pricingValue}</td></tr>`);
  }

  if (nnnValue) {
    propertyRows.push(`<tr><td style="padding: 6px 12px; font-weight: bold; color: #374151;">NNN</td><td style="padding: 6px 12px; color: #111827;">${nnnValue}</td></tr>`);
  }

  if (siteSubmit.delivery_timeframe) {
    propertyRows.push(`<tr><td style="padding: 6px 12px; font-weight: bold; color: #374151;">Delivery</td><td style="padding: 6px 12px; color: #111827;">${siteSubmit.delivery_timeframe}</td></tr>`);
  }

  // Build demographics rows
  const demoRows: string[] = [];
  if (property?.['1_mile_pop']) {
    demoRows.push(`<tr><td style="padding: 6px 12px; font-weight: bold; color: #374151; width: 40%;">1-Mile Population</td><td style="padding: 6px 12px; color: #111827;">${formatNumber(property['1_mile_pop'])}</td></tr>`);
  }
  if (property?.['3_mile_pop']) {
    demoRows.push(`<tr><td style="padding: 6px 12px; font-weight: bold; color: #374151;">3-Mile Population</td><td style="padding: 6px 12px; color: #111827;">${formatNumber(property['3_mile_pop'])}</td></tr>`);
  }
  if (property?.hh_income_median_3_mile) {
    demoRows.push(`<tr><td style="padding: 6px 12px; font-weight: bold; color: #374151;">Median HH Income (3mi)</td><td style="padding: 6px 12px; color: #111827;">${formatCurrency(property.hh_income_median_3_mile)}</td></tr>`);
  }
  if (property?.traffic_count) {
    demoRows.push(`<tr><td style="padding: 6px 12px; font-weight: bold; color: #374151;">Traffic Count</td><td style="padding: 6px 12px; color: #111827;">${formatNumber(property.traffic_count)}</td></tr>`);
  }
  if (property?.traffic_count_2nd) {
    demoRows.push(`<tr><td style="padding: 6px 12px; font-weight: bold; color: #374151;">Traffic Count (2nd)</td><td style="padding: 6px 12px; color: #111827;">${formatNumber(property.traffic_count_2nd)}</td></tr>`);
  }
  if (property?.total_traffic) {
    demoRows.push(`<tr><td style="padding: 6px 12px; font-weight: bold; color: #374151;">Total Traffic</td><td style="padding: 6px 12px; color: #111827;">${formatNumber(property.total_traffic)}</td></tr>`);
  }

  // Build links
  const linkItems: string[] = [];
  if (mapLink) {
    linkItems.push(`<a href="${mapLink}" style="color: #2563eb; text-decoration: underline;">View on Map</a>`);
  }
  if (portalLink) {
    linkItems.push(`<a href="${portalLink}" style="color: #2563eb; text-decoration: underline;">View in Portal</a>`);
  }

  // Build supporting documents
  const docLinks: string[] = [];
  const hasPropertyUnitFiles = propertyUnitFiles && propertyUnitFiles.length > 0;
  const hasPropertyFiles = propertyFiles && propertyFiles.length > 0;

  if (hasPropertyFiles) {
    propertyFiles!.forEach(file => {
      docLinks.push(`<a href="${file.sharedLink}" style="color: #2563eb; text-decoration: underline;">${file.name}</a>`);
    });
  }
  if (property?.marketing_materials) {
    docLinks.push(`<a href="${property.marketing_materials}" style="color: #2563eb; text-decoration: underline;">Marketing Materials</a>`);
  }
  if (property?.site_plan) {
    docLinks.push(`<a href="${property.site_plan}" style="color: #2563eb; text-decoration: underline;">Site Plan</a>`);
  }
  if (property?.demographics) {
    docLinks.push(`<a href="${property.demographics}" style="color: #2563eb; text-decoration: underline;">Demographics Report</a>`);
  }
  if (hasPropertyUnitFiles) {
    propertyUnitFiles!.forEach(file => {
      docLinks.push(`<a href="${file.sharedLink}" style="color: #2563eb; text-decoration: underline;">${file.name}</a>`);
    });
  }

  // Start building email
  let emailHtml = `<p>${contactNames},</p>`;
  emailHtml += `<p>Please find below a new site for your review. Your feedback is appreciated.</p>`;
  emailHtml += `<br>`;

  // Property Details Table
  emailHtml += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">`;
  emailHtml += `<tr><td colspan="2" style="padding: 10px 12px; background-color: #1f2937; color: white; font-weight: bold; font-size: 14px;">PROPERTY DETAILS</td></tr>`;
  emailHtml += propertyRows.join('');
  emailHtml += `</table>`;

  // Quick Links
  if (linkItems.length > 0) {
    emailHtml += `<p><strong>Quick Links:</strong> ${linkItems.join(' | ')}</p>`;
    emailHtml += `<br>`;
  }

  // Demographics Table (if data exists)
  if (demoRows.length > 0) {
    emailHtml += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">`;
    emailHtml += `<tr><td colspan="2" style="padding: 10px 12px; background-color: #1f2937; color: white; font-weight: bold; font-size: 14px;">LOCATION & DEMOGRAPHICS</td></tr>`;
    emailHtml += demoRows.join('');
    emailHtml += `</table>`;
    emailHtml += `<br>`;
  }

  // Supporting Documents
  if (docLinks.length > 0) {
    emailHtml += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">`;
    emailHtml += `<tr><td style="padding: 10px 12px; background-color: #1f2937; color: white; font-weight: bold; font-size: 14px;">SUPPORTING DOCUMENTS</td></tr>`;
    emailHtml += `<tr><td style="padding: 12px; line-height: 1.8;">${docLinks.join('<br>')}</td></tr>`;
    emailHtml += `</table>`;
    emailHtml += `<br>`;
  }

  // Site Notes
  if (siteSubmit.notes) {
    emailHtml += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">`;
    emailHtml += `<tr><td style="padding: 10px 12px; background-color: #1f2937; color: white; font-weight: bold; font-size: 14px;">SITE NOTES</td></tr>`;
    emailHtml += `<tr><td style="padding: 12px; color: #111827;">${siteSubmit.notes.replace(/\n/g, '<br>')}</td></tr>`;
    emailHtml += `</table>`;
  }

  // Competitor Data
  if (siteSubmit.competitor_data) {
    emailHtml += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">`;
    emailHtml += `<tr><td style="padding: 10px 12px; background-color: #1f2937; color: white; font-weight: bold; font-size: 14px;">COMPETITOR INFORMATION</td></tr>`;
    emailHtml += `<tr><td style="padding: 12px; color: #111827;">${siteSubmit.competitor_data.replace(/\n/g, '<br>')}</td></tr>`;
    emailHtml += `</table>`;
  }

  // Closing message
  emailHtml += `<p>If this property is a pass, please reply with a brief reason. If you need more information or want to discuss further, let me know.</p>`;
  emailHtml += `<p>Thanks!</p>`;
  emailHtml += `<br>`;

  // Signature
  if (userSignatureHtml) {
    emailHtml += userSignatureHtml;
  } else {
    // Fallback signature using userData
    emailHtml += `<p><strong>${userData?.first_name || ''} ${userData?.last_name || ''}</strong><br>`;
    emailHtml += `${userData?.email || ''}`;
    if (userData?.mobile_phone) {
      emailHtml += `<br>M: ${userData.mobile_phone}`;
    }
    emailHtml += `</p>`;
  }

  return emailHtml;
}
