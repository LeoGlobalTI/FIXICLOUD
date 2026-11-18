import type {
  AppUser,
  Branch,
  Client,
  CustomerAsset,
  ErpState,
  IndustrySector,
  OrderStatus,
  RoleType,
  ServiceModality,
  Tenant,
  WorkOrder,
  WorkOrderItem,
  WorkOrderPayment,
} from '../types/erp';

export interface FinancialSummary {
  subtotal: number;
  discount: number;
  netAfterDiscount: number;
  ivaAmount: number;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
}

const safeNum = (v: number): number => (Number.isFinite(v) ? v : 0);

export function calculateOrderFinancials(
  items: WorkOrderItem[],
  discountAmount: number,
  applyIva: boolean,
  ivaRatePercent: number,
  payments: WorkOrderPayment[]
): FinancialSummary {
  const subtotal = items.reduce(
    (acc, item) =>
      acc + Math.max(0, safeNum(item.qty)) * Math.max(0, safeNum(item.unit_price)),
    0
  );
  const safeDiscount = Math.min(Math.max(0, safeNum(discountAmount)), subtotal);
  const netAfterDiscount = Math.max(0, subtotal - safeDiscount);
  const ivaAmount = applyIva
    ? Math.round(netAfterDiscount * (Math.max(0, safeNum(ivaRatePercent)) / 100))
    : 0;
  const totalAmount = netAfterDiscount + ivaAmount;
  const paidAmount = payments.reduce(
    (acc, p) => acc + Math.max(0, safeNum(p.amount)),
    0
  );
  const balanceDue = Math.max(0, totalAmount - paidAmount);

  return {
    subtotal,
    discount: safeDiscount,
    netAfterDiscount,
    ivaAmount,
    totalAmount,
    paidAmount,
    balanceDue,
  };
}

export function formatCurrency(amount: number, currency = 'CLP'): string {
  const rounded = Math.round(amount);
  if (currency === 'CLP') {
    return `$${rounded.toLocaleString('es-CL')}`;
  }
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(rounded);
}

export interface OrderFilterCriteria {
  tenantId: string;
  branchId: string; // 'ALL' for consolidated HQ view
  query: string;
  status: OrderStatus | 'ALL';
  modality: ServiceModality | 'ALL';
}

export function filterWorkOrders(
  orders: WorkOrder[],
  clients: Client[],
  assets: CustomerAsset[],
  criteria: OrderFilterCriteria
): WorkOrder[] {
  const q = criteria.query.trim().toLowerCase();
  const clientMap = new Map(clients.map((c) => [c.id, c]));
  const assetMap = new Map(assets.map((a) => [a.id, a]));

  return orders.filter((order) => {
    if (order.tenant_id !== criteria.tenantId) return false;
    if (criteria.branchId !== 'ALL' && order.branch_id !== criteria.branchId) {
      return false;
    }
    if (criteria.status !== 'ALL' && order.status !== criteria.status) {
      return false;
    }
    if (criteria.modality !== 'ALL' && order.modality !== criteria.modality) {
      return false;
    }
    if (!q) return true;

    const client = clientMap.get(order.client_id);
    const asset = assetMap.get(order.asset_id);

    const searchableFields = [
      order.folio,
      order.tracking_code,
      order.reported_symptoms,
      order.technical_diagnosis,
      order.accessories_received,
      client?.name ?? '',
      client?.rut ?? '',
      client?.phone ?? '',
      asset?.brand ?? '',
      asset?.model ?? '',
      asset?.serial_imei ?? '',
      asset?.category ?? '',
    ];

    return searchableFields.some((val) => val.toLowerCase().includes(q));
  });
}

export function generateTrackingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function generateNextFolio(prefix: string, orders: WorkOrder[], tenantId: string): string {
  const tenantOrders = orders.filter((o) => o.tenant_id === tenantId);
  let maxNum = 100;
  for (const order of tenantOrders) {
    const match = order.folio.match(/(\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (!Number.isNaN(n) && n > maxNum) {
        maxNum = n;
      }
    }
  }
  const next = maxNum + 1;
  return `${prefix}-${String(next).padStart(6, '0')}`;
}

export function normalizePhoneForWhatsApp(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('56')) return digits;
  if (digits.length === 9 && digits.startsWith('9')) return `56${digits}`;
  return digits;
}

export function buildPublicTrackUrl(trackingCode: string, baseOrigin?: string): string {
  const origin =
    baseOrigin ??
    (typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://fixicloud.vercel.app');
  return `${origin.replace(/\/+$/, '')}/?track=${encodeURIComponent(trackingCode)}`;
}

export function interpolateWhatsAppTemplate(
  template: string,
  params: {
    order: WorkOrder;
    client?: Client;
    asset?: CustomerAsset;
    branch?: Branch;
    tenant: Tenant;
    baseOrigin?: string;
  }
): string {
  const { order, client, asset, branch, tenant, baseOrigin } = params;
  const financials = calculateOrderFinancials(
    order.items,
    order.discount_amount,
    order.apply_iva,
    tenant.iva_rate,
    order.payments
  );

  const equipmentLabel = asset
    ? `${asset.category} ${asset.brand} ${asset.model}`.trim()
    : 'Equipo en servicio';

  const trackUrl = buildPublicTrackUrl(order.tracking_code, baseOrigin);

  const replacements: Record<string, string> = {
    '{cliente}': client?.name ?? 'Cliente',
    '{folio}': order.folio,
    '{codigo}': order.tracking_code,
    '{url_seguimiento}': trackUrl,
    '{equipo}': equipmentLabel,
    '{serie}': asset?.serial_imei ?? 'S/N',
    '{diagnostico}': order.technical_diagnosis || 'En evaluación técnica',
    '{total}': formatCurrency(financials.totalAmount, tenant.currency),
    '{saldo}': formatCurrency(financials.balanceDue, tenant.currency),
    '{empresa}': tenant.name,
    '{sucursal}': branch?.name ?? 'Casa Matriz',
    '{direccion}': branch?.address ?? '',
    '{horario}': branch?.business_hours ?? 'Lunes a Viernes 09:00 - 18:30',
  };

  let message = template;
  for (const [token, value] of Object.entries(replacements)) {
    message = message.split(token).join(value);
  }
  return message;
}

export function buildWhatsAppUrl(phone: string, message: string): string {
  const cleanPhone = normalizePhoneForWhatsApp(phone);
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

export interface CustomFieldSpec {
  key: string;
  label: string;
  placeholder: string;
}

export function getSectorCustomFields(sector: IndustrySector): CustomFieldSpec[] {
  switch (sector) {
    case 'computing':
      return [
        { key: 'bios_password', label: 'Contraseña BIOS', placeholder: 'Ej: Sin clave / BIOS2025' },
        { key: 'cpu_ram', label: 'Procesador / RAM', placeholder: 'Ej: Intel i7-1260P / 16GB DDR4' },
        { key: 'storage_os', label: 'Almacenamiento / SO', placeholder: 'Ej: NVMe 512GB / Windows 11 Pro' },
      ];
    case 'mobile':
      return [
        { key: 'secondary_imei', label: 'IMEI Secundario', placeholder: 'Ej: 356982104491202' },
        { key: 'screen_touch', label: 'Estado de Pantalla / Touch', placeholder: 'Ej: Trizada en esquina, touch OK' },
        { key: 'cloud_lock', label: 'Cuenta Cloud / Bloqueo', placeholder: 'Ej: iCloud desactivado / FRP limpio' },
      ];
    case 'machinery':
      return [
        { key: 'hour_meter', label: 'Horómetro / Kilometraje', placeholder: 'Ej: 1.420 hrs' },
        { key: 'fuel_voltage', label: 'Combustible / Voltaje', placeholder: 'Ej: Bencina 93 / 220V Monofásico' },
        { key: 'power_output', label: 'Potencia Nominal', placeholder: 'Ej: 6.5 kVA / 13 HP' },
      ];
    case 'appliances':
      return [
        { key: 'voltage_amp', label: 'Voltaje / Consumo', placeholder: 'Ej: 220V / 1800W' },
        { key: 'warranty_seal', label: 'Sello de Garantía', placeholder: 'Ej: Intacto / Intervenido' },
        { key: 'installation_type', label: 'Tipo Instalación', placeholder: 'Ej: Empotrado / Libre' },
      ];
    case 'automotive':
      return [
        { key: 'plate_vin', label: 'Patente / VIN', placeholder: 'Ej: ABCD-12' },
        { key: 'mileage', label: 'Kilometraje Actual', placeholder: 'Ej: 84.500 km' },
        { key: 'fuel_level', label: 'Nivel Combustible / Batería', placeholder: 'Ej: 1/2 estanque / 12.4V' },
      ];
    default:
      return [
        { key: 'spec_1', label: 'Especificación Técnica', placeholder: 'Dato técnico relevante' },
        { key: 'spec_2', label: 'Versión / Lote', placeholder: 'Rev. / Año fabricación' },
      ];
  }
}

export const SECTOR_LABELS: Record<IndustrySector, string> = {
  computing: 'Computación / Electrónica',
  mobile: 'Telefonía / Móviles',
  machinery: 'Maquinaria / Herramientas',
  appliances: 'Electrodomésticos',
  automotive: 'Automotriz / Flota Vehicular',
  general: 'Servicio Técnico General',
};

export const ORDER_STATUS_META: Record<
  OrderStatus,
  {
    label: string;
    shortLabel: string;
    stepIndex: number;
    progress: number;
    pillClasses: string;
    textColor: string;
    dotColor: string;
    bgColor: string;
    borderColor: string;
  }
> = {
  received: {
    label: 'Recibido',
    shortLabel: 'Recibido',
    stepIndex: 0,
    progress: 20,
    pillClasses: 'bg-[#F4F6FB] text-slate-600 border border-[#D8E4EC]',
    textColor: 'text-slate-700',
    dotColor: 'bg-slate-500',
    bgColor: 'bg-slate-100',
    borderColor: 'border-slate-300',
  },
  diagnosing: {
    label: 'En Diagnóstico',
    shortLabel: 'Diagnóstico',
    stepIndex: 1,
    progress: 40,
    pillClasses: 'bg-[#F4F6FB] text-slate-600 border border-[#D8E4EC]',
    textColor: 'text-cyan-800',
    dotColor: 'bg-cyan-600',
    bgColor: 'bg-cyan-50',
    borderColor: 'border-cyan-200',
  },
  waiting_approval: {
    label: 'Esperando Aprobación',
    shortLabel: 'Por Aprobar',
    stepIndex: 2,
    progress: 55,
    pillClasses: 'bg-amber-50 text-amber-700 border border-amber-200',
    textColor: 'text-amber-800',
    dotColor: 'bg-amber-500',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
  },
  in_repair: {
    label: 'En Reparación',
    shortLabel: 'Reparación',
    stepIndex: 3,
    progress: 75,
    pillClasses: 'bg-[#EBF4FA] text-[#3E92CC] border border-[#3E92CC]/25',
    textColor: 'text-blue-800',
    dotColor: 'bg-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
  },
  ready: {
    label: 'Listo para Entrega',
    shortLabel: 'Listo',
    stepIndex: 4,
    progress: 90,
    pillClasses: 'bg-[#EBF8F6] text-[#1B998B] border border-[#1B998B]/25',
    textColor: 'text-emerald-800',
    dotColor: 'bg-emerald-600',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
  },
  delivered: {
    label: 'Entregado',
    shortLabel: 'Entregado',
    stepIndex: 5,
    progress: 100,
    pillClasses: 'bg-[#EBF8F6] text-[#157A6E] border border-[#1B998B]/30',
    textColor: 'text-slate-600',
    dotColor: 'bg-slate-400',
    bgColor: 'bg-slate-100',
    borderColor: 'border-slate-200',
  },
};

export interface RolePermissions {
  label: string;
  description: string;
  canCreateTenant: boolean;
  canEditSettings: boolean;
  canDeleteBranch: boolean;
  canManageUsers: boolean;
  canManageStock: boolean;
  canManageCatalogPrices: boolean;
  canManageInventoryCosts: boolean;
  canEditFinancials: boolean;
  canEditDiagnosis: boolean;
  canDeletePhotos: boolean;
  canDeliverOrder: boolean;
  canManageOrderLoans: boolean;
  canReceivePayments: boolean;
  canCreateOrder: boolean;
  canManageClients: boolean;
}

export function mapDbRoleToRoleType(dbRole?: string | null): RoleType {
  switch ((dbRole ?? '').toLowerCase()) {
    case 'superadmin':
      return 'superadmin';
    case 'company_admin':
    case 'admin':
      return 'admin';
    case 'receptionist':
      return 'receptionist';
    case 'technician':
      return 'technician';
    default:
      return 'admin';
  }
}

export function mapRoleTypeToDbRole(role: RoleType): string {
  return role === 'admin' ? 'company_admin' : role;
}

export function getRolePermissions(role: RoleType): RolePermissions {
  switch (role) {
    case 'superadmin':
      return {
        label: 'SuperAdmin Global',
        description: 'Control multiempresa, sucursales, usuarios, configuración y métricas globales.',
        canCreateTenant: true,
        canEditSettings: true,
        canDeleteBranch: true,
        canManageUsers: true,
        canManageStock: true,
        canManageCatalogPrices: true,
        canManageInventoryCosts: true,
        canEditFinancials: true,
        canEditDiagnosis: true,
        canDeletePhotos: true,
        canDeliverOrder: true,
        canManageOrderLoans: true,
        canReceivePayments: true,
        canCreateOrder: true,
        canManageClients: true,
      };
    case 'admin':
      return {
        label: 'Admin de Taller',
        description: 'Gestión de Casa Matriz, sucursales, equipo, IVA, WhatsApp, inventario y finanzas.',
        canCreateTenant: false,
        canEditSettings: true,
        canDeleteBranch: true,
        canManageUsers: true,
        canManageStock: true,
        canManageCatalogPrices: true,
        canManageInventoryCosts: true,
        canEditFinancials: true,
        canEditDiagnosis: true,
        canDeletePhotos: true,
        canDeliverOrder: true,
        canManageOrderLoans: true,
        canReceivePayments: true,
        canCreateOrder: true,
        canManageClients: true,
      };
    case 'receptionist':
      return {
        label: 'Recepcionista',
        description: 'Recepción de equipos, emisión de los 9 reportes .rpt, abonos, citas y seguimiento.',
        canCreateTenant: false,
        canEditSettings: false,
        canDeleteBranch: false,
        canManageUsers: false,
        canManageStock: false,
        canManageCatalogPrices: false,
        canManageInventoryCosts: false,
        canEditFinancials: false,
        canEditDiagnosis: false,
        canDeletePhotos: false,
        canDeliverOrder: true,
        canManageOrderLoans: true,
        canReceivePayments: true,
        canCreateOrder: true,
        canManageClients: true,
      };
    case 'technician':
      return {
        label: 'Técnico',
        description: 'Órdenes asignadas, diagnóstico, visualización de precios/IVA, captura de fotos WebP y agenda.',
        canCreateTenant: false,
        canEditSettings: false,
        canDeleteBranch: false,
        canManageUsers: false,
        canManageStock: false,
        canManageCatalogPrices: false,
        canManageInventoryCosts: false,
        canEditFinancials: false,
        canEditDiagnosis: true,
        canDeletePhotos: false,
        canDeliverOrder: false,
        canManageOrderLoans: false,
        canReceivePayments: false,
        canCreateOrder: false,
        canManageClients: false,
      };
  }
}

export function canViewGlobalScope(
  activeRole: RoleType,
  sessionRole?: RoleType | null
): boolean {
  if (sessionRole && sessionRole !== 'superadmin') return false;
  return activeRole === 'superadmin';
}

export function getVisibleTenantsForScope(
  tenants: Tenant[],
  activeRole: RoleType,
  session?: { role: RoleType; tenant_id: string | null } | null,
  fallbackTenantId?: string
): Tenant[] {
  if (canViewGlobalScope(activeRole, session?.role)) {
    return tenants;
  }
  const lockedTenantId =
    session && session.role !== 'superadmin' && session.tenant_id
      ? session.tenant_id
      : fallbackTenantId;
  if (!lockedTenantId) return tenants.slice(0, 1);
  const matched = tenants.filter((t) => t.id === lockedTenantId);
  return matched.length > 0 ? matched : tenants.slice(0, 1);
}

export function filterVisibleAppUsers(
  appUsers: AppUser[],
  activeRole: RoleType,
  currentTenantId: string,
  scope: 'global' | 'tenant' = 'tenant',
  sessionRole?: RoleType | null
): AppUser[] {
  const allowGlobal = canViewGlobalScope(activeRole, sessionRole);
  if (allowGlobal && scope === 'global') {
    return appUsers;
  }
  if (allowGlobal) {
    return appUsers.filter(
      (u) => u.tenant_id === currentTenantId || u.tenant_id === null
    );
  }
  return appUsers.filter((u) => u.tenant_id === currentTenantId);
}

export function searchFilterAppUsers(
  users: AppUser[],
  query: string,
  roleFilter: RoleType | 'ALL' = 'ALL',
  statusFilter: 'ALL' | 'active' | 'inactive' = 'ALL'
): AppUser[] {
  const q = query.trim().toLowerCase().replace(/^@+/, '');
  return users.filter((u) => {
    if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
    if (statusFilter === 'active' && !u.is_active) return false;
    if (statusFilter === 'inactive' && u.is_active) return false;
    if (!q) return true;
    return (
      u.full_name.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q)
    );
  });
}

export function prepareAppUserUpdate(params: {
  existing: AppUser;
  patch: Partial<Omit<AppUser, 'id' | 'created_at'>>;
  newPassword?: string;
  fallbackTenantId: string;
  allowGlobalView: boolean;
  allUsers: AppUser[];
  currentSessionUserId?: string | null;
}): { ok: true; user: AppUser } | { ok: false; error: string } {
  const {
    existing,
    patch,
    newPassword,
    fallbackTenantId,
    allowGlobalView,
    allUsers,
    currentSessionUserId,
  } = params;

  const nextRole: RoleType = patch.role ?? existing.role;
  const nextFullName = (patch.full_name ?? existing.full_name).trim();
  const nextUsername = (patch.username ?? existing.username)
    .trim()
    .replace(/^@+/, '');
  const nextIsActive =
    patch.is_active !== undefined ? patch.is_active : existing.is_active;

  if (!nextFullName || !nextUsername) {
    return {
      ok: false,
      error: 'Completa el nombre completo y el nombre de usuario.',
    };
  }

  const duplicate = allUsers.some(
    (u) =>
      u.id !== existing.id &&
      u.username.trim().toLowerCase() === nextUsername.toLowerCase()
  );
  if (duplicate) {
    return {
      ok: false,
      error: `El usuario "@${nextUsername}" ya está registrado en FIXICLOUD.`,
    };
  }

  if (currentSessionUserId && existing.id === currentSessionUserId && !nextIsActive) {
    return {
      ok: false,
      error: 'No puedes desactivar tu propia cuenta mientras tienes la sesión activa.',
    };
  }

  const rawTargetTenantId =
    patch.tenant_id !== undefined ? patch.tenant_id : existing.tenant_id;

  if (
    !allowGlobalView &&
    (nextRole === 'superadmin' ||
      (rawTargetTenantId !== null && rawTargetTenantId !== fallbackTenantId) ||
      existing.role === 'superadmin' ||
      existing.tenant_id !== fallbackTenantId)
  ) {
    return {
      ok: false,
      error:
        'Solo SuperAdmin Global puede gestionar cuentas globales o de otras empresas.',
    };
  }

  const resolvedTenantId =
    nextRole === 'superadmin'
      ? null
      : allowGlobalView
      ? rawTargetTenantId ?? fallbackTenantId
      : fallbackTenantId;

  const tenantChanged = resolvedTenantId !== existing.tenant_id;
  const rawBranchId =
    patch.branch_id !== undefined
      ? patch.branch_id
      : tenantChanged
      ? null
      : existing.branch_id;
  const resolvedBranchId = nextRole === 'superadmin' ? null : rawBranchId ?? null;

  const trimmedNewPassword = newPassword?.trim();
  const resolvedPassword =
    trimmedNewPassword && trimmedNewPassword.length > 0
      ? trimmedNewPassword
      : existing.pin_or_password;

  return {
    ok: true,
    user: {
      ...existing,
      full_name: nextFullName,
      username: nextUsername,
      role: nextRole,
      tenant_id: resolvedTenantId,
      branch_id: resolvedBranchId,
      is_active: nextIsActive,
      pin_or_password: resolvedPassword,
    },
  };
}

export function mergeMissingSeedTenants(
  stored: ErpState,
  seed: ErpState
): { state: ErpState; changed: boolean } {
  const existingTenantIds = new Set((stored.tenants ?? []).map((t) => t.id));
  const missingTenants = (seed.tenants ?? []).filter(
    (t) => !existingTenantIds.has(t.id)
  );

  if (missingTenants.length === 0) {
    return { state: stored, changed: false };
  }

  const missingTenantIds = new Set(missingTenants.map((t) => t.id));
  const mergeById = <T extends { id: string; tenant_id: string | null }>(
    current: T[] | undefined,
    fromSeed: T[] | undefined
  ): T[] => {
    const base = current ?? [];
    const seen = new Set(base.map((item) => item.id));
    const additions = (fromSeed ?? []).filter(
      (item) =>
        item.tenant_id !== null &&
        missingTenantIds.has(item.tenant_id) &&
        !seen.has(item.id)
    );
    return additions.length > 0 ? [...base, ...additions] : base;
  };

  return {
    changed: true,
    state: {
      tenants: [...(stored.tenants ?? []), ...missingTenants],
      branches: mergeById(stored.branches, seed.branches),
      appUsers: mergeById(stored.appUsers, seed.appUsers),
      clients: mergeById(stored.clients, seed.clients),
      assets: mergeById(stored.assets, seed.assets),
      catalogItems: mergeById(stored.catalogItems, seed.catalogItems),
      loanAssets: mergeById(stored.loanAssets, seed.loanAssets),
      workOrders: mergeById(stored.workOrders, seed.workOrders),
      appointments: mergeById(stored.appointments, seed.appointments),
    },
  };
}

export function filterErpStateForTenants(
  state: ErpState,
  tenantIds: Set<string>,
  options?: { includeGlobalAppUsers?: boolean }
): ErpState {
  const includeGlobal = Boolean(options?.includeGlobalAppUsers);
  return {
    tenants: state.tenants.filter((t) => tenantIds.has(t.id)),
    branches: state.branches.filter((b) => tenantIds.has(b.tenant_id)),
    appUsers: state.appUsers.filter((u) =>
      u.tenant_id === null ? includeGlobal : tenantIds.has(u.tenant_id)
    ),
    clients: state.clients.filter((c) => tenantIds.has(c.tenant_id)),
    assets: state.assets.filter((a) => tenantIds.has(a.tenant_id)),
    catalogItems: state.catalogItems.filter((i) => tenantIds.has(i.tenant_id)),
    loanAssets: state.loanAssets.filter((l) => tenantIds.has(l.tenant_id)),
    workOrders: state.workOrders.filter((w) => tenantIds.has(w.tenant_id)),
    appointments: state.appointments.filter((ap) => tenantIds.has(ap.tenant_id)),
  };
}

export function getDefaultAssetCategoryForSector(sector: IndustrySector): string {
  switch (sector) {
    case 'computing':
      return 'Notebook';
    case 'mobile':
      return 'Smartphone';
    case 'machinery':
      return 'Generador Eléctrico';
    case 'automotive':
      return 'Vehículo / Camioneta';
    case 'appliances':
      return 'Electrodoméstico';
    default:
      return 'Equipo';
  }
}

export function getDefaultTenantTechnicianName(
  appUsers: AppUser[],
  tenantId: string,
  branchId?: string | null
): string {
  const activeTenantUsers = appUsers.filter(
    (u) => u.is_active && u.tenant_id === tenantId
  );
  const branchTech =
    branchId && branchId !== 'ALL'
      ? activeTenantUsers.find(
          (u) => u.role === 'technician' && u.branch_id === branchId
        )
      : undefined;
  if (branchTech) return branchTech.full_name;
  const anyTech = activeTenantUsers.find((u) => u.role === 'technician');
  if (anyTech) return anyTech.full_name;
  const anyAdmin = activeTenantUsers.find((u) => u.role === 'admin');
  return anyAdmin?.full_name ?? 'Por asignar';
}

export function canDeductCatalogStock(
  category: 'part' | 'service',
  currentStockQty: number,
  requestedQty: number
): boolean {
  if (requestedQty <= 0) return false;
  if (category === 'service') return true;
  return currentStockQty >= requestedQty;
}

export function canDeleteBranchSafely(
  branchId: string,
  state: Pick<
    ErpState,
    'branches' | 'workOrders' | 'catalogItems' | 'loanAssets' | 'appointments' | 'appUsers'
  >
): { ok: true } | { ok: false; error: string } {
  const branch = state.branches.find((b) => b.id === branchId);
  if (!branch) {
    return { ok: false, error: 'Sucursal no encontrada.' };
  }
  if (branch.is_hq) {
    return {
      ok: false,
      error: `No se puede eliminar la Casa Matriz (${branch.name}).`,
    };
  }

  const linkedCount =
    state.workOrders.filter((w) => w.branch_id === branchId).length +
    state.catalogItems.filter((c) => c.branch_id === branchId).length +
    state.loanAssets.filter((l) => l.branch_id === branchId).length +
    state.appointments.filter((a) => a.branch_id === branchId).length +
    state.appUsers.filter((u) => u.branch_id === branchId).length;

  if (linkedCount > 0) {
    return {
      ok: false,
      error: `No se puede eliminar la sucursal "${branch.name}" porque tiene ${linkedCount} registro(s) asociados (órdenes, catálogo, préstamo, citas o usuarios).`,
    };
  }

  return { ok: true };
}

const RECEPTIONIST_ALLOWED_TARGET_STATUSES: ReadonlySet<OrderStatus> = new Set([
  'received',
  'waiting_approval',
  'delivered',
]);

export function sanitizeOrderUpdateForRole(
  existing: WorkOrder | undefined,
  updated: WorkOrder,
  role: RoleType
): WorkOrder {
  if (!existing) return updated;
  const perms = getRolePermissions(role);

  let safeStatus = updated.status;
  if (safeStatus !== existing.status) {
    if (role === 'technician' && safeStatus === 'delivered') {
      safeStatus = existing.status;
    } else if (
      role === 'receptionist' &&
      !RECEPTIONIST_ALLOWED_TARGET_STATUSES.has(safeStatus)
    ) {
      safeStatus = existing.status;
    }
  }

  let safePhotos = updated.photos;
  if (!perms.canDeletePhotos) {
    const existingIds = new Set(existing.photos.map((p) => p.id));
    const newlyAdded = updated.photos.filter((p) => !existingIds.has(p.id));
    safePhotos = [...existing.photos, ...newlyAdded];
  }

  return {
    ...updated,
    status: safeStatus,
    photos: safePhotos,
    loan: perms.canManageOrderLoans ? updated.loan : existing.loan,
    apply_iva: perms.canEditFinancials ? updated.apply_iva : existing.apply_iva,
    discount_amount: perms.canEditFinancials
      ? updated.discount_amount
      : existing.discount_amount,
    items: perms.canEditFinancials ? updated.items : existing.items,
    payments: perms.canReceivePayments ? updated.payments : existing.payments,
    technical_diagnosis: perms.canEditDiagnosis
      ? updated.technical_diagnosis
      : existing.technical_diagnosis,
    work_performed: perms.canEditDiagnosis
      ? updated.work_performed
      : existing.work_performed,
    parts_and_observations: perms.canEditDiagnosis
      ? updated.parts_and_observations
      : existing.parts_and_observations,
    reported_symptoms: perms.canManageClients
      ? updated.reported_symptoms
      : existing.reported_symptoms,
    warranty_days: perms.canManageClients
      ? updated.warranty_days
      : existing.warranty_days,
    assigned_technician: perms.canManageClients
      ? updated.assigned_technician
      : existing.assigned_technician,
    accessories_received: perms.canManageClients
      ? updated.accessories_received
      : existing.accessories_received,
    entry_condition: perms.canManageClients
      ? updated.entry_condition
      : existing.entry_condition,
    modality: perms.canManageClients ? updated.modality : existing.modality,
    visit_address: perms.canManageClients
      ? updated.visit_address
      : existing.visit_address,
    visit_scheduled_at: perms.canManageClients
      ? updated.visit_scheduled_at
      : existing.visit_scheduled_at,
  };
}
