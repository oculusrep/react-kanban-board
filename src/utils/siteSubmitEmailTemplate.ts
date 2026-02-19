/**
 * Shared Site Submit Email Template Generator
 *
 * This utility generates the email template for site submit notifications.
 * Uses simple HTML that's compatible with ReactQuill editor while still
 * looking professional in email clients.
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

  // Start building email - using simple HTML compatible with Quill
  let emailHtml = `<p>${contactNames},</p>`;
  emailHtml += `<p>Please find below a new site for your review. Your feedback is appreciated.</p>`;
  emailHtml += `<p><br></p>`;

  // Property Details section
  emailHtml += `<p><strong>PROPERTY DETAILS</strong></p>`;
  emailHtml += `<p>`;
  emailHtml += `<strong>Property Name:</strong> ${propertyName}<br>`;

  if (address) {
    emailHtml += `<strong>Address:</strong> ${address}<br>`;
  }

  if (propertyUnit?.property_unit_name) {
    emailHtml += `<strong>Unit:</strong> ${propertyUnit.property_unit_name}<br>`;
  }

  if (property?.trade_area) {
    emailHtml += `<strong>Trade Area:</strong> ${property.trade_area}<br>`;
  }

  if (sizeInfo) {
    emailHtml += `<strong>Size:</strong> ${sizeInfo}<br>`;
  }

  if (pricingValue) {
    emailHtml += `<strong>${pricingLabel}:</strong> ${pricingValue}<br>`;
  }

  if (nnnValue) {
    emailHtml += `<strong>NNN:</strong> ${nnnValue}<br>`;
  }

  if (siteSubmit.delivery_timeframe) {
    emailHtml += `<strong>Delivery:</strong> ${siteSubmit.delivery_timeframe}<br>`;
  }

  emailHtml += `</p>`;

  // Quick Links
  if (mapLink || portalLink) {
    emailHtml += `<p>`;
    emailHtml += `<strong>Quick Links:</strong> `;
    const links = [];
    if (mapLink) links.push(`<a href="${mapLink}">View on Map</a>`);
    if (portalLink) links.push(`<a href="${portalLink}">View in Portal</a>`);
    emailHtml += links.join(' | ');
    emailHtml += `</p>`;
  }

  // Demographics section
  const hasDemo = property?.['1_mile_pop'] || property?.['3_mile_pop'] || property?.hh_income_median_3_mile;
  const hasTraffic = property?.traffic_count || property?.traffic_count_2nd || property?.total_traffic;

  if (hasDemo || hasTraffic) {
    emailHtml += `<p><br></p>`;
    emailHtml += `<p><strong>LOCATION & DEMOGRAPHICS</strong></p>`;
    emailHtml += `<p>`;

    if (property?.['1_mile_pop']) {
      emailHtml += `<strong>1-Mile Population:</strong> ${formatNumber(property['1_mile_pop'])}<br>`;
    }
    if (property?.['3_mile_pop']) {
      emailHtml += `<strong>3-Mile Population:</strong> ${formatNumber(property['3_mile_pop'])}<br>`;
    }
    if (property?.hh_income_median_3_mile) {
      emailHtml += `<strong>Median HH Income (3mi):</strong> ${formatCurrency(property.hh_income_median_3_mile)}<br>`;
    }
    if (property?.traffic_count) {
      emailHtml += `<strong>Traffic Count:</strong> ${formatNumber(property.traffic_count)}<br>`;
    }
    if (property?.traffic_count_2nd) {
      emailHtml += `<strong>Traffic Count (2nd):</strong> ${formatNumber(property.traffic_count_2nd)}<br>`;
    }
    if (property?.total_traffic) {
      emailHtml += `<strong>Total Traffic:</strong> ${formatNumber(property.total_traffic)}<br>`;
    }

    emailHtml += `</p>`;
  }

  // Supporting Files section
  const hasPropertyUnitFiles = propertyUnitFiles && propertyUnitFiles.length > 0;
  const hasPropertyFiles = propertyFiles && propertyFiles.length > 0;
  const hasGenericFiles = property?.marketing_materials || property?.site_plan || property?.demographics;

  if (hasPropertyUnitFiles || hasPropertyFiles || hasGenericFiles) {
    emailHtml += `<p><br></p>`;
    emailHtml += `<p><strong>SUPPORTING DOCUMENTS</strong></p>`;
    emailHtml += `<p>`;

    // Property-level Dropbox files
    if (hasPropertyFiles) {
      propertyFiles!.forEach(file => {
        emailHtml += `<a href="${file.sharedLink}">${file.name}</a><br>`;
      });
    }

    // Generic property links
    if (property?.marketing_materials) {
      emailHtml += `<a href="${property.marketing_materials}">Marketing Materials</a><br>`;
    }
    if (property?.site_plan) {
      emailHtml += `<a href="${property.site_plan}">Site Plan</a><br>`;
    }
    if (property?.demographics) {
      emailHtml += `<a href="${property.demographics}">Demographics Report</a><br>`;
    }

    // Property unit Dropbox files
    if (hasPropertyUnitFiles) {
      propertyUnitFiles!.forEach(file => {
        emailHtml += `<a href="${file.sharedLink}">${file.name}</a><br>`;
      });
    }

    emailHtml += `</p>`;
  }

  // Site Notes
  if (siteSubmit.notes) {
    emailHtml += `<p><br></p>`;
    emailHtml += `<p><strong>SITE NOTES</strong></p>`;
    emailHtml += `<p>${siteSubmit.notes.replace(/\n/g, '<br>')}</p>`;
  }

  // Competitor Data
  if (siteSubmit.competitor_data) {
    emailHtml += `<p><br></p>`;
    emailHtml += `<p><strong>COMPETITOR INFORMATION</strong></p>`;
    emailHtml += `<p>${siteSubmit.competitor_data.replace(/\n/g, '<br>')}</p>`;
  }

  // Closing message
  emailHtml += `<p><br></p>`;
  emailHtml += `<p>If this property is a pass, please reply with a brief reason. If you need more information or want to discuss further, let me know.</p>`;
  emailHtml += `<p>Thanks!</p>`;

  // Signature
  emailHtml += `<p><br></p>`;

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
