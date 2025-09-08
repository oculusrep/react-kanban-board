import React, { useState } from 'react';
import PropertyHeader from './property/PropertyHeader';

// Sample data interfaces
interface Contact {
  id: string;
  name: string;
  role: string;
  phone?: string;
  mobile_phone?: string;
  email?: string;
  company?: string;
}

interface Unit {
  id: string;
  name: string;
  type: string;
  rent: number;
  status: 'Occupied' | 'Available' | 'Maintenance';
}

interface Deal {
  id: string;
  title: string;
  value: string;
  stage: string;
}

interface SiteSubmit {
  id: string;
  platform: string;
  tier: string;
  status: 'Active' | 'Pending' | 'Inactive';
}

interface PropertyDashboardSidebarProps {
  propertyName?: string;
  isActive?: boolean;
}

// Collapsible Section Component
interface CollapsibleSectionProps {
  title: string;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  isExpanded,
  onToggle,
  children
}) => (
  <div className="bg-white border border-gray-200 rounded-lg mb-4">
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
    >
      <h3 className="text-lg font-medium text-gray-900">{title}</h3>
      <svg
        className={`w-5 h-5 text-gray-400 transform transition-transform ${
          isExpanded ? 'rotate-180' : ''
        }`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </button>
    {isExpanded && (
      <div className="px-4 pb-4 border-t border-gray-100">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {children}
        </div>
      </div>
    )}
  </div>
);

// Form Field Component
interface FormFieldProps {
  label: string;
  type?: 'text' | 'select' | 'currency';
  value?: string;
  options?: string[];
  placeholder?: string;
  fullWidth?: boolean;
}

const FormField: React.FC<FormFieldProps> = ({
  label,
  type = 'text',
  value = '',
  options = [],
  placeholder = '',
  fullWidth = false
}) => (
  <div className={fullWidth ? 'md:col-span-2' : ''}>
    <label className="block text-sm font-medium text-gray-700 mb-1">
      {label}
    </label>
    {type === 'select' ? (
      <select 
        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
        value={value}
      >
        <option value="">Select {label.toLowerCase()}</option>
        {options.map((option, index) => (
          <option key={index} value={option}>{option}</option>
        ))}
      </select>
    ) : type === 'currency' ? (
      <div className="relative">
        <span className="absolute left-3 top-2 text-gray-500">$</span>
        <input
          type="text"
          className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          value={value}
          placeholder={placeholder}
        />
      </div>
    ) : (
      <input
        type={type}
        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
        value={value}
        placeholder={placeholder}
      />
    )}
  </div>
);

// Sidebar Module Component
interface SidebarModuleProps {
  title: string;
  count: number;
  onAddNew: () => void;
  children: React.ReactNode;
  isExpanded?: boolean;
  onToggle?: () => void;
  icon?: string;
  isEmpty?: boolean;
}

const SidebarModule: React.FC<SidebarModuleProps> = ({
  title,
  count,
  onAddNew,
  children,
  isExpanded = true,
  onToggle,
  icon,
  isEmpty = false
}) => (
  <div className={`bg-white border border-gray-200 rounded-lg mb-3 shadow-sm ${isEmpty ? 'opacity-60' : ''}`}>
    <div className={`flex items-center justify-between p-3 border-b border-gray-100 ${
      isEmpty ? 'bg-gray-50' : 'bg-gradient-to-r from-slate-50 to-gray-50'
    }`}>
      <button
        onClick={onToggle}
        className="flex items-center space-x-2 flex-1 text-left hover:bg-white/50 -mx-3 px-3 py-1 rounded-t-lg transition-colors"
      >
        <svg
          className={`w-4 h-4 text-gray-400 transform transition-transform ${
            isExpanded ? 'rotate-90' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {icon && (
          <div className="w-4 h-4 flex items-center justify-center">
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
            </svg>
          </div>
        )}
        <h4 className="font-medium text-gray-900 text-sm">{title}</h4>
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ${
          isEmpty ? 'bg-gray-200 text-gray-600' : 'bg-blue-100 text-blue-800'
        }`}>
          {count}
        </span>
        {isEmpty && (
          <span className="text-xs text-gray-500 italic">(Empty)</span>
        )}
      </button>
      <button
        onClick={onAddNew}
        className="flex items-center px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors ml-2"
      >
        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        New
      </button>
    </div>
    {isExpanded && (
      <div className="max-h-48 overflow-y-auto">
        {count === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">
            <div className="w-12 h-12 mx-auto mb-2 bg-gray-100 rounded-full flex items-center justify-center">
              {icon && (
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
                </svg>
              )}
            </div>
            No {title.toLowerCase()} yet
          </div>
        ) : (
          children
        )}
      </div>
    )}
  </div>
);

// List Item Components
interface ContactItemProps {
  contact: Contact;
  isExpanded?: boolean;
  onToggle?: () => void;
}

const ContactItem: React.FC<ContactItemProps> = ({ contact, isExpanded = false, onToggle }) => {
  const displayPhone = contact.mobile_phone || contact.phone;
  
  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <div 
        className="p-2 hover:bg-gray-50 cursor-pointer transition-colors flex items-center justify-between"
        onClick={onToggle}
      >
        <div className="flex items-center space-x-3 flex-1 min-w-0">
          <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-white font-medium text-xs">
              {contact.name.split(' ').map(n => n[0]).join('')}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-gray-900 truncate">{contact.name}</span>
              {displayPhone && (
                <span className="text-xs text-gray-500 truncate">{displayPhone}</span>
              )}
            </div>
          </div>
        </div>
        <svg
          className={`w-3 h-3 text-gray-400 transform transition-transform flex-shrink-0 ${
            isExpanded ? 'rotate-90' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
      {isExpanded && (
        <div className="px-2 pb-2 bg-blue-25">
          <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs space-y-2">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
              <span className="font-medium text-blue-900">Contact Details</span>
            </div>
            <div className="space-y-1 ml-4">
              <div><span className="font-medium text-blue-800">Role:</span> <span className="text-blue-700">{contact.role}</span></div>
              {contact.company && (
                <div><span className="font-medium text-blue-800">Company:</span> <span className="text-blue-700">{contact.company}</span></div>
              )}
              {contact.email && (
                <div><span className="font-medium text-blue-800">Email:</span> <span className="text-blue-700">{contact.email}</span></div>
              )}
              {contact.phone && (
                <div><span className="font-medium text-blue-800">Phone:</span> <span className="text-blue-700">{contact.phone}</span></div>
              )}
              {contact.mobile_phone && (
                <div><span className="font-medium text-blue-800">Mobile:</span> <span className="text-blue-700">{contact.mobile_phone}</span></div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const UnitItem: React.FC<{ unit: Unit }> = ({ unit }) => (
  <div className="p-2 hover:bg-gray-50 cursor-pointer transition-colors">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-900">Unit {unit.name}</p>
        <p className="text-xs text-gray-500">{unit.type}</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-medium text-gray-900">${unit.rent.toLocaleString()}</p>
        <span className={`inline-flex px-1.5 py-0.5 rounded-full text-xs font-medium ${
          unit.status === 'Available' ? 'bg-green-100 text-green-800' :
          unit.status === 'Occupied' ? 'bg-blue-100 text-blue-800' :
          'bg-yellow-100 text-yellow-800'
        }`}>
          {unit.status}
        </span>
      </div>
    </div>
  </div>
);

const DealItem: React.FC<{ deal: Deal }> = ({ deal }) => (
  <div className="p-2 hover:bg-gray-50 cursor-pointer transition-colors">
    <div>
      <p className="text-sm font-medium text-gray-900">{deal.title}</p>
      <p className="text-xs text-gray-500">{deal.stage}</p>
      <p className="text-sm font-medium text-green-600 mt-1">{deal.value}</p>
    </div>
  </div>
);

const SiteSubmitItem: React.FC<{ siteSubmit: SiteSubmit }> = ({ siteSubmit }) => (
  <div className="p-2 hover:bg-gray-50 cursor-pointer transition-colors">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-900">{siteSubmit.platform}</p>
        <p className="text-xs text-gray-500">{siteSubmit.tier}</p>
      </div>
      <span className={`inline-flex px-1.5 py-0.5 rounded-full text-xs font-medium ${
        siteSubmit.status === 'Active' ? 'bg-green-100 text-green-800' :
        siteSubmit.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
        'bg-gray-100 text-gray-800'
      }`}>
        {siteSubmit.status}
      </span>
    </div>
  </div>
);

const PropertyDashboardSidebar: React.FC<PropertyDashboardSidebarProps> = ({
  propertyName = "236 Grace Road",
  isActive = true
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // Sample property data for header
  const sampleProperty = {
    id: '1',
    property_name: propertyName,
    address: propertyName,
    building_sqft: 18500,
    available_sqft: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    property_type: { id: '1', label: 'Multifamily', active: true, sort_order: 1, created_at: '', updated_at: '' },
    property_stage: undefined
  };

  // Sample data - declare before state initialization
  const contacts: Contact[] = [
    { 
      id: '1', 
      name: 'John Smith', 
      role: 'Owner', 
      phone: '(555) 123-4567',
      mobile_phone: '(555) 987-6543',
      email: 'john.smith@email.com',
      company: 'Smith Properties LLC'
    },
    { 
      id: '2', 
      name: 'Sarah Johnson', 
      role: 'Property Manager', 
      phone: '(555) 234-5678',
      email: 'sarah.johnson@pmcompany.com',
      company: 'Premier Management'
    },
    { 
      id: '3', 
      name: 'Mike Chen', 
      role: 'Broker', 
      mobile_phone: '(555) 345-6789',
      email: 'mike.chen@realty.com',
      company: 'Chen Realty Group'
    }
  ];

  const units: Unit[] = [
    { id: '1', name: '1A', type: 'Studio', rent: 2800, status: 'Occupied' },
    { id: '2', name: '1B', type: '1BR', rent: 3200, status: 'Available' },
    { id: '3', name: '2A', type: '2BR', rent: 4100, status: 'Occupied' }
  ];

  const deals: Deal[] = [
    { id: '1', title: 'Sale - Multifamily Package', value: '$8.5M', stage: 'Negotiation' },
    { id: '2', title: 'Property Management Agreement', value: '$120K', stage: 'Contract Review' }
  ];

  const siteSubmits: SiteSubmit[] = [
    // Empty to demonstrate smart defaults and empty state
  ];

  const [expandedSections, setExpandedSections] = useState({
    details: true,
    location: false,
    financial: false,
    demographics: false
  });

  // Smart defaults - auto-collapse empty sections
  const getSmartDefaults = () => {
    return {
      contacts: contacts.length > 0,
      units: units.length > 0,  
      deals: deals.length > 0,
      siteSubmits: siteSubmits.length > 0
    };
  };

  const [expandedSidebarModules, setExpandedSidebarModules] = useState(() => {
    const saved = localStorage.getItem('expandedSidebarModules');
    return saved ? JSON.parse(saved) : getSmartDefaults();
  });
  const [expandedContacts, setExpandedContacts] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('expandedContacts');
    return saved ? JSON.parse(saved) : {};
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const toggleSidebarModule = (module: keyof typeof expandedSidebarModules) => {
    const newState = {
      ...expandedSidebarModules,
      [module]: !expandedSidebarModules[module]
    };
    setExpandedSidebarModules(newState);
    localStorage.setItem('expandedSidebarModules', JSON.stringify(newState));
  };

  const toggleContact = (contactId: string) => {
    const newState = {
      ...expandedContacts,
      [contactId]: !expandedContacts[contactId]
    };
    setExpandedContacts(newState);
    localStorage.setItem('expandedContacts', JSON.stringify(newState));
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Property Header */}
      <PropertyHeader
        property={sampleProperty}
        isEditing={false}
        onToggleEdit={() => {}}
        onBack={() => window.history.back()}
        onGetLocation={() => console.log('Get location')}
        onCallContact={() => console.log('Call contact')}
      />

      {/* Additional Header with Sidebar Toggle */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 shadow-sm">
        <div className="flex items-center justify-end space-x-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
          >
            {sidebarOpen ? 'Hide' : 'Show'} Sidebar
          </button>
          <button className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors">
            Edit Property
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main Content */}
        <div 
          className={`flex-1 overflow-y-auto p-6 transition-all duration-300 ${
            sidebarOpen ? 'mr-[500px]' : 'mr-0'
          }`}
        >
          {/* Property Details Section */}
          <CollapsibleSection
            title="Property Details"
            isExpanded={expandedSections.details}
            onToggle={() => toggleSection('details')}
          >
            <FormField label="Property Name" value="236 Grace Road" />
            <FormField 
              label="Property Type" 
              type="select" 
              options={['Multifamily', 'Office', 'Retail', 'Industrial']} 
              value="Multifamily"
            />
            <FormField label="Year Built" value="1985" />
            <FormField label="Number of Units" value="24" />
            <FormField label="Building Size" value="18,500" placeholder="Square feet" />
            <FormField label="Lot Size" value="0.75" placeholder="Acres" />
            <FormField 
              label="Description" 
              value="Well-maintained multifamily property in desirable neighborhood" 
              fullWidth 
            />
          </CollapsibleSection>

          {/* Location Section */}
          <CollapsibleSection
            title="Location"
            isExpanded={expandedSections.location}
            onToggle={() => toggleSection('location')}
          >
            <FormField label="Street Address" value="236 Grace Road" />
            <FormField label="City" value="Springfield" />
            <FormField label="State" value="MA" />
            <FormField label="ZIP Code" value="01109" />
            <FormField label="County" value="Hampden" />
            <FormField label="Neighborhood" value="Forest Park" />
            <FormField label="Latitude" value="42.1015" />
            <FormField label="Longitude" value="-72.5898" />
          </CollapsibleSection>

          {/* Financial Information Section */}
          <CollapsibleSection
            title="Financial Information"
            isExpanded={expandedSections.financial}
            onToggle={() => toggleSection('financial')}
          >
            <FormField label="Purchase Price" type="currency" value="2,450,000" />
            <FormField label="Current Market Value" type="currency" value="2,850,000" />
            <FormField label="Annual Rent Roll" type="currency" value="420,000" />
            <FormField label="Operating Expenses" type="currency" value="125,000" />
            <FormField label="Net Operating Income" type="currency" value="295,000" />
            <FormField label="Cap Rate" value="10.3%" />
            <FormField label="Cash-on-Cash Return" value="12.8%" />
            <FormField label="Property Taxes" type="currency" value="28,500" />
          </CollapsibleSection>

          {/* Demographics Section */}
          <CollapsibleSection
            title="Demographics"
            isExpanded={expandedSections.demographics}
            onToggle={() => toggleSection('demographics')}
          >
            <FormField label="Population (1 Mile)" value="15,842" />
            <FormField label="Median Income (1 Mile)" type="currency" value="68,500" />
            <FormField label="Average Age" value="34.2" />
            <FormField label="Employment Rate" value="94.3%" />
            <FormField label="Crime Index" value="Low (2.1/10)" />
            <FormField label="School Rating" value="8/10" />
            <FormField label="Walk Score" value="72 (Very Walkable)" />
            <FormField label="Transit Score" value="45 (Some Transit)" />
          </CollapsibleSection>
        </div>

        {/* Sliding Sidebar */}
        <div 
          className={`fixed right-0 top-0 h-full w-[500px] bg-white border-l border-gray-200 shadow-xl transform transition-transform duration-300 ${
            sidebarOpen ? 'translate-x-0' : 'translate-x-full'
          } z-40 overflow-y-auto`}
          style={{ top: '182px', height: 'calc(100vh - 182px)' }} // Account for PropertyHeader + additional header height
        >
          <div className="p-3">
            {/* Associated Contacts */}
            <SidebarModule
              title="Associated Contacts"
              count={contacts.length}
              onAddNew={() => console.log('Add new contact')}
              isExpanded={expandedSidebarModules.contacts}
              onToggle={() => toggleSidebarModule('contacts')}
              icon="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"
              isEmpty={contacts.length === 0}
            >
              {contacts.map(contact => (
                <ContactItem 
                  key={contact.id} 
                  contact={contact} 
                  isExpanded={expandedContacts[contact.id]}
                  onToggle={() => toggleContact(contact.id)}
                />
              ))}
            </SidebarModule>

            {/* Property Units */}
            <SidebarModule
              title="Property Units"
              count={units.length}
              onAddNew={() => console.log('Add new unit')}
              isExpanded={expandedSidebarModules.units}
              onToggle={() => toggleSidebarModule('units')}
              icon="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              isEmpty={units.length === 0}
            >
              {units.map(unit => (
                <UnitItem key={unit.id} unit={unit} />
              ))}
            </SidebarModule>

            {/* Deals */}
            <SidebarModule
              title="Deals"
              count={deals.length}
              onAddNew={() => console.log('Add new deal')}
              isExpanded={expandedSidebarModules.deals}
              onToggle={() => toggleSidebarModule('deals')}
              icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"
              isEmpty={deals.length === 0}
            >
              {deals.map(deal => (
                <DealItem key={deal.id} deal={deal} />
              ))}
            </SidebarModule>

            {/* Site Submits */}
            <SidebarModule
              title="Site Submits"
              count={siteSubmits.length}
              onAddNew={() => console.log('Add new site submit')}
              isExpanded={expandedSidebarModules.siteSubmits}
              onToggle={() => toggleSidebarModule('siteSubmits')}
              icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              isEmpty={siteSubmits.length === 0}
            >
              {siteSubmits.map(siteSubmit => (
                <SiteSubmitItem key={siteSubmit.id} siteSubmit={siteSubmit} />
              ))}
            </SidebarModule>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PropertyDashboardSidebar;