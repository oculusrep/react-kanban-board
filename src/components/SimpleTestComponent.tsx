import React from 'react';
import PercentageInput from './PercentageInput';

const SimpleTestComponent: React.FC = () => {
  const [testValue, setTestValue] = React.useState<number | null>(25);

  console.log('🔧 SimpleTestComponent rendered with testValue:', testValue);

  return (
    <div className="p-6 bg-white border rounded">
      <h2 className="text-lg font-bold mb-4">🧪 PercentageInput Isolation Test</h2>
      
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold mb-2">Test 1: Basic PercentageInput</h3>
          <PercentageInput
            label="Test Percentage"
            value={testValue}
            onChange={(value) => {
              console.log('🎯 PercentageInput onChange called with:', value);
              setTestValue(value);
            }}
          />
          <p className="text-sm text-gray-600 mt-1">Current value: {testValue}</p>
        </div>

        <div>
          <h3 className="font-semibold mb-2">Test 2: Manual Input</h3>
          <input
            type="number"
            value={testValue || ''}
            onChange={(e) => {
              const val = parseFloat(e.target.value) || null;
              console.log('🎯 Manual input changed to:', val);
              setTestValue(val);
            }}
            className="border rounded px-2 py-1"
            placeholder="Enter test value"
          />
        </div>

        <div>
          <h3 className="font-semibold mb-2">Test 3: Simple Button</h3>
          <button
            onClick={() => {
              console.log('🎯 Button clicked!');
              setTestValue(50);
            }}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Set to 50%
          </button>
        </div>
      </div>
    </div>
  );
};

export default SimpleTestComponent;