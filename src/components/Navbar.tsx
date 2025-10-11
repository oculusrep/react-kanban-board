import React, { useState, useRef, useEffect, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import MasterSearchBox from "./MasterSearchBox";
import DedicatedSearchModal from "./DedicatedSearchModal";
import { useRecentlyViewed, RecentItem } from "../hooks/useRecentlyViewed";
import { supabase } from "../lib/supabaseClient";

interface DropdownMenuProps {
  title: string;
  items: Array<{
    label: string;
    action: () => void;
    type?: 'link' | 'search';
  }>;
  recentItems?: RecentItem[];
  onRecentItemClick?: (item: RecentItem) => void;
}

const DropdownMenu: React.FC<DropdownMenuProps> = ({ title, items, recentItems, onRecentItemClick }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentRecentItems, setCurrentRecentItems] = useState(recentItems || []);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { getRecentItems } = useRecentlyViewed();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Refresh recent items when dropdown opens
  useEffect(() => {
    if (isOpen && title) {
      // Map dropdown titles to recent item types
      const titleToTypeMap: { [key: string]: RecentItem['type'] } = {
        'Properties': 'property',
        'Contacts': 'contact',
        'Deals': 'deal',
        'Assignments': 'assignment',
        'Clients': 'client',
        'Site Submits': 'site_submit'
      };

      const type = titleToTypeMap[title];
      if (type) {
        const fresh = getRecentItems(type);
        setCurrentRecentItems(fresh);
      }
    }
  }, [isOpen, title, getRecentItems]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center px-4 py-2 rounded hover:bg-blue-100 transition-colors"
      >
        {title}
        <svg 
          className={`w-4 h-4 ml-1 transition-transform ${isOpen ? 'rotate-180' : ''}`} 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-64 bg-white border border-gray-200 rounded-md shadow-lg z-50">
          <div className="py-1">
            {/* Recent Items Section */}
            {currentRecentItems && currentRecentItems.length > 0 && (
              <>
                <div className="px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-100">
                  Recently Viewed
                </div>
                {currentRecentItems.map((item, index) => (
                  <button
                    key={`recent-${index}`}
                    onClick={() => {
                      onRecentItemClick?.(item);
                      setIsOpen(false);
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 transition-colors"
                  >
                    <div className="truncate font-medium">{item.name}</div>
                    {item.subtitle && (
                      <div className="text-xs text-gray-500 truncate">{item.subtitle}</div>
                    )}
                  </button>
                ))}
                <div className="border-b border-gray-100 my-1" />
              </>
            )}

            {/* Regular Menu Items */}
            {items.map((item, index) => (
              <button
                key={index}
                onClick={() => {
                  item.action();
                  setIsOpen(false);
                }}
                className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors font-medium"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Helper function to get user initials
const getUserInitials = (firstName?: string, lastName?: string): string => {
  if (firstName && lastName) {
    return (firstName[0] + lastName[0]).toUpperCase();
  }
  if (firstName) {
    return firstName.substring(0, 2).toUpperCase();
  }
  return 'U';
};

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { getRecentItems } = useRecentlyViewed();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isReportsMenuOpen, setIsReportsMenuOpen] = useState(false);
  const reportsMenuRef = useRef<HTMLDivElement>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const [expandedSections, setExpandedSections] = useState<{[key: string]: boolean}>({});
  const [userProfile, setUserProfile] = useState<{ first_name?: string; last_name?: string } | null>(null);

  // Refresh recent items when location changes
  useEffect(() => {
    setRefreshTrigger(prev => prev + 1);
  }, [location.pathname]);

  // Fetch user profile data
  useEffect(() => {
    const fetchUserProfile = async () => {
      if (user?.email) {
        const { data, error } = await supabase
          .from('user')
          .select('first_name, last_name')
          .eq('email', user.email)
          .single();

        if (data && !error) {
          setUserProfile(data);
        }
      }
    };

    fetchUserProfile();
  }, [user]);

  // Close reports menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (reportsMenuRef.current && !reportsMenuRef.current.contains(event.target as Node)) {
        setIsReportsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setIsMobileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  const [searchModals, setSearchModals] = useState({
    properties: false,
    contacts: false,
    deals: false,
    assignments: false,
    clients: false,
    siteSubmits: false,
  });

  const linkClass = (path: string) =>
    `px-4 py-2 rounded hover:bg-blue-100 ${
      location.pathname === path ? "bg-blue-200 font-semibold" : ""
    }`;

  const handleSignOut = async () => {
    await signOut();
  };


  const handleRecentItemClick = (item: RecentItem) => {
    // Navigate to the appropriate detail page based on item type
    switch (item.type) {
      case 'deal':
        navigate(`/deal/${item.id}`);
        break;
      case 'property':
        navigate(`/property/${item.id}`);
        break;
      case 'contact':
        navigate(`/contact/${item.id}`);
        break;
      case 'assignment':
        navigate(`/assignment/${item.id}`);
        break;
      case 'client':
        navigate(`/client/${item.id}`);
        break;
      case 'site_submit':
        navigate(`/site-submit/${item.id}`);
        break;
      default:
        console.warn('Unknown item type:', item.type);
    }
  };

  // Dropdown menu items
  const propertiesItems = [
    {
      label: "Add New Property",
      action: () => navigate('/property/new')
    },
    {
      label: "Search Properties",
      action: () => setSearchModals(prev => ({ ...prev, properties: true }))
    }
  ];

  const contactsItems = [
    {
      label: "Add New Contact",
      action: () => navigate('/contact/new')
    },
    {
      label: "Search Contacts", 
      action: () => setSearchModals(prev => ({ ...prev, contacts: true }))
    }
  ];

  const dealsItems = [
    {
      label: "Add New Deal",
      action: () => navigate('/deal/new')
    },
    {
      label: "Search Deals",
      action: () => setSearchModals(prev => ({ ...prev, deals: true }))
    }
  ];

  const assignmentsItems = [
    {
      label: "Add New Assignment",
      action: () => navigate('/assignment/new')
    },
    {
      label: "Search Assignments",
      action: () => setSearchModals(prev => ({ ...prev, assignments: true }))
    }
  ];

  const clientsItems = [
    {
      label: "Add New Client",
      action: () => navigate('/client/new')
    },
    {
      label: "Search Clients",
      action: () => setSearchModals(prev => ({ ...prev, clients: true }))
    }
  ];

  const siteSubmitsItems = [
    {
      label: "Add New Site Submit",
      action: () => navigate('/site-submit/new')
    },
    {
      label: "Search Site Submits",
      action: () => setSearchModals(prev => ({ ...prev, siteSubmits: true }))
    }
  ];

  return (
    <nav className="bg-white shadow xl:p-4 p-2">
      <div className="flex justify-between items-center">
        {/* Mobile: Hamburger Menu Button */}
        <div className="xl:hidden">
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-1.5 rounded hover:bg-blue-100 transition-colors"
            aria-label="Menu"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d={isMobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"}
              />
            </svg>
          </button>
        </div>

        {/* Desktop: Left side navigation */}
        <div className="hidden xl:flex items-center space-x-4">
          {/* Reports Menu - Hamburger Icon */}
          <div className="relative" ref={reportsMenuRef}>
            <button
              onClick={() => setIsReportsMenuOpen(!isReportsMenuOpen)}
              className="p-2 rounded hover:bg-blue-100 transition-colors"
              aria-label="Reports Menu"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>

            {isReportsMenuOpen && (
              <div className="absolute left-0 mt-2 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-50">
                <div className="py-1">
                  <button
                    onClick={() => {
                      navigate('/reports');
                      setIsReportsMenuOpen(false);
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors font-medium"
                  >
                    📊 Reports
                  </button>
                  <button
                    onClick={() => {
                      navigate('/notes-debug');
                      setIsReportsMenuOpen(false);
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors font-medium"
                  >
                    📝 Notes
                  </button>
                </div>
              </div>
            )}
          </div>

          <Link to="/master-pipeline" className={linkClass("/master-pipeline")}>
            Master Pipeline
          </Link>
          <Link to="/mapping" className={linkClass("/mapping")}>
            🗺️ Map
          </Link>
          
          <DropdownMenu
            title="Properties"
            items={propertiesItems}
            recentItems={getRecentItems('property')}
            onRecentItemClick={handleRecentItemClick}
            key={`properties-${refreshTrigger}`}
          />
          <DropdownMenu
            title="Contacts"
            items={contactsItems}
            recentItems={getRecentItems('contact')}
            onRecentItemClick={handleRecentItemClick}
            key={`contacts-${refreshTrigger}`}
          />
          <DropdownMenu
            title="Deals"
            items={dealsItems}
            recentItems={getRecentItems('deal')}
            onRecentItemClick={handleRecentItemClick}
            key={`deals-${refreshTrigger}`}
          />
          <DropdownMenu
            title="Assignments"
            items={assignmentsItems}
            recentItems={getRecentItems('assignment')}
            onRecentItemClick={handleRecentItemClick}
            key={`assignments-${refreshTrigger}`}
          />
          <DropdownMenu
            title="Clients"
            items={clientsItems}
            recentItems={getRecentItems('client')}
            onRecentItemClick={handleRecentItemClick}
            key={`clients-${refreshTrigger}`}
          />
          <DropdownMenu
            title="Site Submits"
            items={siteSubmitsItems}
            recentItems={getRecentItems('site_submit')}
            onRecentItemClick={handleRecentItemClick}
            key={`siteSubmits-${refreshTrigger}`}
          />
        </div>

        {/* Desktop: Center search box */}
        <div className="hidden xl:flex flex-1 max-w-2xl mx-8">
          <MasterSearchBox />
        </div>

        {/* Desktop: Right side user menu */}
        {user && (
          <div className="hidden xl:flex items-center space-x-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white font-semibold text-sm">
              {getUserInitials(userProfile?.first_name, userProfile?.last_name)}
            </div>
            <button
              onClick={handleSignOut}
              className="p-1.5 rounded hover:bg-red-50 transition-colors text-red-600 hover:text-red-700"
              aria-label="Sign Out"
              title="Sign Out"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        )}

        {/* Mobile: Simple logo or title */}
        <div className="xl:hidden flex-1 text-center text-sm font-semibold text-gray-800">
          OVIS
        </div>

        {/* Mobile: Placeholder for alignment */}
        <div className="xl:hidden w-8"></div>
      </div>

      {/* Mobile Menu Sidebar */}
      {isMobileMenuOpen && (
        <div
          ref={mobileMenuRef}
          className="xl:hidden fixed inset-y-0 left-0 w-80 bg-white shadow-2xl z-50 overflow-y-auto"
        >
          <div className="p-4">
            {/* Mobile Menu Header */}
            <div className="flex justify-between items-center mb-6 pb-4 border-b">
              <h2 className="text-xl font-bold text-gray-800">Menu</h2>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-2 rounded hover:bg-gray-100"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Navigation Section */}
            <div className="mb-6">
              <div className="text-sm font-medium text-gray-500 uppercase mb-2">Navigation</div>
              <div className="space-y-1">
                <button
                  onClick={() => navigate('/master-pipeline')}
                  className="w-full text-left px-4 py-2 rounded hover:bg-blue-50 text-gray-700"
                >
                  Master Pipeline
                </button>
                <button
                  onClick={() => navigate('/mapping')}
                  className="w-full text-left px-4 py-2 rounded hover:bg-blue-50 text-gray-700"
                >
                  🗺️ Map
                </button>
              </div>
            </div>

            {/* Properties Section */}
            <div className="mb-2">
              <button
                onClick={() => setExpandedSections(prev => ({ ...prev, properties: !prev.properties }))}
                className="w-full flex items-center justify-between px-4 py-2 rounded hover:bg-gray-100 text-gray-700 font-medium"
              >
                <span>Properties</span>
                <svg
                  className={`w-4 h-4 transition-transform ${expandedSections.properties ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedSections.properties && (
                <div className="space-y-1 mt-1 ml-4">
                  <button
                    onClick={() => {
                      navigate('/property/new');
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full text-left px-4 py-2 rounded hover:bg-blue-50 text-gray-700 text-sm"
                  >
                    ➕ Add New
                  </button>
                  <button
                    onClick={() => {
                      setSearchModals(prev => ({ ...prev, properties: true }));
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full text-left px-4 py-2 rounded hover:bg-gray-100 text-gray-700 text-sm"
                  >
                    🔍 Search
                  </button>
                  {getRecentItems('property').slice(0, 3).map((item, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        navigate(`/property/${item.id}`);
                        setIsMobileMenuOpen(false);
                      }}
                      className="w-full text-left px-4 py-2 rounded hover:bg-gray-100 text-sm text-gray-600"
                    >
                      📍 {item.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Contacts Section */}
            <div className="mb-2">
              <button
                onClick={() => setExpandedSections(prev => ({ ...prev, contacts: !prev.contacts }))}
                className="w-full flex items-center justify-between px-4 py-2 rounded hover:bg-gray-100 text-gray-700 font-medium"
              >
                <span>Contacts</span>
                <svg
                  className={`w-4 h-4 transition-transform ${expandedSections.contacts ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedSections.contacts && (
                <div className="space-y-1 mt-1 ml-4">
                  <button
                    onClick={() => {
                      navigate('/contact/new');
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full text-left px-4 py-2 rounded hover:bg-blue-50 text-gray-700 text-sm"
                  >
                    ➕ Add New
                  </button>
                  <button
                    onClick={() => {
                      setSearchModals(prev => ({ ...prev, contacts: true }));
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full text-left px-4 py-2 rounded hover:bg-gray-100 text-gray-700 text-sm"
                  >
                    🔍 Search
                  </button>
                  {getRecentItems('contact').slice(0, 3).map((item, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        navigate(`/contact/${item.id}`);
                        setIsMobileMenuOpen(false);
                      }}
                      className="w-full text-left px-4 py-2 rounded hover:bg-gray-100 text-sm text-gray-600"
                    >
                      👤 {item.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Deals Section */}
            <div className="mb-2">
              <button
                onClick={() => setExpandedSections(prev => ({ ...prev, deals: !prev.deals }))}
                className="w-full flex items-center justify-between px-4 py-2 rounded hover:bg-gray-100 text-gray-700 font-medium"
              >
                <span>Deals</span>
                <svg
                  className={`w-4 h-4 transition-transform ${expandedSections.deals ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedSections.deals && (
                <div className="space-y-1 mt-1 ml-4">
                  <button
                    onClick={() => {
                      navigate('/deal/new');
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full text-left px-4 py-2 rounded hover:bg-blue-50 text-gray-700 text-sm"
                  >
                    ➕ Add New
                  </button>
                  <button
                    onClick={() => {
                      setSearchModals(prev => ({ ...prev, deals: true }));
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full text-left px-4 py-2 rounded hover:bg-gray-100 text-gray-700 text-sm"
                  >
                    🔍 Search
                  </button>
                  {getRecentItems('deal').slice(0, 3).map((item, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        navigate(`/deal/${item.id}`);
                        setIsMobileMenuOpen(false);
                      }}
                      className="w-full text-left px-4 py-2 rounded hover:bg-gray-100 text-sm text-gray-600"
                    >
                      💼 {item.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Assignments Section */}
            <div className="mb-2">
              <button
                onClick={() => setExpandedSections(prev => ({ ...prev, assignments: !prev.assignments }))}
                className="w-full flex items-center justify-between px-4 py-2 rounded hover:bg-gray-100 text-gray-700 font-medium"
              >
                <span>Assignments</span>
                <svg
                  className={`w-4 h-4 transition-transform ${expandedSections.assignments ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedSections.assignments && (
                <div className="space-y-1 mt-1 ml-4">
                  <button
                    onClick={() => {
                      navigate('/assignment/new');
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full text-left px-4 py-2 rounded hover:bg-blue-50 text-gray-700 text-sm"
                  >
                    ➕ Add New
                  </button>
                  <button
                    onClick={() => {
                      setSearchModals(prev => ({ ...prev, assignments: true }));
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full text-left px-4 py-2 rounded hover:bg-gray-100 text-gray-700 text-sm"
                  >
                    🔍 Search
                  </button>
                </div>
              )}
            </div>

            {/* Clients Section */}
            <div className="mb-2">
              <button
                onClick={() => setExpandedSections(prev => ({ ...prev, clients: !prev.clients }))}
                className="w-full flex items-center justify-between px-4 py-2 rounded hover:bg-gray-100 text-gray-700 font-medium"
              >
                <span>Clients</span>
                <svg
                  className={`w-4 h-4 transition-transform ${expandedSections.clients ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedSections.clients && (
                <div className="space-y-1 mt-1 ml-4">
                  <button
                    onClick={() => {
                      navigate('/client/new');
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full text-left px-4 py-2 rounded hover:bg-blue-50 text-gray-700 text-sm"
                  >
                    ➕ Add New
                  </button>
                  <button
                    onClick={() => {
                      setSearchModals(prev => ({ ...prev, clients: true }));
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full text-left px-4 py-2 rounded hover:bg-gray-100 text-gray-700 text-sm"
                  >
                    🔍 Search
                  </button>
                </div>
              )}
            </div>

            {/* Site Submits Section */}
            <div className="mb-6">
              <button
                onClick={() => setExpandedSections(prev => ({ ...prev, siteSubmits: !prev.siteSubmits }))}
                className="w-full flex items-center justify-between px-4 py-2 rounded hover:bg-gray-100 text-gray-700 font-medium"
              >
                <span>Site Submits</span>
                <svg
                  className={`w-4 h-4 transition-transform ${expandedSections.siteSubmits ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedSections.siteSubmits && (
                <div className="space-y-1 mt-1 ml-4">
                  <button
                    onClick={() => {
                      navigate('/site-submit/new');
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full text-left px-4 py-2 rounded hover:bg-blue-50 text-gray-700 text-sm"
                  >
                    ➕ Add New
                  </button>
                  <button
                    onClick={() => {
                      setSearchModals(prev => ({ ...prev, siteSubmits: true }));
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full text-left px-4 py-2 rounded hover:bg-gray-100 text-gray-700 text-sm"
                  >
                    🔍 Search
                  </button>
                  {getRecentItems('site_submit').slice(0, 3).map((item, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        navigate(`/site-submit/${item.id}`);
                        setIsMobileMenuOpen(false);
                      }}
                      className="w-full text-left px-4 py-2 rounded hover:bg-gray-100 text-sm text-gray-600"
                    >
                      📋 {item.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Reports & Notes Section */}
            <div className="mb-6">
              <div className="text-sm font-medium text-gray-500 uppercase mb-2">Other</div>
              <div className="space-y-1">
                <button
                  onClick={() => {
                    navigate('/reports');
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 rounded hover:bg-blue-50 text-gray-700"
                >
                  📊 Reports
                </button>
                <button
                  onClick={() => {
                    navigate('/notes-debug');
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 rounded hover:bg-blue-50 text-gray-700"
                >
                  📝 Notes
                </button>
              </div>
            </div>

            {/* User Section - Footer */}
            {user && (
              <div className="pt-6 mt-6 border-t">
                <div className="mb-4 px-4">
                  <div className="text-xs text-gray-500 uppercase mb-1">Signed in as</div>
                  <div className="text-sm text-gray-700 font-medium truncate">{user.email}</div>
                </div>
                <button
                  onClick={() => {
                    handleSignOut();
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mobile Menu Backdrop */}
      {isMobileMenuOpen && (
        <div
          className="xl:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}


      {/* Dedicated Search Modals */}
      {searchModals.properties && (
        <DedicatedSearchModal
          isOpen={searchModals.properties}
          onClose={() => setSearchModals(prev => ({ ...prev, properties: false }))}
          title="Search Properties"
          searchType="property"
          onSelect={(result) => {
            navigate(result.url || '/');
            setSearchModals(prev => ({ ...prev, properties: false }));
          }}
        />
      )}

      {searchModals.contacts && (
        <DedicatedSearchModal
          isOpen={searchModals.contacts}
          onClose={() => setSearchModals(prev => ({ ...prev, contacts: false }))}
          title="Search Contacts"
          searchType="contact"
          onSelect={(result) => {
            navigate(result.url || '/');
            setSearchModals(prev => ({ ...prev, contacts: false }));
          }}
        />
      )}

      {searchModals.deals && (
        <DedicatedSearchModal
          isOpen={searchModals.deals}
          onClose={() => setSearchModals(prev => ({ ...prev, deals: false }))}
          title="Search Deals"
          searchType="deal"
          onSelect={(result) => {
            navigate(result.url || '/');
            setSearchModals(prev => ({ ...prev, deals: false }));
          }}
        />
      )}

      {searchModals.assignments && (
        <DedicatedSearchModal
          isOpen={searchModals.assignments}
          onClose={() => setSearchModals(prev => ({ ...prev, assignments: false }))}
          title="Search Assignments"
          searchType="assignment"
          onSelect={(result) => {
            navigate(result.url || '/');
            setSearchModals(prev => ({ ...prev, assignments: false }));
          }}
        />
      )}

      {searchModals.clients && (
        <DedicatedSearchModal
          isOpen={searchModals.clients}
          onClose={() => setSearchModals(prev => ({ ...prev, clients: false }))}
          title="Search Clients"
          searchType="client"
          onSelect={(result) => {
            navigate(result.url || '/');
            setSearchModals(prev => ({ ...prev, clients: false }));
          }}
        />
      )}

      {searchModals.siteSubmits && (
        <DedicatedSearchModal
          isOpen={searchModals.siteSubmits}
          onClose={() => setSearchModals(prev => ({ ...prev, siteSubmits: false }))}
          title="Search Site Submits"
          searchType="site_submit"
          onSelect={(result) => {
            navigate(result.url || '/');
            setSearchModals(prev => ({ ...prev, siteSubmits: false }));
          }}
        />
      )}
    </nav>
  );
}
