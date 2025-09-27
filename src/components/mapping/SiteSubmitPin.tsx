import React from 'react';
import {
  Edit, Upload, Eye, UserCheck, FileText, Navigation,
  HandHeart, Shield, CheckCircle, Construction, Store,
  DollarSign, Search, Target, MapPin, XCircle, Ban,
  Pause, AlertCircle
} from 'lucide-react';
import { STAGE_CONFIGURATIONS } from './utils/stageMarkers';

interface SiteSubmitPinProps {
  stageName: string;
  size?: number;
  onClick?: () => void;
  className?: string;
  showTooltip?: boolean;
}

export const SiteSubmitPin: React.FC<SiteSubmitPinProps> = ({
  stageName,
  size = 32,
  onClick,
  className = '',
  showTooltip = false
}) => {
  const getStageConfig = (stage: string) => {
    const iconMap: Record<string, any> = {
      'Pre-Submittal': Edit,
      'Ready to Submit': Upload,
      'Submitted-Reviewing': Eye,  // Legacy name - not in actual DB
      'Mike to Review': UserCheck,
      'LOI': FileText,
      'Tour': Navigation,
      'At Lease/PSA': HandHeart,
      'Under Contract / Contingent': Shield,
      'Executed Deal': CheckCircle,
      'Closed - Under Construction': Construction,
      'Store Open': Store,
      'Booked': DollarSign,
      'Protected': Shield,
      'Monitor': Search,
      'Pursuing Ownership': Target,
      'Unassigned Territory': MapPin,
      'Lost / Killed': XCircle,
      'Pass': Ban,
      'Not Available': Pause,
      'Use Conflict': AlertCircle,
      'Use Declined': XCircle
    };

    const stageConfig = STAGE_CONFIGURATIONS[stage];
    const icon = iconMap[stage] || Search;

    return {
      icon,
      color: stageConfig?.color || '#3b82f6',
      category: stageConfig?.category || 'monitoring'
    };
  };

  const config = getStageConfig(stageName);
  const Icon = config.icon;

  // Convert hex color to Tailwind background class
  const getBgClass = (color: string) => {
    const colorMap: Record<string, string> = {
      '#64748b': 'bg-slate-500',
      '#3b82f6': 'bg-blue-500',
      '#2563eb': 'bg-blue-600',
      '#f97316': 'bg-orange-500',
      '#ca8a04': 'bg-yellow-600',
      '#6366f1': 'bg-indigo-500',
      '#a855f7': 'bg-purple-500',
      '#9333ea': 'bg-purple-600',
      '#7c3aed': 'bg-purple-700',
      '#c2410c': 'bg-orange-700',
      '#15803d': 'bg-green-700',
      '#22c55e': 'bg-green-500',
      '#0891b2': 'bg-teal-600',
      '#0ea5e9': 'bg-sky-500',
      '#dc2626': 'bg-red-600',
      '#6b7280': 'bg-gray-500',
      '#1f2937': 'bg-gray-800',
      '#4b5563': 'bg-gray-600',
      '#a16207': 'bg-amber-700',
      '#991b1b': 'bg-red-800'
    };
    return colorMap[color] || 'bg-blue-500';
  };

  return (
    <div className="relative group">
      <div
        className={`${getBgClass(config.color)} rounded-full flex items-center justify-center border-2 border-white cursor-pointer hover:scale-110 transition-all duration-200 relative ${className}`}
        style={{
          width: size,
          height: size,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
          filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1))'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.25)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
        }}
        onClick={onClick}
      >
        <Icon className="text-white" style={{ width: size * 0.5, height: size * 0.5 }} />

        {/* Pin tail - proportional to size */}
        <div
          className={`absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0`}
          style={{
            borderLeft: `${size * 0.09}px solid transparent`,
            borderRight: `${size * 0.09}px solid transparent`,
            borderTop: `${size * 0.19}px solid ${config.color}`
          }}
        />
      </div>

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-black text-white text-xs rounded whitespace-nowrap z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          {stageName}
        </div>
      )}
    </div>
  );
};

// Export stage categories for legend organization
export const STAGE_CATEGORIES = {
  pipeline: {
    name: 'Pipeline',
    color: 'bg-blue-100 border-blue-300',
    stages: ['Pre-Submittal', 'Ready to Submit', 'Submitted-Reviewing']
  },
  review: {
    name: 'Under Review',
    color: 'bg-orange-100 border-orange-300',
    stages: ['Mike to Review', 'LOI', 'Tour']
  },
  contract: {
    name: 'Contract Phase',
    color: 'bg-purple-100 border-purple-300',
    stages: ['At Lease/PSA', 'Under Contract / Contingent', 'Executed Deal']
  },
  construction: {
    name: 'Construction',
    color: 'bg-orange-100 border-orange-400',
    stages: ['Closed - Under Construction', 'Store Open']
  },
  success: {
    name: 'Success',
    color: 'bg-green-100 border-green-300',
    stages: ['Booked', 'Protected']
  },
  monitoring: {
    name: 'Monitoring',
    color: 'bg-sky-100 border-sky-300',
    stages: ['Monitor', 'Pursuing Ownership', 'Unassigned Territory']
  },
  declined: {
    name: 'Declined/Ended',
    color: 'bg-gray-100 border-gray-300',
    stages: ['Lost / Killed', 'Pass', 'Not Available', 'Use Conflict', 'Use Declined']
  }
} as const;

export default SiteSubmitPin;