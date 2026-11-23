import React, { useState } from 'react';
import { KeyRound, LogIn, ShieldCheck, User, X } from 'lucide-react';
import type {
  AppUser,
  AuthSessionUser,
  Branch,
  SupabaseConfig,
  Tenant,
} from '../types/erp';
import { authenticateUser } from '../utils/authHelper';
import { AlertBanner } from './ui/AlertBanner';

interface AuthModalProps {
  supabaseConfig: SupabaseConfig;
  appUsers: AppUser[];
  tenants: Tenant[];
  branches: Branch[];
  onAuthSuccess: (user: AuthSessionUser) => void;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  supabaseConfig,
  appUsers,
  tenants,
  branches,
  onAuthSuccess,
  onClose,
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A2463]/50 backdrop-blur-[2px] p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white border border-[#D8E4EC]/80 shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="bg-[#0A2463] text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-5 w-5 text-[#3E92CC]" />
            <div>
              <h2 id="auth-modal-title" className="text-sm font-semibold">
                Iniciar Sesión — FixiCloud
              </h2>
              <p className="text-[11px] text-[#D8E4EC]/80">
                Autenticación de usuarios en Supabase
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar inicio de sesión"
            className="rounded-lg p-1 text-white/70 hover:bg-[#1E3A8A] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {errorMsg && (
            <AlertBanner
              variant="error"
              message={errorMsg}
              onDismiss={() => setErrorMsg(null)}
            />
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label
                htmlFor="login-username"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Usuario (username)
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  id="login-username"
                  type="text"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Ej: admin, carolina, diego"
                  className="w-full rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 pl-9 pr-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Contraseña / PIN (pin_or_password)
              </label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                  className="w-full rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 pl-9 pr-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#0A2463] hover:bg-[#1E3A8A] disabled:opacity-50 text-white py-2.5 text-xs font-semibold transition-colors"
            >
              <LogIn className="h-4 w-4" />
              <span>
                {loading ? 'Verificando credenciales...' : 'Ingresar a FixiCloud'}
              </span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
