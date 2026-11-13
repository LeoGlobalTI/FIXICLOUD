/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { AppointmentsView } from './components/AppointmentsView';
import { AuthModal } from './components/AuthModal';
import { ClientsAssetsView } from './components/ClientsAssetsView';
import { ContextHeader } from './components/ContextHeader';
import { DashboardView } from './components/DashboardView';
import { InventoryLoansView } from './components/InventoryLoansView';
import { LegacyMigratorView } from './components/LegacyMigratorView';
import { NewOrderModal, type NewOrderPrefill } from './components/NewOrderModal';
import { NewTenantModal } from './components/NewTenantModal';
import { OrderConsoleView } from './components/OrderConsoleView';
import { PrintCenterModal } from './components/PrintCenterModal';
import { PublicTrackPortal } from './components/PublicTrackPortal';
import { SettingsBranchesView } from './components/SettingsBranchesView';
import { Sidebar } from './components/Sidebar';
import { SupabaseModal } from './components/SupabaseModal';
import { ConfirmSuccessModal } from './components/ui/ConfirmSuccessModal';
import {
  loadAuthSession,
  loadErpState,
  loadSupabaseConfig,
  resetErpState,
  saveAuthSession,
  saveErpState,
  saveSupabaseConfig,
} from './services/storageService';
import {
  deleteBranchFromSupabase,
  deleteOrderItemFromSupabase,
  deleteOrderPhotoFromSupabase,
  isSupabaseLive,
  pullSupabaseErpState,
  signOutFromSupabase,
  syncAppointmentToSupabase,
  syncAssetToSupabase,
  syncBranchToSupabase,
  syncCatalogItemToSupabase,
  syncClientToSupabase,
  syncLoanAssetToSupabase,
  syncProfileToSupabase,
  syncTenantToSupabase,
  syncWorkOrderToSupabase,
} from './services/supabaseService';
import type {
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
  TeamProfile,
  Tenant,
  WorkOrder,
} from './types/erp';
import { getRolePermissions } from './utils/erpLogic';

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
  const [supabaseConfig, setSupabaseConfig] = useState<SupabaseConfig>(() =>
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
    return loadErpState().tenants[0]?.id ?? 'tenant-globaltech';
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
  const [showSupabaseModal, setShowSupabaseModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    saveErpState(erpState);
  }, [erpState]);

  useEffect(() => {
    saveSupabaseConfig(supabaseConfig);
  }, [supabaseConfig]);

  useEffect(() => {
    saveAuthSession(authSession);
  }, [authSession]);

  // Auto-pull initial data from Supabase when .env or stored live credentials exist
  useEffect(() => {
    if (!isSupabaseLive(supabaseConfig)) return;
    let cancelled = false;
    pullSupabaseErpState(supabaseConfig.url, supabaseConfig.anonKey).then((res) => {
      if (cancelled || !res.ok || !res.data) return;
      handleSyncFromSupabase(res.data);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const activeTenant = useMemo(
    () =>
      erpState.tenants.find((t) => t.id === activeTenantId) ??
      erpState.tenants[0],
    [erpState.tenants, activeTenantId]
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
    const tenantId = `tenant-${Date.now()}`;
    const branchId = `branch-${Date.now()}`;
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
    setErpState((prev) => ({
      ...prev,
      tenants: [...prev.tenants, newTenant],
      branches: [...prev.branches, hqBranch],
    }));
    void syncTenantToSupabase(supabaseConfig, newTenant);
    void syncBranchToSupabase(supabaseConfig, hqBranch);
    setActiveTenantId(tenantId);
    setActiveBranchId('ALL');
    setSelectedOrderId(null);
  };

  const handleUpdateTenant = (updated: Tenant) => {
    setErpState((prev) => ({
      ...prev,
      tenants: prev.tenants.map((t) => (t.id === updated.id ? updated : t)),
    }));
    void syncTenantToSupabase(supabaseConfig, updated);
  };

  const handleAddBranch = (branch: Branch) => {
    setErpState((prev) => ({
      ...prev,
      branches: [...prev.branches, branch],
    }));
    void syncBranchToSupabase(supabaseConfig, branch);
  };

  const handleDeleteBranch = (branchId: string) => {
    setErpState((prev) => ({
      ...prev,
      branches: prev.branches.filter((b) => b.id !== branchId),
    }));
    if (activeBranchId === branchId) setActiveBranchId('ALL');
    void deleteBranchFromSupabase(supabaseConfig, branchId);
  };

  const handleAddProfile = (profile: TeamProfile) => {
    setErpState((prev) => ({
      ...prev,
      profiles: [profile, ...prev.profiles],
    }));
    void syncProfileToSupabase(supabaseConfig, profile);
  };

  const handleUpdateProfile = (updated: TeamProfile) => {
    setErpState((prev) => ({
      ...prev,
      profiles: prev.profiles.map((p) => (p.id === updated.id ? updated : p)),
    }));
    void syncProfileToSupabase(supabaseConfig, updated);
  };

  const handleUpdateOrder = (updated: WorkOrder) => {
    setErpState((prev) => ({
      ...prev,
      workOrders: prev.workOrders.map((o) => (o.id === updated.id ? updated : o)),
    }));
    void syncWorkOrderToSupabase(supabaseConfig, updated);
  };

  const handleCreateOrder = (payload: {
    newClient?: Client;
    newAsset?: CustomerAsset;
    order: WorkOrder;
    sourceAppointmentId?: string;
  }) => {
    setErpState((prev) => ({
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
    if (payload.newClient) void syncClientToSupabase(supabaseConfig, payload.newClient);
    if (payload.newAsset) void syncAssetToSupabase(supabaseConfig, payload.newAsset);
    void syncWorkOrderToSupabase(supabaseConfig, payload.order);
    if (payload.sourceAppointmentId) {
      const src = erpState.appointments.find((a) => a.id === payload.sourceAppointmentId);
      if (src) {
        void syncAppointmentToSupabase(supabaseConfig, {
          ...src,
          work_order_id: payload.order.id,
          status: 'completed',
        });
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
    setErpState((prev) => ({
      ...prev,
      appointments: [apt, ...prev.appointments],
    }));
    void syncAppointmentToSupabase(supabaseConfig, apt);
  };

  const handleUpdateAppointment = (updated: Appointment) => {
    setErpState((prev) => ({
      ...prev,
      appointments: prev.appointments.map((a) => (a.id === updated.id ? updated : a)),
    }));
    void syncAppointmentToSupabase(supabaseConfig, updated);
  };

  const handleConvertAppointmentToOrder = (apt: Appointment) => {
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
    setErpState((prev) => ({
      ...prev,
      clients: prev.clients.map((c) => (c.id === updated.id ? updated : c)),
    }));
    void syncClientToSupabase(supabaseConfig, updated);
  };

  const handleAddClient = (client: Client) => {
    setErpState((prev) => ({
      ...prev,
      clients: [client, ...prev.clients],
    }));
    void syncClientToSupabase(supabaseConfig, client);
  };

  const handleUpdateAsset = (updated: CustomerAsset) => {
    setErpState((prev) => ({
      ...prev,
      assets: prev.assets.map((a) => (a.id === updated.id ? updated : a)),
    }));
    void syncAssetToSupabase(supabaseConfig, updated);
  };

  const handleAdjustCatalogStock = (catalogItemId: string, delta: number) => {
    const target = erpState.catalogItems.find((i) => i.id === catalogItemId);
    if (target) {
      const next = { ...target, stock_qty: Math.max(0, target.stock_qty + delta) };
      void syncCatalogItemToSupabase(supabaseConfig, next);
    }
    setErpState((prev) => ({
      ...prev,
      catalogItems: prev.catalogItems.map((item) =>
        item.id === catalogItemId
          ? { ...item, stock_qty: Math.max(0, item.stock_qty + delta) }
          : item
      ),
    }));
  };

  const handleAddCatalogItem = (item: CatalogItem) => {
    setErpState((prev) => ({
      ...prev,
      catalogItems: [item, ...prev.catalogItems],
    }));
    void syncCatalogItemToSupabase(supabaseConfig, item);
  };

  const handleAddLoanAsset = (loan: LoanAsset) => {
    setErpState((prev) => ({
      ...prev,
      loanAssets: [loan, ...prev.loanAssets],
    }));
    void syncLoanAssetToSupabase(supabaseConfig, loan);
  };

  const handleUpdateLoanStatus = (loanId: string, status: LoanAsset['status']) => {
    const target = erpState.loanAssets.find((l) => l.id === loanId);
    if (target) {
      void syncLoanAssetToSupabase(supabaseConfig, { ...target, status });
    }
    setErpState((prev) => ({
      ...prev,
      loanAssets: prev.loanAssets.map((l) => (l.id === loanId ? { ...l, status } : l)),
    }));
  };

  const handleAssignLoanAsset = (
    orderId: string,
    loanAssetId: string,
    notes: string
  ) => {
    const asset = erpState.loanAssets.find((l) => l.id === loanAssetId);
    if (!asset) return;
    const now = new Date().toISOString();
    const newLoan = {
      id: `wl-${Date.now()}`,
      loan_asset_id: asset.id,
      asset_code: asset.code,
      asset_name: asset.name,
      loaned_at: now,
      delivery_notes: notes,
    };
    const targetOrder = erpState.workOrders.find((o) => o.id === orderId);
    if (targetOrder) {
      void syncLoanAssetToSupabase(supabaseConfig, { ...asset, status: 'loaned' });
      void syncWorkOrderToSupabase(supabaseConfig, {
        ...targetOrder,
        updated_at: now,
        loan: newLoan,
      });
    }
    setErpState((prev) => ({
      ...prev,
      loanAssets: prev.loanAssets.map((l) =>
        l.id === loanAssetId ? { ...l, status: 'loaned' } : l
      ),
      workOrders: prev.workOrders.map((o) =>
        o.id === orderId
          ? {
              ...o,
              updated_at: now,
              loan: newLoan,
            }
          : o
      ),
    }));
  };

  const handleReturnLoanAsset = (orderId: string) => {
    const order = erpState.workOrders.find((o) => o.id === orderId);
    if (!order?.loan) return;
    const loanAssetId = order.loan.loan_asset_id;
    const now = new Date().toISOString();
    const loanAsset = erpState.loanAssets.find((l) => l.id === loanAssetId);
    if (loanAsset) {
      void syncLoanAssetToSupabase(supabaseConfig, { ...loanAsset, status: 'available' });
    }
    void syncWorkOrderToSupabase(supabaseConfig, {
      ...order,
      updated_at: now,
      loan: { ...order.loan, returned_at: now },
    });
    setErpState((prev) => ({
      ...prev,
      loanAssets: prev.loanAssets.map((l) =>
        l.id === loanAssetId ? { ...l, status: 'available' } : l
      ),
      workOrders: prev.workOrders.map((o) =>
        o.id === orderId && o.loan
          ? {
              ...o,
              updated_at: now,
              loan: { ...o.loan, returned_at: now },
            }
          : o
      ),
    }));
  };

  const handleSyncFromSupabase = (partial: Partial<ErpState>) => {
    setErpState((prev) => ({
      tenants: partial.tenants?.length ? partial.tenants : prev.tenants,
      branches: partial.branches?.length ? partial.branches : prev.branches,
      profiles: partial.profiles?.length ? partial.profiles : prev.profiles,
      clients: partial.clients?.length ? partial.clients : prev.clients,
      assets: partial.assets?.length ? partial.assets : prev.assets,
      catalogItems: partial.catalogItems?.length
        ? partial.catalogItems
        : prev.catalogItems,
      loanAssets: partial.loanAssets?.length ? partial.loanAssets : prev.loanAssets,
      workOrders: partial.workOrders?.length ? partial.workOrders : prev.workOrders,
      appointments: partial.appointments?.length
        ? partial.appointments
        : prev.appointments,
    }));
  };

  if (activeSection === 'track') {
    return (
      <PublicTrackPortal
        tenants={erpState.tenants}
        branches={erpState.branches}
        clients={erpState.clients}
        assets={erpState.assets}
        orders={erpState.workOrders}
        supabaseConfig={supabaseConfig}
        initialCode={trackInitialCode}
        onBackToErp={() => navigateSection('console')}
      />
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
              erpState.workOrders.find((o) => o.id === selectedOrderId) ??
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
          tenants={erpState.tenants}
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
            void signOutFromSupabase(supabaseConfig);
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
          supabaseConfig={supabaseConfig}
          onOpenSupabaseModal={() => setShowSupabaseModal(true)}
          lowStockItems={lowStockItems}
          readyOrders={readyOrders}
          scheduledAppointments={scheduledAppointments}
          onNavigateAlert={({ section, orderId }) => {
            if (orderId) setSelectedOrderId(orderId);
            navigateSection(section);
          }}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />

        <main className="flex-1 p-4 lg:p-6 max-w-[1600px] w-full mx-auto">
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
              onOpenSupabaseModal={() => setShowSupabaseModal(true)}
            />
          )}

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
                void deleteOrderItemFromSupabase(supabaseConfig, itemId)
              }
              onDeleteOrderPhoto={(photoId) =>
                void deleteOrderPhotoFromSupabase(supabaseConfig, photoId)
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
              activeBranchId={activeBranchId}
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
              clients={erpState.clients}
              assets={erpState.assets}
              orders={erpState.workOrders}
              onAddClient={handleAddClient}
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
              branches={erpState.branches}
              profiles={erpState.profiles}
              activeRole={activeRole}
              initialTab={settingsInitialTab}
              onUpdateTenant={handleUpdateTenant}
              onAddBranch={handleAddBranch}
              onDeleteBranch={handleDeleteBranch}
              onAddProfile={handleAddProfile}
              onUpdateProfile={handleUpdateProfile}
            />
          )}

          {activeSection === 'migration' && (
            <LegacyMigratorView
              erpState={erpState}
              activeTenant={activeTenant}
              branches={erpState.branches}
              supabaseConfig={supabaseConfig}
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
        </main>
      </div>

      {showNewOrderModal && (
        <NewOrderModal
          tenant={activeTenant}
          branches={erpState.branches}
          activeBranchId={activeBranchId}
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

      {showSupabaseModal && (
        <SupabaseModal
          config={supabaseConfig}
          onSaveConfig={setSupabaseConfig}
          onSyncFromSupabase={handleSyncFromSupabase}
          onResetDemoData={() => {
            const fresh = resetErpState();
            setErpState(fresh);
            setActiveTenantId(fresh.tenants[0].id);
            setActiveBranchId('ALL');
            setSelectedOrderId(fresh.workOrders[0]?.id ?? null);
          }}
          onClose={() => setShowSupabaseModal(false)}
        />
      )}

      {showAuthModal && (
        <AuthModal
          supabaseConfig={supabaseConfig}
          profiles={erpState.profiles}
          tenants={erpState.tenants}
          onAuthSuccess={({ user, newTenant, newBranch, newProfile }) => {
            setErpState((prev) => ({
              ...prev,
              tenants: newTenant ? [...prev.tenants, newTenant] : prev.tenants,
              branches: newBranch ? [...prev.branches, newBranch] : prev.branches,
              profiles: newProfile ? [newProfile, ...prev.profiles] : prev.profiles,
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
      </div>

      {showNewTenantModal && (
        <NewTenantModal
          onClose={() => setShowNewTenantModal(false)}
          onCreate={(input) => {
            handleCreateTenant(input);
            setShowNewTenantModal(false);
          }}
        />
      )}

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
    </>
  );
}

