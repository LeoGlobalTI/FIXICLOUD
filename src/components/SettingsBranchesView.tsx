import React, { useEffect, useState } from 'react';
import {
  Building2,
  KeyRound,
  MapPin,
  MessageCircle,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import type {
  AppUser,
  Branch,
  IndustrySector,
  RoleType,
  Tenant,
} from '../types/erp';
import { SECTOR_LABELS, getRolePermissions } from '../utils/erpLogic';
import { generateUUID } from '../utils/uuid';
import { AlertBanner } from './ui/AlertBanner';
import { ConfirmSuccessModal } from './ui/ConfirmSuccessModal';

interface SettingsBranchesViewProps {
  tenant: Tenant;
  branches: Branch[];
  appUsers: AppUser[];
  activeRole: RoleType;
  initialTab?: 'company' | 'users';
  onUpdateTenant: (tenant: Tenant) => void;
  onAddBranch: (branch: Branch) => void;
  onDeleteBranch: (branchId: string) => void;
  onAddAppUser: (user: AppUser) => Promise<{ ok: boolean; error?: string }>;
  onUpdateAppUser: (user: AppUser) => Promise<{ ok: boolean; error?: string }>;
}

export const SettingsBranchesView: React.FC<SettingsBranchesViewProps> = ({
  tenant,
  branches,
  appUsers,
  activeRole,
  initialTab = 'company',
  onUpdateTenant,
  onAddBranch,
  onDeleteBranch,
  onAddAppUser,
  onUpdateAppUser,
}) => {
  const perms = getRolePermissions(activeRole);
  const tenantBranches = branches.filter((b) => b.tenant_id === tenant.id);
  const visibleAppUsers = appUsers.filter(
    (u) => u.tenant_id === tenant.id || (activeRole === 'superadmin' && u.tenant_id === null)
  );

  const [tab, setTab] = useState<'company' | 'users'>(initialTab);
  const [createdUserInfo, setCreatedUserInfo] = useState<{
    fullName: string;
    username: string;
  } | null>(null);
  const [userError, setUserError] = useState<string | null>(null);
  const [savingUser, setSavingUser] = useState(false);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const [showNewBranch, setShowNewBranch] = useState(false);
  const [confirmDeleteBranchId, setConfirmDeleteBranchId] = useState<string | null>(null);
  const [bName, setBName] = useState('');
  const [bCode, setBCode] = useState('');
  const [bCity, setBCity] = useState('');
  const [bAddress, setBAddress] = useState('');
  const [bPhone, setBPhone] = useState('');
  const [bHours, setBHours] = useState('Lun-Vie 09:00 - 18:30');

  // New AppUser state (public.app_users)
  const [showNewUser, setShowNewUser] = useState(false);
  const [uFullName, setUFullName] = useState('');
  const [uUsername, setUUsername] = useState('');
  const [uPinOrPassword, setUPinOrPassword] = useState('');
  const [uRole, setURole] = useState<RoleType>('technician');
  const [uBranchId, setUBranchId] = useState<string>('');

  const handleCreateBranch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bName.trim()) return;
    onAddBranch({
      id: generateUUID(),
      tenant_id: tenant.id,
      name: bName.trim(),
      code: bCode.trim().toUpperCase() || `SUC-${tenantBranches.length + 1}`,
      is_hq: false,
      address: bAddress.trim(),
      city: bCity.trim() || 'Santiago',
      phone: bPhone.trim(),
      business_hours: bHours.trim(),
    });
    setBName('');
    setBCode('');
    setBCity('');
    setBAddress('');
    setBPhone('');
    setShowNewBranch(false);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserError(null);

    const cleanName = uFullName.trim();
    const cleanUsername = uUsername.trim();
    const cleanPassword = uPinOrPassword.trim();

    if (!cleanName || !cleanUsername || !cleanPassword) {
      setUserError('Completa nombre completo, usuario y contraseña / PIN.');
      return;
    }

    const duplicate = appUsers.some(
      (u) => u.username.trim().toLowerCase() === cleanUsername.toLowerCase()
    );
    if (duplicate) {
      setUserError(`El usuario "${cleanUsername}" ya existe en FIXICLOUD.`);
      return;
    }

    const newUser: AppUser = {
      id: generateUUID(),
      tenant_id: uRole === 'superadmin' ? null : tenant.id,
      branch_id: uRole === 'superadmin' ? null : uBranchId ? uBranchId : null,
      username: cleanUsername,
      pin_or_password: cleanPassword,
      full_name: cleanName,
      role: uRole,
      is_active: true,
      created_at: new Date().toISOString(),
    };

    setSavingUser(true);
    const res = await onAddAppUser(newUser);
    setSavingUser(false);

    if (!res.ok) {
      setUserError(res.error ?? 'No se pudo guardar el usuario en public.app_users.');
      return;
    }

    setUFullName('');
    setUUsername('');
    setUPinOrPassword('');
    setURole('technician');
    setUBranchId('');
    setShowNewUser(false);
    setCreatedUserInfo({ fullName: cleanName, username: cleanUsername });
  };

  const handleUpdateUser = async (nextUser: AppUser) => {
    setUserError(null);
    const res = await onUpdateAppUser(nextUser);
    if (!res.ok) {
      setUserError(res.error ?? 'No se pudo actualizar el usuario en public.app_users.');
    }
  };

  const branchMap = new Map(tenantBranches.map((b) => [b.id, b]));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-slate-900">
            Configuración y Usuarios
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Administra datos tributarios, IVA, Casa Matriz, sucursales, WhatsApp y credenciales de {tenant.name}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 bg-white border border-[#D8E4EC] p-1 rounded-xl shadow-sm">
          <button
            type="button"
            onClick={() => setTab('company')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              tab === 'company'
                ? 'bg-[#0A2463] text-white'
                : 'text-slate-600 hover:bg-[#F4F6FB] hover:text-slate-900'
            }`}
          >
            <Building2 className="h-3.5 w-3.5" />
            <span>Empresa, IVA y Sucursales</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('users')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              tab === 'users'
                ? 'bg-[#0A2463] text-white'
                : 'text-slate-600 hover:bg-[#F4F6FB] hover:text-slate-900'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>Gestión de Usuarios de FIXICLOUD ({visibleAppUsers.length})</span>
          </button>
        </div>
      </div>

      {tab === 'company' ? (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
            {/* Company & Tax Config */}
            <section className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm p-6 space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-[#D8E4EC]/70">
                <Building2 className="h-4 w-4 text-[#3E92CC]" />
                <h2 className="text-sm font-semibold text-slate-900">
                  Identidad Tributaria y Parámetros Operativos
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Razón Social / Nombre Comercial
                  </label>
                  <input
                    type="text"
                    value={tenant.name}
                    onChange={(e) => onUpdateTenant({ ...tenant, name: e.target.value })}
                    className="w-full rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    RUT / ID Tributario
                  </label>
                  <input
                    type="text"
                    value={tenant.tax_id}
                    onChange={(e) => onUpdateTenant({ ...tenant, tax_id: e.target.value })}
                    className="w-full rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Rubro del Taller
                  </label>
                  <select
                    value={tenant.sector}
                    onChange={(e) =>
                      onUpdateTenant({
                        ...tenant,
                        sector: e.target.value as IndustrySector,
                      })
                    }
                    className="w-full rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
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
                    Porcentaje IVA (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={35}
                    value={tenant.iva_rate}
                    onChange={(e) =>
                      onUpdateTenant({
                        ...tenant,
                        iva_rate: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="w-full rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Prefijo de Folios
                  </label>
                  <input
                    type="text"
                    value={tenant.folio_prefix}
                    onChange={(e) =>
                      onUpdateTenant({
                        ...tenant,
                        folio_prefix: e.target.value.toUpperCase(),
                      })
                    }
                    className="w-full rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Garantía estándar de taller (días)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={730}
                    value={tenant.warranty_days ?? 90}
                    onChange={(e) =>
                      onUpdateTenant({
                        ...tenant,
                        warranty_days: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="w-full rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Términos Legales para Comprobantes Impresos
                  </label>
                  <textarea
                    rows={3}
                    value={tenant.legal_terms ?? ''}
                    onChange={(e) =>
                      onUpdateTenant({
                        ...tenant,
                        legal_terms: e.target.value,
                      })
                    }
                    placeholder="Condiciones de diagnóstico, retiro, respaldo de datos y garantía impresas en Entrada.rpt / Salida.rpt..."
                    className="w-full rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                  />
                </div>
              </div>
            </section>

            {/* Master WhatsApp Switch & Templates */}
            <section className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-[#D8E4EC]/70">
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-[#1B998B]" />
                  <h2 className="text-sm font-semibold text-slate-900">
                    Notificaciones por WhatsApp
                  </h2>
                </div>

                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-semibold text-slate-600">
                    {tenant.whatsapp_enabled ? 'Activado' : 'Desactivado'}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={tenant.whatsapp_enabled}
                    aria-label="Activar o desactivar WhatsApp para toda la empresa"
                    onClick={() =>
                      onUpdateTenant({
                        ...tenant,
                        whatsapp_enabled: !tenant.whatsapp_enabled,
                      })
                    }
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                      tenant.whatsapp_enabled ? 'bg-[#1B998B]' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                        tenant.whatsapp_enabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <p className="text-xs text-slate-500">
                Variables disponibles:{' '}
                <span className="font-mono text-[#0A2463]">
                  {'{cliente} {folio} {equipo} {codigo} {url_seguimiento} {diagnostico} {total} {saldo} {sucursal} {horario}'}
                </span>
              </p>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    1. Comprobante de Ingreso
                  </label>
                  <textarea
                    rows={2}
                    value={tenant.whatsapp_templates.intake}
                    onChange={(e) =>
                      onUpdateTenant({
                        ...tenant,
                        whatsapp_templates: {
                          ...tenant.whatsapp_templates,
                          intake: e.target.value,
                        },
                      })
                    }
                    className="w-full rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    2. Presupuesto Listo para Aprobación
                  </label>
                  <textarea
                    rows={2}
                    value={tenant.whatsapp_templates.quote_ready}
                    onChange={(e) =>
                      onUpdateTenant({
                        ...tenant,
                        whatsapp_templates: {
                          ...tenant.whatsapp_templates,
                          quote_ready: e.target.value,
                        },
                      })
                    }
                    className="w-full rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    3. Equipo Listo para Retiro
                  </label>
                  <textarea
                    rows={2}
                    value={tenant.whatsapp_templates.ready_for_pickup}
                    onChange={(e) =>
                      onUpdateTenant({
                        ...tenant,
                        whatsapp_templates: {
                          ...tenant.whatsapp_templates,
                          ready_for_pickup: e.target.value,
                        },
                      })
                    }
                    className="w-full rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                  />
                </div>
              </div>
            </section>
          </div>

          {/* Branches Section */}
          <section className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#D8E4EC]/70">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-[#3E92CC]" />
                <h2 className="text-sm font-semibold text-slate-900">
                  Casa Matriz y Sucursales ({tenantBranches.length})
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowNewBranch((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#3E92CC] hover:bg-[#3178A8] text-white px-3.5 py-2 text-xs font-semibold transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Agregar Sucursal</span>
              </button>
            </div>

            {showNewBranch && (
              <form
                onSubmit={handleCreateBranch}
                className="rounded-2xl bg-[#F4F6FB] border border-[#D8E4EC] p-4 space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    type="text"
                    required
                    value={bName}
                    onChange={(e) => setBName(e.target.value)}
                    placeholder="Nombre sucursal (Ej: Sucursal Viña) *"
                    className="rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#3E92CC] focus:outline-none transition-colors"
                  />
                  <input
                    type="text"
                    value={bCode}
                    onChange={(e) => setBCode(e.target.value)}
                    placeholder="Código (Ej: SUC-VNA)"
                    className="rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs font-mono text-slate-900 focus:border-[#3E92CC] focus:outline-none transition-colors"
                  />
                  <input
                    type="text"
                    value={bCity}
                    onChange={(e) => setBCity(e.target.value)}
                    placeholder="Ciudad"
                    className="rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#3E92CC] focus:outline-none transition-colors"
                  />
                  <input
                    type="text"
                    value={bAddress}
                    onChange={(e) => setBAddress(e.target.value)}
                    placeholder="Dirección comercial"
                    className="rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#3E92CC] focus:outline-none transition-colors"
                  />
                  <input
                    type="text"
                    value={bPhone}
                    onChange={(e) => setBPhone(e.target.value)}
                    placeholder="Teléfono"
                    className="rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs font-mono text-slate-900 focus:border-[#3E92CC] focus:outline-none transition-colors"
                  />
                  <input
                    type="text"
                    value={bHours}
                    onChange={(e) => setBHours(e.target.value)}
                    placeholder="Horario atención"
                    className="rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#3E92CC] focus:outline-none transition-colors"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowNewBranch(false)}
                    className="rounded-xl border border-[#D8E4EC] bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-[#F4F6FB] transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl bg-[#3E92CC] hover:bg-[#3178A8] px-4 py-2 text-xs font-semibold text-white transition-colors"
                  >
                    Crear Sucursal
                  </button>
                </div>
              </form>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {tenantBranches.map((b) => (
                <div
                  key={b.id}
                  className="rounded-2xl border border-[#D8E4EC]/70 bg-[#F4F6FB]/60 p-4 space-y-2 flex flex-col justify-between"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-[#0A2463]">
                        {b.code}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                          b.is_hq
                            ? 'bg-[#EBF4FA] text-[#3E92CC] border border-[#3E92CC]/25'
                            : 'bg-white text-slate-600 border border-[#D8E4EC]'
                        }`}
                      >
                        {b.is_hq ? 'Casa Matriz [HQ]' : 'Sucursal'}
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-slate-900">{b.name}</div>
                    <div className="text-xs text-slate-600">
                      {b.address} · {b.city}
                    </div>
                    <div className="font-mono text-[11px] text-slate-500">{b.phone}</div>
                    <div className="text-[11px] text-slate-500">{b.business_hours}</div>
                  </div>

                  {!b.is_hq && perms.canDeleteBranch && (
                    <div className="pt-2.5 mt-2 border-t border-[#D8E4EC]/70 flex justify-end">
                      {confirmDeleteBranchId === b.id ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteBranchId(null)}
                            className="text-[11px] font-semibold text-slate-600 hover:text-slate-900"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteBranch(b.id);
                              setConfirmDeleteBranchId(null);
                            }}
                            className="rounded-lg bg-[#D64545] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-red-700 transition-colors"
                          >
                            Confirmar
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteBranchId(b.id)}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#D64545] hover:underline"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>Eliminar Sucursal</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </>
      ) : (
        /* Gestión de Usuarios de FIXICLOUD (public.app_users) */
        <section className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#D8E4EC]/70">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Gestión de Usuarios de FIXICLOUD ({visibleAppUsers.length})
              </h2>
              <p className="text-xs text-slate-500">
                Crea y administra cuentas directas en <span className="font-mono">public.app_users</span> con acceso por usuario y PIN/contraseña.
              </p>
            </div>
            {perms.canManageUsers && (
              <button
                type="button"
                onClick={() => {
                  setUserError(null);
                  setShowNewUser((v) => !v);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#3E92CC] hover:bg-[#3178A8] text-white px-3.5 py-2 text-xs font-semibold transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Nuevo Usuario</span>
              </button>
            )}
          </div>

          {userError && (
            <AlertBanner
              variant="error"
              message={userError}
              onDismiss={() => setUserError(null)}
            />
          )}

          {showNewUser && perms.canManageUsers && (
            <form
              onSubmit={handleCreateUser}
              className="rounded-2xl bg-[#F4F6FB] border border-[#D8E4EC] p-4 space-y-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Nombre completo *
                  </label>
                  <input
                    type="text"
                    required
                    value={uFullName}
                    onChange={(e) => setUFullName(e.target.value)}
                    placeholder="Ej: Martín Soto"
                    className="w-full rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs text-slate-800 focus:border-[#3E92CC] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Usuario (username) *
                  </label>
                  <input
                    type="text"
                    required
                    value={uUsername}
                    onChange={(e) => setUUsername(e.target.value)}
                    placeholder="Ej: msoto"
                    className="w-full rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs font-mono text-slate-800 focus:border-[#3E92CC] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Contraseña / PIN *
                  </label>
                  <input
                    type="text"
                    required
                    value={uPinOrPassword}
                    onChange={(e) => setUPinOrPassword(e.target.value)}
                    placeholder="Ej: 1234"
                    className="w-full rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs font-mono text-slate-800 focus:border-[#3E92CC] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Rol Operativo
                  </label>
                  <select
                    aria-label="Rol del nuevo usuario"
                    value={uRole}
                    onChange={(e) => setURole(e.target.value as RoleType)}
                    className="w-full rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs text-slate-800 focus:border-[#3E92CC] focus:outline-none"
                  >
                    <option value="technician">technician (Técnico)</option>
                    <option value="receptionist">receptionist (Recepcionista)</option>
                    <option value="admin">company_admin (Admin de Taller)</option>
                    {activeRole === 'superadmin' && (
                      <option value="superadmin">superadmin (Global)</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Sucursal Asignada
                  </label>
                  <select
                    aria-label="Sucursal del nuevo usuario"
                    value={uBranchId}
                    disabled={uRole === 'superadmin'}
                    onChange={(e) => setUBranchId(e.target.value)}
                    className="w-full rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs text-slate-800 disabled:bg-slate-100 focus:border-[#3E92CC] focus:outline-none"
                  >
                    <option value="">Global (Casa Matriz / Todas)</option>
                    {tenantBranches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewUser(false)}
                  className="rounded-xl border border-[#D8E4EC] bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-[#F4F6FB]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingUser}
                  className="rounded-xl bg-[#3E92CC] hover:bg-[#3178A8] disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white transition-colors"
                >
                  {savingUser ? 'Guardando...' : 'Guardar en app_users'}
                </button>
              </div>
            </form>
          )}

          <div className="overflow-x-auto rounded-2xl border border-[#D8E4EC]/70">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F4F6FB]/70 border-b border-[#D8E4EC]/70 text-[11px] font-semibold text-slate-500">
                  <th className="py-3 px-4">Nombre</th>
                  <th className="py-3 px-4">Usuario</th>
                  <th className="py-3 px-4">PIN / Clave</th>
                  <th className="py-3 px-4">Rol Operativo</th>
                  <th className="py-3 px-4">Sucursal Asignada</th>
                  <th className="py-3 px-4 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D8E4EC]/50">
                {visibleAppUsers.map((usr) => (
                  <tr key={usr.id} className="hover:bg-[#F4F6FB]/70 transition-colors">
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {usr.full_name}
                    </td>
                    <td className="py-3 px-4 font-mono text-[#0A2463] font-semibold">
                      @{usr.username}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">
                      <span className="inline-flex items-center gap-1 rounded-lg bg-[#F4F6FB] border border-[#D8E4EC] px-2 py-0.5 text-[11px]">
                        <KeyRound className="h-3 w-3 text-[#3E92CC]" />
                        <span>{usr.pin_or_password}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {perms.canManageUsers ? (
                        <select
                          aria-label={`Rol de ${usr.full_name}`}
                          value={usr.role}
                          onChange={(e) =>
                            void handleUpdateUser({
                              ...usr,
                              role: e.target.value as RoleType,
                            })
                          }
                          className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/60 px-2.5 py-1 text-xs text-slate-800 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                        >
                          <option value="technician">technician</option>
                          <option value="receptionist">receptionist</option>
                          <option value="admin">company_admin</option>
                          {activeRole === 'superadmin' && (
                            <option value="superadmin">superadmin</option>
                          )}
                        </select>
                      ) : (
                        <span className="font-medium text-slate-700">
                          {usr.role === 'admin' ? 'company_admin' : usr.role}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {usr.role === 'superadmin' || usr.tenant_id === null ? (
                        <span className="text-[11px] font-semibold text-[#0A2463]">
                          Global Multiempresa (null)
                        </span>
                      ) : perms.canManageUsers ? (
                        <select
                          aria-label={`Sucursal de ${usr.full_name}`}
                          value={usr.branch_id ?? ''}
                          onChange={(e) =>
                            void handleUpdateUser({
                              ...usr,
                              branch_id: e.target.value ? e.target.value : null,
                            })
                          }
                          className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/60 px-2.5 py-1 text-xs text-slate-800 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                        >
                          <option value="">Global empresa (Todas)</option>
                          {tenantBranches.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span>
                          {usr.branch_id
                            ? branchMap.get(usr.branch_id)?.name ?? 'Sucursal'
                            : 'Global empresa (Todas)'}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        disabled={!perms.canManageUsers}
                        onClick={() =>
                          void handleUpdateUser({
                            ...usr,
                            is_active: !usr.is_active,
                          })
                        }
                        className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${
                          usr.is_active
                            ? 'bg-[#EBF8F6] border-[#1B998B]/30 text-[#1B998B]'
                            : 'bg-[#F4F6FB] border-[#D8E4EC] text-slate-500'
                        }`}
                      >
                        {usr.is_active ? 'Activo' : 'Inactivo'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {createdUserInfo && (
        <ConfirmSuccessModal
          title="¡Usuario creado en FIXICLOUD!"
          description={`El usuario @${createdUserInfo.username} (${createdUserInfo.fullName}) ya puede iniciar sesión directamente sin Supabase Auth.`}
          secondaryLabel="Cerrar"
          primaryLabel="Crear otro usuario"
          onSecondary={() => setCreatedUserInfo(null)}
          onPrimary={() => {
            setCreatedUserInfo(null);
            setShowNewUser(true);
          }}
        />
      )}
    </div>
  );
};
