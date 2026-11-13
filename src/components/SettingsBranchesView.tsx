import React, { useEffect, useState } from 'react';
import { Building2, MapPin, MessageCircle, Plus, Trash2, Users } from 'lucide-react';
import type {
  Branch,
  IndustrySector,
  RoleType,
  TeamProfile,
  Tenant,
} from '../types/erp';
import { SECTOR_LABELS, getRolePermissions } from '../utils/erpLogic';
import { ConfirmSuccessModal } from './ui/ConfirmSuccessModal';

interface SettingsBranchesViewProps {
  tenant: Tenant;
  branches: Branch[];
  profiles: TeamProfile[];
  activeRole: RoleType;
  initialTab?: 'company' | 'users';
  onUpdateTenant: (tenant: Tenant) => void;
  onAddBranch: (branch: Branch) => void;
  onDeleteBranch: (branchId: string) => void;
  onAddProfile: (profile: TeamProfile) => void;
  onUpdateProfile: (profile: TeamProfile) => void;
}

export const SettingsBranchesView: React.FC<SettingsBranchesViewProps> = ({
  tenant,
  branches,
  profiles,
  activeRole,
  initialTab = 'company',
  onUpdateTenant,
  onAddBranch,
  onDeleteBranch,
  onAddProfile,
  onUpdateProfile,
}) => {
  const perms = getRolePermissions(activeRole);
  const tenantBranches = branches.filter((b) => b.tenant_id === tenant.id);
  const tenantProfiles = profiles.filter((p) => p.tenant_id === tenant.id);

  const [tab, setTab] = useState<'company' | 'users'>(initialTab);
  const [invitedUserInfo, setInvitedUserInfo] = useState<{
    name: string;
    email: string;
  } | null>(null);

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

  // New Team Member state
  const [showNewUser, setShowNewUser] = useState(false);
  const [uName, setUName] = useState('');
  const [uEmail, setUEmail] = useState('');
  const [uRole, setURole] = useState<RoleType>('technician');
  const [uBranchId, setUBranchId] = useState<string>('');

  const handleCreateBranch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bName.trim()) return;
    onAddBranch({
      id: `branch-${Date.now()}`,
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

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    const createdName = uName.trim();
    const createdEmail = uEmail.trim();
    onAddProfile({
      id: `prof-${Date.now()}`,
      tenant_id: tenant.id,
      branch_id: uBranchId ? uBranchId : null,
      full_name: createdName,
      email: createdEmail,
      role: uRole,
      active: true,
      created_at: new Date().toISOString(),
    });
    setUName('');
    setUEmail('');
    setURole('technician');
    setUBranchId('');
    setShowNewUser(false);
    setInvitedUserInfo({ name: createdName, email: createdEmail });
  };

  const branchMap = new Map(tenantBranches.map((b) => [b.id, b]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-900">
            Sucursales, Roles y Configuración Multiempresa
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Administra los datos tributarios, IVA, Casa Matriz, sucursales, WhatsApp y usuarios de {tenant.name}.
          </p>
        </div>

        <div className="flex items-center gap-1 bg-white border border-[#D8E4EC] p-1 rounded-xl shadow-sm">
          <button
            type="button"
            onClick={() => setTab('company')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              tab === 'company'
                ? 'bg-[#0A2463] text-white'
                : 'text-slate-600 hover:text-slate-900'
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
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>Usuarios y Roles del Taller ({tenantProfiles.length})</span>
          </button>
        </div>
      </div>

      {tab === 'company' ? (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
            {/* Company & Tax Config */}
            <section className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm p-6 space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-[#D8E4EC]">
                <Building2 className="h-4 w-4 text-[#3E92CC]" />
                <h2 className="text-sm font-semibold text-slate-900">
                  Identidad Tributaria y Parámetros Operativos
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Razón Social / Nombre Comercial
                  </label>
                  <input
                    type="text"
                    value={tenant.name}
                    onChange={(e) => onUpdateTenant({ ...tenant, name: e.target.value })}
                    className="w-full rounded-xl border border-[#D8E4EC] px-3 py-2 text-sm focus:border-[#3E92CC] focus:outline-none"
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
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-blue-600 focus:outline-none"
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
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
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
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-blue-600 focus:outline-none"
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
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-blue-600 focus:outline-none"
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
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-blue-600 focus:outline-none"
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
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>
            </section>

            {/* Master WhatsApp Switch & Templates */}
            <section className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-[#D8E4EC]">
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-[#1B998B]" />
                  <h2 className="text-sm font-semibold text-slate-900">
                    Notificaciones por WhatsApp
                  </h2>
                </div>

                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-medium text-slate-600">
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
                <span className="font-mono text-slate-700">
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
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-600 focus:outline-none"
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
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-600 focus:outline-none"
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
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>
            </section>
          </div>

          {/* Branches Section */}
          <section className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#D8E4EC]">
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
                className="rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    type="text"
                    required
                    value={bName}
                    onChange={(e) => setBName(e.target.value)}
                    placeholder="Nombre sucursal (Ej: Sucursal Viña) *"
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                  />
                  <input
                    type="text"
                    value={bCode}
                    onChange={(e) => setBCode(e.target.value)}
                    placeholder="Código (Ej: SUC-VNA)"
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono"
                  />
                  <input
                    type="text"
                    value={bCity}
                    onChange={(e) => setBCity(e.target.value)}
                    placeholder="Ciudad"
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                  />
                  <input
                    type="text"
                    value={bAddress}
                    onChange={(e) => setBAddress(e.target.value)}
                    placeholder="Dirección comercial"
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                  />
                  <input
                    type="text"
                    value={bPhone}
                    onChange={(e) => setBPhone(e.target.value)}
                    placeholder="Teléfono"
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono"
                  />
                  <input
                    type="text"
                    value={bHours}
                    onChange={(e) => setBHours(e.target.value)}
                    placeholder="Horario atención"
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowNewBranch(false)}
                    className="rounded-xl border border-[#D8E4EC] bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-[#F4F6FB]"
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
                  className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 space-y-1.5 flex flex-col justify-between"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-blue-700">
                        {b.code}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-600">
                        {b.is_hq ? 'Casa Matriz [HQ]' : 'Sucursal'}
                      </span>
                    </div>
                    <div className="text-sm font-bold text-slate-900">{b.name}</div>
                    <div className="text-xs text-slate-600">
                      {b.address} · {b.city}
                    </div>
                    <div className="font-mono text-[11px] text-slate-500">{b.phone}</div>
                    <div className="text-[11px] text-slate-500">{b.business_hours}</div>
                  </div>

                  {!b.is_hq && perms.canDeleteBranch && (
                    <div className="pt-2 mt-2 border-t border-slate-200 flex justify-end">
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
                            className="rounded bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-red-700"
                          >
                            Confirmar
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteBranchId(b.id)}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 hover:underline"
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
        /* Users & Roles Tab */
        <section className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#D8E4EC]">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Usuarios y Roles del Taller ({tenantProfiles.length})
              </h2>
              <p className="text-xs text-slate-500">
                Asigna técnicos, recepcionistas y administradores a Casa Matriz (acceso total) o a una sucursal específica.
              </p>
            </div>
            {perms.canManageUsers && (
              <button
                type="button"
                onClick={() => setShowNewUser((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#3E92CC] hover:bg-[#3178A8] text-white px-3.5 py-2 text-xs font-semibold transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Agregar Usuario / Técnico</span>
              </button>
            )}
          </div>

          {showNewUser && perms.canManageUsers && (
            <form
              onSubmit={handleCreateUser}
              className="rounded-2xl bg-[#F4F6FB] border border-[#D8E4EC] p-4 space-y-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <input
                  type="text"
                  required
                  value={uName}
                  onChange={(e) => setUName(e.target.value)}
                  placeholder="Nombre completo *"
                  className="rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs text-slate-800 focus:border-[#3E92CC] focus:outline-none"
                />
                <input
                  type="email"
                  required
                  value={uEmail}
                  onChange={(e) => setUEmail(e.target.value)}
                  placeholder="correo@taller.cl *"
                  className="rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs text-slate-800 focus:border-[#3E92CC] focus:outline-none"
                />
                <select
                  value={uRole}
                  onChange={(e) => setURole(e.target.value as RoleType)}
                  className="rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs text-slate-800 focus:border-[#3E92CC] focus:outline-none"
                >
                  <option value="technician">Técnico</option>
                  <option value="receptionist">Recepcionista</option>
                  <option value="admin">Admin de Taller</option>
                  {activeRole === 'superadmin' && (
                    <option value="superadmin">SuperAdmin Global</option>
                  )}
                </select>
                <select
                  value={uBranchId}
                  onChange={(e) => setUBranchId(e.target.value)}
                  className="rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs text-slate-800 focus:border-[#3E92CC] focus:outline-none"
                >
                  <option value="">Casa Matriz (Todas las Sucursales)</option>
                  {tenantBranches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code})
                    </option>
                  ))}
                </select>
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
                  className="rounded-xl bg-[#3E92CC] hover:bg-[#3178A8] px-4 py-2 text-xs font-semibold text-white transition-colors"
                >
                  Guardar Usuario
                </button>
              </div>
            </form>
          )}

          <div className="overflow-x-auto rounded-2xl border border-[#D8E4EC]">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F4F6FB] border-b border-[#D8E4EC] text-[11px] font-semibold text-slate-600">
                  <th className="py-3 px-4">Nombre</th>
                  <th className="py-3 px-4">Correo Electrónico</th>
                  <th className="py-3 px-4">Rol Operativo</th>
                  <th className="py-3 px-4">Sucursal Asignada</th>
                  <th className="py-3 px-4 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tenantProfiles.map((prof) => (
                  <tr key={prof.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 font-semibold text-slate-900">
                      {prof.full_name}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-600">
                      {prof.email}
                    </td>
                    <td className="py-2.5 px-4">
                      {perms.canManageUsers ? (
                        <select
                          aria-label={`Rol de ${prof.full_name}`}
                          value={prof.role}
                          onChange={(e) =>
                            onUpdateProfile({
                              ...prof,
                              role: e.target.value as RoleType,
                            })
                          }
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                        >
                          <option value="technician">Técnico</option>
                          <option value="receptionist">Recepcionista</option>
                          <option value="admin">Admin de Taller</option>
                          {activeRole === 'superadmin' && (
                            <option value="superadmin">SuperAdmin Global</option>
                          )}
                        </select>
                      ) : (
                        <span className="font-medium text-slate-700">{prof.role}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4">
                      {perms.canManageUsers ? (
                        <select
                          aria-label={`Sucursal de ${prof.full_name}`}
                          value={prof.branch_id ?? ''}
                          onChange={(e) =>
                            onUpdateProfile({
                              ...prof,
                              branch_id: e.target.value ? e.target.value : null,
                            })
                          }
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                        >
                          <option value="">Casa Matriz (Todas)</option>
                          {tenantBranches.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span>
                          {prof.branch_id
                            ? branchMap.get(prof.branch_id)?.name ?? 'Sucursal'
                            : 'Casa Matriz (Todas)'}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      <button
                        type="button"
                        disabled={!perms.canManageUsers}
                        onClick={() =>
                          onUpdateProfile({ ...prof, active: !prof.active })
                        }
                        className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold ${
                          prof.active
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                            : 'bg-slate-100 border-slate-300 text-slate-500'
                        }`}
                      >
                        {prof.active ? 'Activo' : 'Inactivo'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {invitedUserInfo && (
        <ConfirmSuccessModal
          title="¡Usuario agregado!"
          description={`El perfil de ${invitedUserInfo.name} (${invitedUserInfo.email}) ha sido habilitado en el equipo de ${tenant.name}.`}
          secondaryLabel="Cerrar"
          primaryLabel="Agregar otro"
          onSecondary={() => setInvitedUserInfo(null)}
          onPrimary={() => {
            setInvitedUserInfo(null);
            setShowNewUser(true);
          }}
        />
      )}
    </div>
  );
};
