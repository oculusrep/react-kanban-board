import React, { useState, useRef, useEffect, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import MasterSearchBox from "./MasterSearchBox";
import DedicatedSearchModal from "./DedicatedSearchModal";
import { useRecentlyViewed, RecentItem } from "../hooks/useRecentlyViewed";

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
        'Clients': 'client'
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

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { getRecentItems } = useRecentlyViewed();
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Refresh recent items when location changes
  useEffect(() => {
    setRefreshTrigger(prev => prev + 1);
  }, [location.pathname]);

  const [searchModals, setSearchModals] = useState({
    properties: false,
    contacts: false,
    deals: false,
    assignments: false,
    clients: false,
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

  return (
    <nav className="bg-white shadow p-4">
      <div className="flex justify-between items-center">
        {/* Left side navigation */}
        <div className="flex items-center space-x-4">
          <Link to="/master-pipeline" className={linkClass("/master-pipeline")}>
            Master Pipeline
          </Link>
          <Link to="/notes-debug" className={linkClass("/notes-debug")}>
            Notes
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
        </div>
        
        {/* Center search box */}
        <div className="flex-1 max-w-2xl mx-8">
          <MasterSearchBox />
        </div>
        
        {/* Right side user menu */}
        {user && (
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-600">
              {user.email}
            </span>
            <button
              onClick={handleSignOut}
              className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
            >
              Sign Out
            </button>
          </div>
        )}
      </div>

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
    </nav>
  );
}
