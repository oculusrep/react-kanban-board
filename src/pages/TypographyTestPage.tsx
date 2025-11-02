import React, { useState } from 'react';
import FormattedField from '../components/shared/FormattedField';

const TypographyTestPage: React.FC = () => {
  const [purchasePrice, setPurchasePrice] = useState<number | null>(1250000);
  const [salePrice, setSalePrice] = useState<number | null>(1500000);
  const [commission, setCommission] = useState<number | null>(3.5);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Typography Test Page</h1>
        
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-form-heading font-medium text-gray-900 border-b pb-2 mb-4">
            Currency Fields - Test the New FormattedField
          </h2>
          
          <div className="space-y-4">
            <FormattedField
              label="Purchase Price"
              type="currency"
              value={purchasePrice}
              onChange={setPurchasePrice}
              helpText="Click to edit - NO spinner arrows!"
            />

            <FormattedField
              label="Sale Price (Large Green)"
              type="currency"
              value={salePrice}
              onChange={setSalePrice}
              showLarge
              colorScheme="green"
              helpText="Large display with green color"
            />

            <FormattedField
              label="Commission Rate"
              type="percentage"
              value={commission}
              onChange={setCommission}
              maxValue={100}
              helpText="Max 100%"
            />
          </div>

          <div className="mt-6 p-4 bg-blue-50 rounded">
            <h3 className="text-sm font-semibold mb-2">Current Values:</h3>
            <p className="text-xs">Purchase: ${purchasePrice}</p>
            <p className="text-xs">Sale: ${salePrice}</p>
            <p className="text-xs">Commission: {commission}%</p>
          </div>
        </div>

        <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Testing Checklist:</h2>
          <ul className="space-y-2 text-sm">
            <li>Click fields to edit</li>
            <li>Type directly without clicking</li>
            <li>Press Enter to save, Escape to cancel</li>
            <li>NO spinner arrows on number inputs!</li>
            <li>Consistent currency formatting</li>
            <li>Test on mobile (resize browser)</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default TypographyTestPage;
