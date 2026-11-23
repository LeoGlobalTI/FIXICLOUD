import type {
  AppUser,
  Appointment,
  Branch,
  CatalogItem,
  Client,
  CustomerAsset,
  IndustrySector,
  LoanAsset,
  OrderStatus,
  PaymentMethod,
  PhotoStage,
  PublicOrderTrackData,
  ServiceModality,
  Tenant,
  WorkOrder,
  WorkOrderItem,
  WorkOrderLoan,
  WorkOrderPayment,
  WorkOrderPhoto,
} from '../types/erp';
import {
  calculateOrderFinancials,
  mapDbRoleToRoleType,
  mapRoleTypeToDbRole,
} from './erpLogic';
import { ensureUUID, isValidUUID } from './uuid';

const VALID_INDUSTRIES: IndustrySector[] = [
  'computing',
  'mobile',
  'machinery',
  'appliances',
  'automotive',
  'general',
];

const DEFAULT_WHATSAPP_TEMPLATES = {
  intake:
    'Hola {cliente}, confirmamos el ingreso de tu {equipo} en {empresa} ({sucursal}). Folio: {folio}. Código: {codigo}. Sigue tu equipo en vivo aquí: {url_seguimiento}',
  quote_ready:
    'Hola {cliente}, ya tenemos el diagnóstico de tu {equipo} (Folio {folio}): {diagnostico}. Total presupuesto: {total}. Revisa detalles en: {url_seguimiento}',
  ready_for_pickup:
    'Hola {cliente}, tu {equipo} (Folio {folio}) está LISTO para retiro en {sucursal} ({direccion}). Saldo pendiente: {saldo}. Horario: {horario}.',
};

function sanitizeIndustry(val?: string | null): IndustrySector {
  if (val && VALID_INDUSTRIES.includes(val as IndustrySector)) {
    return val as IndustrySector;
  }
  return 'general';
}

function parseOrderNumberFromFolio(folio: string): number {
  const match = folio.match(/(\d+)$/);
  if (!match) return 100;
  const num = parseInt(match[1], 10);
  return Number.isNaN(num) ? 100 : num;
}

function buildIsoTimestamp(dateStr: string, timeStr: string): string {
  const cleanDate = /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
    ? dateStr
    : new Date().toISOString().slice(0, 10);
  const cleanTime = /^\d{2}:\d{2}$/.test(timeStr) ? timeStr : '09:00';
  return `${cleanDate}T${cleanTime}:00Z`;
}

function extractDateAndTime(iso?: string | null, fallbackDate?: string, fallbackTime?: string) {
  if (iso && iso.includes('T')) {
    let normalized = iso.trim();
    if (/[+-]\d{2}:?\d{2}$/.test(normalized)) {
      const parsed = new Date(normalized);
      if (!Number.isNaN(parsed.getTime())) {
        normalized = parsed.toISOString();
      }
    }
    const [d, rest] = normalized.split('T');
    return {
      date: /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : fallbackDate ?? new Date().toISOString().slice(0, 10),
      time: rest.slice(0, 5) || fallbackTime || '09:00',
    };
  }
  return {
    date: fallbackDate ?? new Date().toISOString().slice(0, 10),
    time: fallbackTime ?? '09:00',
  };
}

function formatPromisedAtForInput(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  const str = String(raw).trim();
  if (!str) return undefined;
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(str)) {
    const parsed = new Date(str);
    if (!Number.isNaN(parsed.getTime())) {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(
        parsed.getDate()
      )}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
    }
  }
  return str.slice(0, 16);
}

// ---------- OUTGOING MAPPERS (App -> PostgreSQL Exact Columns) ----------

interface DbTenantRow {
  id: string;
  name: string;
  legal_name: string | null;
  tax_id: string | null;
  industry: IndustrySector;
  currency: string;
  tax_rate: number;
  logo_url: string | null;
  order_prefix: string;
  last_order_number: number;
  terms_and_conditions: string | null;
  whatsapp_enabled: boolean;
  whatsapp_templates: Tenant['whatsapp_templates'];
  phone: string | null;
  email: string | null;
  warranty_days: number;
  is_active: boolean;
}

type DbTenantUpdateRow = Omit<DbTenantRow, 'id' | 'last_order_number'>;

export function mapTenantToDb(tenant: Tenant, lastOrderNumber = 105): DbTenantRow {
  return {
    id: ensureUUID(tenant.id),
    name: tenant.name,
    legal_name: tenant.name,
    tax_id: tenant.tax_id || null,
    industry: sanitizeIndustry(tenant.sector),
    currency: tenant.currency || 'CLP',
    tax_rate: Number(tenant.iva_rate ?? 19),
    logo_url: tenant.logo_url ?? null,
    order_prefix: tenant.folio_prefix || 'OT',
    last_order_number: lastOrderNumber,
    terms_and_conditions: tenant.legal_terms ?? null,
    whatsapp_enabled: Boolean(tenant.whatsapp_enabled),
    whatsapp_templates: tenant.whatsapp_templates ?? DEFAULT_WHATSAPP_TEMPLATES,
    phone: tenant.phone || null,
    email: tenant.email || null,
    warranty_days: Number(tenant.warranty_days ?? 90),
    is_active: true,
  };
}

export function mapTenantUpdateToDb(tenant: Tenant): DbTenantUpdateRow {
  return {
    name: tenant.name,
    legal_name: tenant.name,
    tax_id: tenant.tax_id || null,
    industry: sanitizeIndustry(tenant.sector),
    currency: tenant.currency || 'CLP',
    tax_rate: Number(tenant.iva_rate ?? 19),
    logo_url: tenant.logo_url ?? null,
    order_prefix: tenant.folio_prefix || 'OT',
    terms_and_conditions: tenant.legal_terms ?? null,
    whatsapp_enabled: Boolean(tenant.whatsapp_enabled),
    whatsapp_templates: tenant.whatsapp_templates ?? DEFAULT_WHATSAPP_TEMPLATES,
    phone: tenant.phone || null,
    email: tenant.email || null,
    warranty_days: Number(tenant.warranty_days ?? 90),
    is_active: true,
  };
}

export function stripOptionalTenantColumns<T extends object>(
  row: T
): Omit<T, 'whatsapp_templates' | 'phone' | 'email' | 'warranty_days'> {
  const {
    whatsapp_templates: _wt,
    phone: _ph,
    email: _em,
    warranty_days: _wd,
    ...base
  } = row as T & {
    whatsapp_templates?: unknown;
    phone?: unknown;
    email?: unknown;
    warranty_days?: unknown;
  };
  return base as Omit<T, 'whatsapp_templates' | 'phone' | 'email' | 'warranty_days'>;
}

interface DbBranchRow {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  is_headquarters: boolean;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  business_hours: string | null;
  is_active: boolean;
}

export function mapBranchToDb(branch: Branch, forceNonHq = false): DbBranchRow {
  return {
    id: ensureUUID(branch.id),
    tenant_id: ensureUUID(branch.tenant_id),
    name: branch.name,
    code: branch.code,
    is_headquarters: forceNonHq ? false : Boolean(branch.is_hq),
    address: branch.address || null,
    city: branch.city || null,
    phone: branch.phone || null,
    email: branch.email || null,
    business_hours: branch.business_hours || null,
    is_active: true,
  };
}

export function stripOptionalBranchColumns<T extends object>(
  row: T
): Omit<T, 'city' | 'business_hours'> {
  const { city: _c, business_hours: _bh, ...base } = row as T & {
    city?: unknown;
    business_hours?: unknown;
  };
  return base as Omit<T, 'city' | 'business_hours'>;
}

export function mapBranchesToDbSafe(branches: Branch[]): DbBranchRow[] {
  const hqSeenByTenant = new Set<string>();
  return branches.map((b) => {
    const tenantUuid = ensureUUID(b.tenant_id);
    let forceNonHq = false;
    if (b.is_hq) {
      if (hqSeenByTenant.has(tenantUuid)) {
        forceNonHq = true;
      } else {
        hqSeenByTenant.add(tenantUuid);
      }
    }
    return mapBranchToDb(b, forceNonHq);
  });
}

interface DbClientRow {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  full_name: string;
  tax_id: string | null;
  phone: string | null;
  secondary_phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
  legacy_mdb_id: string | null;
}

export function mapClientToDb(
  client: Client,
  options?: { branchId?: string | null; legacyMdbId?: string | null }
): DbClientRow {
  return {
    id: ensureUUID(client.id),
    tenant_id: ensureUUID(client.tenant_id),
    branch_id: options?.branchId ? ensureUUID(options.branchId) : null,
    full_name: client.name,
    tax_id: client.rut || null,
    phone: client.phone || null,
    secondary_phone: null,
    email: client.email || null,
    address: client.address || null,
    city: client.city || null,
    notes: client.notes ?? null,
    legacy_mdb_id: options?.legacyMdbId ?? null,
  };
}

interface DbCustomerAssetRow {
  id: string;
  tenant_id: string;
  client_id: string;
  asset_category: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  unlock_credentials: string | null;
  custom_attributes: Record<string, string>;
  legacy_mdb_id: string | null;
}

export function mapAssetToDb(asset: CustomerAsset): DbCustomerAssetRow {
  return {
    id: ensureUUID(asset.id),
    tenant_id: ensureUUID(asset.tenant_id),
    client_id: ensureUUID(asset.client_id),
    asset_category: asset.category || 'Equipo',
    brand: asset.brand || null,
    model: asset.model || null,
    serial_number: asset.serial_imei || null,
    unlock_credentials: asset.password_pattern ?? null,
    custom_attributes: asset.custom_attributes ?? {},
    legacy_mdb_id: asset.custom_attributes?.legacy_origin ?? null,
  };
}

interface DbCatalogItemRow {
  id: string;
  tenant_id: string;
  branch_id: string;
  sku: string | null;
  name: string;
  description: string | null;
  type: 'part' | 'service' | 'custom';
  cost_price: number;
  sale_price: number;
  stock_quantity: number;
  min_stock: number;
  track_inventory: boolean;
  is_active: boolean;
}

export function mapCatalogItemToDb(item: CatalogItem): DbCatalogItemRow {
  const itemType = item.category === 'service' ? 'service' : 'part';
  return {
    id: ensureUUID(item.id),
    tenant_id: ensureUUID(item.tenant_id),
    branch_id: ensureUUID(item.branch_id),
    sku: item.sku || null,
    name: item.name,
    description: null,
    type: itemType,
    cost_price: Number(item.cost_price ?? 0),
    sale_price: Number(item.sale_price ?? 0),
    stock_quantity: Math.max(0, Math.round(Number(item.stock_qty ?? 0))),
    min_stock: Math.max(0, Math.round(Number(item.min_stock ?? 0))),
    track_inventory: itemType === 'part',
    is_active: true,
  };
}

interface DbLoanAssetRow {
  id: string;
  tenant_id: string;
  branch_id: string;
  internal_code: string;
  name: string;
  serial_number: string | null;
  accessories_included: string | null;
  value_amount: number;
  status: 'available' | 'loaned' | 'maintenance';
  notes: string | null;
}

export function mapLoanAssetToDb(loan: LoanAsset): DbLoanAssetRow {
  return {
    id: ensureUUID(loan.id),
    tenant_id: ensureUUID(loan.tenant_id),
    branch_id: ensureUUID(loan.branch_id),
    internal_code: loan.code,
    name: loan.name,
    serial_number: loan.serial_number || null,
    accessories_included: loan.brand_model || null,
    value_amount: 0,
    status: loan.status,
    notes: loan.condition_notes || null,
  };
}

interface DbWorkOrderRow {
  id: string;
  tenant_id: string;
  branch_id: string;
  order_number: number;
  folio: string;
  tracking_code: string;
  client_id: string;
  asset_id: string;
  modality: ServiceModality;
  service_address: string | null;
  status: OrderStatus;
  priority: string;
  accessories_received: string | null;
  physical_condition_notes: string | null;
  reported_symptoms: string | null;
  technical_diagnosis: string | null;
  work_performed: string | null;
  parts_and_observations: string | null;
  internal_notes: string | null;
  apply_tax: boolean;
  tax_rate: number;
  subtotal_amount: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  warranty_days: number;
  received_at: string;
  promised_at: string | null;
  delivered_at: string | null;
}

export function mapWorkOrderToDb(order: WorkOrder, taxRate = 19): DbWorkOrderRow {
  const fin = calculateOrderFinancials(
    order.items,
    order.discount_amount,
    order.apply_iva,
    taxRate,
    order.payments
  );

  let promisedAt: string | null = null;
  if (order.visit_scheduled_at) {
    const parsed = new Date(order.visit_scheduled_at);
    if (!Number.isNaN(parsed.getTime())) {
      promisedAt = parsed.toISOString();
    }
  }

  const deliveredAt =
    order.status === 'delivered'
      ? order.delivered_at || order.updated_at || new Date().toISOString()
      : null;

  // Note: balance_due is NEVER sent because PostgreSQL computes it as GENERATED ALWAYS STORED
  return {
    id: ensureUUID(order.id),
    tenant_id: ensureUUID(order.tenant_id),
    branch_id: ensureUUID(order.branch_id),
    order_number: parseOrderNumberFromFolio(order.folio),
    folio: order.folio,
    tracking_code: order.tracking_code,
    client_id: ensureUUID(order.client_id),
    asset_id: ensureUUID(order.asset_id),
    modality: order.modality,
    service_address: order.visit_address || null,
    status: order.status,
    priority: 'normal',
    accessories_received: order.accessories_received || null,
    physical_condition_notes: order.entry_condition || null,
    reported_symptoms: order.reported_symptoms || null,
    technical_diagnosis: order.technical_diagnosis || null,
    work_performed: order.work_performed || null,
    parts_and_observations: order.parts_and_observations || null,
    internal_notes: order.assigned_technician
      ? `Técnico: ${order.assigned_technician}`
      : null,
    apply_tax: Boolean(order.apply_iva),
    tax_rate: Number(taxRate ?? 19),
    subtotal_amount: fin.subtotal,
    discount_amount: fin.discount,
    tax_amount: fin.ivaAmount,
    total_amount: fin.totalAmount,
    paid_amount: fin.paidAmount,
    warranty_days: Number(order.warranty_days ?? 90),
    received_at: order.created_at || new Date().toISOString(),
    promised_at: promisedAt,
    delivered_at: deliveredAt,
  };
}

export function stripOptionalWorkOrderColumns<T extends object>(
  row: T
): Omit<T, 'delivered_at'> {
  const { delivered_at: _da, ...base } = row as T & { delivered_at?: unknown };
  return base as Omit<T, 'delivered_at'>;
}

interface DbAppointmentRow {
  id: string;
  tenant_id: string;
  branch_id: string;
  client_id: string;
  work_order_id: string | null;
  subject: string;
  description: string | null;
  scheduled_start: string;
  scheduled_end: string;
  modality: ServiceModality;
  address: string | null;
  status: string;
}

export function mapAppointmentToDb(apt: Appointment): DbAppointmentRow {
  const tech = apt.technician.trim();
  const notes = (apt.notes ?? '').trim();
  const description =
    tech || notes
      ? JSON.stringify({
          ...(tech ? { technician: tech } : {}),
          ...(notes ? { notes } : {}),
        })
      : null;

  return {
    id: ensureUUID(apt.id),
    tenant_id: ensureUUID(apt.tenant_id),
    branch_id: ensureUUID(apt.branch_id),
    client_id: ensureUUID(apt.client_id),
    work_order_id: apt.work_order_id ? ensureUUID(apt.work_order_id) : null,
    subject: apt.subject,
    description,
    scheduled_start: buildIsoTimestamp(apt.date, apt.start_time),
    scheduled_end: buildIsoTimestamp(apt.date, apt.end_time),
    modality: apt.modality,
    address: apt.visit_address ?? null,
    status: apt.status,
  };
}

interface DbAppUserRow {
  id: string;
  tenant_id: string | null;
  branch_id: string | null;
  username: string;
  pin_or_password: string;
  full_name: string;
  role: string;
  is_active: boolean;
}

type DbAppUserUpdateWithoutPasswordRow = Omit<DbAppUserRow, 'id' | 'pin_or_password'>;

export function mapAppUserToDb(user: AppUser): DbAppUserRow {
  return {
    id: ensureUUID(user.id),
    tenant_id: user.tenant_id ? ensureUUID(user.tenant_id) : null,
    branch_id: user.branch_id ? ensureUUID(user.branch_id) : null,
    username: user.username.trim(),
    pin_or_password: user.pin_or_password.trim(),
    full_name: user.full_name.trim(),
    role: mapRoleTypeToDbRole(user.role),
    is_active: Boolean(user.is_active),
  };
}

export function mapAppUserUpdateWithoutPasswordToDb(
  user: AppUser
): DbAppUserUpdateWithoutPasswordRow {
  return {
    tenant_id: user.tenant_id ? ensureUUID(user.tenant_id) : null,
    branch_id: user.branch_id ? ensureUUID(user.branch_id) : null,
    username: user.username.trim(),
    full_name: user.full_name.trim(),
    role: mapRoleTypeToDbRole(user.role),
    is_active: Boolean(user.is_active),
  };
}

interface DbWorkOrderItemRow {
  id: string;
  tenant_id: string;
  work_order_id: string;
  catalog_item_id: string | null;
  item_type: 'part' | 'service' | 'custom';
  description: string;
  quantity: number;
  unit_price: number;
  deducted_from_stock: boolean;
}

export function mapWorkOrderItemToDb(
  item: WorkOrderItem,
  context: {
    tenantId: string;
    workOrderId: string;
    catalogItemType?: 'part' | 'service' | 'custom';
  }
): DbWorkOrderItemRow {
  const itemType: 'part' | 'service' | 'custom' =
    context.catalogItemType ?? (item.source === 'catalog' ? 'part' : 'custom');
  // Note: total_price / total is NEVER sent because PostgreSQL computes it as GENERATED ALWAYS STORED
  return {
    id: ensureUUID(item.id),
    tenant_id: ensureUUID(context.tenantId),
    work_order_id: ensureUUID(context.workOrderId),
    catalog_item_id: item.catalog_item_id ? ensureUUID(item.catalog_item_id) : null,
    item_type: itemType,
    description: item.description,
    quantity: Math.max(1, Math.round(Number(item.qty) || 1)),
    unit_price: Number(item.unit_price) || 0,
    deducted_from_stock: item.source === 'catalog' && itemType === 'part',
  };
}

interface DbWorkOrderPaymentRow {
  id: string;
  tenant_id: string;
  branch_id: string;
  work_order_id: string;
  receipt_number: string | null;
  amount: number;
  payment_method: PaymentMethod;
  notes: string | null;
  paid_at: string;
}

function toIsoPaidAt(dateStr?: string): string {
  if (!dateStr) return new Date().toISOString();
  if (dateStr.includes('T')) {
    const d = new Date(dateStr);
    return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return `${dateStr}T12:00:00Z`;
  }
  return new Date().toISOString();
}

export function mapWorkOrderPaymentToDb(
  payment: WorkOrderPayment,
  context: {
    tenantId: string;
    branchId: string;
    workOrderId: string;
  }
): DbWorkOrderPaymentRow {
  return {
    id: ensureUUID(payment.id),
    tenant_id: ensureUUID(context.tenantId),
    branch_id: ensureUUID(context.branchId),
    work_order_id: ensureUUID(context.workOrderId),
    receipt_number: payment.reference ?? null,
    amount: Number(payment.amount) || 0,
    payment_method: payment.method,
    notes: null,
    paid_at: toIsoPaidAt(payment.date),
  };
}

interface DbWorkOrderPhotoRow {
  id: string;
  tenant_id: string;
  work_order_id: string;
  storage_path: string;
  public_url: string;
  stage: PhotoStage;
  caption: string | null;
}

function derivePhotoStoragePath(url: string): string {
  const marker = '/storage/v1/object/public/order-photos/';
  const idx = url.indexOf(marker);
  if (idx !== -1) {
    const extracted = url.slice(idx + marker.length).trim();
    if (extracted) return extracted;
  }
  return 'external';
}

export function mapWorkOrderPhotoToDb(
  photo: WorkOrderPhoto,
  context: {
    tenantId: string;
    workOrderId: string;
  }
): DbWorkOrderPhotoRow {
  const publicUrl = photo.url || '';
  return {
    id: ensureUUID(photo.id),
    tenant_id: ensureUUID(context.tenantId),
    work_order_id: ensureUUID(context.workOrderId),
    storage_path: derivePhotoStoragePath(publicUrl),
    public_url: publicUrl,
    stage: photo.stage,
    caption: photo.caption || null,
  };
}

interface DbWorkOrderLoanRow {
  id: string;
  tenant_id: string;
  work_order_id: string;
  loan_asset_id: string;
  loaned_at: string;
  expected_return_at: string | null;
  returned_at: string | null;
  condition_on_loan: string | null;
  condition_on_return: string | null;
  is_active: boolean;
}

export function mapWorkOrderLoanToDb(
  loan: WorkOrderLoan,
  context: {
    tenantId: string;
    workOrderId: string;
  }
): DbWorkOrderLoanRow {
  return {
    id: ensureUUID(loan.id),
    tenant_id: ensureUUID(context.tenantId),
    work_order_id: ensureUUID(context.workOrderId),
    loan_asset_id: ensureUUID(loan.loan_asset_id),
    loaned_at: loan.loaned_at || new Date().toISOString(),
    expected_return_at: null,
    returned_at: loan.returned_at ?? null,
    condition_on_loan: loan.delivery_notes || null,
    condition_on_return: null,
    is_active: !loan.returned_at,
  };
}

// ---------- INCOMING MAPPERS (PostgreSQL -> App State) ----------

export function mapTenantFromDb(row: Record<string, unknown>): Tenant {
  const rawTemplates = row.whatsapp_templates as Tenant['whatsapp_templates'] | undefined;
  return {
    id: String(row.id),
    name: String(row.name ?? 'Empresa'),
    tax_id: String(row.tax_id ?? ''),
    sector: sanitizeIndustry(String(row.industry ?? row.sector ?? 'general')),
    currency: String(row.currency ?? 'CLP'),
    iva_rate: Number(row.tax_rate ?? row.iva_rate ?? 19),
    folio_prefix: String(row.order_prefix ?? row.folio_prefix ?? 'OT'),
    whatsapp_enabled: Boolean(row.whatsapp_enabled ?? true),
    whatsapp_templates: rawTemplates?.intake
      ? rawTemplates
      : DEFAULT_WHATSAPP_TEMPLATES,
    phone: String(row.phone ?? ''),
    email: String(row.email ?? ''),
    warranty_days: row.warranty_days != null ? Number(row.warranty_days) : 90,
    legal_terms:
      row.terms_and_conditions != null
        ? String(row.terms_and_conditions)
        : row.legal_terms != null
        ? String(row.legal_terms)
        : undefined,
    logo_url: row.logo_url != null ? String(row.logo_url) : null,
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

export function mapBranchFromDb(row: Record<string, unknown>): Branch {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    name: String(row.name ?? 'Sucursal'),
    code: String(row.code ?? 'SUC'),
    is_hq: Boolean(row.is_headquarters ?? row.is_hq ?? false),
    address: String(row.address ?? ''),
    city: String(row.city ?? ''),
    phone: String(row.phone ?? ''),
    email: row.email != null ? String(row.email) : undefined,
    business_hours: String(row.business_hours ?? 'Lun-Vie 09:00 - 18:30'),
  };
}

export function mapClientFromDb(row: Record<string, unknown>): Client {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    name: String(row.full_name ?? row.name ?? 'Cliente'),
    rut: String(row.tax_id ?? row.rut ?? ''),
    phone: String(row.phone ?? ''),
    email: String(row.email ?? ''),
    address: String(row.address ?? ''),
    city: String(row.city ?? ''),
    notes: row.notes != null ? String(row.notes) : undefined,
  };
}

export function mapAssetFromDb(row: Record<string, unknown>): CustomerAsset {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    client_id: String(row.client_id),
    category: String(row.asset_category ?? row.category ?? 'Equipo'),
    brand: String(row.brand ?? ''),
    model: String(row.model ?? ''),
    serial_imei: String(row.serial_number ?? row.serial_imei ?? ''),
    password_pattern:
      row.unlock_credentials != null
        ? String(row.unlock_credentials)
        : row.password_pattern != null
        ? String(row.password_pattern)
        : undefined,
    custom_attributes:
      (row.custom_attributes as Record<string, string>) ?? {},
  };
}

export function mapCatalogItemFromDb(row: Record<string, unknown>): CatalogItem {
  const rawType = String(row.type ?? row.category ?? 'part');
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    branch_id: String(row.branch_id),
    sku: String(row.sku ?? ''),
    name: String(row.name ?? ''),
    category: rawType === 'service' ? 'service' : 'part',
    cost_price: Number(row.cost_price ?? 0),
    sale_price: Number(row.sale_price ?? row.price ?? 0),
    stock_qty: Number(row.stock_quantity ?? row.stock_qty ?? 0),
    min_stock: Number(row.min_stock ?? 1),
  };
}

export function mapLoanAssetFromDb(row: Record<string, unknown>): LoanAsset {
  const statusRaw = String(row.status ?? 'available');
  const status: LoanAsset['status'] =
    statusRaw === 'loaned' || statusRaw === 'maintenance' ? statusRaw : 'available';
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    branch_id: String(row.branch_id),
    code: String(row.internal_code ?? row.code ?? ''),
    name: String(row.name ?? ''),
    brand_model: String(row.accessories_included ?? row.brand_model ?? ''),
    serial_number: String(row.serial_number ?? ''),
    status,
    condition_notes: String(row.notes ?? row.condition_notes ?? ''),
  };
}

export function mapWorkOrderFromDb(
  row: Record<string, unknown>,
  children?: {
    items?: WorkOrderItem[];
    photos?: WorkOrderPhoto[];
    payments?: WorkOrderPayment[];
    loan?: WorkOrderLoan;
  }
): WorkOrder {
  const internalNotes = row.internal_notes != null ? String(row.internal_notes) : '';
  const techFromNotes = internalNotes.startsWith('Técnico: ')
    ? internalNotes.replace('Técnico: ', '').trim()
    : '';

  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    branch_id: String(row.branch_id),
    folio: String(row.folio ?? 'OT-000100'),
    tracking_code: String(row.tracking_code ?? ''),
    client_id: String(row.client_id),
    asset_id: String(row.asset_id),
    status: (row.status as OrderStatus) ?? 'received',
    modality: (row.modality as ServiceModality) ?? 'workshop',
    visit_address:
      row.service_address != null
        ? String(row.service_address)
        : row.visit_address != null
        ? String(row.visit_address)
        : undefined,
    visit_scheduled_at:
      row.promised_at != null
        ? formatPromisedAtForInput(row.promised_at)
        : row.visit_scheduled_at != null
        ? String(row.visit_scheduled_at)
        : undefined,
    accessories_received: String(row.accessories_received ?? ''),
    entry_condition: String(
      row.physical_condition_notes ?? row.entry_condition ?? ''
    ),
    reported_symptoms: String(row.reported_symptoms ?? ''),
    technical_diagnosis: String(row.technical_diagnosis ?? ''),
    work_performed: String(row.work_performed ?? ''),
    parts_and_observations: String(row.parts_and_observations ?? ''),
    assigned_technician: String(row.assigned_technician ?? techFromNotes ?? ''),
    apply_iva: Boolean(row.apply_tax ?? row.apply_iva ?? true),
    discount_amount: Number(row.discount_amount ?? 0),
    items:
      children?.items ??
      (Array.isArray(row.items) ? (row.items as WorkOrderItem[]) : []),
    payments:
      children?.payments ??
      (Array.isArray(row.payments) ? (row.payments as WorkOrderPayment[]) : []),
    photos:
      children?.photos ??
      (Array.isArray(row.photos) ? (row.photos as WorkOrderPhoto[]) : []),
    loan: children?.loan ?? (row.loan as WorkOrderLoan | undefined),
    warranty_days: row.warranty_days != null ? Number(row.warranty_days) : 90,
    legacy_mdb_id:
      row.legacy_mdb_id != null ? String(row.legacy_mdb_id) : undefined,
    delivered_at: row.delivered_at != null ? String(row.delivered_at) : null,
    created_at: String(
      row.received_at ?? row.created_at ?? new Date().toISOString()
    ),
    updated_at: String(
      row.updated_at ?? row.received_at ?? new Date().toISOString()
    ),
  };
}

export function mapAppointmentFromDb(row: Record<string, unknown>): Appointment {
  const start = extractDateAndTime(
    row.scheduled_start != null ? String(row.scheduled_start) : null,
    row.date != null ? String(row.date) : undefined,
    row.start_time != null ? String(row.start_time) : '09:00'
  );
  const end = extractDateAndTime(
    row.scheduled_end != null ? String(row.scheduled_end) : null,
    start.date,
    row.end_time != null ? String(row.end_time) : '10:00'
  );

  const desc = row.description != null ? String(row.description) : '';
  let technician = row.technician != null ? String(row.technician) : '';
  let notes = row.notes != null ? String(row.notes) : desc;
  if (desc.startsWith('{') && desc.endsWith('}')) {
    try {
      const parsed = JSON.parse(desc) as {
        technician?: unknown;
        notes?: unknown;
      };
      if (parsed && typeof parsed === 'object') {
        if (!technician && typeof parsed.technician === 'string') {
          technician = parsed.technician;
        }
        if (row.notes == null) {
          notes = typeof parsed.notes === 'string' ? parsed.notes : '';
        }
      }
    } catch {
      // Fall through to legacy delimiter parser
    }
  } else if (!technician && desc.startsWith('Técnico: ')) {
    const sepIdx = desc.indexOf(' — ');
    if (sepIdx !== -1) {
      technician = desc.slice('Técnico: '.length, sepIdx).trim();
      notes = desc.slice(sepIdx + 3);
    } else {
      technician = desc.replace('Técnico: ', '').trim();
      notes = '';
    }
  }

  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    branch_id: String(row.branch_id),
    subject: String(row.subject ?? ''),
    client_id: String(row.client_id),
    modality: (row.modality as ServiceModality) ?? 'workshop',
    visit_address:
      row.address != null
        ? String(row.address)
        : row.visit_address != null
        ? String(row.visit_address)
        : undefined,
    technician,
    date: start.date,
    start_time: start.time,
    end_time: end.time,
    status:
      row.status === 'completed' || row.status === 'cancelled'
        ? row.status
        : 'scheduled',
    notes: notes || undefined,
    work_order_id:
      row.work_order_id != null ? String(row.work_order_id) : undefined,
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

export function mapAppUserFromDb(row: Record<string, unknown>): AppUser {
  return {
    id: String(row.id),
    tenant_id: row.tenant_id != null ? String(row.tenant_id) : null,
    branch_id: row.branch_id != null ? String(row.branch_id) : null,
    username: String(row.username ?? ''),
    pin_or_password: String(row.pin_or_password ?? ''),
    full_name: String(row.full_name ?? ''),
    role: mapDbRoleToRoleType(row.role != null ? String(row.role) : null),
    is_active: Boolean(row.is_active ?? true),
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

export function mapOrderItemFromDb(row: Record<string, unknown>): WorkOrderItem {
  const isCatalog =
    row.source === 'catalog' ||
    row.deducted_from_stock === true ||
    Boolean(row.catalog_item_id);
  return {
    id: String(row.id),
    source: isCatalog ? 'catalog' : 'free',
    catalog_item_id:
      row.catalog_item_id != null ? String(row.catalog_item_id) : undefined,
    sku: row.sku != null ? String(row.sku) : undefined,
    description: String(row.description ?? ''),
    qty: Number(row.quantity ?? row.qty ?? 1),
    unit_price: Number(row.unit_price ?? row.price ?? 0),
  };
}

export function mapOrderPhotoFromDb(row: Record<string, unknown>): WorkOrderPhoto {
  const stage: PhotoStage =
    row.stage === 'reception' || row.stage === 'delivery'
      ? row.stage
      : 'diagnosis';
  return {
    id: String(row.id),
    url: String(row.public_url ?? row.url ?? ''),
    stage,
    caption: String(row.caption ?? ''),
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

export function mapOrderPaymentFromDb(row: Record<string, unknown>): WorkOrderPayment {
  const rawMethod = String(row.payment_method ?? row.method ?? 'transfer');
  const method: PaymentMethod =
    rawMethod === 'cash' || rawMethod === 'card' ? rawMethod : 'transfer';
  const rawDate =
    row.paid_at != null
      ? String(row.paid_at).slice(0, 10)
      : row.date != null
      ? String(row.date).slice(0, 10)
      : new Date().toISOString().slice(0, 10);
  const receipt =
    row.receipt_number != null
      ? String(row.receipt_number)
      : row.reference != null
      ? String(row.reference)
      : undefined;
  return {
    id: String(row.id),
    date: rawDate,
    amount: Number(row.amount) || 0,
    method,
    reference: receipt,
  };
}

export function mapOrderLoanFromDb(
  row: Record<string, unknown>,
  loanAssetLookup?: { code?: string; name?: string }
): WorkOrderLoan {
  return {
    id: String(row.id),
    loan_asset_id: String(row.loan_asset_id ?? ''),
    asset_code: String(row.asset_code ?? loanAssetLookup?.code ?? 'PREST'),
    asset_name: String(row.asset_name ?? loanAssetLookup?.name ?? 'Equipo de Préstamo'),
    loaned_at: String(row.loaned_at ?? new Date().toISOString()),
    returned_at:
      row.returned_at != null ? String(row.returned_at) : undefined,
    delivery_notes: String(row.condition_on_loan ?? row.delivery_notes ?? ''),
  };
}

export function mapPublicRpcOrderToTrackData(
  rawInput: unknown
): PublicOrderTrackData | null {
  const row = (Array.isArray(rawInput) ? rawInput[0] : rawInput) as Record<
    string,
    unknown
  > | null;
  if (!row || typeof row !== 'object') return null;

  const folio = row.folio != null ? String(row.folio) : '';
  const trackingCode = row.tracking_code != null ? String(row.tracking_code) : '';
  if (!folio && !trackingCode) return null;

  const rawItems = Array.isArray(row.items)
    ? (row.items as Array<Record<string, unknown>>)
    : [];
  const rawPhotos = Array.isArray(row.photos)
    ? (row.photos as Array<Record<string, unknown>>)
    : [];

  return {
    folio,
    tracking_code: trackingCode,
    status: (row.status as OrderStatus) ?? 'received',
    modality:
      row.modality === 'home_service' ? 'home_service' : 'workshop',
    company_name: String(row.company_name ?? 'FixiCloud'),
    company_logo: row.company_logo != null ? String(row.company_logo) : null,
    currency: String(row.currency ?? 'CLP'),
    branch_name: String(row.branch_name ?? 'Casa Matriz'),
    branch_address:
      row.branch_address != null ? String(row.branch_address) : undefined,
    branch_phone:
      row.branch_phone != null ? String(row.branch_phone) : undefined,
    client_name: String(row.client_name ?? 'Cliente'),
    asset_category: String(row.asset_category ?? 'Equipo'),
    brand: String(row.brand ?? ''),
    model: String(row.model ?? ''),
    serial_number: String(row.serial_number ?? ''),
    accessories_received: String(row.accessories_received ?? ''),
    reported_symptoms: String(row.reported_symptoms ?? ''),
    technical_diagnosis: String(row.technical_diagnosis ?? ''),
    work_performed: String(row.work_performed ?? ''),
    parts_and_observations: String(row.parts_and_observations ?? ''),
    items: rawItems.map((it) => ({
      description: String(it.description ?? ''),
      quantity: Number(it.quantity ?? it.qty ?? 1) || 1,
      total: Number(it.total ?? it.total_price ?? 0) || 0,
    })),
    total_amount: Number(row.total_amount ?? 0) || 0,
    paid_amount: Number(row.paid_amount ?? 0) || 0,
    balance_due: Number(row.balance_due ?? 0) || 0,
    photos: rawPhotos.map((ph, idx) => {
      const stage: PhotoStage =
        ph.stage === 'reception' || ph.stage === 'delivery'
          ? ph.stage
          : 'diagnosis';
      return {
        id: String(ph.id ?? `rpc-photo-${idx}`),
        url: String(ph.url ?? ph.public_url ?? ''),
        stage,
        caption: String(ph.caption ?? 'Evidencia del taller'),
      };
    }),
    received_at:
      row.received_at != null ? String(row.received_at) : undefined,
    promised_at:
      row.promised_at != null ? String(row.promised_at) : null,
    delivered_at:
      row.delivered_at != null ? String(row.delivered_at) : null,
  };
}

// Helper to detect legacy non-UUID cached state
export function hasLegacyNonUuidIds(state: {
  tenants?: Array<{ id?: string }>;
  branches?: Array<{ id?: string; tenant_id?: string }>;
  appUsers?: Array<{ id?: string; tenant_id?: string | null; branch_id?: string | null }>;
  clients?: Array<{ id?: string; tenant_id?: string }>;
  assets?: Array<{ id?: string; client_id?: string }>;
  catalogItems?: Array<{ id?: string; branch_id?: string }>;
  loanAssets?: Array<{ id?: string; branch_id?: string }>;
  workOrders?: Array<{ id?: string; client_id?: string; asset_id?: string }>;
  appointments?: Array<{ id?: string; client_id?: string }>;
}): boolean {
  const checks: Array<string | undefined | null> = [];
  state.tenants?.forEach((t) => checks.push(t.id));
  state.branches?.forEach((b) => checks.push(b.id, b.tenant_id));
  state.appUsers?.forEach((u) => checks.push(u.id, u.tenant_id, u.branch_id));
  state.clients?.forEach((c) => checks.push(c.id, c.tenant_id));
  state.assets?.forEach((a) => checks.push(a.id, a.client_id));
  state.catalogItems?.forEach((c) => checks.push(c.id, c.branch_id));
  state.loanAssets?.forEach((l) => checks.push(l.id, l.branch_id));
  state.workOrders?.forEach((w) => checks.push(w.id, w.client_id, w.asset_id));
  state.appointments?.forEach((a) => checks.push(a.id, a.client_id));
  return checks.some((id) => Boolean(id) && !isValidUUID(id));
}
