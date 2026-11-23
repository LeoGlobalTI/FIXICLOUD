/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { ContextHeader } from './components/ContextHeader';
import { DashboardView } from './components/DashboardView';
import { LoginScreen } from './components/LoginScreen';
import { type NewOrderPrefill } from './components/NewOrderModal';
import { Sidebar } from './components/Sidebar';
import { AlertBanner } from './components/ui/AlertBanner';
import { ConfirmSuccessModal } from './components/ui/ConfirmSuccessModal';

const AppointmentsView = lazy(() =>
  import('./components/AppointmentsView').then((m) => ({ default: m.AppointmentsView }))
);
const AuthModal = lazy(() =>
  import('./components/AuthModal').then((m) => ({ default: m.AuthModal }))
);
const ClientsAssetsView = lazy(() =>
  import('./components/ClientsAssetsView').then((m) => ({ default: m.ClientsAssetsView }))
);
const InventoryLoansView = lazy(() =>
  import('./components/InventoryLoansView').then((m) => ({ default: m.InventoryLoansView }))
);
const LegacyMigratorView = lazy(() =>
  import('./components/LegacyMigratorView').then((m) => ({ default: m.LegacyMigratorView }))
);
const NewOrderModal = lazy(() =>
  import('./components/NewOrderModal').then((m) => ({ default: m.NewOrderModal }))
);
const NewTenantModal = lazy(() =>
  import('./components/NewTenantModal').then((m) => ({ default: m.NewTenantModal }))
);
const OrderConsoleView = lazy(() =>
  import('./components/OrderConsoleView').then((m) => ({ default: m.OrderConsoleView }))
);
const PrintCenterModal = lazy(() =>
  import('./components/PrintCenterModal').then((m) => ({ default: m.PrintCenterModal }))
);
const PublicTrackPortal = lazy(() =>
  import('./components/PublicTrackPortal').then((m) => ({ default: m.PublicTrackPortal }))
);
const SettingsBranchesView = lazy(() =>
  import('./components/SettingsBranchesView').then((m) => ({
    default: m.SettingsBranchesView,
  }))
);
import {
  EMPTY_ERP_STATE,
  clearErpState,
  loadAuthSession,
  loadErpState,
  loadSupabaseConfig,
  saveAuthSession,
  saveErpState,
} from './services/storageService';
import {
  adjustCatalogStockAtomic,
  allocateOrderFolioAtomic,
  checkAppUsernameAvailable,
  deleteAppUserFromSupabase,
  deleteBranchFromSupabase,
  deleteCatalogItemFromSupabase,
  deleteClientFromSupabase,
  deleteCustomerAssetFromSupabase,
  deleteLoanAssetFromSupabase,
  deleteOrderItemFromSupabase,
  deleteOrderPaymentFromSupabase,
  deleteOrderPhotoFromSupabase,
  deleteWorkOrderFromSupabase,
  isSupabaseLive,
  pullSupabaseErpState,
  revalidateAppUserSession,
  syncAppUserToSupabase,
  syncAppointmentToSupabase,
  syncAssetToSupabase,
  syncBranchToSupabase,
  syncCatalogItemToSupabase,
  syncClientToSupabase,
  syncLoanAssetToSupabase,
  syncNewTenantBundleToSupabase,
  syncTenantToSupabase,
  syncWorkOrderToSupabase,
} from './services/supabaseService';
import type {
  AppUser,
  Appointment,
  AuthSessionUser,
  Branch,
  CatalogItem,
  Client,
  CustomerAsset,
  ErpState,
  IndustrySector,
  LoanAsset,
  NavSection,
  RoleType,
  SupabaseConfig,
  Tenant,
  WorkOrder,
} from './types/erp';
import {
  canDeleteBranchSafely,
  canDeleteCatalogItemSafely,
  canDeleteClientSafely,
  canDeleteCustomerAssetSafely,
  canDeleteLoanAssetSafely,
  canDeleteWorkOrderSafely,
  canViewGlobalScope,
  filterLowStockCatalogItems,
  getRolePermissions,
  getVisibleTenantsForScope,
  hasActiveUnreturnedLoan,
  sanitizeOrderUpdateForRole,
} from './utils/erpLogic';
import { generateUUID } from './utils/uuid';

function getInitialTrackFromUrl(): { isTrack: boolean; code: string } {
  if (typeof window === 'undefined') return { isTrack: false, code: '' };
  const params = new URLSearchParams(window.location.search);
  const hasTrackParam = params.has('track') || params.has('code');
  const trackParam = params.get('track') ?? params.get('code') ?? '';
  const pathIsTrack = window.location.pathname.replace(/\/+$/, '') === '/track';
  return {
    isTrack: pathIsTrack || hasTrackParam,
    code: trackParam.trim().toUpperCase(),
  };
}

export default function App() {
  const [erpState, setErpState] = useState<ErpState>(() => loadErpState());
  const erpStateRef = useRef<ErpState>(erpState);
  erpStateRef.current = erpState;

  const commitErpState = (updater: (prev: ErpState) => ErpState): ErpState => {
    const next = updater(erpStateRef.current);
    erpStateRef.current = next;
    setErpState(next);
    return next;
  };
  const [supabaseConfig] = useState<SupabaseConfig>(() =>
    loadSupabaseConfig()
  );
  const [authSession, setAuthSession] = useState<AuthSessionUser | null>(() =>
    loadAuthSession()
  );

  const initialTrack = useMemo(() => getInitialTrackFromUrl(), []);

  const [activeSection, setActiveSection] = useState<NavSection>(
    initialTrack.isTrack ? 'track' : 'dashboard'
  );
  const [activeTenantId, setActiveTenantId] = useState<string>(() => {
    const sess = loadAuthSession();
    if (sess?.tenant_id) return sess.tenant_id;
    return loadErpState().tenants[0]?.id ?? '';
  });
  const [activeBranchId, setActiveBranchId] = useState<string>(() => {
    const sess = loadAuthSession();
    return sess?.branch_id ?? 'ALL';
  });
  const [activeRole, setActiveRole] = useState<RoleType>(() => {
    const sess = loadAuthSession();
    return sess?.role ?? 'admin';
  });
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [trackInitialCode, setTrackInitialCode] = useState<string>(initialTrack.code);
  const [globalSearch, setGlobalSearch] = useState('');
  const [settingsInitialTab, setSettingsInitialTab] = useState<'company' | 'users'>(
    'company'
  );

  const [showNewOrderModal, setShowNewOrderModal] = useState(false);
  const [showNewTenantModal, setShowNewTenantModal] = useState(false);
  const [orderPrefill, setOrderPrefill] = useState<NewOrderPrefill | null>(null);
  const [orderCreatedConfirm, setOrderCreatedConfirm] = useState<{
    id: string;
    folio: string;
    trackingCode: string;
  } | null>(null);
  const [printOrderId, setPrintOrderId] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [appNotice, setAppNotice] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const trackSync = (promise: Promise<{ ok: boolean; error?: string }>) => {
    void promise.then((res) => {
      if (!res.ok && res.error) {
        setSyncError(res.error);
      }
    });
  };

  useEffect(() => {
    if (!authSession) return;
    saveErpState(erpState, { stripCredentials: isSupabaseLive(supabaseConfig) });
  }, [authSession, erpState, supabaseConfig]);

  useEffect(() => {
    saveAuthSession(authSession);
  }, [authSession]);

  // Revalidate active user & auto-pull scoped data from Supabase when session is restored
  useEffect(() => {
    if (!authSession || !isSupabaseLive(supabaseConfig)) return;
    let cancelled = false;
    (async () => {
      const valRes = await revalidateAppUserSession(supabaseConfig, authSession);
      if (cancelled) return;
      if (!valRes.ok && valRes.inactive) {
        handleSignOut();
        setAuthNotice(
          valRes.error ??
            'Tu sesión fue cerrada porque tu cuenta fue desactivada o eliminada.'
        );
        return;
      }
      const verifiedSession = valRes.ok && valRes.user ? valRes.user : authSession;
      if (valRes.ok && valRes.user) {
        setAuthSession(valRes.user);
      }
      const scope =
        verifiedSession.role === 'superadmin'
          ? undefined
          : {
              tenantId: verifiedSession.tenant_id,
              branchId: verifiedSession.branch_id,
            };
      const res = await pullSupabaseErpState(
        supabaseConfig.url,
        supabaseConfig.anonKey,
        scope
      );
      if (cancelled) return;
      if (res.ok && res.data) {
        handleSyncFromSupabase(res.data);
      } else if (!res.ok && res.error) {
        setSyncError(res.error);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Enforce tenant_id, branch_id, and role scoping from logged-in app_users session
  useEffect(() => {
    if (!authSession) return;
    setActiveRole(authSession.role);
    if (authSession.role !== 'superadmin') {
      if (authSession.tenant_id) {
        setActiveTenantId(authSession.tenant_id);
      }
      if (authSession.branch_id) {
        setActiveBranchId(authSession.branch_id);
      }
    }
  }, [authSession]);

  // Guard restricted sections when activeRole switches to receptionist or technician
  useEffect(() => {
    const perms = getRolePermissions(activeRole);
    if (
      (activeSection === 'settings' || activeSection === 'migration') &&
      !perms.canEditSettings &&
      activeRole !== 'superadmin'
    ) {
      setActiveSection('console');
    }
  }, [activeRole, activeSection]);

  const allowGlobalScope = canViewGlobalScope(activeRole, authSession?.role);
  const lockedBranchId =
    authSession && authSession.role !== 'superadmin' ? authSession.branch_id : null;

  const effectiveTenantId =
    authSession && authSession.role !== 'superadmin' && authSession.tenant_id
      ? authSession.tenant_id
      : activeTenantId;

  const activeTenant = useMemo(
    () =>
      erpState.tenants.find((t) => t.id === effectiveTenantId) ??
      erpState.tenants[0],
    [erpState.tenants, effectiveTenantId]
  );

  const openOrdersCount = useMemo(
    () =>
      activeTenant
        ? erpState.workOrders.filter(
            (o) =>
              o.tenant_id === activeTenant.id &&
              (activeBranchId === 'ALL' || o.branch_id === activeBranchId) &&
              o.status !== 'delivered'
          ).length
        : 0,
    [erpState.workOrders, activeTenant, activeBranchId]
  );

  const lowStockItems = useMemo(
    () =>
      activeTenant
        ? filterLowStockCatalogItems(
            erpState.catalogItems,
            activeTenant.id,
            activeBranchId
          )
        : [],
    [erpState.catalogItems, activeTenant, activeBranchId]
  );

  const lowStockCount = lowStockItems.length;

  const readyOrders = useMemo(
    () =>
      activeTenant
        ? erpState.workOrders.filter(
            (o) =>
              o.tenant_id === activeTenant.id &&
              (activeBranchId === 'ALL' || o.branch_id === activeBranchId) &&
              o.status === 'ready'
          )
        : [],
    [erpState.workOrders, activeTenant, activeBranchId]
  );

  const scheduledAppointments = useMemo(
    () =>
      activeTenant
        ? erpState.appointments.filter(
            (a) =>
              a.tenant_id === activeTenant.id &&
              (activeBranchId === 'ALL' || a.branch_id === activeBranchId) &&
              a.status === 'scheduled'
          )
        : [],
    [erpState.appointments, activeTenant, activeBranchId]
  );

  const scheduledAppointmentsCount = scheduledAppointments.length;

  const navigateSection = (section: NavSection) => {
    setActiveSection(section);
    if (typeof window !== 'undefined') {
      try {
        const targetPath = section === 'track' ? '/track' : '/';
        if (window.location.pathname !== targetPath) {
          window.history.pushState({}, '', targetPath);
        }
      } catch {
        // Ignore history restrictions
      }
    }
  };

  const handleSelectTenant = (tenantId: string) => {
    if (!canViewGlobalScope(activeRole, authSession?.role)) return;
    setActiveTenantId(tenantId);
    setActiveBranchId('ALL');
    const firstOrder = erpState.workOrders.find((o) => o.tenant_id === tenantId);
    setSelectedOrderId(firstOrder?.id ?? null);
  };

  const handleRefreshSync = async () => {
    if (!authSession || isSyncing || !isSupabaseLive(supabaseConfig)) return;
    setIsSyncing(true);
    setSyncError(null);
    try {
      const valRes = await revalidateAppUserSession(supabaseConfig, authSession);
      if (!valRes.ok && valRes.inactive) {
        handleSignOut();
        setAuthNotice(
          valRes.error ??
            'Tu sesión fue cerrada porque tu cuenta fue desactivada o eliminada.'
        );
        return;
      }
      const verified = valRes.ok && valRes.user ? valRes.user : authSession;
      if (valRes.ok && valRes.user) {
        setAuthSession(valRes.user);
      }
      const scope =
        verified.role === 'superadmin'
          ? undefined
          : { tenantId: verified.tenant_id, branchId: verified.branch_id };
      const res = await pullSupabaseErpState(
        supabaseConfig.url,
        supabaseConfig.anonKey,
        scope
      );
      if (res.ok && res.data) {
        handleSyncFromSupabase(res.data);
        setAppNotice('Datos sincronizados correctamente desde Supabase.');
      } else if (!res.ok && res.error) {
        setSyncError(res.error);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCreateTenant = async (input: {
    name: string;
    tax_id: string;
    sector: IndustrySector;
    city: string;
    adminUsername: string;
    adminPassword: string;
    adminFullName: string;
  }): Promise<{ ok: boolean; error?: string }> => {
    if (!canViewGlobalScope(activeRole, authSession?.role)) {
      return { ok: false, error: 'Solo SuperAdmin Global puede crear empresas.' };
    }
    const cleanUsername = input.adminUsername.trim().replace(/^@+/, '');
    const duplicate = erpStateRef.current.appUsers.some(
      (u) => u.username.trim().toLowerCase() === cleanUsername.toLowerCase()
    );
    if (duplicate) {
      return {
        ok: false,
        error: `El usuario "@${cleanUsername}" ya está registrado en FixiCloud.`,
      };
    }

    const avail = await checkAppUsernameAvailable(supabaseConfig, cleanUsername);
    if (!avail.available) {
      return {
        ok: false,
        error:
          avail.error ??
          `El usuario "@${cleanUsername}" ya existe en Supabase. Elige otro nombre de usuario.`,
      };
    }

    const tenantId = generateUUID();
    const branchId = generateUUID();
    const newTenant: Tenant = {
      id: tenantId,
      name: input.name,
      tax_id: input.tax_id,
      sector: input.sector,
      currency: 'CLP',
      iva_rate: 19,
      folio_prefix: input.name.slice(0, 2).toUpperCase() || 'OT',
      whatsapp_enabled: true,
      whatsapp_templates: {
        intake:
          'Hola {cliente}, confirmamos el ingreso de tu {equipo} en {empresa} ({sucursal}). Folio: {folio}. Código seguimiento: {codigo}.',
        quote_ready:
          'Hola {cliente}, presupuesto listo para {folio} ({equipo}): {diagnostico}. Total: {total}.',
        ready_for_pickup:
          'Hola {cliente}, tu {equipo} ({folio}) está LISTO para retiro en {sucursal}. Saldo pendiente: {saldo}. Horario: {horario}.',
      },
      phone: '',
      email: '',
      created_at: new Date().toISOString(),
    };
    const hqBranch: Branch = {
      id: branchId,
      tenant_id: tenantId,
      name: `Casa Matriz ${input.city}`,
      code: 'HQ-01',
      is_hq: true,
      address: 'Dirección principal por definir',
      city: input.city,
      phone: '',
      business_hours: 'Lun-Vie 09:00 - 18:30',
    };

    const initialAdmin: AppUser = {
      id: generateUUID(),
      tenant_id: tenantId,
      branch_id: null,
      username: cleanUsername,
      pin_or_password: input.adminPassword.trim(),
      full_name: input.adminFullName.trim() || `Administrador ${input.name}`,
      role: 'admin',
      is_active: true,
      created_at: new Date().toISOString(),
    };

    const syncRes = await syncNewTenantBundleToSupabase(supabaseConfig, {
      tenant: newTenant,
      branch: hqBranch,
      users: [initialAdmin],
    });
    if (!syncRes.ok) {
      return {
        ok: false,
        error: syncRes.error ?? 'Error sincronizando la empresa en Supabase.',
      };
    }

    commitErpState((prev) => ({
      ...prev,
      tenants: [...prev.tenants, newTenant],
      branches: [...prev.branches, hqBranch],
      appUsers: [initialAdmin, ...prev.appUsers],
    }));

    setActiveTenantId(tenantId);
    setActiveBranchId('ALL');
    setSelectedOrderId(null);
    return { ok: true };
  };

  const handleUpdateTenant = async (
    updated: Tenant
  ): Promise<{ ok: boolean; error?: string }> => {
    const perms = getRolePermissions(activeRole);
    if (!perms.canEditSettings && activeRole !== 'superadmin') {
      return { ok: false, error: 'Sin permisos para editar configuración de empresa.' };
    }
    if (!allowGlobalScope && activeTenant && updated.id !== activeTenant.id) {
      return { ok: false, error: 'No puedes modificar otra empresa.' };
    }
    const res = await syncTenantToSupabase(supabaseConfig, updated);
    if (!res.ok) {
      if (res.error) setSyncError(res.error);
      return res;
    }
    commitErpState((prev) => ({
      ...prev,
      tenants: prev.tenants.map((t) => (t.id === updated.id ? updated : t)),
    }));
    return { ok: true };
  };

  const handleAddBranch = async (
    branch: Branch
  ): Promise<{ ok: boolean; error?: string }> => {
    const perms = getRolePermissions(activeRole);
    if (!perms.canEditSettings && activeRole !== 'superadmin') {
      return { ok: false, error: 'Sin permisos para crear sucursales.' };
    }
    if (!allowGlobalScope && lockedBranchId) {
      return {
        ok: false,
        error: 'Tu cuenta está asignada a una sucursal específica y no puede crear nuevas sucursales.',
      };
    }
    if (!allowGlobalScope && activeTenant && branch.tenant_id !== activeTenant.id) {
      return { ok: false, error: 'No puedes crear sucursales para otra empresa.' };
    }
    const res = await syncBranchToSupabase(supabaseConfig, branch);
    if (!res.ok) {
      if (res.error) setSyncError(res.error);
      return res;
    }
    commitErpState((prev) => ({
      ...prev,
      branches: [...prev.branches, branch],
    }));
    return { ok: true };
  };

  const handleDeleteBranch = async (
    branchId: string
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!getRolePermissions(activeRole).canDeleteBranch) {
      return { ok: false, error: 'Sin permisos para eliminar sucursales.' };
    }
    if (!allowGlobalScope && lockedBranchId) {
      return {
        ok: false,
        error: 'Tu cuenta está asignada a una sucursal específica y no puede eliminar sucursales.',
      };
    }
    const targetBranch = erpStateRef.current.branches.find((b) => b.id === branchId);
    if (!targetBranch) {
      return { ok: false, error: 'Sucursal no encontrada.' };
    }
    if (!allowGlobalScope && activeTenant && targetBranch.tenant_id !== activeTenant.id) {
      return { ok: false, error: 'No puedes eliminar sucursales de otra empresa.' };
    }
    const check = canDeleteBranchSafely(branchId, erpStateRef.current);
    if (!check.ok) {
      return { ok: false, error: check.error };
    }
    const res = await deleteBranchFromSupabase(supabaseConfig, branchId);
    if (!res.ok) {
      return res;
    }
    commitErpState((prev) => ({
      ...prev,
      branches: prev.branches.filter((b) => b.id !== branchId),
    }));
    if (activeBranchId === branchId) setActiveBranchId('ALL');
    return { ok: true };
  };

  const handleAddAppUser = async (
    user: AppUser
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!getRolePermissions(activeRole).canManageUsers) {
      return { ok: false, error: 'Sin permisos para gestionar usuarios.' };
    }
    if (
      !allowGlobalScope &&
      (user.role === 'superadmin' || (activeTenant && user.tenant_id !== activeTenant.id))
    ) {
      return {
        ok: false,
        error: 'Solo SuperAdmin Global puede crear cuentas globales o de otras empresas.',
      };
    }
    if (!allowGlobalScope && lockedBranchId && user.branch_id !== lockedBranchId) {
      return {
        ok: false,
        error: 'Tu sesión está restringida a su sucursal; solo puedes asignar usuarios a tu misma sucursal.',
      };
    }
    const avail = await checkAppUsernameAvailable(supabaseConfig, user.username);
    if (!avail.available) {
      return {
        ok: false,
        error:
          avail.error ??
          `El usuario "@${user.username}" ya está registrado en Supabase.`,
      };
    }
    const res = await syncAppUserToSupabase(supabaseConfig, user, { isNew: true });
    if (!res.ok) return res;
    commitErpState((prev) => ({
      ...prev,
      appUsers: [user, ...prev.appUsers],
    }));
    return { ok: true };
  };

  const handleUpdateAppUser = async (
    updated: AppUser
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!getRolePermissions(activeRole).canManageUsers) {
      return { ok: false, error: 'Sin permisos para gestionar usuarios.' };
    }
    const existing = erpStateRef.current.appUsers.find((u) => u.id === updated.id);
    if (
      !allowGlobalScope &&
      ((existing &&
        (existing.role === 'superadmin' ||
          (activeTenant && existing.tenant_id !== activeTenant.id))) ||
        updated.role === 'superadmin' ||
        (activeTenant && updated.tenant_id !== activeTenant.id))
    ) {
      return {
        ok: false,
        error: 'Solo SuperAdmin Global puede editar cuentas globales o de otras empresas.',
      };
    }
    if (
      !allowGlobalScope &&
      lockedBranchId &&
      ((existing && existing.branch_id !== lockedBranchId) ||
        updated.branch_id !== lockedBranchId)
    ) {
      return {
        ok: false,
        error: 'Solo puedes gestionar usuarios pertenecientes a tu propia sucursal.',
      };
    }
    const hasNewPassword = updated.pin_or_password.trim().length > 0;
    const res = await syncAppUserToSupabase(supabaseConfig, updated, {
      isNew: hasNewPassword,
    });
    if (!res.ok) return res;
    const nextState = commitErpState((prev) => ({
      ...prev,
      appUsers: prev.appUsers.map((u) => (u.id === updated.id ? updated : u)),
    }));
    setAuthSession((prev) => {
      if (!prev || prev.id !== updated.id) return prev;
      const nextTenant = updated.tenant_id
        ? nextState.tenants.find((t) => t.id === updated.tenant_id) ?? prev.tenant
        : null;
      const nextBranch = updated.branch_id
        ? nextState.branches.find((b) => b.id === updated.branch_id) ?? prev.branch
        : null;
      return {
        ...prev,
        username: updated.username,
        full_name: updated.full_name,
        role: updated.role,
        tenant_id: updated.tenant_id,
        branch_id: updated.branch_id,
        tenant: nextTenant,
        branch: nextBranch,
      };
    });
    return { ok: true };
  };

  const handleDeleteAppUser = async (
    userId: string
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!getRolePermissions(activeRole).canManageUsers) {
      return { ok: false, error: 'Sin permisos para gestionar usuarios.' };
    }
    if (authSession?.id === userId) {
      return {
        ok: false,
        error: 'No puedes eliminar tu propia cuenta mientras tienes la sesión activa.',
      };
    }
    const targetUser = erpStateRef.current.appUsers.find((u) => u.id === userId);
    if (
      !allowGlobalScope &&
      targetUser &&
      (targetUser.role === 'superadmin' ||
        (activeTenant && targetUser.tenant_id !== activeTenant.id))
    ) {
      return {
        ok: false,
        error: 'Solo SuperAdmin Global puede eliminar cuentas globales o de otras empresas.',
      };
    }
    if (
      !allowGlobalScope &&
      lockedBranchId &&
      targetUser &&
      targetUser.branch_id !== lockedBranchId
    ) {
      return {
        ok: false,
        error: 'Solo puedes eliminar usuarios pertenecientes a tu propia sucursal.',
      };
    }
    const res = await deleteAppUserFromSupabase(supabaseConfig, userId);
    if (!res.ok) return res;
    commitErpState((prev) => ({
      ...prev,
      appUsers: prev.appUsers.filter((u) => u.id !== userId),
    }));
    return { ok: true };
  };

  const handleUpdateOrder = (updated: WorkOrder) => {
    const current = erpStateRef.current;
    const existing = current.workOrders.find((o) => o.id === updated.id);
    if (existing && !allowGlobalScope && activeTenant && existing.tenant_id !== activeTenant.id) {
      return;
    }
    if (existing && lockedBranchId && existing.branch_id !== lockedBranchId) {
      return;
    }
    const safeUpdated: WorkOrder = existing
      ? sanitizeOrderUpdateForRole(existing, updated, activeRole)
      : updated;

    if (
      safeUpdated.status === 'delivered' &&
      hasActiveUnreturnedLoan(existing ?? safeUpdated)
    ) {
      setSyncError(
        'Registra primero la devolución del equipo en préstamo antes de marcar la orden como Entregado.'
      );
      return;
    }

    const syncItems = !existing || existing.items !== safeUpdated.items;
    const syncPayments = !existing || existing.payments !== safeUpdated.payments;
    const syncPhotos = !existing || existing.photos !== safeUpdated.photos;
    const syncLoan = !existing || existing.loan !== safeUpdated.loan;

    const nextState = commitErpState((prev) => ({
      ...prev,
      workOrders: prev.workOrders.map((o) => (o.id === safeUpdated.id ? safeUpdated : o)),
    }));
    const orderTenant = nextState.tenants.find((t) => t.id === safeUpdated.tenant_id);
    trackSync(
      syncWorkOrderToSupabase(
        supabaseConfig,
        safeUpdated,
        orderTenant?.iva_rate ?? 19,
        nextState.catalogItems,
        { syncItems, syncPayments, syncPhotos, syncLoan }
      )
    );
  };

  const handleCreateOrder = async (payload: {
    newClient?: Client;
    newAsset?: CustomerAsset;
    order: WorkOrder;
    sourceAppointmentId?: string;
  }): Promise<{ ok: boolean; error?: string }> => {
    if (!getRolePermissions(activeRole).canCreateOrder) {
      return { ok: false, error: 'Sin permisos para crear órdenes.' };
    }
    if (!allowGlobalScope && activeTenant && payload.order.tenant_id !== activeTenant.id) {
      return { ok: false, error: 'No puedes crear órdenes en otra empresa.' };
    }
    const scopedOrder: WorkOrder = lockedBranchId
      ? { ...payload.order, branch_id: lockedBranchId }
      : payload.order;

    if (payload.newClient) {
      const clientRes = await syncClientToSupabase(supabaseConfig, payload.newClient);
      if (!clientRes.ok) return clientRes;
    }
    if (payload.newAsset) {
      const assetRes = await syncAssetToSupabase(supabaseConfig, payload.newAsset);
      if (!assetRes.ok) return assetRes;
    }

    const currentSnapshot = erpStateRef.current;
    const orderTenant = currentSnapshot.tenants.find((t) => t.id === scopedOrder.tenant_id);
    const orderRes = await syncWorkOrderToSupabase(
      supabaseConfig,
      scopedOrder,
      orderTenant?.iva_rate ?? 19,
      currentSnapshot.catalogItems
    );
    if (!orderRes.ok) return orderRes;

    const nextState = commitErpState((prev) => ({
      ...prev,
      clients: payload.newClient ? [payload.newClient, ...prev.clients] : prev.clients,
      assets: payload.newAsset ? [payload.newAsset, ...prev.assets] : prev.assets,
      workOrders: [scopedOrder, ...prev.workOrders],
      appointments: payload.sourceAppointmentId
        ? prev.appointments.map((apt) =>
            apt.id === payload.sourceAppointmentId
              ? { ...apt, work_order_id: scopedOrder.id, status: 'completed' }
              : apt
          )
        : prev.appointments,
    }));

    if (payload.sourceAppointmentId) {
      const src = nextState.appointments.find(
        (a) => a.id === payload.sourceAppointmentId
      );
      if (src) {
        trackSync(syncAppointmentToSupabase(supabaseConfig, src));
      }
    }

    setSelectedOrderId(scopedOrder.id);
    setShowNewOrderModal(false);
    setOrderPrefill(null);
    setOrderCreatedConfirm({
      id: scopedOrder.id,
      folio: scopedOrder.folio,
      trackingCode: scopedOrder.tracking_code,
    });
    return { ok: true };
  };

  const handleDeleteOrder = async (
    orderId: string
  ): Promise<{ ok: boolean; error?: string }> => {
    if (activeRole !== 'admin' && activeRole !== 'superadmin') {
      return {
        ok: false,
        error: 'Solo Admin o SuperAdmin puede eliminar órdenes de trabajo.',
      };
    }
    const existing = erpStateRef.current.workOrders.find((o) => o.id === orderId);
    if (!existing) return { ok: false, error: 'Orden no encontrada.' };
    if (!allowGlobalScope && activeTenant && existing.tenant_id !== activeTenant.id) {
      return { ok: false, error: 'No puedes eliminar órdenes de otra empresa.' };
    }
    if (lockedBranchId && existing.branch_id !== lockedBranchId) {
      return { ok: false, error: 'No puedes eliminar órdenes de otra sucursal.' };
    }
    const check = canDeleteWorkOrderSafely(existing);
    if (!check.ok) return check;

    const res = await deleteWorkOrderFromSupabase(supabaseConfig, orderId);
    if (!res.ok) return res;

    const nextState = commitErpState((prev) => ({
      ...prev,
      workOrders: prev.workOrders.filter((o) => o.id !== orderId),
    }));
    if (selectedOrderId === orderId) {
      const nextOrder = nextState.workOrders.find(
        (o) =>
          o.tenant_id === activeTenant?.id &&
          (activeBranchId === 'ALL' || o.branch_id === activeBranchId)
      );
      setSelectedOrderId(nextOrder?.id ?? null);
    }
    return { ok: true };
  };

  const handleAddAppointment = (apt: Appointment) => {
    if (!allowGlobalScope && activeTenant && apt.tenant_id !== activeTenant.id) return;
    const scopedApt: Appointment = lockedBranchId
      ? { ...apt, branch_id: lockedBranchId }
      : apt;
    commitErpState((prev) => ({
      ...prev,
      appointments: [scopedApt, ...prev.appointments],
    }));
    trackSync(syncAppointmentToSupabase(supabaseConfig, scopedApt));
  };

  const handleUpdateAppointment = (updated: Appointment) => {
    const existing = erpStateRef.current.appointments.find((a) => a.id === updated.id);
    if (!allowGlobalScope && activeTenant && updated.tenant_id !== activeTenant.id) return;
    if (lockedBranchId && existing && existing.branch_id !== lockedBranchId) return;
    const scopedApt: Appointment = lockedBranchId
      ? { ...updated, branch_id: lockedBranchId }
      : updated;
    commitErpState((prev) => ({
      ...prev,
      appointments: prev.appointments.map((a) => (a.id === scopedApt.id ? scopedApt : a)),
    }));
    trackSync(syncAppointmentToSupabase(supabaseConfig, scopedApt));
  };

  const handleConvertAppointmentToOrder = (apt: Appointment) => {
    if (!getRolePermissions(activeRole).canCreateOrder) return;
    if (!allowGlobalScope && activeTenant && apt.tenant_id !== activeTenant.id) return;
    if (lockedBranchId && apt.branch_id !== lockedBranchId) return;
    setOrderPrefill({
      clientId: apt.client_id,
      branchId: apt.branch_id,
      modality: apt.modality,
      visitAddress: apt.visit_address ?? '',
      visitScheduledAt: `${apt.date}T${apt.start_time}`,
      technician: apt.technician,
      symptoms: `${apt.subject}${apt.notes ? ` — ${apt.notes}` : ''}`,
      sourceAppointmentId: apt.id,
    });
    setShowNewOrderModal(true);
  };

  const handleUpdateClient = async (
    updated: Client
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!getRolePermissions(activeRole).canManageClients) {
      return { ok: false, error: 'Sin permisos para editar clientes.' };
    }
    if (!allowGlobalScope && activeTenant && updated.tenant_id !== activeTenant.id) {
      return { ok: false, error: 'No puedes editar clientes de otra empresa.' };
    }
    const res = await syncClientToSupabase(supabaseConfig, updated);
    if (!res.ok) {
      if (res.error) setSyncError(res.error);
      return res;
    }
    commitErpState((prev) => ({
      ...prev,
      clients: prev.clients.map((c) => (c.id === updated.id ? updated : c)),
    }));
    return { ok: true };
  };

  const handleAddClient = async (
    client: Client
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!getRolePermissions(activeRole).canManageClients) {
      return { ok: false, error: 'Sin permisos para crear clientes.' };
    }
    if (!allowGlobalScope && activeTenant && client.tenant_id !== activeTenant.id) {
      return { ok: false, error: 'No puedes crear clientes en otra empresa.' };
    }
    const res = await syncClientToSupabase(supabaseConfig, client);
    if (!res.ok) {
      if (res.error) setSyncError(res.error);
      return res;
    }
    commitErpState((prev) => ({
      ...prev,
      clients: [client, ...prev.clients],
    }));
    return { ok: true };
  };

  const handleDeleteClient = async (
    clientId: string
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!getRolePermissions(activeRole).canManageClients) {
      return { ok: false, error: 'Sin permisos para eliminar clientes.' };
    }
    const target = erpStateRef.current.clients.find((c) => c.id === clientId);
    if (!target) return { ok: false, error: 'Cliente no encontrado.' };
    if (!allowGlobalScope && activeTenant && target.tenant_id !== activeTenant.id) {
      return { ok: false, error: 'No puedes eliminar clientes de otra empresa.' };
    }
    const check = canDeleteClientSafely(clientId, erpStateRef.current);
    if (!check.ok) return check;
    const res = await deleteClientFromSupabase(supabaseConfig, clientId);
    if (!res.ok) return res;
    commitErpState((prev) => ({
      ...prev,
      clients: prev.clients.filter((c) => c.id !== clientId),
    }));
    return { ok: true };
  };

  const handleAddAsset = async (
    asset: CustomerAsset
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!getRolePermissions(activeRole).canManageClients) {
      return { ok: false, error: 'Sin permisos para registrar equipos.' };
    }
    if (!allowGlobalScope && activeTenant && asset.tenant_id !== activeTenant.id) {
      return { ok: false, error: 'No puedes registrar equipos en otra empresa.' };
    }
    const res = await syncAssetToSupabase(supabaseConfig, asset);
    if (!res.ok) {
      if (res.error) setSyncError(res.error);
      return res;
    }
    commitErpState((prev) => ({
      ...prev,
      assets: [asset, ...prev.assets],
    }));
    return { ok: true };
  };

  const handleUpdateAsset = async (
    updated: CustomerAsset
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!getRolePermissions(activeRole).canManageClients) {
      return { ok: false, error: 'Sin permisos para editar equipos.' };
    }
    if (!allowGlobalScope && activeTenant && updated.tenant_id !== activeTenant.id) {
      return { ok: false, error: 'No puedes editar equipos de otra empresa.' };
    }
    const res = await syncAssetToSupabase(supabaseConfig, updated);
    if (!res.ok) {
      if (res.error) setSyncError(res.error);
      return res;
    }
    commitErpState((prev) => ({
      ...prev,
      assets: prev.assets.map((a) => (a.id === updated.id ? updated : a)),
    }));
    return { ok: true };
  };

  const handleDeleteAsset = async (
    assetId: string
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!getRolePermissions(activeRole).canManageClients) {
      return { ok: false, error: 'Sin permisos para eliminar equipos.' };
    }
    const target = erpStateRef.current.assets.find((a) => a.id === assetId);
    if (!target) return { ok: false, error: 'Equipo no encontrado.' };
    if (!allowGlobalScope && activeTenant && target.tenant_id !== activeTenant.id) {
      return { ok: false, error: 'No puedes eliminar equipos de otra empresa.' };
    }
    const check = canDeleteCustomerAssetSafely(assetId, erpStateRef.current.workOrders);
    if (!check.ok) return check;
    const res = await deleteCustomerAssetFromSupabase(supabaseConfig, assetId);
    if (!res.ok) return res;
    commitErpState((prev) => ({
      ...prev,
      assets: prev.assets.filter((a) => a.id !== assetId),
    }));
    return { ok: true };
  };

  const handleAdjustCatalogStock = async (
    catalogItemId: string,
    delta: number
  ): Promise<{ ok: boolean; error?: string }> => {
    const perms = getRolePermissions(activeRole);
    if (!perms.canManageStock && !perms.canEditFinancials) {
      return { ok: false, error: 'Sin permisos para modificar stock.' };
    }
    const current = erpStateRef.current;
    const target = current.catalogItems.find((i) => i.id === catalogItemId);
    if (!target) {
      return { ok: false, error: 'Ítem de catálogo no encontrado.' };
    }
    if (!allowGlobalScope && activeTenant && target.tenant_id !== activeTenant.id) {
      return { ok: false, error: 'No puedes modificar inventario de otra empresa.' };
    }
    if (lockedBranchId && target.branch_id !== lockedBranchId) {
      return { ok: false, error: 'No puedes modificar inventario de otra sucursal.' };
    }

    const res = await adjustCatalogStockAtomic(supabaseConfig, {
      itemId: catalogItemId,
      delta,
      fallbackCurrentQty: target.stock_qty,
      category: target.category,
    });
    if (!res.ok) {
      if (res.error && !res.insufficientStock) {
        setSyncError(res.error);
      }
      return { ok: false, error: res.error ?? 'Error ajustando stock.' };
    }

    const resolvedQty = res.newStock ?? Math.max(0, target.stock_qty + delta);
    commitErpState((prev) => ({
      ...prev,
      catalogItems: prev.catalogItems.map((item) =>
        item.id === catalogItemId ? { ...item, stock_qty: resolvedQty } : item
      ),
    }));
    return { ok: true };
  };

  const handleAddCatalogItem = async (
    item: CatalogItem
  ): Promise<{ ok: boolean; error?: string }> => {
    const perms = getRolePermissions(activeRole);
    if (!perms.canManageStock || !perms.canManageCatalogPrices) {
      return { ok: false, error: 'Sin permisos para crear ítems de catálogo.' };
    }
    if (!allowGlobalScope && activeTenant && item.tenant_id !== activeTenant.id) {
      return { ok: false, error: 'No puedes crear ítems para otra empresa.' };
    }
    const scopedItem: CatalogItem = lockedBranchId
      ? { ...item, branch_id: lockedBranchId }
      : item;
    const res = await syncCatalogItemToSupabase(supabaseConfig, scopedItem);
    if (!res.ok) {
      if (res.error) setSyncError(res.error);
      return res;
    }
    commitErpState((prev) => ({
      ...prev,
      catalogItems: [scopedItem, ...prev.catalogItems],
    }));
    return { ok: true };
  };

  const handleUpdateCatalogItem = async (
    updated: CatalogItem
  ): Promise<{ ok: boolean; error?: string }> => {
    const perms = getRolePermissions(activeRole);
    if (!perms.canManageStock || !perms.canManageCatalogPrices) {
      return { ok: false, error: 'Sin permisos para editar ítems de catálogo.' };
    }
    const existing = erpStateRef.current.catalogItems.find((i) => i.id === updated.id);
    if (!allowGlobalScope && activeTenant && updated.tenant_id !== activeTenant.id) {
      return { ok: false, error: 'No puedes editar ítems de otra empresa.' };
    }
    if (
      lockedBranchId &&
      ((existing && existing.branch_id !== lockedBranchId) ||
        updated.branch_id !== lockedBranchId)
    ) {
      return { ok: false, error: 'No puedes editar ítems de otra sucursal.' };
    }
    const res = await syncCatalogItemToSupabase(supabaseConfig, updated);
    if (!res.ok) {
      if (res.error) setSyncError(res.error);
      return res;
    }
    commitErpState((prev) => ({
      ...prev,
      catalogItems: prev.catalogItems.map((i) => (i.id === updated.id ? updated : i)),
    }));
    return { ok: true };
  };

  const handleDeleteCatalogItem = async (
    itemId: string
  ): Promise<{ ok: boolean; error?: string }> => {
    const perms = getRolePermissions(activeRole);
    if (!perms.canManageStock || !perms.canManageCatalogPrices) {
      return { ok: false, error: 'Sin permisos para eliminar ítems de catálogo.' };
    }
    const target = erpStateRef.current.catalogItems.find((i) => i.id === itemId);
    if (!target) return { ok: false, error: 'Ítem no encontrado.' };
    if (!allowGlobalScope && activeTenant && target.tenant_id !== activeTenant.id) {
      return { ok: false, error: 'No puedes eliminar ítems de otra empresa.' };
    }
    if (lockedBranchId && target.branch_id !== lockedBranchId) {
      return { ok: false, error: 'No puedes eliminar ítems de otra sucursal.' };
    }
    const check = canDeleteCatalogItemSafely(itemId, erpStateRef.current.workOrders);
    if (!check.ok) return check;
    const res = await deleteCatalogItemFromSupabase(supabaseConfig, itemId);
    if (!res.ok) return res;
    commitErpState((prev) => ({
      ...prev,
      catalogItems: prev.catalogItems.filter((i) => i.id !== itemId),
    }));
    return { ok: true };
  };

  const handleAddLoanAsset = async (
    loan: LoanAsset
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!getRolePermissions(activeRole).canManageStock) {
      return { ok: false, error: 'Sin permisos para registrar equipos de préstamo.' };
    }
    if (!allowGlobalScope && activeTenant && loan.tenant_id !== activeTenant.id) {
      return { ok: false, error: 'No puedes crear equipos en otra empresa.' };
    }
    const scopedLoan: LoanAsset = lockedBranchId
      ? { ...loan, branch_id: lockedBranchId }
      : loan;
    const res = await syncLoanAssetToSupabase(supabaseConfig, scopedLoan);
    if (!res.ok) {
      if (res.error) setSyncError(res.error);
      return res;
    }
    commitErpState((prev) => ({
      ...prev,
      loanAssets: [scopedLoan, ...prev.loanAssets],
    }));
    return { ok: true };
  };

  const handleUpdateLoanAsset = async (
    updated: LoanAsset
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!getRolePermissions(activeRole).canManageStock) {
      return { ok: false, error: 'Sin permisos para editar equipos de préstamo.' };
    }
    const existing = erpStateRef.current.loanAssets.find((l) => l.id === updated.id);
    if (!allowGlobalScope && activeTenant && updated.tenant_id !== activeTenant.id) {
      return { ok: false, error: 'No puedes editar equipos de otra empresa.' };
    }
    if (
      lockedBranchId &&
      ((existing && existing.branch_id !== lockedBranchId) ||
        updated.branch_id !== lockedBranchId)
    ) {
      return { ok: false, error: 'No puedes editar equipos de otra sucursal.' };
    }
    const res = await syncLoanAssetToSupabase(supabaseConfig, updated);
    if (!res.ok) {
      if (res.error) setSyncError(res.error);
      return res;
    }
    commitErpState((prev) => ({
      ...prev,
      loanAssets: prev.loanAssets.map((l) => (l.id === updated.id ? updated : l)),
    }));
    return { ok: true };
  };

  const handleDeleteLoanAsset = async (
    loanId: string
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!getRolePermissions(activeRole).canManageStock) {
      return { ok: false, error: 'Sin permisos para eliminar equipos de préstamo.' };
    }
    const target = erpStateRef.current.loanAssets.find((l) => l.id === loanId);
    if (!target) return { ok: false, error: 'Equipo de préstamo no encontrado.' };
    if (!allowGlobalScope && activeTenant && target.tenant_id !== activeTenant.id) {
      return { ok: false, error: 'No puedes eliminar equipos de otra empresa.' };
    }
    if (lockedBranchId && target.branch_id !== lockedBranchId) {
      return { ok: false, error: 'No puedes eliminar equipos de otra sucursal.' };
    }
    const check = canDeleteLoanAssetSafely(target, erpStateRef.current.workOrders);
    if (!check.ok) return check;
    const res = await deleteLoanAssetFromSupabase(supabaseConfig, loanId);
    if (!res.ok) return res;
    commitErpState((prev) => ({
      ...prev,
      loanAssets: prev.loanAssets.filter((l) => l.id !== loanId),
    }));
    return { ok: true };
  };

  const handleUpdateLoanStatus = (loanId: string, status: LoanAsset['status']) => {
    if (!getRolePermissions(activeRole).canManageStock) return;
    const current = erpStateRef.current;
    const target = current.loanAssets.find((l) => l.id === loanId);
    if (!target) return;
    if (!allowGlobalScope && activeTenant && target.tenant_id !== activeTenant.id) return;
    if (lockedBranchId && target.branch_id !== lockedBranchId) return;
    commitErpState((prev) => ({
      ...prev,
      loanAssets: prev.loanAssets.map((l) => (l.id === loanId ? { ...l, status } : l)),
    }));
    trackSync(syncLoanAssetToSupabase(supabaseConfig, { ...target, status }));
  };

  const handleAssignLoanAsset = async (
    orderId: string,
    loanAssetId: string,
    notes: string
  ) => {
    const perms = getRolePermissions(activeRole);
    if (!perms.canManageOrderLoans) return;
    const current = erpStateRef.current;
    const asset = current.loanAssets.find((l) => l.id === loanAssetId);
    const targetOrder = current.workOrders.find((o) => o.id === orderId);
    if (!asset || !targetOrder) return;
    if (asset.status !== 'available') return;
    if (asset.branch_id !== targetOrder.branch_id) return;
    if (lockedBranchId && targetOrder.branch_id !== lockedBranchId) return;
    if (targetOrder.loan && !targetOrder.loan.returned_at) return;
    if (
      !allowGlobalScope &&
      activeTenant &&
      (targetOrder.tenant_id !== activeTenant.id || asset.tenant_id !== activeTenant.id)
    ) {
      return;
    }
    const prevLoanAssets = current.loanAssets;
    const prevWorkOrders = current.workOrders;
    const now = new Date().toISOString();
    const newLoan = {
      id: generateUUID(),
      loan_asset_id: asset.id,
      asset_code: asset.code,
      asset_name: asset.name,
      loaned_at: now,
      delivery_notes: notes,
    };
    const nextOrder: WorkOrder = {
      ...targetOrder,
      updated_at: now,
      loan: newLoan,
    };
    const nextState = commitErpState((prev) => ({
      ...prev,
      loanAssets: prev.loanAssets.map((l) =>
        l.id === loanAssetId ? { ...l, status: 'loaned' } : l
      ),
      workOrders: prev.workOrders.map((o) => (o.id === orderId ? nextOrder : o)),
    }));
    const orderTenant = nextState.tenants.find((t) => t.id === targetOrder.tenant_id);
    const loanRes = await syncLoanAssetToSupabase(supabaseConfig, {
      ...asset,
      status: 'loaned',
    });
    if (!loanRes.ok) {
      commitErpState((prev) => ({
        ...prev,
        loanAssets: prevLoanAssets,
        workOrders: prevWorkOrders,
      }));
      if (loanRes.error) setSyncError(loanRes.error);
      return;
    }
    const woRes = await syncWorkOrderToSupabase(
      supabaseConfig,
      nextOrder,
      orderTenant?.iva_rate ?? 19,
      nextState.catalogItems,
      { syncItems: false, syncPayments: false, syncPhotos: false, syncLoan: true }
    );
    if (!woRes.ok) {
      await syncLoanAssetToSupabase(supabaseConfig, asset);
      commitErpState((prev) => ({
        ...prev,
        loanAssets: prevLoanAssets,
        workOrders: prevWorkOrders,
      }));
      if (woRes.error) setSyncError(woRes.error);
    }
  };

  const handleReturnLoanAsset = async (orderId: string) => {
    const perms = getRolePermissions(activeRole);
    if (!perms.canManageOrderLoans) return;
    const current = erpStateRef.current;
    const order = current.workOrders.find((o) => o.id === orderId);
    if (!order?.loan || order.loan.returned_at) return;
    if (!allowGlobalScope && activeTenant && order.tenant_id !== activeTenant.id) return;
    if (lockedBranchId && order.branch_id !== lockedBranchId) return;
    const prevLoanAssets = current.loanAssets;
    const prevWorkOrders = current.workOrders;
    const loanAssetId = order.loan.loan_asset_id;
    const now = new Date().toISOString();
    const loanAsset = current.loanAssets.find((l) => l.id === loanAssetId);
    const nextOrder: WorkOrder = {
      ...order,
      updated_at: now,
      loan: { ...order.loan, returned_at: now },
    };
    const nextState = commitErpState((prev) => ({
      ...prev,
      loanAssets: prev.loanAssets.map((l) =>
        l.id === loanAssetId ? { ...l, status: 'available' } : l
      ),
      workOrders: prev.workOrders.map((o) => (o.id === orderId ? nextOrder : o)),
    }));
    const orderTenant = nextState.tenants.find((t) => t.id === order.tenant_id);
    if (loanAsset) {
      const loanRes = await syncLoanAssetToSupabase(supabaseConfig, {
        ...loanAsset,
        status: 'available',
      });
      if (!loanRes.ok) {
        commitErpState((prev) => ({
          ...prev,
          loanAssets: prevLoanAssets,
          workOrders: prevWorkOrders,
        }));
        if (loanRes.error) setSyncError(loanRes.error);
        return;
      }
    }
    const woRes = await syncWorkOrderToSupabase(
      supabaseConfig,
      nextOrder,
      orderTenant?.iva_rate ?? 19,
      nextState.catalogItems,
      { syncItems: false, syncPayments: false, syncPhotos: false, syncLoan: true }
    );
    if (!woRes.ok) {
      if (loanAsset) {
        await syncLoanAssetToSupabase(supabaseConfig, loanAsset);
      }
      commitErpState((prev) => ({
        ...prev,
        loanAssets: prevLoanAssets,
        workOrders: prevWorkOrders,
      }));
      if (woRes.error) setSyncError(woRes.error);
    }
  };

  const handleSyncFromSupabase = (partial: Partial<ErpState>) => {
    commitErpState((prev) => ({
      tenants: partial.tenants ?? prev.tenants,
      branches: partial.branches ?? prev.branches,
      appUsers: partial.appUsers ?? prev.appUsers,
      clients: partial.clients ?? prev.clients,
      assets: partial.assets ?? prev.assets,
      catalogItems: partial.catalogItems ?? prev.catalogItems,
      loanAssets: partial.loanAssets ?? prev.loanAssets,
      workOrders: partial.workOrders ?? prev.workOrders,
      appointments: partial.appointments ?? prev.appointments,
    }));
  };

  const handleAuthSuccess = async (user: AuthSessionUser) => {
    commitErpState((prev) => ({
      ...prev,
      tenants:
        user.tenant && !prev.tenants.some((t) => t.id === user.tenant!.id)
          ? [...prev.tenants, user.tenant]
          : prev.tenants,
      branches:
        user.branch && !prev.branches.some((b) => b.id === user.branch!.id)
          ? [...prev.branches, user.branch]
          : prev.branches,
    }));
    setAuthSession(user);
    if (user.tenant_id) setActiveTenantId(user.tenant_id);
    setActiveBranchId(user.branch_id ?? 'ALL');
    setActiveRole(user.role);
    setSelectedOrderId(null);
    setShowAuthModal(false);
    setSyncError(null);
    setAppNotice(null);
    setAuthNotice(null);

    if (isSupabaseLive(supabaseConfig)) {
      const scope =
        user.role === 'superadmin'
          ? undefined
          : { tenantId: user.tenant_id, branchId: user.branch_id };
      const res = await pullSupabaseErpState(
        supabaseConfig.url,
        supabaseConfig.anonKey,
        scope
      );
      if (res.ok && res.data) {
        handleSyncFromSupabase(res.data);
      } else if (!res.ok && res.error) {
        setSyncError(res.error);
      }
    }
  };

  const handleSignOut = () => {
    clearErpState();
    erpStateRef.current = EMPTY_ERP_STATE;
    setErpState(EMPTY_ERP_STATE);
    setAuthSession(null);
    setActiveRole('admin');
    setActiveTenantId('');
    setActiveBranchId('ALL');
    setSelectedOrderId(null);
    setActiveSection('dashboard');
    setGlobalSearch('');
    setSyncError(null);
    setAppNotice(null);
    setShowNewOrderModal(false);
    setShowNewTenantModal(false);
    setPrintOrderId(null);
    setShowAuthModal(false);
    setOrderCreatedConfirm(null);
  };

  const lazyFallback = (
    <div className="p-8 text-center text-xs font-medium text-slate-500">
      Cargando módulo...
    </div>
  );

  if (activeSection === 'track') {
    return (
      <Suspense fallback={lazyFallback}>
        <PublicTrackPortal
          tenants={erpState.tenants}
          branches={erpState.branches}
          clients={erpState.clients}
          assets={erpState.assets}
          orders={erpState.workOrders}
          supabaseConfig={supabaseConfig}
          initialCode={trackInitialCode}
          onBackToApp={() => navigateSection(authSession ? 'console' : 'dashboard')}
        />
      </Suspense>
    );
  }

  if (!authSession) {
    return (
      <LoginScreen
        supabaseConfig={supabaseConfig}
        appUsers={erpState.appUsers}
        tenants={erpState.tenants}
        branches={erpState.branches}
        initialNotice={authNotice}
        onDismissNotice={() => setAuthNotice(null)}
        onAuthSuccess={handleAuthSuccess}
      />
    );
  }

  if (!activeTenant) {
    return (
      <div
        id="fixicloud-app-shell"
        className="min-h-screen flex items-center justify-center bg-[#F4F6FB] p-6 text-slate-900"
      >
        <div className="w-full max-w-md rounded-2xl bg-white border border-[#D8E4EC] shadow-sm p-6 text-center space-y-4">
          <h1 className="font-display text-lg font-semibold text-slate-900">
            No hay empresas configuradas todavía
          </h1>
          <p className="text-xs text-slate-600 leading-relaxed">
            {allowGlobalScope
              ? 'Crea la primera empresa y su Casa Matriz para comenzar a operar en FixiCloud.'
              : 'Sincronizando empresa o sin empresas asignadas a esta cuenta.'}
          </p>
          {syncError && (
            <AlertBanner
              variant="error"
              message={syncError}
              onDismiss={() => setSyncError(null)}
            />
          )}
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {allowGlobalScope && (
              <button
                type="button"
                onClick={() => setShowNewTenantModal(true)}
                className="rounded-xl bg-[#0A2463] hover:bg-[#1E3A8A] px-4 py-2 text-xs font-semibold text-white transition-colors"
              >
                Crear Primera Empresa
              </button>
            )}
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-xl border border-[#D8E4EC] bg-white hover:bg-[#F4F6FB] px-4 py-2 text-xs font-semibold text-slate-700 transition-colors"
            >
              Cerrar Sesión
            </button>
          </div>
        </div>

        <Suspense fallback={null}>
          {showNewTenantModal && (
            <NewTenantModal
              onClose={() => setShowNewTenantModal(false)}
              onCreate={async (input) => {
                const res = await handleCreateTenant(input);
                if (res.ok) setShowNewTenantModal(false);
                return res;
              }}
            />
          )}
        </Suspense>
      </div>
    );
  }

  const printOrder = printOrderId
    ? erpState.workOrders.find((o) => o.id === printOrderId) ?? null
    : null;
  const printTenant = printOrder
    ? erpState.tenants.find((t) => t.id === printOrder.tenant_id) ?? activeTenant
    : activeTenant;
  const printBranch = printOrder
    ? erpState.branches.find((b) => b.id === printOrder.branch_id)
    : undefined;
  const printClient = printOrder
    ? erpState.clients.find((c) => c.id === printOrder.client_id)
    : undefined;
  const printAsset = printOrder
    ? erpState.assets.find((a) => a.id === printOrder.asset_id)
    : undefined;

  return (
    <>
      <div id="fixicloud-app-shell" className="min-h-screen flex bg-[#F4F6FB] text-slate-900">
        <Sidebar
          activeSection={activeSection}
          onSelectSection={(section) => {
            if (section === 'track') {
              setTrackInitialCode('');
            }
            setAppNotice(null);
            navigateSection(section);
          }}
          onOpenReports={() => {
            const fallbackOrder =
              erpState.workOrders.find(
                (o) => o.id === selectedOrderId && o.tenant_id === activeTenant.id
              ) ??
              erpState.workOrders.find(
                (o) =>
                  o.tenant_id === activeTenant.id &&
                  (activeBranchId === 'ALL' || o.branch_id === activeBranchId)
              ) ??
              erpState.workOrders.find((o) => o.tenant_id === activeTenant.id);
            if (fallbackOrder) {
              setPrintOrderId(fallbackOrder.id);
            } else {
              setAppNotice(
                'No hay órdenes registradas en esta vista para emitir un reporte .rpt. Crea una orden primero.'
              );
              navigateSection('console');
            }
          }}
          activeRole={activeRole}
          onSelectRole={setActiveRole}
          tenants={getVisibleTenantsForScope(
            erpState.tenants,
            activeRole,
            authSession,
            activeTenant.id
          )}
          activeTenant={activeTenant}
          onSelectTenant={handleSelectTenant}
          onOpenNewTenant={() => setShowNewTenantModal(true)}
          branches={erpState.branches}
          activeBranchId={activeBranchId}
          authSession={authSession}
          onOpenAuthModal={() => setShowAuthModal(true)}
          onSignOut={handleSignOut}
          openOrdersCount={openOrdersCount}
          todayAppointmentsCount={scheduledAppointmentsCount}
          lowStockCount={lowStockCount}
          mobileOpen={mobileMenuOpen}
          onCloseMobile={() => setMobileMenuOpen(false)}
        />

      <div className="flex-1 flex flex-col min-w-0">
        <ContextHeader
          activeSection={activeSection}
          branches={erpState.branches}
          activeTenantId={activeTenant.id}
          activeBranchId={activeBranchId}
          onSelectBranch={setActiveBranchId}
          globalSearch={globalSearch}
          onGlobalSearchChange={setGlobalSearch}
          onSubmitGlobalSearch={(q) => {
            setGlobalSearch(q);
            navigateSection('console');
          }}
          authSession={authSession}
          onOpenAuthModal={() => setShowAuthModal(true)}
          onRefreshSync={handleRefreshSync}
          isSyncing={isSyncing}
          lowStockItems={lowStockItems}
          readyOrders={readyOrders}
          scheduledAppointments={scheduledAppointments}
          onNavigateAlert={({ section, orderId }) => {
            if (orderId) setSelectedOrderId(orderId);
            navigateSection(section);
          }}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />

        <main className="flex-1 min-w-0 p-4 lg:p-6 max-w-[1600px] w-full mx-auto">
          {syncError && (
            <AlertBanner
              variant="error"
              title="Error de sincronización con Supabase"
              message={syncError}
              onDismiss={() => setSyncError(null)}
              className="mb-4"
            />
          )}

          {appNotice && (
            <AlertBanner
              variant="info"
              message={appNotice}
              onDismiss={() => setAppNotice(null)}
              className="mb-4"
            />
          )}

          {activeSection === 'dashboard' && (
            <DashboardView
              tenant={activeTenant}
              branches={erpState.branches}
              appUsers={
                allowGlobalScope
                  ? erpState.appUsers
                  : erpState.appUsers.filter((u) => u.tenant_id === activeTenant.id)
              }
              activeBranchId={activeBranchId}
              activeRole={activeRole}
              authSession={authSession}
              orders={erpState.workOrders}
              clients={erpState.clients}
              assets={erpState.assets}
              catalogItems={erpState.catalogItems}
              appointments={erpState.appointments}
              onOpenOrder={(id) => {
                setSelectedOrderId(id);
                navigateSection('console');
              }}
              onOpenPrintOrder={(id) => setPrintOrderId(id)}
              onNewOrder={() => {
                setOrderPrefill(null);
                setShowNewOrderModal(true);
              }}
              onGoToConsole={() => navigateSection('console')}
              onGoToAppointments={() => navigateSection('appointments')}
              onGoToSettings={(tab) => {
                setSettingsInitialTab(tab);
                navigateSection('settings');
              }}
              onGoToMigration={() => navigateSection('migration')}
              onToggleWhatsApp={() => {
                void handleUpdateTenant({
                  ...activeTenant,
                  whatsapp_enabled: !activeTenant.whatsapp_enabled,
                });
              }}
            />
          )}

          <Suspense fallback={lazyFallback}>
            {activeSection === 'console' && (
              <OrderConsoleView
                tenant={activeTenant}
                branches={erpState.branches}
                activeBranchId={activeBranchId}
                activeRole={activeRole}
                supabaseConfig={supabaseConfig}
                activeUser={authSession}
                orders={erpState.workOrders}
                clients={erpState.clients}
                assets={erpState.assets}
                catalogItems={erpState.catalogItems}
                loanAssets={erpState.loanAssets}
                selectedOrderId={selectedOrderId}
                onSelectOrder={setSelectedOrderId}
                onUpdateOrder={handleUpdateOrder}
                onUpdateClient={(c) => {
                  void handleUpdateClient(c);
                }}
                onUpdateAsset={(a) => {
                  void handleUpdateAsset(a);
                }}
                onAdjustCatalogStock={handleAdjustCatalogStock}
                onAssignLoanAsset={handleAssignLoanAsset}
                onReturnLoanAsset={handleReturnLoanAsset}
                onDeleteOrder={handleDeleteOrder}
                onDeleteOrderItem={(itemId) =>
                  trackSync(deleteOrderItemFromSupabase(supabaseConfig, itemId))
                }
                onDeleteOrderPhoto={(photoId, photoUrl) =>
                  trackSync(deleteOrderPhotoFromSupabase(supabaseConfig, photoId, photoUrl))
                }
                onDeleteOrderPayment={(paymentId) =>
                  trackSync(deleteOrderPaymentFromSupabase(supabaseConfig, paymentId))
                }
                onOpenNewOrder={() => {
                  setOrderPrefill(null);
                  setShowNewOrderModal(true);
                }}
                onOpenPublicTrackWithCode={(code) => {
                  setTrackInitialCode(code);
                  navigateSection('track');
                }}
                onOpenPrintCenter={(orderId) => setPrintOrderId(orderId)}
                externalSearchQuery={globalSearch}
                onExternalSearchChange={setGlobalSearch}
              />
            )}

            {activeSection === 'appointments' && (
              <AppointmentsView
                tenant={activeTenant}
                branches={erpState.branches}
                appUsers={
                  allowGlobalScope
                    ? erpState.appUsers
                    : erpState.appUsers.filter((u) => u.tenant_id === activeTenant.id)
                }
                activeBranchId={activeBranchId}
                lockedBranchId={lockedBranchId}
                activeRole={activeRole}
                clients={erpState.clients}
                orders={erpState.workOrders}
                appointments={erpState.appointments}
                onAddAppointment={handleAddAppointment}
                onUpdateAppointment={handleUpdateAppointment}
                onConvertToOrder={handleConvertAppointmentToOrder}
                onOpenOrder={(id) => {
                  setSelectedOrderId(id);
                  navigateSection('console');
                }}
              />
            )}

            {activeSection === 'clients' && (
              <ClientsAssetsView
                tenant={activeTenant}
                activeRole={activeRole}
                clients={erpState.clients}
                assets={erpState.assets}
                orders={erpState.workOrders}
                onAddClient={handleAddClient}
                onUpdateClient={handleUpdateClient}
                onDeleteClient={handleDeleteClient}
                onAddAsset={handleAddAsset}
                onUpdateAsset={handleUpdateAsset}
                onDeleteAsset={handleDeleteAsset}
                onOpenOrder={(id) => {
                  setSelectedOrderId(id);
                  navigateSection('console');
                }}
              />
            )}

            {activeSection === 'inventory' && (
              <InventoryLoansView
                tenant={activeTenant}
                branches={erpState.branches}
                activeBranchId={activeBranchId}
                lockedBranchId={lockedBranchId}
                activeRole={activeRole}
                catalogItems={erpState.catalogItems}
                loanAssets={erpState.loanAssets}
                onAddCatalogItem={handleAddCatalogItem}
                onUpdateCatalogItem={handleUpdateCatalogItem}
                onDeleteCatalogItem={handleDeleteCatalogItem}
                onAdjustStock={handleAdjustCatalogStock}
                onAddLoanAsset={handleAddLoanAsset}
                onUpdateLoanAsset={handleUpdateLoanAsset}
                onDeleteLoanAsset={handleDeleteLoanAsset}
                onUpdateLoanStatus={handleUpdateLoanStatus}
              />
            )}

            {activeSection === 'settings' && (
              <SettingsBranchesView
                tenant={activeTenant}
                tenants={getVisibleTenantsForScope(
                  erpState.tenants,
                  activeRole,
                  authSession,
                  activeTenant.id
                )}
                branches={erpState.branches}
                appUsers={
                  allowGlobalScope
                    ? erpState.appUsers
                    : erpState.appUsers.filter((u) => u.tenant_id === activeTenant.id)
                }
                activeRole={activeRole}
                sessionRole={authSession?.role}
                currentUserId={authSession?.id}
                lockedBranchId={lockedBranchId}
                initialTab={settingsInitialTab}
                onUpdateTenant={handleUpdateTenant}
                onAddBranch={handleAddBranch}
                onDeleteBranch={handleDeleteBranch}
                onAddAppUser={handleAddAppUser}
                onUpdateAppUser={handleUpdateAppUser}
                onDeleteAppUser={handleDeleteAppUser}
              />
            )}

            {activeSection === 'migration' && (
              <LegacyMigratorView
                erpState={erpState}
                activeTenant={activeTenant}
                branches={erpState.branches}
                supabaseConfig={supabaseConfig}
                allowGlobalView={allowGlobalScope}
                onApplyMigratedState={(nextState) => {
                  commitErpState(() => nextState);
                  const latestOrder = nextState.workOrders.find(
                    (o) => o.tenant_id === activeTenant.id
                  );
                  if (latestOrder) setSelectedOrderId(latestOrder.id);
                }}
                onGoToConsole={() => navigateSection('console')}
              />
            )}
          </Suspense>
        </main>
      </div>

      <Suspense fallback={null}>
        {showNewOrderModal && (
          <NewOrderModal
            tenant={activeTenant}
            branches={erpState.branches}
            appUsers={
              allowGlobalScope
                ? erpState.appUsers
                : erpState.appUsers.filter((u) => u.tenant_id === activeTenant.id)
            }
            activeBranchId={activeBranchId}
            lockedBranchId={lockedBranchId}
            clients={erpState.clients}
            assets={erpState.assets}
            existingOrders={erpState.workOrders}
            initialPrefill={orderPrefill}
            onAllocateFolio={(tenantId, prefix) =>
              allocateOrderFolioAtomic(supabaseConfig, {
                tenantId,
                prefix,
                fallbackOrders: erpStateRef.current.workOrders,
              })
            }
            onClose={() => {
              setShowNewOrderModal(false);
              setOrderPrefill(null);
            }}
            onCreate={handleCreateOrder}
          />
        )}

        {showAuthModal && (
          <AuthModal
            supabaseConfig={supabaseConfig}
            appUsers={erpState.appUsers}
            tenants={erpState.tenants}
            branches={erpState.branches}
            onAuthSuccess={handleAuthSuccess}
            onClose={() => setShowAuthModal(false)}
          />
        )}
      </Suspense>
      </div>

      <Suspense fallback={null}>
        {showNewTenantModal && (
          <NewTenantModal
            onClose={() => setShowNewTenantModal(false)}
            onCreate={async (input) => {
              const res = await handleCreateTenant(input);
              if (res.ok) setShowNewTenantModal(false);
              return res;
            }}
          />
        )}

        {printOrder && (
          <PrintCenterModal
            order={printOrder}
            tenant={printTenant}
            branch={printBranch}
            client={printClient}
            asset={printAsset}
            loanAssets={erpState.loanAssets}
            onClose={() => setPrintOrderId(null)}
          />
        )}
      </Suspense>

      {orderCreatedConfirm && (
        <ConfirmSuccessModal
          title={`¡Orden ${orderCreatedConfirm.folio} creada!`}
          description={`Folio ${orderCreatedConfirm.folio} y código de seguimiento ${orderCreatedConfirm.trackingCode} listos para taller y cliente.`}
          secondaryLabel="Ir a Consola"
          primaryLabel="Imprimir .rpt"
          onSecondary={() => {
            setSelectedOrderId(orderCreatedConfirm.id);
            setOrderCreatedConfirm(null);
            navigateSection('console');
          }}
          onPrimary={() => {
            const id = orderCreatedConfirm.id;
            setSelectedOrderId(id);
            setOrderCreatedConfirm(null);
            setPrintOrderId(id);
          }}
        />
      )}
    </>
  );
}

