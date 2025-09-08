import React, { useState, useEffect } from 'react';
import PropertyDashboard from './PropertyDashboard';
import PropertyDashboardMobile from './PropertyDashboardMobile';
import { Database } from '../../../database-schema';

type Property = Database['public']['Tables']['property']['Row'];

interface ResponsivePropertyDashboardProps {
  propertyId?: string;
  mode?: 'view' | 'create';
  initialLocation?: { lat: number; lng: number };
  onSave?: (property: Property) => void;
  onBack?: () => void;
}

const ResponsivePropertyDashboard: React.FC<ResponsivePropertyDashboardProps> = (props) => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 1024); // lg breakpoint
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  if (isMobile) {
    return <PropertyDashboardMobile {...props} />;
  }

  return <PropertyDashboard {...props} />;
};

export default ResponsivePropertyDashboard;