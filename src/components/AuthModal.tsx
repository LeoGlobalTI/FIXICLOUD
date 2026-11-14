import React, { useState } from 'react';
import { KeyRound, LogIn, ShieldCheck, User, X } from 'lucide-react';
import type {
  AppUser,
  AuthSessionUser,
  Branch,
  SupabaseConfig,
  Tenant,
} from '../types/erp';
import { isSupabaseLive, loginWithAppUsers } from '../services/supabaseService';
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

  const liveMode = isSupabaseLive(supabaseConfig);

  const handleQuickSuperAdminFill = () => {
    setUsername('admin');
    setPassword('123456');
    setErrorMsg(null);
  };

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
                Iniciar Sesión — FIXICLOUD
              </h2>
              <p className="text-[11px] text-[#D8E4EC]/80">
                {liveMode
                  ? 'Autenticación directa contra public.app_users en Supabase'
                  : 'Modo Demo Local activo (usuarios locales de prueba)'}
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
                {loading ? 'Verificando credenciales...' : 'Ingresar a FIXICLOUD'}
              </span>
            </button>
          </form>

          <div className="border-t border-[#D8E4EC] pt-3.5 space-y-2.5">
            <button
              type="button"
              onClick={handleQuickSuperAdminFill}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#3E92CC]/40 bg-[#EBF4FA] hover:bg-[#3E92CC]/15 text-[#0A2463] py-2 px-3 text-xs font-semibold transition-colors"
            >
              <span>⚡ Acceso Rápido SuperAdmin</span>
            </button>

            {!liveMode && appUsers.length > 0 && (
              <div className="rounded-xl bg-[#F4F6FB] border border-[#D8E4EC] p-3 space-y-1.5">
                <div className="text-[11px] font-semibold text-slate-600">
                  Usuarios Demo disponibles (clic para autocompletar):
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {appUsers
                    .filter((u) => u.is_active)
                    .slice(0, 5)
                    .map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setUsername(u.username);
                          setPassword(u.pin_or_password);
                          setErrorMsg(null);
                        }}
                        className="rounded-lg border border-[#D8E4EC] bg-white hover:border-[#3E92CC] px-2 py-1 text-[11px] font-mono text-slate-700 transition-colors"
                      >
                        @{u.username}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
