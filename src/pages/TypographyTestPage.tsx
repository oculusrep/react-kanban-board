import React, { useState } from 'react';
import FormattedField from '../components/shared/FormattedField';

/**
 * Typography System Test Page
 *
 * Navigate to: /typography-test
 *
 * This page demonstrates:
 * 1. New FormattedField component (replaces 4 old components)
 * 2. Consistent currency formatting
 * 3. No number input arrows (removed via CSS)
 * 4. All typography using the new scale
 */
const TypographyTestPage: React.FC = () => {
  // Test values
  const [purchasePrice, setPurchasePrice] = useState<number | null>(1250000);
  const [salePrice, setSalePrice] = useState<number | null>(1500000);
  const [commission, setCommission] = useState<number | null>(3.5);
  const [brokerSplit, setBrokerSplit] = useState<number | null>(50);
  const [sqft, setSqft] = useState<number | null>(5000);
  const [units, setUnits] = useState<number | null>(24);
  const [capRate, setCapRate] = useState<number | null>(6.75);
  const [monthlyRent, setMonthlyRent] = useState<number | null>(45000);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-3xl font-bold text-gray-900">
            Typography System Test Page
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Test the new FormattedField component and typography system
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* Column 1: Currency Fields */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-form-heading font-medium text-gray-900 border-b border-gray-200 pb-2 mb-form-section-gap">
              Currency Fields
            </h2>

            <div className="space-y-form-field-gap">
              <FormattedField
                label="Purchase Price"
                type="currency"
                value={purchasePrice}
                onChange={setPurchasePrice}
                helpText="Standard currency field - click to edit"
              />

              <FormattedField
                label="Sale Price"
                type="currency"
                value={salePrice}
                onChange={setSalePrice}
                helpText="Try typing directly without clicking"
              />

              <FormattedField
                label="Total Value (Large Display)"
                type="currency"
                value={purchasePrice}
                onChange={setPurchasePrice}
                showLarge
                colorScheme="green"
                helpText="Large prominent display with green color"
              />

              <FormattedField
                label="Monthly Rent"
                type="currency"
                value={monthlyRent}
                onChange={setMonthlyRent}
                colorScheme="blue"
                helpText="Blue color scheme"
              />

              <FormattedField
                label="Budget (Max $10M)"
                type="currency"
                value={5000000}
                onChange={(val) => console.log('Budget:', val)}
                maxValue={10000000}
                helpText="Try entering more than $10M - it will cap"
                colorScheme="orange"
              />

              <FormattedField
                label="Read-only Price"
                type="currency"
                value={purchasePrice}
                onChange={setPurchasePrice}
                disabled
                helpText="This field is disabled"
              />
            </div>

            <div className="mt-6 p-4 bg-blue-50 rounded">
              <h3 className="text-sm font-semibold text-blue-900 mb-2">Current Values:</h3>
              <div className="text-xs text-blue-800 space-y-1">
                <p>Purchase Price: ${purchasePrice?.toLocaleString()}</p>
                <p>Sale Price: ${salePrice?.toLocaleString()}</p>
                <p>Monthly Rent: ${monthlyRent?.toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Column 2: Percentage & Number Fields */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-form-heading font-medium text-gray-900 border-b border-gray-200 pb-2 mb-form-section-gap">
              Percentage & Number Fields
            </h2>

            <div className="space-y-form-field-gap">
              <FormattedField
                label="Commission Rate"
                type="percentage"
                value={commission}
                onChange={setCommission}
                maxValue={100}
                helpText="Max 100% - try entering more"
              />

              <FormattedField
                label="Broker Split"
                type="percentage"
                value={brokerSplit}
                onChange={setBrokerSplit}
                maxValue={100}
                colorScheme="purple"
                helpText="Purple color scheme"
              />

              <FormattedField
                label="Cap Rate"
                type="percentage"
                value={capRate}
                onChange={setCapRate}
                showLarge
                colorScheme="green"
                decimalPlaces={2}
                helpText="Large display, 2 decimal places"
              />

              <FormattedField
                label="Number of Units"
                type="number"
                value={units}
                onChange={setUnits}
                decimalPlaces={0}
                helpText="Whole numbers only (0 decimal places)"
              />

              <FormattedField
                label="Square Feet"
                type="number"
                value={sqft}
                onChange={setSqft}
                decimalPlaces={0}
                helpText="Notice: NO spinner arrows! 🎉"
              />

              <FormattedField
                label="Measurement (3 decimals)"
                type="number"
                value={42.567}
                onChange={(val) => console.log('Measurement:', val)}
                decimalPlaces={3}
                helpText="Shows 3 decimal places"
              />
            </div>

            <div className="mt-6 p-4 bg-green-50 rounded">
              <h3 className="text-sm font-semibold text-green-900 mb-2">Current Values:</h3>
              <div className="text-xs text-green-800 space-y-1">
                <p>Commission: {commission}%</p>
                <p>Broker Split: {brokerSplit}%</p>
                <p>Cap Rate: {capRate}%</p>
                <p>Units: {units}</p>
                <p>Square Feet: {sqft}</p>
              </div>
            </div>
          </div>

          {/* Column 3: Color Schemes */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-form-heading font-medium text-gray-900 border-b border-gray-200 pb-2 mb-form-section-gap">
              Color Schemes
            </h2>

            <div className="space-y-form-field-gap">
              <FormattedField
                label="Green (Success/Profit)"
                type="currency"
                value={1000000}
                onChange={(val) => console.log(val)}
                colorScheme="green"
              />

              <FormattedField
                label="Blue (Information)"
                type="currency"
                value={1000000}
                onChange={(val) => console.log(val)}
                colorScheme="blue"
              />

              <FormattedField
                label="Purple (Premium)"
                type="currency"
                value={1000000}
                onChange={(val) => console.log(val)}
                colorScheme="purple"
              />

              <FormattedField
                label="Orange (Warning)"
                type="currency"
                value={1000000}
                onChange={(val) => console.log(val)}
                colorScheme="orange"
              />

              <FormattedField
                label="Gray (Default)"
                type="currency"
                value={1000000}
                onChange={(val) => console.log(val)}
                colorScheme="gray"
              />
            </div>
          </div>

          {/* Column 4: Typography Examples */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-form-heading font-medium text-gray-900 border-b border-gray-200 pb-2 mb-form-section-gap">
              Typography Scale Examples
            </h2>

            <div className="space-y-4">
              <div>
                <p className="text-xs text-gray-500 mb-1">text-modal-title (20px)</p>
                <p className="text-modal-title font-semibold text-gray-900">
                  Modal Title Text
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-500 mb-1">text-form-heading (18px)</p>
                <p className="text-form-heading font-medium text-gray-900">
                  Section Heading Text
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-500 mb-1">text-form-label (14px)</p>
                <p className="text-form-label font-medium text-gray-700">
                  Form Label Text
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-500 mb-1">text-form-input-lg (16px)</p>
                <p className="text-form-input-lg text-gray-900">
                  Large Input Text (used in FormattedField)
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-500 mb-1">text-form-help (12px)</p>
                <p className="text-form-help text-gray-500">
                  Help text for form fields
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-500 mb-1">text-display-value (18px)</p>
                <p className="text-display-value font-semibold text-green-700">
                  $1,250,000.00
                </p>
              </div>
            </div>

            <div className="mt-6 p-4 bg-purple-50 rounded">
              <h3 className="text-sm font-semibold text-purple-900 mb-2">Pro Tip:</h3>
              <p className="text-xs text-purple-800">
                All these sizes are defined in <code className="bg-purple-200 px-1 rounded">tailwind.config.js</code>.
                Change them there to update the ENTIRE app instantly!
              </p>
            </div>
          </div>

          {/* Full width: Testing Instructions */}
          <div className="lg:col-span-2 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg shadow p-6">
            <h2 className="text-form-heading font-medium text-gray-900 border-b border-gray-200 pb-2 mb-4">
              Testing Instructions
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">✅ What to Test:</h3>
                <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
                  <li>Click any field to edit</li>
                  <li>Type directly without clicking (field activates)</li>
                  <li>Press Enter to save, Escape to cancel</li>
                  <li>Try tabbing between fields</li>
                  <li>Check that there are NO spinner arrows on number fields</li>
                  <li>Try entering values above max (should cap)</li>
                  <li>Verify currency formatting is consistent</li>
                  <li>Test disabled fields (should not edit)</li>
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">📱 Test on Different Screens:</h3>
                <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
                  <li><strong>Desktop:</strong> You're here! ✓</li>
                  <li><strong>Tablet:</strong> Resize browser to ~768px</li>
                  <li><strong>Mobile:</strong> Resize browser to ~375px</li>
                  <li>Check that min-height (44px) works well for touch</li>
                  <li>Verify text is readable at all sizes</li>
                </ul>
              </div>

              <div className="md:col-span-2 bg-white rounded p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">🔍 Compare to Old Components:</h3>
                <p className="text-sm text-gray-700 mb-2">
                  This FormattedField component replaces:
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                  <div className="bg-red-50 p-2 rounded">
                    <p className="font-semibold text-red-900">❌ OLD (4 components):</p>
                    <ul className="list-disc list-inside mt-1">
                      <li>AssignmentCurrencyField</li>
                      <li>PropertyCurrencyField</li>
                      <li>AssignmentPercentField</li>
                      <li>PercentageInput</li>
                    </ul>
                  </div>
                  <div className="bg-green-50 p-2 rounded">
                    <p className="font-semibold text-green-900">✅ NEW (1 component):</p>
                    <ul className="list-disc list-inside mt-1">
                      <li>FormattedField (currency)</li>
                      <li>FormattedField (percentage)</li>
                      <li>FormattedField (number)</li>
                      <li className="font-semibold">Same behavior, one component!</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>Typography System Test Page • Branch: feature/unified-typography-system</p>
          <p className="mt-1">
            Edit typography globally in <code className="bg-gray-200 px-1 rounded">tailwind.config.js</code>
          </p>
        </div>
      </div>
    </div>
  );
};

export default TypographyTestPage;
