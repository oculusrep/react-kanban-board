/**
 * Shared Site Submit Email Template Generator
 *
 * This utility generates the email template for site submit notifications.
 * Uses a clean table-based layout for professional appearance across email clients.
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

// Common styles for email compatibility
const styles = {
  table: 'border-collapse: collapse; width: 100%; max-width: 600px; font-family: Arial, Helvetica, sans-serif;',
  headerCell: 'background-color: #f8f9fa; padding: 8px 12px; text-align: left; font-weight: 600; color: #374151; border: 1px solid #e5e7eb; width: 160px; font-size: 14px;',
  valueCell: 'padding: 8px 12px; color: #1f2937; border: 1px solid #e5e7eb; font-size: 14px;',
  sectionHeader: 'background-color: #1e40af; color: white; padding: 10px 12px; font-weight: 600; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;',
  link: 'color: #2563eb; text-decoration: none;',
  paragraph: 'font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.6; color: #374151; margin: 0 0 16px 0;',
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

  // Helper: Create table row
  const tableRow = (label: string, value: string | null | undefined, isLink = false, linkText?: string) => {
    if (!value) return '';
    const displayValue = isLink
      ? `<a href="${value}" style="${styles.link}">${linkText || value}</a>`
      : value;
    return `<tr>
      <td style="${styles.headerCell}">${label}</td>
      <td style="${styles.valueCell}">${displayValue}</td>
    </tr>`;
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

  // Start building email
  let emailHtml = `
<div style="font-family: Arial, Helvetica, sans-serif; max-width: 650px; margin: 0 auto;">
  <!-- Greeting -->
  <p style="${styles.paragraph}">${contactNames},</p>
  <p style="${styles.paragraph}">Please find below a new site for your review. Your feedback is appreciated.</p>

  <!-- Property Details Table -->
  <table style="${styles.table}" cellpadding="0" cellspacing="0">
    <tr>
      <td colspan="2" style="${styles.sectionHeader}">Property Details</td>
    </tr>
    ${tableRow('Property Name', propertyName)}
    ${tableRow('Address', address)}
    ${propertyUnit?.property_unit_name ? tableRow('Unit', propertyUnit.property_unit_name) : ''}
    ${property?.trade_area ? tableRow('Trade Area', property.trade_area) : ''}
    ${sizeInfo ? tableRow('Size', sizeInfo) : ''}
    ${pricingValue ? tableRow(pricingLabel, pricingValue) : ''}
    ${nnnValue ? tableRow('NNN', nnnValue) : ''}
    ${siteSubmit.delivery_timeframe ? tableRow('Delivery', siteSubmit.delivery_timeframe) : ''}
  </table>
`;

  // Quick Links row
  if (mapLink || portalLink) {
    emailHtml += `
  <table style="${styles.table}; margin-top: -1px;" cellpadding="0" cellspacing="0">
    <tr>
      <td style="${styles.headerCell}">Quick Links</td>
      <td style="${styles.valueCell}">`;

    const links = [];
    if (mapLink) links.push(`<a href="${mapLink}" style="${styles.link}">View on Map</a>`);
    if (portalLink) links.push(`<a href="${portalLink}" style="${styles.link}">View in Portal</a>`);
    emailHtml += links.join(' &nbsp;|&nbsp; ');

    emailHtml += `</td>
    </tr>
  </table>
`;
  }

  // Demographics section (if available)
  const hasDemo = property?.['1_mile_pop'] || property?.['3_mile_pop'] || property?.hh_income_median_3_mile;
  const hasTraffic = property?.traffic_count || property?.traffic_count_2nd || property?.total_traffic;

  if (hasDemo || hasTraffic) {
    emailHtml += `
  <table style="${styles.table}; margin-top: 16px;" cellpadding="0" cellspacing="0">
    <tr>
      <td colspan="2" style="${styles.sectionHeader}">Location &amp; Demographics</td>
    </tr>`;

    if (property?.['1_mile_pop']) {
      emailHtml += tableRow('1-Mile Population', formatNumber(property['1_mile_pop']));
    }
    if (property?.['3_mile_pop']) {
      emailHtml += tableRow('3-Mile Population', formatNumber(property['3_mile_pop']));
    }
    if (property?.hh_income_median_3_mile) {
      emailHtml += tableRow('Median HH Income (3mi)', formatCurrency(property.hh_income_median_3_mile));
    }
    if (property?.traffic_count) {
      emailHtml += tableRow('Traffic Count', formatNumber(property.traffic_count));
    }
    if (property?.traffic_count_2nd) {
      emailHtml += tableRow('Traffic Count (2nd)', formatNumber(property.traffic_count_2nd));
    }
    if (property?.total_traffic) {
      emailHtml += tableRow('Total Traffic', formatNumber(property.total_traffic));
    }

    emailHtml += `
  </table>
`;
  }

  // Supporting Files section
  const hasPropertyUnitFiles = propertyUnitFiles && propertyUnitFiles.length > 0;
  const hasPropertyFiles = propertyFiles && propertyFiles.length > 0;
  const hasGenericFiles = property?.marketing_materials || property?.site_plan || property?.demographics;

  if (hasPropertyUnitFiles || hasPropertyFiles || hasGenericFiles) {
    emailHtml += `
  <table style="${styles.table}; margin-top: 16px;" cellpadding="0" cellspacing="0">
    <tr>
      <td colspan="2" style="${styles.sectionHeader}">Supporting Documents</td>
    </tr>
    <tr>
      <td colspan="2" style="${styles.valueCell}">`;

    const fileLinks: string[] = [];

    // Property-level Dropbox files
    if (hasPropertyFiles) {
      propertyFiles!.forEach(file => {
        fileLinks.push(`<a href="${file.sharedLink}" style="${styles.link}">${file.name}</a>`);
      });
    }

    // Generic property links
    if (property?.marketing_materials) {
      fileLinks.push(`<a href="${property.marketing_materials}" style="${styles.link}">Marketing Materials</a>`);
    }
    if (property?.site_plan) {
      fileLinks.push(`<a href="${property.site_plan}" style="${styles.link}">Site Plan</a>`);
    }
    if (property?.demographics) {
      fileLinks.push(`<a href="${property.demographics}" style="${styles.link}">Demographics Report</a>`);
    }

    // Property unit Dropbox files
    if (hasPropertyUnitFiles) {
      propertyUnitFiles!.forEach(file => {
        fileLinks.push(`<a href="${file.sharedLink}" style="${styles.link}">${file.name}</a>`);
      });
    }

    emailHtml += fileLinks.join('<br>');
    emailHtml += `</td>
    </tr>
  </table>
`;
  }

  // Site Notes
  if (siteSubmit.notes) {
    emailHtml += `
  <table style="${styles.table}; margin-top: 16px;" cellpadding="0" cellspacing="0">
    <tr>
      <td colspan="2" style="${styles.sectionHeader}">Site Notes</td>
    </tr>
    <tr>
      <td colspan="2" style="${styles.valueCell}">${siteSubmit.notes.replace(/\n/g, '<br>')}</td>
    </tr>
  </table>
`;
  }

  // Competitor Data
  if (siteSubmit.competitor_data) {
    emailHtml += `
  <table style="${styles.table}; margin-top: 16px;" cellpadding="0" cellspacing="0">
    <tr>
      <td colspan="2" style="${styles.sectionHeader}">Competitor Information</td>
    </tr>
    <tr>
      <td colspan="2" style="${styles.valueCell}">${siteSubmit.competitor_data.replace(/\n/g, '<br>')}</td>
    </tr>
  </table>
`;
  }

  // Closing message
  emailHtml += `
  <p style="${styles.paragraph}; margin-top: 24px;">
    If this property is a pass, please reply with a brief reason. If you need more information or want to discuss further, let me know.
  </p>

  <p style="${styles.paragraph}">Thanks!</p>
`;

  // Signature - use user's saved signature if available, otherwise fall back to basic info
  if (userSignatureHtml) {
    emailHtml += `
  <div style="margin-top: 16px;">
    ${userSignatureHtml}
  </div>
`;
  } else {
    // Fallback signature using userData
    emailHtml += `
  <div style="${styles.paragraph}; margin-top: 16px;">
    <strong>${userData?.first_name || ''} ${userData?.last_name || ''}</strong><br>
    ${userData?.email || ''}${userData?.mobile_phone ? `<br>M: ${userData.mobile_phone}` : ''}
  </div>
`;
  }

  emailHtml += `
</div>
`;

  return emailHtml;
}
