import { useRef, useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import DimensionConfig from './pages/DimensionConfig';
import GuidePage from './pages/GuidePage';
import ProjectView from './pages/ProjectView';
import AdminPage from './pages/AdminPage';
import SystemOverviewPage from './pages/SystemOverviewPage';
import LoginPage from './pages/LoginPage';
import { useUser } from './contexts/UserContext';
import { LayoutGrid, Settings, LogOut, Shield, ChevronDown, BookOpen, Cpu } from 'lucide-react';

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user } = useUser();
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AppShell() {
  const { user, logout } = useUser();
  const navigate = useNavigate();
  const location = useLocation();
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

  const currentPage = location.pathname.split('/')[1] || 'dashboard';

  return (
    <div id="app-zoom-root" className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col">
      <header className="text-white shadow-lg" style={{ background: 'linear-gradient(to right, #1D275A, #28B98F)' }}>
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center space-x-3 hover:opacity-80 transition"
            >
              <div className="w-10 h-10 rounded overflow-hidden flex items-center justify-center">
                <img src="/dataqualityplus.png" alt="Quality Plus" className="w-full h-full object-contain" />
              </div>
              <div className="text-left">
                <h1 className="text-xl font-bold">Quality Plus</h1>
                <p className="text-xs text-white/70">AEM ENERGY SOLUTIONS</p>
              </div>
            </button>

            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen((o) => !o)}
                className="flex items-center space-x-2 bg-white/10 hover:bg-white/20 rounded-xl px-3 py-2 transition"
              >
                <div className="w-7 h-7 bg-white rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-[#03AD9A] font-bold text-sm">
                    {user!.displayName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <span className="text-sm font-medium text-white">{user!.displayName}</span>
                <ChevronDown className={`w-4 h-4 text-white/70 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-slate-100 overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <p className="text-xs text-slate-400">Signed in as</p>
                    <p className="text-sm font-semibold text-slate-800 truncate">{user!.displayName}</p>
                  </div>
                  <button
                    onClick={() => { navigate('/admin'); setUserMenuOpen(false); }}
                    className={`w-full flex items-center space-x-2 px-4 py-2.5 text-sm transition ${
                      currentPage === 'admin'
                        ? 'bg-[#f0faf8] text-[#008192] font-medium'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Shield className="w-4 h-4" />
                    <span>Admin Panel</span>
                  </button>
                  {user!.role === 'admin' && (
                    <button
                      onClick={() => { navigate('/system'); setUserMenuOpen(false); }}
                      className={`w-full flex items-center space-x-2 px-4 py-2.5 text-sm transition ${
                        currentPage === 'system'
                          ? 'bg-[#f0faf8] text-[#008192] font-medium'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Cpu className="w-4 h-4" />
                      <span>System Overview</span>
                    </button>
                  )}
                  <div className="border-t border-slate-100">
                    <button
                      onClick={() => { navigate('/dashboard'); setUserMenuOpen(false); logout(); }}
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

      <nav className="shadow-md" style={{ background: 'linear-gradient(to right, #008192, #064B77)' }}>
        <div className="container mx-auto px-6">
          <div className="flex items-center space-x-1">
            <button
              onClick={() => navigate('/dashboard')}
              className={`flex items-center space-x-2 px-4 py-3 transition border-b-2 ${
                currentPage === 'dashboard'
                  ? 'border-[#03AD9A] text-white bg-[#008192]/30'
                  : 'border-transparent text-slate-200 hover:text-white hover:bg-[#064B77]/20'
              }`}
            >
              <LayoutGrid className="w-5 h-5" />
              <span className="font-medium">Dashboard</span>
            </button>
            <button
              onClick={() => navigate('/quality-rules')}
              className={`flex items-center space-x-2 px-4 py-3 transition border-b-2 ${
                currentPage === 'quality-rules'
                  ? 'border-[#03AD9A] text-white bg-[#008192]/30'
                  : 'border-transparent text-slate-200 hover:text-white hover:bg-[#064B77]/20'
              }`}
            >
              <Settings className="w-5 h-5" />
              <span className="font-medium">Quality Rules</span>
            </button>
            <button
              onClick={() => navigate('/guide')}
              className={`flex items-center space-x-2 px-4 py-3 transition border-b-2 ${
                currentPage === 'guide'
                  ? 'border-[#03AD9A] text-white bg-[#008192]/30'
                  : 'border-transparent text-slate-200 hover:text-white hover:bg-[#064B77]/20'
              }`}
            >
              <BookOpen className="w-5 h-5" />
              <span className="font-medium">Guide</span>
            </button>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-6 py-8 flex-1">
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/projects/:projectId" element={<ProjectView />} />
          <Route path="/quality-rules" element={<DimensionConfig />} />
          <Route path="/guide" element={<GuidePage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/system" element={
            <ProtectedRoute adminOnly>
              <SystemOverviewPage />
            </ProtectedRoute>
          } />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  const { user } = useUser();

  if (!user) return <LoginPage />;

  return <AppShell />;
}
