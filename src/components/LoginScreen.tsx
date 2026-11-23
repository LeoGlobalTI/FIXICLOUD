import React, { useState } from 'react';
import { KeyRound, LogIn, User } from 'lucide-react';
import type {
  AppUser,
  AuthSessionUser,
  Branch,
  SupabaseConfig,
  Tenant,
} from '../types/erp';
import { authenticateUser } from '../utils/authHelper';
import { AlertBanner } from './ui/AlertBanner';

interface LoginScreenProps {
  supabaseConfig: SupabaseConfig;
  appUsers: AppUser[];
  tenants: Tenant[];
  branches: Branch[];
  initialNotice?: string | null;
  onDismissNotice?: () => void;
  onAuthSuccess: (user: AuthSessionUser) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  supabaseConfig,
  appUsers,
  tenants,
  branches,
  initialNotice,
  onDismissNotice,
  onAuthSuccess,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);
    const res = await authenticateUser({
      supabaseConfig,
      appUsers,
      tenants,
      branches,
      username,
      password,
    });
    setLoading(false);
    if (!res.ok) {
      setErrorMsg(res.error);
      return;
    }
    onAuthSuccess(res.user);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F4F6FB] px-4 py-8 text-slate-900">
      <div className="w-full max-w-md rounded-2xl bg-white border border-[#D8E4EC] shadow-xl overflow-hidden">
        {/* Header Branding */}
        <div className="bg-[#0A2463] text-white p-6 text-center space-y-2">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20 text-white mb-1">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-7 w-7"
              aria-hidden="true"
            >
              <path
                d="M4 7.5L12 3L20 7.5V16.5L12 21L4 16.5V7.5Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <path
                d="M9 12L11.2 14.2L15.5 9.8"
                stroke="#1B998B"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1 className="font-display text-xl font-bold tracking-tight">
            FixiCloud
          </h1>
          <p className="text-xs text-[#D8E4EC]/80">
            Gestión de Servicio Técnico en la Nube
          </p>
        </div>

        {/* Login Form Body */}
        <div className="p-6 space-y-5">
          {(errorMsg || initialNotice) && (
            <AlertBanner
              variant={errorMsg ? 'error' : 'warning'}
              message={errorMsg ?? initialNotice ?? ''}
              onDismiss={() => {
                if (errorMsg) setErrorMsg(null);
                else onDismissNotice?.();
              }}
            />
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="login-username"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Usuario (username)
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  id="login-username"
                  type="text"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Ej: admin, carolina, diego"
                  className="w-full rounded-xl border border-[#D8E4EC] bg-[#F4F6FB] pl-10 pr-3 py-2.5 text-xs font-mono text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Contraseña / PIN (pin_or_password)
              </label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                  className="w-full rounded-xl border border-[#D8E4EC] bg-[#F4F6FB] pl-10 pr-3 py-2.5 text-xs font-mono text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#0A2463] hover:bg-[#1E3A8A] disabled:opacity-50 text-white py-3 text-xs font-semibold transition-colors shadow-sm"
            >
              <LogIn className="h-4 w-4" />
              <span>
                {loading ? 'Verificando credenciales...' : 'Ingresar a FixiCloud'}
              </span>
            </button>
          </form>
        </div>
      </div>

      <footer className="mt-6 text-center text-xs text-slate-500 space-y-1">
        <div>FixiCloud Enterprise · Acceso Restringido y Protegido por Credenciales</div>
        <div>
          Desarrollado por{' '}
          <a
            href="https://www.gtitech.cl"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[#3E92CC] hover:underline"
          >
            Global TI SPA
          </a>
        </div>
      </footer>
    </div>
  );
};
