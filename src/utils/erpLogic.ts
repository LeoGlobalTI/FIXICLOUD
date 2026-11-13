import type {
  Branch,
  Client,
  CustomerAsset,
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

export function calculateOrderFinancials(
  items: WorkOrderItem[],
  discountAmount: number,
  applyIva: boolean,
  ivaRatePercent: number,
  payments: WorkOrderPayment[]
): FinancialSummary {
  const subtotal = items.reduce(
    (acc, item) => acc + Math.max(0, item.qty) * Math.max(0, item.unit_price),
    0
  );
  const safeDiscount = Math.min(Math.max(0, discountAmount), subtotal);
  const netAfterDiscount = Math.max(0, subtotal - safeDiscount);
  const ivaAmount = applyIva
    ? Math.round(netAfterDiscount * (Math.max(0, ivaRatePercent) / 100))
    : 0;
  const totalAmount = netAfterDiscount + ivaAmount;
  const paidAmount = payments.reduce((acc, p) => acc + Math.max(0, p.amount), 0);
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
  automotive: 'Automotriz',
  general: 'Servicio Técnico General',
};

export const ORDER_STATUS_META: Record<
  OrderStatus,
  { label: string; shortLabel: string; stepIndex: number; textColor: string; dotColor: string; bgColor: string; borderColor: string }
> = {
  received: {
    label: 'Recibido',
    shortLabel: 'Recibido',
    stepIndex: 0,
    textColor: 'text-slate-700',
    dotColor: 'bg-slate-500',
    bgColor: 'bg-slate-100',
    borderColor: 'border-slate-300',
  },
  diagnosing: {
    label: 'En Diagnóstico',
    shortLabel: 'Diagnóstico',
    stepIndex: 1,
    textColor: 'text-cyan-800',
    dotColor: 'bg-cyan-600',
    bgColor: 'bg-cyan-50',
    borderColor: 'border-cyan-200',
  },
  waiting_approval: {
    label: 'Esperando Aprobación',
    shortLabel: 'Por Aprobar',
    stepIndex: 2,
    textColor: 'text-amber-800',
    dotColor: 'bg-amber-500',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
  },
  in_repair: {
    label: 'En Reparación',
    shortLabel: 'Reparación',
    stepIndex: 3,
    textColor: 'text-blue-800',
    dotColor: 'bg-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
  },
  ready: {
    label: 'Listo para Entrega',
    shortLabel: 'Listo',
    stepIndex: 4,
    textColor: 'text-emerald-800',
    dotColor: 'bg-emerald-600',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
  },
  delivered: {
    label: 'Entregado',
    shortLabel: 'Entregado',
    stepIndex: 5,
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
  canManageInventoryCosts: boolean;
  canEditFinancials: boolean;
  canEditDiagnosis: boolean;
  canReceivePayments: boolean;
  canCreateOrder: boolean;
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
        canManageInventoryCosts: true,
        canEditFinancials: true,
        canEditDiagnosis: true,
        canReceivePayments: true,
        canCreateOrder: true,
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
        canManageInventoryCosts: true,
        canEditFinancials: true,
        canEditDiagnosis: true,
        canReceivePayments: true,
        canCreateOrder: true,
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
        canManageInventoryCosts: false,
        canEditFinancials: false,
        canEditDiagnosis: false,
        canReceivePayments: true,
        canCreateOrder: true,
      };
    case 'technician':
      return {
        label: 'Técnico',
        description: 'Órdenes asignadas, diagnóstico, repuestos, captura de fotos WebP y agenda.',
        canCreateTenant: false,
        canEditSettings: false,
        canDeleteBranch: false,
        canManageUsers: false,
        canManageStock: true,
        canManageInventoryCosts: false,
        canEditFinancials: true,
        canEditDiagnosis: true,
        canReceivePayments: false,
        canCreateOrder: false,
      };
  }
}
