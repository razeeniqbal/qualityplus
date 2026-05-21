import { useState, useEffect } from 'react';
import { X, Settings, Globe, Lock, UserPlus, UserMinus, Save, RotateCcw } from 'lucide-react';
import { apiClient } from '../lib/api-client';
import type { ProjectMember, AppUser } from '../types/database';

interface ProjectSettingsPanelProps {
  projectId: string;
  projectName: string;
  projectDescription: string;
  ownerName: string | null;
  isPublic: boolean;
  isOwner: boolean;
  onClose: () => void;
  onVisibilityChange: (isPublic: boolean) => Promise<void>;
  onProjectInfoSaved?: (name: string, description: string) => void;
}

function getRoleBadgeClass(role: 'owner' | 'editor' | 'viewer') {
  switch (role) {
    case 'owner':  return 'bg-purple-100 text-purple-700 border-purple-300';
    case 'editor': return 'bg-blue-100 text-blue-700 border-blue-300';
    case 'viewer': return 'bg-slate-100 text-slate-700 border-slate-300';
  }
}

function getRoleDisplayLabel(role: 'owner' | 'editor' | 'viewer') {
  switch (role) {
    case 'owner':  return 'Co-owner';
    case 'editor': return 'Editor';
    case 'viewer': return 'Viewer';
  }
}

// Pending member to add (not yet saved)
interface PendingAdd {
  displayName: string;
  role: 'owner' | 'editor' | 'viewer';
}

export default function ProjectSettingsPanel({
  projectId,
  projectName,
  projectDescription,
  ownerName,
  isPublic,
  isOwner,
  onClose,
  onVisibilityChange,
  onProjectInfoSaved,
}: ProjectSettingsPanelProps) {
  // Loaded data
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);

  // Project info edit
  const [editName, setEditName] = useState(projectName);
  const [editDescription, setEditDescription] = useState(projectDescription);
  const [isSavingInfo, setIsSavingInfo] = useState(false);
  const infoChanged = editName.trim() !== projectName || editDescription.trim() !== projectDescription;

  // Staged changes (not yet saved)
  const [stagedVisibility, setStagedVisibility] = useState<boolean>(isPublic);
  const [stagedRoles, setStagedRoles] = useState<Record<string, 'owner' | 'editor' | 'viewer'>>({});
  const [stagedRemovals, setStagedRemovals] = useState<Set<string>>(new Set());
  const [pendingAdds, setPendingAdds] = useState<PendingAdd[]>([]);

  // Add member form
  const [newMemberDisplayName, setNewMemberDisplayName] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'owner' | 'editor' | 'viewer'>('viewer');

  // Save state
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setStagedVisibility(isPublic);
  }, [isPublic]);

  useEffect(() => {
    let cancelled = false;
    setLoadingMembers(true);
    Promise.all([
      apiClient.getProjectMembers(projectId),
      apiClient.getAllUsers(),
    ])
      .then(([membersData, usersData]) => {
        if (!cancelled) {
          setMembers((membersData || []) as ProjectMember[]);
          setAllUsers((usersData || []) as AppUser[]);
        }
      })
      .catch((err) => console.error('Failed to load members:', err))
      .finally(() => { if (!cancelled) setLoadingMembers(false); });
    return () => { cancelled = true; };
  }, [projectId]);

  // Determine if there are any unsaved changes
  const hasChanges =
    stagedVisibility !== isPublic ||
    Object.keys(stagedRoles).length > 0 ||
    stagedRemovals.size > 0 ||
    pendingAdds.length > 0;

  async function handleSaveInfo() {
    const name = editName.trim();
    if (!name) return;
    setIsSavingInfo(true);
    try {
      await apiClient.updateProject(projectId, { name, description: editDescription.trim() || undefined });
      onProjectInfoSaved?.(name, editDescription.trim());
    } catch (err) {
      console.error('Failed to save project info:', err);
      alert('Could not save project info. Please try again.');
    } finally {
      setIsSavingInfo(false);
    }
  }

  function handleStageVisibility() {
    setStagedVisibility(v => !v);
  }

  function handleStageRoleChange(memberId: string, role: 'owner' | 'editor' | 'viewer') {
    setStagedRoles(prev => ({ ...prev, [memberId]: role }));
  }

  function handleStageRemoval(memberId: string) {
    setStagedRemovals(prev => {
      const next = new Set(prev);
      next.add(memberId);
      return next;
    });
    // Also clear any staged role change for this member
    setStagedRoles(prev => {
      const next = { ...prev };
      delete next[memberId];
      return next;
    });
  }

  function handleUndoRemoval(memberId: string) {
    setStagedRemovals(prev => {
      const next = new Set(prev);
      next.delete(memberId);
      return next;
    });
  }

  function handleAddToPending() {
    const name = newMemberDisplayName.trim();
    if (!name) return;
    // Avoid duplicates in pending list
    if (pendingAdds.some(p => p.displayName === name)) return;
    setPendingAdds(prev => [...prev, { displayName: name, role: newMemberRole }]);
    setNewMemberDisplayName('');
    setNewMemberRole('viewer');
  }

  function handleRemovePending(displayName: string) {
    setPendingAdds(prev => prev.filter(p => p.displayName !== displayName));
  }

  function handleChangePendingRole(displayName: string, role: 'owner' | 'editor' | 'viewer') {
    setPendingAdds(prev => prev.map(p => p.displayName === displayName ? { ...p, role } : p));
  }

  function handleDiscard() {
    setStagedVisibility(isPublic);
    setStagedRoles({});
    setStagedRemovals(new Set());
    setPendingAdds([]);
    setNewMemberDisplayName('');
    setNewMemberRole('viewer');
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      // 1. Visibility
      if (stagedVisibility !== isPublic) {
        await onVisibilityChange(stagedVisibility);
      }

      // 2. Role changes
      for (const [memberId, role] of Object.entries(stagedRoles)) {
        await apiClient.updateMemberRole(memberId, role);
        setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role } : m));
      }

      // 3. Removals
      for (const memberId of stagedRemovals) {
        await apiClient.removeProjectMember(memberId);
        setMembers(prev => prev.filter(m => m.id !== memberId));
      }

      // 4. New members
      for (const pending of pendingAdds) {
        const member = await apiClient.addProjectMember(projectId, pending.displayName, pending.role) as ProjectMember;
        setMembers(prev => [...prev, member]);
      }

      // Clear staged state
      setStagedRoles({});
      setStagedRemovals(new Set());
      setPendingAdds([]);
    } catch (err) {
      console.error('Failed to save changes:', err);
      alert('Some changes could not be saved. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  // Effective role for a member (staged override or original)
  function effectiveRole(member: ProjectMember): 'owner' | 'editor' | 'viewer' {
    return stagedRoles[member.id] ?? member.role;
  }

  // Members to display: loaded members excluding owner, then pending adds
  const displayMembers = members.filter(m => m.display_name !== ownerName);

  // Users available to add (exclude existing members, pending adds, and owner)
  const addedNames = new Set([
    ...members.map(m => m.display_name),
    ...pendingAdds.map(p => p.displayName),
  ]);
  const availableUsers = allUsers.filter(u =>
    !addedNames.has(u.display_name) && u.display_name !== ownerName
  );

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Slide-over panel */}
      <div
        className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-br from-[#28B98F] to-[#03AD9A] rounded-lg flex items-center justify-center">
              <Settings className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">Project Settings</h2>
              <p className="text-xs text-slate-500 truncate max-w-[220px]">{projectName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition" title="Close">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Project Info ── */}
          <div className="px-6 py-5 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Project Info</p>
            {isOwner ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Project Name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#03AD9A] focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Description <span className="text-slate-400 font-normal">(optional)</span></label>
                  <textarea
                    value={editDescription}
                    onChange={e => setEditDescription(e.target.value)}
                    rows={2}
                    placeholder="Brief description of this project"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#03AD9A] focus:border-transparent outline-none resize-none"
                  />
                </div>
                {infoChanged && (
                  <button
                    onClick={handleSaveInfo}
                    disabled={!editName.trim() || isSavingInfo}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#008192] to-[#064B77] text-white text-sm font-medium rounded-lg hover:from-[#064B77] hover:to-[#1D275A] transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSavingInfo
                      ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /><span>Saving...</span></>
                      : <><Save className="w-3.5 h-3.5" /><span>Save Info</span></>}
                  </button>
                )}
              </div>
            ) : (
              <>
                <p className="text-sm font-semibold text-slate-800">{projectName}</p>
                {projectDescription && (
                  <p className="text-sm text-slate-500 mt-1 leading-relaxed">{projectDescription}</p>
                )}
              </>
            )}
          </div>

          {/* ── Visibility ── */}
          <div className="px-6 py-5 border-b border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Visibility</p>
              {stagedVisibility !== isPublic && (
                <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 font-medium">
                  Changed
                </span>
              )}
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div className="flex items-center space-x-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                  stagedVisibility ? 'bg-[#d4f0ea]' : 'bg-slate-200'
                }`}>
                  {stagedVisibility
                    ? <Globe className="w-5 h-5 text-[#008192]" />
                    : <Lock className="w-5 h-5 text-slate-500" />}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {stagedVisibility ? 'Public' : 'Private'}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {stagedVisibility
                      ? 'All logged-in users can see this project'
                      : 'Only members you add can see this project'}
                  </p>
                </div>
              </div>

              {isOwner ? (
                <button
                  onClick={handleStageVisibility}
                  className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${
                    stagedVisibility ? 'bg-[#008192]' : 'bg-slate-300'
                  }`}
                  title={stagedVisibility ? 'Switch to Private' : 'Switch to Public'}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${
                    stagedVisibility ? 'translate-x-6' : 'translate-x-0'
                  }`} />
                </button>
              ) : (
                <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${
                  stagedVisibility
                    ? 'bg-[#f0faf8] text-[#008192] border-[#a8e0d6]'
                    : 'bg-slate-50 text-slate-600 border-slate-200'
                }`}>
                  {stagedVisibility ? 'Public' : 'Private'}
                </span>
              )}
            </div>
          </div>

          {/* ── Members ── */}
          <div className="px-6 py-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Members</p>
              {!loadingMembers && (
                <span className="text-xs text-slate-500">
                  {1 + displayMembers.filter(m => !stagedRemovals.has(m.id)).length + pendingAdds.length} member
                  {1 + displayMembers.filter(m => !stagedRemovals.has(m.id)).length + pendingAdds.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {loadingMembers && (
              <div className="flex justify-center py-8">
                <div className="animate-spin w-6 h-6 border-2 border-[#03AD9A] border-t-transparent rounded-full" />
              </div>
            )}

            {/* Owner row — always pinned */}
            {!loadingMembers && ownerName && (
              <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-slate-50 mb-1">
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs font-bold">{ownerName.charAt(0).toUpperCase()}</span>
                  </div>
                  <span className="text-sm font-medium text-slate-700 truncate">{ownerName}</span>
                </div>
                <span className="text-xs px-2 py-1 rounded-full border font-medium bg-purple-100 text-purple-700 border-purple-300 flex-shrink-0">
                  Owner
                </span>
              </div>
            )}

            {/* Existing members (excluding owner) */}
            {!loadingMembers && displayMembers.length === 0 && pendingAdds.length === 0 && (
              <div className="text-center py-6 text-slate-400">
                <p className="text-sm">No other members added yet</p>
                {isOwner && <p className="text-xs mt-1">Use the form below to add members</p>}
              </div>
            )}

            {!loadingMembers && (displayMembers.length > 0 || pendingAdds.length > 0) && (
              <div className="space-y-1 mb-5">
                {/* Existing members */}
                {displayMembers.map((member) => {
                  const isRemoved = stagedRemovals.has(member.id);
                  const roleChanged = stagedRoles[member.id] !== undefined && stagedRoles[member.id] !== member.role;
                  return (
                    <div
                      key={member.id}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-lg transition group ${
                        isRemoved ? 'bg-red-50 opacity-60' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <div className="w-8 h-8 bg-gradient-to-br from-[#28B98F] to-[#03AD9A] rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-white text-xs font-bold">
                            {(member.display_name ?? '?').charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <span className={`text-sm font-medium truncate block ${isRemoved ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                            {member.display_name ?? 'Unknown'}
                          </span>
                          {isRemoved && <span className="text-xs text-red-500">Will be removed</span>}
                          {roleChanged && !isRemoved && (
                            <span className="text-xs text-amber-600">Role changed</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 flex-shrink-0">
                        {isOwner && !isRemoved ? (
                          <>
                            <select
                              value={effectiveRole(member)}
                              onChange={(e) => handleStageRoleChange(member.id, e.target.value as 'owner' | 'editor' | 'viewer')}
                              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-[#03AD9A] outline-none bg-white text-slate-700 cursor-pointer"
                            >
                              <option value="owner">Co-owner</option>
                              <option value="editor">Editor</option>
                              <option value="viewer">Viewer</option>
                            </select>
                            <button
                              onClick={() => handleStageRemoval(member.id)}
                              className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                              title="Remove member"
                            >
                              <UserMinus className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : isOwner && isRemoved ? (
                          <button
                            onClick={() => handleUndoRemoval(member.id)}
                            className="text-xs text-slate-500 hover:text-[#008192] underline transition"
                          >
                            Undo
                          </button>
                        ) : (
                          <span className={`text-xs px-2 py-1 rounded-full border font-medium ${getRoleBadgeClass(member.role)}`}>
                            {getRoleDisplayLabel(member.role)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Pending (to-be-added) members */}
                {pendingAdds.map((pending) => (
                  <div
                    key={pending.displayName}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-[#f0faf8] border border-[#d4f0ea]"
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="w-8 h-8 bg-gradient-to-br from-teal-400 to-emerald-400 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-xs font-bold">
                          {pending.displayName.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-slate-700 truncate block">{pending.displayName}</span>
                        <span className="text-xs text-[#008192]">Will be added</span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 flex-shrink-0">
                      <select
                        value={pending.role}
                        onChange={(e) => handleChangePendingRole(pending.displayName, e.target.value as 'owner' | 'editor' | 'viewer')}
                        className="text-xs border border-[#a8e0d6] rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-[#03AD9A] outline-none bg-white text-slate-700 cursor-pointer"
                      >
                        <option value="owner">Co-owner</option>
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <button
                        onClick={() => handleRemovePending(pending.displayName)}
                        className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                        title="Cancel add"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add member form */}
            {isOwner && (
              <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <p className="text-sm font-semibold text-slate-700 flex items-center space-x-2">
                  <UserPlus className="w-4 h-4 text-[#008192]" />
                  <span>Add Member</span>
                </p>
                {availableUsers.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">All registered users are already members.</p>
                ) : (
                  <>
                    <select
                      value={newMemberDisplayName}
                      onChange={(e) => setNewMemberDisplayName(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#03AD9A] focus:border-transparent outline-none bg-white text-slate-700 cursor-pointer"
                    >
                      <option value="">— Select a user —</option>
                      {availableUsers.map(u => (
                        <option key={u.id} value={u.display_name}>
                          {u.display_name}{u.role === 'admin' ? ' (admin)' : ''}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center space-x-2">
                      <select
                        value={newMemberRole}
                        onChange={(e) => setNewMemberRole(e.target.value as 'owner' | 'editor' | 'viewer')}
                        className="flex-1 text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#03AD9A] outline-none bg-white text-slate-700"
                      >
                        <option value="viewer">Viewer</option>
                        <option value="editor">Editor</option>
                        <option value="owner">Co-owner</option>
                      </select>
                      <button
                        onClick={handleAddToPending}
                        disabled={!newMemberDisplayName}
                        className="flex items-center space-x-1.5 px-4 py-2 bg-gradient-to-r from-[#008192] to-[#064B77] text-white text-sm font-medium rounded-lg hover:from-[#064B77] hover:to-[#1D275A] transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <UserPlus className="w-4 h-4" />
                        <span>Add</span>
                      </button>
                    </div>
                    <p className="text-xs text-slate-400">
                      Viewer — read only &nbsp;·&nbsp; Editor — upload & run checks &nbsp;·&nbsp; Co-owner — full control
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Save / Discard bar ── */}
        {hasChanges && (
          <div className="flex-shrink-0 border-t border-slate-200 bg-white px-6 py-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-amber-600 font-medium flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                You have unsaved changes
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleDiscard}
                disabled={isSaving}
                className="flex items-center space-x-1.5 px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition disabled:opacity-50 font-medium"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Discard</span>
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-gradient-to-r from-[#008192] to-[#064B77] text-white text-sm font-medium rounded-lg hover:from-[#064B77] hover:to-[#1D275A] transition disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
