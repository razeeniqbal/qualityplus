import { useState, useEffect, useRef } from 'react';
import { Download, ArrowLeft, ChevronUp, CheckCircle, XCircle, Eye, Search, BookMarked, X } from 'lucide-react';
import { apiClient } from '../lib/api-client';
import type { QualityResult } from '../types/database';
import type { QualityCheckResult, RowDetail } from './QualityConfiguration';
import AiSummaryPanel from './AiSummaryPanel';
import FailedRowsModal from './FailedRowsModal';

interface ResultWithDetails extends QualityResult {
  rowDetails?: RowDetail[];
}

interface ResultsViewProps {
  datasetId: string;
  datasetName?: string;
  publishedBy?: string;
  initialResults?: QualityCheckResult[] | null;
  /** All columns that were selected for quality checks — used for dataset trimming on save */
  selectedColumns?: string[];
  onBack: () => void;
  onPublished?: () => void;
  /** When true, hides the Save button (used when viewing a saved result score) */
  readOnly?: boolean;
  /** Pre-supply the score ID when viewing an already-saved score (Results tab) */
  savedScoreId?: string;
}

export default function ResultsView({ datasetId, datasetName, publishedBy, initialResults, selectedColumns, onBack, onPublished, readOnly = false, savedScoreId: savedScoreIdProp }: ResultsViewProps) {
  const [results, setResults] = useState<ResultWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pass' | 'fail'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Save Result Score modal
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveLabel, setSaveLabel] = useState('');
  const [trimDataset, setTrimDataset] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedToast, setSavedToast] = useState(false);
  const [savedScoreId, setSavedScoreId] = useState<string | null>(savedScoreIdProp ?? null);

  // Failed rows modal
  const [failedRowsModal, setFailedRowsModal] = useState<{ columnName: string; dimension: string } | null>(null);

  const [expandedResult, setExpandedResult] = useState<string | null>(null);
  const [detailFilter, setDetailFilter] = useState<'all' | 'pass' | 'fail'>('all');
  const [detailSearch, setDetailSearch] = useState('');
  const [detailPage, setDetailPage] = useState(0);
  const ROWS_PER_PAGE = 20;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadResults(); }, [datasetId]);

  // Tracks whether the user has published so cleanup doesn't delete a real score
  const isPublishedRef = useRef(false);

  // Auto-save a single draft score when results load so n8n can start immediately.
  // Deletes any previous draft for this dataset first (prevents accumulation).
  // Cleans up the draft on unmount if the user never clicked Save Result Score.
  useEffect(() => {
    if (readOnly || results.length === 0) return;
    if (!import.meta.env.VITE_N8N_WEBHOOK_URL) return;

    let draftId: string | null = null;

    apiClient.deleteDraftScores(datasetId)
      .then(() => apiClient.saveDraftScore(
        datasetId,
        publishedBy ?? 'Unknown',
        results.reduce((sum, r) => sum + r.score, 0) / results.length,
        results.map(r => ({
          id: r.id, column_name: r.column_name, dimension: r.dimension,
          passed_count: r.passed_count, failed_count: r.failed_count,
          total_count: r.total_count, score: r.score, executed_at: r.executed_at,
        })),
      ))
      .then(id => { draftId = id; setSavedScoreId(id); })
      .catch(() => { /* silent — AI panel just won't show */ });

    return () => {
      // Delete the draft if user navigates away without publishing
      if (draftId && !isPublishedRef.current) {
        apiClient.deleteDraftScores(datasetId).catch(() => {});
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results]);

  async function loadResults() {
    try {
      if (initialResults && initialResults.length > 0) {
        setResults(initialResults as ResultWithDetails[]);
        setLoading(false);
        return;
      }

      const data = await apiClient.getQualityResults(datasetId) as ResultWithDetails[];
      setResults(data || []);
    } catch (error) {
      console.error('Error loading results:', error);
    } finally {
      setLoading(false);
    }
  }

  function getScoreColor(score: number) {
    if (score === 100) return 'text-green-600';
    if (score >= 75) return 'text-yellow-600';
    if (score >= 50) return 'text-orange-600';
    return 'text-red-600';
  }

  function getScoreBg(score: number) {
    if (score === 100) return 'bg-green-500';
    if (score >= 75) return 'bg-yellow-500';
    if (score >= 50) return 'bg-orange-500';
    return 'bg-red-500';
  }

  function getScoreRingColor(score: number) {
    if (score === 100) return 'border-green-500';
    if (score >= 75) return 'border-yellow-500';
    if (score >= 50) return 'border-orange-500';
    return 'border-red-500';
  }

  function handleExport() {
    const csvContent = [
      ['Column', 'Dimension', 'Passed', 'Failed', 'Total', 'Score'],
      ...results.map((result) => [
        result.column_name,
        result.dimension,
        result.passed_count,
        result.failed_count,
        result.total_count,
        `${result.score.toFixed(2)}%`,
      ]),
    ]
      .map((row) => row.join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'quality-results.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleSave() {
    const label = saveLabel.trim() || `Run ${new Date().toLocaleString('en-GB')}`;
    setIsSaving(true);
    setSaveError(null);
    try {
      // Optionally trim dataset to selected columns
      if (trimDataset && selectedColumns && selectedColumns.length > 0) {
        await apiClient.trimDatasetColumns(datasetId, selectedColumns);
      }

      // If a draft was already auto-saved (for AI summary), promote it instead of inserting a duplicate
      const saved = savedScoreId
        ? await apiClient.publishDraftScore(
            savedScoreId,
            label,
            results.map(r => ({
              id: r.id,
              column_name: r.column_name,
              dimension: r.dimension,
              passed_count: r.passed_count,
              failed_count: r.failed_count,
              total_count: r.total_count,
              score: r.score,
              executed_at: r.executed_at,
              rowDetails: r.rowDetails ?? [],
            })),
          )
        : await apiClient.saveQualityScore(
            datasetId,
            label,
            publishedBy ?? 'Unknown',
            overallScore,
            results.map(r => ({
              id: r.id,
              column_name: r.column_name,
              dimension: r.dimension,
              passed_count: r.passed_count,
              failed_count: r.failed_count,
              total_count: r.total_count,
              score: r.score,
              executed_at: r.executed_at,
              rowDetails: r.rowDetails ?? [],
            })),
          );
      setSavedScoreId((saved as { id: string }).id);
      isPublishedRef.current = true;
      setShowSaveModal(false);
      setSaveLabel('');
      setTrimDataset(false);
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 3500);
      onPublished?.();
    } catch (err) {
      console.error('Save result score failed:', err);
      setSaveError(err instanceof Error ? err.message : 'Failed to save result score. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  function toggleExpand(resultId: string) {
    if (expandedResult === resultId) {
      setExpandedResult(null);
    } else {
      setExpandedResult(resultId);
      setDetailFilter('all');
      setDetailSearch('');
      setDetailPage(0);
    }
  }

  const filteredResults = results.filter((result) => {
    if (filterStatus === 'pass' && result.score < 100) return false;
    if (filterStatus === 'fail' && result.score === 100) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!result.column_name.toLowerCase().includes(q) && !result.dimension.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const overallScore =
    results.length > 0
      ? results.reduce((sum, r) => sum + r.score, 0) / results.length
      : 0;

  const totalPassed = results.reduce((sum, r) => sum + r.passed_count, 0);
  const totalFailed = results.reduce((sum, r) => sum + r.failed_count, 0);
  const totalChecks = totalPassed + totalFailed;

  if (loading) {
    return (
      <div className="text-center py-20">
        <div className="animate-spin w-12 h-12 border-4 border-teal-600 border-t-transparent rounded-full mx-auto"></div>
        <p className="text-slate-600 mt-4">Loading results...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Published toast */}
      {savedToast && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-2 bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-xl animate-fade-in">
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm font-medium">Result score saved successfully</span>
        </div>
      )}

      {/* Publish modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <BookMarked className="w-5 h-5 text-teal-600" />
                <h2 className="text-base font-bold text-slate-800">Save Result Score</h2>
              </div>
              <button onClick={() => setShowSaveModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg transition">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-500">
                Save a named quality result score for this run. All project members can view saved result scores.
              </p>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Result Score Label <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={saveLabel}
                  onChange={e => setSaveLabel(e.target.value)}
                  placeholder={`e.g. Sprint 12 – ${datasetName ?? 'Dataset'}`}
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                  autoFocus
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
                />
              </div>
              <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg text-xs text-slate-500">
                <span>Overall score:</span>
                <span className="font-bold text-slate-700">{overallScore.toFixed(1)}%</span>
                <span className="mx-1">·</span>
                <span>{results.length} check{results.length !== 1 ? 's' : ''}</span>
                {selectedColumns && selectedColumns.length > 0 && (
                  <>
                    <span className="mx-1">·</span>
                    <span>{selectedColumns.length} column{selectedColumns.length !== 1 ? 's' : ''} checked</span>
                  </>
                )}
              </div>

              {/* Trim dataset option */}
              {selectedColumns && selectedColumns.length > 0 && (
                <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition">
                  <input
                    type="checkbox"
                    checked={trimDataset}
                    onChange={e => setTrimDataset(e.target.checked)}
                    className="mt-0.5 accent-teal-600 flex-shrink-0"
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-700">
                      Trim dataset to selected columns only
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Removes unselected columns from the stored dataset permanently.
                      Only the {selectedColumns.length} column{selectedColumns.length !== 1 ? 's' : ''} used in this quality check will be kept.
                      <span className="text-amber-600 font-medium"> This cannot be undone.</span>
                    </p>
                  </div>
                </label>
              )}
            </div>
            {saveError && (
              <div className="mx-5 mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
                {saveError}
              </div>
            )}
            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-200">
              <button
                onClick={() => setShowSaveModal(false)}
                className="px-4 py-2 text-sm text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-gradient-to-r from-teal-600 to-emerald-600 text-white rounded-lg hover:from-teal-700 hover:to-emerald-700 transition font-medium disabled:opacity-50"
              >
                {isSaving
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /><span>Saving...</span></>
                  : <><BookMarked className="w-4 h-4" /><span>Save</span></>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center space-x-2 text-slate-600 hover:text-slate-800 transition"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>{readOnly ? 'Back to Result Scores' : 'Back to Quality Check'}</span>
        </button>
        <div className="flex items-center space-x-4">
          <button
            onClick={handleExport}
            className="flex items-center space-x-2 bg-teal-600 text-white px-6 py-2 rounded-lg hover:bg-teal-700 transition"
          >
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>
          {!readOnly && (
            <button
              onClick={() => setShowSaveModal(true)}
              className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 text-white rounded-lg hover:from-teal-700 hover:to-emerald-700 transition font-medium"
            >
              <BookMarked className="w-4 h-4" />
              <span>Save Result Score</span>
            </button>
          )}
        </div>
      </div>

      {/* Score Overview */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-8">
            {/* Score Circle */}
            <div className="relative w-32 h-32">
              <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="52" fill="none" stroke="#e2e8f0" strokeWidth="10" />
                <circle
                  cx="60" cy="60" r="52" fill="none"
                  stroke={overallScore === 100 ? '#22c55e' : overallScore >= 75 ? '#eab308' : overallScore >= 50 ? '#f97316' : '#ef4444'}
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={`${(overallScore / 100) * 327} 327`}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`text-3xl font-bold ${getScoreColor(overallScore)}`}>
                  {overallScore.toFixed(0)}%
                </span>
              </div>
            </div>

            {/* Summary Stats */}
            <div className="space-y-3">
              <h2 className="text-2xl font-bold text-slate-800">Quality Score</h2>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center px-4 py-2 bg-slate-50 rounded-lg">
                  <div className="text-2xl font-bold text-slate-800">{totalChecks.toLocaleString()}</div>
                  <div className="text-xs text-slate-500 font-medium">Total Checks</div>
                </div>
                <div className="text-center px-4 py-2 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{totalPassed.toLocaleString()}</div>
                  <div className="text-xs text-green-600 font-medium">Passed</div>
                </div>
                <div className="text-center px-4 py-2 bg-red-50 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">{totalFailed.toLocaleString()}</div>
                  <div className="text-xs text-red-600 font-medium">Failed</div>
                </div>
              </div>
            </div>
          </div>

          {/* Filter Buttons */}
          <div className="flex space-x-2">
            {(['all', 'pass', 'fail'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-4 py-2 rounded-lg transition text-sm font-medium ${
                  filterStatus === status
                    ? status === 'all' ? 'bg-teal-600 text-white'
                      : status === 'pass' ? 'bg-green-600 text-white'
                      : 'bg-red-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {status === 'all' ? 'All' : status === 'pass' ? 'Passed' : 'Failed'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* AI Summary Panel */}
      <AiSummaryPanel
        scoreId={savedScoreId ?? undefined}
        datasetId={datasetId}
        results={results}
        overallScore={overallScore}
        totalPassed={totalPassed}
        totalFailed={totalFailed}
        onViewFailedRows={(columnName, dimension) => setFailedRowsModal({ columnName, dimension })}
      />

      {/* Failed Rows Modal */}
      {failedRowsModal && (() => {
        const matchedResult = results.find(
          r => r.column_name === failedRowsModal.columnName && r.dimension === failedRowsModal.dimension
        );
        return matchedResult ? (
          <FailedRowsModal
            datasetId={datasetId}
            columnName={failedRowsModal.columnName}
            dimension={failedRowsModal.dimension}
            failedRowDetails={matchedResult.rowDetails ?? []}
            onClose={() => setFailedRowsModal(null)}
          />
        ) : null;
      })()}

      {/* Dimension Score Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {['completeness', 'uniqueness', 'consistency', 'validity'].map((dimension) => {
          const dimensionResults = results.filter(r => r.dimension === dimension);
          const dimScore = dimensionResults.length > 0
            ? dimensionResults.reduce((sum, r) => sum + r.score, 0) / dimensionResults.length
            : -1;

          return (
            <div key={dimension} className="bg-white rounded-lg shadow-md p-4 text-center">
              <h3 className="font-semibold text-slate-600 text-sm uppercase tracking-wide mb-3 capitalize">{dimension}</h3>
              {dimScore >= 0 ? (
                <>
                  <div className={`text-3xl font-bold ${getScoreColor(dimScore)}`}>
                    {dimScore.toFixed(0)}%
                  </div>
                  <div className="mt-2 w-full bg-slate-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${getScoreBg(dimScore)}`}
                      style={{ width: `${dimScore}%` }}
                    />
                  </div>
                  <div className="text-xs text-slate-500 mt-2">
                    {dimensionResults.length} attribute{dimensionResults.length !== 1 ? 's' : ''} checked
                  </div>
                </>
              ) : (
                <div className="text-sm text-slate-400 py-4">Not configured</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Detailed Results Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Detailed Results</h3>
            <p className="text-sm text-slate-500 mt-0.5">Click on any row to view per-record details</p>
          </div>
          <div className="relative w-60">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search column or dimension..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Column</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Dimension</th>
                <th className="text-center px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Score</th>
                <th className="text-center px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Passed</th>
                <th className="text-center px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Failed</th>
                <th className="text-center px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Total</th>
                <th className="text-center px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Details</th>
              </tr>
            </thead>
            {filteredResults.map((result) => {
                const isExpanded = expandedResult === result.id;
                const hasDetails = result.rowDetails && result.rowDetails.length > 0;

                const filteredDetails = (result.rowDetails || []).filter(d => {
                  if (detailFilter === 'pass') return d.passed;
                  if (detailFilter === 'fail') return !d.passed;
                  if (detailSearch.trim()) {
                    const q = detailSearch.toLowerCase();
                    const valMatch = d.value !== null && d.value !== undefined && String(d.value).toLowerCase().includes(q);
                    const reasonMatch = d.reason ? d.reason.toLowerCase().includes(q) : false;
                    const rowMatch = String(d.rowIndex + 1).includes(q);
                    if (!valMatch && !reasonMatch && !rowMatch) return false;
                  }
                  return true;
                });

                const totalPages = Math.ceil(filteredDetails.length / ROWS_PER_PAGE);
                const paginatedDetails = filteredDetails.slice(
                  detailPage * ROWS_PER_PAGE,
                  (detailPage + 1) * ROWS_PER_PAGE
                );

                return (
                  <tbody key={result.id}>
                    <tr
                      className={`border-b border-slate-100 transition cursor-pointer ${
                        isExpanded ? 'bg-teal-50' : 'hover:bg-slate-50'
                      }`}
                      onClick={() => hasDetails && toggleExpand(result.id)}
                    >
                      <td className="px-6 py-4">
                        <span className="font-medium text-slate-800">{result.column_name}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="capitalize text-sm text-slate-600 bg-slate-100 px-2 py-1 rounded">
                          {result.dimension}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <div className={`w-10 h-10 rounded-full border-4 ${getScoreRingColor(result.score)} flex items-center justify-center`}>
                            <span className={`text-xs font-bold ${getScoreColor(result.score)}`}>
                              {result.score.toFixed(0)}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-green-600 font-medium">{result.passed_count.toLocaleString()}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`font-medium ${result.failed_count > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                          {result.failed_count.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-slate-600">{result.total_count.toLocaleString()}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {hasDetails ? (
                          <button className="text-teal-600 hover:text-teal-800 transition">
                            {isExpanded ? (
                              <ChevronUp className="w-5 h-5 mx-auto" />
                            ) : (
                              <Eye className="w-5 h-5 mx-auto" />
                            )}
                          </button>
                        ) : (
                          <span className="text-slate-300 text-xs">N/A</span>
                        )}
                      </td>
                    </tr>

                    {/* Expanded Row Details */}
                    {isExpanded && hasDetails && (
                      <tr>
                        <td colSpan={7} className="px-0 py-0">
                          <div className="bg-slate-50 border-t-2 border-b-2 border-teal-200">
                            {/* Detail Header */}
                            <div className="px-6 py-3 flex items-center justify-between gap-3 bg-teal-50 border-b border-teal-100 flex-wrap">
                              <div className="flex items-center space-x-2">
                                <span className="text-sm font-semibold text-teal-800">
                                  Row-Level Details: {result.column_name} ({result.dimension})
                                </span>
                                <span className="text-xs text-teal-600">
                                  {filteredDetails.length} of {result.rowDetails!.length} rows
                                </span>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                {/* Row search */}
                                <div className="relative" onClick={e => e.stopPropagation()}>
                                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                  <input
                                    type="text"
                                    placeholder="Search value or reason..."
                                    value={detailSearch}
                                    onChange={e => { setDetailSearch(e.target.value); setDetailPage(0); }}
                                    className="pl-7 pr-3 py-1 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-teal-400 focus:border-transparent outline-none bg-white w-44"
                                  />
                                </div>
                                {/* Pass/Fail filter */}
                                {(['all', 'pass', 'fail'] as const).map((f) => (
                                  <button
                                    key={f}
                                    onClick={(e) => { e.stopPropagation(); setDetailFilter(f); setDetailPage(0); }}
                                    className={`px-3 py-1 rounded text-xs font-medium transition ${
                                      detailFilter === f
                                        ? f === 'all' ? 'bg-teal-600 text-white'
                                          : f === 'pass' ? 'bg-green-600 text-white'
                                          : 'bg-red-600 text-white'
                                        : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                                    }`}
                                  >
                                    {f === 'all' ? 'All' : f === 'pass' ? 'Passed' : 'Failed'}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Detail Table */}
                            <div className="max-h-96 overflow-y-auto">
                              <table className="w-full">
                                <thead className="sticky top-0 bg-slate-100">
                                  <tr>
                                    <th className="text-left px-6 py-2 text-xs font-semibold text-slate-500 w-20">Row #</th>
                                    <th className="text-left px-6 py-2 text-xs font-semibold text-slate-500">Value</th>
                                    <th className="text-center px-6 py-2 text-xs font-semibold text-slate-500 w-24">Status</th>
                                    <th className="text-left px-6 py-2 text-xs font-semibold text-slate-500">Reason</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {paginatedDetails.map((detail) => (
                                    <tr
                                      key={detail.rowIndex}
                                      className={`border-b border-slate-100 ${
                                        detail.passed ? 'bg-white' : 'bg-red-50'
                                      }`}
                                    >
                                      <td className="px-6 py-2 text-sm text-slate-500 font-mono">
                                        {detail.rowIndex + 1}
                                      </td>
                                      <td className="px-6 py-2 text-sm text-slate-700 font-medium max-w-xs truncate">
                                        {detail.value !== null && detail.value !== undefined
                                          ? String(detail.value)
                                          : <span className="text-slate-400 italic">null</span>
                                        }
                                      </td>
                                      <td className="px-6 py-2 text-center">
                                        {detail.passed ? (
                                          <CheckCircle className="w-5 h-5 text-green-500 mx-auto" />
                                        ) : (
                                          <XCircle className="w-5 h-5 text-red-500 mx-auto" />
                                        )}
                                      </td>
                                      <td className="px-6 py-2 text-xs text-slate-500">
                                        {detail.reason || '-'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            {/* Pagination */}
                            {totalPages > 1 && (
                              <div className="px-6 py-3 flex items-center justify-between border-t border-slate-200 bg-white">
                                <span className="text-xs text-slate-500">
                                  Page {detailPage + 1} of {totalPages}
                                </span>
                                <div className="flex items-center space-x-2">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setDetailPage(Math.max(0, detailPage - 1)); }}
                                    disabled={detailPage === 0}
                                    className="px-3 py-1 text-xs bg-white border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                                  >
                                    Previous
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setDetailPage(Math.min(totalPages - 1, detailPage + 1)); }}
                                    disabled={detailPage >= totalPages - 1}
                                    className="px-3 py-1 text-xs bg-white border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                                  >
                                    Next
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                );
              })}
          </table>
        </div>

        {filteredResults.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <p className="font-medium">No results match the current filter</p>
          </div>
        )}
      </div>
    </div>
  );
}
