import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, XCircle, Search, Filter } from 'lucide-react';
import { apiClient } from '../lib/api-client';
import type { RowDetail } from './QualityConfiguration';
import type { QualityResult } from '../types/database';

interface ResultWithDetails extends QualityResult {
  rowDetails?: RowDetail[];
}

interface CombinedFailedRowsModalProps {
  datasetId: string;
  results: ResultWithDetails[];
  onClose: () => void;
}

interface FailInfo {
  columnName: string;
  dimension: string;
  reason: string;
}

const PAGE_SIZE_OPTIONS = [25, 50, 100, 500];

export default function CombinedFailedRowsModal({ datasetId, results, onClose }: CombinedFailedRowsModalProps) {
  const [allRows, setAllRows] = useState<Record<string, string>[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [searchQuery, setSearchQuery] = useState('');
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(false);

  // Build map: rowIndex → list of fail infos
  const failMap = useMemo(() => {
    const map = new Map<number, FailInfo[]>();
    for (const result of results) {
      if (result.failed_count === 0) continue;
      for (const detail of result.rowDetails ?? []) {
        if (!detail.passed) {
          const existing = map.get(detail.rowIndex) ?? [];
          existing.push({
            columnName: result.column_name,
            dimension: result.dimension,
            reason: detail.reason ?? `Failed ${result.dimension} check`,
          });
          map.set(detail.rowIndex, existing);
        }
      }
    }
    return map;
  }, [results]);

  const failedIndexSet = useMemo(() => new Set(failMap.keys()), [failMap]);
  const totalFailedRows = failedIndexSet.size;
  const failedColumns = useMemo(
    () => new Set(results.filter(r => r.failed_count > 0).map(r => r.column_name)),
    [results]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiClient.previewDataset(datasetId, 10000)
      .then(rows => {
        if (cancelled) return;
        const typed = rows as Record<string, string>[];
        if (typed.length > 0) {
          setColumns(Object.keys(typed[0]));
          setAllRows(typed);
        }
      })
      .catch(err => console.error('CombinedFailedRowsModal error', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId]);

  // Failed rows with original index
  const failedRows = useMemo(
    () => allRows.map((row, idx) => ({ row, idx })).filter(({ idx }) => failedIndexSet.has(idx)),
    [allRows, failedIndexSet]
  );

  // Apply search + column filters
  const filteredRows = useMemo(() => {
    let rows = failedRows;
    // Global search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(({ row }) =>
        columns.some(c => String(row[c] ?? '').toLowerCase().includes(q))
      );
    }
    // Per-column filters
    for (const [col, val] of Object.entries(colFilters)) {
      if (!val.trim()) continue;
      const q = val.toLowerCase();
      rows = rows.filter(({ row }) => String(row[col] ?? '').toLowerCase().includes(q));
    }
    return rows;
  }, [failedRows, searchQuery, colFilters, columns]);

  // Reset to page 1 when filters change
  useEffect(() => { setCurrentPage(1); }, [searchQuery, colFilters, rowsPerPage]);

  const effectiveRowsPerPage = rowsPerPage === 0 ? filteredRows.length || 1 : rowsPerPage;
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / effectiveRowsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * effectiveRowsPerPage;
  const pageRows = rowsPerPage === 0
    ? filteredRows
    : filteredRows.slice(startIndex, startIndex + effectiveRowsPerPage);

  const activeFilterCount = Object.values(colFilters).filter(v => v.trim()).length;

  function exportCSV() {
    if (columns.length === 0) return;
    const header = ['Row #', ...columns, 'Failed Checks', 'Fail Reasons'].join(',');
    const body = filteredRows.map(({ row, idx }) => {
      const infos = failMap.get(idx) ?? [];
      const checks = infos.map(i => `${i.columnName}(${i.dimension})`).join('; ');
      const reasons = infos.map(i => i.reason).join('; ');
      return [
        idx + 1,
        ...columns.map(c => `"${String(row[c] ?? '').replace(/"/g, '""')}"`),
        `"${checks}"`, `"${reasons}"`,
      ].join(',');
    });
    const blob = new Blob([[header, ...body].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'all_failed_rows.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-xl shadow-2xl flex flex-col w-full max-w-7xl max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <div>
              <h2 className="text-base font-bold text-slate-800">All Failed Rows — Combined View</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {totalFailedRows.toLocaleString()} unique row{totalFailedRows !== 1 ? 's' : ''} failed across{' '}
                {results.filter(r => r.failed_count > 0).length} check{results.filter(r => r.failed_count > 0).length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportCSV} disabled={loading || filteredRows.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition disabled:opacity-40">
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition">
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        </div>

        {/* Toolbar: search + rows per page + filter toggle */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-slate-100 bg-slate-50 flex-shrink-0 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search all columns…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none bg-white"
            />
          </div>

          {/* Column filter toggle */}
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition ${
              showFilters || activeFilterCount > 0
                ? 'bg-teal-600 text-white border-teal-600'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </button>

          {/* Rows per page */}
          <div className="flex items-center gap-1.5 text-xs text-slate-600 ml-auto">
            <span className="whitespace-nowrap">Rows per page:</span>
            <select
              value={rowsPerPage}
              onChange={e => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
              className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none bg-white"
            >
              {PAGE_SIZE_OPTIONS.map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
              <option value={0}>All ({filteredRows.length})</option>
            </select>
          </div>

          {/* Results count */}
          <span className="text-xs text-slate-400 whitespace-nowrap">
            {filteredRows.length.toLocaleString()} of {failedRows.length.toLocaleString()} failed rows
          </span>
        </div>

        {/* Per-column filters (collapsible) */}
        {showFilters && !loading && columns.length > 0 && (
          <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/80 flex-shrink-0">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {columns.map(col => (
                <div key={col}>
                  <label className={`block text-[10px] font-semibold uppercase tracking-wider mb-1 ${
                    failedColumns.has(col) ? 'text-red-600' : 'text-slate-500'
                  }`}>
                    {col}
                  </label>
                  <input
                    type="text"
                    placeholder="filter…"
                    value={colFilters[col] ?? ''}
                    onChange={e => setColFilters(prev => ({ ...prev, [col]: e.target.value }))}
                    className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-teal-400 outline-none bg-white"
                  />
                </div>
              ))}
            </div>
            {activeFilterCount > 0 && (
              <button
                onClick={() => setColFilters({})}
                className="mt-2 text-xs text-teal-600 hover:underline"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin w-10 h-10 border-4 border-teal-600 border-t-transparent rounded-full" />
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <p className="font-medium">No rows match the current filters</p>
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-100 border-b-2 border-slate-300">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap border-r border-slate-300 w-16">Row #</th>
                  {columns.map((col, i) => (
                    <th key={col}
                      className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider whitespace-nowrap ${
                        failedColumns.has(col) ? 'text-red-700 bg-red-50' : 'text-slate-600'
                      } ${i < columns.length - 1 ? 'border-r border-slate-300' : ''}`}>
                      {failedColumns.has(col) && <XCircle className="w-3 h-3 inline mr-1 text-red-400" />}
                      {col}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap border-l border-slate-300 min-w-[220px]">
                    Fail Reason
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {pageRows.map(({ row, idx }) => {
                  const infos = failMap.get(idx) ?? [];
                  const failedCols = new Set(infos.map(i => i.columnName));
                  return (
                    <tr key={idx} className="bg-red-50 hover:bg-red-100 transition-colors">
                      <td className="px-4 py-2.5 text-xs text-slate-500 font-mono border-r border-slate-200">{idx + 1}</td>
                      {columns.map((col, i) => (
                        <td key={col}
                          className={`px-4 py-2.5 text-sm whitespace-nowrap max-w-[180px] truncate ${
                            failedCols.has(col) ? 'text-red-700 font-semibold bg-red-100' : 'text-slate-700'
                          } ${i < columns.length - 1 ? 'border-r border-slate-200' : ''}`}
                          title={String(row[col] ?? '')}>
                          {String(row[col] ?? '').length === 0
                            ? <span className="italic text-slate-400 text-xs">&lt;empty&gt;</span>
                            : String(row[col])}
                        </td>
                      ))}
                      <td className="px-4 py-2.5 border-l border-slate-200">
                        <div className="space-y-1">
                          {infos.map((info, j) => (
                            <div key={j} className="flex items-start gap-1.5">
                              <span className="text-[10px] font-semibold text-red-600 bg-red-100 px-1 py-0.5 rounded whitespace-nowrap flex-shrink-0">{info.columnName}</span>
                              <span className="text-[10px] capitalize text-slate-500 bg-slate-200 px-1 py-0.5 rounded whitespace-nowrap flex-shrink-0">{info.dimension}</span>
                              <span className="text-[10px] text-red-600 truncate max-w-[120px]" title={info.reason}>{info.reason}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer pagination */}
        {!loading && filteredRows.length > 0 && rowsPerPage !== 0 && totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 bg-slate-50 flex-shrink-0">
            <span className="text-xs text-slate-500">
              {startIndex + 1}–{Math.min(startIndex + effectiveRowsPerPage, filteredRows.length)} of {filteredRows.length.toLocaleString()}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setCurrentPage(1)} disabled={safePage === 1} className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-40 transition"><ChevronsLeft className="w-4 h-4" /></button>
              <button onClick={() => setCurrentPage(safePage - 1)} disabled={safePage === 1} className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-40 transition"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-xs text-slate-600 px-3">Page {safePage} of {totalPages}</span>
              <button onClick={() => setCurrentPage(safePage + 1)} disabled={safePage >= totalPages} className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-40 transition"><ChevronRight className="w-4 h-4" /></button>
              <button onClick={() => setCurrentPage(totalPages)} disabled={safePage >= totalPages} className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-40 transition"><ChevronsRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
