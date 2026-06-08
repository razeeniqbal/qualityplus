import { useState } from 'react';
import { useUser } from '../contexts/UserContext';

type Mode = 'signin' | 'signup';

export default function LoginPage() {
  const { login, signUp, isLoggingIn, loginError } = useUser();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setInfoMessage(null);
  }

  async function handleSubmit() {
    if (isLoggingIn) return;
    setInfoMessage(null);

    if (mode === 'signin') {
      if (!email.trim() || !password) return;
      await login(email.trim(), password);
    } else {
      if (!email.trim() || !password || !displayName.trim()) return;
      const { needsEmailConfirmation } = await signUp(email.trim(), password, displayName.trim());
      if (needsEmailConfirmation) {
        setInfoMessage('Account created. Check your inbox to confirm your email, then sign in.');
      }
      // If no confirmation is needed, signUp already created a session and
      // onAuthStateChange will redirect to the dashboard automatically.
    }
  }

  const canSubmit =
    mode === 'signin'
      ? !!email.trim() && !!password
      : !!email.trim() && !!password && !!displayName.trim();

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
            <p className="text-[#d4f0ea] text-sm mt-1">AEM Energy Solutions</p>
          </div>

          {/* Form */}
          <div className="px-8 py-8">
            <p className="text-slate-700 font-semibold text-base mb-1">
              {mode === 'signin' ? 'Sign in to your account' : 'Create an account'}
            </p>
            <p className="text-slate-400 text-sm mb-6">
              {mode === 'signin'
                ? 'Enter your email and password to continue.'
                : 'Pick a display name and set a password to get started.'}
            </p>

            <div className="space-y-3 mb-4">
              {mode === 'signup' && (
                <input
                  type="text"
                  placeholder="Display name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  disabled={isLoggingIn}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-[#03AD9A] focus:border-transparent outline-none transition disabled:opacity-50"
                />
              )}
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                disabled={isLoggingIn}
                className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-[#03AD9A] focus:border-transparent outline-none transition disabled:opacity-50"
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                disabled={isLoggingIn}
                className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-[#03AD9A] focus:border-transparent outline-none transition disabled:opacity-50"
              />
            </div>

            {loginError && (
              <p className="text-red-500 text-xs mb-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {loginError}
              </p>
            )}

            {infoMessage && (
              <p className="text-emerald-600 text-xs mb-4 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                {infoMessage}
              </p>
            )}

            <button
              onClick={handleSubmit}
              disabled={!canSubmit || isLoggingIn}
              className="w-full py-3 bg-gradient-to-r from-[#008192] to-[#064B77] text-white font-semibold rounded-xl hover:from-[#064B77] hover:to-[#1D275A] transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {isLoggingIn ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>{mode === 'signin' ? 'Signing in...' : 'Creating account...'}</span>
                </>
              ) : (
                <span>{mode === 'signin' ? 'Sign In' : 'Create Account'}</span>
              )}
            </button>

            <p className="text-center text-sm text-slate-500 mt-5">
              {mode === 'signin' ? (
                <>
                  Don't have an account?{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('signup')}
                    className="text-[#008192] font-semibold hover:text-[#064B77] transition"
                  >
                    Create one
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('signin')}
                    className="text-[#008192] font-semibold hover:text-[#064B77] transition"
                  >
                    Sign in
                  </button>
                </>
              )}
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          Contact your admin if you need help accessing your account.
        </p>
      </div>
    </div>
  );
}
