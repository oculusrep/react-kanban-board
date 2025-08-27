import React from 'react';

interface SimplePercentageInputProps {
  value: number | null;
  onChange: (value: number | null) => void;
  className?: string;
}

const SimplePercentageInput: React.FC<SimplePercentageInputProps> = ({
  value,
  onChange,
  className = "w-full text-sm font-semibold text-gray-900 bg-transparent border-none outline-none"
}) => {
  return (
    <input
      type="number"
      step="0.1"
      value={value || 0}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
      className={className}
    />
  );
};

export default SimplePercentageInput;