import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Check,
  Globe,
  KeyRound,
  MapPin,
  MessageCircle,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type {
  AppUser,
  Branch,
  IndustrySector,
  RoleType,
  Tenant,
} from '../types/erp';
import {
  SECTOR_LABELS,
  canViewGlobalScope,
  filterVisibleAppUsers,
  getRolePermissions,
  prepareAppUserUpdate,
  searchFilterAppUsers,
} from '../utils/erpLogic';
import { generateUUID } from '../utils/uuid';
import { AlertBanner } from './ui/AlertBanner';
import { ConfirmSuccessModal } from './ui/ConfirmSuccessModal';

interface SettingsBranchesViewProps {
  tenant: Tenant;
  tenants: Tenant[];
  branches: Branch[];
  appUsers: AppUser[];
  activeRole: RoleType;
  sessionRole?: RoleType | null;
  currentUserId?: string | null;
  initialTab?: 'company' | 'users';
  onUpdateTenant: (tenant: Tenant) => void;
  onAddBranch: (branch: Branch) => void;
  onDeleteBranch: (branchId: string) => Promise<{ ok: boolean; error?: string }>;
  onAddAppUser: (user: AppUser) => Promise<{ ok: boolean; error?: string }>;
  onUpdateAppUser: (user: AppUser) => Promise<{ ok: boolean; error?: string }>;
  onDeleteAppUser: (userId: string) => Promise<{ ok: boolean; error?: string }>;
}

export const SettingsBranchesView: React.FC<SettingsBranchesViewProps> = ({
  tenant,
  tenants,
  branches,
  appUsers,
  activeRole,
  sessionRole,
  currentUserId,
  initialTab = 'company',
  onUpdateTenant,
  onAddBranch,
  onDeleteBranch,
  onAddAppUser,
  onUpdateAppUser,
  onDeleteAppUser,
}) => {
  const perms = getRolePermissions(activeRole);
  const allowGlobalView = canViewGlobalScope(activeRole, sessionRole);
  const [userScope, setUserScope] = useState<'global' | 'tenant'>(
    allowGlobalView ? 'global' : 'tenant'
  );

  useEffect(() => {
    if (!allowGlobalView && userScope !== 'tenant') {
      setUserScope('tenant');
    }
  }, [allowGlobalView, userScope]);

  const tenantBranches = useMemo(
    () => branches.filter((b) => b.tenant_id === tenant.id),
    [branches, tenant.id]
  );
  const visibleAppUsers = useMemo(
    () => filterVisibleAppUsers(appUsers, activeRole, tenant.id, userScope, sessionRole),
    [appUsers, activeRole, tenant.id, userScope, sessionRole]
  );
  const showGlobalTenantColumn = allowGlobalView && userScope === 'global';

  const [tab, setTab] = useState<'company' | 'users'>(initialTab);
  const [createdUserInfo, setCreatedUserInfo] = useState<{
    fullName: string;
    username: string;
  } | null>(null);
  const [userError, setUserError] = useState<string | null>(null);
  const [userSuccessMsg, setUserSuccessMsg] = useState<string | null>(null);
  const [savingUser, setSavingUser] = useState(false);

  // Search & filter state for users table
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<RoleType | 'ALL'>('ALL');
  const [userStatusFilter, setUserStatusFilter] = useState<
    'ALL' | 'active' | 'inactive'
  >('ALL');

  const filteredAppUsers = useMemo(
    () =>
      searchFilterAppUsers(
        visibleAppUsers,
        userSearchQuery,
        userRoleFilter,
        userStatusFilter
      ),
    [visibleAppUsers, userSearchQuery, userRoleFilter, userStatusFilter]
  );

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  // Company & WhatsApp local drafts with explicit confirmation buttons
  const [companyDraft, setCompanyDraft] = useState({
    name: tenant.name,
    tax_id: tenant.tax_id,
    sector: tenant.sector,
    iva_rate: tenant.iva_rate,
    folio_prefix: tenant.folio_prefix,
    warranty_days: tenant.warranty_days ?? 90,
    legal_terms: tenant.legal_terms ?? '',
  });
  const [companyDirty, setCompanyDirty] = useState(false);
  const [companySavedMsg, setCompanySavedMsg] = useState<string | null>(null);

  const [waDraft, setWaDraft] = useState({
    intake: tenant.whatsapp_templates.intake,
    quote_ready: tenant.whatsapp_templates.quote_ready,
    ready_for_pickup: tenant.whatsapp_templates.ready_for_pickup,
  });
  const [waDirty, setWaDirty] = useState(false);
  const [waSavedMsg, setWaSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    setCompanyDraft({
      name: tenant.name,
      tax_id: tenant.tax_id,
      sector: tenant.sector,
      iva_rate: tenant.iva_rate,
      folio_prefix: tenant.folio_prefix,
      warranty_days: tenant.warranty_days ?? 90,
      legal_terms: tenant.legal_terms ?? '',
    });
    setCompanyDirty(false);
    setCompanySavedMsg(null);
    setWaDraft({
      intake: tenant.whatsapp_templates.intake,
      quote_ready: tenant.whatsapp_templates.quote_ready,
      ready_for_pickup: tenant.whatsapp_templates.ready_for_pickup,
    });
    setWaDirty(false);
    setWaSavedMsg(null);
    setBranchError(null);
    setBranchSuccessMsg(null);
    setConfirmDeleteBranchId(null);
  }, [tenant.id]);

  const branchesByTenant = useMemo(() => {
    const map = new Map<string, Branch[]>();
    for (const b of branches) {
      const list = map.get(b.tenant_id) ?? [];
      list.push(b);
      map.set(b.tenant_id, list);
    }
    return map;
  }, [branches]);

  const [showNewBranch, setShowNewBranch] = useState(false);
  const [confirmDeleteBranchId, setConfirmDeleteBranchId] = useState<string | null>(null);
  const [deletingBranchId, setDeletingBranchId] = useState<string | null>(null);
  const [branchError, setBranchError] = useState<string | null>(null);
  const [branchSuccessMsg, setBranchSuccessMsg] = useState<string | null>(null);
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
  const [uTenantId, setUTenantId] = useState<string>(tenant.id);
  const [uBranchId, setUBranchId] = useState<string>('');

  // Edit / Delete AppUser state
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [eFullName, setEFullName] = useState('');
  const [eUsername, setEUsername] = useState('');
  const [eNewPassword, setENewPassword] = useState('');
  const [eRole, setERole] = useState<RoleType>('technician');
  const [eTenantId, setETenantId] = useState<string>(tenant.id);
  const [eBranchId, setEBranchId] = useState<string>('');
  const [savingEditUser, setSavingEditUser] = useState(false);
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!allowGlobalView) {
      setUTenantId(tenant.id);
      if (uRole === 'superadmin') setURole('technician');
    } else {
      setUTenantId(tenant.id);
    }
    setUBranchId('');
  }, [tenant.id, allowGlobalView, uRole]);

  const handleCreateBranch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bName.trim()) return;
    setBranchError(null);
    setBranchSuccessMsg(null);
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
    setBranchSuccessMsg('Sucursal creada correctamente.');
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserError(null);
    setUserSuccessMsg(null);

    const cleanName = uFullName.trim();
    const cleanUsername = uUsername.trim().replace(/^@+/, '');
    const cleanPassword = uPinOrPassword.trim();

    if (!cleanName || !cleanUsername || !cleanPassword) {
      setUserError('Completa nombre completo, usuario y contraseña / PIN.');
      return;
    }

    const duplicate = appUsers.some(
      (u) => u.username.trim().toLowerCase() === cleanUsername.toLowerCase()
    );
    if (duplicate) {
      setUserError(`El usuario "@${cleanUsername}" ya existe en FIXICLOUD.`);
      return;
    }

    const assignedRole: RoleType =
      !allowGlobalView && uRole === 'superadmin' ? 'admin' : uRole;
    const assignedTenantId =
      assignedRole === 'superadmin'
        ? null
        : allowGlobalView
        ? uTenantId || tenant.id
        : tenant.id;

    const newUser: AppUser = {
      id: generateUUID(),
      tenant_id: assignedTenantId,
      branch_id: assignedRole === 'superadmin' ? null : uBranchId ? uBranchId : null,
      username: cleanUsername,
      pin_or_password: cleanPassword,
      full_name: cleanName,
      role: assignedRole,
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
    setUTenantId(tenant.id);
    setUBranchId('');
    setShowNewUser(false);
    setCreatedUserInfo({ fullName: cleanName, username: cleanUsername });
  };

  const handleGenerateStandardUsers = async () => {
    setUserError(null);
    setUserSuccessMsg(null);
    const prefix = tenant.name.slice(0, 3).toLowerCase().replace(/[^a-z]/g, '') || 'emp';
    const hq = tenantBranches.find((b) => b.is_hq) || tenantBranches[0];
    const hqId = hq ? hq.id : null;

    const existingUsernames = new Set(appUsers.map((u) => u.username.toLowerCase()));
    const existingRolesInTenant = new Set(
      appUsers.filter((u) => u.tenant_id === tenant.id).map((u) => u.role)
    );

    const created: string[] = [];

    if (!existingRolesInTenant.has('admin')) {
      let uname = `admin_${prefix}`;
      let i = 1;
      while (existingUsernames.has(uname)) {
        uname = `admin_${prefix}${i++}`;
      }
      existingUsernames.add(uname);
      const user: AppUser = {
        id: generateUUID(),
        tenant_id: tenant.id,
        branch_id: null,
        username: uname,
        pin_or_password: '123456',
        full_name: `Administrador ${tenant.name}`,
        role: 'admin',
        is_active: true,
        created_at: new Date().toISOString(),
      };
      const res = await onAddAppUser(user);
      if (res.ok) created.push(user.username);
    }

    if (!existingRolesInTenant.has('technician')) {
      let uname = `tec_${prefix}`;
      let i = 1;
      while (existingUsernames.has(uname)) {
        uname = `tec_${prefix}${i++}`;
      }
      existingUsernames.add(uname);
      const user: AppUser = {
        id: generateUUID(),
        tenant_id: tenant.id,
        branch_id: hqId,
        username: uname,
        pin_or_password: '1234',
        full_name: `Técnico ${tenant.name}`,
        role: 'technician',
        is_active: true,
        created_at: new Date().toISOString(),
      };
      const res = await onAddAppUser(user);
      if (res.ok) created.push(user.username);
    }

    if (!existingRolesInTenant.has('receptionist')) {
      let uname = `recep_${prefix}`;
      let i = 1;
      while (existingUsernames.has(uname)) {
        uname = `recep_${prefix}${i++}`;
      }
      existingUsernames.add(uname);
      const user: AppUser = {
        id: generateUUID(),
        tenant_id: tenant.id,
        branch_id: hqId,
        username: uname,
        pin_or_password: '1234',
        full_name: `Recepción ${tenant.name}`,
        role: 'receptionist',
        is_active: true,
        created_at: new Date().toISOString(),
      };
      const res = await onAddAppUser(user);
      if (res.ok) created.push(user.username);
    }

    if (created.length > 0) {
      setUserSuccessMsg(
        `Se crearon los usuarios estándar (${created.map((u) => '@' + u).join(', ')}) para ${tenant.name}, tal como en AndesFleet.`
      );
    } else {
      setUserSuccessMsg(
        `La empresa ${tenant.name} ya cuenta con sus usuarios estándar (Admin, Técnico y Recepcionista).`
      );
    }
  };

  const handlePatchUser = async (
    existing: AppUser,
    patch: Partial<Omit<AppUser, 'id' | 'created_at'>>,
    successText?: string
  ) => {
    setUserError(null);
    setUserSuccessMsg(null);

    const prepared = prepareAppUserUpdate({
      existing,
      patch,
      fallbackTenantId: tenant.id,
      allowGlobalView,
      allUsers: appUsers,
      currentSessionUserId: currentUserId,
    });
    if (!prepared.ok) {
      setUserError(prepared.error);
      return;
    }

    const res = await onUpdateAppUser(prepared.user);
    if (!res.ok) {
      setUserError(res.error ?? 'No se pudo actualizar el usuario en public.app_users.');
      return;
    }
    if (successText) {
      setUserSuccessMsg(successText);
    }
  };

  const openEditUser = (usr: AppUser) => {
    setUserError(null);
    setUserSuccessMsg(null);
    setConfirmDeleteUserId(null);
    setShowNewUser(false);
    setEditingUserId(usr.id);
    setEFullName(usr.full_name);
    setEUsername(usr.username);
    setENewPassword('');
    setERole(usr.role);
    setETenantId(usr.tenant_id ?? tenant.id);
    setEBranchId(usr.branch_id ?? '');
  };

  const closeEditUser = () => {
    setEditingUserId(null);
    setENewPassword('');
  };

  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUserId) return;
    const existing = appUsers.find((u) => u.id === editingUserId);
    if (!existing) {
      closeEditUser();
      return;
    }

    setUserError(null);
    setUserSuccessMsg(null);

    const prepared = prepareAppUserUpdate({
      existing,
      patch: {
        full_name: eFullName,
        username: eUsername,
        role: eRole,
        tenant_id: eRole === 'superadmin' ? null : eTenantId || tenant.id,
        branch_id: eRole === 'superadmin' ? null : eBranchId ? eBranchId : null,
      },
      newPassword: eNewPassword,
      fallbackTenantId: tenant.id,
      allowGlobalView,
      allUsers: appUsers,
      currentSessionUserId: currentUserId,
    });

    if (!prepared.ok) {
      setUserError(prepared.error);
      return;
    }

    setSavingEditUser(true);
    const res = await onUpdateAppUser(prepared.user);
    setSavingEditUser(false);

    if (!res.ok) {
      setUserError(res.error ?? 'No se pudo actualizar el usuario en public.app_users.');
      return;
    }

    closeEditUser();
    setUserSuccessMsg(
      `Usuario @${prepared.user.username} (${prepared.user.full_name}) actualizado correctamente.`
    );
  };

  const handleConfirmDeleteUser = async (usr: AppUser) => {
    setUserError(null);
    setUserSuccessMsg(null);

    if (currentUserId && usr.id === currentUserId) {
      setUserError('No puedes eliminar tu propia cuenta mientras tienes la sesión activa.');
      setConfirmDeleteUserId(null);
      return;
    }

    if (
      !allowGlobalView &&
      (usr.role === 'superadmin' || usr.tenant_id !== tenant.id)
    ) {
      setUserError('Solo SuperAdmin Global puede gestionar cuentas globales o de otras empresas.');
      setConfirmDeleteUserId(null);
      return;
    }

    setDeletingUserId(usr.id);
    const res = await onDeleteAppUser(usr.id);
    setDeletingUserId(null);

    if (!res.ok) {
      setUserError(res.error ?? 'No se pudo eliminar el usuario de public.app_users.');
      return;
    }

    setConfirmDeleteUserId(null);
    if (editingUserId === usr.id) {
      closeEditUser();
    }
    setUserSuccessMsg(`Usuario @${usr.username} (${usr.full_name}) eliminado.`);
  };

  const branchMap = useMemo(() => new Map(branches.map((b) => [b.id, b])), [branches]);
  const tenantMap = useMemo(() => new Map(tenants.map((t) => [t.id, t])), [tenants]);
  const newUserTenantBranches = useMemo(
    () =>
      branches.filter(
        (b) => b.tenant_id === (allowGlobalView ? uTenantId || tenant.id : tenant.id)
      ),
    [branches, allowGlobalView, uTenantId, tenant.id]
  );
  const editUserTenantBranches = useMemo(
    () =>
      branches.filter(
        (b) => b.tenant_id === (allowGlobalView ? eTenantId || tenant.id : tenant.id)
      ),
    [branches, allowGlobalView, eTenantId, tenant.id]
  );
  const editingUser = editingUserId
    ? appUsers.find((u) => u.id === editingUserId) ?? null
    : null;

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
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onUpdateTenant({
                  ...tenant,
                  name: companyDraft.name.trim() || tenant.name,
                  tax_id: companyDraft.tax_id.trim(),
                  sector: companyDraft.sector,
                  iva_rate: Math.max(0, Number(companyDraft.iva_rate) || 0),
                  folio_prefix: companyDraft.folio_prefix.trim().toUpperCase() || 'OT',
                  warranty_days: Math.max(0, Number(companyDraft.warranty_days) || 0),
                  legal_terms: companyDraft.legal_terms,
                });
                setCompanyDirty(false);
                setCompanySavedMsg('Datos de empresa y parámetros actualizados.');
              }}
              className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm p-6 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#D8E4EC]/70">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-[#3E92CC]" />
                  <h2 className="text-sm font-semibold text-slate-900">
                    Identidad Tributaria y Parámetros Operativos
                  </h2>
                </div>
                {companyDirty && (
                  <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5">
                    Cambios sin guardar
                  </span>
                )}
              </div>

              {companySavedMsg && !companyDirty && (
                <AlertBanner
                  variant="success"
                  message={companySavedMsg}
                  onDismiss={() => setCompanySavedMsg(null)}
                />
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Razón Social / Nombre Comercial
                  </label>
                  <input
                    type="text"
                    required
                    value={companyDraft.name}
                    onChange={(e) => {
                      setCompanyDraft((d) => ({ ...d, name: e.target.value }));
                      setCompanyDirty(true);
                      setCompanySavedMsg(null);
                    }}
                    className="w-full rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    RUT / ID Tributario
                  </label>
                  <input
                    type="text"
                    value={companyDraft.tax_id}
                    onChange={(e) => {
                      setCompanyDraft((d) => ({ ...d, tax_id: e.target.value }));
                      setCompanyDirty(true);
                      setCompanySavedMsg(null);
                    }}
                    className="w-full rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Rubro del Taller
                  </label>
                  <select
                    value={companyDraft.sector}
                    onChange={(e) => {
                      setCompanyDraft((d) => ({
                        ...d,
                        sector: e.target.value as IndustrySector,
                      }));
                      setCompanyDirty(true);
                      setCompanySavedMsg(null);
                    }}
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
                    value={companyDraft.iva_rate}
                    onChange={(e) => {
                      setCompanyDraft((d) => ({
                        ...d,
                        iva_rate: Math.max(0, Number(e.target.value) || 0),
                      }));
                      setCompanyDirty(true);
                      setCompanySavedMsg(null);
                    }}
                    className="w-full rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Prefijo de Folios
                  </label>
                  <input
                    type="text"
                    value={companyDraft.folio_prefix}
                    onChange={(e) => {
                      setCompanyDraft((d) => ({
                        ...d,
                        folio_prefix: e.target.value.toUpperCase(),
                      }));
                      setCompanyDirty(true);
                      setCompanySavedMsg(null);
                    }}
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
                    value={companyDraft.warranty_days}
                    onChange={(e) => {
                      setCompanyDraft((d) => ({
                        ...d,
                        warranty_days: Math.max(0, Number(e.target.value) || 0),
                      }));
                      setCompanyDirty(true);
                      setCompanySavedMsg(null);
                    }}
                    className="w-full rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Términos Legales para Comprobantes Impresos
                  </label>
                  <textarea
                    rows={3}
                    value={companyDraft.legal_terms}
                    onChange={(e) => {
                      setCompanyDraft((d) => ({ ...d, legal_terms: e.target.value }));
                      setCompanyDirty(true);
                      setCompanySavedMsg(null);
                    }}
                    placeholder="Condiciones de diagnóstico, retiro, respaldo de datos y garantía impresas en Entrada.rpt / Salida.rpt..."
                    className="w-full rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-[#D8E4EC]/60">
                <button
                  type="submit"
                  disabled={!companyDirty}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#3E92CC] hover:bg-[#3178A8] disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-xs font-semibold text-white transition-colors"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Guardar Datos de Empresa</span>
                </button>
              </div>
            </form>

            {/* Master WhatsApp Switch & Templates */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onUpdateTenant({
                  ...tenant,
                  whatsapp_templates: {
                    intake: waDraft.intake,
                    quote_ready: waDraft.quote_ready,
                    ready_for_pickup: waDraft.ready_for_pickup,
                  },
                });
                setWaDirty(false);
                setWaSavedMsg('Plantillas de WhatsApp guardadas.');
              }}
              className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm p-6 space-y-4"
            >
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

              {waSavedMsg && !waDirty && (
                <AlertBanner
                  variant="success"
                  message={waSavedMsg}
                  onDismiss={() => setWaSavedMsg(null)}
                />
              )}

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
                    value={waDraft.intake}
                    onChange={(e) => {
                      setWaDraft((d) => ({ ...d, intake: e.target.value }));
                      setWaDirty(true);
                      setWaSavedMsg(null);
                    }}
                    className="w-full rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    2. Presupuesto Listo para Aprobación
                  </label>
                  <textarea
                    rows={2}
                    value={waDraft.quote_ready}
                    onChange={(e) => {
                      setWaDraft((d) => ({ ...d, quote_ready: e.target.value }));
                      setWaDirty(true);
                      setWaSavedMsg(null);
                    }}
                    className="w-full rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    3. Equipo Listo para Retiro
                  </label>
                  <textarea
                    rows={2}
                    value={waDraft.ready_for_pickup}
                    onChange={(e) => {
                      setWaDraft((d) => ({ ...d, ready_for_pickup: e.target.value }));
                      setWaDirty(true);
                      setWaSavedMsg(null);
                    }}
                    className="w-full rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-[#D8E4EC]/60">
                <button
                  type="submit"
                  disabled={!waDirty}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#1B998B] hover:bg-[#157A6E] disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-xs font-semibold text-white transition-colors"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Guardar Plantillas WhatsApp</span>
                </button>
              </div>
            </form>
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

            {branchError && (
              <AlertBanner
                variant="error"
                message={branchError}
                onDismiss={() => setBranchError(null)}
              />
            )}

            {branchSuccessMsg && (
              <AlertBanner
                variant="success"
                message={branchSuccessMsg}
                onDismiss={() => setBranchSuccessMsg(null)}
              />
            )}

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
                            disabled={deletingBranchId === b.id}
                            onClick={() => setConfirmDeleteBranchId(null)}
                            className="text-[11px] font-semibold text-slate-600 hover:text-slate-900"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            disabled={deletingBranchId === b.id}
                            onClick={async () => {
                              setBranchError(null);
                              setBranchSuccessMsg(null);
                              setDeletingBranchId(b.id);
                              const res = await onDeleteBranch(b.id);
                              setDeletingBranchId(null);
                              setConfirmDeleteBranchId(null);
                              if (!res.ok) {
                                setBranchError(
                                  res.error ?? 'No se pudo eliminar la sucursal.'
                                );
                              } else {
                                setBranchSuccessMsg(`Sucursal "${b.name}" eliminada.`);
                              }
                            }}
                            className="rounded-lg bg-[#D64545] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                          >
                            {deletingBranchId === b.id ? 'Eliminando...' : 'Confirmar'}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setBranchError(null);
                            setBranchSuccessMsg(null);
                            setConfirmDeleteBranchId(b.id);
                          }}
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
                {showGlobalTenantColumn
                  ? 'Vista global multiempresa habilitada exclusivamente para SuperAdmin. Las credenciales permanecen ocultas.'
                  : `Cuentas restringidas exclusivamente a ${tenant.name}. Las credenciales permanecen ocultas por seguridad.`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {allowGlobalView && (
                <div className="inline-flex items-center gap-1 rounded-xl border border-[#D8E4EC] bg-[#F4F6FB] p-1">
                  <button
                    type="button"
                    onClick={() => setUserScope('global')}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                      userScope === 'global'
                        ? 'bg-[#0A2463] text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Globe className="h-3.5 w-3.5" />
                    <span>Vista Global ({appUsers.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setUserScope('tenant')}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                      userScope === 'tenant'
                        ? 'bg-[#0A2463] text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Solo {tenant.name}
                  </button>
                </div>
              )}
              {perms.canManageUsers && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleGenerateStandardUsers}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#1B998B] hover:bg-[#157A6E] text-white px-3.5 py-2 text-xs font-semibold transition-colors"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    <span>Generar Usuarios Estándar (AndesFleet)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUserError(null);
                      setUserSuccessMsg(null);
                      closeEditUser();
                      setShowNewUser((v) => !v);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#3E92CC] hover:bg-[#3178A8] text-white px-3.5 py-2 text-xs font-semibold transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Nuevo Usuario</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {userError && (
            <AlertBanner
              variant="error"
              message={userError}
              onDismiss={() => setUserError(null)}
            />
          )}

          {userSuccessMsg && (
            <AlertBanner
              variant="success"
              message={userSuccessMsg}
              onDismiss={() => setUserSuccessMsg(null)}
            />
          )}

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                aria-label="Buscar usuarios"
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                placeholder="Buscar por nombre o @usuario..."
                className="w-full rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 pl-8 pr-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
              />
            </div>

            <select
              aria-label="Filtrar usuarios por rol"
              value={userRoleFilter}
              onChange={(e) => setUserRoleFilter(e.target.value as RoleType | 'ALL')}
              className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-800 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
            >
              <option value="ALL">Todos los roles</option>
              <option value="technician">technician</option>
              <option value="receptionist">receptionist</option>
              <option value="admin">company_admin</option>
              {allowGlobalView && <option value="superadmin">superadmin</option>}
            </select>

            <select
              aria-label="Filtrar usuarios por estado"
              value={userStatusFilter}
              onChange={(e) =>
                setUserStatusFilter(e.target.value as 'ALL' | 'active' | 'inactive')
              }
              className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-800 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
            >
              <option value="ALL">Todos los estados</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </select>

            {(userSearchQuery ||
              userRoleFilter !== 'ALL' ||
              userStatusFilter !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setUserSearchQuery('');
                  setUserRoleFilter('ALL');
                  setUserStatusFilter('ALL');
                }}
                className="inline-flex items-center gap-1 rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-[#F4F6FB] hover:text-slate-900 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
                <span>Limpiar</span>
              </button>
            )}
          </div>

          {showNewUser && perms.canManageUsers && (
            <form
              onSubmit={handleCreateUser}
              className="rounded-2xl bg-[#F4F6FB] border border-[#D8E4EC] p-4 space-y-3"
            >
              <div
                className={`grid grid-cols-1 sm:grid-cols-2 ${
                  allowGlobalView ? 'lg:grid-cols-6' : 'lg:grid-cols-5'
                } gap-3`}
              >
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
                    type="password"
                    autoComplete="new-password"
                    required
                    value={uPinOrPassword}
                    onChange={(e) => setUPinOrPassword(e.target.value)}
                    placeholder="••••••"
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
                    {allowGlobalView && (
                      <option value="superadmin">superadmin (Global)</option>
                    )}
                  </select>
                </div>
                {allowGlobalView && (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Empresa / Tenant
                    </label>
                    <select
                      aria-label="Empresa del nuevo usuario"
                      value={uRole === 'superadmin' ? '' : uTenantId}
                      disabled={uRole === 'superadmin'}
                      onChange={(e) => {
                        setUTenantId(e.target.value);
                        setUBranchId('');
                      }}
                      className="w-full rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs text-slate-800 disabled:bg-slate-100 focus:border-[#3E92CC] focus:outline-none"
                    >
                      {uRole === 'superadmin' ? (
                        <option value="">Global Multiempresa</option>
                      ) : (
                        tenants.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                )}
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
                    {newUserTenantBranches.map((b) => (
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

          {editingUser && perms.canManageUsers && (
            <form
              onSubmit={handleSaveEditUser}
              className="rounded-2xl bg-[#F4F6FB] border border-[#D8E4EC] p-4 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-[#0A2463]">
                  Editando usuario @{editingUser.username} ({editingUser.full_name})
                </div>
                <button
                  type="button"
                  onClick={closeEditUser}
                  aria-label="Cerrar edición de usuario"
                  className="rounded-lg p-1 text-slate-500 hover:bg-white hover:text-slate-800 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div
                className={`grid grid-cols-1 sm:grid-cols-2 ${
                  allowGlobalView ? 'lg:grid-cols-6' : 'lg:grid-cols-5'
                } gap-3`}
              >
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Nombre completo *
                  </label>
                  <input
                    type="text"
                    required
                    value={eFullName}
                    onChange={(e) => setEFullName(e.target.value)}
                    placeholder="Nombre completo"
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
                    value={eUsername}
                    onChange={(e) => setEUsername(e.target.value)}
                    placeholder="Ej: msoto"
                    className="w-full rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs font-mono text-slate-800 focus:border-[#3E92CC] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Nueva Contraseña / PIN
                  </label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={eNewPassword}
                    onChange={(e) => setENewPassword(e.target.value)}
                    placeholder="Opcional (mantener)"
                    className="w-full rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs font-mono text-slate-800 focus:border-[#3E92CC] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Rol Operativo
                  </label>
                  <select
                    aria-label="Editar rol de usuario"
                    value={eRole}
                    onChange={(e) => setERole(e.target.value as RoleType)}
                    className="w-full rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs text-slate-800 focus:border-[#3E92CC] focus:outline-none"
                  >
                    <option value="technician">technician (Técnico)</option>
                    <option value="receptionist">receptionist (Recepcionista)</option>
                    <option value="admin">company_admin (Admin de Taller)</option>
                    {allowGlobalView && (
                      <option value="superadmin">superadmin (Global)</option>
                    )}
                  </select>
                </div>
                {allowGlobalView && (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Empresa / Tenant
                    </label>
                    <select
                      aria-label="Editar empresa de usuario"
                      value={eRole === 'superadmin' ? '' : eTenantId}
                      disabled={eRole === 'superadmin'}
                      onChange={(e) => {
                        setETenantId(e.target.value);
                        setEBranchId('');
                      }}
                      className="w-full rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs text-slate-800 disabled:bg-slate-100 focus:border-[#3E92CC] focus:outline-none"
                    >
                      {eRole === 'superadmin' ? (
                        <option value="">Global Multiempresa</option>
                      ) : (
                        tenants.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Sucursal Asignada
                  </label>
                  <select
                    aria-label="Editar sucursal de usuario"
                    value={eRole === 'superadmin' ? '' : eBranchId}
                    disabled={eRole === 'superadmin'}
                    onChange={(e) => setEBranchId(e.target.value)}
                    className="w-full rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs text-slate-800 disabled:bg-slate-100 focus:border-[#3E92CC] focus:outline-none"
                  >
                    <option value="">Global (Casa Matriz / Todas)</option>
                    {editUserTenantBranches.map((b) => (
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
                  onClick={closeEditUser}
                  className="rounded-xl border border-[#D8E4EC] bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-[#F4F6FB]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingEditUser}
                  className="rounded-xl bg-[#3E92CC] hover:bg-[#3178A8] disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white transition-colors"
                >
                  {savingEditUser ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          )}

          <div className="overflow-x-auto rounded-2xl border border-[#D8E4EC]/70">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F4F6FB]/70 border-b border-[#D8E4EC]/70 text-[11px] font-semibold text-slate-500">
                  <th className="py-3 px-3">Nombre</th>
                  <th className="py-3 px-3">Usuario</th>
                  <th className="py-3 px-3">Credencial</th>
                  {showGlobalTenantColumn && (
                    <th className="py-3 px-3">Empresa / Tenant</th>
                  )}
                  <th className="py-3 px-3">Rol Operativo</th>
                  <th className="py-3 px-3">Sucursal Asignada</th>
                  <th className="py-3 px-3 text-center">Estado</th>
                  {perms.canManageUsers && (
                    <th className="py-3 px-3 text-right">Acciones</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D8E4EC]/50">
                {filteredAppUsers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={
                        (showGlobalTenantColumn ? 7 : 6) +
                        (perms.canManageUsers ? 1 : 0)
                      }
                      className="py-8 px-4 text-center text-xs text-slate-500"
                    >
                      No hay usuarios que coincidan con los filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  filteredAppUsers.map((usr) => {
                    const usrBranches = usr.tenant_id
                      ? branchesByTenant.get(usr.tenant_id) ?? []
                      : [];
                    const usrTenantName = usr.tenant_id
                      ? tenantMap.get(usr.tenant_id)?.name ?? 'Empresa'
                      : 'Global Multiempresa';
                    const isSelf = Boolean(currentUserId && usr.id === currentUserId);
                    const isEditing = editingUserId === usr.id;

                    return (
                      <tr
                        key={usr.id}
                        className={`transition-colors ${
                          isEditing ? 'bg-[#EBF4FA]/40' : 'hover:bg-[#F4F6FB]/70'
                        }`}
                      >
                        <td className="py-3 px-3 font-semibold text-slate-900">
                          {usr.full_name}
                        </td>
                        <td className="py-3 px-3 font-mono text-[#0A2463] font-semibold whitespace-nowrap">
                          @{usr.username}
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-500">
                          <span
                            title="Credencial oculta por seguridad"
                            className="inline-flex items-center gap-1.5 rounded-lg bg-[#F4F6FB] border border-[#D8E4EC] px-2.5 py-0.5 text-[11px] text-slate-500 select-none"
                          >
                            <KeyRound className="h-3 w-3 text-[#3E92CC]" />
                            <span>••••••</span>
                          </span>
                        </td>
                        {showGlobalTenantColumn && (
                          <td className="py-3 px-3 text-xs text-slate-700 font-medium">
                            {usr.tenant_id === null ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-[#EBF4FA] border border-[#3E92CC]/25 px-2.5 py-0.5 text-[11px] font-semibold text-[#0A2463]">
                                <Globe className="h-3 w-3 text-[#3E92CC]" />
                                <span>Global Multiempresa</span>
                              </span>
                            ) : (
                              <span>{usrTenantName}</span>
                            )}
                          </td>
                        )}
                        <td className="py-3 px-3">
                          {perms.canManageUsers ? (
                            <select
                              aria-label={`Rol de ${usr.full_name}`}
                              value={usr.role}
                              onChange={(e) =>
                                void handlePatchUser(usr, {
                                  role: e.target.value as RoleType,
                                })
                              }
                              className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/60 px-2.5 py-1 text-xs text-slate-800 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                            >
                              <option value="technician">technician</option>
                              <option value="receptionist">receptionist</option>
                              <option value="admin">company_admin</option>
                              {allowGlobalView && (
                                <option value="superadmin">superadmin</option>
                              )}
                            </select>
                          ) : (
                            <span className="font-medium text-slate-700">
                              {usr.role === 'admin' ? 'company_admin' : usr.role}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          {usr.role === 'superadmin' || usr.tenant_id === null ? (
                            <span className="text-[11px] font-semibold text-[#0A2463]">
                              Global Multiempresa (null)
                            </span>
                          ) : perms.canManageUsers ? (
                            <select
                              aria-label={`Sucursal de ${usr.full_name}`}
                              value={usr.branch_id ?? ''}
                              onChange={(e) =>
                                void handlePatchUser(usr, {
                                  branch_id: e.target.value ? e.target.value : null,
                                })
                              }
                              className="max-w-[168px] rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/60 px-2.5 py-1 text-xs text-slate-800 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                            >
                              <option value="">Global empresa (Todas)</option>
                              {usrBranches.map((b) => (
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
                        <td className="py-3 px-3 text-center">
                          <button
                            type="button"
                            disabled={!perms.canManageUsers}
                            aria-label={`Cambiar estado de ${usr.full_name}`}
                            onClick={() =>
                              void handlePatchUser(usr, {
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
                        {perms.canManageUsers && (
                          <td className="py-3 px-3 text-right whitespace-nowrap">
                            {confirmDeleteUserId === usr.id ? (
                              <div className="inline-flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  disabled={deletingUserId === usr.id}
                                  onClick={() => setConfirmDeleteUserId(null)}
                                  className="text-[11px] font-semibold text-slate-600 hover:text-slate-900"
                                >
                                  Cancelar
                                </button>
                                <button
                                  type="button"
                                  disabled={deletingUserId === usr.id}
                                  onClick={() => void handleConfirmDeleteUser(usr)}
                                  className="rounded-lg bg-[#D64545] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                                >
                                  {deletingUserId === usr.id
                                    ? 'Eliminando...'
                                    : 'Confirmar'}
                                </button>
                              </div>
                            ) : (
                              <div className="inline-flex items-center justify-end gap-2.5">
                                <button
                                  type="button"
                                  aria-label={`Editar usuario ${usr.full_name}`}
                                  onClick={() => openEditUser(usr)}
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#3E92CC] hover:text-[#0A2463] transition-colors"
                                >
                                  <Pencil className="h-3 w-3" />
                                  <span>Editar</span>
                                </button>
                                {isSelf ? (
                                  <span className="text-[11px] font-medium text-slate-400">
                                    Sesión actual
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    aria-label={`Eliminar usuario ${usr.full_name}`}
                                    onClick={() => {
                                      setUserError(null);
                                      setUserSuccessMsg(null);
                                      setConfirmDeleteUserId(usr.id);
                                    }}
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#D64545] hover:underline"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                    <span>Eliminar</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
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
