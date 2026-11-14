import React, { useState } from 'react';
import {
  Building2,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Database,
  ExternalLink,
  KeyRound,
  LogIn,
  Package,
  ShieldCheck,
  User,
  Zap,
} from 'lucide-react';
import type {
  AppUser,
  AuthSessionUser,
  Branch,
  SupabaseConfig,
  Tenant,
} from '../types/erp';
import { isSupabaseLive, loginWithAppUsers } from '../services/supabaseService';
import { AlertBanner } from './ui/AlertBanner';

interface LandingWelcomeViewProps {
  supabaseConfig: SupabaseConfig;
  appUsers: AppUser[];
  tenants: Tenant[];
  branches: Branch[];
  onAuthSuccess: (user: AuthSessionUser) => void;
  onOpenSupabaseModal: () => void;
  onOpenPublicTrack: () => void;
}

export const LandingWelcomeView: React.FC<LandingWelcomeViewProps> = ({
  supabaseConfig,
  appUsers,
  tenants,
  branches,
  onAuthSuccess,
  onOpenSupabaseModal,
  onOpenPublicTrack,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const liveMode = isSupabaseLive(supabaseConfig);
  const tenantMap = new Map(tenants.map((t) => [t.id, t]));

  const handleQuickSuperAdminFill = () => {
    setUsername('admin');
    setPassword('123456');
    setErrorMsg(null);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanUser = username.trim();
    const cleanPass = password.trim();

    if (!cleanUser || !cleanPass) {
      setErrorMsg('Por favor ingresa tu usuario y contraseña o PIN.');
      return;
    }

    if (liveMode) {
      setLoading(true);
      const res = await loginWithAppUsers(supabaseConfig, cleanUser, cleanPass);
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

    // Demo Local lookup against appUsers
    const matched = appUsers.find(
      (u) =>
        u.username.trim().toLowerCase() === cleanUser.toLowerCase() &&
        u.pin_or_password.trim() === cleanPass &&
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

  const handleQuickDemoSelect = (u: AppUser) => {
    setUsername(u.username);
    setPassword(u.pin_or_password);
    setErrorMsg(null);
  };

  const handleExploreAsAdmin = () => {
    const adminUser = appUsers.find((u) => u.role === 'admin' || u.role === 'superadmin') ?? appUsers[0];
    if (!adminUser) return;
    const matchedTenant = adminUser.tenant_id
      ? tenants.find((t) => t.id === adminUser.tenant_id) ?? null
      : null;
    const matchedBranch = adminUser.branch_id
      ? branches.find((b) => b.id === adminUser.branch_id) ?? null
      : null;

    onAuthSuccess({
      id: adminUser.id,
      username: adminUser.username,
      full_name: adminUser.full_name,
      tenant_id: adminUser.tenant_id,
      branch_id: adminUser.branch_id,
      role: adminUser.role,
      is_active: adminUser.is_active,
      mode: liveMode ? 'supabase' : 'demo',
      tenant: matchedTenant,
      branch: matchedBranch,
    });
  };

  return (
    <div className="min-h-screen bg-[#F4F6FB] text-slate-900 flex flex-col justify-between">
      {/* Top Header Bar */}
      <header className="bg-white border-b border-[#D8E4EC] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0A2463] text-white shadow-md">
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
              <path
                d="M4 7.5L12 3L20 7.5V16.5L12 21L4 16.5V7.5Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <path
                d="M9 12L11.2 14.2L15.5 9.8"
                stroke="#1B998B"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div>
            <div className="font-display text-lg font-bold tracking-tight text-[#0A2463]">
              FIXICLOUD
            </div>
            <div className="text-xs text-slate-500 font-medium">
              Cloud Technical Service &amp; Repair ERP
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenPublicTrack}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#D8E4EC] bg-white hover:bg-[#F4F6FB] px-3.5 py-2 text-xs font-semibold text-[#0A2463] transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5 text-[#3E92CC]" />
            <span>Portal de Seguimiento (/track)</span>
          </button>

          <button
            type="button"
            onClick={onOpenSupabaseModal}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              liveMode
                ? 'bg-[#EBF8F6] border-[#1B998B]/40 text-[#1B998B]'
                : 'bg-[#EBF4FA] border-[#D8E4EC] text-[#0A2463]'
            }`}
          >
            <Database className="h-3.5 w-3.5 shrink-0" />
            <span>{liveMode ? 'Supabase Live' : 'Demo Local'}</span>
          </button>
        </div>
      </header>

      {/* Main Hero & Login Split Container */}
      <main className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Hero Pitch */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#3E92CC]/10 border border-[#3E92CC]/30 px-3.5 py-1 text-xs font-semibold text-[#0A2463]">
              <ShieldCheck className="h-3.5 w-3.5 text-[#3E92CC]" />
              <span>Plataforma SaaS Multiempresa y Multi-Sucursal</span>
            </div>

            <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-[#0A2463] leading-[1.15]">
              Gestión Integral para Talleres y Servicio Técnico
            </h1>

            <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
              Inspirado en la velocidad operativa clásica, rediseñado con arquitectura moderna en React, TypeScript y Tailwind CSS. Administra Casa Matriz y sucursales, consola de 3 zonas, stock híbrido, los 9 reportes originales <span className="font-mono font-semibold text-[#0A2463]">.rpt</span> con código QR, agenda de visitas a domicilio y migrador <span className="font-mono">.mdb</span>.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="rounded-2xl bg-white border border-[#D8E4EC]/80 p-4 space-y-1.5 shadow-sm">
                <div className="flex items-center gap-2 text-[#0A2463] font-semibold text-xs">
                  <ClipboardList className="h-4 w-4 text-[#3E92CC]" />
                  <span>Consola Operativa 3 Zonas</span>
                </div>
                <p className="text-xs text-slate-500">
                  Cliente/Equipo, Diagnóstico/Repuestos con IVA dinámico, y Fotos/Préstamos.
                </p>
              </div>

              <div className="rounded-2xl bg-white border border-[#D8E4EC]/80 p-4 space-y-1.5 shadow-sm">
                <div className="flex items-center gap-2 text-[#0A2463] font-semibold text-xs">
                  <Calendar className="h-4 w-4 text-[#1B998B]" />
                  <span>Agenda y Domicilios</span>
                </div>
                <p className="text-xs text-slate-500">
                  Programación de visitas técnicas y conversión directa a Órdenes de Servicio.
                </p>
              </div>

              <div className="rounded-2xl bg-white border border-[#D8E4EC]/80 p-4 space-y-1.5 shadow-sm">
                <div className="flex items-center gap-2 text-[#0A2463] font-semibold text-xs">
                  <Package className="h-4 w-4 text-[#3E92CC]" />
                  <span>Stock Híbrido &amp; Préstamos</span>
                </div>
                <p className="text-xs text-slate-500">
                  Control de repuestos, SKU, alertas de stock mínimo y equipos de respaldo en préstamo.
                </p>
              </div>

              <div className="rounded-2xl bg-white border border-[#D8E4EC]/80 p-4 space-y-1.5 shadow-sm">
                <div className="flex items-center gap-2 text-[#0A2463] font-semibold text-xs">
                  <CheckCircle2 className="h-4 w-4 text-[#1B998B]" />
                  <span>Centro de Impresión RPT</span>
                </div>
                <p className="text-xs text-slate-500">
                  9 formatos oficiales con MiniTicket QR y diseño doble media hoja para recepción.
                </p>
              </div>
            </div>

            <div className="pt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleExploreAsAdmin}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0A2463] hover:bg-[#1E3A8A] text-white px-5 py-3 text-xs font-bold shadow-md transition-colors"
              >
                <Zap className="h-4 w-4 text-[#3E92CC]" />
                <span>Entrar Directamente como Administrador</span>
              </button>

              <button
                type="button"
                onClick={onOpenPublicTrack}
                className="inline-flex items-center gap-2 rounded-xl border border-[#D8E4EC] bg-white hover:bg-slate-50 text-slate-700 px-4 py-3 text-xs font-semibold transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                <span>Probar Portal Cliente (/track)</span>
              </button>
            </div>
          </div>

          {/* Right Login Card */}
          <div className="lg:col-span-5">
            <div className="rounded-3xl bg-white border border-[#D8E4EC] shadow-xl p-6 sm:p-8 space-y-6">
              <div className="space-y-1.5 pb-4 border-b border-[#D8E4EC]">
                <h2 className="font-display text-lg font-bold text-[#0A2463]">
                  Ingreso al Sistema
                </h2>
                <p className="text-xs text-slate-500">
                  {liveMode
                    ? 'Conectado a Supabase (tabla public.app_users)'
                    : 'Modo Demo Local (autenticación instantánea sin servidor)'}
                </p>
              </div>

              {errorMsg && (
                <AlertBanner
                  variant="error"
                  message={errorMsg}
                  onDismiss={() => setErrorMsg(null)}
                />
              )}

              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="landing-username"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Usuario (username)
                  </label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      id="landing-username"
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
                    htmlFor="landing-password"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Contraseña / PIN
                  </label>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      id="landing-password"
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
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#1B998B] hover:bg-[#157A6E] disabled:opacity-50 text-white py-3 text-xs font-bold shadow-sm transition-colors"
                >
                  <LogIn className="h-4 w-4" />
                  <span>
                    {loading ? 'Verificando credenciales...' : 'Iniciar Sesión en FIXICLOUD'}
                  </span>
                </button>
              </form>

              <div className="border-t border-[#D8E4EC] pt-4 space-y-3">
                <button
                  type="button"
                  onClick={handleQuickSuperAdminFill}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#3E92CC]/40 bg-[#EBF4FA] hover:bg-[#3E92CC]/15 text-[#0A2463] py-2.5 px-3 text-xs font-semibold transition-colors"
                >
                  <span>⚡ Acceso Rápido SuperAdmin</span>
                </button>

                {appUsers.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-bold text-slate-600">
                      Cuentas de prueba disponibles (clic para autocompletar):
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {appUsers
                        .filter((u) => u.is_active)
                        .map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => handleQuickDemoSelect(u)}
                            className="text-left rounded-xl border border-[#D8E4EC] bg-[#F4F6FB] hover:bg-white hover:border-[#3E92CC] p-2.5 transition-colors"
                          >
                            <div className="text-xs font-bold text-slate-900 truncate">
                              {u.full_name.split(' ')[0]}
                            </div>
                            <div className="text-[10px] font-mono text-slate-500 truncate">
                              @{u.username}
                            </div>
                            <div className="mt-1 text-[10px] font-semibold text-blue-700 truncate">
                              {u.role === 'superadmin'
                                ? 'SuperAdmin'
                                : u.role === 'admin'
                                ? 'Admin'
                                : u.role === 'technician'
                                ? 'Técnico'
                                : 'Recepcionista'}
                              {u.tenant_id
                                ? ` · ${tenantMap.get(u.tenant_id)?.name.slice(0, 12) ?? ''}`
                                : ''}
                            </div>
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-[#D8E4EC] px-6 py-4 text-center text-xs text-slate-500 flex flex-wrap items-center justify-between gap-3">
        <div>
          FIXICLOUD Enterprise ERP · Arquitectura Multiempresa &amp; Sucursales
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onOpenSupabaseModal}
            className="hover:text-slate-900 transition-colors"
          >
            Configuración de Base de Datos
          </button>
          <span>·</span>
          <button
            type="button"
            onClick={onOpenPublicTrack}
            className="hover:text-slate-900 transition-colors"
          >
            Portal del Cliente
          </button>
        </div>
      </footer>
    </div>
  );
};
