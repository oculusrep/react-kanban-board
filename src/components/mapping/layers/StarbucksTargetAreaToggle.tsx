import React, { useState } from 'react';
import {
  StarbucksTargetAreaStyles,
  PriorityKey,
  PriorityStyle,
} from '../../../hooks/useStarbucksTargetAreaStyles';

interface Props {
  isVisible: boolean;
  onToggle: () => void;
  styles: StarbucksTargetAreaStyles;
  updateStyle: (priority: PriorityKey, partial: Partial<PriorityStyle>) => void;
  resetToDefaults: () => void;
}

const StarbucksTargetAreaToggle: React.FC<Props> = ({
  isVisible,
  onToggle,
  styles,
  updateStyle,
  resetToDefaults,
}) => {
  const [styleEditorOpen, setStyleEditorOpen] = useState(false);

  return (
    <div className="p-2 border-b border-gray-200">
      {/* Toggle row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2 min-w-0">
          <button
            onClick={onToggle}
            className={`relative flex-shrink-0 w-9 h-5 rounded-full transition-colors ${
              isVisible ? 'bg-green-700' : 'bg-gray-300'
            }`}
            aria-label="Toggle Starbucks GA Target Areas layer"
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                isVisible ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
          <span>🎯</span>
          <span className="text-sm font-medium text-gray-900 truncate">Starbucks: GA Target Areas</span>
        </div>
        <div className="flex items-center space-x-2 flex-shrink-0">
          <button
            onClick={() => setStyleEditorOpen(o => !o)}
            className="text-xs text-blue-600 hover:underline"
            aria-expanded={styleEditorOpen}
          >
            {styleEditorOpen ? 'Hide style' : 'Style'}
          </button>
          <span className="text-xs text-gray-400">Confidential</span>
        </div>
      </div>

      {/* Inline style editor — compact 1-row-per-priority layout that fits the 384px modal */}
      {styleEditorOpen && (
        <div className="mt-2 space-y-1.5">
          {/* Column headers (tiny, just to orient) */}
          <div className="grid grid-cols-[18px_22px_28px_28px_1fr_30px] items-center gap-1.5 text-[9px] uppercase tracking-wide text-gray-400 px-0.5">
            <span className="text-center" title="Show / hide this priority bucket">Show</span>
            <span></span>
            <span className="text-center">Line</span>
            <span className="text-center">Fill</span>
            <span className="text-center">Opacity</span>
            <span></span>
          </div>

          {([1, 2, 3] as PriorityKey[]).map(priority => (
            <PriorityStyleRow
              key={priority}
              priority={priority}
              style={styles[priority]}
              onChange={partial => updateStyle(priority, partial)}
            />
          ))}

          <div className="flex justify-end pt-0.5">
            <button
              onClick={resetToDefaults}
              className="text-[11px] text-gray-500 hover:text-gray-700 underline"
            >
              Reset to defaults
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

interface PriorityStyleRowProps {
  priority: PriorityKey;
  style: PriorityStyle;
  onChange: (partial: Partial<PriorityStyle>) => void;
}

const PriorityStyleRow: React.FC<PriorityStyleRowProps> = ({ priority, style, onChange }) => {
  return (
    <div
      className={`grid grid-cols-[18px_22px_28px_28px_1fr_30px] items-center gap-1.5 text-[11px] text-gray-700 px-0.5 ${
        style.visible ? '' : 'opacity-50'
      }`}
    >
      <input
        type="checkbox"
        checked={style.visible}
        onChange={e => onChange({ visible: e.target.checked })}
        className="w-3.5 h-3.5 cursor-pointer mx-auto"
        aria-label={`Show priority ${priority}`}
        title={style.visible ? `Hide priority ${priority}` : `Show priority ${priority}`}
      />
      <span className="font-medium tabular-nums">P{priority}</span>
      <input
        type="color"
        value={style.strokeColor}
        onChange={e => onChange({ strokeColor: e.target.value })}
        className="w-7 h-5 rounded border border-gray-300 cursor-pointer p-0"
        aria-label={`Priority ${priority} line color`}
        title={`Line color (currently ${style.strokeColor})`}
      />
      <input
        type="color"
        value={style.fillColor}
        onChange={e => onChange({ fillColor: e.target.value })}
        className="w-7 h-5 rounded border border-gray-300 cursor-pointer p-0"
        aria-label={`Priority ${priority} fill color`}
        title={`Fill color (currently ${style.fillColor})`}
      />
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={style.fillOpacity}
        onChange={e => onChange({ fillOpacity: Number(e.target.value) })}
        className="w-full min-w-0 cursor-pointer"
        aria-label={`Priority ${priority} fill opacity`}
        title={`Fill opacity ${style.fillOpacity.toFixed(2)}`}
      />
      <span className="text-gray-500 tabular-nums text-right text-[10px]">
        {style.fillOpacity.toFixed(2)}
      </span>
    </div>
  );
};

export default StarbucksTargetAreaToggle;
