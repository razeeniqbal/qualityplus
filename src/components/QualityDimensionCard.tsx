import { useState } from 'react';
import { X, Plus, CheckCircle, AlertCircle, Settings, Info } from 'lucide-react';
import type { QualityDimension } from '../types/database';

interface QualityDimensionCardProps {
  title: string;
  dimension: QualityDimension;
  columns: string[];
  availableColumns: string[];
  onAddColumn: (dimension: QualityDimension, column: string) => void;
  onRemoveColumn: (dimension: QualityDimension, column: string) => void;
  onConfigure?: (dimension: QualityDimension, column: string) => void;
  isReadyType: boolean;
  configuredColumns?: Set<string>;
  columnConfigs?: Map<string, Record<string, unknown>>;
  logicDescription?: string;
}

export default function QualityDimensionCard({
  title,
  dimension,
  columns,
  availableColumns,
  onAddColumn,
  onRemoveColumn,
  onConfigure,
  isReadyType,
  configuredColumns = new Set(),
  columnConfigs = new Map(),
  logicDescription = '',
}: QualityDimensionCardProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showLogicTooltip, setShowLogicTooltip] = useState(false);

  const hasColumns = columns.length > 0;
  const allConfigured = !isReadyType ? columns.every(col => configuredColumns.has(col)) : true;
  const statusColor = hasColumns ? (isReadyType || allConfigured ? 'green' : 'red') : 'slate';

  const statusClasses = {
    green: {
      bg: 'bg-green-50',
      border: 'border-green-300',
      text: 'text-green-800',
      chip: 'bg-green-600 text-white',
      headerBg: 'bg-green-100',
    },
    red: {
      bg: 'bg-red-50',
      border: 'border-red-300',
      text: 'text-red-800',
      chip: 'bg-red-600 text-white',
      headerBg: 'bg-red-100',
    },
    slate: {
      bg: 'bg-slate-50',
      border: 'border-slate-300',
      text: 'text-slate-800',
      chip: 'bg-slate-600 text-white',
      headerBg: 'bg-slate-100',
    },
  };

  const classes = statusClasses[statusColor];

  function handleSelectColumn(column: string) {
    onAddColumn(dimension, column);
    setShowDropdown(false);
  }

  return (
    <div className={`${classes.bg} ${classes.border} border-2 rounded-lg min-h-[400px] flex flex-col transition-all`}>
      <div className={`${classes.headerBg} px-4 py-3 border-b-2 ${classes.border}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <h3 className={`font-bold ${classes.text} text-lg`}>{title}</h3>
            {logicDescription && (
              <div className="relative">
                <button
                  onMouseEnter={() => setShowLogicTooltip(true)}
                  onMouseLeave={() => setShowLogicTooltip(false)}
                  className="hover:bg-white/30 p-1 rounded transition"
                >
                  <Info className="w-4 h-4 text-slate-600" />
                </button>
                {showLogicTooltip && (
                  <div className="absolute left-0 top-full mt-2 w-72 bg-slate-800 text-white text-xs rounded-lg p-3 shadow-xl z-50">
                    <div className="font-semibold mb-1">Logic:</div>
                    <div className="text-slate-200">{logicDescription}</div>
                    <div className="absolute -top-1 left-4 w-2 h-2 bg-slate-800 transform rotate-45"></div>
                  </div>
                )}
              </div>
            )}
            {hasColumns && (
              <>
                {isReadyType || allConfigured ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-600" />
                )}
              </>
            )}
          </div>
          {hasColumns && (
            <span className={`text-xs font-semibold px-2 py-1 rounded ${classes.chip}`}>
              {isReadyType || allConfigured ? 'READY' : 'NEEDS CONFIG'}
            </span>
          )}
        </div>
      </div>

      <div className="p-4 flex-1 flex flex-col">
        <div className="flex items-center justify-center mb-4">
          <div className="relative w-full">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="w-full text-sm bg-white border-2 border-dashed border-slate-300 hover:border-teal-500 text-slate-600 hover:text-teal-600 font-medium py-2 px-3 rounded-lg transition flex items-center justify-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>Add Attributes</span>
            </button>
            {showDropdown && availableColumns.length > 0 && (
              <div className="absolute left-0 right-0 mt-2 bg-white border-2 border-slate-300 rounded-lg shadow-xl z-10 max-h-64 overflow-y-auto">
                <div className="p-2">
                  <div className="text-xs font-semibold text-slate-600 mb-2 px-2">
                    Available Attributes
                  </div>
                  {availableColumns.map((column) => (
                    <button
                      key={column}
                      onClick={() => handleSelectColumn(column)}
                      className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-teal-50 hover:text-teal-800 rounded transition flex items-center justify-between group"
                    >
                      <span>{column}</span>
                      <Plus className="w-4 h-4 text-slate-400 group-hover:text-teal-600" />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {showDropdown && availableColumns.length === 0 && (
              <div className="absolute left-0 right-0 mt-2 bg-white border-2 border-slate-300 rounded-lg shadow-xl z-10 p-4">
                <p className="text-xs text-slate-500 text-center">No more columns available</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto">
          {columns.map((column) => {
            const isConfigured = isReadyType || configuredColumns.has(column);
            const configKey = `${dimension}:${column}`;
            const colConfig = columnConfigs.get(configKey);

            // Build config summary tags
            const summaryTags: string[] = [];
            if (colConfig) {
              if (dimension === 'completeness') {
                if (colConfig.checkMode === 'conditional' && colConfig.conditionColumn) {
                  const vals = (colConfig.conditionValues as string || '').split(',').map(s => s.trim()).filter(Boolean);
                  summaryTags.push(`if ${colConfig.conditionColumn}`);
                  if (vals.length <= 2) summaryTags.push(`IN [${vals.join(', ')}]`);
                  else summaryTags.push(`IN [${vals.slice(0, 2).join(', ')} +${vals.length - 2}]`);
                } else {
                  summaryTags.push('Always required');
                }
              } else if (dimension === 'uniqueness') {
                const isMulti = colConfig.checkMode === 'multi';
                if (isMulti) {
                  const companions = (colConfig.companionColumns as string[] || []);
                  companions.forEach(c => summaryTags.push(`+ ${c}`));
                } else {
                  summaryTags.push('Single column');
                }
              } else if (dimension === 'validity') {
                const vt = colConfig.validationType as string || 'pattern';
                const labels: Record<string, string> = {
                  sign:             'Sign',
                  range:            'Range',
                  list:             'Allowed values',
                  pattern:          'Pattern',
                  datatype:         'Data type',
                  vali_val_pos:     'Positive only',
                  vali_val_neg:     'Negative only',
                  vali_val_rang:    'Range',
                  vali_high_val:    '> Threshold',
                  vali_low_val:     '< Threshold',
                  vali_high_col:    '> Column',
                  vali_low_col:     '< Column',
                  vali_list_str:    'Allowed values',
                  vali_if_str_rang: 'Cond. range',
                  vali_if_col_rang: 'Cond. col. range',
                };
                summaryTags.push(labels[vt] ?? vt);
                if (vt === 'pattern' && colConfig.pattern) summaryTags.push(String(colConfig.pattern));
                if ((vt === 'range' || vt === 'vali_val_rang') ) {
                  if (colConfig.minValue !== undefined && colConfig.minValue !== '') summaryTags.push(`min: ${colConfig.minValue}`);
                  if (colConfig.maxValue !== undefined && colConfig.maxValue !== '') summaryTags.push(`max: ${colConfig.maxValue}`);
                }
                if (vt === 'datatype' && colConfig.dataType) summaryTags.push(String(colConfig.dataType));
                if (vt === 'sign' && colConfig.expectedSign) summaryTags.push(String(colConfig.expectedSign));
                if ((vt === 'list' || vt === 'vali_list_str') && colConfig.allowedValues) {
                  const vals = String(colConfig.allowedValues).split(',').map(s => s.trim()).filter(Boolean);
                  if (vals.length <= 3) summaryTags.push(vals.join(', '));
                  else summaryTags.push(`${vals.slice(0, 2).join(', ')} +${vals.length - 2}`);
                }
                if ((vt === 'vali_high_val' || vt === 'vali_low_val') && colConfig.threshold !== undefined && colConfig.threshold !== '') {
                  summaryTags.push(String(colConfig.threshold));
                }
                if ((vt === 'vali_high_col' || vt === 'vali_low_col') && colConfig.compareToColumn) {
                  summaryTags.push(String(colConfig.compareToColumn));
                }
                if (vt === 'vali_if_str_rang') {
                  if (colConfig.conditionColumn) summaryTags.push(`if ${colConfig.conditionColumn}`);
                  if (colConfig.minValue !== undefined && colConfig.minValue !== '') summaryTags.push(`min: ${colConfig.minValue}`);
                  if (colConfig.maxValue !== undefined && colConfig.maxValue !== '') summaryTags.push(`max: ${colConfig.maxValue}`);
                }
                if (vt === 'vali_if_col_rang') {
                  if (colConfig.conditionColumn) summaryTags.push(`if ${colConfig.conditionColumn}`);
                  if (colConfig.minColumn) summaryTags.push(`min: ${colConfig.minColumn}`);
                  if (colConfig.maxColumn) summaryTags.push(`max: ${colConfig.maxColumn}`);
                }
              } else if (dimension === 'consistency') {
                const src = colConfig.referenceSource as string || 'csv';
                if (src === 'list') {
                  summaryTags.push('Inline list');
                  const vals = (colConfig.inlineValues as string || '').split(',').map(s => s.trim()).filter(Boolean);
                  if (vals.length > 0 && vals.length <= 3) summaryTags.push(vals.join(', '));
                  else if (vals.length > 3) summaryTags.push(`${vals.slice(0, 2).join(', ')} +${vals.length - 2}`);
                } else {
                  summaryTags.push(src === 'csv' ? 'CSV ref' : 'DB ref');
                  if (src === 'csv' && colConfig.referenceFileName) summaryTags.push(String(colConfig.referenceFileName));
                  if (colConfig.referenceMatchColumn) summaryTags.push(`→ ${colConfig.referenceMatchColumn}`);
                  if (src === 'database' && colConfig.referenceDbColumn) summaryTags.push(`→ ${colConfig.referenceDbColumn}`);
                }
              } else if (dimension === 'accuracy') {
                const method = colConfig.accuracyMethod as string || 'reference';
                summaryTags.push(method === 'reference' ? 'vs CSV' : method === 'calculation' ? 'Calculation' : 'Threshold');
                if (colConfig.threshold) summaryTags.push(`≥ ${colConfig.threshold}%`);
              } else if (dimension === 'timeliness') {
                if (colConfig.maxAgeDays) summaryTags.push(`≤ ${colConfig.maxAgeDays}d`);
                if (colConfig.updateFrequency) summaryTags.push(String(colConfig.updateFrequency));
              }
            }

            return (
              <div
                key={column}
                className={`${classes.chip} px-3 py-2 rounded-lg flex flex-col gap-1 text-sm font-medium shadow-md ${
                  !isReadyType && !isConfigured ? 'ring-2 ring-yellow-400' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="truncate flex-1">{column}</span>
                  <div className="flex items-center space-x-1 flex-shrink-0">
                    {onConfigure && (!isReadyType || dimension === 'uniqueness') && (
                      <button
                        onClick={() => onConfigure(dimension, column)}
                        className={`p-1 rounded transition ${
                          !isReadyType && !isConfigured
                            ? 'bg-yellow-400 hover:bg-yellow-500 text-yellow-900'
                            : 'hover:bg-white/20 text-white'
                        }`}
                        title={!isReadyType && !isConfigured ? 'Configure required' : isReadyType ? 'Configure (optional)' : 'Reconfigure'}
                      >
                        <Settings className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => onRemoveColumn(dimension, column)}
                      className="hover:bg-white/20 p-1 rounded transition"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {summaryTags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {summaryTags.map((tag, i) => (
                      <span key={i} className="text-xs bg-white/20 rounded px-1.5 py-0.5 font-normal opacity-90 max-w-full truncate">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {columns.length === 0 && (
            <div className="text-center py-12 text-slate-400 text-sm">
              <div className="w-16 h-16 border-2 border-dashed border-slate-300 rounded-lg mx-auto mb-3 flex items-center justify-center">
                <Plus className="w-8 h-8 text-slate-300" />
              </div>
              <p>No columns added yet</p>
            </div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t-2 border-slate-200">
          <div className="flex items-center justify-between text-sm">
            <span className={`font-medium ${classes.text}`}>
              {columns.length} attribute{columns.length !== 1 ? 's' : ''}
            </span>
            {hasColumns && (
              <span className={`text-xs font-semibold ${isReadyType || allConfigured ? 'text-green-600' : 'text-red-600'}`}>
                {isReadyType || allConfigured ? '✓ Ready to execute' : '⚠ Configuration needed'}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
