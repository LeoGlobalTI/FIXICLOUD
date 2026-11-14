import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  AppUser,
  Appointment,
  AuthSessionUser,
  Branch,
  CatalogItem,
  Client,
  CustomerAsset,
  ErpState,
  LoanAsset,
  PhotoStage,
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
import { mapDbRoleToRoleType } from '../utils/erpLogic';
import {
  mapAppUserFromDb,
  mapAppUserToDb,
  mapAppointmentFromDb,
  mapAppointmentToDb,
  mapAssetFromDb,
  mapAssetToDb,
  mapBranchFromDb,
  mapBranchToDb,
  mapBranchesToDbSafe,
  mapCatalogItemFromDb,
  mapCatalogItemToDb,
  mapClientFromDb,
  mapClientToDb,
  mapLoanAssetFromDb,
  mapLoanAssetToDb,
  mapOrderItemFromDb,
  mapOrderLoanFromDb,
  mapOrderPaymentFromDb,
  mapOrderPhotoFromDb,
  mapProfileFromDb,
  mapProfileToDb,
  mapTenantFromDb,
  mapTenantToDb,
  mapWorkOrderFromDb,
  mapWorkOrderItemToDb,
  mapWorkOrderLoanToDb,
  mapWorkOrderPaymentToDb,
  mapWorkOrderPhotoToDb,
  mapWorkOrderToDb,
} from '../utils/supabaseMappers';
import { ensureUUID } from '../utils/uuid';

export const SUPABASE_TABLES = [
  'tenants',
  'branches',
  'app_users',
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

function formatPgError(
  table: string,
  err: { message?: string; details?: string | null; hint?: string | null; code?: string | null }
): string {
  const parts = [
    `Error en tabla public.${table}: ${err.message ?? 'Bad Request'}`,
    err.code ? `[${err.code}]` : '',
    err.details ? `Detalle: ${err.details}` : '',
    err.hint ? `Sugerencia: ${err.hint}` : '',
  ].filter(Boolean);
  return parts.join(' · ');
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
      persistSession: false,
      autoRefreshToken: false,
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
            error: `HTTP ${res.status}: ${text.slice(0, 140)}`,
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
  const checkTables = ['tenants', 'branches', 'app_users', 'work_orders', 'catalog_items', 'appointments'] as const;

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
      appUsersRes,
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
      client.from('app_users').select('*'),
      client.from('profiles').select('*'),
      client.from('clients').select('*'),
      client.from('customer_assets').select('*'),
      client.from('catalog_items').select('*'),
      client.from('loan_assets').select('*'),
      client.from('work_orders').select('*').order('received_at', { ascending: false }),
      client.from('work_order_items').select('*'),
      client.from('work_order_photos').select('*'),
      client.from('work_order_loans').select('*'),
      client.from('work_order_payments').select('*'),
      client.from('appointments').select('*').order('scheduled_start', { ascending: true }),
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

    const rawItems = (itemsRes.data ?? []) as Array<Record<string, unknown>>;
    const rawPhotos = (photosRes.data ?? []) as Array<Record<string, unknown>>;
    const rawOrderLoans = (orderLoansRes.data ?? []) as Array<Record<string, unknown>>;
    const rawPayments = (paymentsRes.data ?? []) as Array<Record<string, unknown>>;

    const itemsByOrder = new Map<string, WorkOrderItem[]>();
    for (const row of rawItems) {
      const woId = row.work_order_id ? String(row.work_order_id) : '';
      if (!woId) continue;
      const list = itemsByOrder.get(woId) ?? [];
      list.push(mapOrderItemFromDb(row));
      itemsByOrder.set(woId, list);
    }

    const photosByOrder = new Map<string, WorkOrderPhoto[]>();
    for (const row of rawPhotos) {
      const woId = row.work_order_id ? String(row.work_order_id) : '';
      if (!woId) continue;
      const list = photosByOrder.get(woId) ?? [];
      list.push(mapOrderPhotoFromDb(row));
      photosByOrder.set(woId, list);
    }

    const paymentsByOrder = new Map<string, WorkOrderPayment[]>();
    for (const row of rawPayments) {
      const woId = row.work_order_id ? String(row.work_order_id) : '';
      if (!woId) continue;
      const list = paymentsByOrder.get(woId) ?? [];
      list.push(mapOrderPaymentFromDb(row));
      paymentsByOrder.set(woId, list);
    }

    const loanAssets: LoanAsset[] = (loansRes.data ?? []).map((l) =>
      mapLoanAssetFromDb(l as Record<string, unknown>)
    );
    const loanAssetLookupMap = new Map(
      loanAssets.map((la) => [la.id, { code: la.code, name: la.name }])
    );

    const loanByOrder = new Map<string, WorkOrderLoan>();
    for (const row of rawOrderLoans) {
      const woId = row.work_order_id ? String(row.work_order_id) : '';
      if (!woId) continue;
      const laId = row.loan_asset_id ? String(row.loan_asset_id) : '';
      loanByOrder.set(woId, mapOrderLoanFromDb(row, loanAssetLookupMap.get(laId)));
    }

    const tenants: Tenant[] = (tenantsRes.data ?? []).map((t) =>
      mapTenantFromDb(t as Record<string, unknown>)
    );
    const branches: Branch[] = (branchesRes.data ?? []).map((b) =>
      mapBranchFromDb(b as Record<string, unknown>)
    );
    const appUsers: AppUser[] = (appUsersRes.data ?? []).map((u) =>
      mapAppUserFromDb(u as Record<string, unknown>)
    );
    const profiles: TeamProfile[] = (profilesRes.data ?? []).map((p) =>
      mapProfileFromDb(p as Record<string, unknown>)
    );
    const clients: Client[] = (clientsRes.data ?? []).map((c) =>
      mapClientFromDb(c as Record<string, unknown>)
    );
    const assets: CustomerAsset[] = (assetsRes.data ?? []).map((a) =>
      mapAssetFromDb(a as Record<string, unknown>)
    );
    const catalogItems: CatalogItem[] = (catalogRes.data ?? []).map((c) =>
      mapCatalogItemFromDb(c as Record<string, unknown>)
    );
    const workOrders: WorkOrder[] = (ordersRes.data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      const id = String(r.id);
      return mapWorkOrderFromDb(r, {
        items: itemsByOrder.get(id),
        photos: photosByOrder.get(id),
        payments: paymentsByOrder.get(id),
        loan: loanByOrder.get(id),
      });
    });
    const appointments: Appointment[] = (appointmentsRes.data ?? []).map((a) =>
      mapAppointmentFromDb(a as Record<string, unknown>)
    );

    return {
      ok: true,
      data: {
        tenants,
        branches,
        appUsers,
        profiles,
        clients,
        assets,
        catalogItems,
        loanAssets,
        workOrders,
        appointments,
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
): Promise<{ ok: boolean; failedTable?: string; message: string }> {
  const client = getSupabaseClient(url, anonKey);
  if (!client) return { ok: false, message: 'Credenciales inválidas.' };

  try {
    const s = SEED_ERP_STATE;
    const tenantTaxMap = new Map(s.tenants.map((t) => [ensureUUID(t.id), t.iva_rate]));

    // Step 1: public.tenants
    const tenantRows = s.tenants.map((t) => {
      const tenantOrders = s.workOrders.filter((o) => o.tenant_id === t.id);
      const maxNum = tenantOrders.reduce((acc, o) => {
        const m = o.folio.match(/(\d+)$/);
        return m ? Math.max(acc, parseInt(m[1], 10)) : acc;
      }, 100);
      return mapTenantToDb(t, maxNum);
    });
    const tenantsRes = await client
      .from('tenants')
      .upsert(tenantRows, { onConflict: 'id' });
    if (tenantsRes.error) {
      return {
        ok: false,
        failedTable: 'tenants',
        message: formatPgError('tenants', tenantsRes.error),
      };
    }

    // Step 2: public.branches (strictly max 1 is_headquarters = true per tenant)
    const branchRows = mapBranchesToDbSafe(s.branches);
    const branchesRes = await client
      .from('branches')
      .upsert(branchRows, { onConflict: 'id' });
    if (branchesRes.error) {
      return {
        ok: false,
        failedTable: 'branches',
        message: formatPgError('branches', branchesRes.error),
      };
    }

    // Step 2b: public.app_users (custom login accounts without Supabase Auth)
    if (s.appUsers.length > 0) {
      const appUserRows = s.appUsers.map((u) => mapAppUserToDb(u));
      const appUsersRes = await client
        .from('app_users')
        .upsert(appUserRows, { onConflict: 'id' });
      if (appUsersRes.error) {
        return {
          ok: false,
          failedTable: 'app_users',
          message: formatPgError('app_users', appUsersRes.error),
        };
      }
    }

    // Step 3: public.clients, public.catalog_items, public.loan_assets
    const hqByTenant = new Map<string, string>();
    for (const b of s.branches) {
      if (b.is_hq && !hqByTenant.has(b.tenant_id)) {
        hqByTenant.set(b.tenant_id, b.id);
      }
    }
    const clientRows = s.clients.map((c) =>
      mapClientToDb(c, { branchId: hqByTenant.get(c.tenant_id) ?? null })
    );
    const clientsRes = await client
      .from('clients')
      .upsert(clientRows, { onConflict: 'id' });
    if (clientsRes.error) {
      return {
        ok: false,
        failedTable: 'clients',
        message: formatPgError('clients', clientsRes.error),
      };
    }

    const catalogRows = s.catalogItems.map((item) => mapCatalogItemToDb(item));
    const catalogRes = await client
      .from('catalog_items')
      .upsert(catalogRows, { onConflict: 'id' });
    if (catalogRes.error) {
      return {
        ok: false,
        failedTable: 'catalog_items',
        message: formatPgError('catalog_items', catalogRes.error),
      };
    }

    const loanAssetRows = s.loanAssets.map((loan) => mapLoanAssetToDb(loan));
    const loanAssetsRes = await client
      .from('loan_assets')
      .upsert(loanAssetRows, { onConflict: 'id' });
    if (loanAssetsRes.error) {
      return {
        ok: false,
        failedTable: 'loan_assets',
        message: formatPgError('loan_assets', loanAssetsRes.error),
      };
    }

    // Step 4: public.customer_assets (depends on clients)
    const assetRows = s.assets.map((asset) => mapAssetToDb(asset));
    const assetsRes = await client
      .from('customer_assets')
      .upsert(assetRows, { onConflict: 'id' });
    if (assetsRes.error) {
      return {
        ok: false,
        failedTable: 'customer_assets',
        message: formatPgError('customer_assets', assetsRes.error),
      };
    }

    // Step 5: public.work_orders (depends on clients & customer_assets; NO balance_due)
    const orderRows = s.workOrders.map((o) =>
      mapWorkOrderToDb(o, tenantTaxMap.get(ensureUUID(o.tenant_id)) ?? 19)
    );
    const woRes = await client
      .from('work_orders')
      .upsert(orderRows, { onConflict: 'id' });
    if (woRes.error) {
      return {
        ok: false,
        failedTable: 'work_orders',
        message: formatPgError('work_orders', woRes.error),
      };
    }

    // Step 6: Child tables & appointments (depends on work_orders)
    const catalogTypeMap = new Map(
      s.catalogItems.map((cat) => [
        ensureUUID(cat.id),
        cat.category === 'service' ? ('service' as const) : ('part' as const),
      ])
    );

    const itemRows = s.workOrders.flatMap((o) =>
      o.items.map((it) =>
        mapWorkOrderItemToDb(it, {
          tenantId: o.tenant_id,
          workOrderId: o.id,
          catalogItemType: it.catalog_item_id
            ? catalogTypeMap.get(ensureUUID(it.catalog_item_id))
            : undefined,
        })
      )
    );
    if (itemRows.length > 0) {
      const itemsRes = await client
        .from('work_order_items')
        .upsert(itemRows, { onConflict: 'id' });
      if (itemsRes.error) {
        return {
          ok: false,
          failedTable: 'work_order_items',
          message: formatPgError('work_order_items', itemsRes.error),
        };
      }
    }

    const paymentRows = s.workOrders.flatMap((o) =>
      o.payments.map((p) =>
        mapWorkOrderPaymentToDb(p, {
          tenantId: o.tenant_id,
          branchId: o.branch_id,
          workOrderId: o.id,
        })
      )
    );
    if (paymentRows.length > 0) {
      const payRes = await client
        .from('work_order_payments')
        .upsert(paymentRows, { onConflict: 'id' });
      if (payRes.error) {
        return {
          ok: false,
          failedTable: 'work_order_payments',
          message: formatPgError('work_order_payments', payRes.error),
        };
      }
    }

    const photoRows = s.workOrders.flatMap((o) =>
      o.photos.map((ph) =>
        mapWorkOrderPhotoToDb(ph, {
          tenantId: o.tenant_id,
          workOrderId: o.id,
        })
      )
    );
    if (photoRows.length > 0) {
      const phRes = await client
        .from('work_order_photos')
        .upsert(photoRows, { onConflict: 'id' });
      if (phRes.error) {
        return {
          ok: false,
          failedTable: 'work_order_photos',
          message: formatPgError('work_order_photos', phRes.error),
        };
      }
    }

    const loanRows = s.workOrders
      .filter((o) => Boolean(o.loan))
      .map((o) =>
        mapWorkOrderLoanToDb(o.loan!, {
          tenantId: o.tenant_id,
          workOrderId: o.id,
        })
      );
    if (loanRows.length > 0) {
      const wlRes = await client
        .from('work_order_loans')
        .upsert(loanRows, { onConflict: 'id' });
      if (wlRes.error) {
        return {
          ok: false,
          failedTable: 'work_order_loans',
          message: formatPgError('work_order_loans', wlRes.error),
        };
      }
    }

    const appointmentRows = s.appointments.map((apt) => mapAppointmentToDb(apt));
    if (appointmentRows.length > 0) {
      const aptRes = await client
        .from('appointments')
        .upsert(appointmentRows, { onConflict: 'id' });
      if (aptRes.error) {
        return {
          ok: false,
          failedTable: 'appointments',
          message: formatPgError('appointments', aptRes.error),
        };
      }
    }

    return {
      ok: true,
      message: `Datos demo sembrados en Supabase en orden estricto FK (${s.tenants.length} empresas, ${s.branches.length} sucursales, ${s.clients.length} clientes, ${s.assets.length} equipos, ${s.workOrders.length} OTs y ${s.appointments.length} citas).`,
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
  await client.from('tenants').upsert(mapTenantToDb(tenant), { onConflict: 'id' });
}

export async function syncBranchToSupabase(cfg: SupabaseConfig, branch: Branch): Promise<void> {
  if (!isSupabaseLive(cfg)) return;
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return;
  await client.from('branches').upsert(mapBranchToDb(branch), { onConflict: 'id' });
}

export async function deleteBranchFromSupabase(cfg: SupabaseConfig, branchId: string): Promise<void> {
  if (!isSupabaseLive(cfg)) return;
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return;
  await client.from('branches').delete().eq('id', ensureUUID(branchId));
}

export async function syncProfileToSupabase(cfg: SupabaseConfig, profile: TeamProfile): Promise<void> {
  if (!isSupabaseLive(cfg)) return;
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return;
  await client.from('profiles').upsert(mapProfileToDb(profile), { onConflict: 'id' });
}

export async function syncAppUserToSupabase(
  cfg: SupabaseConfig,
  user: AppUser
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseLive(cfg)) return { ok: true };
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return { ok: false, error: 'Cliente Supabase no inicializado.' };
  const res = await client
    .from('app_users')
    .upsert(mapAppUserToDb(user), { onConflict: 'id' });
  if (res.error) {
    return { ok: false, error: formatPgError('app_users', res.error) };
  }
  return { ok: true };
}

export async function syncClientToSupabase(cfg: SupabaseConfig, c: Client): Promise<void> {
  if (!isSupabaseLive(cfg)) return;
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return;
  await client.from('clients').upsert(mapClientToDb(c), { onConflict: 'id' });
}

export async function syncAssetToSupabase(cfg: SupabaseConfig, a: CustomerAsset): Promise<void> {
  if (!isSupabaseLive(cfg)) return;
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return;
  await client.from('customer_assets').upsert(mapAssetToDb(a), { onConflict: 'id' });
}

export async function syncCatalogItemToSupabase(cfg: SupabaseConfig, item: CatalogItem): Promise<void> {
  if (!isSupabaseLive(cfg)) return;
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return;
  await client.from('catalog_items').upsert(mapCatalogItemToDb(item), { onConflict: 'id' });
}

export async function syncLoanAssetToSupabase(cfg: SupabaseConfig, loan: LoanAsset): Promise<void> {
  if (!isSupabaseLive(cfg)) return;
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return;
  await client.from('loan_assets').upsert(mapLoanAssetToDb(loan), { onConflict: 'id' });
}

export async function syncWorkOrderToSupabase(
  cfg: SupabaseConfig,
  order: WorkOrder,
  taxRate = 19
): Promise<void> {
  if (!isSupabaseLive(cfg)) return;
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return;

  const woRes = await client
    .from('work_orders')
    .upsert(mapWorkOrderToDb(order, taxRate), { onConflict: 'id' });
  if (woRes.error) return;

  // Sync child relational rows sequentially/best-effort
  if (order.items.length > 0) {
    await client.from('work_order_items').upsert(
      order.items.map((it) =>
        mapWorkOrderItemToDb(it, {
          tenantId: order.tenant_id,
          workOrderId: order.id,
        })
      ),
      { onConflict: 'id' }
    );
  }
  if (order.payments.length > 0) {
    await client.from('work_order_payments').upsert(
      order.payments.map((p) =>
        mapWorkOrderPaymentToDb(p, {
          tenantId: order.tenant_id,
          branchId: order.branch_id,
          workOrderId: order.id,
        })
      ),
      { onConflict: 'id' }
    );
  }
  if (order.photos.length > 0) {
    await client.from('work_order_photos').upsert(
      order.photos.map((ph) =>
        mapWorkOrderPhotoToDb(ph, {
          tenantId: order.tenant_id,
          workOrderId: order.id,
        })
      ),
      { onConflict: 'id' }
    );
  }
  if (order.loan) {
    await client.from('work_order_loans').upsert(
      mapWorkOrderLoanToDb(order.loan, {
        tenantId: order.tenant_id,
        workOrderId: order.id,
      }),
      { onConflict: 'id' }
    );
  }
}

export async function deleteOrderItemFromSupabase(cfg: SupabaseConfig, itemId: string): Promise<void> {
  if (!isSupabaseLive(cfg)) return;
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return;
  await client.from('work_order_items').delete().eq('id', ensureUUID(itemId));
}

export async function deleteOrderPhotoFromSupabase(cfg: SupabaseConfig, photoId: string): Promise<void> {
  if (!isSupabaseLive(cfg)) return;
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return;
  await client.from('work_order_photos').delete().eq('id', ensureUUID(photoId));
}

export async function syncAppointmentToSupabase(
  cfg: SupabaseConfig,
  apt: Appointment
): Promise<void> {
  if (!isSupabaseLive(cfg)) return;
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return;
  await client
    .from('appointments')
    .upsert(mapAppointmentToDb(apt), { onConflict: 'id' });
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

  const path = `${ensureUUID(params.tenantId)}/${ensureUUID(params.workOrderId)}/${Date.now()}.webp`;
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

// ---------- DIRECT LOGIN VIA public.app_users (SIN SUPABASE AUTH) ----------

export async function loginWithAppUsers(
  cfg: SupabaseConfig,
  username: string,
  password: string
): Promise<{ ok: boolean; user?: AuthSessionUser; error?: string }> {
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) {
    return { ok: false, error: 'Configura Supabase antes de iniciar sesión.' };
  }

  const { data, error } = await client
    .from('app_users')
    .select('*, tenants(*), branches(*)')
    .eq('username', username.trim())
    .eq('pin_or_password', password.trim())
    .eq('is_active', true)
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: 'Usuario o contraseña/PIN incorrectos, o cuenta inactiva.',
    };
  }

  const row = data as Record<string, unknown>;
  const rawTenant = row.tenants as Record<string, unknown> | null | undefined;
  const rawBranch = row.branches as Record<string, unknown> | null | undefined;

  return {
    ok: true,
    user: {
      id: String(row.id),
      username: String(row.username ?? username.trim()),
      full_name: String(row.full_name ?? row.username ?? 'Usuario'),
      tenant_id: row.tenant_id != null ? String(row.tenant_id) : null,
      branch_id: row.branch_id != null ? String(row.branch_id) : null,
      role: mapDbRoleToRoleType(row.role != null ? String(row.role) : null),
      is_active: Boolean(row.is_active ?? true),
      mode: 'supabase',
      tenant: rawTenant ? mapTenantFromDb(rawTenant) : null,
      branch: rawBranch ? mapBranchFromDb(rawBranch) : null,
    },
  };
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
      order?: Record<string, unknown>;
      tenant?: Record<string, unknown>;
      branch?: Record<string, unknown>;
      client?: Record<string, unknown>;
      asset?: Record<string, unknown>;
      items?: Array<Record<string, unknown>>;
      payments?: Array<Record<string, unknown>>;
      photos?: Array<Record<string, unknown>>;
    } | null;

    if (!raw?.order || !raw?.tenant) {
      return { ok: false, error: 'Orden no encontrada en RPC' };
    }

    const order = mapWorkOrderFromDb(raw.order, {
      items: raw.items?.map(mapOrderItemFromDb),
      payments: raw.payments?.map(mapOrderPaymentFromDb),
      photos: raw.photos?.map(mapOrderPhotoFromDb),
    });

    return {
      ok: true,
      data: {
        order,
        tenant: mapTenantFromDb(raw.tenant),
        branch: raw.branch ? mapBranchFromDb(raw.branch) : undefined,
        client: raw.client ? mapClientFromDb(raw.client) : undefined,
        asset: raw.asset ? mapAssetFromDb(raw.asset) : undefined,
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
    clients: Client[];
    assets: CustomerAsset[];
    workOrders: WorkOrder[];
  }
): Promise<{ ok: boolean; error?: string }> {
  const client = getSupabaseClient(url, anonKey);
  if (!client) return { ok: false, error: 'Credenciales Supabase inválidas.' };

  try {
    if (payload.clients.length > 0) {
      const rows = payload.clients.map((c) => mapClientToDb(c));
      const res = await client.from('clients').upsert(rows, { onConflict: 'id' });
      if (res.error) return { ok: false, error: formatPgError('clients', res.error) };
    }
    if (payload.assets.length > 0) {
      const rows = payload.assets.map((a) => mapAssetToDb(a));
      const res = await client
        .from('customer_assets')
        .upsert(rows, { onConflict: 'id' });
      if (res.error) {
        return { ok: false, error: formatPgError('customer_assets', res.error) };
      }
    }
    if (payload.workOrders.length > 0) {
      const rows = payload.workOrders.map((wo) => mapWorkOrderToDb(wo, 0));
      const res = await client.from('work_orders').upsert(rows, { onConflict: 'id' });
      if (res.error) {
        return { ok: false, error: formatPgError('work_orders', res.error) };
      }
      const itemRows = payload.workOrders.flatMap((o) =>
        o.items.map((it) =>
          mapWorkOrderItemToDb(it, {
            tenantId: o.tenant_id,
            workOrderId: o.id,
          })
        )
      );
      if (itemRows.length > 0) {
        const itRes = await client
          .from('work_order_items')
          .upsert(itemRows, { onConflict: 'id' });
        if (itRes.error) {
          return { ok: false, error: formatPgError('work_order_items', itRes.error) };
        }
      }
      const payRows = payload.workOrders.flatMap((o) =>
        o.payments.map((p) =>
          mapWorkOrderPaymentToDb(p, {
            tenantId: o.tenant_id,
            branchId: o.branch_id,
            workOrderId: o.id,
          })
        )
      );
      if (payRows.length > 0) {
        const payRes = await client
          .from('work_order_payments')
          .upsert(payRows, { onConflict: 'id' });
        if (payRes.error) {
          return {
            ok: false,
            error: formatPgError('work_order_payments', payRes.error),
          };
        }
      }
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error de red' };
  }
}

export const SUPABASE_SCHEMA_SQL = `-- FIXICLOUD Phase 3 Production Schema (UUID + PostgreSQL Exact Columns)
create extension if not exists "pgcrypto";

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  tax_id text,
  industry text not null default 'computing',
  currency text not null default 'CLP',
  tax_rate numeric not null default 19,
  logo_url text,
  order_prefix text not null default 'OT',
  last_order_number integer not null default 100,
  terms_and_conditions text,
  whatsapp_enabled boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz default now()
);

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  code text not null,
  is_headquarters boolean not null default false,
  address text,
  phone text,
  email text,
  is_active boolean not null default true
);

create unique index if not exists idx_single_hq_per_tenant
  on public.branches (tenant_id) where (is_headquarters = true);

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  username text unique not null,
  pin_or_password text not null,
  full_name text not null,
  role text not null default 'technician',
  is_active boolean not null default true,
  created_at timestamptz default now()
);

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  full_name text not null,
  email text not null,
  role text not null default 'company_admin',
  active boolean not null default true,
  created_at timestamptz default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  full_name text not null,
  tax_id text,
  phone text,
  secondary_phone text,
  email text,
  address text,
  city text,
  notes text,
  legacy_mdb_id text
);

create table if not exists public.customer_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  asset_category text not null default 'Equipo',
  brand text,
  model text,
  serial_number text,
  unlock_credentials text,
  custom_attributes jsonb default '{}'::jsonb,
  legacy_mdb_id text
);

create table if not exists public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  sku text,
  name text not null,
  description text,
  type text not null default 'part',
  cost_price numeric not null default 0,
  sale_price numeric not null default 0,
  stock_quantity integer not null default 0,
  min_stock integer not null default 1,
  track_inventory boolean not null default true,
  is_active boolean not null default true
);

create table if not exists public.loan_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  internal_code text not null,
  name text not null,
  serial_number text,
  accessories_included text,
  value_amount numeric not null default 0,
  status text not null default 'available',
  notes text
);

create table if not exists public.work_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  order_number integer not null default 100,
  folio text not null,
  tracking_code text not null,
  client_id uuid not null references public.clients(id),
  asset_id uuid not null references public.customer_assets(id),
  modality text not null default 'workshop',
  service_address text,
  status text not null default 'received',
  priority text not null default 'normal',
  accessories_received text,
  physical_condition_notes text,
  reported_symptoms text,
  technical_diagnosis text,
  work_performed text,
  parts_and_observations text,
  internal_notes text,
  apply_tax boolean not null default true,
  tax_rate numeric not null default 19,
  subtotal_amount numeric not null default 0,
  discount_amount numeric not null default 0,
  tax_amount numeric not null default 0,
  total_amount numeric not null default 0,
  paid_amount numeric not null default 0,
  balance_due numeric generated always as (total_amount - paid_amount) stored,
  warranty_days integer default 90,
  received_at timestamptz default now(),
  promised_at timestamptz
);

create table if not exists public.work_order_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  catalog_item_id uuid references public.catalog_items(id),
  item_type text not null default 'custom',
  description text not null,
  quantity integer not null default 1,
  unit_price numeric not null default 0,
  total_price numeric generated always as (quantity * unit_price) stored,
  deducted_from_stock boolean not null default false
);

create table if not exists public.work_order_photos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  storage_path text not null default 'demo',
  public_url text not null,
  stage text not null default 'diagnosis',
  caption text,
  created_at timestamptz default now()
);

create table if not exists public.work_order_loans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  loan_asset_id uuid not null references public.loan_assets(id),
  loaned_at timestamptz default now(),
  expected_return_at timestamptz,
  returned_at timestamptz,
  condition_on_loan text,
  condition_on_return text,
  is_active boolean not null default true
);

create table if not exists public.work_order_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  receipt_number text,
  amount numeric not null default 0,
  payment_method text not null default 'transfer',
  notes text,
  paid_at timestamptz default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  client_id uuid not null references public.clients(id),
  work_order_id uuid references public.work_orders(id),
  subject text not null,
  description text,
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  modality text not null default 'workshop',
  address text,
  status text not null default 'scheduled',
  created_at timestamptz default now()
);

-- Storage Bucket público para fotos WebP
insert into storage.buckets (id, name, public)
values ('order-photos', 'order-photos', true)
on conflict (id) do nothing;

-- RPC Onboarding de nueva empresa
create or replace function register_new_tenant(
  p_user_id uuid,
  p_full_name text,
  p_email text,
  p_company_name text,
  p_tax_id text,
  p_sector text,
  p_hq_name text
) returns jsonb language plpgsql security definer as $$
declare
  v_tenant_id uuid := gen_random_uuid();
  v_branch_id uuid := gen_random_uuid();
begin
  insert into public.tenants (id, name, legal_name, tax_id, industry, order_prefix)
  values (v_tenant_id, p_company_name, p_company_name, p_tax_id, p_sector, upper(left(p_company_name, 2)));

  insert into public.branches (id, tenant_id, name, code, is_headquarters)
  values (v_branch_id, v_tenant_id, p_hq_name, 'HQ-01', true);

  insert into public.profiles (id, tenant_id, branch_id, full_name, email, role, active)
  values (p_user_id, v_tenant_id, null, p_full_name, p_email, 'company_admin', true);

  return jsonb_build_object('tenant_id', v_tenant_id, 'branch_id', v_branch_id);
end;
$$;

-- RPC Portal Público (/track y ?track=CODIGO)
create or replace function get_public_order_status(p_code text)
returns jsonb language plpgsql security definer as $$
declare
  v_order public.work_orders%rowtype;
  v_tenant public.tenants%rowtype;
  v_branch public.branches%rowtype;
  v_client public.clients%rowtype;
  v_asset public.customer_assets%rowtype;
begin
  select * into v_order
  from public.work_orders
  where upper(tracking_code) = upper(trim(p_code))
     or upper(folio) = upper(trim(p_code))
  limit 1;

  if not found then
    return null;
  end if;

  select * into v_tenant from public.tenants where id = v_order.tenant_id;
  select * into v_branch from public.branches where id = v_order.branch_id;
  select * into v_client from public.clients where id = v_order.client_id;
  select * into v_asset from public.customer_assets where id = v_order.asset_id;

  return jsonb_build_object(
    'order', to_jsonb(v_order),
    'tenant', to_jsonb(v_tenant),
    'branch', to_jsonb(v_branch),
    'client', to_jsonb(v_client),
    'asset', to_jsonb(v_asset),
    'items', coalesce((select jsonb_agg(i) from public.work_order_items i where i.work_order_id = v_order.id), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(p) from public.work_order_payments p where p.work_order_id = v_order.id), '[]'::jsonb),
    'photos', coalesce((select jsonb_agg(ph) from public.work_order_photos ph where ph.work_order_id = v_order.id), '[]'::jsonb)
  );
end;
$$;`;
