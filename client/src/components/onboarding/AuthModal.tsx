import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, ArrowLeft, ArrowRight, Sparkles, AlertCircle } from 'lucide-react';
import { api } from '../../api';

interface AuthModalProps {
  initialMode: 'signup' | 'login';
  onBack: () => void;
  onAuthSuccess: (user: { id: number; email: string; displayName: string | null; isOnboarded: boolean }) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ initialMode, onBack, onAuthSuccess }) => {
  const [mode, setMode] = useState<'signup' | 'login'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !email.includes('@')) {
      setError('Please provide a valid email address.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signup') {
        const res = await api.register({
          email: email.trim(),
          password,
          displayName: displayName.trim() || undefined,
        });
        localStorage.setItem('mf_auth_token', res.token);
        localStorage.setItem('mf_user_email', res.user.email);
        onAuthSuccess(res.user);
      } else {
        const res = await api.login({
          email: email.trim(),
          password,
        });
        localStorage.setItem('mf_auth_token', res.token);
        localStorage.setItem('mf_user_email', res.user.email);
        if ((res.user as any).onboardingData) {
          localStorage.setItem('mf_user_onboarding_' + res.user.email.trim().toLowerCase(), JSON.stringify((res.user as any).onboardingData));
        }
        onAuthSuccess(res.user);
      }
    } catch (err: any) {
      setError(err?.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0E0F12] text-white flex flex-col justify-between p-6 max-w-md mx-auto selection:bg-[#FF8660]/30 animate-in fade-in duration-200">
      {/* Top Bar with Back Arrow */}
      <div>
        <div className="flex items-center justify-between pt-4 pb-6">
          <button
            onClick={onBack}
            className="p-2 -ml-2 rounded-full text-gray-400 hover:text-white hover:bg-[#18191E] transition-all flex items-center gap-1.5 text-xs font-semibold"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
          <div className="flex items-center gap-1.5 text-xs text-[#8E8E93] font-mono">
            <Sparkles className="w-3.5 h-3.5 text-[#FF8660]" />
            <span>MacroFactor Auth</span>
          </div>
        </div>

        {/* Header */}
        <div className="space-y-1.5 mt-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-white">
            {mode === 'signup' ? 'Create Your Account' : 'Welcome Back'}
          </h1>
          <p className="text-xs text-[#8E8E93] leading-relaxed">
            {mode === 'signup'
              ? 'Sign up with your email to start your personalized nutrition coaching.'
              : 'Log in with your email and password to access your targets.'}
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mt-4 p-3 rounded-xl bg-[#DE5B5D]/15 border border-[#DE5B5D]/30 flex items-start gap-2.5 text-xs text-red-200 animate-in fade-in duration-150">
            <AlertCircle className="w-4 h-4 text-[#DE5B5D] shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Existing Database Account Quick-Login Banner */}
        {mode === 'login' && (
          <div className="mt-4 bg-[#18191E] border border-[#272930] rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#FF8660]" />
                Existing Database Profile
              </span>
              <span className="text-[10px] font-semibold bg-[#43AA71]/15 text-[#43AA71] px-2 py-0.5 rounded-full border border-[#43AA71]/30">
                Ready to Access
              </span>
            </div>
            <p className="text-xs text-[#8E8E93] leading-relaxed">
              To access your restored or seeded database records, log in with the pre-configured credentials:
            </p>
            <div className="bg-[#0E0F12] border border-[#24262E] rounded-xl p-2.5 flex items-center justify-between text-xs font-mono">
              <div>
                <div className="text-white font-semibold">demo@macrofactor.app</div>
                <div className="text-gray-400 text-[11px]">password: <span className="text-[#FF8660]">password123</span></div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEmail('demo@macrofactor.app');
                  setPassword('password123');
                }}
                className="px-3 py-1.5 rounded-lg bg-[#FF8660]/15 hover:bg-[#FF8660]/25 text-[#FF8660] font-sans font-semibold text-xs border border-[#FF8660]/30 transition-all"
              >
                Autofill
              </button>
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={async () => {
                setEmail('demo@macrofactor.app');
                setPassword('password123');
                setLoading(true);
                setError(null);
                try {
                  const res = await api.login({
                    email: 'demo@macrofactor.app',
                    password: 'password123',
                  });
                  localStorage.setItem('mf_auth_token', res.token);
                  localStorage.setItem('mf_user_email', res.user.email);
                  localStorage.setItem('isOnboardingComplete', 'true');
                  onAuthSuccess(res.user);
                } catch (err: any) {
                  setError(err?.message || 'Failed to login with demo credentials.');
                } finally {
                  setLoading(false);
                }
              }}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#FF8660] to-[#E6532B] hover:opacity-95 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-md shadow-[#FF8660]/20"
            >
              <span>Instant Log In to Existing Account</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {mode === 'signup' && (
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-300">
                Display Name <span className="text-gray-500 font-normal">(Optional)</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="e.g. Alex"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-[#18191E] border border-[#24262E] focus:border-[#FF8660] rounded-xl px-3.5 py-3 text-sm text-white placeholder-gray-500 outline-none transition-all"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-300">
              Email Address
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-500">
                <Mail className="w-4 h-4" />
              </div>
              <input
                type="email"
                required
                autoComplete={mode === 'signup' ? 'email' : 'username'}
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#18191E] border border-[#24262E] focus:border-[#FF8660] rounded-xl pl-10 pr-3.5 py-3 text-sm text-white placeholder-gray-500 outline-none transition-all font-sans"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-300">
              Password <span className="text-gray-500 font-normal">(Min. 8 characters)</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-500">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#18191E] border border-[#24262E] focus:border-[#FF8660] rounded-xl pl-10 pr-10 py-3 text-sm text-white placeholder-gray-500 outline-none transition-all font-mono"
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-500 hover:text-gray-300 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {mode === 'signup' && (
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-300">
                Confirm Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-[#18191E] border border-[#24262E] focus:border-[#FF8660] rounded-xl pl-10 pr-3.5 py-3 text-sm text-white placeholder-gray-500 outline-none transition-all font-mono"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-4 py-3.5 rounded-full bg-gradient-to-r from-[#FF8660] to-[#E6532B] hover:opacity-95 active:scale-[0.99] transition-all text-white font-bold text-sm shadow-xl shadow-[#FF8660]/20 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>{mode === 'signup' ? 'Create Account & Begin Setup' : 'Log In to MacroFactor'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {mode === 'login' && (
            <div className="pt-1 text-center">
              <button
                type="button"
                onClick={() => {
                  setEmail('demo@macrofactor.app');
                  setPassword('password123');
                }}
                className="text-[11px] text-[#8E8E93] hover:text-[#FF8660] transition-colors underline"
              >
                Use Demo Account (demo@macrofactor.app)
              </button>
            </div>
          )}
        </form>
      </div>

      {/* Switch mode footer */}
      <footer className="pt-8 pb-4 text-center">
        {mode === 'signup' ? (
          <p className="text-xs text-[#8E8E93]">
            Already have an account?{' '}
            <button
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className="font-bold text-[#FF8660] hover:underline"
            >
              Log In
            </button>
          </p>
        ) : (
          <p className="text-xs text-[#8E8E93]">
            Don't have an account yet?{' '}
            <button
              onClick={() => {
                setMode('signup');
                setError(null);
              }}
              className="font-bold text-[#FF8660] hover:underline"
            >
              Create Account
            </button>
          </p>
        )}
      </footer>
    </div>
  );
};
