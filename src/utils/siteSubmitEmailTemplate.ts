/**
 * Shared Site Submit Email Template Generator
 *
 * This utility generates the email template for site submit notifications.
 * Used by both SiteSubmitFormModal and SiteSubmitDetailsPage to ensure consistency.
 */

export interface PropertyUnitFile {
  name: string;
  sharedLink: string;
}

export interface SiteSubmitEmailData {
  siteSubmit: any;
  property: any;
  propertyUnit: any;
  contacts: any[];
  userData: any;
  propertyUnitFiles?: PropertyUnitFile[]; // Array of property unit files with shared links
  propertyFiles?: PropertyUnitFile[]; // Array of property-level files with shared links
}

export function generateSiteSubmitEmailTemplate(data: SiteSubmitEmailData): string {
  const { siteSubmit, property, propertyUnit, contacts, userData, propertyUnitFiles, propertyFiles } = data;

  // Helper: Format currency
  const formatCurrency = (value: number | null | undefined) => {
    if (!value) return null;
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Helper: Generate map link
  const getMapLink = () => {
    if (property?.map_link) return property.map_link;
    const lat = property?.verified_latitude || property?.latitude;
    const lng = property?.verified_longitude || property?.longitude;
    return (lat && lng) ? `https://www.google.com/maps?q=${lat},${lng}` : null;
  };

  // Line 1: Contact names
  const contactNames = contacts && Array.isArray(contacts)
    ? contacts.map(c => c.first_name).filter(Boolean).join(', ')
    : 'Site Selectors';

  // Line 2: Property name
  const propertyName = property?.property_name || 'N/A';

  // Start building email HTML
  let emailHtml = `<p>${contactNames},</p>`;
  emailHtml += `<br/>`;
  emailHtml += `<p>Please find below a new site submit for ${propertyName}. Your feedback on this site is appreciated.</p>`;
  emailHtml += `<p><strong>Property Name:</strong> ${propertyName}<br/>`;

  // Trade Area
  if (property?.trade_area) {
    emailHtml += `<strong>Trade Area:</strong> ${property.trade_area}<br/>`;
  }

  // Map Link
  const mapLink = getMapLink();
  if (mapLink) {
    emailHtml += `<strong>Map Link:</strong> <a href="${mapLink}">View Map</a><br/>`;
  }

  // Address
  const address = [property?.address, property?.city, property?.state].filter(Boolean).join(', ');
  if (address) {
    emailHtml += `<strong>Address:</strong> ${address}<br/>`;
  }

  // Unit Name (if property unit exists)
  if (propertyUnit?.property_unit_name) {
    emailHtml += `<strong>Unit Name:</strong> ${propertyUnit.property_unit_name}<br/>`;
  }

  // Available Sqft / Acres (complex conditional logic)
  if (propertyUnit?.sqft) {
    emailHtml += `<strong>Available Sqft:</strong> ${propertyUnit.sqft.toLocaleString()}<br/>`;
  } else if (property?.available_sqft) {
    emailHtml += `<strong>Available Sqft:</strong> ${property.available_sqft.toLocaleString()}<br/>`;
  } else if (property?.acres) {
    emailHtml += `<strong>Acres:</strong> ${property.acres}<br/>`;
    if (property?.building_sqft) {
      emailHtml += `<strong>Building Sqft:</strong> ${property.building_sqft.toLocaleString()}<br/>`;
    }
  }

  // Base Rent / Ground Lease / Purchase Price (complex conditional logic)
  if (propertyUnit?.rent) {
    const formatted = formatCurrency(propertyUnit.rent);
    if (formatted) emailHtml += `<strong>Base Rent:</strong> ${formatted}<br/>`;
  } else if (property?.rent_psf) {
    const formatted = formatCurrency(property.rent_psf);
    if (formatted) emailHtml += `<strong>Base Rent:</strong> ${formatted}<br/>`;
  } else if (property?.asking_lease_price) {
    const formatted = formatCurrency(property.asking_lease_price);
    if (formatted) emailHtml += `<strong>Ground Lease Rent:</strong> ${formatted}<br/>`;
  } else if (property?.asking_purchase_price) {
    const formatted = formatCurrency(property.asking_purchase_price);
    if (formatted) emailHtml += `<strong>Purchase Price:</strong> ${formatted}<br/>`;
  }

  // NNN
  if (propertyUnit?.nnn) {
    const formatted = formatCurrency(propertyUnit.nnn);
    if (formatted) emailHtml += `<strong>NNN:</strong> ${formatted}<br/>`;
  } else if (property?.nnn_psf) {
    const formatted = formatCurrency(property.nnn_psf);
    if (formatted) emailHtml += `<strong>NNN:</strong> ${formatted}<br/>`;
  }

  // Delivery Timeframe
  if (siteSubmit.delivery_timeframe) {
    emailHtml += `<strong>Delivery Timeframe:</strong> ${siteSubmit.delivery_timeframe}<br/>`;
  }

  emailHtml += `</p>`;

  // Supporting Files Section
  const hasPropertyUnitFiles = propertyUnitFiles && propertyUnitFiles.length > 0;
  const hasPropertyFiles = propertyFiles && propertyFiles.length > 0;
  const hasFiles = property?.marketing_materials || property?.site_plan || property?.demographics || hasPropertyUnitFiles || hasPropertyFiles;
  if (hasFiles) {
    emailHtml += `<br/>`;
    emailHtml += `<p><strong>Supporting Files:</strong><br/>`;

    // For property-level site submits: show both property Dropbox files AND generic links
    if (hasPropertyFiles) {
      propertyFiles.forEach(file => {
        emailHtml += `<a href="${file.sharedLink}">${file.name}</a><br/>`;
      });
    }

    // Always show generic property-level links if they exist
    if (property?.marketing_materials) {
      emailHtml += `<a href="${property.marketing_materials}">Marketing Materials</a><br/>`;
    }
    if (property?.site_plan) {
      emailHtml += `<a href="${property.site_plan}">Site Plan</a><br/>`;
    }
    if (property?.demographics) {
      emailHtml += `<a href="${property.demographics}">Demographics</a><br/>`;
    }

    // Add individual property unit files (for property unit site submits)
    if (hasPropertyUnitFiles) {
      propertyUnitFiles.forEach(file => {
        emailHtml += `<a href="${file.sharedLink}">${file.name}</a><br/>`;
      });
    }
    emailHtml += `</p>`;
  }

  // Property Location Details Section
  const hasTraffic = property?.traffic_count || property?.traffic_count_2nd || property?.total_traffic;
  if (hasTraffic) {
    emailHtml += `<p><strong>Property Location Details</strong><br/>`;
    if (property?.traffic_count) {
      emailHtml += `<strong>Traffic Count:</strong> ${property.traffic_count.toLocaleString()}<br/>`;
    }
    if (property?.traffic_count_2nd) {
      emailHtml += `<strong>Traffic Count 2nd:</strong> ${property.traffic_count_2nd.toLocaleString()}<br/>`;
    }
    if (property?.total_traffic) {
      emailHtml += `<strong>Total Traffic Count:</strong> ${property.total_traffic.toLocaleString()}<br/>`;
    }
    emailHtml += `</p>`;
  }

  // Site Demographics Section
  const hasDemographics = property?.['1_mile_pop'] || property?.['3_mile_pop'] || property?.hh_income_median_3_mile;
  if (hasDemographics) {
    emailHtml += `<p><strong>Site Demographics:</strong><br/>`;
    if (property?.['1_mile_pop']) {
      emailHtml += `<strong>1 Mile Population:</strong> ${property['1_mile_pop'].toLocaleString()}<br/>`;
    }
    if (property?.['3_mile_pop']) {
      emailHtml += `<strong>3 Mile Population:</strong> ${property['3_mile_pop'].toLocaleString()}<br/>`;
    }
    if (property?.hh_income_median_3_mile) {
      const formatted = formatCurrency(property.hh_income_median_3_mile);
      if (formatted) emailHtml += `<strong>Median HH Income (3 miles):</strong> ${formatted}<br/>`;
    }
    emailHtml += `</p>`;
  }

  // Site Notes Section
  if (siteSubmit.notes) {
    emailHtml += `<p><strong>Site Notes:</strong><br/>`;
    emailHtml += `${siteSubmit.notes.replace(/\n/g, '<br/>')}</p>`;
  }

  // Competitor Sales Section
  if (siteSubmit.competitor_data) {
    emailHtml += `<p><strong>Competitor Sales</strong><br/>`;
    emailHtml += `${siteSubmit.competitor_data.replace(/\n/g, '<br/>')}</p>`;
  }

  // Closing boilerplate
  emailHtml += `<br/>`;
  emailHtml += `<p>If this property is a pass, please just respond back to this email with a brief reason as to why it's a pass. If you need more information or want to discuss further, let me know that as well please.</p>`;

  // Signature
  emailHtml += `<br/>`;
  emailHtml += `<p>Thanks!<br/><br/>`;
  emailHtml += `${userData?.first_name || ''} ${userData?.last_name || ''}<br/>`;
  emailHtml += `${userData?.email || ''}`;
  if (userData?.mobile_phone) {
    emailHtml += `<br/>M: ${userData.mobile_phone}`;
  }
  emailHtml += `</p>`;

  return emailHtml;
}
