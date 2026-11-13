import React, { useState } from 'react';
import { Building2, LogIn, ShieldCheck, UserPlus, X } from 'lucide-react';
import type {
  AuthSessionUser,
  Branch,
  IndustrySector,
  SupabaseConfig,
  TeamProfile,
  Tenant,
} from '../types/erp';
import { SECTOR_LABELS } from '../utils/erpLogic';
import {
  isSupabaseLive,
  signInWithSupabaseAuth,
  signUpAndRegisterTenantInSupabase,
} from '../services/supabaseService';
import { SEED_ERP_STATE } from '../data/seedData';
import { AlertBanner } from './ui/AlertBanner';

interface AuthModalProps {
  supabaseConfig: SupabaseConfig;
  profiles: TeamProfile[];
  tenants: Tenant[];
  onAuthSuccess: (payload: {
    user: AuthSessionUser;
    newTenant?: Tenant;
    newBranch?: Branch;
    newProfile?: TeamProfile;
  }) => void;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  supabaseConfig,
  profiles,
  tenants,
  onAuthSuccess,
  onClose,
}) => {
  const [tab, setTab] = useState<'signin' | 'signup'>('signin');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sign In fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Sign Up + Onboarding fields
  const [fullName, setFullName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [sector, setSector] = useState<IndustrySector>('computing');
  const [hqName, setHqName] = useState('Casa Matriz');

  const liveMode = isSupabaseLive(supabaseConfig);
  const tenantMap = new Map(tenants.map((t) => [t.id, t]));

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (liveMode) {
      setLoading(true);
      const res = await signInWithSupabaseAuth(supabaseConfig, loginEmail, loginPassword);
      setLoading(false);
      if (!res.ok || !res.user) {
        setErrorMsg(res.error ?? 'No se pudo iniciar sesión en Supabase Auth.');
        return;
      }
      onAuthSuccess({ user: res.user });
      return;
    }

    // Demo Mode lookup against local profiles
    const found = profiles.find(
      (p) => p.email.toLowerCase() === loginEmail.trim().toLowerCase() && p.active
    );
    if (!found) {
      setErrorMsg(
        'No encontramos ese correo en los perfiles locales. Usa un acceso rápido de prueba o crea tu empresa en "Crear Empresa SaaS".'
      );
      return;
    }

    onAuthSuccess({
      user: {
        id: found.id,
        email: found.email,
        full_name: found.full_name,
        tenant_id: found.tenant_id,
        branch_id: found.branch_id,
        role: found.role,
        mode: 'demo',
      },
    });
  };

  const handleQuickDemoLogin = (prof: TeamProfile) => {
    onAuthSuccess({
      user: {
        id: prof.id,
        email: prof.email,
        full_name: prof.full_name,
        tenant_id: prof.tenant_id,
        branch_id: prof.branch_id,
        role: prof.role,
        mode: 'demo',
      },
    });
  };

  const handleSignUpOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!fullName.trim() || !signupEmail.trim() || !companyName.trim()) {
      setErrorMsg('Completa tu nombre, correo y nombre de empresa.');
      return;
    }

    if (liveMode) {
      if (signupPassword.length < 6) {
        setErrorMsg('La contraseña debe tener al menos 6 caracteres en Supabase Auth.');
        return;
      }
      setLoading(true);
      const res = await signUpAndRegisterTenantInSupabase(supabaseConfig, {
        fullName,
        email: signupEmail,
        password: signupPassword,
        companyName,
        taxId,
        sector,
        hqName,
      });
      setLoading(false);
      if (!res.ok || !res.user) {
        setErrorMsg(res.error ?? 'Error creando cuenta y empresa en Supabase.');
        return;
      }
      onAuthSuccess({
        user: res.user,
        newTenant: res.tenant,
        newBranch: res.branch,
        newProfile: res.profile,
      });
      return;
    }

    // Demo Mode onboarding: creates Tenant + HQ Branch + Admin Profile locally
    const now = new Date().toISOString();
    const tenantId = `tenant-${Date.now()}`;
    const branchId = `branch-${Date.now()}`;
    const profileId = `prof-${Date.now()}`;

    const newTenant: Tenant = {
      id: tenantId,
      name: companyName.trim(),
      tax_id: taxId.trim() || '76.000.000-0',
      sector,
      currency: 'CLP',
      iva_rate: 19,
      folio_prefix: companyName.trim().slice(0, 2).toUpperCase() || 'OT',
      whatsapp_enabled: true,
      whatsapp_templates: SEED_ERP_STATE.tenants[0].whatsapp_templates,
      phone: '',
      email: signupEmail.trim(),
      warranty_days: 90,
      created_at: now,
    };

    const newBranch: Branch = {
      id: branchId,
      tenant_id: tenantId,
      name: hqName.trim() || 'Casa Matriz',
      code: 'HQ-01',
      is_hq: true,
      address: 'Dirección principal por definir',
      city: 'Santiago',
      phone: '',
      business_hours: 'Lun-Vie 09:00 - 18:30',
    };

    const newProfile: TeamProfile = {
      id: profileId,
      tenant_id: tenantId,
      branch_id: null,
      full_name: fullName.trim(),
      email: signupEmail.trim(),
      role: 'admin',
      active: true,
      created_at: now,
    };

    onAuthSuccess({
      user: {
        id: profileId,
        email: signupEmail.trim(),
        full_name: fullName.trim(),
        tenant_id: tenantId,
        branch_id: null,
        role: 'admin',
        mode: 'demo',
      },
      newTenant,
      newBranch,
      newProfile,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A2463]/45 backdrop-blur-[2px] p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="bg-[#0A2463] text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-5 w-5 text-[#3E92CC]" />
            <div>
              <h2 id="auth-modal-title" className="text-sm font-semibold">
                Acceso y Registro SaaS — FIXICLOUD
              </h2>
              <p className="text-[11px] text-[#D8E4EC]/80">
                {liveMode
                  ? 'Conectado a Supabase Auth + Registro Multiempresa en vivo'
                  : 'Modo Demo Local activo (simula sesiones y onboarding al instante)'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar acceso SaaS"
            className="rounded-lg p-1 text-white/70 hover:bg-[#1E3A8A] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-2 border-b border-[#D8E4EC] bg-[#F4F6FB]">
          <button
            type="button"
            onClick={() => {
              setTab('signin');
              setErrorMsg(null);
            }}
            className={`py-2.5 px-4 text-xs font-semibold inline-flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
              tab === 'signin'
                ? 'border-[#3E92CC] text-[#0A2463] bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <LogIn className="h-3.5 w-3.5" />
            <span>Iniciar Sesión</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('signup');
              setErrorMsg(null);
            }}
            className={`py-2.5 px-4 text-xs font-semibold inline-flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
              tab === 'signup'
                ? 'border-[#3E92CC] text-[#0A2463] bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span>Crear Empresa SaaS</span>
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

          {tab === 'signin' ? (
            <div className="space-y-4">
              <form onSubmit={handleSignIn} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Correo Electrónico
                  </label>
                  <input
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="admin@globaltech.cl"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Contraseña
                  </label>
                  <input
                    type="password"
                    required={liveMode}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder={liveMode ? '••••••••' : 'Opcional en Modo Demo'}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-[#0A2463] hover:bg-[#1E3A8A] disabled:opacity-50 text-white py-2.5 text-xs font-semibold transition-colors"
                >
                  {loading
                    ? 'Verificando credenciales...'
                    : liveMode
                    ? 'Ingresar con Supabase Auth'
                    : 'Ingresar al Taller'}
                </button>
              </form>

              {!liveMode && profiles.length > 0 && (
                <div className="border-t border-slate-200 pt-3 space-y-2">
                  <div className="text-[11px] font-bold text-slate-600">
                    Accesos rápidos de prueba (Modo Demo Local):
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {profiles
                      .filter((p) => p.active)
                      .slice(0, 4)
                      .map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handleQuickDemoLogin(p)}
                          className="text-left rounded-lg border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 px-3 py-2"
                        >
                          <div className="text-xs font-bold text-slate-900 truncate">
                            {p.full_name}
                          </div>
                          <div className="text-[10px] font-mono text-slate-500 truncate">
                            {p.email}
                          </div>
                          <div className="mt-0.5 text-[10px] font-semibold text-blue-700">
                            {p.role === 'admin'
                              ? 'Admin de Taller'
                              : p.role === 'technician'
                              ? 'Técnico'
                              : p.role === 'receptionist'
                              ? 'Recepcionista'
                              : 'SuperAdmin'}{' '}
                            · {tenantMap.get(p.tenant_id)?.name ?? 'Empresa'}
                          </div>
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleSignUpOnboarding} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nombre Completo del Administrador *
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Ej: Javier Morales"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Correo Corporativo *
                  </label>
                  <input
                    type="email"
                    required
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    placeholder="javier@miempresa.cl"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Contraseña {liveMode ? '*' : '(Demo)'}
                  </label>
                  <input
                    type="password"
                    required={liveMode}
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    placeholder="Mín. 6 caracteres"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="border-t border-slate-200 pt-3 space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                  <Building2 className="h-3.5 w-3.5 text-blue-600" />
                  <span>Datos de la Nueva Empresa y Casa Matriz</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nombre de la Empresa *
                    </label>
                    <input
                      type="text"
                      required
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Ej: ElectroFix Norte SpA"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      RUT / ID Tributario
                    </label>
                    <input
                      type="text"
                      value={taxId}
                      onChange={(e) => setTaxId(e.target.value)}
                      placeholder="77.456.789-2"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Rubro Principal
                    </label>
                    <select
                      value={sector}
                      onChange={(e) => setSector(e.target.value as IndustrySector)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-600 focus:outline-none"
                    >
                      {(Object.keys(SECTOR_LABELS) as IndustrySector[]).map((sec) => (
                        <option key={sec} value={sec}>
                          {SECTOR_LABELS[sec]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nombre de su Casa Matriz
                    </label>
                    <input
                      type="text"
                      required
                      value={hqName}
                      onChange={(e) => setHqName(e.target.value)}
                      placeholder="Casa Matriz Antofagasta"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-[#1B998B] hover:bg-[#157A6E] disabled:opacity-50 text-white py-2.5 text-xs font-semibold transition-colors"
              >
                {loading
                  ? 'Creando empresa y sucursal...'
                  : 'Registrar Empresa y Entrar al ERP'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
