import { useState, useImperativeHandle, forwardRef } from 'react';
import { Sparkles, X, CheckCircle2, ChevronDown, ChevronUp, AlertCircle, ArrowRightLeft } from 'lucide-react';

interface ColumnData {
  name: string;
  sampleValues: unknown[];
  distinctCount: number;
  isNumeric: boolean;
  nullCount: number;
}

export interface Recommendation {
  column: string;
  dimension: 'validity' | 'consistency';
  validationType: string | null;
  config: Record<string, unknown>;
  reason: string;
}

export interface AiValidityRecommenderHandle {
  trigger: () => void;
  isLoading: boolean;
}

interface AiValidityRecommenderProps {
  projectName: string;
  projectDescription: string;
  validityColumns: string[];
  data: {
    headers: string[];
    rows: Array<Record<string, string | number | boolean | null>>;
  };
  onApply: (recommendations: Recommendation[]) => void;
  onLoadingChange: (loading: boolean) => void;
}

type State = 'idle' | 'loading' | 'ready' | 'error';

function buildColumnProfiles(
  columns: string[],
  rows: Array<Record<string, string | number | boolean | null>>,
): ColumnData[] {
  return columns.map(col => {
    const allValues = rows
      .map(r => r[col])
      .filter(v => v !== null && v !== undefined && v !== '');
    const nullCount = rows.length - allValues.length;

    // Collect distinct values first (more representative than first-N)
    const distinctSet = new Set(allValues.map(v => String(v)));
    // Sample: take up to 5 of each distinct value, capped at 30 total
    const sampleMap = new Map<string, number>();
    const sample: unknown[] = [];
    for (const v of allValues) {
      const str = String(v);
      const count = sampleMap.get(str) ?? 0;
      if (count < 3 && sample.length < 30) {
        sample.push(v);
        sampleMap.set(str, count + 1);
      }
    }

    // Numeric: check against all values, not just sample
    const isNumeric = allValues.length > 0 &&
      allValues.every(v => {
        const str = String(v).trim();
        return str !== '' && !isNaN(Number(str));
      });

    return {
      name: col,
      sampleValues: sample,
      distinctCount: distinctSet.size,
      isNumeric,
      nullCount,
    };
  });
}

function ruleLabel(validationType: string | null, config: Record<string, unknown>): string {
  if (!validationType) return '—';
  switch (validationType) {
    case 'range':
    case 'vali_val_rang':
      return `Range: ${config.minValue ?? '—'} to ${config.maxValue ?? '—'}`;
    case 'vali_val_pos':
      return 'Positive values only';
    case 'sign':
      return config.expectedSign === 'negative' ? 'Negative values only' : 'Positive values only';
    case 'vali_val_neg':
      return 'Negative values only';
    case 'vali_high_val':
      return `Above threshold: ${config.threshold}`;
    case 'vali_low_val':
      return `Below threshold: ${config.threshold}`;
    case 'list':
    case 'vali_list_str':
      return `Allowed values: ${config.allowedValues}`;
    case 'pattern':
      return `Pattern: ${config.pattern}`;
    case 'datatype':
      return `Datatype: ${config.dataType}`;
    default:
      return validationType;
  }
}

function SkeletonCard() {
  return (
    <div className="p-4 border border-slate-100 rounded-lg space-y-2.5 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-4 bg-slate-200 rounded w-36" />
        <div className="h-5 bg-slate-100 rounded w-20" />
      </div>
      <div className="h-3.5 bg-slate-200 rounded w-48" />
      <div className="h-3 bg-slate-100 rounded w-64" />
    </div>
  );
}

const AiValidityRecommender = forwardRef<AiValidityRecommenderHandle, AiValidityRecommenderProps>(
  function AiValidityRecommender(
    { projectName, projectDescription, validityColumns, data, onApply, onLoadingChange },
    ref,
  ) {
    const [state, setState] = useState<State>('idle');
    const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
    const [dismissed, setDismissed] = useState(false);
    const [collapsed, setCollapsed] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const webhookUrl = import.meta.env.VITE_N8N_VALIDITY_WEBHOOK_URL as string | undefined;

    async function trigger() {
      if (!webhookUrl) return;
      // Always analyse all dataset columns so AI can recommend across all dimensions
      const targetCols = data.headers;
      if (targetCols.length === 0) return;

      setState('loading');
      onLoadingChange(true);
      setDismissed(false);
      setCollapsed(false);

      const columnProfiles = buildColumnProfiles(targetCols, data.rows);

      try {
        const res = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_name: projectName,
            project_description: projectDescription,
            columns: columnProfiles.map(c => ({
              name: c.name,
              sample_values: c.sampleValues,
              distinct_count: c.distinctCount,
              is_numeric: c.isNumeric,
              null_count: c.nullCount,
            })),
          }),
        });

        if (!res.ok) throw new Error(`n8n responded ${res.status}`);
        const json = await res.json();
        const raw: Recommendation[] = Array.isArray(json)
          ? json
          : Array.isArray(json.recommendations)
            ? json.recommendations
            : [];

        if (raw.length === 0) throw new Error('No recommendations returned');

        setRecommendations(raw);
        setState('ready');
        // Pass all recommendations — parent decides how to handle each dimension
        onApply(raw);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
        setState('error');
      } finally {
        onLoadingChange(false);
      }
    }

    useImperativeHandle(ref, () => ({
      trigger,
      get isLoading() { return state === 'loading'; },
    }));

    if (!webhookUrl || dismissed || state === 'idle') return null;

    const validityRecs = recommendations.filter(r => r.dimension === 'validity');
    const consistencyRecs = recommendations.filter(r => r.dimension === 'consistency');

    // ── Loading skeleton ──────────────────────────────────────────
    if (state === 'loading') {
      const skeletonCount = Math.min(Math.max(data.headers.length || 3, 1), 6);
      return (
        <div className="bg-white border border-violet-100 rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-violet-50 bg-gradient-to-r from-violet-50 to-purple-50">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold text-violet-800">AI Rule Check Recommendations</span>
            <span className="flex items-center gap-1.5 text-xs text-violet-500 bg-violet-100 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
              Analysing {data.headers.length} columns…
            </span>
          </div>
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: skeletonCount }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        </div>
      );
    }

    // ── Error ─────────────────────────────────────────────────────
    if (state === 'error') {
      return (
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>AI recommendation failed: {errorMsg}</span>
          </div>
          <button onClick={() => setDismissed(true)} className="p-1 hover:bg-red-100 rounded transition flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      );
    }

    // ── Ready ─────────────────────────────────────────────────────
    return (
      <div className="bg-white border border-violet-100 rounded-xl shadow-sm overflow-hidden">

        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3.5 border-b border-violet-50 bg-gradient-to-r from-violet-50 to-purple-50 cursor-pointer select-none"
          onClick={() => setCollapsed(c => !c)}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold text-violet-800">AI Rule Check Recommendations</span>
            {validityRecs.length > 0 && (
              <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                {validityRecs.length} validity applied
              </span>
            )}
            {consistencyRecs.length > 0 && (
              <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                {consistencyRecs.length} use Consistency
              </span>
            )}
            <span className="text-xs text-slate-400">Based on "{projectName}"</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={e => { e.stopPropagation(); setDismissed(true); }}
              className="p-1 hover:bg-violet-100 rounded transition text-violet-400"
              title="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            {collapsed
              ? <ChevronDown className="w-4 h-4 text-violet-400" />
              : <ChevronUp className="w-4 h-4 text-violet-400" />
            }
          </div>
        </div>

        {!collapsed && (
          <>
            {/* Validity recommendations */}
            {validityRecs.length > 0 && (
              <div className="p-4 space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Validity Rules — Auto Applied
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {validityRecs.map(rec => (
                    <div
                      key={rec.column}
                      className="p-4 border border-violet-100 rounded-lg bg-violet-50/40 hover:bg-violet-50 transition space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-800 break-all">{rec.column}</span>
                        <span className="flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-200 whitespace-nowrap flex-shrink-0">
                          <CheckCircle2 className="w-3 h-3" />
                          Applied
                        </span>
                      </div>
                      <div className="text-xs font-medium text-violet-700 bg-white px-2 py-1 rounded border border-violet-100">
                        {ruleLabel(rec.validationType, rec.config)}
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">{rec.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Divider between sections */}
            {validityRecs.length > 0 && consistencyRecs.length > 0 && (
              <div className="mx-4 border-t border-slate-100" />
            )}

            {/* Consistency suggestions */}
            {consistencyRecs.length > 0 && (
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Configure Under Consistency Instead
                  </p>
                  <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                    Not applied to Validity
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {consistencyRecs.map(rec => (
                    <div
                      key={rec.column}
                      className="p-4 border border-blue-100 rounded-lg bg-blue-50/40 hover:bg-blue-50 transition space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-800 break-all">{rec.column}</span>
                        <span className="flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full border border-blue-200 whitespace-nowrap flex-shrink-0">
                          <ArrowRightLeft className="w-3 h-3" />
                          Consistency
                        </span>
                      </div>
                      <div className="text-xs font-medium text-blue-700 bg-white px-2 py-1 rounded border border-blue-100">
                        Validate against reference data
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">{rec.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="px-5 py-2.5 border-t border-violet-50 bg-violet-50/30 space-y-0.5">
              {validityRecs.length > 0 && (
                <p className="text-xs text-violet-500">
                  Validity rules auto-applied and configured. Review, save as template, then execute.
                </p>
              )}
              {consistencyRecs.length > 0 && (
                <p className="text-xs text-blue-500">
                  Consistency columns auto-added to the Consistency dimension — you still need to configure each one with a reference dataset or inline list.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    );
  }
);

export default AiValidityRecommender;
