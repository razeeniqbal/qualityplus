import { useState, useEffect } from 'react';
import { Shield, Trash2, X, ChevronRight, FolderOpen, UserPlus } from 'lucide-react';
import { apiClient } from '../lib/api-client';
import type { AppUser } from '../types/database';
import { useUser } from '../contexts/UserContext';

type Membership = {
  role: 'owner' | 'editor' | 'viewer';
  project_id: string;
  projects: { id: string; name: string } | null;
};

function getRoleBadgeClass(role: 'owner' | 'editor' | 'viewer') {
  switch (role) {
    case 'owner':  return 'bg-purple-100 text-purple-700 border-purple-300';
    case 'editor': return 'bg-blue-100 text-blue-700 border-blue-300';
    case 'viewer': return 'bg-slate-100 text-slate-700 border-slate-300';
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return formatDate(iso);
}

export default function AdminPage() {
  const { user: currentUser } = useUser();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loadingMemberships, setLoadingMemberships] = useState(false);
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [newUserName, setNewUserName] = useState('');
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [createUserError, setCreateUserError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    apiClient.getAllUsers()
      .then((data) => setUsers((data || []) as AppUser[]))
      .catch((err) => console.error('Failed to load users:', err))
      .finally(() => setLoading(false));
  }, []);

  async function handleRoleChange(userId: string, role: 'admin' | 'user') {
    setUpdatingRoleId(userId);
    try {
      await apiClient.updateUserRole(userId, role);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u));
      if (selectedUser?.id === userId) {
        setSelectedUser(prev => prev ? { ...prev, role } : prev);
      }
    } catch (err) {
      console.error('Failed to update role:', err);
      alert('Failed to update role. Please try again.');
    } finally {
      setUpdatingRoleId(null);
    }
  }

  async function handleDelete(userId: string, displayName: string) {
    if (!confirm(`Remove user "${displayName}" from the system?`)) return;
    setDeletingId(userId);
    try {
      await apiClient.deleteUser(userId);
      setUsers(prev => prev.filter(u => u.id !== userId));
      if (selectedUser?.id === userId) setSelectedUser(null);
    } catch (err) {
      console.error('Failed to delete user:', err);
      alert('Failed to delete user. Please try again.');
    } finally {
      setDeletingId(null);
    }
  }

  async function openUserDrawer(appUser: AppUser) {
    setSelectedUser(appUser);
    setLoadingMemberships(true);
    setMemberships([]);
    try {
      const data = await apiClient.getUserMemberships(appUser.display_name);
      setMemberships(data);
    } catch (err) {
      console.error('Failed to load memberships:', err);
    } finally {
      setLoadingMemberships(false);
    }
  }

  async function handleCreateUser() {
    const name = newUserName.trim();
    if (!name || isCreatingUser) return;
    setIsCreatingUser(true);
    setCreateUserError(null);
    try {
      const created = await apiClient.createUser(name);
      setUsers(prev => [...prev, created as AppUser]);
      setNewUserName('');
    } catch (err) {
      setCreateUserError(
        err instanceof Error && err.message.includes('unique')
          ? `"${name}" is already registered.`
          : 'Failed to register user. Please try again.'
      );
    } finally {
      setIsCreatingUser(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Page header */}
      <div className="flex items-center space-x-3 mb-8">
        <div className="w-10 h-10 bg-gradient-to-br from-[#28B98F] to-[#03AD9A] rounded-xl flex items-center justify-center">
          <Shield className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">User Management</h1>
          <p className="text-sm text-slate-500">View and manage all registered users</p>
        </div>
      </div>

      {/* Register new user — admin only */}
      {currentUser?.role === 'admin' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 px-6 py-5 mb-6">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center space-x-2">
            <UserPlus className="w-4 h-4 text-[#28B98F]" />
            <span>Register New User</span>
          </p>
          <div className="flex items-center space-x-3">
            <input
              type="text"
              placeholder="Display name"
              value={newUserName}
              onChange={(e) => { setNewUserName(e.target.value); setCreateUserError(null); }}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateUser()}
              disabled={isCreatingUser}
              className="flex-1 px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-[#03AD9A] focus:border-transparent outline-none transition disabled:opacity-50"
            />
            <button
              onClick={handleCreateUser}
              disabled={!newUserName.trim() || isCreatingUser}
              className="flex items-center space-x-2 px-5 py-2.5 bg-gradient-to-r from-[#008192] to-[#064B77] text-white text-sm font-semibold rounded-xl hover:from-[#064B77] hover:to-[#1D275A] transition disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
            >
              {isCreatingUser ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <UserPlus className="w-4 h-4" />
              )}
              <span>Register</span>
            </button>
          </div>
          {createUserError && (
            <p className="text-red-500 text-xs mt-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {createUserError}
            </p>
          )}
        </div>
      )}

      {/* Users table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 px-6 py-3 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-400 uppercase tracking-wider">
          <span>User</span>
          <span>Role</span>
          <span>Joined</span>
          <span>Last Seen</span>
          <span className="w-8" />
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="divide-y divide-slate-100">
            {[1, 2, 3].map(i => (
              <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 px-6 py-4 items-center animate-pulse">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 bg-slate-200 rounded-full" />
                  <div className="h-4 bg-slate-200 rounded w-32" />
                </div>
                <div className="h-4 bg-slate-200 rounded w-16" />
                <div className="h-4 bg-slate-200 rounded w-20" />
                <div className="h-4 bg-slate-200 rounded w-16" />
                <div className="w-8" />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && users.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <Shield className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="font-medium">No users yet</p>
            <p className="text-sm mt-1">Users will appear here once they log in</p>
          </div>
        )}

        {/* Rows */}
        {!loading && users.length > 0 && (
          <div className="divide-y divide-slate-100">
            {users.map((appUser) => (
              <div
                key={appUser.id}
                className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 px-6 py-4 items-center hover:bg-slate-50 transition cursor-pointer group"
                onClick={() => openUserDrawer(appUser)}
              >
                {/* Avatar + name */}
                <div className="flex items-center space-x-3 min-w-0">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                    appUser.role === 'admin'
                      ? 'bg-gradient-to-br from-purple-500 to-purple-600'
                      : 'bg-gradient-to-br from-[#28B98F] to-[#03AD9A]'
                  }`}>
                    <span className="text-white text-sm font-bold">
                      {appUser.display_name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm font-semibold text-slate-700 truncate block">
                      {appUser.display_name}
                    </span>
                    {appUser.id === currentUser?.id && (
                      <span className="text-xs text-[#008192] font-medium">You</span>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-400 flex-shrink-0 ml-auto" />
                </div>

                {/* Role selector */}
                <div onClick={(e) => e.stopPropagation()}>
                  {currentUser?.role === 'admin' ? (
                    <select
                      value={appUser.role}
                      onChange={(e) => handleRoleChange(appUser.id, e.target.value as 'admin' | 'user')}
                      disabled={updatingRoleId === appUser.id}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-[#03AD9A] outline-none bg-white text-slate-700 disabled:opacity-50 cursor-pointer"
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  ) : (
                    <span className={`text-xs px-2 py-1 rounded-full border font-medium capitalize ${
                      appUser.role === 'admin'
                        ? 'bg-purple-100 text-purple-700 border-purple-300'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}>
                      {appUser.role}
                    </span>
                  )}
                </div>

                {/* Joined */}
                <span className="text-sm text-slate-500">{formatDate(appUser.created_at)}</span>

                {/* Last seen */}
                <span className="text-sm text-slate-500">{formatRelative(appUser.last_seen_at)}</span>

                {/* Delete */}
                <div onClick={(e) => e.stopPropagation()}>
                  {currentUser?.role === 'admin' && (
                    <button
                      onClick={() => handleDelete(appUser.id, appUser.display_name)}
                      disabled={deletingId === appUser.id}
                      className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
                      title="Delete user"
                    >
                      {deletingId === appUser.id ? (
                        <div className="w-4 h-4 border border-slate-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Summary */}
      {!loading && users.length > 0 && (
        <p className="text-xs text-slate-400 mt-3 text-right">
          {users.length} user{users.length !== 1 ? 's' : ''} registered
          &nbsp;·&nbsp; {users.filter(u => u.role === 'admin').length} admin{users.filter(u => u.role === 'admin').length !== 1 ? 's' : ''}
        </p>
      )}

      {/* User detail drawer */}
      {selectedUser && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setSelectedUser(null)} />
          <div
            className="fixed inset-y-0 right-0 w-full max-w-sm bg-white shadow-2xl z-50 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
              <div className="flex items-center space-x-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  selectedUser.role === 'admin'
                    ? 'bg-gradient-to-br from-purple-500 to-purple-600'
                    : 'bg-gradient-to-br from-[#28B98F] to-[#03AD9A]'
                }`}>
                  <span className="text-white font-bold">
                    {selectedUser.display_name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-800">{selectedUser.display_name}</h2>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                    selectedUser.role === 'admin'
                      ? 'bg-purple-100 text-purple-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                    {selectedUser.role}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                className="p-2 hover:bg-slate-100 rounded-lg transition"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {/* Drawer body */}
            <div className="flex-1 overflow-y-auto">
              {/* User info */}
              <div className="px-6 py-5 border-b border-slate-100 space-y-2">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Account Info</p>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Joined</span>
                  <span className="text-slate-700 font-medium">{formatDate(selectedUser.created_at)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Last seen</span>
                  <span className="text-slate-700 font-medium">{formatRelative(selectedUser.last_seen_at)}</span>
                </div>
                <div className="flex justify-between text-sm items-center">
                  <span className="text-slate-500">Role</span>
                  {currentUser?.role === 'admin' ? (
                    <select
                      value={selectedUser.role}
                      onChange={(e) => handleRoleChange(selectedUser.id, e.target.value as 'admin' | 'user')}
                      disabled={updatingRoleId === selectedUser.id}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1 focus:ring-1 focus:ring-[#03AD9A] outline-none bg-white text-slate-700 disabled:opacity-50"
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  ) : (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                      selectedUser.role === 'admin'
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {selectedUser.role}
                    </span>
                  )}
                </div>
              </div>

              {/* Project memberships */}
              <div className="px-6 py-5">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
                  Project Memberships
                </p>

                {loadingMemberships && (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin w-6 h-6 border-2 border-[#03AD9A] border-t-transparent rounded-full" />
                  </div>
                )}

                {!loadingMemberships && memberships.length === 0 && (
                  <div className="text-center py-8 text-slate-400">
                    <FolderOpen className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                    <p className="text-sm">No project memberships</p>
                  </div>
                )}

                {!loadingMemberships && memberships.length > 0 && (
                  <div className="space-y-2">
                    {memberships.map((m) => (
                      <div
                        key={m.project_id}
                        className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-100"
                      >
                        <div className="flex items-center space-x-2 min-w-0">
                          <FolderOpen className="w-4 h-4 text-slate-400 flex-shrink-0" />
                          <span className="text-sm text-slate-700 truncate font-medium">
                            {m.projects?.name ?? 'Unknown project'}
                          </span>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize flex-shrink-0 ml-2 ${getRoleBadgeClass(m.role)}`}>
                          {m.role}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Drawer footer — danger zone (admin only) */}
            {currentUser?.role === 'admin' && (
              <div className="px-6 py-4 border-t border-slate-200 flex-shrink-0">
                <button
                  onClick={() => {
                    setSelectedUser(null);
                    handleDelete(selectedUser.id, selectedUser.display_name);
                  }}
                  disabled={deletingId === selectedUser.id}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 border border-red-200 text-red-500 hover:bg-red-50 rounded-xl transition text-sm font-medium disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete this user</span>
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
