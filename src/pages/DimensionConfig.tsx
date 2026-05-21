import { useState, useEffect } from 'react';
import { Plus, Trash2, CheckCircle2, Circle, ChevronRight, X, Save, AlertTriangle } from 'lucide-react';
import { apiClient } from '../lib/api-client';
import type { QualityDimensionConfig } from '../types/database';

const DIMENSION_LOGIC: Record<string, string> = {
  completeness: 'Checks if all values in the selected columns are present and not null or empty. Each row is examined to ensure data exists.',
  uniqueness: 'Verifies that all values in the selected columns are unique with no duplicates. Each value must appear only once across all rows.',
  consistency: 'Validates data against defined patterns or reference datasets. Can check format consistency, cross-field validation, or match against master data files.',
  validity: 'Ensures data meets specific validation rules such as regex patterns, value ranges, allowed lists, or data type requirements.',
  accuracy: 'Compares data against reference sources or expected values to measure correctness. Can verify calculations or match against master datasets.',
  timeliness: 'Checks if data meets freshness requirements by validating age and update frequency against configured thresholds.',
};

const EMPTY_FORM = { name: '', key: '', description: '', icon: 'target', is_active: true };

export default function DimensionConfig() {
  const [dimensions, setDimensions] = useState<QualityDimensionConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<{ name?: string; key?: string }>({});
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => {
    loadDimensions();
  }, []);

  async function loadDimensions() {
    try {
      const data = await apiClient.getQualityDimensions();
      setDimensions(data as QualityDimensionConfig[]);
    } catch (error) {
      console.error('Error loading dimensions:', error);
    } finally {
      setLoading(false);
    }
  }

  function validate() {
    const errors: { name?: string; key?: string } = {};
    if (!formData.name.trim()) errors.name = 'Name is required';
    if (!formData.key.trim()) errors.key = 'Key is required';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      if (editingId) {
        await apiClient.updateQualityDimension(editingId, {
          name: formData.name,
          description: formData.description,
          icon: formData.icon,
          is_active: formData.is_active,
        });
      } else {
        await apiClient.createQualityDimension({
          name: formData.name,
          key: formData.key,
          description: formData.description,
          icon: formData.icon,
          is_active: formData.is_active,
        });
      }
      closePanel();
      await loadDimensions();
    } catch (error) {
      console.error('Error saving dimension:', error);
      setFormErrors({ key: 'This key might already exist. Try a different one.' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiClient.deleteQualityDimension(id);
      setDeleteConfirmId(null);
      await loadDimensions();
    } catch (error) {
      console.error('Error deleting dimension:', error);
    }
  }

  async function handleToggleActive(dimension: QualityDimensionConfig) {
    try {
      // Optimistic update
      setDimensions((prev) =>
        prev.map((d) => (d.id === dimension.id ? { ...d, is_active: !d.is_active } : d))
      );
      await apiClient.updateQualityDimension(dimension.id, { is_active: !dimension.is_active });
    } catch (error) {
      console.error('Error toggling dimension:', error);
      await loadDimensions(); // revert on error
    }
  }

  function openAdd() {
    setFormData(EMPTY_FORM);
    setFormErrors({});
    setEditingId(null);
    setShowPanel(true);
  }

  function openEdit(dimension: QualityDimensionConfig) {
    setFormData({
      name: dimension.name,
      key: dimension.key,
      description: dimension.description,
      icon: dimension.icon,
      is_active: dimension.is_active,
    });
    setFormErrors({});
    setEditingId(dimension.id);
    setShowPanel(true);
  }

  function closePanel() {
    setShowPanel(false);
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setFormErrors({});
  }

  if (loading) {
    return (
      <div className="text-center py-20">
        <div className="animate-spin w-12 h-12 border-4 border-[#03AD9A] border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-slate-600">Loading dimensions...</p>
      </div>
    );
  }

  const activeDimensions = dimensions.filter((d) => d.is_active).length;

  return (
    <div className="flex gap-6">
      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Quality Dimensions</h1>
            <p className="text-slate-500 mt-1 text-sm">
              {activeDimensions} of {dimensions.length} dimensions active
            </p>
          </div>
          <button
            onClick={openAdd}
            className="flex items-center space-x-2 bg-gradient-to-r from-[#008192] to-[#064B77] text-white px-5 py-2.5 rounded-lg hover:from-[#064B77] hover:to-[#1D275A] transition shadow-md hover:shadow-lg text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            <span>Add Dimension</span>
          </button>
        </div>

        {/* Dimensions list */}
        {dimensions.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Plus className="w-8 h-8 text-slate-400" />
            </div>
            <h2 className="text-lg font-semibold text-slate-600 mb-1">No Dimensions Yet</h2>
            <p className="text-slate-400 text-sm mb-6">Add your first quality dimension to get started</p>
            <button
              onClick={openAdd}
              className="bg-gradient-to-r from-[#008192] to-[#064B77] text-white px-5 py-2.5 rounded-lg hover:from-[#064B77] hover:to-[#1D275A] transition text-sm font-medium"
            >
              Add Dimension
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <div className="col-span-1">Status</div>
              <div className="col-span-3">Dimension</div>
              <div className="col-span-5">Description</div>
              <div className="col-span-2">Key</div>
              <div className="col-span-1 text-right">Actions</div>
            </div>

            {/* Rows */}
            {dimensions.map((dimension, idx) => (
              <div
                key={dimension.id}
                className={`grid grid-cols-12 gap-4 pl-5 pr-6 py-4 items-center transition hover:bg-slate-50 border-l-2 ${
                  dimension.is_active ? 'border-[#28B98F]' : 'border-slate-200 opacity-50'
                } ${idx !== dimensions.length - 1 ? 'border-b border-slate-100' : ''}`}
              >
                {/* Toggle */}
                <div className="col-span-1">
                  <button
                    onClick={() => handleToggleActive(dimension)}
                    title={dimension.is_active ? 'Click to deactivate' : 'Click to activate'}
                    className="transition hover:scale-110"
                  >
                    {dimension.is_active ? (
                      <CheckCircle2 className="w-5 h-5 text-[#008192]" />
                    ) : (
                      <Circle className="w-5 h-5 text-slate-300" />
                    )}
                  </button>
                </div>

                {/* Name */}
                <div className="col-span-3">
                  <span className="font-semibold text-slate-800 text-sm">{dimension.name}</span>
                </div>

                {/* Description */}
                <div className="col-span-5">
                  <p className="text-sm text-slate-500 line-clamp-2">
                    {dimension.description || (
                      <span className="italic text-slate-400">No description</span>
                    )}
                  </p>
                  {/* Logic hint */}
                  <p className="text-xs text-slate-400 mt-1 line-clamp-1">
                    {DIMENSION_LOGIC[dimension.key]}
                  </p>
                </div>

                {/* Key badge */}
                <div className="col-span-2">
                  <span className="inline-block bg-slate-100 text-slate-600 text-xs font-mono px-2 py-1 rounded">
                    {dimension.key}
                  </span>
                </div>

                {/* Actions */}
                <div className="col-span-1 flex items-center justify-end space-x-1">
                  <button
                    onClick={() => openEdit(dimension)}
                    className="p-1.5 text-slate-400 hover:text-[#008192] hover:bg-[#f0faf8] rounded-lg transition"
                    title="Edit"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  {deleteConfirmId === dimension.id ? (
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => handleDelete(dimension.id)}
                        className="p-1.5 text-white bg-red-500 hover:bg-red-600 rounded-lg transition text-xs"
                        title="Confirm delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition text-xs"
                        title="Cancel"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirmId(dimension.id)}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Side panel */}
      {showPanel && (
        <div className="w-96 flex-shrink-0">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 sticky top-0">
            {/* Panel header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="font-bold text-slate-800">
                {editingId ? 'Edit Dimension' : 'New Dimension'}
              </h2>
              <button
                onClick={closePanel}
                className="p-1.5 hover:bg-slate-100 rounded-lg transition text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Panel form */}
            <div className="p-6 space-y-5">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => {
                    setFormData({ ...formData, name: e.target.value });
                    if (formErrors.name) setFormErrors({ ...formErrors, name: undefined });
                  }}
                  placeholder="e.g. Completeness"
                  className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-[#03AD9A] focus:border-transparent outline-none ${
                    formErrors.name ? 'border-red-400 bg-red-50' : 'border-slate-300'
                  }`}
                  autoFocus
                />
                {formErrors.name && (
                  <p className="text-xs text-red-500 mt-1 flex items-center space-x-1">
                    <AlertTriangle className="w-3 h-3" />
                    <span>{formErrors.name}</span>
                  </p>
                )}
              </div>

              {/* Key */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Key <span className="text-red-500">*</span>
                  <span className="text-slate-400 font-normal ml-1 text-xs">(lowercase, no spaces)</span>
                </label>
                <input
                  type="text"
                  value={formData.key}
                  onChange={(e) => {
                    setFormData({ ...formData, key: e.target.value.toLowerCase().replace(/\s+/g, '_') });
                    if (formErrors.key) setFormErrors({ ...formErrors, key: undefined });
                  }}
                  placeholder="e.g. completeness"
                  disabled={!!editingId}
                  className={`w-full px-3 py-2.5 border rounded-lg text-sm font-mono focus:ring-2 focus:ring-[#03AD9A] focus:border-transparent outline-none ${
                    formErrors.key
                      ? 'border-red-400 bg-red-50'
                      : editingId
                      ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
                      : 'border-slate-300'
                  }`}
                />
                {formErrors.key && (
                  <p className="text-xs text-red-500 mt-1 flex items-center space-x-1">
                    <AlertTriangle className="w-3 h-3" />
                    <span>{formErrors.key}</span>
                  </p>
                )}
                {editingId && (
                  <p className="text-xs text-slate-400 mt-1">Key cannot be changed after creation</p>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe what this dimension measures..."
                  rows={3}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-[#03AD9A] focus:border-transparent outline-none resize-none"
                />
              </div>

              {/* Active toggle */}
              <div className="flex items-center justify-between py-3 px-4 bg-slate-50 rounded-lg border border-slate-200">
                <div>
                  <p className="text-sm font-medium text-slate-700">Active</p>
                  <p className="text-xs text-slate-400">Include this dimension in quality checks</p>
                </div>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    formData.is_active ? 'bg-[#008192]' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      formData.is_active ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Panel footer */}
            <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t border-slate-200">
              <button
                onClick={closePanel}
                className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center space-x-2 px-4 py-2 text-sm bg-[#008192] text-white rounded-lg hover:bg-[#064B77] transition font-medium disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{saving ? 'Saving...' : 'Save'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
