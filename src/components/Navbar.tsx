import React, { useState, useRef, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import MasterSearchBox from "./MasterSearchBox";
import DedicatedSearchModal from "./DedicatedSearchModal";
import { useMasterSearch } from "../hooks/useMasterSearch";

interface DropdownMenuProps {
  title: string;
  items: Array<{
    label: string;
    action: () => void;
    type?: 'link' | 'search';
  }>;
}

const DropdownMenu: React.FC<DropdownMenuProps> = ({ title, items }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
        <div className="absolute left-0 mt-2 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-50">
          <div className="py-1">
            {items.map((item, index) => (
              <button
                key={index}
                onClick={() => {
                  item.action();
                  setIsOpen(false);
                }}
                className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
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
  const { searchByType } = useMasterSearch();

  const [searchModals, setSearchModals] = useState({
    properties: false,
    contacts: false,
    deals: false,
  });

  const linkClass = (path: string) =>
    `px-4 py-2 rounded hover:bg-blue-100 ${
      location.pathname === path ? "bg-blue-200 font-semibold" : ""
    }`;

  const handleSignOut = async () => {
    await signOut();
  };

  const handleSearch = async (query: string, type: 'deal' | 'client' | 'contact' | 'property' | 'site_submit') => {
    if (!query.trim()) return [];
    
    try {
      const results = await searchByType(query, type, 20);
      return results;
    } catch (error) {
      console.error(`Error searching ${type}:`, error);
      return [];
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

  return (
    <nav className="bg-white shadow p-4">
      <div className="flex justify-between items-center">
        {/* Left side navigation */}
        <div className="flex items-center space-x-4">
          <Link to="/master-pipeline" className={linkClass("/master-pipeline")}>
            Master Pipeline
          </Link>
          
          <DropdownMenu title="Properties" items={propertiesItems} />
          <DropdownMenu title="Contacts" items={contactsItems} />
          <DropdownMenu title="Deals" items={dealsItems} />
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
          onSearch={(query) => handleSearch(query, 'property')}
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
          onSearch={(query) => handleSearch(query, 'contact')}
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
          onSearch={(query) => handleSearch(query, 'deal')}
          onSelect={(result) => {
            navigate(result.url || '/');
            setSearchModals(prev => ({ ...prev, deals: false }));
          }}
        />
      )}
    </nav>
  );
}
