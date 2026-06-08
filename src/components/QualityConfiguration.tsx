import { useState, useEffect, useRef } from 'react';
import { AlertCircle, Save, Play, Sparkles } from 'lucide-react';
import type { QualityDimension, QualityDimensionConfig, Template } from '../types/database';
import QualityDimensionCard from './QualityDimensionCard';
import DimensionConfigModal from './DimensionConfigModal';
import AiValidityRecommender, { type AiValidityRecommenderHandle } from './AiValidityRecommender';
import { apiClient } from '../lib/api-client';
import {
  checkCompleteness,
  checkUniqueness,
  checkValidity,
  checkConsistency,
  type CompletenessConfig,
  type ValidityConfig,
  type UniquenessConfig,
  type ConsistencyConfig,
} from '../lib/quality-engine';

interface QualityConfigurationProps {
  data: {
    headers: string[];
    rows: Array<Record<string, string | number | boolean | null>>;
  };
  datasetId: string;
  onExecute: (results: QualityCheckResult[]) => void;
  projectName?: string;
  projectDescription?: string;
  datasetName?: string;
  datasetDescription?: string;
}

export interface RowDetail {
  rowIndex: number;
  value: unknown;
  passed: boolean;
  reason?: string;
}

export interface QualityCheckResult {
  id: string;
  column_name: string;
  dimension: QualityDimension;
  passed_count: number;
  failed_count: number;
  total_count: number;
  score: number;
  rowDetails?: RowDetail[];
}

interface DimensionRules {
  [key: string]: string[];
}

export default function QualityConfiguration({
  data,
  datasetId,
  onExecute,
  projectName = '',
  projectDescription = '',
  datasetName = '',
  datasetDescription = '',
}: QualityConfigurationProps) {
  const [dimensions, setDimensions] = useState<QualityDimensionConfig[]>([]);
  const [dimensionRules, setDimensionRules] = useState<DimensionRules>({});
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [loadingDimensions, setLoadingDimensions] = useState(true);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [hasTemplateAction, setHasTemplateAction] = useState(false);
  const [isTemplateDirty, setIsTemplateDirty] = useState(false);
  const [isUpdatingTemplate, setIsUpdatingTemplate] = useState(false);
  const [configuredColumns, setConfiguredColumns] = useState<Map<string, Set<string>>>(new Map());
  const [columnConfigs, setColumnConfigs] = useState<Map<string, Record<string, unknown>>>(new Map());
  const [isAiLoading, setIsAiLoading] = useState(false);
  const aiRecommenderRef = useRef<AiValidityRecommenderHandle>(null);
  const [configModal, setConfigModal] = useState<{
    isOpen: boolean;
    dimension: QualityDimension | null;
    dimensionName: string;
    column: string;
    existingConfig?: {
      config_data: Record<string, unknown>;
      is_configured: boolean;
    };
  }>({
    isOpen: false,
    dimension: null,
    dimensionName: '',
    column: '',
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadDimensions(); loadTemplates(); }, []);

  async function loadDimensions() {
    try {
      const data = await apiClient.getQualityDimensions() as QualityDimensionConfig[];
      const activeDimensions = data.filter(d => d.is_active);
      setDimensions(activeDimensions);

      const initialRules: DimensionRules = {};
      activeDimensions.forEach((dim) => {
        initialRules[dim.key] = [];
      });
      setDimensionRules(initialRules);
    } catch (error) {
      console.error('Error loading dimensions:', error);
    } finally {
      setLoadingDimensions(false);
    }
  }

  async function loadTemplates() {
    try {
      const dbTemplates = await apiClient.getTemplates(datasetId) as Array<{ id: string; name: string; template_data: Template['rules']; created_at: string }>;
      if (dbTemplates && dbTemplates.length > 0) {
        const mapped: Template[] = dbTemplates.map((t) => ({
          id: t.id,
          name: t.name,
          rules: t.template_data,
          created_at: t.created_at,
        }));
        setTemplates(mapped);
      }
    } catch (error) {
      console.error('Error loading templates:', error);
    }
  }

  function handleAddColumn(dimension: QualityDimension, column: string) {
    setDimensionRules((prev) => ({
      ...prev,
      [dimension]: [...prev[dimension], column],
    }));
    // Completeness columns start as "default" mode (always required) — mark as configured
    // so the chip doesn't show a warning ring until the user explicitly switches to conditional mode
    if (dimension === 'completeness') {
      setConfiguredColumns(prev => {
        const next = new Map(prev);
        if (!next.has('completeness')) next.set('completeness', new Set());
        next.get('completeness')!.add(column);
        return next;
      });
    }
    if (selectedTemplate) setIsTemplateDirty(true);
  }

  function handleRemoveColumn(dimension: QualityDimension, column: string) {
    setDimensionRules((prev) => ({
      ...prev,
      [dimension]: prev[dimension].filter((col) => col !== column),
    }));
    if (selectedTemplate) setIsTemplateDirty(true);
  }

  function handleClear() {
    const clearedRules: DimensionRules = {};
    dimensions.forEach((dim) => {
      clearedRules[dim.key] = [];
    });
    setDimensionRules(clearedRules);
    setConfiguredColumns(new Map());
    setColumnConfigs(new Map());
    setHasTemplateAction(false);
    setIsTemplateDirty(false);
    setSelectedTemplate('');
  }

  function handleConfigure(dimension: QualityDimension, column: string) {
    const dimensionConfig = dimensions.find((d) => d.key === dimension);
    const existingConfigData = columnConfigs.get(`${dimension}:${column}`);
    setConfigModal({
      isOpen: true,
      dimension,
      dimensionName: dimensionConfig?.name || dimension,
      column,
      existingConfig: existingConfigData
        ? {
            config_data: existingConfigData,
            is_configured: configuredColumns.get(dimension)?.has(column) ?? false,
          }
        : undefined,
    });
  }

  async function handleSaveConfiguration(config: Record<string, unknown>, referenceFile?: File) {
    if (!configModal.dimension || !configModal.column) return;

    try {
      // Mark as configured locally
      const newConfiguredColumns = new Map(configuredColumns);
      if (!newConfiguredColumns.has(configModal.dimension)) {
        newConfiguredColumns.set(configModal.dimension, new Set());
      }
      newConfiguredColumns.get(configModal.dimension)!.add(configModal.column);
      setConfiguredColumns(newConfiguredColumns);

      // Store the config data for use during execution
      const configKey = `${configModal.dimension}:${configModal.column}`;
      const configToStore: Record<string, unknown> = { ...config };

      // If consistency with CSV, parse and store the reference values from the file
      if (configModal.dimension === 'consistency' && config.referenceSource === 'csv' && referenceFile) {
        const text = await referenceFile.text();
        const lines = text.split('\n').filter(line => line.trim());
        const headers = lines[0].split(',').map(h => h.trim());
        const matchCol = config.referenceMatchColumn as string;
        const colIndex = headers.indexOf(matchCol);

        if (colIndex >= 0) {
          const refValues = lines.slice(1).map(line => {
            const values = line.split(',').map(v => v.trim());
            return values[colIndex] || '';
          }).filter(v => v !== '');
          configToStore.parsedReferenceValues = refValues;
        }
      }

      const newColumnConfigs = new Map(columnConfigs);
      newColumnConfigs.set(configKey, configToStore);
      setColumnConfigs(newColumnConfigs);

      if (selectedTemplate) setIsTemplateDirty(true);
      alert('Configuration saved successfully!');
    } catch (error) {
      console.error('Error saving configuration:', error);
      alert('Error saving configuration');
    }
  }

  async function handleSaveTemplate() {
    if (totalConfigured === 0) {
      alert('Please add columns to dimensions before saving a template');
      return;
    }
    setShowSaveTemplateModal(true);
  }

  async function confirmSaveTemplate() {
    if (!templateName.trim()) {
      alert('Please enter a template name');
      return;
    }

    setIsSavingTemplate(true);
    try {
      const templateData = {
        dimensionRules,
        configuredColumns: Object.fromEntries(
          Array.from(configuredColumns.entries()).map(([key, set]) => [key, Array.from(set)])
        ),
        columnConfigs: Object.fromEntries(columnConfigs.entries()),
      };

      const saved = await apiClient.saveTemplate(templateName, templateData, datasetId);

      const newTemplate: Template = {
        id: saved.id,
        name: templateName,
        rules: templateData,
        created_at: saved.created_at,
      };

      setTemplates([...templates, newTemplate]);
      setSelectedTemplate(saved.id);
      setHasTemplateAction(true);
      setIsTemplateDirty(false);
      alert('Template saved successfully!');
      setTemplateName('');
      setShowSaveTemplateModal(false);
    } catch (error) {
      console.error('Error saving template:', error);
      alert('Error saving template. Please try again.');
    } finally {
      setIsSavingTemplate(false);
    }
  }

  async function handleUpdateTemplate() {
    if (!selectedTemplate) return;
    setIsUpdatingTemplate(true);
    try {
      const templateData = {
        dimensionRules,
        configuredColumns: Object.fromEntries(
          Array.from(configuredColumns.entries()).map(([key, set]) => [key, Array.from(set)])
        ),
        columnConfigs: Object.fromEntries(columnConfigs.entries()),
      };
      await apiClient.updateTemplate(selectedTemplate, templateData);
      setTemplates(prev => prev.map(t =>
        t.id === selectedTemplate ? { ...t, rules: templateData } : t
      ));
      setIsTemplateDirty(false);
      alert('Template updated successfully!');
    } catch (error) {
      console.error('Error updating template:', error);
      alert('Error updating template. Please try again.');
    } finally {
      setIsUpdatingTemplate(false);
    }
  }

  function handleLoadTemplate(templateId: string) {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;

    const templateData = template.rules;

    // Validate: find any columns in the template that no longer exist in the dataset
    const availableColumns = new Set(data.headers);
    const missingColumns: string[] = [];

    if (templateData.dimensionRules) {
      Object.entries(templateData.dimensionRules).forEach(([dimension, columns]) => {
        (columns as string[]).forEach(col => {
          if (!availableColumns.has(col)) {
            missingColumns.push(`${col} (${dimension})`);
          }
        });
      });
    }

    if (missingColumns.length > 0) {
      alert(
        `Cannot load template "${template.name}".\n\n` +
        `The following columns no longer exist in this dataset (they may have been removed after trimming):\n\n` +
        missingColumns.map(c => `  • ${c}`).join('\n') +
        `\n\nPlease update or delete this template to match the current dataset columns.`
      );
      return;
    }

    if (templateData.dimensionRules) {
      setDimensionRules(templateData.dimensionRules);
    }

    if (templateData.configuredColumns) {
      const configMap = new Map<string, Set<string>>();
      Object.entries(templateData.configuredColumns).forEach(([key, columns]) => {
        configMap.set(key, new Set(columns as string[]));
      });
      setConfiguredColumns(configMap);
    }

    if (templateData.columnConfigs) {
      const colConfigMap = new Map<string, Record<string, unknown>>();
      Object.entries(templateData.columnConfigs).forEach(([key, config]) => {
        colConfigMap.set(key, config as Record<string, unknown>);
      });
      setColumnConfigs(colConfigMap);
    }

    setSelectedTemplate(templateId);
    setHasTemplateAction(true);
    setIsTemplateDirty(false);
    alert(`Template "${template.name}" loaded successfully!`);
  }

  async function handleExecute() {
    if (!hasTemplateAction) {
      alert('Please save or select a template before executing quality checks');
      return;
    }
    if (!allRequiredConfigured) {
      alert('Some columns still need configuration. Please configure all dimensions marked "NEEDS CONFIG" before executing.');
      return;
    }

    setIsExecuting(true);

    try {
      const allResults: QualityCheckResult[] = [];

      for (const dimension of dimensions) {
        const columns: string[] = dimensionRules[dimension.key] || [];
        if (columns.length === 0) continue;

        if (dimension.key === 'completeness') {
          const configs: CompletenessConfig[] = columns.map(col => {
            const colConfig = columnConfigs.get(`completeness:${col}`);
            const isConditional = colConfig?.checkMode === 'conditional';
            if (isConditional && colConfig?.conditionColumn) {
              const rawValues = (colConfig.conditionValues as string || '');
              return {
                column: col,
                mode: 'conditional',
                conditionColumn: colConfig.conditionColumn as string,
                conditionValues: rawValues.split(',').map((v: string) => v.trim()).filter(Boolean),
              };
            }
            return { column: col, mode: 'default' };
          });
          const engineResults = checkCompleteness(data.rows, configs);
          engineResults.forEach(r => {
            allResults.push({ ...r, dimension: 'completeness' as QualityDimension });
          });

        } else if (dimension.key === 'uniqueness') {
          const configs: UniquenessConfig[] = columns.map(col => {
            const colConfig = columnConfigs.get(`uniqueness:${col}`);
            const isMulti = colConfig?.checkMode === 'multi';
            return {
              column: col,
              mode: isMulti ? 'multi' : 'single',
              companionColumns: isMulti ? (colConfig?.companionColumns as string[] ?? []) : [],
            };
          });
          const engineResults = checkUniqueness(data.rows, configs);
          engineResults.forEach(r => {
            allResults.push({ ...r, dimension: 'uniqueness' as QualityDimension });
          });

        } else if (dimension.key === 'validity') {
          const configs: ValidityConfig[] = columns.map(col => {
            const colConfig = columnConfigs.get(`validity:${col}`) ?? {};
            const vType = (colConfig.validationType as string) ?? 'pattern';

            // Map UI validationType strings to engine ruleType
            const ruleTypeMap: Record<string, ValidityConfig['ruleType']> = {
              sign:             'sign' as ValidityConfig['ruleType'],
              range:            'vali_val_rang',
              list:             'vali_list_str',
              pattern:          'pattern',
              datatype:         'datatype',
              vali_val_pos:     'vali_val_pos',
              vali_val_neg:     'vali_val_neg',
              vali_val_rang:    'vali_val_rang',
              vali_high_val:    'vali_high_val',
              vali_low_val:     'vali_low_val',
              vali_high_col:    'vali_high_col',
              vali_low_col:     'vali_low_col',
              vali_list_str:    'vali_list_str',
              vali_if_str_rang: 'vali_if_str_rang',
              vali_if_col_rang: 'vali_if_col_rang',
            };

            // Parse condition values string → array for conditional rules
            const conditionValuesRaw = colConfig.conditionValues as string | undefined;
            const conditionValues = conditionValuesRaw
              ? conditionValuesRaw.split(',').map((v: string) => v.trim()).filter(Boolean)
              : undefined;

            return {
              column: col,
              ruleType: ruleTypeMap[vType] ?? 'pattern',
              // range
              min: colConfig.minValue !== undefined ? Number(colConfig.minValue) : undefined,
              max: colConfig.maxValue !== undefined ? Number(colConfig.maxValue) : undefined,
              // threshold
              threshold: colConfig.threshold !== undefined ? Number(colConfig.threshold) : undefined,
              // column compare
              compareToColumn: colConfig.compareToColumn as string | undefined,
              // conditional range
              conditionColumn: colConfig.conditionColumn as string | undefined,
              conditionValues,
              // conditional column range
              minColumn: colConfig.minColumn as string | undefined,
              maxColumn: colConfig.maxColumn as string | undefined,
              // list
              allowedValues: colConfig.allowedValues as string | undefined,
              values: colConfig.values as string[] | undefined,
              // pattern
              pattern: colConfig.pattern as string | undefined,
              // datatype
              dataType: colConfig.dataType as ValidityConfig['dataType'],
              // sign
              expectedSign: colConfig.expectedSign as ValidityConfig['expectedSign'],
            };
          });
          const engineResults = checkValidity(data.rows, configs);
          engineResults.forEach(r => {
            allResults.push({ ...r, dimension: 'validity' as QualityDimension });
          });

        } else if (dimension.key === 'consistency') {
          // Build reference value sets (async — CSV or DB) or inline list
          const configs: ConsistencyConfig[] = [];
          for (const col of columns) {
            const colConfig = columnConfigs.get(`consistency:${col}`);
            const source = colConfig?.referenceSource as string || 'csv';

            if (source === 'list') {
              // cons_list_str: inline comma-separated values
              const raw = (colConfig?.inlineValues as string || '');
              const inlineValues = raw.split(',').map((v: string) => v.trim()).filter(Boolean);
              configs.push({ column: col, mode: 'list', inlineValues });
            } else if (source === 'csv' && colConfig?.parsedReferenceValues) {
              const referenceValues = new Set(
                (colConfig.parsedReferenceValues as string[]).map(v => String(v).trim().toLowerCase())
              );
              configs.push({ column: col, mode: 'reference', referenceValues });
            } else if (source === 'database' && colConfig?.referenceDatasetId && colConfig.referenceDbColumn) {
              const referenceValues = new Set<string>();
              try {
                const refRows = await apiClient.previewDataset(colConfig.referenceDatasetId as string, 100000) as Record<string, string>[];
                const refCol = colConfig.referenceDbColumn as string;
                for (const refRow of refRows) {
                  const val = refRow[refCol];
                  if (val !== null && val !== undefined && String(val).trim() !== '') {
                    referenceValues.add(String(val).trim().toLowerCase());
                  }
                }
              } catch (error) {
                console.error('Error fetching reference dataset:', error);
              }
              configs.push({ column: col, mode: 'reference', referenceValues });
            } else {
              configs.push({ column: col, mode: 'reference', referenceValues: new Set() });
            }
          }
          const engineResults = checkConsistency(data.rows, configs);
          engineResults.forEach(r => {
            allResults.push({ ...r, dimension: 'consistency' as QualityDimension });
          });

        } else {
          // Other dimensions (accuracy, timeliness) — pass-through until implemented
          columns.forEach(col => {
            allResults.push({
              id: `${dimension.key}-${col}`,
              column_name: col,
              dimension: dimension.key as QualityDimension,
              passed_count: data.rows.length,
              failed_count: 0,
              total_count: data.rows.length,
              score: 100,
              rowDetails: data.rows.map((row, i) => ({ rowIndex: i, value: row[col], passed: true })),
            });
          });
        }
      }

      // Save results to database
      try {
        await apiClient.saveQualityResults(datasetId, allResults);
      } catch (saveError) {
        console.error('Error saving results to database:', saveError);
      }

      onExecute(allResults);
    } catch (error) {
      console.error('Error executing rules:', error);
      alert('Error executing quality checks. Please try again.');
    } finally {
      setIsExecuting(false);
    }
  }

  const referencedColumnsInUse = new Set<string>();
  columnConfigs.forEach((cfg, key) => {
    // Uniqueness: companion columns (multi-column mode)
    if (key.startsWith('uniqueness:') && cfg.checkMode === 'multi') {
      (cfg.companionColumns as string[] ?? []).forEach(c => referencedColumnsInUse.add(c));
    }
    // Validity: any column referenced in configuration
    if (key.startsWith('validity:')) {
      if (cfg.conditionColumn) referencedColumnsInUse.add(cfg.conditionColumn as string);
      if (cfg.compareToColumn) referencedColumnsInUse.add(cfg.compareToColumn as string);
      if (cfg.minColumn) referencedColumnsInUse.add(cfg.minColumn as string);
      if (cfg.maxColumn) referencedColumnsInUse.add(cfg.maxColumn as string);
    }
    // Completeness: condition column (conditional mode)
    if (key.startsWith('completeness:') && cfg.conditionColumn) {
      referencedColumnsInUse.add(cfg.conditionColumn as string);
    }
  });

  // Each dimension gets its own available list:
  // exclude columns already assigned to *that* dimension and referenced companion columns.
  function getAvailableColumnsFor(dimensionKey: string): string[] {
    const alreadyInThisDim = new Set(dimensionRules[dimensionKey] ?? []);
    return data.headers.filter(
      (header) => !alreadyInThisDim.has(header) && !referencedColumnsInUse.has(header)
    );
  }

  // Pre-compute which templates have columns that no longer exist in the dataset
  const datasetColumnSet = new Set(data.headers);
  function getTemplateMissingColumns(template: Template): string[] {
    const missing: string[] = [];
    if (template.rules.dimensionRules) {
      Object.entries(template.rules.dimensionRules).forEach(([dimension, columns]) => {
        (columns as string[]).forEach(col => {
          if (!datasetColumnSet.has(col)) missing.push(`${col} (${dimension})`);
        });
      });
    }
    return missing;
  }

  const totalConfigured = Object.values(dimensionRules).reduce(
    (sum, columns) => sum + columns.length,
    0
  );

  const isReadyType = (dimensionKey: string): boolean => {
    // uniqueness is always "ready" (single mode needs no config); completeness is handled per-column
    return dimensionKey === 'uniqueness';
  };

  // True if every column in every dimension that requires configuration has been configured
  const allRequiredConfigured = Object.entries(dimensionRules).every(([dimKey, cols]) => {
    if (isReadyType(dimKey)) return true;
    if (dimKey === 'completeness') {
      // Only conditional-mode completeness columns require config
      return cols.every(col => {
        const cfg = columnConfigs.get(`completeness:${col}`);
        if (!cfg || cfg.checkMode !== 'conditional') return true; // default mode = always ready
        return configuredColumns.get('completeness')?.has(col) ?? false;
      });
    }
    return cols.every(col => configuredColumns.get(dimKey)?.has(col));
  });

  function getLogicDescriptionForDimension(dimensionKey: string): string {
    const logicMap: Record<string, string> = {
      completeness: 'Checks if all values in the selected columns are present and not null or empty.',
      uniqueness: 'Verifies that all values in the selected columns are unique with no duplicates.',
      consistency: 'Checks values against reference data from an uploaded CSV or an existing database dataset.',
      validity: 'Ensures data meets specific validation rules.',
    };
    return logicMap[dimensionKey] || 'Quality validation logic for this dimension';
  }

  if (loadingDimensions) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 text-center py-12">
        <div className="animate-spin w-12 h-12 border-4 border-[#03AD9A] border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-slate-600">Loading dimensions...</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedTemplate}
            onChange={(e) => {
              if (e.target.value) {
                handleLoadTemplate(e.target.value);
              } else {
                setSelectedTemplate('');
              }
            }}
            className="px-4 py-2 bg-[#008192] text-white rounded-lg hover:bg-[#064B77] transition font-medium cursor-pointer outline-none"
          >
            <option value="">Select Template</option>
            {templates.map((template) => {
              const missing = getTemplateMissingColumns(template);
              return (
                <option key={template.id} value={template.id} disabled={missing.length > 0}>
                  {missing.length > 0 ? `⚠ ${template.name} (incompatible)` : template.name}
                </option>
              );
            })}
          </select>
          <button
            onClick={handleClear}
            className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition"
          >
            Clear
          </button>
          <button
            onClick={handleSaveTemplate}
            className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition flex items-center space-x-2"
          >
            <Save className="w-4 h-4" />
            <span>Save Template</span>
          </button>
          {!!import.meta.env.VITE_N8N_VALIDITY_WEBHOOK_URL && (
            <button
              onClick={() => aiRecommenderRef.current?.trigger()}
              disabled={isAiLoading || data.headers.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-lg hover:from-violet-600 hover:to-purple-700 transition font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              title={data.headers.length === 0 ? 'No dataset loaded' : 'Get AI rule recommendations'}
            >
              {isAiLoading
                ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Sparkles className="w-4 h-4" />
              }
              <span>AI Recommend</span>
            </button>
          )}
          {selectedTemplate && isTemplateDirty && (
            <button
              onClick={handleUpdateTemplate}
              disabled={isUpdatingTemplate}
              className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUpdatingTemplate ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Updating...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Update Template</span>
                </>
              )}
            </button>
          )}
        </div>
        <div className="relative group self-start lg:self-auto">
          <button
            onClick={handleExecute}
            disabled={totalConfigured === 0 || isExecuting || !hasTemplateAction || !allRequiredConfigured}
            className="w-full lg:w-auto justify-center px-6 py-2 bg-[#008192] text-white rounded-lg hover:bg-[#064B77] transition disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center space-x-2"
          >
            {isExecuting ? (
              <>
                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                <span>Executing...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                <span>Execute</span>
              </>
            )}
          </button>
          {totalConfigured > 0 && !isExecuting && (
            <div className="absolute bottom-full right-0 mb-2 w-72 bg-slate-800 text-white text-xs rounded-lg p-3 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
              {!hasTemplateAction
                ? 'Please save or select a template before executing.'
                : !allRequiredConfigured
                ? 'Some columns still need configuration. Click the "Configure" button on each NEEDS CONFIG dimension.'
                : 'Ready to execute quality checks.'}
              <div className="absolute -bottom-1 right-6 w-2 h-2 bg-slate-800 transform rotate-45"></div>
            </div>
          )}
        </div>
      </div>

      <AiValidityRecommender
        ref={aiRecommenderRef}
        projectName={projectName}
        projectDescription={projectDescription}
        datasetName={datasetName}
        datasetDescription={datasetDescription}
        validityColumns={dimensionRules['validity'] ?? []}
        data={data}
        onLoadingChange={setIsAiLoading}
        onApply={allRecommendations => {
          const validityRecs     = allRecommendations.filter(r => r.dimension === 'validity' && r.validationType);
          const consistencyRecs  = allRecommendations.filter(r => r.dimension === 'consistency');
          const uniquenessRecs   = allRecommendations.filter(r => r.dimension === 'uniqueness');

          setDimensionRules(prev => {
            const next = { ...prev };

            // Validity columns
            if (validityRecs.length > 0) {
              const ex = new Set(prev['validity'] ?? []);
              const toAdd = validityRecs.map(r => r.column).filter(c => !ex.has(c) && data.headers.includes(c));
              if (toAdd.length > 0) next['validity'] = [...(prev['validity'] ?? []), ...toAdd];
            }

            // Consistency columns — also mirror to completeness
            if (consistencyRecs.length > 0) {
              const exC = new Set(prev['consistency'] ?? []);
              const exCo = new Set(prev['completeness'] ?? []);
              const toAddC  = consistencyRecs.map(r => r.column).filter(c => !exC.has(c) && data.headers.includes(c));
              const toAddCo = consistencyRecs.map(r => r.column).filter(c => !exCo.has(c) && data.headers.includes(c));
              if (toAddC.length > 0)  next['consistency']  = [...(prev['consistency']  ?? []), ...toAddC];
              if (toAddCo.length > 0) next['completeness'] = [...(prev['completeness'] ?? []), ...toAddCo];
            }

            // Uniqueness columns — add to uniqueness dimension
            if (uniquenessRecs.length > 0) {
              const exU = new Set(prev['uniqueness'] ?? []);
              const toAdd = uniquenessRecs.map(r => r.column).filter(c => !exU.has(c) && data.headers.includes(c));
              if (toAdd.length > 0) next['uniqueness'] = [...(prev['uniqueness'] ?? []), ...toAdd];
            }

            return next;
          });

          // Pre-fill validity configs
          setColumnConfigs(prev => {
            const next = new Map(prev);
            for (const rec of validityRecs) {
              next.set(`validity:${rec.column}`, {
                validationType: rec.validationType,
                ...rec.config,
              });
            }
            return next;
          });

          // Mark validity + completeness as configured (completeness needs no config — always ready)
          setConfiguredColumns(prev => {
            const next = new Map(prev);
            // Validity — mark rules as configured
            const validityCols = new Set(prev.get('validity') ?? []);
            for (const rec of validityRecs) validityCols.add(rec.column);
            next.set('validity', validityCols);
            // Completeness — all columns are auto-configured (no rule config needed)
            const completenessCols = new Set(prev.get('completeness') ?? []);
            for (const rec of consistencyRecs) completenessCols.add(rec.column);
            next.set('completeness', completenessCols);
            return next;
          });

          // Mark dirty so user knows to save — but do NOT unlock execute yet
          // User must explicitly save or load a template before executing
          setIsTemplateDirty(true);
        }}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mt-2">
        {dimensions.map((dimension) => (
          <QualityDimensionCard
            key={dimension.id}
            title={dimension.name}
            dimension={dimension.key as QualityDimension}
            columns={dimensionRules[dimension.key] || []}
            availableColumns={getAvailableColumnsFor(dimension.key)}
            onAddColumn={handleAddColumn}
            onRemoveColumn={handleRemoveColumn}
            onConfigure={handleConfigure}
            isReadyType={isReadyType(dimension.key)}
            configuredColumns={configuredColumns.get(dimension.key) || new Set()}
            columnConfigs={columnConfigs}
            logicDescription={getLogicDescriptionForDimension(dimension.key)}
          />
        ))}
      </div>

      {dimensions.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          <AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-400" />
          <p className="font-medium">No active dimensions configured</p>
        </div>
      )}

      {configModal.isOpen && configModal.dimension && (
        <DimensionConfigModal
          isOpen={configModal.isOpen}
          onClose={() => setConfigModal({ isOpen: false, dimension: null, dimensionName: '', column: '' })}
          dimension={configModal.dimension}
          dimensionName={configModal.dimensionName}
          column={configModal.column}
          existingConfig={configModal.existingConfig}
          allColumns={data.headers.filter(h => {
            // For the uniqueness modal, exclude companion columns already used by OTHER uniqueness configs
            if (configModal.dimension !== 'uniqueness') return true;
            if (!referencedColumnsInUse.has(h)) return true;
            // Allow if this column is already a companion of the current column being configured
            const currentCfg = columnConfigs.get(`uniqueness:${configModal.column}`);
            const currentCompanions = (currentCfg?.companionColumns as string[]) ?? [];
            return currentCompanions.includes(h);
          })}
          onSave={handleSaveConfiguration}
        />
      )}

      {showSaveTemplateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="bg-gradient-to-r from-[#008192] to-[#064B77] text-white px-6 py-4 rounded-t-xl">
              <h2 className="text-xl font-bold">Save Template</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Template Name *
                </label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="e.g., Standard Quality Check"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#03AD9A] focus:border-transparent outline-none"
                />
              </div>
              <div className="flex items-center justify-end space-x-3 pt-4">
                <button
                  onClick={() => {
                    setShowSaveTemplateModal(false);
                    setTemplateName('');
                  }}
                  className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition"
                  disabled={isSavingTemplate}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmSaveTemplate}
                  disabled={isSavingTemplate}
                  className="px-6 py-2 bg-[#008192] text-white rounded-lg hover:bg-[#064B77] transition disabled:opacity-50 flex items-center space-x-2"
                >
                  {isSavingTemplate ? (
                    <>
                      <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Save</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
