import { useState, useRef, useEffect } from 'react';
import Dashboard from './pages/Dashboard';
import DimensionConfig from './pages/DimensionConfig';
import GuidePage from './pages/GuidePage';
import ProjectView from './pages/ProjectView';
import AdminPage from './pages/AdminPage';
import SystemOverviewPage from './pages/SystemOverviewPage';
import LoginPage from './pages/LoginPage';
import { useUser } from './contexts/UserContext';
import { LayoutGrid, Settings, LogOut, Shield, ChevronDown, BookOpen, Cpu } from 'lucide-react';

type Page = 'dashboard' | 'config' | 'guide' | 'records' | 'admin' | 'system';

function AppContent() {
  const { user, logout } = useUser();
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) return <LoginPage />;

  function navigateToRecords(projectId: string) {
    setSelectedProjectId(projectId);
    setCurrentPage('records');
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col">
      <header className="bg-gradient-to-r from-teal-700 via-teal-600 to-emerald-500 text-white shadow-lg">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => { setCurrentPage('dashboard'); setSelectedProjectId(null); }}
              className="flex items-center space-x-3 hover:opacity-80 transition"
            >
              <div className="w-10 h-10 rounded overflow-hidden flex items-center justify-center">
                <img src="/dataqualityplus.png" alt="Quality Plus" className="w-full h-full object-contain" />
              </div>
              <div className="text-left">
                <h1 className="text-xl font-bold">Quality Plus</h1>
                <p className="text-xs text-teal-100">AEM ENERGY SOLUTIONS</p>
              </div>
            </button>

            {/* User menu */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen((o) => !o)}
                className="flex items-center space-x-2 bg-white/10 hover:bg-white/20 rounded-xl px-3 py-2 transition"
              >
                <div className="w-7 h-7 bg-white rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-teal-700 font-bold text-sm">
                    {user.displayName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <span className="text-sm font-medium text-white">{user.displayName}</span>
                <ChevronDown className={`w-4 h-4 text-teal-100 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-slate-100 overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <p className="text-xs text-slate-400">Signed in as</p>
                    <p className="text-sm font-semibold text-slate-800 truncate">{user.displayName}</p>
                  </div>
                  <button
                    onClick={() => { setCurrentPage('admin'); setUserMenuOpen(false); }}
                    className={`w-full flex items-center space-x-2 px-4 py-2.5 text-sm transition ${
                      currentPage === 'admin'
                        ? 'bg-teal-50 text-teal-700 font-medium'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Shield className="w-4 h-4" />
                    <span>Admin Panel</span>
                  </button>
                  {user.role === 'admin' && (
                    <button
                      onClick={() => { setCurrentPage('system'); setUserMenuOpen(false); }}
                      className={`w-full flex items-center space-x-2 px-4 py-2.5 text-sm transition ${
                        currentPage === 'system'
                          ? 'bg-teal-50 text-teal-700 font-medium'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Cpu className="w-4 h-4" />
                      <span>System Overview</span>
                    </button>
                  )}
                  <div className="border-t border-slate-100">
                    <button
                      onClick={() => { setCurrentPage('dashboard'); setSelectedProjectId(null); setUserMenuOpen(false); logout(); }}
                      className="w-full flex items-center space-x-2 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Sign out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <nav className="bg-gradient-to-r from-slate-700 to-slate-600 shadow-md">
        <div className="container mx-auto px-6">
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setCurrentPage('dashboard')}
              className={`flex items-center space-x-2 px-4 py-3 transition border-b-2 ${
                currentPage === 'dashboard'
                  ? 'border-teal-400 text-white bg-slate-600'
                  : 'border-transparent text-slate-300 hover:text-white hover:bg-slate-600'
              }`}
            >
              <LayoutGrid className="w-5 h-5" />
              <span className="font-medium">Dashboard</span>
            </button>
            <button
              onClick={() => setCurrentPage('config')}
              className={`flex items-center space-x-2 px-4 py-3 transition border-b-2 ${
                currentPage === 'config'
                  ? 'border-teal-400 text-white bg-slate-600'
                  : 'border-transparent text-slate-300 hover:text-white hover:bg-slate-600'
              }`}
            >
              <Settings className="w-5 h-5" />
              <span className="font-medium">Rules Settings</span>
            </button>
            <button
              onClick={() => setCurrentPage('guide')}
              className={`flex items-center space-x-2 px-4 py-3 transition border-b-2 ${
                currentPage === 'guide'
                  ? 'border-teal-400 text-white bg-slate-600'
                  : 'border-transparent text-slate-300 hover:text-white hover:bg-slate-600'
              }`}
            >
              <BookOpen className="w-5 h-5" />
              <span className="font-medium">Guide</span>
            </button>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-6 py-8 flex-1">
        {currentPage === 'dashboard' && (
          <Dashboard
            onNavigateToRecords={navigateToRecords}
          />
        )}
        {currentPage === 'config' && <DimensionConfig />}
        {currentPage === 'guide' && <GuidePage />}
        {currentPage === 'records' && selectedProjectId && (
          <ProjectView
            projectId={selectedProjectId}
            initialTab="records"
            onBack={() => setCurrentPage('dashboard')}
          />
        )}
        {currentPage === 'admin' && <AdminPage />}
        {currentPage === 'system' && user.role === 'admin' && <SystemOverviewPage />}
      </main>
    </div>
  );
}

export default AppContent;
