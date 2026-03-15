import { useState, useEffect } from 'react';
import { useUser } from '../contexts/UserContext';
import { apiClient } from '../lib/api-client';
import type { AppUser } from '../types/database';

export default function LoginPage() {
  const { login, isLoggingIn, loginError } = useUser();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selectedId, setSelectedId] = useState('');

  useEffect(() => {
    apiClient.getAllUsers()
      .then((data) => setUsers((data || []) as AppUser[]))
      .catch(() => {/* show empty state */})
      .finally(() => setLoadingUsers(false));
  }, []);

  async function handleSubmit() {
    const user = users.find(u => u.id === selectedId);
    if (!user || isLoggingIn) return;
    await login(user.display_name);
  }

  const selectedUser = users.find(u => u.id === selectedId) ?? null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Header banner */}
          <div className="bg-gradient-to-r from-teal-700 via-teal-600 to-emerald-500 px-8 py-8 text-center">
            <div className="w-14 h-14 bg-white rounded-xl flex items-center justify-center mx-auto mb-4 shadow-md overflow-hidden">
              <img src="/dataqualityplus.png" alt="Quality Plus" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-xl font-bold text-white">Quality Plus</h1>
            <p className="text-teal-100 text-sm mt-1">AEM Energy Solutions</p>
          </div>

          {/* Form */}
          <div className="px-8 py-8">
            <p className="text-slate-700 font-semibold text-base mb-1">Select your account</p>
            <p className="text-slate-400 text-sm mb-6">
              Choose your name to continue. New accounts are created by an admin.
            </p>

            {/* Loading state */}
            {loadingUsers && (
              <div className="flex items-center justify-center py-6">
                <div className="w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {/* No users registered yet */}
            {!loadingUsers && users.length === 0 && (
              <div className="text-center py-6 text-slate-400 bg-slate-50 rounded-xl border border-slate-200 mb-4">
                <p className="text-sm font-medium">No accounts registered yet</p>
                <p className="text-xs mt-1">An admin needs to register users first</p>
              </div>
            )}

            {/* User select dropdown */}
            {!loadingUsers && users.length > 0 && (
              <>
                <div className="relative mb-4">
                  <select
                    value={selectedId}
                    onChange={(e) => setSelectedId(e.target.value)}
                    disabled={isLoggingIn}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition appearance-none bg-white text-slate-700 disabled:opacity-50 cursor-pointer"
                  >
                    <option value="">— Select your name —</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.display_name}{u.role === 'admin' ? ' (admin)' : ''}
                      </option>
                    ))}
                  </select>
                  {/* Dropdown chevron */}
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {/* Selected user preview */}
                {selectedUser && (
                  <div className="flex items-center space-x-3 px-3 py-2.5 bg-teal-50 border border-teal-100 rounded-xl mb-4">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      selectedUser.role === 'admin'
                        ? 'bg-gradient-to-br from-purple-500 to-purple-600'
                        : 'bg-gradient-to-br from-teal-500 to-emerald-500'
                    }`}>
                      <span className="text-white text-sm font-bold">
                        {selectedUser.display_name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-700">{selectedUser.display_name}</p>
                      <p className="text-xs text-slate-400 capitalize">{selectedUser.role}</p>
                    </div>
                  </div>
                )}
              </>
            )}

            {loginError && (
              <p className="text-red-500 text-xs mb-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {loginError}
              </p>
            )}

            <button
              onClick={handleSubmit}
              disabled={!selectedId || isLoggingIn || loadingUsers}
              className="w-full py-3 bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-semibold rounded-xl hover:from-teal-700 hover:to-emerald-700 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {isLoggingIn ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Connecting...</span>
                </>
              ) : (
                <span>Enter App</span>
              )}
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          Contact your admin if your name is not listed.
        </p>
      </div>
    </div>
  );
}
