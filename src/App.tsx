/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
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
  getSyncedSeedTenantsForUrl,
  loadAuthSession,
  loadErpState,
  loadSupabaseConfig,
  markSeedTenantsSyncedForUrl,
  saveAuthSession,
  saveErpState,
} from './services/storageService';
import {
  deleteAppUserFromSupabase,
  deleteBranchFromSupabase,
  deleteOrderItemFromSupabase,
  deleteOrderPaymentFromSupabase,
  deleteOrderPhotoFromSupabase,
  isSupabaseLive,
  pullSupabaseErpState,
  seedMissingSeedTenantsToSupabase,
  syncAppUserToSupabase,
  syncAppointmentToSupabase,
  syncAssetToSupabase,
  syncBranchToSupabase,
  syncCatalogItemToSupabase,
  syncClientToSupabase,
  syncLoanAssetToSupabase,
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
  canViewGlobalScope,
  getRolePermissions,
  getVisibleTenantsForScope,
  sanitizeOrderUpdateForRole,
} from './utils/erpLogic';
import { generateUUID } from './utils/uuid';

function getInitialTrackFromUrl(): { isTrack: boolean; code: string } {
  if (typeof window === 'undefined') return { isTrack: false, code: '8F92A1C4' };
  const params = new URLSearchParams(window.location.search);
  const trackParam = params.get('track') ?? params.get('code');
  const pathIsTrack = window.location.pathname.replace(/\/+$/, '') === '/track';
  if (trackParam && trackParam.trim()) {
    return { isTrack: true, code: trackParam.trim().toUpperCase() };
  }
  return { isTrack: pathIsTrack, code: '8F92A1C4' };
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
    return loadErpState().tenants[0]?.id ?? '11111111-1111-4111-8111-111111111111';
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

  const trackSync = (promise: Promise<{ ok: boolean; error?: string }>) => {
    void promise.then((res) => {
      if (!res.ok && res.error) {
        setSyncError(res.error);
      }
    });
  };

  useEffect(() => {
    saveErpState(erpState, { stripCredentials: isSupabaseLive(supabaseConfig) });
  }, [erpState, supabaseConfig]);

  useEffect(() => {
    saveAuthSession(authSession);
  }, [authSession]);

  // Auto-pull initial data from Supabase when .env or stored live credentials exist
  // and automatically upload newly added seed tenants (e.g. AndesFleet) if missing in Supabase
  useEffect(() => {
    if (!isSupabaseLive(supabaseConfig)) return;
    let cancelled = false;
    (async () => {
      const res = await pullSupabaseErpState(
        supabaseConfig.url,
        supabaseConfig.anonKey
      );
      if (cancelled || !res.ok || !res.data) return;

      const existingIds = (res.data.tenants ?? []).map((t) => t.id);
      const alreadySynced = getSyncedSeedTenantsForUrl(supabaseConfig.url);
      const seedRes = await seedMissingSeedTenantsToSupabase(
        supabaseConfig.url,
        supabaseConfig.anonKey,
        existingIds,
        { skipIds: alreadySynced }
      );

      if (!cancelled && seedRes.ok && seedRes.addedTenantIds.length > 0) {
        markSeedTenantsSyncedForUrl(supabaseConfig.url, seedRes.addedTenantIds);
        const refreshed = await pullSupabaseErpState(
          supabaseConfig.url,
          supabaseConfig.anonKey
        );
        if (!cancelled && refreshed.ok && refreshed.data) {
          handleSyncFromSupabase(refreshed.data);
          return;
        }
      }

      if (!cancelled) {
        handleSyncFromSupabase(res.data);
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
      erpState.workOrders.filter(
        (o) =>
          o.tenant_id === activeTenant.id &&
          (activeBranchId === 'ALL' || o.branch_id === activeBranchId) &&
          o.status !== 'delivered'
      ).length,
    [erpState.workOrders, activeTenant.id, activeBranchId]
  );

  const lowStockItems = useMemo(
    () =>
      erpState.catalogItems.filter(
        (c) =>
          c.tenant_id === activeTenant.id &&
          (activeBranchId === 'ALL' || c.branch_id === activeBranchId) &&
          c.stock_qty <= c.min_stock
      ),
    [erpState.catalogItems, activeTenant.id, activeBranchId]
  );

  const lowStockCount = lowStockItems.length;

  const readyOrders = useMemo(
    () =>
      erpState.workOrders.filter(
        (o) =>
          o.tenant_id === activeTenant.id &&
          (activeBranchId === 'ALL' || o.branch_id === activeBranchId) &&
          o.status === 'ready'
      ),
    [erpState.workOrders, activeTenant.id, activeBranchId]
  );

  const scheduledAppointments = useMemo(
    () =>
      erpState.appointments.filter(
        (a) =>
          a.tenant_id === activeTenant.id &&
          (activeBranchId === 'ALL' || a.branch_id === activeBranchId) &&
          a.status === 'scheduled'
      ),
    [erpState.appointments, activeTenant.id, activeBranchId]
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

  const handleCreateTenant = (input: {
    name: string;
    tax_id: string;
    sector: IndustrySector;
    city: string;
  }) => {
    if (!canViewGlobalScope(activeRole, authSession?.role)) return;
    const tenantId = generateUUID();
    const branchId = generateUUID();
    const prefix = input.name.slice(0, 3).toLowerCase().replace(/[^a-z]/g, '') || 'emp';
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

    const defaultAdmin: AppUser = {
      id: generateUUID(),
      tenant_id: tenantId,
      branch_id: null,
      username: `admin_${prefix}`,
      pin_or_password: '123456',
      full_name: `Administrador ${input.name}`,
      role: 'admin',
      is_active: true,
      created_at: new Date().toISOString(),
    };
    const defaultTech: AppUser = {
      id: generateUUID(),
      tenant_id: tenantId,
      branch_id: branchId,
      username: `tec_${prefix}`,
      pin_or_password: '1234',
      full_name: `Técnico ${input.name}`,
      role: 'technician',
      is_active: true,
      created_at: new Date().toISOString(),
    };
    const defaultRecep: AppUser = {
      id: generateUUID(),
      tenant_id: tenantId,
      branch_id: branchId,
      username: `recep_${prefix}`,
      pin_or_password: '1234',
      full_name: `Recepción ${input.name}`,
      role: 'receptionist',
      is_active: true,
      created_at: new Date().toISOString(),
    };

    setErpState((prev) => ({
      ...prev,
      tenants: [...prev.tenants, newTenant],
      branches: [...prev.branches, hqBranch],
      appUsers: [defaultAdmin, defaultTech, defaultRecep, ...prev.appUsers],
    }));
    trackSync(syncTenantToSupabase(supabaseConfig, newTenant));
    trackSync(syncBranchToSupabase(supabaseConfig, hqBranch));
    trackSync(syncAppUserToSupabase(supabaseConfig, defaultAdmin, { isNew: true }));
    trackSync(syncAppUserToSupabase(supabaseConfig, defaultTech, { isNew: true }));
    trackSync(syncAppUserToSupabase(supabaseConfig, defaultRecep, { isNew: true }));

    setActiveTenantId(tenantId);
    setActiveBranchId('ALL');
    setSelectedOrderId(null);
  };

  const handleUpdateTenant = (updated: Tenant) => {
    const perms = getRolePermissions(activeRole);
    if (!perms.canEditSettings && activeRole !== 'superadmin') return;
    if (!allowGlobalScope && updated.id !== activeTenant.id) return;
    setErpState((prev) => ({
      ...prev,
      tenants: prev.tenants.map((t) => (t.id === updated.id ? updated : t)),
    }));
    trackSync(syncTenantToSupabase(supabaseConfig, updated));
  };

  const handleAddBranch = (branch: Branch) => {
    const perms = getRolePermissions(activeRole);
    if (!perms.canEditSettings && activeRole !== 'superadmin') return;
    if (!allowGlobalScope && branch.tenant_id !== activeTenant.id) return;
    setErpState((prev) => ({
      ...prev,
      branches: [...prev.branches, branch],
    }));
    trackSync(syncBranchToSupabase(supabaseConfig, branch));
  };

  const handleDeleteBranch = async (
    branchId: string
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!getRolePermissions(activeRole).canDeleteBranch) {
      return { ok: false, error: 'Sin permisos para eliminar sucursales.' };
    }
    const targetBranch = erpState.branches.find((b) => b.id === branchId);
    if (!targetBranch) {
      return { ok: false, error: 'Sucursal no encontrada.' };
    }
    if (!allowGlobalScope && targetBranch.tenant_id !== activeTenant.id) {
      return { ok: false, error: 'No puedes eliminar sucursales de otra empresa.' };
    }
    const check = canDeleteBranchSafely(branchId, erpState);
    if (!check.ok) {
      return { ok: false, error: check.error };
    }
    const res = await deleteBranchFromSupabase(supabaseConfig, branchId);
    if (!res.ok) {
      return res;
    }
    setErpState((prev) => ({
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
      (user.role === 'superadmin' || user.tenant_id !== activeTenant.id)
    ) {
      return {
        ok: false,
        error: 'Solo SuperAdmin Global puede crear cuentas globales o de otras empresas.',
      };
    }
    const res = await syncAppUserToSupabase(supabaseConfig, user, { isNew: true });
    if (!res.ok) return res;
    setErpState((prev) => ({
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
    const existing = erpState.appUsers.find((u) => u.id === updated.id);
    if (
      !allowGlobalScope &&
      ((existing &&
        (existing.role === 'superadmin' || existing.tenant_id !== activeTenant.id)) ||
        updated.role === 'superadmin' ||
        updated.tenant_id !== activeTenant.id)
    ) {
      return {
        ok: false,
        error: 'Solo SuperAdmin Global puede editar cuentas globales o de otras empresas.',
      };
    }
    const hasNewPassword = updated.pin_or_password.trim().length > 0;
    const res = await syncAppUserToSupabase(supabaseConfig, updated, {
      isNew: hasNewPassword,
    });
    if (!res.ok) return res;
    setErpState((prev) => ({
      ...prev,
      appUsers: prev.appUsers.map((u) => (u.id === updated.id ? updated : u)),
    }));
    setAuthSession((prev) => {
      if (!prev || prev.id !== updated.id) return prev;
      const nextTenant = updated.tenant_id
        ? erpState.tenants.find((t) => t.id === updated.tenant_id) ?? prev.tenant
        : null;
      const nextBranch = updated.branch_id
        ? erpState.branches.find((b) => b.id === updated.branch_id) ?? prev.branch
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
    const targetUser = erpState.appUsers.find((u) => u.id === userId);
    if (
      !allowGlobalScope &&
      targetUser &&
      (targetUser.role === 'superadmin' || targetUser.tenant_id !== activeTenant.id)
    ) {
      return {
        ok: false,
        error: 'Solo SuperAdmin Global puede eliminar cuentas globales o de otras empresas.',
      };
    }
    const res = await deleteAppUserFromSupabase(supabaseConfig, userId);
    if (!res.ok) return res;
    setErpState((prev) => ({
      ...prev,
      appUsers: prev.appUsers.filter((u) => u.id !== userId),
    }));
    return { ok: true };
  };

  const handleUpdateOrder = (updated: WorkOrder) => {
    const current = erpStateRef.current;
    const existing = current.workOrders.find((o) => o.id === updated.id);
    if (existing && !allowGlobalScope && existing.tenant_id !== activeTenant.id) return;
    const safeUpdated: WorkOrder = existing
      ? sanitizeOrderUpdateForRole(existing, updated, activeRole)
      : updated;

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
        nextState.catalogItems
      )
    );
  };

  const handleCreateOrder = (payload: {
    newClient?: Client;
    newAsset?: CustomerAsset;
    order: WorkOrder;
    sourceAppointmentId?: string;
  }) => {
    if (!getRolePermissions(activeRole).canCreateOrder) return;
    if (!allowGlobalScope && payload.order.tenant_id !== activeTenant.id) return;
    const nextState = commitErpState((prev) => ({
      ...prev,
      clients: payload.newClient ? [payload.newClient, ...prev.clients] : prev.clients,
      assets: payload.newAsset ? [payload.newAsset, ...prev.assets] : prev.assets,
      workOrders: [payload.order, ...prev.workOrders],
      appointments: payload.sourceAppointmentId
        ? prev.appointments.map((apt) =>
            apt.id === payload.sourceAppointmentId
              ? { ...apt, work_order_id: payload.order.id, status: 'completed' }
              : apt
          )
        : prev.appointments,
    }));
    if (payload.newClient) {
      trackSync(syncClientToSupabase(supabaseConfig, payload.newClient));
    }
    if (payload.newAsset) {
      trackSync(syncAssetToSupabase(supabaseConfig, payload.newAsset));
    }
    const orderTenant = nextState.tenants.find((t) => t.id === payload.order.tenant_id);
    trackSync(
      syncWorkOrderToSupabase(
        supabaseConfig,
        payload.order,
        orderTenant?.iva_rate ?? 19,
        nextState.catalogItems
      )
    );
    if (payload.sourceAppointmentId) {
      const src = nextState.appointments.find((a) => a.id === payload.sourceAppointmentId);
      if (src) {
        trackSync(syncAppointmentToSupabase(supabaseConfig, src));
      }
    }
    setSelectedOrderId(payload.order.id);
    setShowNewOrderModal(false);
    setOrderPrefill(null);
    setOrderCreatedConfirm({
      id: payload.order.id,
      folio: payload.order.folio,
      trackingCode: payload.order.tracking_code,
    });
  };

  const handleAddAppointment = (apt: Appointment) => {
    if (!allowGlobalScope && apt.tenant_id !== activeTenant.id) return;
    setErpState((prev) => ({
      ...prev,
      appointments: [apt, ...prev.appointments],
    }));
    trackSync(syncAppointmentToSupabase(supabaseConfig, apt));
  };

  const handleUpdateAppointment = (updated: Appointment) => {
    if (!allowGlobalScope && updated.tenant_id !== activeTenant.id) return;
    setErpState((prev) => ({
      ...prev,
      appointments: prev.appointments.map((a) => (a.id === updated.id ? updated : a)),
    }));
    trackSync(syncAppointmentToSupabase(supabaseConfig, updated));
  };

  const handleConvertAppointmentToOrder = (apt: Appointment) => {
    if (!getRolePermissions(activeRole).canCreateOrder) return;
    if (!allowGlobalScope && apt.tenant_id !== activeTenant.id) return;
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

  const handleUpdateClient = (updated: Client) => {
    if (!getRolePermissions(activeRole).canManageClients) return;
    if (!allowGlobalScope && updated.tenant_id !== activeTenant.id) return;
    setErpState((prev) => ({
      ...prev,
      clients: prev.clients.map((c) => (c.id === updated.id ? updated : c)),
    }));
    trackSync(syncClientToSupabase(supabaseConfig, updated));
  };

  const handleAddClient = (client: Client) => {
    if (!getRolePermissions(activeRole).canManageClients) return;
    if (!allowGlobalScope && client.tenant_id !== activeTenant.id) return;
    setErpState((prev) => ({
      ...prev,
      clients: [client, ...prev.clients],
    }));
    trackSync(syncClientToSupabase(supabaseConfig, client));
  };

  const handleUpdateAsset = (updated: CustomerAsset) => {
    if (!getRolePermissions(activeRole).canManageClients) return;
    if (!allowGlobalScope && updated.tenant_id !== activeTenant.id) return;
    setErpState((prev) => ({
      ...prev,
      assets: prev.assets.map((a) => (a.id === updated.id ? updated : a)),
    }));
    trackSync(syncAssetToSupabase(supabaseConfig, updated));
  };

  const handleAdjustCatalogStock = (catalogItemId: string, delta: number) => {
    const perms = getRolePermissions(activeRole);
    // Allows direct stock management (admin/superadmin) or stock deduction triggered by order item edits
    if (!perms.canManageStock && !perms.canEditFinancials) return;
    const current = erpStateRef.current;
    const target = current.catalogItems.find((i) => i.id === catalogItemId);
    if (!target) return;
    if (!allowGlobalScope && target.tenant_id !== activeTenant.id) return;
    const next = { ...target, stock_qty: Math.max(0, target.stock_qty + delta) };
    commitErpState((prev) => ({
      ...prev,
      catalogItems: prev.catalogItems.map((item) =>
        item.id === catalogItemId ? next : item
      ),
    }));
    trackSync(syncCatalogItemToSupabase(supabaseConfig, next));
  };

  const handleAddCatalogItem = (item: CatalogItem) => {
    const perms = getRolePermissions(activeRole);
    if (!perms.canManageStock || !perms.canManageCatalogPrices) return;
    if (!allowGlobalScope && item.tenant_id !== activeTenant.id) return;
    commitErpState((prev) => ({
      ...prev,
      catalogItems: [item, ...prev.catalogItems],
    }));
    trackSync(syncCatalogItemToSupabase(supabaseConfig, item));
  };

  const handleAddLoanAsset = (loan: LoanAsset) => {
    if (!getRolePermissions(activeRole).canManageStock) return;
    if (!allowGlobalScope && loan.tenant_id !== activeTenant.id) return;
    commitErpState((prev) => ({
      ...prev,
      loanAssets: [loan, ...prev.loanAssets],
    }));
    trackSync(syncLoanAssetToSupabase(supabaseConfig, loan));
  };

  const handleUpdateLoanStatus = (loanId: string, status: LoanAsset['status']) => {
    if (!getRolePermissions(activeRole).canManageStock) return;
    const current = erpStateRef.current;
    const target = current.loanAssets.find((l) => l.id === loanId);
    if (!target) return;
    if (!allowGlobalScope && target.tenant_id !== activeTenant.id) return;
    commitErpState((prev) => ({
      ...prev,
      loanAssets: prev.loanAssets.map((l) => (l.id === loanId ? { ...l, status } : l)),
    }));
    trackSync(syncLoanAssetToSupabase(supabaseConfig, { ...target, status }));
  };

  const handleAssignLoanAsset = (
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
    if (targetOrder.loan && !targetOrder.loan.returned_at) return;
    if (
      !allowGlobalScope &&
      (targetOrder.tenant_id !== activeTenant.id || asset.tenant_id !== activeTenant.id)
    ) {
      return;
    }
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
    trackSync(syncLoanAssetToSupabase(supabaseConfig, { ...asset, status: 'loaned' }));
    trackSync(
      syncWorkOrderToSupabase(
        supabaseConfig,
        nextOrder,
        orderTenant?.iva_rate ?? 19,
        nextState.catalogItems
      )
    );
  };

  const handleReturnLoanAsset = (orderId: string) => {
    const perms = getRolePermissions(activeRole);
    if (!perms.canManageOrderLoans) return;
    const current = erpStateRef.current;
    const order = current.workOrders.find((o) => o.id === orderId);
    if (!order?.loan || order.loan.returned_at) return;
    if (!allowGlobalScope && order.tenant_id !== activeTenant.id) return;
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
    if (loanAsset) {
      trackSync(
        syncLoanAssetToSupabase(supabaseConfig, { ...loanAsset, status: 'available' })
      );
    }
    const orderTenant = nextState.tenants.find((t) => t.id === order.tenant_id);
    trackSync(
      syncWorkOrderToSupabase(
        supabaseConfig,
        nextOrder,
        orderTenant?.iva_rate ?? 19,
        nextState.catalogItems
      )
    );
  };

  const handleSyncFromSupabase = (partial: Partial<ErpState>) => {
    setErpState((prev) => ({
      tenants: partial.tenants?.length ? partial.tenants : prev.tenants,
      branches: partial.branches?.length ? partial.branches : prev.branches,
      appUsers: partial.appUsers?.length ? partial.appUsers : prev.appUsers,
      clients: partial.clients ?? prev.clients,
      assets: partial.assets ?? prev.assets,
      catalogItems: partial.catalogItems ?? prev.catalogItems,
      loanAssets: partial.loanAssets ?? prev.loanAssets,
      workOrders: partial.workOrders ?? prev.workOrders,
      appointments: partial.appointments ?? prev.appointments,
    }));
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
          onBackToErp={() => navigateSection(authSession ? 'console' : 'dashboard')}
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
        onAuthSuccess={(user: AuthSessionUser) => {
          setErpState((prev) => ({
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
        }}
      />
    );
  }

  const lockedBranchId =
    authSession && authSession.role !== 'superadmin' ? authSession.branch_id : null;

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
      <div id="erp-app-shell" className="min-h-screen flex bg-[#F4F6FB] text-slate-900">
        <Sidebar
          activeSection={activeSection}
          onSelectSection={(section) => {
            if (section === 'track') {
              const tenantOrder = erpState.workOrders.find(
                (o) => o.tenant_id === activeTenant.id
              );
              if (tenantOrder) setTrackInitialCode(tenantOrder.tracking_code);
            }
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
          onSelectBranch={setActiveBranchId}
          authSession={authSession}
          onOpenAuthModal={() => setShowAuthModal(true)}
          onSignOut={() => {
            setAuthSession(null);
            setActiveRole('admin');
            setActiveTenantId(
              erpState.tenants[0]?.id ?? '11111111-1111-4111-8111-111111111111'
            );
            setActiveBranchId('ALL');
            setSelectedOrderId(null);
            setActiveSection('dashboard');
            setGlobalSearch('');
          }}
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

          {activeSection === 'dashboard' && (
            <DashboardView
              tenant={activeTenant}
              branches={erpState.branches}
              activeBranchId={activeBranchId}
              activeRole={activeRole}
              authSession={authSession}
              orders={erpState.workOrders}
              clients={erpState.clients}
              assets={erpState.assets}
              catalogItems={erpState.catalogItems}
              loanAssets={erpState.loanAssets}
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
              onToggleWhatsApp={() =>
                handleUpdateTenant({
                  ...activeTenant,
                  whatsapp_enabled: !activeTenant.whatsapp_enabled,
                })
              }
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
                onUpdateClient={handleUpdateClient}
                onUpdateAsset={handleUpdateAsset}
                onAdjustCatalogStock={handleAdjustCatalogStock}
                onAssignLoanAsset={handleAssignLoanAsset}
                onReturnLoanAsset={handleReturnLoanAsset}
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
                onAdjustStock={handleAdjustCatalogStock}
                onAddLoanAsset={handleAddLoanAsset}
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
                  setErpState(nextState);
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
            onAuthSuccess={(user) => {
              setErpState((prev) => ({
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
            }}
            onClose={() => setShowAuthModal(false)}
          />
        )}
      </Suspense>
      </div>

      <Suspense fallback={null}>
        {showNewTenantModal && (
          <NewTenantModal
            onClose={() => setShowNewTenantModal(false)}
            onCreate={(input) => {
              handleCreateTenant(input);
              setShowNewTenantModal(false);
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

