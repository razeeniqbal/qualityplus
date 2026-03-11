import { useState, useEffect } from 'react';
import {
  Cpu, Database, Layout, Layers, Shield, Zap, CheckCircle2,
  ExternalLink, Code2, Package, Plus, Pencil, Trash2, Save, Loader2,
} from 'lucide-react';
import { apiClient } from '../lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FrameworkNode {
  id: string;
  parent_id: string | null;
  label: string;
  description: string;
  sort_order: number;
  status: 'existing' | 'planned';
}

// ─── Inline form (shared for add + edit) ─────────────────────────────────────

function NodeForm({
  initial, submitLabel, onSubmit, onCancel,
}: {
  initial?: { label: string; description: string; status?: 'existing' | 'planned' };
  submitLabel: string;
  onSubmit: (label: string, description: string, status: 'existing' | 'planned') => Promise<void>;
  onCancel: () => void;
}) {
  const [label,  setLabel]  = useState(initial?.label ?? '');
  const [desc,   setDesc]   = useState(initial?.description ?? '');
  const [status, setStatus] = useState<'existing' | 'planned'>(initial?.status ?? 'existing');
  const [saving, setSaving] = useState(false);

  async function handle() {
    if (!label.trim()) return;
    setSaving(true);
    await onSubmit(label.trim(), desc.trim(), status);
    setSaving(false);
  }

  return (
    <div className="space-y-2" onClick={e => e.stopPropagation()}>
      <input
        value={label}
        onChange={e => setLabel(e.target.value)}
        placeholder="Label"
        autoFocus
        onKeyDown={e => { if (e.key === 'Enter') handle(); if (e.key === 'Escape') onCancel(); }}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
      />
      <textarea
        value={desc}
        onChange={e => setDesc(e.target.value)}
        placeholder="Description (optional)"
        rows={2}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
      />
      {/* Status toggle */}
      <div className="flex gap-2">
        {(['existing', 'planned'] as const).map(s => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition ${
              status === s
                ? s === 'existing'
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-amber-50 text-amber-700 border-amber-400'
                : 'bg-white text-slate-400 border-slate-200 hover:border-slate-400'
            }`}
          >
            {s === 'existing' ? 'Existing' : 'Planned'}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          onClick={handle}
          disabled={saving || !label.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg transition disabled:opacity-40"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {submitLabel}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 border border-slate-200 text-slate-500 text-xs font-semibold rounded-lg hover:bg-slate-50 transition"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Capability card (top-level node in the mind map grid) ────────────────────

function CapabilityCard({
  node, children, onRefresh, deleting, onDelete,
}: {
  node: FrameworkNode;
  children: FrameworkNode[];
  onRefresh: () => void;
  deleting: string | null;
  onDelete: (id: string, label: string) => void;
}) {
  const [editingSelf, setEditingSelf] = useState(false);
  const [editChildId, setEditChildId] = useState<string | null>(null);
  const [addingChild, setAddingChild] = useState(false);

  const isPlanned = node.status === 'planned';

  async function handleEditSelf(label: string, description: string, status: 'existing' | 'planned') {
    await apiClient.updateFrameworkNode(node.id, { label, description, status });
    setEditingSelf(false);
    onRefresh();
  }

  async function handleEditChild(id: string, label: string, description: string, status: 'existing' | 'planned') {
    await apiClient.updateFrameworkNode(id, { label, description, status });
    setEditChildId(null);
    onRefresh();
  }

  async function handleAddChild(label: string, description: string, status: 'existing' | 'planned') {
    await apiClient.addFrameworkNode({
      parent_id: node.id,
      label,
      description,
      sort_order: children.length + 1,
      status,
    });
    setAddingChild(false);
    onRefresh();
  }

  return (
    <div className={`rounded-xl overflow-hidden border-2 shadow-sm ${
      isPlanned
        ? 'border-dashed border-amber-300 bg-amber-50/50'
        : 'border-slate-200 bg-white'
    }`}>

      {/* Header */}
      <div className={`group flex items-start gap-3 p-4 ${isPlanned ? 'bg-amber-50/60' : 'bg-slate-50'}`}>
        {editingSelf ? (
          <div className="flex-1">
            <NodeForm
              initial={{ label: node.label, description: node.description, status: node.status }}
              submitLabel="Save"
              onSubmit={handleEditSelf}
              onCancel={() => setEditingSelf(false)}
            />
          </div>
        ) : (
          <>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className={`text-sm font-bold leading-tight ${isPlanned ? 'text-amber-800' : 'text-slate-800'}`}>
                  {node.label}
                </p>
                {isPlanned && (
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-300 uppercase tracking-wider">
                    Planned
                  </span>
                )}
              </div>
              <p className={`text-[11px] mt-1 leading-snug ${isPlanned ? 'text-amber-700/70' : 'text-slate-500'}`}>
                {node.description}
              </p>
            </div>

            {/* Action buttons (hover reveal) */}
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
              <button
                onClick={() => setEditingSelf(true)}
                className="p-1.5 rounded-lg hover:bg-slate-200 transition"
                title="Edit"
              >
                <Pencil className="w-3.5 h-3.5 text-slate-400" />
              </button>
              <button
                onClick={() => onDelete(node.id, node.label)}
                disabled={deleting === node.id}
                className="p-1.5 rounded-lg hover:bg-red-50 transition"
                title="Delete"
              >
                {deleting === node.id
                  ? <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin" />
                  : <Trash2  className="w-3.5 h-3.5 text-slate-400" />}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Sub-capabilities — always visible */}
      {!editingSelf && (
        <div className={`border-t px-4 py-3 space-y-3 ${
          isPlanned ? 'border-amber-200 bg-amber-50/30' : 'border-slate-100 bg-white'
        }`}>
          {children.length > 0 && (
            <div className="space-y-1">
              {children.map(child => {
                const childPlanned = child.status === 'planned';
                return editChildId === child.id ? (
                  <div key={child.id} className="bg-white rounded-lg border border-slate-200 p-3">
                    <NodeForm
                      initial={{ label: child.label, description: child.description, status: child.status }}
                      submitLabel="Save"
                      onSubmit={(l, d, s) => handleEditChild(child.id, l, d, s)}
                      onCancel={() => setEditChildId(null)}
                    />
                  </div>
                ) : (
                  <div
                    key={child.id}
                    className={`group flex items-start gap-2.5 px-3 py-2 rounded-lg transition ${
                      childPlanned ? 'hover:bg-amber-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                      childPlanned ? 'bg-amber-400' : 'bg-slate-400'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className={`text-xs font-semibold ${childPlanned ? 'text-amber-800' : 'text-slate-700'}`}>
                          {child.label}
                        </p>
                        {childPlanned && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-600 border border-amber-200 uppercase tracking-wide">
                            Planned
                          </span>
                        )}
                      </div>
                      {child.description && (
                        <p className={`text-[11px] mt-0.5 leading-snug ${childPlanned ? 'text-amber-700/70' : 'text-slate-500'}`}>
                          {child.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5">
                      <button
                        onClick={() => setEditChildId(child.id)}
                        className="p-1 rounded hover:bg-slate-200 transition"
                        title="Edit"
                      >
                        <Pencil className="w-3 h-3 text-slate-400" />
                      </button>
                      <button
                        onClick={() => onDelete(child.id, child.label)}
                        disabled={deleting === child.id}
                        className="p-1 rounded hover:bg-red-50 transition"
                        title="Delete"
                      >
                        {deleting === child.id
                          ? <Loader2 className="w-3 h-3 text-slate-400 animate-spin" />
                          : <Trash2  className="w-3 h-3 text-slate-400" />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {addingChild ? (
            <div className="bg-white rounded-lg border border-dashed border-teal-300 p-3">
              <NodeForm
                submitLabel="Add"
                onSubmit={handleAddChild}
                onCancel={() => setAddingChild(false)}
              />
            </div>
          ) : (
            <button
              onClick={() => setAddingChild(true)}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 hover:text-teal-600 transition"
            >
              <Plus className="w-3.5 h-3.5" /> Add feature
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Framework mind map ───────────────────────────────────────────────────────

function FrameworkTree({ nodes, onRefresh }: { nodes: FrameworkNode[]; onRefresh: () => void }) {
  const [deleting,   setDeleting]   = useState<string | null>(null);
  const [addingRoot, setAddingRoot] = useState(false);

  const rootNode = nodes.find(n => n.parent_id === null);
  if (!rootNode) return (
    <p className="text-center text-sm text-slate-400 py-12">
      No data — run <code className="bg-slate-100 px-1 rounded">add_framework_nodes.sql</code> in Supabase.
    </p>
  );

  const topLevel   = nodes.filter(n => n.parent_id === rootNode.id).sort((a, b) => a.sort_order - b.sort_order);
  const childrenOf = (id: string) => nodes.filter(n => n.parent_id === id).sort((a, b) => a.sort_order - b.sort_order);

  const existingCaps = topLevel.filter(n => n.status === 'existing');
  const plannedCaps  = topLevel.filter(n => n.status === 'planned');

  async function handleDelete(id: string, label: string) {
    const kids = nodes.filter(n => n.parent_id === id).length;
    if (!window.confirm(kids > 0 ? `Delete "${label}" and its ${kids} child(ren)?` : `Delete "${label}"?`)) return;
    setDeleting(id);
    try { await apiClient.deleteFrameworkNode(id); onRefresh(); }
    finally { setDeleting(null); }
  }

  async function handleAddTopLevel(label: string, description: string, status: 'existing' | 'planned') {
    await apiClient.addFrameworkNode({ parent_id: rootNode.id, label, description, sort_order: topLevel.length + 1, status });
    setAddingRoot(false);
    onRefresh();
  }

  return (
    <div className="space-y-8">

      {/* ── Root node ── */}
      <div className="flex flex-col items-center gap-0">
        <div className="flex items-center gap-4 px-6 py-4 bg-slate-800 rounded-2xl shadow-md w-fit mx-auto">
          <img src="/dataqualityplus.png" alt="logo" className="w-9 h-9 object-contain flex-shrink-0" />
          <div>
            <p className="text-white font-bold text-base leading-tight">{rootNode.label}</p>
            <p className="text-slate-400 text-xs mt-0.5">{rootNode.description}</p>
          </div>
        </div>
        {/* Connector line down */}
        <div className="w-px h-6 bg-slate-300" />
        {/* Horizontal spread bar */}
        <div className="w-full border-t-2 border-slate-300 relative">
          <div className="absolute left-1/2 -top-1 -translate-x-1/2 w-2 h-2 rounded-full bg-slate-300" />
        </div>
      </div>

      {/* ── Existing capabilities ── */}
      {existingCaps.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-slate-100" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-2">
              Current Capabilities
            </span>
            <div className="h-px flex-1 bg-slate-100" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {existingCaps.map(node => (
              <CapabilityCard
                key={node.id}
                node={node}
                children={childrenOf(node.id)}
                onRefresh={onRefresh}
                deleting={deleting}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Planned capabilities ── */}
      {plannedCaps.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-amber-200" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-500 px-2">
              Planned Capabilities
            </span>
            <div className="h-px flex-1 bg-amber-200" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {plannedCaps.map(node => (
              <CapabilityCard
                key={node.id}
                node={node}
                children={childrenOf(node.id)}
                onRefresh={onRefresh}
                deleting={deleting}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Add new capability ── */}
      {addingRoot ? (
        <div className="border border-dashed border-teal-300 rounded-xl bg-white p-4">
          <p className="text-xs font-semibold text-teal-600 mb-3">New capability</p>
          <NodeForm submitLabel="Add" onSubmit={handleAddTopLevel} onCancel={() => setAddingRoot(false)} />
        </div>
      ) : (
        <button
          onClick={() => setAddingRoot(true)}
          className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-slate-300 rounded-xl text-slate-400 hover:border-teal-400 hover:text-teal-600 text-xs font-semibold transition"
        >
          <Plus className="w-4 h-4" /> Add capability
        </button>
      )}
    </div>
  );
}

// ─── Stack tab ────────────────────────────────────────────────────────────────

interface StackItem {
  name: string;
  version?: string;
  category: string;
  role: string;
  color: string;
  icon: React.ReactNode;
  why: string;
  bullets: string[];
  docsUrl?: string;
}

const stackItems: StackItem[] = [
  {
    name: 'React', version: '18.3', category: 'Frontend', role: 'UI Framework', color: 'blue',
    icon: <Layout className="w-5 h-5" />,
    why: 'Component-based architecture that makes it easy to build complex, interactive UIs with reusable pieces.',
    bullets: [
      'All pages and panels are function components using hooks — no class components',
      'useState and useEffect handle all local async data fetching',
      'UserContext (React Context API) provides auth state app-wide without prop drilling',
      'Strict mode enabled in development to catch potential issues early',
    ],
    docsUrl: 'https://react.dev',
  },
  {
    name: 'TypeScript', version: '5.5', category: 'Frontend', role: 'Type-safe JavaScript', color: 'indigo',
    icon: <Code2 className="w-5 h-5" />,
    why: 'Catches bugs at compile time rather than runtime, and makes refactoring across a large codebase safe.',
    bullets: [
      'Strict mode — no implicit any, strictNullChecks enabled',
      'All Supabase response shapes typed via interfaces in src/types/database.ts',
      'Component props fully typed so misuse is caught immediately in the IDE',
      'API client methods return typed data, eliminating guesswork on the frontend',
    ],
    docsUrl: 'https://www.typescriptlang.org',
  },
  {
    name: 'Vite', version: '5.4', category: 'Toolchain', role: 'Build Tool & Dev Server', color: 'purple',
    icon: <Zap className="w-5 h-5" />,
    why: 'Near-instant dev server startup and hot module replacement — no waiting for full rebuilds.',
    bullets: [
      'ESM-based dev server starts in milliseconds regardless of project size',
      'Hot Module Replacement (HMR) updates only the changed module in-browser',
      'Production build is code-split and tree-shaken via Rollup under the hood',
      'Environment variables prefixed with VITE_ are injected at build time (Supabase keys)',
      'Static assets in /public/ are served at the root URL unchanged',
    ],
    docsUrl: 'https://vitejs.dev',
  },
  {
    name: 'Tailwind CSS', version: '3.4', category: 'Frontend', role: 'Styling', color: 'teal',
    icon: <Layers className="w-5 h-5" />,
    why: 'Utility-first approach eliminates context-switching between CSS files and JSX, and enforces a consistent design system.',
    bullets: [
      'No custom stylesheet files — all styles are inline utility classes',
      'Teal → emerald brand palette applied consistently across headers, buttons, and accents',
      'Responsive layout with container, grid, and flex utilities',
      'Dark variants and hover/focus states handled declaratively in JSX',
      'PurgeCSS in production removes unused classes — final bundle is tiny',
    ],
    docsUrl: 'https://tailwindcss.com',
  },
  {
    name: 'Supabase', category: 'Backend', role: 'Backend-as-a-Service', color: 'emerald',
    icon: <Database className="w-5 h-5" />,
    why: 'Replaces a custom REST server entirely — PostgREST auto-generates a full REST API from the database schema.',
    bullets: [
      'PostgreSQL 15 — relational DB with JSONB support for dataset row storage',
      'PostgREST: every table gets auto-generated REST endpoints (select, insert, update, delete)',
      'Row Level Security (RLS) policies enforce access control at the DB layer',
      'Supabase Storage bucket (project-icons) stores uploaded project icon images',
      'Edge Functions (Deno runtime) power the MSSQL proxy — credentials never stored server-side',
      'supabase-js v2 SDK handles auth token injection on every request automatically',
    ],
    docsUrl: 'https://supabase.com',
  },
  {
    name: 'Lucide React', version: '0.344', category: 'Frontend', role: 'Icon Library', color: 'orange',
    icon: <Package className="w-5 h-5" />,
    why: 'Consistent, clean SVG icon set that is tree-shakeable — only imported icons end up in the bundle.',
    bullets: [
      '900+ icons available, consistent 24px viewBox and stroke-based style',
      'Each icon is a standalone component — unused icons are tree-shaken out',
      'Sizes controlled via w-* h-* Tailwind classes, colour via text-* classes',
    ],
    docsUrl: 'https://lucide.dev',
  },
  {
    name: 'Vitest', version: '1.0', category: 'Toolchain', role: 'Testing Framework', color: 'yellow',
    icon: <CheckCircle2 className="w-5 h-5" />,
    why: 'Jest-compatible API that runs natively inside Vite — no separate test bundler configuration needed.',
    bullets: [
      'Same config as Vite — no separate babel/webpack setup for tests',
      'Jest-compatible API: describe, it, expect, vi.mock work as expected',
      'jsdom environment for DOM testing of React components',
      'Coverage reporting via @vitest/coverage-v8 (built on Node\'s V8 coverage)',
      'Watch mode re-runs only affected tests on file change',
    ],
    docsUrl: 'https://vitest.dev',
  },
];

const SC: Record<string, { bg: string; border: string; text: string; badge: string; header: string }> = {
  blue:    { bg: 'bg-blue-50',    border: 'border-blue-200',    text: 'text-blue-700',    badge: 'bg-blue-100 text-blue-700',    header: 'bg-blue-600'    },
  indigo:  { bg: 'bg-indigo-50',  border: 'border-indigo-200',  text: 'text-indigo-700',  badge: 'bg-indigo-100 text-indigo-700',  header: 'bg-indigo-600'  },
  purple:  { bg: 'bg-purple-50',  border: 'border-purple-200',  text: 'text-purple-700',  badge: 'bg-purple-100 text-purple-700',  header: 'bg-purple-600'  },
  teal:    { bg: 'bg-teal-50',    border: 'border-teal-200',    text: 'text-teal-700',    badge: 'bg-teal-100 text-teal-700',    header: 'bg-teal-600'    },
  emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700', header: 'bg-emerald-600' },
  orange:  { bg: 'bg-orange-50',  border: 'border-orange-200',  text: 'text-orange-700',  badge: 'bg-orange-100 text-orange-700',  header: 'bg-orange-500'  },
  yellow:  { bg: 'bg-yellow-50',  border: 'border-yellow-200',  text: 'text-yellow-700',  badge: 'bg-yellow-100 text-yellow-700',  header: 'bg-yellow-500'  },
};

const CATEGORIES = ['All', 'Frontend', 'Backend', 'Toolchain'];

function StackTab() {
  const [filter, setFilter] = useState('All');

  const visible = filter === 'All' ? stackItems : stackItems.filter(i => i.category === filter);

  return (
    <div className="space-y-6">
      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition ${
              filter === cat
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Cards — always fully expanded */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {visible.map(item => {
          const c = SC[item.color];
          return (
            <div key={item.name} className={`rounded-xl border-2 ${c.border} overflow-hidden`}>
              {/* Coloured header */}
              <div className={`${c.header} px-4 py-3 flex items-center justify-between`}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center text-white flex-shrink-0">
                    {item.icon}
                  </div>
                  <div className="min-w-0">
                    <p className="text-white font-bold text-sm leading-tight">{item.name}</p>
                    {item.version && <p className="text-white/70 text-[11px]">v{item.version}</p>}
                  </div>
                </div>
                {item.docsUrl && (
                  <a
                    href={item.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-white/70 hover:text-white text-[11px] font-semibold transition flex-shrink-0"
                  >
                    <ExternalLink className="w-3 h-3" /> Docs
                  </a>
                )}
              </div>
              {/* Body */}
              <div className={`px-4 py-4 space-y-3 ${c.bg}`}>
                <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${c.badge}`}>
                  {item.role}
                </span>
                <p className="text-xs text-slate-600 leading-relaxed">{item.why}</p>
                <ul className="space-y-1.5">
                  {item.bullets.map(b => (
                    <li key={b} className="flex items-start gap-2">
                      <CheckCircle2 className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${c.text}`} />
                      <span className="text-xs text-slate-600 leading-snug">{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SystemOverviewPage() {
  const [nodes,   setNodes]   = useState<FrameworkNode[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      setNodes(await apiClient.getFrameworkNodes() as FrameworkNode[]);
    } catch (e) {
      console.error('Failed to load framework nodes:', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const [tab, setTab] = useState<'framework' | 'stack'>('framework');

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-xl flex items-center justify-center">
          <Cpu className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">System Overview</h1>
          <p className="text-sm text-slate-500">Framework capabilities · Technology stack</p>
        </div>
        <span className="ml-auto flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-600 text-xs font-semibold rounded-full border border-slate-200">
          <Shield className="w-3.5 h-3.5" />
          Admin Only
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {([
          { id: 'framework', label: 'Framework Capabilities' },
          { id: 'stack',     label: 'Technology Stack'       },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition ${
              tab === t.id
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      {tab === 'framework' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-7 h-7 animate-spin text-teal-500" />
            </div>
          ) : (
            <FrameworkTree nodes={nodes} onRefresh={load} />
          )}
        </div>
      )}

      {tab === 'stack' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <StackTab />
        </div>
      )}

    </div>
  );
}
