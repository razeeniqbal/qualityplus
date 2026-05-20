import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, FileText, Loader2, CheckCircle2 } from 'lucide-react';
import { exportResultsPDF } from '../lib/pdf-export';
import type { RowDetail } from './QualityConfiguration';
import type { QualityResult } from '../types/database';

interface ResultWithDetails extends QualityResult {
  rowDetails?: RowDetail[];
}

interface PdfExportModalProps {
  datasetName: string;
  publishedBy?: string;
  overallScore: number;
  totalPassed: number;
  totalFailed: number;
  results: ResultWithDetails[];
  aiSummary?: string;
  onClose: () => void;
}

type RowFilter = 'all' | 'fail';

export default function PdfExportModal({
  datasetName, publishedBy, overallScore, totalPassed, totalFailed,
  results, aiSummary, onClose,
}: PdfExportModalProps) {
  const [rowFilter, setRowFilter] = useState<RowFilter>('fail');
  const [exporting, setExporting] = useState(false);
  const [done, setDone] = useState(false);

  const hasAiSummary = !!aiSummary;
  const totalRowDetails = results.reduce((s, r) => s + (r.rowDetails?.length ?? 0), 0);
  const failedRowDetails = results.reduce((s, r) => s + (r.rowDetails?.filter(d => !d.passed).length ?? 0), 0);

  async function handleExport() {
    setExporting(true);
    try {
      await exportResultsPDF({
        datasetName,
        publishedBy,
        overallScore,
        totalPassed,
        totalFailed,
        results,
        aiSummary: hasAiSummary ? aiSummary : undefined,
        rowFilter,
      });
      setDone(true);
      setTimeout(onClose, 1200);
    } finally {
      setExporting(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">Export PDF Report</h2>
              <p className="text-xs text-slate-500">{datasetName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* Row filter */}
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-3">Include row-level details</p>
            <div className="space-y-2">
              <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                rowFilter === 'fail' ? 'border-teal-500 bg-teal-50' : 'border-slate-200 hover:bg-slate-50'
              }`}>
                <input
                  type="radio"
                  name="rowFilter"
                  value="fail"
                  checked={rowFilter === 'fail'}
                  onChange={() => setRowFilter('fail')}
                  className="mt-0.5 accent-teal-600"
                />
                <div>
                  <p className="text-sm font-medium text-slate-800">Failed rows only</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Only include rows that failed each check — keeps the report concise.
                    <span className="ml-1 text-red-600 font-medium">({failedRowDetails.toLocaleString()} rows)</span>
                  </p>
                </div>
              </label>
              <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                rowFilter === 'all' ? 'border-teal-500 bg-teal-50' : 'border-slate-200 hover:bg-slate-50'
              }`}>
                <input
                  type="radio"
                  name="rowFilter"
                  value="all"
                  checked={rowFilter === 'all'}
                  onChange={() => setRowFilter('all')}
                  className="mt-0.5 accent-teal-600"
                />
                <div>
                  <p className="text-sm font-medium text-slate-800">All rows (pass + fail)</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Include every row for each check — full audit trail.
                    <span className="ml-1 text-slate-600 font-medium">({totalRowDetails.toLocaleString()} rows)</span>
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Sections included */}
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">Sections included</p>
            <div className="space-y-1.5">
              {[
                { label: 'Score Overview', sub: 'Overall %, dimension scores, pass/fail counts', always: true },
                { label: 'AI Summary', sub: hasAiSummary ? 'Generated summary included' : 'Not available for this result', always: false, active: hasAiSummary },
                { label: 'Detailed Results', sub: 'Grouped by column with dimension breakdown', always: true },
                { label: 'Row-Level Details', sub: `Per-row pass/fail for each check (${rowFilter === 'fail' ? 'failed rows only' : 'all rows'})`, always: true },
              ].map(item => (
                <div key={item.label} className={`flex items-start gap-2.5 px-3 py-2 rounded-lg ${
                  item.always || item.active ? 'bg-slate-50' : 'bg-slate-50 opacity-50'
                }`}>
                  <CheckCircle2 className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
                    item.always || item.active ? 'text-teal-500' : 'text-slate-300'
                  }`} />
                  <div>
                    <p className="text-xs font-semibold text-slate-700">{item.label}</p>
                    <p className="text-xs text-slate-500">{item.sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200">
          <button onClick={onClose} disabled={exporting}
            className="px-4 py-2 text-sm text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition font-medium disabled:opacity-40">
            Cancel
          </button>
          <button onClick={handleExport} disabled={exporting || done}
            className="flex items-center gap-2 px-5 py-2 text-sm bg-gradient-to-r from-teal-600 to-emerald-600 text-white rounded-lg hover:from-teal-700 hover:to-emerald-700 transition font-medium disabled:opacity-50">
            {done
              ? <><CheckCircle2 className="w-4 h-4" /><span>Downloaded!</span></>
              : exporting
                ? <><Loader2 className="w-4 h-4 animate-spin" /><span>Generating…</span></>
                : <><FileText className="w-4 h-4" /><span>Export PDF</span></>
            }
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
