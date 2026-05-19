import { useState, useEffect } from 'react';
import { apiClient } from '../lib/api-client';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, Search, Table2, ClipboardCheck } from 'lucide-react';
import type { ColumnValueFilters } from './ProjectView';

interface RecordsProps {
  datasetId: string | null;
  columnValueFilters?: ColumnValueFilters;
  onDataLoaded?: (rows: Record<string, string>[], columns: string[]) => void;
  onQualityCheck?: () => void;
}

export default function Records({ datasetId, columnValueFilters, onDataLoaded, onQualityCheck }: RecordsProps) {
  const [records, setRecords] = useState<Record<string, string>[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!datasetId) {
      setRecords([]);
      setColumns([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiClient.previewDataset(datasetId, 10000)
      .then((rows) => {
        if (cancelled) return;
        const typedRows = rows as Record<string, string>[];
        if (typedRows && typedRows.length > 0) {
          const cols = Object.keys(typedRows[0]);
          setColumns(cols);
          setRecords(typedRows);
          onDataLoaded?.(typedRows, cols);
        } else {
          setColumns([]);
          setRecords([]);
          onDataLoaded?.([], []);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Error loading records:', error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId]);

  // Apply sidebar column-value filters + search query
  const filteredRecords = (() => {
    let rows = records;

    // 1. Column value filters from sidebar
    if (columnValueFilters && Object.keys(columnValueFilters).length > 0) {
      rows = rows.filter(row =>
        Object.entries(columnValueFilters).every(([col, allowed]) =>
          allowed.has(String(row[col] ?? ''))
        )
      );
    }

    // 2. Global search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(row =>
        Object.values(row).some(val => String(val ?? '').toLowerCase().includes(q))
      );
    }

    return rows;
  })();

  // Reset to page 1 when filters or search change
  useEffect(() => {
    setCurrentPage(1);
  }, [columnValueFilters, searchQuery]);

  function exportToCSV() {
    if (columns.length === 0) return;
    const csvContent = [
      columns.join(','),
      ...filteredRecords.map(row =>
        columns.map(col => `"${String(row[col] ?? '').replace(/"/g, '""')}"`).join(',')
      )
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `records_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / rowsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * rowsPerPage;
  const currentRecords = filteredRecords.slice(startIndex, startIndex + rowsPerPage);

  const activeFilterCount = columnValueFilters ? Object.keys(columnValueFilters).length : 0;

  if (loading) {
    return (
      <div className="text-center py-20 bg-white rounded-lg shadow-md">
        <div className="animate-spin w-12 h-12 border-4 border-teal-600 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-slate-600 font-medium">Loading records...</p>
      </div>
    );
  }

  if (!datasetId) {
    return (
      <div className="text-center py-20 bg-white rounded-lg shadow-md">
        <Table2 className="w-16 h-16 text-slate-300 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-slate-600 mb-2">No Dataset Selected</h2>
        <p className="text-slate-500">Select a dataset from the left panel, or add a new one using the + button.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">
          {filteredRecords.length.toLocaleString()} of {records.length.toLocaleString()} record{records.length !== 1 ? 's' : ''}
          {activeFilterCount > 0 && (
            <span className="ml-2 text-teal-600 font-medium">· {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} active</span>
          )}
        </span>
        <div className="flex items-center gap-2">
          {onQualityCheck && (
            <button
              onClick={onQualityCheck}
              disabled={!datasetId}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 text-white rounded-lg hover:from-teal-700 hover:to-emerald-700 transition disabled:opacity-40 disabled:cursor-not-allowed font-medium"
              title="Run quality checks on this dataset"
            >
              <ClipboardCheck className="w-4 h-4" />
              <span>Quality Check</span>
            </button>
          )}
          <button
            onClick={exportToCSV}
            className="flex items-center space-x-2 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-lg shadow-md p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search all fields..."
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b-2 border-slate-300">
                {columns.map((col, i) => (
                  <th
                    key={col}
                    className={`px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider whitespace-nowrap ${
                      i < columns.length - 1 ? 'border-r border-slate-300' : ''
                    }`}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {currentRecords.map((record, rowIndex) => (
                <tr key={rowIndex} className="hover:bg-slate-50 transition-colors">
                  {columns.map((col, i) => (
                    <td
                      key={col}
                      className={`px-4 py-3 text-sm text-slate-700 whitespace-nowrap max-w-[300px] truncate cursor-default transition-colors hover:bg-teal-600 hover:text-white ${
                        i < columns.length - 1 ? 'border-r border-slate-200' : ''
                      }`}
                      title={String(record[col] ?? '')}
                    >
                      {String(record[col] ?? '').length === 0
                        ? <span className="italic text-slate-300 text-xs">&lt;empty&gt;</span>
                        : String(record[col])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredRecords.length === 0 && (
          <div className="text-center py-12">
            <p className="text-slate-500">
              {activeFilterCount > 0 || searchQuery ? 'No records match the current filters' : 'No records found'}
            </p>
          </div>
        )}

        {filteredRecords.length > 0 && (
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <span className="text-sm text-slate-600">
                Showing {startIndex + 1}–{Math.min(startIndex + rowsPerPage, filteredRecords.length)} of {filteredRecords.length.toLocaleString()}
              </span>
              <select
                value={rowsPerPage}
                onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                className="px-3 py-1 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              >
                <option value={10}>10 per page</option>
                <option value={25}>25 per page</option>
                <option value={50}>50 per page</option>
                <option value={100}>100 per page</option>
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <button onClick={() => setCurrentPage(1)} disabled={safePage === 1}
                className="p-2 rounded-lg hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition">
                <ChevronsLeft className="w-4 h-4" />
              </button>
              <button onClick={() => setCurrentPage(safePage - 1)} disabled={safePage === 1}
                className="p-2 rounded-lg hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-slate-600 px-4">Page {safePage} of {totalPages}</span>
              <button onClick={() => setCurrentPage(safePage + 1)} disabled={safePage === totalPages}
                className="p-2 rounded-lg hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition">
                <ChevronRight className="w-4 h-4" />
              </button>
              <button onClick={() => setCurrentPage(totalPages)} disabled={safePage === totalPages}
                className="p-2 rounded-lg hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition">
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

