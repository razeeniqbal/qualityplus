import { useState, useEffect, useRef } from 'react';
import { Sparkles, ChevronDown, ChevronUp, ExternalLink, Loader2, AlertCircle, TableProperties } from 'lucide-react';
import { apiClient } from '../lib/api-client';
import type { RowDetail } from './QualityConfiguration';
import type { QualityResult } from '../types/database';
import CombinedFailedRowsModal from './CombinedFailedRowsModal';

interface ResultWithDetails extends QualityResult {
  rowDetails?: RowDetail[];
}

interface AiSummaryPanelProps {
  scoreId?: string;
  datasetId: string;
  results: ResultWithDetails[];
  overallScore: number;
  totalPassed: number;
  totalFailed: number;
  onViewFailedRows: (columnName: string, dimension: string) => void;
}

type SummaryState = 'loading' | 'waiting' | 'ready' | 'error' | 'timeout';

interface ParsedSummary {
  overview: string;
  issues: Array<{ columnName: string; dimension: string; failedCount: number; reason: string }>;
  recommendations: string[];
}

function parseSummary(raw: string, results: ResultWithDetails[]): ParsedSummary {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const sectionMarkers = /^\[(OVERVIEW|KEY ISSUES|RECOMMENDATIONS)\]$/i;

  let section = '';
  const overviewLines: string[] = [];
  const recLines: string[] = [];

  for (const line of lines) {
    if (sectionMarkers.test(line)) {
      section = line.replace(/\[|\]/g, '').toLowerCase();
      continue;
    }
    if (section === 'overview') overviewLines.push(line);
    if (section === 'recommendations') {
      const cleaned = line.replace(/^[\d]+[.)]\s*/, '').trim();
      if (cleaned) recLines.push(cleaned);
    }
  }

  const overview = overviewLines.join(' ').replace(/\s+/g, ' ').trim();

  const issues = results
    .filter(r => r.failed_count > 0)
    .sort((a, b) => b.failed_count - a.failed_count)
    .map(r => ({
      columnName: r.column_name,
      dimension: r.dimension,
      failedCount: r.failed_count,
      reason: r.rowDetails?.find(d => !d.passed)?.reason
        ?? `${r.failed_count} record${r.failed_count !== 1 ? 's' : ''} failed ${r.dimension} check`,
    }));

  return { overview, issues, recommendations: recLines.slice(0, 3) };
}

function SkeletonLine({ width = 'w-full', height = 'h-4' }: { width?: string; height?: string }) {
  return <div className={`${height} ${width} bg-slate-200 rounded animate-pulse`} />;
}

function Skeleton() {
  return (
    <div className="px-6 py-5 space-y-5">
      {/* Overview lines */}
      <div className="space-y-2.5">
        <SkeletonLine width="w-full" />
        <SkeletonLine width="w-11/12" />
        <SkeletonLine width="w-3/4" />
      </div>

      {/* Key Issues label */}
      <div className="space-y-2">
        <SkeletonLine width="w-24" height="h-3" />
        {/* Issue rows */}
        {[1, 2].map(i => (
          <div key={i} className="flex items-center justify-between px-4 py-3 bg-slate-50 rounded-lg border border-slate-100">
            <div className="flex items-center gap-3 flex-1">
              <div className="w-4 h-4 rounded-full bg-slate-200 animate-pulse flex-shrink-0" />
              <div className="space-y-1.5 flex-1">
                <div className="flex gap-2">
                  <SkeletonLine width="w-28" height="h-3.5" />
                  <SkeletonLine width="w-16" height="h-3.5" />
                  <SkeletonLine width="w-16" height="h-3.5" />
                </div>
                <SkeletonLine width="w-48" height="h-3" />
              </div>
            </div>
            <SkeletonLine width="w-16" height="h-3" />
          </div>
        ))}
      </div>

      {/* Recommendations label */}
      <div className="space-y-2">
        <SkeletonLine width="w-28" height="h-3" />
        {[1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-slate-200 animate-pulse flex-shrink-0" />
            <SkeletonLine width={i === 1 ? 'w-full' : i === 2 ? 'w-10/12' : 'w-8/12'} height="h-3.5" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AiSummaryPanel({ scoreId, datasetId, results, overallScore, totalPassed, totalFailed, onViewFailedRows }: AiSummaryPanelProps) {
  const [state, setState] = useState<SummaryState>('loading');
  const [summary, setSummary] = useState<ParsedSummary | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showCombinedModal, setShowCombinedModal] = useState(false);

  const n8nWebhookUrl = import.meta.env.VITE_N8N_WEBHOOK_URL as string | undefined;

  // All hooks must run unconditionally — guard rendering below, not here
  useEffect(() => {
    if (!n8nWebhookUrl || !scoreId) return;
    loadOrTrigger(scoreId);
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoreId, n8nWebhookUrl]);

  // Don't render at all if n8n is not configured or score hasn't been saved yet
  if (!n8nWebhookUrl || !scoreId) return null;

  async function loadOrTrigger(id: string) {
    setState('loading');
    try {
      const existing = await apiClient.getAiSummary(id);
      if (existing) {
        setSummary(parseSummary(existing, results));
        setState('ready');
        return;
      }
      await triggerN8n(id);
      setState('waiting');
      schedulePoll(id, 0);
    } catch {
      setState('error');
    }
  }

  async function triggerN8n(id: string) {
    await fetch(n8nWebhookUrl!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        score_id: id,
        overall_score: overallScore,
        total_passed: totalPassed,
        total_failed: totalFailed,
        results: results.map(r => ({
          column_name: r.column_name,
          dimension: r.dimension,
          score: r.score,
          passed_count: r.passed_count,
          failed_count: r.failed_count,
          total_count: r.total_count,
          sample_reasons: (r.rowDetails ?? [])
            .filter(d => !d.passed)
            .slice(0, 5)
            .map(d => d.reason)
            .filter(Boolean),
        })),
      }),
    });
  }

  function schedulePoll(id: string, attempt: number) {
    if (attempt >= 15) {
      setState('timeout');
      return;
    }
    pollRef.current = setTimeout(async () => {
      setPollCount(attempt + 1);
      try {
        const text = await apiClient.getAiSummary(id);
        if (text) {
          setSummary(parseSummary(text, results));
          setState('ready');
        } else {
          schedulePoll(id, attempt + 1);
        }
      } catch {
        schedulePoll(id, attempt + 1);
      }
    }, 4000);
  }

  const failedIssues = summary?.issues ?? [];

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden border border-slate-100">

      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4 cursor-pointer select-none border-b border-slate-100 hover:bg-slate-50 transition"
        onClick={() => setCollapsed(c => !c)}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-7 h-7 rounded-full flex-shrink-0" style={{ background: 'linear-gradient(135deg, #1D275A, #008192)' }}>
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-slate-800">AI Summary</span>

          {(state === 'loading' || state === 'waiting') && (
            <span className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
              <Loader2 className="w-3 h-3 animate-spin" />
              {state === 'loading' ? 'Loading…' : `Generating${pollCount > 0 ? ` (${pollCount * 4}s…)` : '…'}`}
            </span>
          )}
          {state === 'ready' && (
            <span className="text-xs text-[#008192] bg-[#f0faf8] px-2 py-0.5 rounded-full border border-[#a8e0d6]">
              AI-generated
            </span>
          )}
          {state === 'error' && (
            <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
              Failed
            </span>
          )}
          {state === 'timeout' && (
            <span className="text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full border border-orange-200">
              Timed out
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {collapsed
            ? <ChevronDown className="w-4 h-4 text-slate-400" />
            : <ChevronUp className="w-4 h-4 text-slate-400" />
          }
        </div>
      </div>

      {/* Body */}
      {!collapsed && (
        <>
          {/* Skeleton while loading / waiting for Ollama */}
          {(state === 'loading' || state === 'waiting') && <Skeleton />}

          {/* Error */}
          {state === 'error' && (
            <div className="px-6 py-5">
              <div className="flex items-center gap-3 p-4 bg-red-50 rounded-lg border border-red-200 text-sm text-red-700">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span>Could not reach n8n. Check that your workflow is active and the webhook URL is correct.</span>
              </div>
            </div>
          )}

          {/* Timeout */}
          {state === 'timeout' && (
            <div className="px-6 py-5">
              <div className="flex items-center gap-3 p-4 bg-orange-50 rounded-lg border border-orange-200 text-sm text-orange-700">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span>Ollama is taking longer than expected. The summary may still arrive — try re-opening this result.</span>
              </div>
            </div>
          )}

          {/* Ready */}
          {state === 'ready' && summary && (
            <div className="px-6 py-5 space-y-5">
              {summary.overview && (
                <p className="text-sm text-slate-700 leading-relaxed text-justify">{summary.overview}</p>
              )}

              {failedIssues.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Key Issues</h4>
                  <div className="space-y-2">
                    {failedIssues.map(issue => (
                      <div
                        key={`${issue.columnName}-${issue.dimension}`}
                        className="flex items-center justify-between gap-3 px-4 py-3 bg-red-50 rounded-lg border border-red-100 hover:border-red-200 transition group"
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          <div className="mt-0.5 w-4 h-4 rounded-full bg-red-200 flex items-center justify-center flex-shrink-0">
                            <span className="text-red-700 text-[9px] font-bold">✗</span>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-semibold text-slate-800">{issue.columnName}</span>
                              <span className="text-slate-400">·</span>
                              <span className="capitalize text-xs text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded">
                                {issue.dimension}
                              </span>
                              <span className="text-xs font-medium text-red-600 bg-red-100 px-1.5 py-0.5 rounded">
                                {issue.failedCount.toLocaleString()} failed
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5 truncate max-w-xl">{issue.reason}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => onViewFailedRows(issue.columnName, issue.dimension)}
                          className="flex items-center gap-1 text-xs text-[#008192] hover:text-[#064B77] font-medium whitespace-nowrap flex-shrink-0 opacity-80 group-hover:opacity-100 transition"
                        >
                          View rows
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {failedIssues.length === 0 && (
                <div className="flex items-center gap-2 px-4 py-3 bg-green-50 rounded-lg border border-green-200 text-sm text-green-700 font-medium">
                  <span>✓</span> All checks passed — no issues detected.
                </div>
              )}

              {summary.recommendations.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Recommendations</h4>
                  <ol className="space-y-1.5">
                    {summary.recommendations.map((rec, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#d4f0ea] text-[#008192] text-xs font-bold flex items-center justify-center mt-0.5">
                          {i + 1}
                        </span>
                        {rec}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Combined failed rows button */}
              {failedIssues.length > 0 && (
                <button
                  onClick={() => setShowCombinedModal(true)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-lg transition text-left group"
                >
                  <div className="flex items-center gap-2">
                    <TableProperties className="w-4 h-4 text-red-500" />
                    <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      View All Failed Rows
                    </span>
                    <span className="text-xs text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full font-medium">
                      {totalFailed.toLocaleString()} checks failed
                    </span>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-red-500 transition" />
                </button>
              )}

              {/* Combined failed rows modal */}
              {showCombinedModal && (
                <CombinedFailedRowsModal
                  datasetId={datasetId}
                  results={results}
                  onClose={() => setShowCombinedModal(false)}
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
