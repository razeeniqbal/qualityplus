import { useState, useEffect, useRef } from 'react';
import UploadInterface from '../components/UploadInterface';
import DataPreview from '../components/DataPreview';
import QualityConfiguration from '../components/QualityConfiguration';
import ResultsView from '../components/ResultsView';
import { apiClient } from '../lib/api-client';
import type { QualityCheckResult } from '../components/QualityConfiguration';
import { useUser } from '../contexts/UserContext';
import { FileText, ChevronDown } from 'lucide-react';

type ScoreStep = 'upload' | 'configure' | 'results';

interface UploadedData {
  headers: string[];
  rows: Record<string, string>[];
}

interface Dataset {
  id: string;
  name: string;
  row_count: number;
  column_count: number;
}

interface ScoreProps {
  projectId?: string | null;
  onDatasetCreated?: (datasetId: string) => void;
  /** viewer role — can only see result scores, not run checks */
  isViewer?: boolean;
  /** pre-select this dataset when the tab loads (e.g. synced from Records tab) */
  initialDatasetId?: string | null;
  /** called after a quality score is saved successfully */
  onPublished?: () => void;
  projectName?: string;
  projectDescription?: string;
}

export default function Score({ projectId, onDatasetCreated, isViewer = false, initialDatasetId, onPublished, projectName = '', projectDescription = '' }: ScoreProps) {
  const { user } = useUser();
  const [currentStep, setCurrentStep] = useState<ScoreStep>('upload');
  const [uploadedData, setUploadedData] = useState<UploadedData | null>(null);
  const [datasetId, setDatasetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [executionResults, setExecutionResults] = useState<QualityCheckResult[] | null>(null);
  const loadingRef = useRef<string | null>(null);

  // Dataset list + selector
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);


  useEffect(() => {
    if (projectId) {
      loadDatasets(projectId);
    } else {
      setDatasets([]);
      setSelectedDatasetId(null);
      setCurrentStep('upload');
      setUploadedData(null);
      setDatasetId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // When selected dataset changes, load its data
  useEffect(() => {
    if (!selectedDatasetId) return;
    loadingRef.current = selectedDatasetId;
    if (!isViewer) {
      loadDatasetForScoring(selectedDatasetId);
    } else {
      // Viewers only need the datasetId set so result scores load
      setDatasetId(selectedDatasetId);
      setLoading(false);
    }
  }, [selectedDatasetId, isViewer]);

async function loadDatasets(projId: string) {
    setLoading(true);
    try {
      const ds = await apiClient.getProjectDatasets(projId) as Dataset[];
      setDatasets(ds || []);
      if (ds && ds.length > 0) {
        // Prefer the dataset that was selected in the Records tab, fall back to first
        const preferred = initialDatasetId && ds.find(d => d.id === initialDatasetId);
        setSelectedDatasetId(preferred ? preferred.id : ds[0].id);
        if (isViewer) setLoading(false);
      } else {
        setLoading(false);
        if (!isViewer) setCurrentStep('upload');
      }
    } catch (error) {
      console.error('Error loading datasets:', error);
      setLoading(false);
      if (!isViewer) setCurrentStep('upload');
    }
  }

  async function loadDatasetForScoring(dsId: string) {
    setLoading(true);
    setUploadedData(null);
    setDatasetId(null);
    setExecutionResults(null);
    try {
      const rows = await apiClient.previewDataset(dsId, 10000) as Record<string, string>[];

      if (loadingRef.current !== dsId) return;

      if (rows && rows.length > 0) {
        const headers = Object.keys(rows[0]);
        setUploadedData({ headers, rows });
        setDatasetId(dsId);
        setCurrentStep('configure');
      } else {
        setCurrentStep('upload');
      }
    } catch (error) {
      console.error('Error loading dataset for scoring:', error);
      setCurrentStep('upload');
    } finally {
      if (loadingRef.current === dsId) {
        setLoading(false);
      }
    }
  }

  async function handleDatasetChange(dsId: string) {
    setSelectedDatasetId(dsId);
    if (!isViewer) {
      setCurrentStep('configure');
      setExecutionResults(null);
    }
  }

  function handleDataUploaded(data: UploadedData, id: string) {
    setUploadedData(data);
    setDatasetId(id);
    setCurrentStep('configure');
    onDatasetCreated?.(id);
    if (projectId) loadDatasets(projectId);
  }

  function handleExecuteRules(results?: QualityCheckResult[]) {
    if (results) setExecutionResults(results);
    setCurrentStep('results');
  }


  const selectedDataset = datasets.find(d => d.id === selectedDatasetId);

  // Score colour helper
  function scoreColor(s: number) {
    if (s === 100) return 'text-green-600';
    if (s >= 75) return 'text-yellow-600';
    if (s >= 50) return 'text-orange-600';
    return 'text-red-600';
  }

  return (
    <div className="space-y-4">
      {/* Dataset selector */}
      {projectId && datasets.length > 0 && (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="px-6 py-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700 flex-shrink-0">
                <FileText className="w-4 h-4 text-[#008192]" />
                <span>Dataset</span>
              </div>
              <div className="relative flex-1 max-w-sm">
                <select
                  value={selectedDatasetId ?? ''}
                  onChange={(e) => handleDatasetChange(e.target.value)}
                  className="w-full appearance-none pl-4 pr-9 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-[#03AD9A] focus:border-transparent outline-none bg-white text-slate-700 cursor-pointer"
                >
                  {datasets.map((ds) => (
                    <option key={ds.id} value={ds.id}>
                      {ds.name} ({ds.row_count.toLocaleString()} rows)
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
              {selectedDataset && (
                <span className="text-xs text-slate-400">
                  {selectedDataset.column_count} columns
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Step content */}
      {!isViewer && (
        <>
          {loading && (
            <div className="text-center py-20 bg-white rounded-lg shadow-md">
              <div className="animate-spin w-12 h-12 border-4 border-[#03AD9A] border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-slate-600 font-medium">Loading dataset...</p>
            </div>
          )}

          {!loading && currentStep === 'upload' && (
            projectId && datasets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 bg-white rounded-lg shadow-md text-center px-6">
                <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
                  <FileText className="w-7 h-7 text-slate-400" />
                </div>
                <h3 className="text-base font-semibold text-slate-700 mb-1">No dataset uploaded yet</h3>
                <p className="text-sm text-slate-400 max-w-xs">
                  Go to the <span className="font-semibold text-[#008192]">Data Records</span> tab to upload a dataset first, then come back here to run a quality check.
                </p>
              </div>
            ) : (
              <UploadInterface onDataUploaded={handleDataUploaded} />
            )
          )}

          {!loading && currentStep === 'configure' && uploadedData && datasetId && (
            <div className="space-y-6">
              <DataPreview data={uploadedData} />
              <QualityConfiguration
                data={uploadedData}
                datasetId={datasetId}
                onExecute={handleExecuteRules}
                projectName={projectName}
                projectDescription={projectDescription}
                datasetName={selectedDataset?.name ?? ''}
                datasetDescription={(selectedDataset as unknown as { description?: string })?.description ?? ''}
              />
            </div>
          )}

          {!loading && currentStep === 'results' && datasetId && (
            <ResultsView
              datasetId={datasetId}
              datasetName={selectedDataset?.name}
              publishedBy={user?.displayName}
              initialResults={executionResults}
              selectedColumns={executionResults
                ? (() => {
                    const cols = new Set<string>();
                    executionResults.forEach(r => {
                      cols.add(r.column_name);
                      // Multi-column uniqueness: id is "uniqueness-colA+colB+colC" — extract all cols
                      if (r.dimension === 'uniqueness' && r.id.startsWith('uniqueness-') && r.id.includes('+')) {
                        r.id.replace('uniqueness-', '').split('+').forEach(c => cols.add(c));
                      }
                    });
                    return [...cols];
                  })()
                : undefined}
              onBack={() => setCurrentStep('configure')}
              onPublished={onPublished}
            />
          )}
        </>
      )}
    </div>
  );
}
