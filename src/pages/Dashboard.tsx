import { useState, useEffect, useRef } from 'react';
import { Search, Crown, Edit, Eye, Users, Trash2, X, FolderOpen, ImageIcon, Lock, Globe, Star } from 'lucide-react';
import { apiClient } from '../lib/api-client';
import type { ProjectWithRole, ProjectUserRole } from '../types/database';
import { useUser } from '../contexts/UserContext';

interface DashboardProps {
  onNavigateToRecords: (projectId: string) => void;
}

// Legacy localStorage icon fallback (for icons saved before DB storage)
function getLocalIcon(projectId: string): string | null {
  return localStorage.getItem(`project_icon_${projectId}`);
}

function getRoleIcon(role: ProjectUserRole) {
  switch (role) {
    case 'owner':    return <Crown className="w-4 h-4" />;
    case 'co-owner': return <Crown className="w-4 h-4" />;
    case 'editor':   return <Edit className="w-4 h-4" />;
    case 'viewer':   return <Eye className="w-4 h-4" />;
  }
}

function getRoleColor(role: ProjectUserRole) {
  switch (role) {
    case 'owner':    return 'bg-purple-100 text-purple-700 border-purple-300';
    case 'co-owner': return 'bg-purple-50 text-purple-600 border-purple-200';
    case 'editor':   return 'bg-blue-100 text-blue-700 border-blue-300';
    case 'viewer':   return 'bg-slate-100 text-slate-700 border-slate-300';
  }
}

function getRoleLabel(role: ProjectUserRole) {
  switch (role) {
    case 'owner':    return 'Owner';
    case 'co-owner': return 'Co-owner';
    case 'editor':   return 'Editor';
    case 'viewer':   return 'Viewer';
  }
}

export default function Dashboard({ onNavigateToRecords }: DashboardProps) {
  const { user } = useUser();
  const [myProjects, setMyProjects] = useState<ProjectWithRole[]>([]);
  const [sharedProjects, setSharedProjects] = useState<ProjectWithRole[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'my' | 'shared'>('all');

  // New Project modal state
  const [showNewProject, setShowNewProject] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [newProjectIsPublic, setNewProjectIsPublic] = useState(false);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const iconInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function loadProjects() {
    if (!user) return;
    try {
      const projects = await apiClient.getProjects(user.displayName, user.role === 'admin') as unknown as ProjectWithRole[];
      const owned = projects.filter(p => p.userRole === 'owner' || p.userRole === 'co-owner');
      const shared = projects.filter(p => p.userRole === 'editor' || p.userRole === 'viewer');
      setMyProjects(owned);
      setSharedProjects(shared);
    } catch (error) {
      console.error('Error loading projects:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteProject(e: React.MouseEvent, projectId: string) {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this project? This cannot be undone.')) return;
    try {
      await apiClient.deleteProject(projectId);
      localStorage.removeItem(`project_icon_${projectId}`); // clean up legacy
      setMyProjects((prev) => prev.filter((p) => p.id !== projectId));
      setSharedProjects((prev) => prev.filter((p) => p.id !== projectId));
    } catch (error) {
      console.error('Error deleting project:', error);
      alert('Failed to delete project.');
    }
  }

  function openNewProject() {
    setProjectName('');
    setProjectDescription('');
    setIconPreview(null);
    setIconFile(null);
    setShowNewProject(true);
  }

  function closeNewProject() {
    setShowNewProject(false);
    setProjectName('');
    setProjectDescription('');
    setNewProjectIsPublic(false);
    setIconPreview(null);
    setIconFile(null);
  }

  function handleIconSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIconFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setIconPreview(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  }

  async function handleCreateProject() {
    const name = projectName.trim();
    if (!name) {
      alert('Please enter a project name.');
      return;
    }
    setIsCreating(true);
    try {
      // Create the project first (without icon) to get the ID
      const created = await apiClient.createProject(
        name,
        projectDescription.trim(),
        newProjectIsPublic,
        user?.displayName,
        null,
      ) as { id: string };

      // Upload icon to Supabase Storage and update the project with the public URL
      if (iconFile) {
        try {
          const publicUrl = await apiClient.uploadProjectIcon(iconFile, created.id);
          await apiClient.updateProject(created.id, { icon_url: publicUrl });
        } catch (iconErr) {
          console.error('Icon upload failed — project created without icon:', iconErr);
        }
      }

      await loadProjects();
      closeNewProject();
      onNavigateToRecords(created.id);
    } catch (error: unknown) {
      console.error('Error creating project:', error);
      const message = error instanceof Error ? error.message : 'Error creating project. Please try again.';
      alert(message);
    } finally {
      setIsCreating(false);
    }
  }

  const allProjects = [...myProjects, ...sharedProjects];
  const projectsToShow = activeTab === 'all' ? allProjects : activeTab === 'my' ? myProjects : sharedProjects;
  const filteredProjects = projectsToShow.filter(
    (project) =>
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-slate-800">Dashboard</h1>
        <button
          onClick={openNewProject}
          className="flex items-center space-x-2 bg-gradient-to-r from-teal-600 to-emerald-600 text-white px-6 py-3 rounded-lg hover:from-teal-700 hover:to-emerald-700 transition shadow-lg hover:shadow-xl"
        >
          <FolderOpen className="w-5 h-5" />
          <span className="font-medium">New Project</span>
        </button>
      </div>

      {/* New Project Modal */}
      {showNewProject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-xl font-bold text-slate-800">New Project</h2>
              <button onClick={closeNewProject} className="p-2 hover:bg-slate-100 rounded-lg transition">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Project icon upload */}
              <div className="flex flex-col items-center space-y-3">
                <div
                  onClick={() => iconInputRef.current?.click()}
                  className="w-24 h-24 rounded-2xl border-2 border-dashed border-slate-300 hover:border-teal-400 cursor-pointer overflow-hidden flex items-center justify-center bg-slate-50 hover:bg-teal-50 transition group"
                  title="Click to upload project icon"
                >
                  {iconPreview ? (
                    <img src={iconPreview} alt="Project icon" className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center space-y-1 text-slate-400 group-hover:text-teal-500 transition">
                      <ImageIcon className="w-8 h-8" />
                      <span className="text-xs font-medium">Upload Icon</span>
                    </div>
                  )}
                </div>
                {iconPreview && (
                  <button
                    onClick={() => { setIconPreview(null); setIconFile(null); if (iconInputRef.current) iconInputRef.current.value = ''; }}
                    className="text-xs text-slate-400 hover:text-red-500 transition"
                  >
                    Remove icon
                  </button>
                )}
                <input
                  ref={iconInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleIconSelect}
                  className="hidden"
                />
              </div>

              {/* Project name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Project Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Enter project name"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
                  autoFocus
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Description <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <textarea
                  placeholder="Brief description of this project"
                  value={projectDescription}
                  onChange={(e) => setProjectDescription(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none resize-none text-sm"
                />
              </div>

              {/* Visibility */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Visibility
                </label>
                <div className="flex items-center space-x-2 p-1.5 border border-slate-200 rounded-lg bg-slate-50">
                  <button
                    type="button"
                    onClick={() => setNewProjectIsPublic(false)}
                    className={`flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-lg transition text-sm font-medium ${
                      !newProjectIsPublic
                        ? 'bg-white text-slate-800 shadow-sm border border-slate-200'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <Lock className="w-4 h-4" />
                    <span>Private</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewProjectIsPublic(true)}
                    className={`flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-lg transition text-sm font-medium ${
                      newProjectIsPublic
                        ? 'bg-white text-teal-700 shadow-sm border border-teal-200'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <Globe className="w-4 h-4" />
                    <span>Public</span>
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-1.5">
                  {newProjectIsPublic
                    ? 'All logged-in users can see this project in their dashboard'
                    : 'Only you and members you add can see this project'}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t border-slate-200">
              <button
                onClick={closeNewProject}
                className="px-5 py-2.5 text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateProject}
                disabled={!projectName.trim() || isCreating}
                className="flex items-center space-x-2 px-5 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 text-white rounded-lg hover:from-teal-700 hover:to-emerald-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Creating...</span>
                  </>
                ) : (
                  <>
                    <FolderOpen className="w-4 h-4" />
                    <span>Create Project</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search bar */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search projects..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl bg-white shadow-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none text-sm"
        />
      </div>

      {/* Filter cards */}
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        {/* My Projects filter card */}
        <button
          onClick={() => setActiveTab(activeTab === 'my' ? 'all' : 'my')}
          className={`flex items-center space-x-3 px-5 py-3 rounded-xl border-2 transition shadow-sm ${
            activeTab === 'my'
              ? 'border-purple-400 bg-purple-50 text-purple-700'
              : 'border-slate-200 bg-white text-slate-600 hover:border-purple-300 hover:bg-purple-50/50'
          }`}
        >
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${activeTab === 'my' ? 'bg-purple-100' : 'bg-slate-100'}`}>
            <Crown className={`w-4 h-4 ${activeTab === 'my' ? 'text-purple-600' : 'text-slate-400'}`} />
          </div>
          <div className="text-left">
            <p className="text-xs text-slate-400 font-medium leading-none mb-0.5">My Projects</p>
            <p className={`text-lg font-bold leading-none ${activeTab === 'my' ? 'text-purple-700' : 'text-slate-700'}`}>{myProjects.length}</p>
          </div>
        </button>

        {/* Shared Projects filter card */}
        <button
          onClick={() => setActiveTab(activeTab === 'shared' ? 'all' : 'shared')}
          className={`flex items-center space-x-3 px-5 py-3 rounded-xl border-2 transition shadow-sm ${
            activeTab === 'shared'
              ? 'border-teal-400 bg-teal-50 text-teal-700'
              : 'border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:bg-teal-50/50'
          }`}
        >
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${activeTab === 'shared' ? 'bg-teal-100' : 'bg-slate-100'}`}>
            <Users className={`w-4 h-4 ${activeTab === 'shared' ? 'text-teal-600' : 'text-slate-400'}`} />
          </div>
          <div className="text-left">
            <p className="text-xs text-slate-400 font-medium leading-none mb-0.5">Shared Projects</p>
            <p className={`text-lg font-bold leading-none ${activeTab === 'shared' ? 'text-teal-700' : 'text-slate-700'}`}>{sharedProjects.length}</p>
          </div>
        </button>
      </div>

      {/* Projects Grid */}
      {loading ? (
        <div className="text-center py-20">
          <div className="animate-spin w-12 h-12 border-4 border-teal-600 border-t-transparent rounded-full mx-auto"></div>
          <p className="text-slate-600 mt-4">Loading projects...</p>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl shadow-sm border border-slate-100">
          <FolderOpen className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-600 mb-2">
            {searchQuery ? 'No Projects Found' : activeTab === 'shared' ? 'No Shared Projects' : 'No Projects Yet'}
          </h2>
          <p className="text-slate-500 mb-6">
            {searchQuery ? 'Try a different search term' : activeTab === 'shared' ? 'Projects shared with you will appear here' : 'Get started by creating your first project'}
          </p>
          {activeTab !== 'shared' && !searchQuery && (
            <button
              onClick={openNewProject}
              className="bg-gradient-to-r from-teal-600 to-emerald-600 text-white px-6 py-3 rounded-lg hover:from-teal-700 hover:to-emerald-700 transition inline-flex items-center space-x-2"
            >
              <FolderOpen className="w-5 h-5" />
              <span>New Project</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.map((project) => {
            const icon = project.icon_url ?? getLocalIcon(project.id);
            const canDelete = project.userRole === 'owner';
            return (
              <div
                key={project.id}
                className="bg-white rounded-xl shadow-sm border border-slate-200 hover:shadow-md hover:border-teal-200 transition cursor-pointer group flex flex-col"
                onClick={() => onNavigateToRecords(project.id)}
              >
                {/* Top section: thumbnail + name/date + star */}
                <div className="flex items-start gap-3 p-4">
                  {/* Square thumbnail */}
                  <div className="w-16 h-16 rounded-lg flex-shrink-0 overflow-hidden bg-gradient-to-br from-teal-500 to-emerald-600">
                    {icon ? (
                      <img src={icon} alt={project.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <FolderOpen className="w-7 h-7 text-white/80" />
                      </div>
                    )}
                  </div>

                  {/* Name + date */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-800 text-sm group-hover:text-teal-700 transition leading-tight" title={project.name}>
                      {project.name}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Modified: {new Date(project.created_at).toLocaleDateString('en-CA')}
                    </p>
                    {/* Role badge */}
                    <div className={`inline-flex items-center space-x-1 mt-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${getRoleColor(project.userRole)}`}>
                      {getRoleIcon(project.userRole)}
                      <span>{getRoleLabel(project.userRole)}</span>
                    </div>
                  </div>

                  {/* Star + delete actions */}
                  <div className="flex flex-col items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button className="p-1 text-slate-300 hover:text-yellow-400 transition" title="Bookmark">
                      <Star className="w-4 h-4" />
                    </button>
                    {canDelete && (
                      <button
                        onClick={(e) => handleDeleteProject(e, project.id)}
                        className="p-1 text-slate-300 hover:text-red-500 transition"
                        title="Delete project"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Description */}
                {project.description && (
                  <p className="text-xs text-slate-500 px-4 pb-3 line-clamp-2 leading-relaxed" title={project.description}>
                    {project.description}
                  </p>
                )}

                {/* Footer: show datasets link + member count */}
                <div className="px-4 py-2.5 border-t border-slate-100 flex items-center justify-between mt-auto" onClick={(e) => e.stopPropagation()}>
                  {(project.member_count ?? 0) > 0 ? (
                    <div className="flex items-center space-x-1 text-xs text-slate-400">
                      <Users className="w-3.5 h-3.5" />
                      <span>{project.member_count} member{(project.member_count ?? 0) !== 1 ? 's' : ''}</span>
                    </div>
                  ) : <span />}
                  <button
                    onClick={() => onNavigateToRecords(project.id)}
                    className="text-xs text-teal-600 hover:text-teal-800 font-semibold transition"
                  >
                    Show datasets →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
