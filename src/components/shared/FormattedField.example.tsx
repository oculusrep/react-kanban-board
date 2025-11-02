/**
 * FormattedField Component - Usage Examples
 *
 * This component REPLACES:
 * - AssignmentCurrencyField
 * - PropertyCurrencyField
 * - AssignmentPercentField
 * - PercentageInput
 * - FormattedInput
 *
 * ONE component to rule them all!
 */

import React, { useState } from 'react';
import FormattedField from './FormattedField';

export const FormattedFieldExamples: React.FC = () => {
  const [currencyValue, setCurrencyValue] = useState<number | null>(1250.50);
  const [percentValue, setPercentValue] = useState<number | null>(15.5);
  const [numberValue, setNumberValue] = useState<number | null>(42);

  return (
    <div className="p-8 space-y-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-4">FormattedField Examples</h1>

      {/* CURRENCY EXAMPLES */}
      <section>
        <h2 className="text-xl font-semibold mb-4">Currency Fields</h2>

        <div className="space-y-4">
          {/* Basic currency field */}
          <FormattedField
            label="Purchase Price"
            type="currency"
            value={currencyValue}
            onChange={setCurrencyValue}
            helpText="Click to edit the value"
          />

          {/* Large prominent currency display */}
          <FormattedField
            label="Total Value"
            type="currency"
            value={currencyValue}
            onChange={setCurrencyValue}
            showLarge
            colorScheme="green"
            helpText="Large display with green text"
          />

          {/* Currency with max value */}
          <FormattedField
            label="Budget (max $10,000)"
            type="currency"
            value={5000}
            onChange={(val) => console.log('Budget changed:', val)}
            maxValue={10000}
            helpText="Cannot exceed $10,000"
          />

          {/* Disabled currency field */}
          <FormattedField
            label="Read-only Price"
            type="currency"
            value={currencyValue}
            onChange={setCurrencyValue}
            disabled
            helpText="This field is disabled"
          />
        </div>
      </section>

      {/* PERCENTAGE EXAMPLES */}
      <section>
        <h2 className="text-xl font-semibold mb-4">Percentage Fields</h2>

        <div className="space-y-4">
          {/* Basic percentage */}
          <FormattedField
            label="Commission Rate"
            type="percentage"
            value={percentValue}
            onChange={setPercentValue}
            maxValue={100}
            helpText="Enter percentage (max 100%)"
          />

          {/* Percentage with custom decimal places */}
          <FormattedField
            label="Interest Rate"
            type="percentage"
            value={3.75}
            onChange={(val) => console.log('Interest:', val)}
            decimalPlaces={3}
            helpText="Shows 3 decimal places"
          />

          {/* Large percentage display */}
          <FormattedField
            label="Completion %"
            type="percentage"
            value={percentValue}
            onChange={setPercentValue}
            showLarge
            colorScheme="blue"
          />
        </div>
      </section>

      {/* NUMBER EXAMPLES */}
      <section>
        <h2 className="text-xl font-semibold mb-4">Number Fields</h2>

        <div className="space-y-4">
          {/* Basic number */}
          <FormattedField
            label="Quantity"
            type="number"
            value={numberValue}
            onChange={setNumberValue}
            decimalPlaces={0}
            helpText="Whole numbers only"
          />

          {/* Number with decimals */}
          <FormattedField
            label="Measurement"
            type="number"
            value={42.567}
            onChange={(val) => console.log('Measurement:', val)}
            decimalPlaces={3}
            helpText="3 decimal places"
          />
        </div>
      </section>

      {/* COLOR SCHEME EXAMPLES */}
      <section>
        <h2 className="text-xl font-semibold mb-4">Color Schemes</h2>

        <div className="space-y-4">
          <FormattedField
            label="Green (Profit)"
            type="currency"
            value={1000}
            onChange={(val) => console.log(val)}
            colorScheme="green"
          />

          <FormattedField
            label="Blue (Information)"
            type="currency"
            value={1000}
            onChange={(val) => console.log(val)}
            colorScheme="blue"
          />

          <FormattedField
            label="Purple (Premium)"
            type="currency"
            value={1000}
            onChange={(val) => console.log(val)}
            colorScheme="purple"
          />

          <FormattedField
            label="Orange (Warning)"
            type="currency"
            value={1000}
            onChange={(val) => console.log(val)}
            colorScheme="orange"
          />

          <FormattedField
            label="Gray (Default)"
            type="currency"
            value={1000}
            onChange={(val) => console.log(val)}
            colorScheme="gray"
          />
        </div>
      </section>

      {/* MIGRATION EXAMPLES */}
      <section className="bg-blue-50 p-4 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">Migration Guide</h2>

        <div className="space-y-4 text-sm">
          <div>
            <h3 className="font-semibold mb-2">Old AssignmentCurrencyField:</h3>
            <pre className="bg-gray-800 text-white p-2 rounded overflow-x-auto">
{`<AssignmentCurrencyField
  label="Price"
  value={price}
  onChange={setPrice}
  helpText="Enter price"
/>`}
            </pre>
          </div>

          <div>
            <h3 className="font-semibold mb-2">New FormattedField:</h3>
            <pre className="bg-gray-800 text-white p-2 rounded overflow-x-auto">
{`<FormattedField
  label="Price"
  type="currency"
  value={price}
  onChange={setPrice}
  helpText="Enter price"
/>`}
            </pre>
          </div>

          <div className="mt-4">
            <h3 className="font-semibold mb-2">Old AssignmentPercentField:</h3>
            <pre className="bg-gray-800 text-white p-2 rounded overflow-x-auto">
{`<AssignmentPercentField
  label="Rate"
  value={rate}
  onChange={setRate}
/>`}
            </pre>
          </div>

          <div>
            <h3 className="font-semibold mb-2">New FormattedField:</h3>
            <pre className="bg-gray-800 text-white p-2 rounded overflow-x-auto">
{`<FormattedField
  label="Rate"
  type="percentage"
  value={rate}
  onChange={setRate}
/>`}
            </pre>
          </div>

          <div className="mt-4">
            <h3 className="font-semibold mb-2">Old PropertyCurrencyField with showLarge:</h3>
            <pre className="bg-gray-800 text-white p-2 rounded overflow-x-auto">
{`<PropertyCurrencyField
  label="Value"
  value={value}
  onChange={setValue}
  showLarge={true}
  colorScheme="green"
/>`}
            </pre>
          </div>

          <div>
            <h3 className="font-semibold mb-2">New FormattedField:</h3>
            <pre className="bg-gray-800 text-white p-2 rounded overflow-x-auto">
{`<FormattedField
  label="Value"
  type="currency"
  value={value}
  onChange={setValue}
  showLarge
  colorScheme="green"
/>`}
            </pre>
          </div>
        </div>
      </section>

      {/* CURRENT VALUES */}
      <section className="bg-gray-50 p-4 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">Current Values (Try editing!)</h2>
        <div className="space-y-2 text-sm">
          <p><strong>Currency:</strong> {currencyValue}</p>
          <p><strong>Percentage:</strong> {percentValue}</p>
          <p><strong>Number:</strong> {numberValue}</p>
        </div>
      </section>
    </div>
  );
};

export default FormattedFieldExamples;
