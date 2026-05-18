import { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, XCircle, CheckCircle, Download } from 'lucide-react';
import { apiClient } from '../lib/api-client';
import type { RowDetail } from './QualityConfiguration';

interface FailedRowsModalProps {
  datasetId: string;
  columnName: string;
  dimension: string;
  failedRowDetails: RowDetail[];
  onClose: () => void;
}

export default function FailedRowsModal({ datasetId, columnName, dimension, failedRowDetails, onClose }: FailedRowsModalProps) {
  const [allRows, setAllRows] = useState<Record<string, string>[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const ROWS_PER_PAGE = 25;

  // Build a set of failed row indexes for fast lookup
  const failedIndexSet = new Set(failedRowDetails.filter(d => !d.passed).map(d => d.rowIndex));

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
      .catch(err => console.error('FailedRowsModal load error', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId]);

  // Keep original row index alongside each row so we can look up reasons accurately
  const failedRows = allRows
    .map((row, idx) => ({ row, idx }))
    .filter(({ idx }) => failedIndexSet.has(idx));

  const totalPages = Math.max(1, Math.ceil(failedRows.length / ROWS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * ROWS_PER_PAGE;
  const pageRows = failedRows.slice(startIndex, startIndex + ROWS_PER_PAGE);

  // Map rowIndex → fail reason
  const reasonMap = new Map(failedRowDetails.map(d => [d.rowIndex, d.reason]));

  function exportCSV() {
    if (columns.length === 0) return;
    const header = ['Row #', ...columns, 'Fail Reason'].join(',');
    const body = failedRows.map(({ row, idx }) => {
      const reason = reasonMap.get(idx) ?? '';
      return [idx + 1, ...columns.map(c => `"${String(row[c] ?? '').replace(/"/g, '""')}"`), `"${reason}"`].join(',');
    });
    const blob = new Blob([[header, ...body].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `failed_${columnName}_${dimension}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-xl shadow-2xl flex flex-col w-full max-w-6xl max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <div>
              <h2 className="text-base font-bold text-slate-800">
                Failed Rows — <span className="text-red-600">{columnName}</span>
                <span className="mx-1.5 text-slate-400">·</span>
                <span className="capitalize text-slate-600">{dimension}</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {failedIndexSet.size} failed row{failedIndexSet.size !== 1 ? 's' : ''} highlighted in the full dataset
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportCSV}
              disabled={loading || failedRows.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition">
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 px-6 py-2 bg-slate-50 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <div className="w-3 h-3 rounded bg-red-100 border border-red-300" />
            Failed row
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <div className="w-3 h-3 rounded bg-white border border-slate-200" />
            Passed row
          </div>
          <span className="text-xs text-slate-400 ml-auto">
            Showing {failedRows.length} of {allRows.length} total rows
          </span>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin w-10 h-10 border-4 border-teal-600 border-t-transparent rounded-full" />
            </div>
          ) : failedRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <CheckCircle className="w-12 h-12 mb-3 text-green-400" />
              <p className="font-medium">No failed rows found</p>
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-100 border-b-2 border-slate-300">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap border-r border-slate-300 w-16">
                    Row #
                  </th>
                  {columns.map((col, i) => (
                    <th
                      key={col}
                      className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider whitespace-nowrap ${
                        col === columnName
                          ? 'text-red-700 bg-red-50'
                          : 'text-slate-600'
                      } ${i < columns.length - 1 ? 'border-r border-slate-300' : ''}`}
                    >
                      {col === columnName && <XCircle className="w-3 h-3 inline mr-1 text-red-500" />}
                      {col}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap border-l border-slate-300">
                    Fail Reason
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {pageRows.map(({ row, idx }) => {
                  const reason = reasonMap.get(idx);
                  return (
                    <tr key={idx} className="bg-red-50 hover:bg-red-100 transition-colors">
                      <td className="px-4 py-2.5 text-xs text-slate-500 font-mono border-r border-slate-200 w-16">
                        {idx + 1}
                      </td>
                      {columns.map((col, i) => (
                        <td
                          key={col}
                          className={`px-4 py-2.5 text-sm whitespace-nowrap max-w-[200px] truncate ${
                            col === columnName
                              ? 'text-red-700 font-semibold bg-red-100'
                              : 'text-slate-700'
                          } ${i < columns.length - 1 ? 'border-r border-slate-200' : ''}`}
                          title={String(row[col] ?? '')}
                        >
                          {String(row[col] ?? '').length === 0
                            ? <span className="italic text-slate-400 text-xs">&lt;empty&gt;</span>
                            : String(row[col])}
                        </td>
                      ))}
                      <td className="px-4 py-2.5 text-xs text-red-600 border-l border-slate-200 max-w-[200px]">
                        {reason || <span className="text-slate-400 italic">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 bg-slate-50 flex-shrink-0">
            <span className="text-xs text-slate-500">
              Showing {startIndex + 1}–{Math.min(startIndex + ROWS_PER_PAGE, failedRows.length)} of {failedRows.length} failed rows
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setCurrentPage(1)} disabled={safePage === 1} className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-40 transition">
                <ChevronsLeft className="w-4 h-4" />
              </button>
              <button onClick={() => setCurrentPage(safePage - 1)} disabled={safePage === 1} className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-40 transition">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-slate-600 px-3">Page {safePage} of {totalPages}</span>
              <button onClick={() => setCurrentPage(safePage + 1)} disabled={safePage === totalPages} className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-40 transition">
                <ChevronRight className="w-4 h-4" />
              </button>
              <button onClick={() => setCurrentPage(totalPages)} disabled={safePage === totalPages} className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-40 transition">
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
