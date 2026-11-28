import React from 'react';
import {
  PointIconConfig,
  PointIconName,
  PointIconShape,
  POINT_ICON_NAMES,
  pointIconDataUri,
  resolveIconConfig,
} from './utils/pointLayerIcons';

interface PointIconEditorProps {
  value: PointIconConfig | null;
  onChange: (next: PointIconConfig) => void;
  /** Attribute keys found on the layer's points, offered as hover-label choices */
  attributeKeys: string[];
}

const SHAPES: PointIconShape[] = ['circle', 'square', 'diamond'];
const SIZES = [20, 24, 28, 32, 40];

const ColorField: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({
  label,
  value,
  onChange,
}) => (
  <div>
    <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
    <div className="flex items-center space-x-2">
      <input
        type="color"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-8 h-8 rounded cursor-pointer"
      />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-2 py-1 border border-gray-300 rounded-md text-xs"
        pattern="^#[0-9A-Fa-f]{6}$"
      />
    </div>
  </div>
);

/**
 * Picker for a point layer's icon_config: outer shape, inner icon, colors,
 * size and the attribute shown on hover. Every point in the layer uses it.
 */
export const PointIconEditor: React.FC<PointIconEditorProps> = ({ value, onChange, attributeKeys }) => {
  const cfg = resolveIconConfig(value);
  const set = (patch: Partial<PointIconConfig>) => onChange({ ...cfg, ...patch });

  const optionButton = (active: boolean) =>
    `px-2 py-1 rounded border flex items-center justify-center ${
      active ? 'border-[#002147] bg-blue-50' : 'border-gray-200 hover:border-[#8FA9C8]'
    }`;

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Shape</label>
        <div className="flex space-x-2">
          {SHAPES.map(shape => (
            <button
              key={shape}
              type="button"
              onClick={() => set({ shape })}
              className={optionButton(cfg.shape === shape)}
              title={shape}
            >
              <img src={pointIconDataUri({ ...cfg, shape, size: 24 })} alt={shape} width={24} height={24} />
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Icon</label>
        <div className="flex space-x-2">
          {POINT_ICON_NAMES.map((icon: PointIconName) => (
            <button
              key={icon}
              type="button"
              onClick={() => set({ icon })}
              className={optionButton(cfg.icon === icon)}
              title={icon}
            >
              <img src={pointIconDataUri({ ...cfg, icon, size: 24 })} alt={icon} width={24} height={24} />
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <ColorField label="Fill" value={cfg.fill} onChange={fill => set({ fill })} />
        <ColorField label="Outline" value={cfg.stroke} onChange={stroke => set({ stroke })} />
        <ColorField label="Icon color" value={cfg.iconColor} onChange={iconColor => set({ iconColor })} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Size</label>
          <select
            value={cfg.size}
            onChange={e => set({ size: parseInt(e.target.value) })}
            className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm"
          >
            {SIZES.map(s => (
              <option key={s} value={s}>{s}px</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Hover label</label>
          <select
            value={cfg.labelField ?? ''}
            onChange={e => set({ labelField: e.target.value || undefined })}
            className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm"
          >
            <option value="">Point name</option>
            {cfg.labelField && !attributeKeys.includes(cfg.labelField) && (
              <option value={cfg.labelField}>{cfg.labelField}</option>
            )}
            {attributeKeys.map(k => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center justify-center p-4 bg-gray-100 rounded-lg">
        <img src={pointIconDataUri(cfg)} alt="Marker preview" width={cfg.size} height={cfg.size} />
      </div>
    </div>
  );
};
