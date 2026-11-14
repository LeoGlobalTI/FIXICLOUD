import React, { useState } from 'react';
import { Database, KeyRound, LogIn, ShieldCheck, User } from 'lucide-react';
import type {
  AppUser,
  AuthSessionUser,
  Branch,
  SupabaseConfig,
  Tenant,
} from '../types/erp';
import { isSupabaseLive, loginWithAppUsers } from '../services/supabaseService';
import { AlertBanner } from './ui/AlertBanner';

interface LoginScreenProps {
  supabaseConfig: SupabaseConfig;
  appUsers: AppUser[];
  tenants: Tenant[];
  branches: Branch[];
  onAuthSuccess: (user: AuthSessionUser) => void;
  onOpenSupabaseModal: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  supabaseConfig,
  appUsers,
  tenants,
  branches,
  onAuthSuccess,
  onOpenSupabaseModal,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const liveMode = isSupabaseLive(supabaseConfig);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanUsername = username.trim();
    const cleanPassword = password.trim();

    if (!cleanUsername || !cleanPassword) {
      setErrorMsg('Ingresa tu usuario y contraseña / PIN para continuar.');
      return;
    }

    if (liveMode) {
      setLoading(true);
      const res = await loginWithAppUsers(supabaseConfig, cleanUsername, cleanPassword);
      setLoading(false);
      if (!res.ok || !res.user) {
        setErrorMsg(
          res.error ?? 'Usuario o contraseña/PIN incorrectos, o cuenta inactiva.'
        );
        return;
      }
      onAuthSuccess(res.user);
      return;
    }

    // Demo Local Mode: validate against local appUsers mirror
    const matched = appUsers.find(
      (u) =>
        u.username.trim().toLowerCase() === cleanUsername.toLowerCase() &&
        u.pin_or_password.trim() === cleanPassword &&
        u.is_active
    );

    if (!matched) {
      setErrorMsg('Usuario o contraseña/PIN incorrectos, o cuenta inactiva.');
      return;
    }

    const matchedTenant = matched.tenant_id
      ? tenants.find((t) => t.id === matched.tenant_id) ?? null
      : null;
    const matchedBranch = matched.branch_id
      ? branches.find((b) => b.id === matched.branch_id) ?? null
      : null;

    onAuthSuccess({
      id: matched.id,
      username: matched.username,
      full_name: matched.full_name,
      tenant_id: matched.tenant_id,
      branch_id: matched.branch_id,
      role: matched.role,
      is_active: matched.is_active,
      mode: 'demo',
      tenant: matchedTenant,
      branch: matchedBranch,
    });
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
            FIXICLOUD
          </h1>
          <p className="text-xs text-[#D8E4EC]/80">
            Cloud Technical Service &amp; Repair ERP
          </p>
          <div className="pt-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium text-[#D8E4EC]">
              <ShieldCheck className="h-3.5 w-3.5 text-[#6EE7D8]" />
              {liveMode ? 'Conectado a Supabase' : 'Modo Demo Local (Seguridad Activa)'}
            </span>
          </div>
        </div>

        {/* Login Form Body */}
        <div className="p-6 space-y-5">
          {errorMsg && (
            <AlertBanner
              variant="error"
              message={errorMsg}
              onDismiss={() => setErrorMsg(null)}
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
                {loading ? 'Verificando credenciales...' : 'Ingresar a FIXICLOUD'}
              </span>
            </button>
          </form>

          <div className="border-t border-[#D8E4EC] pt-4 text-center">
            <button
              type="button"
              onClick={onOpenSupabaseModal}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0A2463] hover:underline"
            >
              <Database className="h-3.5 w-3.5 text-[#3E92CC]" />
              <span>Configurar Conexión Base de Datos Supabase</span>
            </button>
          </div>
        </div>
      </div>

      <footer className="mt-6 text-center text-xs text-slate-500">
        FIXICLOUD Enterprise ERP · Acceso Restringido y Protegido por Credenciales
      </footer>
    </div>
  );
};
