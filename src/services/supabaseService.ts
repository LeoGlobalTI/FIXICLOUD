import { createClient, type SupabaseClient } from '@supabase/supabase-js';
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
  PhotoStage,
  RoleType,
  SupabaseConfig,
  TeamProfile,
  Tenant,
  WorkOrder,
  WorkOrderItem,
  WorkOrderLoan,
  WorkOrderPayment,
  WorkOrderPhoto,
} from '../types/erp';
import { SEED_ERP_STATE } from '../data/seedData';
import { mapDbRoleToRoleType, mapRoleTypeToDbRole } from '../utils/erpLogic';

export const SUPABASE_TABLES = [
  'tenants',
  'branches',
  'profiles',
  'clients',
  'customer_assets',
  'catalog_items',
  'loan_assets',
  'work_orders',
  'work_order_items',
  'work_order_photos',
  'work_order_loans',
  'work_order_payments',
  'appointments',
] as const;

export type SupabaseTableName = (typeof SUPABASE_TABLES)[number];

export interface TableDiagnostic {
  table: SupabaseTableName;
  ok: boolean;
  count: number;
  error?: string;
}

export interface SupabaseTestResult {
  success: boolean;
  message: string;
  tables: TableDiagnostic[];
}

export interface HealthCheckItem {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

export interface ProductionHealthReport {
  checkedAt: string;
  overallOk: boolean;
  items: HealthCheckItem[];
}

let cachedClientKey = '';
let cachedClient: SupabaseClient | null = null;

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export function getSupabaseClient(url: string, anonKey: string): SupabaseClient | null {
  const cleanUrl = normalizeUrl(url);
  const cleanKey = anonKey.trim();
  if (!cleanUrl || !cleanKey) return null;
  const key = `${cleanUrl}::${cleanKey}`;
  if (cachedClient && cachedClientKey === key) {
    return cachedClient;
  }
  cachedClientKey = key;
  cachedClient = createClient(cleanUrl, cleanKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return cachedClient;
}

export function isSupabaseLive(cfg: SupabaseConfig): boolean {
  return Boolean(cfg.connected && !cfg.demoMode && cfg.url.trim() && cfg.anonKey.trim());
}

export async function testSupabaseConnection(
  url: string,
  anonKey: string
): Promise<SupabaseTestResult> {
  const baseUrl = normalizeUrl(url);
  if (!baseUrl || !anonKey.trim()) {
    return {
      success: false,
      message: 'Debes ingresar SUPABASE_URL y SUPABASE_ANON_KEY.',
      tables: [],
    };
  }

  try {
    const results: TableDiagnostic[] = [];
    for (const table of SUPABASE_TABLES) {
      try {
        const res = await fetch(`${baseUrl}/rest/v1/${table}?select=*&limit=1`, {
          method: 'GET',
          headers: {
            apikey: anonKey.trim(),
            Authorization: `Bearer ${anonKey.trim()}`,
            Prefer: 'count=exact',
          },
        });

        if (!res.ok) {
          const text = await res.text();
          results.push({
            table,
            ok: false,
            count: 0,
            error: `HTTP ${res.status}: ${text.slice(0, 120)}`,
          });
          continue;
        }

        const range = res.headers.get('content-range');
        const total = range && range.includes('/') ? Number(range.split('/')[1]) || 0 : 0;
        results.push({ table, ok: true, count: total });
      } catch (err) {
        results.push({
          table,
          ok: false,
          count: 0,
          error: err instanceof Error ? err.message : 'Error de red',
        });
      }
    }

    const coreTables = ['tenants', 'branches', 'work_orders', 'catalog_items'];
    const coreOk = results
      .filter((r) => coreTables.includes(r.table))
      .every((r) => r.ok);
    const allOk = results.every((r) => r.ok);
    const anyOk = results.some((r) => r.ok);

    if (allOk) {
      return {
        success: true,
        message: 'Conexión verificada contra todas las 13 tablas de FIXICLOUD en Supabase.',
        tables: results,
      };
    }

    if (coreOk) {
      return {
        success: true,
        message:
          'Conexión operativa en tablas principales (revisa las tablas adicionales pendientes en el esquema SQL).',
        tables: results,
      };
    }

    if (anyOk) {
      return {
        success: false,
        message: 'Conexión parcial: ejecuta el SQL Maestro de Fase 3 o revisa políticas RLS.',
        tables: results,
      };
    }

    return {
      success: false,
      message: results[0]?.error || 'No se pudo conectar con el proyecto Supabase.',
      tables: results,
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Error inesperado al conectar.',
      tables: [],
    };
  }
}

export async function runProductionHealthCheck(
  url: string,
  anonKey: string
): Promise<ProductionHealthReport> {
  const client = getSupabaseClient(url, anonKey);
  const checkedAt = new Date().toISOString();
  if (!client) {
    return {
      checkedAt,
      overallOk: false,
      items: [
        {
          id: 'creds',
          label: 'Credenciales Supabase',
          ok: false,
          detail: 'Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.',
        },
      ],
    };
  }

  const items: HealthCheckItem[] = [];
  const checkTables = ['tenants', 'branches', 'profiles', 'work_orders', 'catalog_items', 'appointments'] as const;

  for (const tbl of checkTables) {
    const { error, count } = await client
      .from(tbl)
      .select('id', { count: 'exact', head: true });
    items.push({
      id: `tbl-${tbl}`,
      label: `Tabla public.${tbl}`,
      ok: !error,
      detail: error ? error.message : `OK (${count ?? 0} registros)`,
    });
  }

  // Check RPC get_public_order_status
  const rpcRes = await client.rpc('get_public_order_status', { p_code: '__PING__' });
  const rpcExists =
    !rpcRes.error ||
    !rpcRes.error.message.toLowerCase().includes('could not find the function');
  items.push({
    id: 'rpc-track',
    label: 'RPC get_public_order_status(p_code)',
    ok: rpcExists,
    detail: rpcExists
      ? 'Función RPC activa y accesible para /track'
      : rpcRes.error?.message ?? 'Función no encontrada',
  });

  // Check Storage bucket order-photos
  const bucketRes = await client.storage.from('order-photos').list('', { limit: 1 });
  items.push({
    id: 'bucket-photos',
    label: 'Storage Bucket "order-photos"',
    ok: !bucketRes.error,
    detail: !bucketRes.error
      ? 'Bucket público accesible'
      : bucketRes.error.message,
  });

  return {
    checkedAt,
    overallOk: items.every((i) => i.ok),
    items,
  };
}

export async function pullSupabaseErpState(
  url: string,
  anonKey: string
): Promise<{ ok: boolean; data?: Partial<ErpState>; error?: string }> {
  const client = getSupabaseClient(url, anonKey);
  if (!client) return { ok: false, error: 'Credenciales Supabase inválidas.' };

  try {
    const [
      tenantsRes,
      branchesRes,
      profilesRes,
      clientsRes,
      assetsRes,
      catalogRes,
      loansRes,
      ordersRes,
      itemsRes,
      photosRes,
      orderLoansRes,
      paymentsRes,
      appointmentsRes,
    ] = await Promise.all([
      client.from('tenants').select('*'),
      client.from('branches').select('*'),
      client.from('profiles').select('*'),
      client.from('clients').select('*'),
      client.from('customer_assets').select('*'),
      client.from('catalog_items').select('*'),
      client.from('loan_assets').select('*'),
      client.from('work_orders').select('*').order('created_at', { ascending: false }),
      client.from('work_order_items').select('*'),
      client.from('work_order_photos').select('*'),
      client.from('work_order_loans').select('*'),
      client.from('work_order_payments').select('*'),
      client.from('appointments').select('*').order('date', { ascending: true }),
    ]);

    if (tenantsRes.error || ordersRes.error) {
      return {
        ok: false,
        error:
          tenantsRes.error?.message ??
          ordersRes.error?.message ??
          'Error leyendo tablas principales desde Supabase.',
      };
    }

    const rawItems = (itemsRes.data ?? []) as Array<WorkOrderItem & { work_order_id?: string }>;
    const rawPhotos = (photosRes.data ?? []) as Array<WorkOrderPhoto & { work_order_id?: string }>;
    const rawOrderLoans = (orderLoansRes.data ?? []) as Array<WorkOrderLoan & { work_order_id?: string }>;
    const rawPayments = (paymentsRes.data ?? []) as Array<WorkOrderPayment & { work_order_id?: string }>;

    const itemsByOrder = new Map<string, WorkOrderItem[]>();
    for (const row of rawItems) {
      if (!row.work_order_id) continue;
      const list = itemsByOrder.get(row.work_order_id) ?? [];
      list.push({
        id: row.id,
        source: row.source,
        catalog_item_id: row.catalog_item_id,
        sku: row.sku,
        description: row.description,
        qty: Number(row.qty) || 1,
        unit_price: Number(row.unit_price) || 0,
      });
      itemsByOrder.set(row.work_order_id, list);
    }

    const photosByOrder = new Map<string, WorkOrderPhoto[]>();
    for (const row of rawPhotos) {
      if (!row.work_order_id) continue;
      const list = photosByOrder.get(row.work_order_id) ?? [];
      list.push({
        id: row.id,
        url: row.url,
        stage: row.stage,
        caption: row.caption ?? '',
        created_at: row.created_at,
      });
      photosByOrder.set(row.work_order_id, list);
    }

    const paymentsByOrder = new Map<string, WorkOrderPayment[]>();
    for (const row of rawPayments) {
      if (!row.work_order_id) continue;
      const list = paymentsByOrder.get(row.work_order_id) ?? [];
      list.push({
        id: row.id,
        date: row.date,
        amount: Number(row.amount) || 0,
        method: row.method,
        reference: row.reference,
      });
      paymentsByOrder.set(row.work_order_id, list);
    }

    const loanByOrder = new Map<string, WorkOrderLoan>();
    for (const row of rawOrderLoans) {
      if (!row.work_order_id) continue;
      loanByOrder.set(row.work_order_id, {
        id: row.id,
        loan_asset_id: row.loan_asset_id,
        asset_code: row.asset_code,
        asset_name: row.asset_name,
        loaned_at: row.loaned_at,
        returned_at: row.returned_at,
        delivery_notes: row.delivery_notes ?? '',
      });
    }

    const workOrders: WorkOrder[] = (ordersRes.data ?? []).map((row) => {
      const r = row as WorkOrder;
      return {
        ...r,
        items: itemsByOrder.get(r.id) ?? r.items ?? [],
        photos: photosByOrder.get(r.id) ?? r.photos ?? [],
        payments: paymentsByOrder.get(r.id) ?? r.payments ?? [],
        loan: loanByOrder.get(r.id) ?? r.loan ?? undefined,
      };
    });

    const profiles: TeamProfile[] = (profilesRes.data ?? []).map((p) => {
      const row = p as TeamProfile & { role: string };
      return {
        ...row,
        role: mapDbRoleToRoleType(row.role),
      };
    });

    return {
      ok: true,
      data: {
        tenants: (tenantsRes.data ?? []) as Tenant[],
        branches: (branchesRes.data ?? []) as Branch[],
        profiles,
        clients: (clientsRes.data ?? []) as Client[],
        assets: (assetsRes.data ?? []) as CustomerAsset[],
        catalogItems: (catalogRes.data ?? []) as CatalogItem[],
        loanAssets: (loansRes.data ?? []) as LoanAsset[],
        workOrders,
        appointments: (appointmentsRes.data ?? []) as Appointment[],
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Error de red al sincronizar.',
    };
  }
}

export async function seedDemoDataToSupabase(
  url: string,
  anonKey: string
): Promise<{ ok: boolean; message: string }> {
  const client = getSupabaseClient(url, anonKey);
  if (!client) return { ok: false, message: 'Credenciales inválidas.' };

  try {
    const s = SEED_ERP_STATE;
    const ops = [
      client.from('tenants').upsert(s.tenants, { onConflict: 'id' }),
      client.from('branches').upsert(s.branches, { onConflict: 'id' }),
      client.from('clients').upsert(s.clients, { onConflict: 'id' }),
      client.from('customer_assets').upsert(s.assets, { onConflict: 'id' }),
      client.from('catalog_items').upsert(s.catalogItems, { onConflict: 'id' }),
      client.from('loan_assets').upsert(s.loanAssets, { onConflict: 'id' }),
    ];

    for (const res of await Promise.all(ops)) {
      if (res.error) return { ok: false, message: res.error.message };
    }

    // Seed work_orders + child tables
    const orderRows = s.workOrders.map((o) => ({ ...o }));
    const woRes = await client.from('work_orders').upsert(orderRows, { onConflict: 'id' });
    if (woRes.error) return { ok: false, message: woRes.error.message };

    const itemRows = s.workOrders.flatMap((o) =>
      o.items.map((it) => ({ ...it, work_order_id: o.id }))
    );
    const paymentRows = s.workOrders.flatMap((o) =>
      o.payments.map((p) => ({ ...p, work_order_id: o.id }))
    );
    const photoRows = s.workOrders.flatMap((o) =>
      o.photos.map((ph) => ({ ...ph, work_order_id: o.id }))
    );
    const loanRows = s.workOrders
      .filter((o) => Boolean(o.loan))
      .map((o) => ({ ...o.loan!, work_order_id: o.id }));

    await Promise.all([
      itemRows.length
        ? client.from('work_order_items').upsert(itemRows, { onConflict: 'id' })
        : Promise.resolve({ error: null }),
      paymentRows.length
        ? client.from('work_order_payments').upsert(paymentRows, { onConflict: 'id' })
        : Promise.resolve({ error: null }),
      photoRows.length
        ? client.from('work_order_photos').upsert(photoRows, { onConflict: 'id' })
        : Promise.resolve({ error: null }),
      loanRows.length
        ? client.from('work_order_loans').upsert(loanRows, { onConflict: 'id' })
        : Promise.resolve({ error: null }),
      s.appointments.length
        ? client.from('appointments').upsert(s.appointments, { onConflict: 'id' })
        : Promise.resolve({ error: null }),
    ]);

    return {
      ok: true,
      message: `Datos demo sembrados en Supabase (${s.tenants.length} empresas, ${s.branches.length} sucursales, ${s.workOrders.length} OTs y ${s.appointments.length} citas).`,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Error sembrando datos en Supabase.',
    };
  }
}

// ---------- LIVE CRUD OPERATIONS ----------

export async function syncTenantToSupabase(cfg: SupabaseConfig, tenant: Tenant): Promise<void> {
  if (!isSupabaseLive(cfg)) return;
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return;
  await client.from('tenants').upsert(tenant, { onConflict: 'id' });
}

export async function syncBranchToSupabase(cfg: SupabaseConfig, branch: Branch): Promise<void> {
  if (!isSupabaseLive(cfg)) return;
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return;
  await client.from('branches').upsert(branch, { onConflict: 'id' });
}

export async function deleteBranchFromSupabase(cfg: SupabaseConfig, branchId: string): Promise<void> {
  if (!isSupabaseLive(cfg)) return;
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return;
  await client.from('branches').delete().eq('id', branchId);
}

export async function syncProfileToSupabase(cfg: SupabaseConfig, profile: TeamProfile): Promise<void> {
  if (!isSupabaseLive(cfg)) return;
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return;
  await client
    .from('profiles')
    .upsert({ ...profile, role: mapRoleTypeToDbRole(profile.role) }, { onConflict: 'id' });
}

export async function syncClientToSupabase(cfg: SupabaseConfig, c: Client): Promise<void> {
  if (!isSupabaseLive(cfg)) return;
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return;
  await client.from('clients').upsert(c, { onConflict: 'id' });
}

export async function syncAssetToSupabase(cfg: SupabaseConfig, a: CustomerAsset): Promise<void> {
  if (!isSupabaseLive(cfg)) return;
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return;
  await client.from('customer_assets').upsert(a, { onConflict: 'id' });
}

export async function syncCatalogItemToSupabase(cfg: SupabaseConfig, item: CatalogItem): Promise<void> {
  if (!isSupabaseLive(cfg)) return;
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return;
  await client.from('catalog_items').upsert(item, { onConflict: 'id' });
}

export async function syncLoanAssetToSupabase(cfg: SupabaseConfig, loan: LoanAsset): Promise<void> {
  if (!isSupabaseLive(cfg)) return;
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return;
  await client.from('loan_assets').upsert(loan, { onConflict: 'id' });
}

export async function syncWorkOrderToSupabase(cfg: SupabaseConfig, order: WorkOrder): Promise<void> {
  if (!isSupabaseLive(cfg)) return;
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return;
  await client.from('work_orders').upsert(order, { onConflict: 'id' });

  // Sync child relational rows best-effort
  await Promise.all([
    order.items.length
      ? client
          .from('work_order_items')
          .upsert(order.items.map((it) => ({ ...it, work_order_id: order.id })), { onConflict: 'id' })
      : Promise.resolve(),
    order.payments.length
      ? client
          .from('work_order_payments')
          .upsert(order.payments.map((p) => ({ ...p, work_order_id: order.id })), { onConflict: 'id' })
      : Promise.resolve(),
    order.photos.length
      ? client
          .from('work_order_photos')
          .upsert(order.photos.map((ph) => ({ ...ph, work_order_id: order.id })), { onConflict: 'id' })
      : Promise.resolve(),
    order.loan
      ? client
          .from('work_order_loans')
          .upsert({ ...order.loan, work_order_id: order.id }, { onConflict: 'id' })
      : Promise.resolve(),
  ]);
}

export async function deleteOrderItemFromSupabase(cfg: SupabaseConfig, itemId: string): Promise<void> {
  if (!isSupabaseLive(cfg)) return;
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return;
  await client.from('work_order_items').delete().eq('id', itemId);
}

export async function deleteOrderPhotoFromSupabase(cfg: SupabaseConfig, photoId: string): Promise<void> {
  if (!isSupabaseLive(cfg)) return;
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return;
  await client.from('work_order_photos').delete().eq('id', photoId);
}

export async function syncAppointmentToSupabase(
  cfg: SupabaseConfig,
  apt: Appointment
): Promise<void> {
  if (!isSupabaseLive(cfg)) return;
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return;
  await client.from('appointments').upsert(apt, { onConflict: 'id' });
}

// ---------- SUPABASE STORAGE (order-photos) ----------

export async function uploadOrderPhotoToStorage(
  cfg: SupabaseConfig,
  params: {
    tenantId: string;
    workOrderId: string;
    blob: Blob;
    stage: PhotoStage;
    caption: string;
  }
): Promise<{ ok: boolean; publicUrl?: string; error?: string }> {
  if (!isSupabaseLive(cfg)) return { ok: false, error: 'Supabase no conectado' };
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return { ok: false, error: 'Cliente inválido' };

  const path = `${params.tenantId}/${params.workOrderId}/${Date.now()}.webp`;
  const uploadRes = await client.storage.from('order-photos').upload(path, params.blob, {
    contentType: 'image/webp',
    upsert: true,
  });

  if (uploadRes.error) {
    return { ok: false, error: uploadRes.error.message };
  }

  const { data } = client.storage.from('order-photos').getPublicUrl(path);
  return { ok: true, publicUrl: data.publicUrl };
}

// ---------- SUPABASE AUTH + ONBOARDING ----------

export async function signInWithSupabaseAuth(
  cfg: SupabaseConfig,
  email: string,
  password: string
): Promise<{ ok: boolean; user?: AuthSessionUser; error?: string }> {
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return { ok: false, error: 'Configura Supabase antes de iniciar sesión.' };

  const authRes = await client.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (authRes.error || !authRes.data.user) {
    return { ok: false, error: authRes.error?.message ?? 'Credenciales inválidas.' };
  }

  const uid = authRes.data.user.id;
  const profRes = await client.from('profiles').select('*').eq('id', uid).maybeSingle();
  const profile = profRes.data as (TeamProfile & { role: string }) | null;

  return {
    ok: true,
    user: {
      id: uid,
      email: authRes.data.user.email ?? email.trim(),
      full_name: profile?.full_name ?? authRes.data.user.email ?? 'Usuario',
      tenant_id: profile?.tenant_id ?? '',
      branch_id: profile?.branch_id ?? null,
      role: mapDbRoleToRoleType(profile?.role ?? 'company_admin'),
      mode: 'supabase',
    },
  };
}

export async function signUpAndRegisterTenantInSupabase(
  cfg: SupabaseConfig,
  input: {
    fullName: string;
    email: string;
    password: string;
    companyName: string;
    taxId: string;
    sector: IndustrySector;
    hqName: string;
  }
): Promise<{
  ok: boolean;
  user?: AuthSessionUser;
  tenant?: Tenant;
  branch?: Branch;
  profile?: TeamProfile;
  error?: string;
}> {
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return { ok: false, error: 'Supabase no conectado.' };

  const signUpRes = await client.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      data: { full_name: input.fullName.trim() },
    },
  });

  if (signUpRes.error || !signUpRes.data.user) {
    return { ok: false, error: signUpRes.error?.message ?? 'No se pudo registrar el usuario.' };
  }

  const uid = signUpRes.data.user.id;
  const now = new Date().toISOString();
  const tenantId = `tenant-${Date.now()}`;
  const branchId = `branch-${Date.now()}`;

  // Try RPC register_new_tenant first
  const rpcRes = await client.rpc('register_new_tenant', {
    p_user_id: uid,
    p_full_name: input.fullName.trim(),
    p_email: input.email.trim(),
    p_company_name: input.companyName.trim(),
    p_tax_id: input.taxId.trim(),
    p_sector: input.sector,
    p_hq_name: input.hqName.trim(),
  });

  if (!rpcRes.error && rpcRes.data) {
    const data = rpcRes.data as { tenant_id?: string; branch_id?: string };
    const finalTenantId = data.tenant_id ?? tenantId;
    const finalBranchId = data.branch_id ?? branchId;
    const tenant: Tenant = {
      id: finalTenantId,
      name: input.companyName.trim(),
      tax_id: input.taxId.trim(),
      sector: input.sector,
      currency: 'CLP',
      iva_rate: 19,
      folio_prefix: input.companyName.slice(0, 2).toUpperCase() || 'OT',
      whatsapp_enabled: true,
      whatsapp_templates: SEED_ERP_STATE.tenants[0].whatsapp_templates,
      phone: '',
      email: input.email.trim(),
      warranty_days: 90,
      created_at: now,
    };
    const branch: Branch = {
      id: finalBranchId,
      tenant_id: finalTenantId,
      name: input.hqName.trim(),
      code: 'HQ-01',
      is_hq: true,
      address: '',
      city: '',
      phone: '',
      business_hours: 'Lun-Vie 09:00 - 18:30',
    };
    const profile: TeamProfile = {
      id: uid,
      tenant_id: finalTenantId,
      branch_id: null,
      full_name: input.fullName.trim(),
      email: input.email.trim(),
      role: 'admin',
      active: true,
      created_at: now,
    };
    return {
      ok: true,
      tenant,
      branch,
      profile,
      user: {
        id: uid,
        email: input.email.trim(),
        full_name: input.fullName.trim(),
        tenant_id: finalTenantId,
        branch_id: null,
        role: 'admin',
        mode: 'supabase',
      },
    };
  }

  // Fallback sequential inserts if RPC not yet installed
  const tenant: Tenant = {
    id: tenantId,
    name: input.companyName.trim(),
    tax_id: input.taxId.trim() || '76.000.000-0',
    sector: input.sector,
    currency: 'CLP',
    iva_rate: 19,
    folio_prefix: input.companyName.slice(0, 2).toUpperCase() || 'OT',
    whatsapp_enabled: true,
    whatsapp_templates: SEED_ERP_STATE.tenants[0].whatsapp_templates,
    phone: '',
    email: input.email.trim(),
    warranty_days: 90,
    created_at: now,
  };
  const branch: Branch = {
    id: branchId,
    tenant_id: tenantId,
    name: input.hqName.trim() || 'Casa Matriz',
    code: 'HQ-01',
    is_hq: true,
    address: 'Dirección principal por definir',
    city: 'Santiago',
    phone: '',
    business_hours: 'Lun-Vie 09:00 - 18:30',
  };
  const profile: TeamProfile = {
    id: uid,
    tenant_id: tenantId,
    branch_id: null,
    full_name: input.fullName.trim(),
    email: input.email.trim(),
    role: 'admin',
    active: true,
    created_at: now,
  };

  await client.from('tenants').insert(tenant);
  await client.from('branches').insert(branch);
  await client.from('profiles').insert({
    ...profile,
    role: 'company_admin',
  });

  return {
    ok: true,
    tenant,
    branch,
    profile,
    user: {
      id: uid,
      email: input.email.trim(),
      full_name: input.fullName.trim(),
      tenant_id: tenantId,
      branch_id: null,
      role: 'admin',
      mode: 'supabase',
    },
  };
}

export async function signOutFromSupabase(cfg: SupabaseConfig): Promise<void> {
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return;
  await client.auth.signOut();
}

// ---------- RPC get_public_order_status ----------

export interface PublicOrderRpcPayload {
  order: WorkOrder;
  tenant: Tenant;
  branch?: Branch;
  client?: Client;
  asset?: CustomerAsset;
}

export async function fetchPublicOrderStatusViaRpc(
  cfg: SupabaseConfig,
  codeOrFolio: string
): Promise<{ ok: boolean; data?: PublicOrderRpcPayload; error?: string }> {
  if (!isSupabaseLive(cfg)) return { ok: false, error: 'Offline' };
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return { ok: false, error: 'Sin cliente Supabase' };

  try {
    const res = await client.rpc('get_public_order_status', {
      p_code: codeOrFolio.trim(),
    });
    if (res.error || !res.data) {
      return { ok: false, error: res.error?.message ?? 'No encontrado' };
    }

    const raw = (Array.isArray(res.data) ? res.data[0] : res.data) as {
      order?: WorkOrder;
      tenant?: Tenant;
      branch?: Branch;
      client?: Client;
      asset?: CustomerAsset;
      items?: WorkOrderItem[];
      payments?: WorkOrderPayment[];
      photos?: WorkOrderPhoto[];
    } | null;

    if (!raw?.order || !raw?.tenant) {
      return { ok: false, error: 'Orden no encontrada en RPC' };
    }

    const order: WorkOrder = {
      ...raw.order,
      items: raw.items ?? raw.order.items ?? [],
      payments: raw.payments ?? raw.order.payments ?? [],
      photos: raw.photos ?? raw.order.photos ?? [],
    };

    return {
      ok: true,
      data: {
        order,
        tenant: raw.tenant,
        branch: raw.branch,
        client: raw.client,
        asset: raw.asset,
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error RPC' };
  }
}

export async function upsertMigratedDataToSupabase(
  url: string,
  anonKey: string,
  payload: {
    clients: unknown[];
    assets: unknown[];
    workOrders: unknown[];
  }
): Promise<{ ok: boolean; error?: string }> {
  const baseUrl = normalizeUrl(url);
  const headers = {
    apikey: anonKey.trim(),
    Authorization: `Bearer ${anonKey.trim()}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates',
  };

  try {
    if (payload.clients.length > 0) {
      const res = await fetch(`${baseUrl}/rest/v1/clients`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload.clients),
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status} al insertar clients` };
    }
    if (payload.assets.length > 0) {
      const res = await fetch(`${baseUrl}/rest/v1/customer_assets`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload.assets),
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status} al insertar customer_assets` };
    }
    if (payload.workOrders.length > 0) {
      const res = await fetch(`${baseUrl}/rest/v1/work_orders`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload.workOrders),
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status} al insertar work_orders` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error de red' };
  }
}

export const SUPABASE_SCHEMA_SQL = `-- FIXICLOUD Phase 3 Production Schema (Supabase / PostgreSQL + Storage + RPC)
create table if not exists tenants (
  id text primary key,
  name text not null,
  tax_id text,
  sector text not null default 'computing',
  currency text not null default 'CLP',
  iva_rate numeric not null default 19,
  folio_prefix text not null default 'OT',
  whatsapp_enabled boolean not null default true,
  whatsapp_templates jsonb not null default '{}'::jsonb,
  phone text,
  email text,
  warranty_days integer default 90,
  legal_terms text,
  created_at timestamptz default now()
);

create table if not exists branches (
  id text primary key,
  tenant_id text references tenants(id) on delete cascade,
  name text not null,
  code text not null,
  is_hq boolean not null default false,
  address text,
  city text,
  phone text,
  business_hours text
);

create table if not exists profiles (
  id text primary key,
  tenant_id text references tenants(id) on delete cascade,
  branch_id text references branches(id) on delete set null,
  full_name text not null,
  email text not null,
  role text not null default 'company_admin',
  active boolean not null default true,
  created_at timestamptz default now()
);

create table if not exists clients (
  id text primary key,
  tenant_id text references tenants(id) on delete cascade,
  name text not null,
  rut text,
  phone text,
  email text,
  address text,
  city text,
  notes text
);

create table if not exists customer_assets (
  id text primary key,
  tenant_id text references tenants(id) on delete cascade,
  client_id text references clients(id) on delete cascade,
  category text,
  brand text,
  model text,
  serial_imei text,
  password_pattern text,
  custom_attributes jsonb default '{}'::jsonb
);

create table if not exists catalog_items (
  id text primary key,
  tenant_id text references tenants(id) on delete cascade,
  branch_id text references branches(id) on delete cascade,
  sku text,
  name text not null,
  category text not null default 'part',
  cost_price numeric not null default 0,
  sale_price numeric not null default 0,
  stock_qty integer not null default 0,
  min_stock integer not null default 1
);

create table if not exists loan_assets (
  id text primary key,
  tenant_id text references tenants(id) on delete cascade,
  branch_id text references branches(id) on delete cascade,
  code text not null,
  name text not null,
  brand_model text,
  serial_number text,
  status text not null default 'available',
  condition_notes text
);

create table if not exists work_orders (
  id text primary key,
  tenant_id text references tenants(id) on delete cascade,
  branch_id text references branches(id) on delete cascade,
  folio text not null,
  tracking_code text not null,
  client_id text references clients(id),
  asset_id text references customer_assets(id),
  status text not null default 'received',
  modality text not null default 'workshop',
  visit_address text,
  visit_scheduled_at text,
  accessories_received text,
  entry_condition text,
  reported_symptoms text,
  technical_diagnosis text,
  work_performed text,
  parts_and_observations text,
  assigned_technician text,
  apply_iva boolean not null default true,
  discount_amount numeric not null default 0,
  items jsonb default '[]'::jsonb,
  payments jsonb default '[]'::jsonb,
  photos jsonb default '[]'::jsonb,
  loan jsonb,
  warranty_days integer default 90,
  legacy_mdb_id text unique,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists work_order_items (
  id text primary key,
  work_order_id text references work_orders(id) on delete cascade,
  source text not null default 'free',
  catalog_item_id text,
  sku text,
  description text not null,
  qty integer not null default 1,
  unit_price numeric not null default 0
);

create table if not exists work_order_photos (
  id text primary key,
  work_order_id text references work_orders(id) on delete cascade,
  url text not null,
  stage text not null default 'diagnosis',
  caption text,
  created_at timestamptz default now()
);

create table if not exists work_order_loans (
  id text primary key,
  work_order_id text references work_orders(id) on delete cascade,
  loan_asset_id text,
  asset_code text,
  asset_name text,
  loaned_at timestamptz,
  returned_at timestamptz,
  delivery_notes text
);

create table if not exists work_order_payments (
  id text primary key,
  work_order_id text references work_orders(id) on delete cascade,
  date text not null,
  amount numeric not null default 0,
  method text not null default 'transfer',
  reference text
);

create table if not exists appointments (
  id text primary key,
  tenant_id text references tenants(id) on delete cascade,
  branch_id text references branches(id) on delete cascade,
  subject text not null,
  client_id text references clients(id),
  modality text not null default 'workshop',
  visit_address text,
  technician text,
  date text not null,
  start_time text not null,
  end_time text not null,
  status text not null default 'scheduled',
  notes text,
  work_order_id text references work_orders(id),
  created_at timestamptz default now()
);

-- Storage Bucket público para fotos WebP
insert into storage.buckets (id, name, public)
values ('order-photos', 'order-photos', true)
on conflict (id) do nothing;

-- RPC Onboarding de nueva empresa
create or replace function register_new_tenant(
  p_user_id text,
  p_full_name text,
  p_email text,
  p_company_name text,
  p_tax_id text,
  p_sector text,
  p_hq_name text
) returns jsonb language plpgsql security definer as $$
declare
  v_tenant_id text := 'tenant-' || extract(epoch from now())::bigint::text;
  v_branch_id text := 'branch-' || extract(epoch from now())::bigint::text;
begin
  insert into tenants (id, name, tax_id, sector, folio_prefix, email)
  values (v_tenant_id, p_company_name, p_tax_id, p_sector, upper(left(p_company_name, 2)), p_email);

  insert into branches (id, tenant_id, name, code, is_hq, business_hours)
  values (v_branch_id, v_tenant_id, p_hq_name, 'HQ-01', true, 'Lun-Vie 09:00 - 18:30');

  insert into profiles (id, tenant_id, branch_id, full_name, email, role, active)
  values (p_user_id, v_tenant_id, null, p_full_name, p_email, 'company_admin', true);

  return jsonb_build_object('tenant_id', v_tenant_id, 'branch_id', v_branch_id);
end;
$$;

-- RPC Portal Público (/track y ?track=CODIGO)
create or replace function get_public_order_status(p_code text)
returns jsonb language plpgsql security definer as $$
declare
  v_order work_orders%rowtype;
  v_tenant tenants%rowtype;
  v_branch branches%rowtype;
  v_client clients%rowtype;
  v_asset customer_assets%rowtype;
begin
  select * into v_order
  from work_orders
  where upper(tracking_code) = upper(trim(p_code))
     or upper(folio) = upper(trim(p_code))
  limit 1;

  if not found then
    return null;
  end if;

  select * into v_tenant from tenants where id = v_order.tenant_id;
  select * into v_branch from branches where id = v_order.branch_id;
  select * into v_client from clients where id = v_order.client_id;
  select * into v_asset from customer_assets where id = v_order.asset_id;

  return jsonb_build_object(
    'order', to_jsonb(v_order),
    'tenant', to_jsonb(v_tenant),
    'branch', to_jsonb(v_branch),
    'client', to_jsonb(v_client),
    'asset', to_jsonb(v_asset),
    'items', coalesce((select jsonb_agg(i) from work_order_items i where i.work_order_id = v_order.id), v_order.items),
    'payments', coalesce((select jsonb_agg(p) from work_order_payments p where p.work_order_id = v_order.id), v_order.payments),
    'photos', coalesce((select jsonb_agg(ph) from work_order_photos ph where ph.work_order_id = v_order.id), v_order.photos)
  );
end;
$$;`;
