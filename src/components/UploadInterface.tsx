import { useState, useRef } from 'react';
import { Upload, Globe, ChevronDown } from 'lucide-react';
import { apiClient } from '../lib/api-client';

interface ParsedData {
  headers: string[];
  rows: Record<string, string>[];
}

interface UploadInterfaceProps {
  onDataUploaded: (data: ParsedData, datasetId: string) => void;
  projectId?: string | null;
}

type DataSourceTab = 'csv' | 'api';
type ApiAuthType = 'none' | 'bearer' | 'apikey';

function walkJsonPath(obj: unknown, path: string): unknown {
  if (!path.trim()) return obj;
  return path.split('.').reduce<unknown>((curr, key) => {
    if (curr != null && typeof curr === 'object' && key in (curr as Record<string, unknown>)) {
      return (curr as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function normaliseRows(arr: unknown[]): Record<string, string>[] {
  return arr.map((item) => {
    const row: Record<string, string> = {};
    if (item != null && typeof item === 'object') {
      Object.entries(item as Record<string, unknown>).forEach(([k, v]) => {
        row[k] = v == null ? '' : String(v);
      });
    }
    return row;
  });
}

export default function UploadInterface({ onDataUploaded, projectId }: UploadInterfaceProps) {
  const [activeTab, setActiveTab] = useState<DataSourceTab>('csv');

  // ── CSV state ──────────────────────────────────────────────────────────────
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [datasetTitle, setDatasetTitle] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── REST API state ─────────────────────────────────────────────────────────
  const [apiTitle, setApiTitle] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [apiAuthType, setApiAuthType] = useState<ApiAuthType>('none');
  const [apiToken, setApiToken] = useState('');
  const [apiKeyHeader, setApiKeyHeader] = useState('X-API-Key');
  const [apiKeyValue, setApiKeyValue] = useState('');
  const [apiJsonPath, setApiJsonPath] = useState('');
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  // ── CSV handlers ───────────────────────────────────────────────────────────
  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation(); setIsDragging(true);
  }
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation(); setIsDragging(true);
  }
  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    const related = e.relatedTarget as HTMLElement;
    if (!target.contains(related)) setIsDragging(false);
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    const csvFile = Array.from(e.dataTransfer.files).find((f) => f.name.toLowerCase().endsWith('.csv'));
    if (csvFile) processFile(csvFile);
    else alert('Please upload a CSV file');
  }
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  function parseCSV(text: string) {
    const lines = text.trim().split('\n');
    if (lines.length === 0) throw new Error('CSV file is empty');

    function parseLine(line: string): string[] {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') { inQuotes = !inQuotes; }
        else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
        else { current += char; }
      }
      result.push(current.trim());
      return result;
    }

    const headers = parseLine(lines[0]).filter((h) => h.length > 0);
    if (headers.length === 0) throw new Error('No headers found in CSV file');
    const rows = lines.slice(1).filter((l) => l.trim().length > 0).map((line) => {
      const values = parseLine(line);
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = values[i] || ''; });
      return row;
    });
    if (rows.length === 0) throw new Error('No data rows found in CSV file');
    return { headers, rows };
  }

  async function processFile(file: File) {
    setIsProcessing(true);
    try {
      if (!file.name.toLowerCase().endsWith('.csv')) throw new Error('Please upload a CSV file');
      const text = await file.text();
      const { headers, rows } = parseCSV(text);
      const name = datasetTitle.trim() || file.name.replace(/\.csv$/i, '');
      await finishImport(name, headers, rows);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Error processing file. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }

  // ── Shared: save dataset and notify parent ─────────────────────────────────
  async function finishImport(name: string, headers: string[], rows: Record<string, string>[]) {
    let pid = projectId;
    if (!pid) {
      const project = await apiClient.createProject(name, 'Imported dataset') as { id: string };
      pid = project.id;
    }
    const dataset = await apiClient.createDatasetFromRows(pid, name, headers, rows) as { id: string };
    onDataUploaded({ headers, rows }, dataset.id);
  }

  // ── REST API fetch ─────────────────────────────────────────────────────────
  async function handleApiFetch() {
    setApiError('');
    if (!apiUrl.trim()) { setApiError('Endpoint URL is required.'); return; }

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (apiAuthType === 'bearer' && apiToken.trim()) {
      headers['Authorization'] = `Bearer ${apiToken.trim()}`;
    } else if (apiAuthType === 'apikey' && apiKeyHeader.trim() && apiKeyValue.trim()) {
      headers[apiKeyHeader.trim()] = apiKeyValue.trim();
    }

    setApiLoading(true);
    try {
      const res = await fetch(apiUrl.trim(), { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const json = await res.json();

      const target = walkJsonPath(json, apiJsonPath);
      if (!Array.isArray(target)) {
        throw new Error(
          apiJsonPath
            ? `JSONPath "${apiJsonPath}" did not resolve to an array.`
            : 'Response root is not an array. Specify a JSONPath to the rows array.'
        );
      }
      if (target.length === 0) throw new Error('The API returned an empty array.');

      const rows = normaliseRows(target);
      const headers_ = Object.keys(rows[0]);
      const name = apiTitle.trim() || new URL(apiUrl.trim()).hostname;
      await finishImport(name, headers_, rows);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Unexpected error. Check the URL and try again.');
    } finally {
      setApiLoading(false);
    }
  }

  // ── Tab style helper ───────────────────────────────────────────────────────
  const tabClass = (tab: DataSourceTab) =>
    `flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition ${
      activeTab === tab
        ? 'border-[#03AD9A] text-[#008192] bg-white'
        : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
    }`;

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-slate-200 bg-slate-50 px-4 pt-3 gap-1">
        <button className={tabClass('csv')} onClick={() => setActiveTab('csv')}>
          <Upload className="w-4 h-4" />
          Upload CSV
        </button>
        <button className={tabClass('api')} onClick={() => setActiveTab('api')}>
          <Globe className="w-4 h-4" />
          REST API
        </button>
      </div>

      {/* ── CSV Tab ──────────────────────────────────────────────────────────── */}
      {activeTab === 'csv' && (
        <div className="p-8">
          <div className="mb-6">
            <label htmlFor="dataset-title" className="block text-sm font-medium text-slate-700 mb-2">
              Dataset Title
            </label>
            <input
              id="dataset-title"
              type="text"
              placeholder="Enter dataset title (optional, defaults to filename)"
              value={datasetTitle}
              onChange={(e) => setDatasetTitle(e.target.value)}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#03AD9A] focus:border-transparent outline-none"
            />
          </div>

          <div
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-16 text-center transition ${
              isDragging ? 'border-[#28B98F] bg-[#f0faf8]' : 'border-slate-300 hover:border-slate-400'
            }`}
          >
            {isProcessing ? (
              <div>
                <div className="animate-spin w-12 h-12 border-4 border-[#03AD9A] border-t-transparent rounded-full mx-auto mb-4" />
                <p className="text-slate-600 font-medium">Processing your file...</p>
              </div>
            ) : (
              <>
                <Upload className="w-16 h-16 text-[#008192] mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-slate-800 mb-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-[#008192] hover:text-[#008192] font-bold underline"
                  >
                    Browse
                  </button>{' '}
                  or Drag & Drop (CSV files)
                </h2>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </>
            )}
          </div>
        </div>
      )}

      {/* ── REST API Tab ──────────────────────────────────────────────────────── */}
      {activeTab === 'api' && (
        <div className="p-8 space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Dataset Title</label>
            <input
              type="text"
              placeholder="Optional — defaults to API hostname"
              value={apiTitle}
              onChange={(e) => setApiTitle(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#03AD9A] focus:border-transparent outline-none text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Endpoint URL <span className="text-red-500">*</span>
            </label>
            <input
              type="url"
              placeholder="https://api.example.com/data"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#03AD9A] focus:border-transparent outline-none text-sm font-mono"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Authentication</label>
            <div className="relative">
              <select
                value={apiAuthType}
                onChange={(e) => setApiAuthType(e.target.value as ApiAuthType)}
                className="w-full appearance-none pl-4 pr-9 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-[#03AD9A] focus:border-transparent outline-none bg-white"
              >
                <option value="none">No Authentication</option>
                <option value="bearer">Bearer Token</option>
                <option value="apikey">API Key Header</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>

            {apiAuthType === 'bearer' && (
              <input
                type="text"
                placeholder="Token value"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                className="mt-2 w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#03AD9A] focus:border-transparent outline-none text-sm font-mono"
              />
            )}

            {apiAuthType === 'apikey' && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Header name (e.g. X-API-Key)"
                  value={apiKeyHeader}
                  onChange={(e) => setApiKeyHeader(e.target.value)}
                  className="px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#03AD9A] focus:border-transparent outline-none text-sm font-mono"
                />
                <input
                  type="text"
                  placeholder="Header value"
                  value={apiKeyValue}
                  onChange={(e) => setApiKeyValue(e.target.value)}
                  className="px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#03AD9A] focus:border-transparent outline-none text-sm font-mono"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              JSONPath to rows array
              <span className="ml-2 text-xs text-slate-400 font-normal">
                (optional — e.g. <code className="bg-slate-100 px-1 rounded">data.items</code>)
              </span>
            </label>
            <input
              type="text"
              placeholder="Leave blank if the response root is already an array"
              value={apiJsonPath}
              onChange={(e) => setApiJsonPath(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#03AD9A] focus:border-transparent outline-none text-sm font-mono"
            />
          </div>

          {apiError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              {apiError}
            </div>
          )}

          <button
            onClick={handleApiFetch}
            disabled={apiLoading}
            className="w-full flex items-center justify-center gap-2 bg-[#008192] hover:bg-[#064B77] disabled:bg-[#63BF81] text-white font-semibold py-3 px-6 rounded-lg transition"
          >
            {apiLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Fetching...
              </>
            ) : (
              <>
                <Globe className="w-4 h-4" />
                Fetch & Import
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
